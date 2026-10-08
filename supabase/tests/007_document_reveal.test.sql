begin;
select plan(20);

-- Spec 007, US5: reveal_document (RF-030, RF-031, CA-005). Hermético. Todos os documentos são fictícios.

delete from public.user_sessions where user_id in (
  '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000003');
insert into public.membership_roles (membership_id, role_id, assigned_by)
  select '30000000-0000-0000-0000-00000000000b', r.id, '10000000-0000-0000-0000-000000000001'
    from public.roles r where r.organization_id = '20000000-0000-0000-0000-00000000000b' and r.code = 'tenant_admin';
insert into auth.users (id, aud, role, email) values
  ('10000000-0000-0000-0000-0000000007d1', 'authenticated', 'authenticated', 'rv-auditor@example.invalid'),
  ('10000000-0000-0000-0000-0000000007d2', 'authenticated', 'authenticated', 'rv-estoque@example.invalid');
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

create temp table r (k text primary key, v jsonb);
grant all on r to public;
insert into r values
  ('driver', public.create_driver('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000700a2', '20000000-0000-0000-0000-00000000000a',
    'Carlos Motorista', '529.982.247-25', '12345678900', 'B', current_date + 200, '11987654321')),
  ('pf', public.create_customer('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000700a2', '20000000-0000-0000-0000-00000000000a',
    'individual', '111.444.777-35', 'Ana Lima', null, 'other', 'Consultório', null, '[]'::jsonb)),
  ('pj', public.create_customer('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000700a2', '20000000-0000-0000-0000-00000000000a',
    'legal', '11.222.333/0001-81', 'Hospital Alfa Ltda', null, 'hospital', null, null, '[]'::jsonb));

create function pg_temp.reveal(p_user uuid, p_session uuid, p_org uuid, p_type text, p_entity uuid, p_doc text) returns jsonb language sql as $$
  select public.reveal_document(p_user, p_session, p_org, p_type, p_entity, p_doc)
$$;
create function pg_temp.as_a(p_type text, p_entity uuid, p_doc text) returns jsonb language sql as $$
  select pg_temp.reveal('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000700a2', '20000000-0000-0000-0000-00000000000a', p_type, p_entity, p_doc)
$$;

select is((select pg_temp.as_a('driver', (select (v->>'driver_id')::uuid from r where k = 'driver'), 'cpf')->>'value'), '52998224725', 'o administrador revela o CPF do motorista');
select is((select pg_temp.as_a('driver', (select (v->>'driver_id')::uuid from r where k = 'driver'), 'cnh')->>'value'), '12345678900', 'o administrador revela a CNH do motorista');
select is((select pg_temp.as_a('customer', (select (v->>'customer_id')::uuid from r where k = 'pf'), 'cpf')->>'value'), '11144477735', 'o administrador revela o CPF do cliente pessoa física');
select is((select pg_temp.as_a('customer', (select (v->>'customer_id')::uuid from r where k = 'pj'), 'cpf')->>'code'), 'NOT_FOUND', 'cliente jurídico não tem CPF para revelar');
select is((select pg_temp.as_a('customer', (select (v->>'customer_id')::uuid from r where k = 'pf'), 'cnh')->>'code'), 'VALIDATION_FAILED', 'cliente não tem CNH');
select is((select pg_temp.as_a('vehicle', (select (v->>'customer_id')::uuid from r where k = 'pf'), 'cpf')->>'code'), 'VALIDATION_FAILED', 'só cliente e motorista têm revelação');

-- ---------- permissões
select is((select pg_temp.reveal('10000000-0000-0000-0000-0000000007d1', '60000000-0000-0000-0000-0000000700d1', '20000000-0000-0000-0000-00000000000a', 'driver', (select (v->>'driver_id')::uuid from r where k = 'driver'), 'cpf')->>'code'),
  'ACCESS_DENIED', 'o auditor não revela documento de motorista');
select is((select pg_temp.reveal('10000000-0000-0000-0000-0000000007d1', '60000000-0000-0000-0000-0000000700d1', '20000000-0000-0000-0000-00000000000a', 'customer', (select (v->>'customer_id')::uuid from r where k = 'pf'), 'cpf')->>'code'),
  'ACCESS_DENIED', 'o auditor não revela documento de cliente');
select is((select pg_temp.reveal('10000000-0000-0000-0000-0000000007d2', '60000000-0000-0000-0000-0000000700d2', '20000000-0000-0000-0000-00000000000a', 'driver', (select (v->>'driver_id')::uuid from r where k = 'driver'), 'cnh')->>'code'),
  'ACCESS_DENIED', 'o estoquista não revela documento');
select is((select pg_temp.reveal('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000700ff', '20000000-0000-0000-0000-00000000000a', 'driver', (select (v->>'driver_id')::uuid from r where k = 'driver'), 'cpf')->>'code'),
  'AUTH_REQUIRED', 'sessão inválida não revela');

-- ---------- isolamento
select is((select pg_temp.reveal('10000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-0000000700b3', '20000000-0000-0000-0000-00000000000b', 'driver', (select (v->>'driver_id')::uuid from r where k = 'driver'), 'cpf')->>'code'),
  'NOT_FOUND', 'o Tenant B não revela documento de motorista do A');
select is((select pg_temp.reveal('10000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-0000000700b3', '20000000-0000-0000-0000-00000000000b', 'customer', (select (v->>'customer_id')::uuid from r where k = 'pf'), 'cpf')->>'code'),
  'NOT_FOUND', 'o Tenant B não revela documento de cliente do A');
select is((select pg_temp.as_a('driver', '84000000-0000-0000-0000-0000000000ff', 'cpf')->>'code'), 'NOT_FOUND', 'motorista inexistente responde NOT_FOUND');

-- ---------- evento e auditoria sem o valor
select is((select count(*)::int from public.registry_events where event_type = 'document_revealed' and entity_type = 'driver'), 2, 'cada revelação de motorista gera um evento');
select ok(not exists (select 1 from public.registry_events where event_type = 'document_revealed' and data::text ~ '(52998224725|12345678900|11144477735)'), 'o evento da revelação não traz o valor');
select ok(exists (select 1 from public.audit_logs where action = 'driver.document_reveal' and target_id = (select v->>'driver_id' from r where k = 'driver')), 'auditoria driver.document_reveal gravada');
select ok(exists (select 1 from public.audit_logs where action = 'customer.document_reveal' and target_id = (select v->>'customer_id' from r where k = 'pf')), 'auditoria customer.document_reveal gravada');
select ok(not exists (select 1 from public.audit_logs where action like '%document_reveal' and metadata::text ~ '(52998224725|12345678900|11144477735)'), 'a auditoria da revelação não traz o valor');
select is((select version from public.drivers where id = (select (v->>'driver_id')::uuid from r where k = 'driver')), 1::bigint, 'revelar não sobe a versão');
select ok((select count(*) from public.audit_logs where action like '%document_reveal' and result = 'success') = 3, 'só as três revelações permitidas foram auditadas como sucesso');

select * from finish();
rollback;
