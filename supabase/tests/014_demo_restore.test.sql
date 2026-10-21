begin;
select plan(55);

-- Spec 014 (RF-005, RF-013, RF-014, MS-004; contracts/restauracao-da-demonstracao.md): `public.demo_restore` cria e restaura a
-- demonstração pelas operações do domínio. Para testar a criação do zero sem apagar a demonstração do seed, o teste usa um manifesto
-- próprio (outro tenant, outros usuários e outro lacre) e desfaz as marcas do seed dentro da transação. Hermético: rollback.

delete from private.demo_accounts;
delete from private.demo_tenant;

create function pg_temp.manifest() returns jsonb language sql as $$ select '{
  "tenant": {"id": "d0140000-0000-4000-8000-0000000000aa", "display_name": "Demonstração Teste", "legal_name": "Demonstracao Teste"},
  "cylinder": {"serial_number": "C262", "identifier": {"kind": "hull_number", "value": "C262"}, "notes": "Cilindro de teste da demonstração.",
               "type": {"gas": "Oxigênio", "capacity_value": 10, "capacity_unit": "m3", "classification": "medicinal"}},
  "seal": {"device_code": "DSP-TST01400"},
  "accounts": [
    {"user_id": "d0140000-0000-4000-8000-000000000001", "membership_id": "d0140000-0000-4000-8000-000000000101", "display_name": "Administrador teste",
     "role_code": "tenant_admin", "description": "x", "email": "teste_tenant_admin@demo.fluxid.invalid", "password": "FluxID-Demo-01!"},
    {"user_id": "d0140000-0000-4000-8000-000000000002", "membership_id": "d0140000-0000-4000-8000-000000000102", "display_name": "Estoque teste",
     "role_code": "stock_operator", "description": "x", "email": "teste_stock_operator@demo.fluxid.invalid", "password": "FluxID-Demo-02!"},
    {"user_id": "d0140000-0000-4000-8000-000000000003", "membership_id": "d0140000-0000-4000-8000-000000000103", "display_name": "Técnico teste",
     "role_code": "technical_operator", "description": "x", "email": "teste_technical_operator@demo.fluxid.invalid", "password": "FluxID-Demo-03!"},
    {"user_id": "d0140000-0000-4000-8000-000000000004", "membership_id": "d0140000-0000-4000-8000-000000000104", "display_name": "Auditor teste",
     "role_code": "tenant_auditor", "description": "x", "email": "teste_tenant_auditor@demo.fluxid.invalid", "password": "FluxID-Demo-04!"},
    {"user_id": "d0140000-0000-4000-8000-000000000005", "membership_id": "d0140000-0000-4000-8000-000000000105", "display_name": "Motorista teste",
     "role_code": "driver", "description": "x", "email": "teste_driver@demo.fluxid.invalid", "password": "FluxID-Demo-05!"}
  ]}'::jsonb $$;
create function pg_temp.restore(p_phase text, p_manifest jsonb default null) returns jsonb language sql as $$
  select public.demo_restore(coalesce(p_manifest, pg_temp.manifest()), p_phase) $$;

-- Fotografia do que é de fora da demonstração (Master e Tenant A), para conferir no fim que nada mudou.
create temporary table antes as select
  (select string_agg(m.id::text || m.status, ',' order by m.id) from public.memberships m where m.organization_id <> 'd0140000-0000-4000-8000-0000000000aa') as vinculos,
  (select string_agg(mr.membership_id::text || mr.role_id::text, ',' order by mr.membership_id, mr.role_id) from public.membership_roles mr
     join public.memberships m on m.id = mr.membership_id where m.organization_id <> 'd0140000-0000-4000-8000-0000000000aa') as papeis,
  (select string_agg(o.id::text || o.status || o.display_name, ',' order by o.id) from public.organizations o where o.id <> 'd0140000-0000-4000-8000-0000000000aa') as organizacoes,
  (select count(*) from public.cylinders c where c.organization_id <> 'd0140000-0000-4000-8000-0000000000aa') as cilindros;

-- Só a chave de serviço chama.
select ok(not has_function_privilege('anon', 'public.demo_restore(jsonb, text)', 'execute')
  and not has_function_privilege('authenticated', 'public.demo_restore(jsonb, text)', 'execute'), 'anon e authenticated não executam demo_restore');
select ok(has_function_privilege('service_role', 'public.demo_restore(jsonb, text)', 'execute'), 'service_role executa demo_restore');

-- Manifesto ou fase inválidos: nada muda.
select is(pg_temp.restore('markers', jsonb_set(pg_temp.manifest(), '{accounts}', (pg_temp.manifest()->'accounts') - 4))->>'code', 'VALIDATION_FAILED',
  'manifesto com 4 perfis é recusado');
select is(pg_temp.restore('markers', jsonb_set(pg_temp.manifest(), '{accounts,0,role_code}', '"master_fluxid"'))->>'code', 'VALIDATION_FAILED',
  'papel global no manifesto é recusado');
select is(pg_temp.restore('qualquer')->>'code', 'VALIDATION_FAILED', 'fase desconhecida é recusada');
select is((select count(*)::int from private.demo_accounts), 0, 'as recusas não gravam marcas');

-- Fase `markers`, antes de os usuários existirem no Auth.
select is(pg_temp.restore('markers')->>'code', 'DEMO_MARKED', 'markers grava as marcas');
select is((select count(*)::int from private.demo_accounts where published_password like 'FluxID-Demo-0_!'), 5,
  'as 5 contas ficam marcadas com a senha publicada');
select is((select count(*)::int from public.organizations where id = 'd0140000-0000-4000-8000-0000000000aa'), 0,
  'markers não cria o tenant (o estado é da fase state)');
select is(pg_temp.restore('state')->>'code', 'DEMO_ACCOUNTS_MISSING', 'state sem os usuários no Auth é recusado sem alterar nada');

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, confirmation_token, recovery_token,
  email_change_token_new, email_change, phone, phone_change, phone_change_token, email_change_token_current, reauthentication_token,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select '00000000-0000-0000-0000-000000000000', (a->>'user_id')::uuid, 'authenticated', 'authenticated', a->>'email',
  extensions.crypt(a->>'password', extensions.gen_salt('bf')), now(), '', '', '', '', null, '', '', '', '',
  '{"provider":"email","providers":["email"]}', '{}', now(), now()
from jsonb_array_elements(pg_temp.manifest()->'accounts') a;

-- O lacre do manifesto ainda é só um pedido aguardando o Master.
insert into public.seal_enrollments (device_code, key_hash, status) values ('DSP-TST01400', extensions.digest('fxk_demo', 'sha256'), 'pending');

-- Fase `state`: criação do zero.
create temporary table r1 as select pg_temp.restore('state') as r;
select is((select r->>'code' from r1), 'DEMO_RESTORED', 'state restaura');
select is((select r->>'tenant' from r1), 'created', 'o tenant é criado');
select is((select r->'accounts'->>'restored' from r1), '5', 'os 5 perfis são restaurados');
select is((select r->>'cylinder' from r1), 'created', 'o C262 é criado');
select is((select r->>'seal' from r1), 'not_assigned', 'lacre não destinado ao tenant fica not_assigned');
select ok((select r->'warnings' @> '["seal_not_assigned"]' from r1), 'e avisa');

select ok((select status = 'active' and kind = 'tenant' and display_name = 'Demonstração Teste' from public.organizations
  where id = 'd0140000-0000-4000-8000-0000000000aa'), 'o tenant fica ativo, com os nomes do manifesto');
select ok(private.is_demo_tenant('d0140000-0000-4000-8000-0000000000aa'), 'o tenant fica marcado como demonstração');
select is((select count(*)::int from public.profiles where user_id::text like 'd0140000-0000-4000-8000-00000000000_'), 5, 'os 5 perfis existem');
select is((select count(*)::int from public.memberships where organization_id = 'd0140000-0000-4000-8000-0000000000aa' and status = 'active'
  and id::text like 'd0140000-0000-4000-8000-00000000010_'), 5, 'os 5 vínculos ativos, com os ids do manifesto');
select is((select string_agg(r.code, ',' order by m.id) from public.memberships m join public.membership_roles mr on mr.membership_id = m.id
  join public.roles r on r.id = mr.role_id where m.organization_id = 'd0140000-0000-4000-8000-0000000000aa'),
  'tenant_admin,stock_operator,technical_operator,tenant_auditor,driver', 'um papel por vínculo, o do manifesto');
select ok((select c.status = 'active' and c.stock_status = 'in_stock' and t.gas = 'Oxigênio' and t.capacity_unit = 'm3'
  from public.cylinders c join public.cylinder_types t on t.id = c.cylinder_type_id
  where c.organization_id = 'd0140000-0000-4000-8000-0000000000aa' and c.serial_number = 'C262'), 'o C262 fica ativo, em estoque e com o tipo do manifesto');
select ok((select cylinder_id is not null from private.demo_tenant), 'o id do C262 fica guardado');
select is((select string_agg(e.event_type, ',' order by e.sequence) from public.cylinder_events e
  where e.cylinder_id = (select cylinder_id from private.demo_tenant)), 'cylinder_created,identifier_added,stock_in',
  'o C262 nasce pelas operações do domínio, com histórico');
select ok((select bool_and(e.actor_user_id = 'd0140000-0000-4000-8000-000000000001') from public.cylinder_events e
  where e.cylinder_id = (select cylinder_id from private.demo_tenant)), 'o histórico aponta o administrador de demonstração');
select is((select count(*)::int from public.audit_logs where action = 'demo.restore' and organization_id is null and result = 'success'
  and target_id = 'd0140000-0000-4000-8000-0000000000aa'), 1, 'demo.restore fica na auditoria da plataforma');
select ok((select bool_and(metadata::text !~ 'FluxID-Demo' and coalesce(justification, '') !~ 'FluxID-Demo') from public.audit_logs
  where action = 'demo.restore'), 'a auditoria não traz senha');
select is((select count(*)::int from public.user_sessions where user_id = 'd0140000-0000-4000-8000-000000000001' and status = 'active'), 0,
  'a sessão de serviço é encerrada no fim');
select ok((select bool_and(kind = 'service' and status = 'revoked' and end_reason = 'demo_restore') from public.user_sessions
  where user_id = 'd0140000-0000-4000-8000-000000000001'), 'a sessão de serviço fica marcada como service');

-- Segunda chamada: nada a fazer.
create temporary table r2 as select pg_temp.restore('markers') as m, pg_temp.restore('state') as r;
select is((select m->>'code' from r2), 'DEMO_MARKED', 'markers repete sem erro');
select is((select (r->>'tenant') || (r->>'cylinder') || (r->'accounts'->>'restored') from r2), 'unchangedunchanged0', 'a segunda chamada responde unchanged');
select is((select count(*)::int from public.cylinders where organization_id = 'd0140000-0000-4000-8000-0000000000aa'), 1, 'nada é duplicado');
select is((select count(*)::int from public.cylinder_events e where e.cylinder_id = (select cylinder_id from private.demo_tenant)), 3,
  'a segunda chamada não grava histórico');

-- O que os visitantes mudam volta ao publicado, sem apagar o histórico.
insert into public.membership_roles (membership_id, role_id, assigned_by)
  select 'd0140000-0000-4000-8000-000000000103', r.id, 'd0140000-0000-4000-8000-000000000001' from public.roles r
   where r.organization_id = 'd0140000-0000-4000-8000-0000000000aa' and r.code = 'stock_operator';
delete from public.membership_roles where membership_id = 'd0140000-0000-4000-8000-000000000103'
  and role_id = (select id from public.roles where organization_id = 'd0140000-0000-4000-8000-0000000000aa' and code = 'technical_operator');
update public.memberships set status = 'blocked', blocked_at = now() where id = 'd0140000-0000-4000-8000-000000000102';
update public.profiles set display_name = 'Nome trocado' where user_id = 'd0140000-0000-4000-8000-000000000004';
update public.cylinders set status = 'inactive', inactivation_reason = 'lost', stock_status = 'out_of_stock'
 where id = (select cylinder_id from private.demo_tenant);
create temporary table r3 as select pg_temp.restore('state') as r;
select is((select r->'accounts'->>'restored' from r3), '3', 'os 3 perfis mudados são restaurados');
select is((select r->>'cylinder' from r3), 'restored', 'o C262 é restaurado');
select ok((select status = 'active' from public.memberships where id = 'd0140000-0000-4000-8000-000000000102'), 'o vínculo bloqueado volta a ativo');
select is((select string_agg(r.code, ',') from public.membership_roles mr join public.roles r on r.id = mr.role_id
  where mr.membership_id = 'd0140000-0000-4000-8000-000000000103'), 'technical_operator', 'o papel trocado volta ao publicado');
select is((select display_name from public.profiles where user_id = 'd0140000-0000-4000-8000-000000000004'), 'Auditor teste', 'o nome volta ao publicado');
select ok((select status = 'active' and stock_status = 'in_stock' from public.cylinders where id = (select cylinder_id from private.demo_tenant)),
  'o C262 volta ativo e em estoque');
select ok((select count(*) >= 5 from public.cylinder_events e where e.cylinder_id = (select cylinder_id from private.demo_tenant)
  and e.event_type in ('cylinder_created', 'identifier_added', 'stock_in', 'cylinder_reactivated')), 'o histórico é mantido e ganha a reativação');

-- O lacre destinado ao tenant e sem vínculo fica vinculado ao C262.
insert into public.seal_devices (id, organization_id, device_code, label, key_hash, created_by, approved_at, approved_by) values
  ('d0140000-0000-4000-8000-0000000000d1', 'd0140000-0000-4000-8000-0000000000aa', 'DSP-TST01400', 'Lacre de bancada',
   extensions.digest('fxk_demo', 'sha256'), '10000000-0000-0000-0000-000000000001', now(), '10000000-0000-0000-0000-000000000001');
update public.seal_enrollments set status = 'approved', organization_id = 'd0140000-0000-4000-8000-0000000000aa',
  device_id = 'd0140000-0000-4000-8000-0000000000d1' where device_code = 'DSP-TST01400';
select is(pg_temp.restore('state')->>'seal', 'bound', 'lacre destinado e sem vínculo fica bound');
select ok(exists (select 1 from public.seal_bindings b where b.device_id = 'd0140000-0000-4000-8000-0000000000d1'
  and b.cylinder_id = (select cylinder_id from private.demo_tenant) and b.unbound_at is null), 'o vínculo com o C262 existe');
select is(pg_temp.restore('state')->>'seal', 'unchanged', 'com o vínculo feito, o lacre fica unchanged');

-- C262 em viagem em andamento: a restauração do cilindro é pulada com aviso.
insert into public.vehicles (id, organization_id, plate, vehicle_type, capacity_cylinders) values
  ('d0140000-0000-4000-8000-0000000000b1', 'd0140000-0000-4000-8000-0000000000aa', 'DEM1A14', 'truck', 5);
insert into public.drivers (id, organization_id, full_name, cpf_display, cnh_display, cnh_category, cnh_valid_until) values
  ('d0140000-0000-4000-8000-0000000000b2', 'd0140000-0000-4000-8000-0000000000aa', 'Motorista', 'x', 'x', 'D', (now() at time zone 'America/Sao_Paulo')::date + 365);
insert into public.customers (id, organization_id, person_type, document_display, legal_name, segment) values
  ('d0140000-0000-4000-8000-0000000000e1', 'd0140000-0000-4000-8000-0000000000aa', 'legal', '11222333000181', 'Hospital Demo Ltda', 'hospital');
insert into public.customer_sites (id, organization_id, customer_id, name, postal_code, street, number, city, state) values
  ('d0140000-0000-4000-8000-0000000000f1', 'd0140000-0000-4000-8000-0000000000aa', 'd0140000-0000-4000-8000-0000000000e1', 'Unidade', '01001000', 'Praça da Sé', '1', 'São Paulo', 'SP');
insert into public.trips (id, organization_id, number, planned_date, vehicle_id, driver_id, status, started_at, started_by, created_by) values
  ('d0140000-0000-4000-8000-0000000000b3', 'd0140000-0000-4000-8000-0000000000aa', 9914, (now() at time zone 'America/Sao_Paulo')::date,
   'd0140000-0000-4000-8000-0000000000b1', 'd0140000-0000-4000-8000-0000000000b2', 'in_progress', now(), 'd0140000-0000-4000-8000-000000000001', 'd0140000-0000-4000-8000-000000000001');
insert into public.trip_stops (id, organization_id, trip_id, site_id, position) values
  ('d0140000-0000-4000-8000-0000000000b4', 'd0140000-0000-4000-8000-0000000000aa', 'd0140000-0000-4000-8000-0000000000b3', 'd0140000-0000-4000-8000-0000000000f1', 1);
insert into public.trip_items (organization_id, trip_id, stop_id, cylinder_id, item_status, lock_status, checked_at, created_by) values
  ('d0140000-0000-4000-8000-0000000000aa', 'd0140000-0000-4000-8000-0000000000b3', 'd0140000-0000-4000-8000-0000000000b4', (select cylinder_id from private.demo_tenant),
   'in_transit', 'locked', now(), 'd0140000-0000-4000-8000-000000000001');
update public.cylinders set stock_status = 'out_of_stock', custody_status = 'in_transit' where id = (select cylinder_id from private.demo_tenant);
create temporary table r4 as select pg_temp.restore('state') as r;
select is((select r->>'cylinder' from r4), 'skipped_in_trip', 'C262 em viagem em andamento fica skipped_in_trip');
select ok((select r->'warnings' @> '["cylinder_in_trip"]' from r4), 'e avisa');
select ok((select stock_status = 'out_of_stock' from public.cylinders where id = (select cylinder_id from private.demo_tenant)), 'o C262 em viagem não é mexido');
update public.trips set status = 'completed', completed_at = now(), completed_by = 'd0140000-0000-4000-8000-000000000001' where id = 'd0140000-0000-4000-8000-0000000000b3';
update public.trip_items set item_status = 'returned' where trip_id = 'd0140000-0000-4000-8000-0000000000b3';
update public.cylinders set custody_status = 'in_organization' where id = (select cylinder_id from private.demo_tenant);

-- Vários visitantes no administrador: a restauração funciona, a sessão de serviço é separada e nenhuma sessão interativa é encerrada.
select public.start_user_session('d0140000-0000-4000-8000-000000000001', '61400000-0000-4000-8000-000000000001', 'aal1');
select public.start_user_session('d0140000-0000-4000-8000-000000000001', '61400000-0000-4000-8000-000000000002', 'aal1');
select public.start_user_session('d0140000-0000-4000-8000-000000000001', '61400000-0000-4000-8000-000000000003', 'aal1');
select is(pg_temp.restore('state')->>'code', 'DEMO_RESTORED', 'com 3 sessões de visitantes, a restauração funciona');
select is((select count(*)::int from public.user_sessions where user_id = 'd0140000-0000-4000-8000-000000000001' and status = 'active'), 3,
  'as 3 sessões dos visitantes continuam ativas');
select is(public.start_user_session('d0140000-0000-4000-8000-000000000001', '61400000-0000-4000-8000-000000000004', 'aal1')->>'status', 'started',
  'a quarta sessão interativa é aceita sem confundir a sessão de serviço da restauração');

-- Senha publicada trocada no manifesto: markers atualiza a marca.
select is(pg_temp.restore('markers', jsonb_set(pg_temp.manifest(), '{accounts,0,password}', '"FluxID-Demo-91!"'))->>'code', 'DEMO_MARKED',
  'markers aceita a senha publicada nova');
select is((select published_password from private.demo_accounts where user_id = 'd0140000-0000-4000-8000-000000000001'), 'FluxID-Demo-91!',
  'a marca passa a ter a senha nova');

-- Vínculo que não é de demonstração: recusa sem alterar nada.
update public.memberships set status = 'blocked', blocked_at = now() where id = 'd0140000-0000-4000-8000-000000000105';
insert into public.memberships (id, organization_id, user_id, status, activated_at) values
  ('d0140000-0000-4000-8000-0000000001ff', 'd0140000-0000-4000-8000-0000000000aa', '10000000-0000-0000-0000-000000000002', 'active', now());
select is(pg_temp.restore('state')->>'code', 'DEMO_FOREIGN_MEMBERS', 'state com vínculo estranho é recusado');
select is(pg_temp.restore('markers')->>'code', 'DEMO_FOREIGN_MEMBERS', 'markers com vínculo estranho é recusado');
select ok((select status = 'blocked' from public.memberships where id = 'd0140000-0000-4000-8000-000000000105'), 'a recusa não altera nada');

-- Master e Tenant A intactos.
select ok((select a.vinculos = (select string_agg(m.id::text || m.status, ',' order by m.id) from public.memberships m
    where m.organization_id <> 'd0140000-0000-4000-8000-0000000000aa' and m.id <> 'd0140000-0000-4000-8000-0000000001ff')
  and a.papeis = (select string_agg(mr.membership_id::text || mr.role_id::text, ',' order by mr.membership_id, mr.role_id) from public.membership_roles mr
    join public.memberships m on m.id = mr.membership_id where m.organization_id <> 'd0140000-0000-4000-8000-0000000000aa')
  and a.organizacoes = (select string_agg(o.id::text || o.status || o.display_name, ',' order by o.id) from public.organizations o where o.id <> 'd0140000-0000-4000-8000-0000000000aa')
  and a.cilindros = (select count(*) from public.cylinders c where c.organization_id <> 'd0140000-0000-4000-8000-0000000000aa')
  from antes a), 'Master e outros tenants ficam exatamente como antes');

select * from finish();
rollback;
