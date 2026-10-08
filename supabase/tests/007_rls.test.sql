begin;
select plan(28);

-- Spec 007: RLS das sete tabelas de cadastro com dois tenants (RF-048, CA-001, MS-005). As RPCs de escrita só existem a
-- partir de US1 e têm asserções de RLS próprias nos testes de cada história; aqui a massa entra por inserção privilegiada.
-- Hermético: desfeito pelo rollback.

delete from public.user_sessions where user_id in (
  '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000003');
insert into public.membership_roles (membership_id, role_id, assigned_by)
  select '30000000-0000-0000-0000-00000000000b', r.id, '10000000-0000-0000-0000-000000000001'
    from public.roles r where r.organization_id = '20000000-0000-0000-0000-00000000000b' and r.code = 'tenant_admin';

-- C: motorista do Tenant A (papel driver: nenhuma permissão da Fase 3).
insert into auth.users (id, aud, role, email) values
  ('10000000-0000-0000-0000-0000000007c1', 'authenticated', 'authenticated', 'reg-driver@example.invalid');
insert into public.profiles (user_id, display_name) values ('10000000-0000-0000-0000-0000000007c1', 'Motorista Cadastros');
insert into public.memberships (id, organization_id, user_id, status, activated_at) values
  ('30000000-0000-0000-0000-0000000007c1', '20000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-0000000007c1', 'active', now());
insert into public.membership_roles (membership_id, role_id, assigned_by)
  select '30000000-0000-0000-0000-0000000007c1', r.id, '10000000-0000-0000-0000-000000000001'
    from public.roles r where r.organization_id = '20000000-0000-0000-0000-00000000000a' and r.code = 'driver';

select public.start_user_session('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000700a2', 'aal1');
select public.start_user_session('10000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-0000000700b3', 'aal1');
select public.start_user_session('10000000-0000-0000-0000-0000000007c1', '60000000-0000-0000-0000-0000000700c1', 'aal1');

-- Massa: uma linha por tabela em cada tenant.
insert into public.customers (id, organization_id, person_type, document_display, legal_name, segment) values
  ('81000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', 'legal', '11222333000181', 'Hospital Alfa Ltda', 'hospital'),
  ('81000000-0000-0000-0000-00000000000b', '20000000-0000-0000-0000-00000000000b', 'legal', '11222333000181', 'Hospital Beta Ltda', 'hospital');
insert into public.customer_contacts (id, organization_id, customer_id, name, position) values
  ('83000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', '81000000-0000-0000-0000-00000000000a', 'Contato A', 0),
  ('83000000-0000-0000-0000-00000000000b', '20000000-0000-0000-0000-00000000000b', '81000000-0000-0000-0000-00000000000b', 'Contato B', 0);
insert into public.customer_sites (id, organization_id, customer_id, name, postal_code, street, number, city, state) values
  ('82000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', '81000000-0000-0000-0000-00000000000a', 'Unidade A', '01001000', 'Praça da Sé', '1', 'São Paulo', 'SP'),
  ('82000000-0000-0000-0000-00000000000b', '20000000-0000-0000-0000-00000000000b', '81000000-0000-0000-0000-00000000000b', 'Unidade B', '01001000', 'Praça da Sé', '1', 'São Paulo', 'SP');
insert into public.geofences (id, organization_id, site_id, name, shape, center, radius_m, area) values
  ('84000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', '82000000-0000-0000-0000-00000000000a', 'Geocerca A', 'circle',
   extensions.st_point(-46.633, -23.55)::extensions.geography, 200, extensions.st_buffer(extensions.st_point(-46.633, -23.55)::extensions.geography, 210)::extensions.geography),
  ('84000000-0000-0000-0000-00000000000b', '20000000-0000-0000-0000-00000000000b', '82000000-0000-0000-0000-00000000000b', 'Geocerca B', 'circle',
   extensions.st_point(-46.633, -23.55)::extensions.geography, 200, extensions.st_buffer(extensions.st_point(-46.633, -23.55)::extensions.geography, 210)::extensions.geography);
insert into public.vehicles (id, organization_id, plate, vehicle_type, capacity_cylinders) values
  ('85000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', 'AAA1111', 'truck', 10),
  ('85000000-0000-0000-0000-00000000000b', '20000000-0000-0000-0000-00000000000b', 'AAA1111', 'truck', 10);
insert into public.drivers (id, organization_id, full_name, cpf_display, cnh_display, cnh_category, cnh_valid_until) values
  ('86000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', 'Motorista A', 'x', 'x', 'D', current_date + 365),
  ('86000000-0000-0000-0000-00000000000b', '20000000-0000-0000-0000-00000000000b', 'Motorista B', 'x', 'x', 'D', current_date + 365);
insert into public.registry_events (id, organization_id, entity_type, entity_id, sequence, event_type, actor_user_id) values
  ('87000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', 'customer', '81000000-0000-0000-0000-00000000000a', 1, 'customer_created', '10000000-0000-0000-0000-000000000002'),
  ('87000000-0000-0000-0000-00000000000b', '20000000-0000-0000-0000-00000000000b', 'customer', '81000000-0000-0000-0000-00000000000b', 1, 'customer_created', '10000000-0000-0000-0000-000000000003');

create function public.tap_act_as(uid uuid, sid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated', 'session_id', sid, 'aal', 'aal1')::text, true);
end;
$$;
grant execute on function public.tap_act_as(uuid, uuid) to authenticated, anon;

-- Conta, para o ator atual, as linhas visíveis de cada organização numa tabela.
create function public.tap_visible(p_table text, out own int, out other int) language plpgsql as $$
begin
  execute format('select count(*) filter (where organization_id = %L), count(*) filter (where organization_id = %L) from public.%I',
    '20000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000b', p_table) into own, other;
end $$;
grant execute on function public.tap_visible(text) to authenticated, anon;

select ok((select bool_and(relrowsecurity) from pg_class where oid in (
  to_regclass('public.customers'), to_regclass('public.customer_contacts'), to_regclass('public.customer_sites'),
  to_regclass('public.geofences'), to_regclass('public.vehicles'), to_regclass('public.drivers'), to_regclass('public.registry_events'))),
  'RLS ligada nas sete tabelas de cadastro');

-- Tenant A: vê o que é seu e nada do Tenant B.
set local role authenticated;
select public.tap_act_as('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000700a2');
select is((select own::text || '/' || other::text from public.tap_visible('customers')), '1/0', 'Tenant A: customers');
select is((select own::text || '/' || other::text from public.tap_visible('customer_contacts')), '1/0', 'Tenant A: customer_contacts');
select is((select own::text || '/' || other::text from public.tap_visible('customer_sites')), '1/0', 'Tenant A: customer_sites');
select is((select own::text || '/' || other::text from public.tap_visible('geofences')), '1/0', 'Tenant A: geofences');
select is((select own::text || '/' || other::text from public.tap_visible('vehicles')), '1/0', 'Tenant A: vehicles');
select is((select own::text || '/' || other::text from public.tap_visible('drivers')), '1/0', 'Tenant A: drivers');
select is((select own::text || '/' || other::text from public.tap_visible('registry_events')), '1/0', 'Tenant A: registry_events');

-- Tenant B: o inverso.
select public.tap_act_as('10000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-0000000700b3');
select is((select own::text || '/' || other::text from public.tap_visible('customers')), '0/1', 'Tenant B: customers');
select is((select own::text || '/' || other::text from public.tap_visible('customer_contacts')), '0/1', 'Tenant B: customer_contacts');
select is((select own::text || '/' || other::text from public.tap_visible('customer_sites')), '0/1', 'Tenant B: customer_sites');
select is((select own::text || '/' || other::text from public.tap_visible('geofences')), '0/1', 'Tenant B: geofences');
select is((select own::text || '/' || other::text from public.tap_visible('vehicles')), '0/1', 'Tenant B: vehicles');
select is((select own::text || '/' || other::text from public.tap_visible('drivers')), '0/1', 'Tenant B: drivers');
select is((select own::text || '/' || other::text from public.tap_visible('registry_events')), '0/1', 'Tenant B: registry_events');

-- Motorista do Tenant A: sem nenhuma permissão da Fase 3, não vê nada.
select public.tap_act_as('10000000-0000-0000-0000-0000000007c1', '60000000-0000-0000-0000-0000000700c1');
select is((select own::text || '/' || other::text from public.tap_visible('customers')), '0/0', 'membro sem permissão: customers');
select is((select own::text || '/' || other::text from public.tap_visible('customer_contacts')), '0/0', 'membro sem permissão: customer_contacts');
select is((select own::text || '/' || other::text from public.tap_visible('customer_sites')), '0/0', 'membro sem permissão: customer_sites');
select is((select own::text || '/' || other::text from public.tap_visible('geofences')), '0/0', 'membro sem permissão: geofences');
select is((select own::text || '/' || other::text from public.tap_visible('vehicles')), '0/0', 'membro sem permissão: vehicles');
select is((select own::text || '/' || other::text from public.tap_visible('drivers')), '0/0', 'membro sem permissão: drivers');
select is((select own::text || '/' || other::text from public.tap_visible('registry_events')), '0/0', 'membro sem permissão: registry_events');

-- Escritas diretas são recusadas ao authenticated.
select public.tap_act_as('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000700a2');
select throws_ok($$insert into public.customers (organization_id, person_type, document_display, legal_name, segment) values ('20000000-0000-0000-0000-00000000000a', 'legal', 'x', 'Invasor Ltda', 'hospital')$$,
  '42501', null, 'insert direto em customers é recusado');
select throws_ok($$update public.customers set legal_name = 'Alterado' where id = '81000000-0000-0000-0000-00000000000a'$$,
  '42501', null, 'update direto em customers é recusado');
select throws_ok($$delete from public.vehicles where id = '85000000-0000-0000-0000-00000000000a'$$,
  '42501', null, 'delete direto em vehicles é recusado');
reset role;

-- anon não acessa nenhuma tabela.
set local role anon;
select throws_ok($$select 1 from public.customers$$, '42501', null, 'anon não lê customers');
select throws_ok($$select 1 from public.customer_sites$$, '42501', null, 'anon não lê customer_sites');
select throws_ok($$select 1 from public.drivers$$, '42501', null, 'anon não lê drivers');
reset role;

select * from finish();
rollback;
