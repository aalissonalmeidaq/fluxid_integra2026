begin;
select plan(17);

-- Spec 008: RLS das seis tabelas de viagem com dois tenants (RF-029, CA-001). As tabelas não têm política nem privilégio para
-- authenticated: toda leitura passa por RPC (asserções de cada RPC ficam nos testes de cada história). Hermético: desfeito pelo rollback.

delete from public.user_sessions where user_id in (
  '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000003');
insert into public.membership_roles (membership_id, role_id, assigned_by)
  select '30000000-0000-0000-0000-00000000000b', r.id, '10000000-0000-0000-0000-000000000001'
    from public.roles r where r.organization_id = '20000000-0000-0000-0000-00000000000b' and r.code = 'tenant_admin';
select public.start_user_session('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000800a2', 'aal1');
select public.start_user_session('10000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-0000000800b3', 'aal1');

-- Massa: uma linha por tabela em cada tenant.
insert into public.customers (id, organization_id, person_type, document_display, legal_name, segment) values
  ('91000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', 'legal', '11222333000181', 'Hospital Alfa Ltda', 'hospital'),
  ('91000000-0000-0000-0000-00000000000b', '20000000-0000-0000-0000-00000000000b', 'legal', '11222333000181', 'Hospital Beta Ltda', 'hospital');
insert into public.customer_sites (id, organization_id, customer_id, name, postal_code, street, number, city, state) values
  ('92000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', '91000000-0000-0000-0000-00000000000a', 'Unidade A', '01001000', 'Praça da Sé', '1', 'São Paulo', 'SP'),
  ('92000000-0000-0000-0000-00000000000b', '20000000-0000-0000-0000-00000000000b', '91000000-0000-0000-0000-00000000000b', 'Unidade B', '01001000', 'Praça da Sé', '1', 'São Paulo', 'SP');
insert into public.vehicles (id, organization_id, plate, vehicle_type, capacity_cylinders) values
  ('95000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', 'AAA1111', 'truck', 10),
  ('95000000-0000-0000-0000-00000000000b', '20000000-0000-0000-0000-00000000000b', 'AAA1111', 'truck', 10);
insert into public.drivers (id, organization_id, full_name, cpf_display, cnh_display, cnh_category, cnh_valid_until) values
  ('96000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', 'Motorista A', 'x', 'x', 'D', current_date + 365),
  ('96000000-0000-0000-0000-00000000000b', '20000000-0000-0000-0000-00000000000b', 'Motorista B', 'x', 'x', 'D', current_date + 365);
insert into public.cylinder_types (id, organization_id, gas, capacity_value, capacity_unit, classification) values
  ('97000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', 'Oxigênio', 10, 'l', 'medicinal'),
  ('97000000-0000-0000-0000-00000000000b', '20000000-0000-0000-0000-00000000000b', 'Oxigênio', 10, 'l', 'medicinal');
insert into public.cylinders (id, organization_id, cylinder_type_id, serial_number) values
  ('98000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', '97000000-0000-0000-0000-00000000000a', 'TRIP-A-001'),
  ('98000000-0000-0000-0000-00000000000b', '20000000-0000-0000-0000-00000000000b', '97000000-0000-0000-0000-00000000000b', 'TRIP-B-001');
insert into public.trips (id, organization_id, number, planned_date, vehicle_id, driver_id, created_by) values
  ('99000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', 1, current_date, '95000000-0000-0000-0000-00000000000a', '96000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-000000000002'),
  ('99000000-0000-0000-0000-00000000000b', '20000000-0000-0000-0000-00000000000b', 1, current_date, '95000000-0000-0000-0000-00000000000b', '96000000-0000-0000-0000-00000000000b', '10000000-0000-0000-0000-000000000003');
insert into public.trip_stops (id, organization_id, trip_id, site_id, position) values
  ('9a000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', '99000000-0000-0000-0000-00000000000a', '92000000-0000-0000-0000-00000000000a', 1),
  ('9a000000-0000-0000-0000-00000000000b', '20000000-0000-0000-0000-00000000000b', '99000000-0000-0000-0000-00000000000b', '92000000-0000-0000-0000-00000000000b', 1);
insert into public.trip_items (id, organization_id, trip_id, stop_id, cylinder_id, created_by) values
  ('9b000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', '99000000-0000-0000-0000-00000000000a', '9a000000-0000-0000-0000-00000000000a', '98000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-000000000002'),
  ('9b000000-0000-0000-0000-00000000000b', '20000000-0000-0000-0000-00000000000b', '99000000-0000-0000-0000-00000000000b', '9a000000-0000-0000-0000-00000000000b', '98000000-0000-0000-0000-00000000000b', '10000000-0000-0000-0000-000000000003');
insert into public.trip_deliveries (id, organization_id, stop_id, request_id, delivered_at, recipient_name, results, recorded_by) values
  ('9c000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', '9a000000-0000-0000-0000-00000000000a', gen_random_uuid(), now(), 'Recebedor Fictício A', '[]', '10000000-0000-0000-0000-000000000002'),
  ('9c000000-0000-0000-0000-00000000000b', '20000000-0000-0000-0000-00000000000b', '9a000000-0000-0000-0000-00000000000b', gen_random_uuid(), now(), 'Recebedor Fictício B', '[]', '10000000-0000-0000-0000-000000000003');
insert into public.trip_unlocks (id, organization_id, item_id, request_id, aal, actor_user_id) values
  ('9d000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', '9b000000-0000-0000-0000-00000000000a', gen_random_uuid(), 'aal1', '10000000-0000-0000-0000-000000000002'),
  ('9d000000-0000-0000-0000-00000000000b', '20000000-0000-0000-0000-00000000000b', '9b000000-0000-0000-0000-00000000000b', gen_random_uuid(), 'aal1', '10000000-0000-0000-0000-000000000003');
insert into public.trip_events (id, organization_id, trip_id, sequence, event_type, actor_user_id) values
  ('9e000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', '99000000-0000-0000-0000-00000000000a', 1, 'trip_created', '10000000-0000-0000-0000-000000000002'),
  ('9e000000-0000-0000-0000-00000000000b', '20000000-0000-0000-0000-00000000000b', '99000000-0000-0000-0000-00000000000b', 1, 'trip_created', '10000000-0000-0000-0000-000000000003');

create function public.tap_act_as(uid uuid, sid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated', 'session_id', sid, 'aal', 'aal1')::text, true);
end;
$$;
grant execute on function public.tap_act_as(uuid, uuid) to authenticated, anon;

select ok((select bool_and(relrowsecurity) from pg_class where oid in (
  to_regclass('public.trips'), to_regclass('public.trip_stops'), to_regclass('public.trip_items'), to_regclass('public.trip_deliveries'),
  to_regclass('public.trip_unlocks'), to_regclass('public.trip_events'), to_regclass('private.trip_counters'), to_regclass('private.trip_requests'))),
  'RLS ligada nas seis tabelas de viagem e nas duas privadas');
select is((select count(*)::int from pg_policies where schemaname = 'public' and tablename in (
  'trips', 'trip_stops', 'trip_items', 'trip_deliveries', 'trip_unlocks', 'trip_events')), 0, 'nenhuma política para authenticated nas tabelas de viagem');

-- Tenant A: nenhum acesso direto (nem ao que é seu); tabelas privadas também.
set local role authenticated;
select public.tap_act_as('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000800a2');
select throws_ok($$ select count(*) from public.trips $$, '42501', null, 'Tenant A não lê trips direto');
select throws_ok($$ select count(*) from public.trip_stops $$, '42501', null, 'Tenant A não lê trip_stops direto');
select throws_ok($$ select count(*) from public.trip_items $$, '42501', null, 'Tenant A não lê trip_items direto');
select throws_ok($$ select count(*) from public.trip_deliveries $$, '42501', null, 'Tenant A não lê trip_deliveries direto (nome do recebedor)');
select throws_ok($$ select count(*) from public.trip_unlocks $$, '42501', null, 'Tenant A não lê trip_unlocks direto');
select throws_ok($$ select count(*) from public.trip_events $$, '42501', null, 'Tenant A não lê trip_events direto');
select throws_ok($$ select count(*) from private.trip_counters $$, '42501', null, 'Tenant A não lê o contador privado');
select throws_ok($$ select count(*) from private.trip_requests $$, '42501', null, 'Tenant A não lê os pedidos privados');
select throws_ok($$ insert into public.trips (organization_id, number, planned_date, vehicle_id, driver_id, created_by) values
  ('20000000-0000-0000-0000-00000000000a', 2, current_date, '95000000-0000-0000-0000-00000000000a', '96000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-000000000002') $$,
  '42501', null, 'Tenant A não escreve em trips direto');
select throws_ok($$ update public.trip_items set item_status = 'checked' $$, '42501', null, 'Tenant A não altera trip_items direto');

-- Tenant B: o mesmo bloqueio, e o que é do A continua inalcançável.
select public.tap_act_as('10000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-0000000800b3');
select throws_ok($$ select count(*) from public.trips $$, '42501', null, 'Tenant B não lê trips direto');
select throws_ok($$ select count(*) from public.trip_events $$, '42501', null, 'Tenant B não lê trip_events direto');
select throws_ok($$ delete from public.trips where organization_id = '20000000-0000-0000-0000-00000000000a' $$, '42501', null, 'Tenant B não apaga viagem do A');

-- anon: nenhum acesso.
set local role anon;
select throws_ok($$ select count(*) from public.trips $$, '42501', null, 'anon não lê trips');
select throws_ok($$ select count(*) from public.trip_deliveries $$, '42501', null, 'anon não lê trip_deliveries');

reset role;
select * from finish();
rollback;
