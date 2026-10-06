begin;
select plan(32);

-- Spec 006: RLS das 5 tabelas de cilindros com dois tenants (RF-038, CA-001, MS-004). Hermético: desfeito pelo rollback.
delete from public.user_sessions where user_id in (
  '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000003');

-- O admin do Tenant B do seed não tem papel: recebe tenant_admin só nesta suíte.
insert into public.membership_roles (membership_id, role_id, assigned_by)
  select '30000000-0000-0000-0000-00000000000b', r.id, '10000000-0000-0000-0000-000000000001'
    from public.roles r where r.organization_id = '20000000-0000-0000-0000-00000000000b' and r.code = 'tenant_admin';

-- C: motorista do Tenant A (nenhuma permissão de cilindro). D: papel só com cylinder.read (sem cylinder.history).
insert into auth.users (id, aud, role, email) values
  ('10000000-0000-0000-0000-0000000006c1', 'authenticated', 'authenticated', 'cyl-driver@example.invalid'),
  ('10000000-0000-0000-0000-0000000006d1', 'authenticated', 'authenticated', 'cyl-readonly@example.invalid');
insert into public.profiles (user_id, display_name) values
  ('10000000-0000-0000-0000-0000000006c1', 'Motorista Cilindros'),
  ('10000000-0000-0000-0000-0000000006d1', 'Leitura Cilindros');
insert into public.memberships (id, organization_id, user_id, status, activated_at) values
  ('30000000-0000-0000-0000-0000000006c1', '20000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-0000000006c1', 'active', now()),
  ('30000000-0000-0000-0000-0000000006d1', '20000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-0000000006d1', 'active', now());
insert into public.roles (id, organization_id, code, name, scope) values
  ('50000000-0000-0000-0000-0000000006d1', '20000000-0000-0000-0000-00000000000a', 'cyl_read_only', 'Somente leitura de cilindros', 'tenant');
insert into public.role_permissions (role_id, permission_id)
  select '50000000-0000-0000-0000-0000000006d1', id from public.permissions where code = 'cylinder.read';
insert into public.membership_roles (membership_id, role_id, assigned_by)
  select '30000000-0000-0000-0000-0000000006c1', r.id, '10000000-0000-0000-0000-000000000001'
    from public.roles r where r.organization_id = '20000000-0000-0000-0000-00000000000a' and r.code = 'driver';
insert into public.membership_roles (membership_id, role_id, assigned_by) values
  ('30000000-0000-0000-0000-0000000006d1', '50000000-0000-0000-0000-0000000006d1', '10000000-0000-0000-0000-000000000001');

select public.start_user_session('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000600a2', 'aal1');
select public.start_user_session('10000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-0000000600b3', 'aal1');
select public.start_user_session('10000000-0000-0000-0000-0000000006c1', '60000000-0000-0000-0000-0000000600c1', 'aal1');
select public.start_user_session('10000000-0000-0000-0000-0000000006d1', '60000000-0000-0000-0000-0000000600d1', 'aal1');

-- Massa: uma linha por tabela em cada tenant.
insert into public.cylinder_types (id, organization_id, gas, capacity_value, capacity_unit, classification) values
  ('71000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', 'Oxigênio', 10, 'l', 'medicinal'),
  ('71000000-0000-0000-0000-00000000000b', '20000000-0000-0000-0000-00000000000b', 'Oxigênio', 10, 'l', 'medicinal');
insert into public.cylinders (id, organization_id, cylinder_type_id, serial_number) values
  ('72000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', '71000000-0000-0000-0000-00000000000a', 'RLS-A-001'),
  ('72000000-0000-0000-0000-00000000000b', '20000000-0000-0000-0000-00000000000b', '71000000-0000-0000-0000-00000000000b', 'RLS-B-001');
insert into public.cylinder_identifiers (id, organization_id, cylinder_id, kind, value) values
  ('73000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', '72000000-0000-0000-0000-00000000000a', 'qr_code', 'QR-RLS-A'),
  ('73000000-0000-0000-0000-00000000000b', '20000000-0000-0000-0000-00000000000b', '72000000-0000-0000-0000-00000000000b', 'qr_code', 'QR-RLS-B');
insert into public.cylinder_tests (id, organization_id, cylinder_id, performed_on, result, executor, next_due_on) values
  ('74000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', '72000000-0000-0000-0000-00000000000a', current_date - 10, 'approved', 'Laboratório A', current_date + 365),
  ('74000000-0000-0000-0000-00000000000b', '20000000-0000-0000-0000-00000000000b', '72000000-0000-0000-0000-00000000000b', current_date - 10, 'approved', 'Laboratório B', current_date + 365);
insert into public.cylinder_events (id, organization_id, cylinder_id, sequence, event_type, actor_user_id) values
  ('75000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', '72000000-0000-0000-0000-00000000000a', 1, 'cylinder_created', '10000000-0000-0000-0000-000000000002'),
  ('75000000-0000-0000-0000-00000000000b', '20000000-0000-0000-0000-00000000000b', '72000000-0000-0000-0000-00000000000b', 1, 'cylinder_created', '10000000-0000-0000-0000-000000000003');

create function public.tap_act_as(uid uuid, sid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated', 'session_id', sid, 'aal', 'aal1')::text, true);
end;
$$;
grant execute on function public.tap_act_as(uuid, uuid) to authenticated, anon;

-- RLS ativada nas cinco tabelas.
select ok((select bool_and(relrowsecurity) from pg_class where oid in (
  to_regclass('public.cylinder_types'), to_regclass('public.cylinders'), to_regclass('public.cylinder_identifiers'),
  to_regclass('public.cylinder_tests'), to_regclass('public.cylinder_events'))), 'RLS ativada nas cinco tabelas');

-- Tenant A: acesso permitido ao que é seu e bloqueado ao de B.
set local role authenticated;
select public.tap_act_as('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000600a2');
select is((select count(*)::int from public.cylinder_types where organization_id = '20000000-0000-0000-0000-00000000000a'), 1, 'A vê os tipos de A');
select is((select count(*)::int from public.cylinders where organization_id = '20000000-0000-0000-0000-00000000000a'), 1, 'A vê os cilindros de A');
select is((select count(*)::int from public.cylinder_identifiers where organization_id = '20000000-0000-0000-0000-00000000000a'), 1, 'A vê os identificadores de A');
select is((select count(*)::int from public.cylinder_tests where organization_id = '20000000-0000-0000-0000-00000000000a'), 1, 'A vê os testes de A');
select is((select count(*)::int from public.cylinder_events where organization_id = '20000000-0000-0000-0000-00000000000a'), 1, 'A vê os eventos de A');
select is((select count(*)::int from public.cylinder_types where organization_id = '20000000-0000-0000-0000-00000000000b'), 0, 'A não vê os tipos de B');
select is((select count(*)::int from public.cylinders where organization_id = '20000000-0000-0000-0000-00000000000b'), 0, 'A não vê os cilindros de B');
select is((select count(*)::int from public.cylinder_identifiers where organization_id = '20000000-0000-0000-0000-00000000000b'), 0, 'A não vê os identificadores de B');
select is((select count(*)::int from public.cylinder_tests where organization_id = '20000000-0000-0000-0000-00000000000b'), 0, 'A não vê os testes de B');
select is((select count(*)::int from public.cylinder_events where organization_id = '20000000-0000-0000-0000-00000000000b'), 0, 'A não vê os eventos de B');
select is((select count(*)::int from public.cylinder_identifiers where value = 'QR-RLS-B'), 0, 'A não encontra por busca o identificador de B');

-- Escrita direta negada ao papel authenticated, mesmo para o administrador do tenant.
select throws_ok($$ insert into public.cylinders (organization_id, cylinder_type_id, serial_number) values ('20000000-0000-0000-0000-00000000000a', '71000000-0000-0000-0000-00000000000a', 'DIRETO-1') $$, '42501', null, 'A não insere cilindro direto');
select throws_ok($$ update public.cylinders set notes = 'x' $$, '42501', null, 'A não altera cilindro direto');
select throws_ok($$ delete from public.cylinders $$, '42501', null, 'A não exclui cilindro direto');
select throws_ok($$ insert into public.cylinder_events (organization_id, cylinder_id, sequence, event_type, actor_user_id) values ('20000000-0000-0000-0000-00000000000a', '72000000-0000-0000-0000-00000000000a', 9, 'cylinder_updated', '10000000-0000-0000-0000-000000000002') $$, '42501', null, 'A não insere evento direto');
select throws_ok($$ update public.cylinder_events set justification = 'x' $$, '42501', null, 'A não altera evento direto');
select throws_ok($$ delete from public.cylinder_events $$, '42501', null, 'A não exclui evento direto');

-- Tenant B: simétrico.
select public.tap_act_as('10000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-0000000600b3');
select is((select count(*)::int from public.cylinders), 1, 'B vê somente o próprio cilindro');
select is((select serial_number from public.cylinders), 'RLS-B-001', 'o cilindro visto por B é o de B');
select is((select count(*)::int from public.cylinder_events where cylinder_id = '72000000-0000-0000-0000-00000000000a'), 0, 'B não vê eventos de A');
select is((select count(*)::int from public.cylinder_tests where cylinder_id = '72000000-0000-0000-0000-00000000000a'), 0, 'B não vê testes de A');
select is((select count(*)::int from public.cylinder_identifiers where value = 'QR-RLS-A'), 0, 'B não encontra por busca o identificador de A');

-- Membro sem permissão de cilindro não lê nada.
select public.tap_act_as('10000000-0000-0000-0000-0000000006c1', '60000000-0000-0000-0000-0000000600c1');
select is((select count(*)::int from public.cylinders), 0, 'motorista sem cylinder.read não lê cilindros');
select is((select count(*)::int from public.cylinder_events), 0, 'motorista sem cylinder.history não lê eventos');

-- Com cylinder.read e sem cylinder.history: lê cilindros, não lê eventos.
select public.tap_act_as('10000000-0000-0000-0000-0000000006d1', '60000000-0000-0000-0000-0000000600d1');
select is((select count(*)::int from public.cylinders), 1, 'cylinder.read permite ler cilindros do próprio tenant');
select is((select count(*)::int from public.cylinder_events), 0, 'sem cylinder.history não lê eventos');

-- anon não acessa nenhuma tabela.
reset role;
set local role anon;
select throws_ok($$ select 1 from public.cylinder_types $$, '42501', null, 'anon não lê tipos');
select throws_ok($$ select 1 from public.cylinders $$, '42501', null, 'anon não lê cilindros');
select throws_ok($$ select 1 from public.cylinder_identifiers $$, '42501', null, 'anon não lê identificadores');
select throws_ok($$ select 1 from public.cylinder_tests $$, '42501', null, 'anon não lê testes');
select throws_ok($$ select 1 from public.cylinder_events $$, '42501', null, 'anon não lê eventos');

select * from finish(); rollback;
