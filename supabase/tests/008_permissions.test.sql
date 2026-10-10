begin;
select plan(22);

-- Spec 008 (parte catálogo): 8 permissões de viagem e o papel Gestor logístico (RF-031; contracts/permissoes-e-papeis.md).
-- As asserções de cada operação (nega quem não tem a permissão) entram nos testes de cada história. Hermético.

select is((select count(*)::int from public.permissions where code ~ '^trip\.'), 8, 'oito permissões de viagem no catálogo');
select is((select count(*)::int from public.permissions where code ~ '^trip\.' and scope = 'tenant' and delegability = 'tenant_delegable'), 8, 'todas de escopo tenant e delegáveis pelo tenant');
select is((select array_agg(code order by code) from public.permissions where code ~ '^trip\.' and critical), array['trip.exception'], 'só trip.exception é crítica');
select is((select count(*)::int from public.permissions where id::text like '40000000-0000-0000-0000-0000000000%' and code ~ '^trip\.'
  and id::text between '40000000-0000-0000-0000-000000000040' and '40000000-0000-0000-0000-000000000047'), 8, 'ids de ...040 a ...047');

-- Papéis do tenant A (organização do seed).
create function pg_temp.perms_of(p_code text) returns text[] language sql as $$
  select coalesce(array_agg(p.code order by p.code), array[]::text[])
    from public.role_permissions rp join public.roles r on r.id = rp.role_id join public.permissions p on p.id = rp.permission_id
   where r.organization_id = '20000000-0000-0000-0000-00000000000a' and r.code = p_code
$$;

create function pg_temp.trip_of(p_code text) returns text[] language sql as $$
  select coalesce(array_agg(c order by c), array[]::text[]) from unnest(pg_temp.perms_of(p_code)) c where c ~ '^trip\.'
$$;

select is(pg_temp.trip_of('tenant_admin'),
  array['trip.cancel', 'trip.exception', 'trip.history', 'trip.operate', 'trip.read', 'trip.recipient', 'trip.unlock', 'trip.write'], 'tenant_admin tem as oito');
select ok(exists (select 1 from public.roles where organization_id = '20000000-0000-0000-0000-00000000000a' and code = 'logistics_manager' and system), 'logistics_manager existe como papel de sistema');
select is(pg_temp.trip_of('logistics_manager'),
  array['trip.cancel', 'trip.history', 'trip.operate', 'trip.read', 'trip.recipient', 'trip.unlock', 'trip.write'], 'logistics_manager: sete de viagem, sem trip.exception');
select ok(pg_temp.perms_of('logistics_manager') @> array['cylinder.read', 'customer.read', 'geofence.read', 'vehicle.read', 'driver.read'], 'logistics_manager lê cilindros, clientes, geocercas, veículos e motoristas');
select is(pg_temp.trip_of('stock_operator'), array['trip.history', 'trip.operate', 'trip.read'], 'stock_operator: só leitura, operação e histórico');
select is(pg_temp.trip_of('tenant_auditor'), array['trip.history', 'trip.read'], 'tenant_auditor: só leitura e histórico (sem trip.recipient)');
select is(pg_temp.trip_of('technical_operator'), array[]::text[], 'technical_operator: nenhuma de viagem');
select is(pg_temp.trip_of('driver'), array[]::text[], 'driver: nenhuma de viagem');

-- Nada se perdeu: mapeamentos das Specs 006 e 007 continuam.
select ok(pg_temp.perms_of('stock_operator') @> array['cylinder.read', 'cylinder.write', 'cylinder.stock_in', 'cylinder.history', 'customer.read', 'vehicle.read'], 'stock_operator mantém as permissões atuais');
select ok(pg_temp.perms_of('tenant_auditor') @> array['cylinder.read', 'cylinder.history', 'customer.history', 'driver.history'], 'tenant_auditor mantém as permissões atuais');
select ok(pg_temp.perms_of('technical_operator') @> array['cylinder.test', 'cylinder.identifier'], 'technical_operator mantém as permissões atuais');
select ok(pg_temp.perms_of('tenant_admin') @> array['tenant.manage', 'audit.read', 'cylinder.deactivate', 'customer.anonymize', 'driver.anonymize'], 'tenant_admin mantém as permissões atuais');

-- Papel Master e organização nova.
select is((select count(*)::int from public.role_permissions rp join public.roles r on r.id = rp.role_id join public.permissions p on p.id = rp.permission_id
  where r.code = 'master_fluxid' and p.code ~ '^trip\.'), 8, 'Master recebe as oito permissões de viagem');

-- Organização criada depois recebe o papel novo.
insert into public.organizations (id, kind, legal_name, display_name, status) values
  ('20000000-0000-0000-0000-0000000008e2', 'tenant', 'Tenant Viagens Ltda', 'Tenant Viagens', 'active');
select lives_ok($$ select private.bootstrap_tenant_roles('20000000-0000-0000-0000-0000000008e2') $$, 'bootstrap para tenant criado depois');
select is((select count(*)::int from public.roles where organization_id = '20000000-0000-0000-0000-0000000008e2' and system), 6, 'o tenant novo tem 6 papéis de sistema');
select ok(exists (select 1 from public.roles where organization_id = '20000000-0000-0000-0000-0000000008e2' and code = 'logistics_manager'), 'o tenant novo tem o Gestor logístico');
select is((select count(*)::int from public.role_permissions rp join public.roles r on r.id = rp.role_id join public.permissions p on p.id = rp.permission_id
  where r.organization_id = '20000000-0000-0000-0000-0000000008e2' and r.code = 'logistics_manager' and p.code ~ '^trip\.'), 7, 'o Gestor logístico novo tem sete permissões de viagem');
select is((select count(*)::int from public.role_permissions rp join public.roles r on r.id = rp.role_id join public.permissions p on p.id = rp.permission_id
  where r.organization_id = '20000000-0000-0000-0000-0000000008e2' and r.code = 'tenant_admin' and p.code ~ '^trip\.'), 8, 'o administrador novo tem as oito');

select * from finish();
rollback;
