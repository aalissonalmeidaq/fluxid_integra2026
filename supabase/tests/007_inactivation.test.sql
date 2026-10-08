begin;
select plan(44);

-- Spec 007, US6: inativação e reativação, cascata atômica e prévia (RF-033 a RF-035, CA-002, CA-010). Hermético.

delete from public.user_sessions where user_id in (
  '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000003');
insert into public.membership_roles (membership_id, role_id, assigned_by)
  select '30000000-0000-0000-0000-00000000000b', r.id, '10000000-0000-0000-0000-000000000001'
    from public.roles r where r.organization_id = '20000000-0000-0000-0000-00000000000b' and r.code = 'tenant_admin';
insert into auth.users (id, aud, role, email) values
  ('10000000-0000-0000-0000-0000000007d1', 'authenticated', 'authenticated', 'in-auditor@example.invalid'),
  ('10000000-0000-0000-0000-0000000007d2', 'authenticated', 'authenticated', 'in-estoque@example.invalid');
insert into public.profiles (user_id, display_name) values ('10000000-0000-0000-0000-0000000007d1', 'Auditor'), ('10000000-0000-0000-0000-0000000007d2', 'Estoquista');
insert into public.memberships (id, organization_id, user_id, status, activated_at) values
  ('30000000-0000-0000-0000-0000000007d1', '20000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-0000000007d1', 'active', now()),
  ('30000000-0000-0000-0000-0000000007d2', '20000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-0000000007d2', 'active', now());
insert into public.membership_roles (membership_id, role_id, assigned_by)
  select m.id, r.id, '10000000-0000-0000-0000-000000000001'
    from (values ('30000000-0000-0000-0000-0000000007d1'::uuid, 'tenant_auditor'), ('30000000-0000-0000-0000-0000000007d2', 'stock_operator')) m(id, code)
    join public.roles r on r.code = m.code and r.organization_id = '20000000-0000-0000-0000-00000000000a';
select public.start_user_session('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000700a2', 'aal1');
select public.start_user_session('10000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-0000000700b3', 'aal1');
select public.start_user_session('10000000-0000-0000-0000-0000000007d1', '60000000-0000-0000-0000-0000000700d1', 'aal1');
select public.start_user_session('10000000-0000-0000-0000-0000000007d2', '60000000-0000-0000-0000-0000000700d2', 'aal1');

-- Massa: cliente C com duas unidades (S1 com 2 geocercas ativas, S2 com 1 ativa e 1 inativa), e um motorista vinculado.
insert into public.customers (id, organization_id, person_type, document_display, legal_name, segment) values
  ('81000000-0000-0000-0000-0000000007a1', '20000000-0000-0000-0000-00000000000a', 'legal', '11222333000181', 'Hospital Alfa Ltda', 'hospital'),
  ('81000000-0000-0000-0000-0000000007b1', '20000000-0000-0000-0000-00000000000b', 'legal', '11222333000181', 'Hospital Beta Ltda', 'hospital');
insert into public.customer_sites (id, organization_id, customer_id, name, postal_code, street, number, city, state) values
  ('82000000-0000-0000-0000-0000000007a1', '20000000-0000-0000-0000-00000000000a', '81000000-0000-0000-0000-0000000007a1', 'S1', '01001000', 'Praça da Sé', '1', 'São Paulo', 'SP'),
  ('82000000-0000-0000-0000-0000000007a2', '20000000-0000-0000-0000-00000000000a', '81000000-0000-0000-0000-0000000007a1', 'S2', '01001000', 'Praça da Sé', '1', 'São Paulo', 'SP'),
  ('82000000-0000-0000-0000-0000000007b1', '20000000-0000-0000-0000-00000000000b', '81000000-0000-0000-0000-0000000007b1', 'SB', '01001000', 'Praça da Sé', '1', 'São Paulo', 'SP');
insert into public.geofences (id, organization_id, site_id, name, shape, center, radius_m, area, status, inactivated_at) values
  ('84000000-0000-0000-0000-0000000007a1', '20000000-0000-0000-0000-00000000000a', '82000000-0000-0000-0000-0000000007a1', 'G1', 'circle',
   extensions.st_point(-46.6, -23.5)::extensions.geography, 100, extensions.st_buffer(extensions.st_point(-46.6, -23.5)::extensions.geography, 101)::extensions.geography, 'active', null),
  ('84000000-0000-0000-0000-0000000007a2', '20000000-0000-0000-0000-00000000000a', '82000000-0000-0000-0000-0000000007a1', 'G2', 'circle',
   extensions.st_point(-46.7, -23.5)::extensions.geography, 100, extensions.st_buffer(extensions.st_point(-46.7, -23.5)::extensions.geography, 101)::extensions.geography, 'active', null),
  ('84000000-0000-0000-0000-0000000007a3', '20000000-0000-0000-0000-00000000000a', '82000000-0000-0000-0000-0000000007a2', 'G3', 'circle',
   extensions.st_point(-46.8, -23.5)::extensions.geography, 100, extensions.st_buffer(extensions.st_point(-46.8, -23.5)::extensions.geography, 101)::extensions.geography, 'active', null),
  ('84000000-0000-0000-0000-0000000007a4', '20000000-0000-0000-0000-00000000000a', '82000000-0000-0000-0000-0000000007a2', 'G4 já inativa', 'circle',
   extensions.st_point(-46.9, -23.5)::extensions.geography, 100, extensions.st_buffer(extensions.st_point(-46.9, -23.5)::extensions.geography, 101)::extensions.geography, 'inactive', now());
insert into auth.users (id, aud, role, email) values ('10000000-0000-0000-0000-0000000007e1', 'authenticated', 'authenticated', 'in-driver@example.invalid');
insert into public.profiles (user_id, display_name) values ('10000000-0000-0000-0000-0000000007e1', 'Condutor');
insert into public.drivers (id, organization_id, full_name, cpf_display, cnh_display, cnh_category, cnh_valid_until, linked_user_id) values
  ('86000000-0000-0000-0000-0000000007a1', '20000000-0000-0000-0000-00000000000a', 'Carlos Motorista', '***.***.***-25', '********900', 'B', current_date + 100, '10000000-0000-0000-0000-0000000007e1');
insert into public.driver_documents (driver_id, organization_id, cpf, cnh_number) values ('86000000-0000-0000-0000-0000000007a1', '20000000-0000-0000-0000-00000000000a', '52998224725', '12345678900');

create function pg_temp.a(p_fn text, p_target uuid, p_justification text default null, p_counts jsonb default null) returns jsonb language plpgsql as $$
declare
  v jsonb;
begin
  if p_counts is not null or p_fn like 'inactivate_customer' or p_fn like 'inactivate_site' then
    execute format('select public.%I($1, $2, $3, $4, $5, $6)', p_fn) using '10000000-0000-0000-0000-000000000002'::uuid, '60000000-0000-0000-0000-0000000700a2'::uuid,
      '20000000-0000-0000-0000-00000000000a'::uuid, p_target, p_justification, p_counts into v;
  else
    execute format('select public.%I($1, $2, $3, $4, $5)', p_fn) using '10000000-0000-0000-0000-000000000002'::uuid, '60000000-0000-0000-0000-0000000700a2'::uuid,
      '20000000-0000-0000-0000-00000000000a'::uuid, p_target, p_justification into v;
  end if;
  return v;
end $$;
create function pg_temp.preview(p_fn text, p_target uuid) returns jsonb language plpgsql as $$
declare
  v jsonb;
begin
  execute format('select public.%I($1, $2, $3, $4)', p_fn) using '10000000-0000-0000-0000-000000000002'::uuid, '60000000-0000-0000-0000-0000000700a2'::uuid,
    '20000000-0000-0000-0000-00000000000a'::uuid, p_target into v;
  return v;
end $$;
create temp table r (k text primary key, v jsonb);
grant all on r to public;

-- ---------- prévia
select is((pg_temp.preview('preview_customer_inactivation', '81000000-0000-0000-0000-0000000007a1')->>'sites')::int, 2, 'a prévia do cliente conta as unidades ativas');
select is((pg_temp.preview('preview_customer_inactivation', '81000000-0000-0000-0000-0000000007a1')->>'geofences')::int, 3, 'a prévia do cliente conta só as geocercas ativas (3 de 4)');
select is((pg_temp.preview('preview_site_inactivation', '82000000-0000-0000-0000-0000000007a1')->>'geofences')::int, 2, 'a prévia da unidade conta as geocercas ativas dela');
select is(pg_temp.preview('preview_customer_inactivation', '81000000-0000-0000-0000-0000000007b1')->>'code', 'NOT_FOUND', 'a prévia de cliente de outra organização é NOT_FOUND');
select is((select public.preview_customer_inactivation('10000000-0000-0000-0000-0000000007d1', '60000000-0000-0000-0000-0000000700d1', '20000000-0000-0000-0000-00000000000a', '81000000-0000-0000-0000-0000000007a1')->>'code'),
  'ACCESS_DENIED', 'o auditor não pede a prévia');

-- ---------- validações antes de inativar
select is(pg_temp.a('inactivate_customer', '81000000-0000-0000-0000-0000000007a1', null, '{"sites":2,"geofences":3}'::jsonb)->>'code', 'JUSTIFICATION_REQUIRED', 'sem justificativa não inativa');
select is(pg_temp.a('inactivate_customer', '81000000-0000-0000-0000-0000000007a1', 'Cliente encerrou o contrato', '{"sites":2,"geofences":2}'::jsonb)->>'code', 'CASCADE_CHANGED', 'quantidades diferentes das da prévia: CASCADE_CHANGED');
select is((pg_temp.a('inactivate_customer', '81000000-0000-0000-0000-0000000007a1', 'Cliente encerrou o contrato', '{"sites":1,"geofences":1}'::jsonb)->'counts'->>'geofences')::int, 3, 'a resposta traz as quantidades atuais');
select is((select status from public.customers where id = '81000000-0000-0000-0000-0000000007a1'), 'active', 'nada mudou nas recusas');

-- ---------- atomicidade: falha injetada na terceira geocerca desfaz tudo
create function pg_temp.boom() returns trigger language plpgsql as $$
begin
  if new.name = 'G3' and new.status = 'inactive' then raise exception 'falha injetada'; end if;
  return new;
end $$;
create trigger boom before update on public.geofences for each row execute function pg_temp.boom();
do $$
begin
  begin
    perform public.inactivate_customer('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000700a2', '20000000-0000-0000-0000-00000000000a',
      '81000000-0000-0000-0000-0000000007a1', 'Cliente encerrou o contrato', '{"sites":2,"geofences":3}'::jsonb);
  exception when others then
    null;
  end;
end $$;
select is((select status from public.customers where id = '81000000-0000-0000-0000-0000000007a1'), 'active', 'falha no meio: o cliente continua ativo');
select is((select count(*)::int from public.geofences where organization_id = '20000000-0000-0000-0000-00000000000a' and status = 'active'), 3, 'falha no meio: nenhuma geocerca foi inativada');
select is((select count(*)::int from public.customer_sites where customer_id = '81000000-0000-0000-0000-0000000007a1' and status = 'active'), 2, 'falha no meio: nenhuma unidade foi inativada');
select is((select count(*)::int from public.registry_events where event_type like '%inactivated'), 0, 'falha no meio: nenhum evento foi gravado');
drop trigger boom on public.geofences;

-- ---------- cascata
insert into r values ('cascade', pg_temp.a('inactivate_customer', '81000000-0000-0000-0000-0000000007a1', 'Cliente encerrou o contrato', '{"sites":2,"geofences":3}'::jsonb));
select is((select v->>'code' from r where k = 'cascade'), 'INACTIVATED', 'o cliente é inativado');
select is((select status from public.customers where id = '81000000-0000-0000-0000-0000000007a1'), 'inactive', 'o cliente ficou inativo');
select is((select count(*)::int from public.customer_sites where customer_id = '81000000-0000-0000-0000-0000000007a1' and status = 'inactive'), 2, 'as unidades ativas foram inativadas junto');
select is((select count(*)::int from public.geofences where organization_id = '20000000-0000-0000-0000-00000000000a' and status = 'active'), 0, 'as geocercas ativas foram inativadas junto');
select is((select count(*)::int from public.registry_events where event_type = 'geofence_inactivated' and data->>'cascade_of' = '81000000-0000-0000-0000-0000000007a1'), 3, 'um evento por geocerca afetada, com a origem da cascata');
select is((select count(*)::int from public.registry_events where event_type = 'site_inactivated' and data->>'cascade_of' = '81000000-0000-0000-0000-0000000007a1'), 2, 'um evento por unidade afetada');
select is((select count(*)::int from public.audit_logs where action = 'customer.inactivate'), 1, 'uma só auditoria para a ação');
select is((select (metadata->>'sites')::int || '/' || (metadata->>'geofences')::int from public.audit_logs where action = 'customer.inactivate'), '2/3', 'a auditoria traz as contagens');
select is((select count(*)::int from public.customers where organization_id = '20000000-0000-0000-0000-00000000000a'), 1, 'nenhum cliente foi apagado');
select is(pg_temp.a('inactivate_customer', '81000000-0000-0000-0000-0000000007a1', 'Segunda tentativa', '{"sites":0,"geofences":0}'::jsonb)->>'code', 'ALREADY_INACTIVE', 'segunda inativação: ALREADY_INACTIVE');

-- ---------- reativação: só o cliente; filhos manualmente e só com o pai ativo
select is(pg_temp.a('reactivate_site', '82000000-0000-0000-0000-0000000007a1', 'Voltou')->>'code', 'PARENT_INACTIVE', 'não se reativa unidade sob cliente inativo');
select is(pg_temp.a('reactivate_customer', '81000000-0000-0000-0000-0000000007a1', null)->>'code', 'JUSTIFICATION_REQUIRED', 'reativar exige justificativa');
select is(pg_temp.a('reactivate_customer', '81000000-0000-0000-0000-0000000007a1', 'Contrato retomado')->>'code', 'REACTIVATED', 'o cliente é reativado');
select is((select count(*)::int from public.customer_sites where customer_id = '81000000-0000-0000-0000-0000000007a1' and status = 'active'), 0, 'reativar o cliente não reativa as unidades');
select is(pg_temp.a('reactivate_geofence', '84000000-0000-0000-0000-0000000007a1', 'Voltou')->>'code', 'PARENT_INACTIVE', 'não se reativa geocerca sob unidade inativa');
select is(pg_temp.a('reactivate_site', '82000000-0000-0000-0000-0000000007a1', 'Unidade retomada')->>'code', 'REACTIVATED', 'a unidade é reativada à mão');
select is((select count(*)::int from public.geofences where site_id = '82000000-0000-0000-0000-0000000007a1' and status = 'active'), 0, 'reativar a unidade não reativa as geocercas');
select is(pg_temp.a('reactivate_geofence', '84000000-0000-0000-0000-0000000007a1', 'Geocerca retomada')->>'code', 'REACTIVATED', 'a geocerca é reativada à mão');
select is(pg_temp.a('reactivate_geofence', '84000000-0000-0000-0000-0000000007a1', 'De novo')->>'code', 'VALIDATION_FAILED', 'reativar o que já está ativo é recusado');

-- ---------- inativação da unidade e da geocerca isoladas
select is(pg_temp.a('inactivate_site', '82000000-0000-0000-0000-0000000007a1', 'Unidade fechada', '{"geofences":0}'::jsonb)->>'code', 'CASCADE_CHANGED', 'a unidade confere as quantidades da prévia');
select is((pg_temp.a('inactivate_site', '82000000-0000-0000-0000-0000000007a1', 'Unidade fechada', '{"geofences":1}'::jsonb)->>'geofences')::int, 1, 'inativar a unidade inativa as geocercas dela');
select is(pg_temp.a('inactivate_geofence', '84000000-0000-0000-0000-0000000007a1', 'De novo')->>'code', 'ALREADY_INACTIVE', 'geocerca já inativa: ALREADY_INACTIVE');

-- ---------- motorista: o vínculo não muda
select is(pg_temp.a('inactivate_driver', '86000000-0000-0000-0000-0000000007a1', null)->>'code', 'JUSTIFICATION_REQUIRED', 'inativar motorista exige justificativa');
select is(pg_temp.a('inactivate_driver', '86000000-0000-0000-0000-0000000007a1', 'Desligado da empresa')->>'code', 'INACTIVATED', 'o motorista é inativado');
select is((select linked_user_id::text from public.drivers where id = '86000000-0000-0000-0000-0000000007a1'), '10000000-0000-0000-0000-0000000007e1', 'inativar não altera o vínculo com o usuário');
select is(pg_temp.a('reactivate_driver', '86000000-0000-0000-0000-0000000007a1', 'Recontratado')->>'code', 'REACTIVATED', 'o motorista é reativado');
select is((select linked_user_id::text from public.drivers where id = '86000000-0000-0000-0000-0000000007a1'), '10000000-0000-0000-0000-0000000007e1', 'reativar não altera o vínculo');

-- ---------- permissões, isolamento e nenhuma exclusão
select is((select public.inactivate_geofence('10000000-0000-0000-0000-0000000007d2', '60000000-0000-0000-0000-0000000700d2', '20000000-0000-0000-0000-00000000000a', '84000000-0000-0000-0000-0000000007a2', 'Sem permissão')->>'code'),
  'ACCESS_DENIED', 'o estoquista não inativa geocerca');
select is((select public.inactivate_customer('10000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-0000000700b3', '20000000-0000-0000-0000-00000000000b', '81000000-0000-0000-0000-0000000007a1', 'Invasão', null)->>'code'),
  'NOT_FOUND', 'o Tenant B não inativa cliente do A');
select ok(not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname ~ '^(delete|remove|purge)_(customer|site|geofence|vehicle|driver)'),
  'nenhuma função de exclusão existe');
select ok(not exists (select 1 from public.audit_logs where action like '%.inactivate' and metadata::text ~ '(11222333000181|52998224725|Carlos)'), 'a auditoria de inativação não traz documento nem nome');

select * from finish();
rollback;
