begin;
select plan(18);

-- Spec 008: trip_events, trip_deliveries e trip_unlocks são imutáveis; trips, trip_stops e trip_items nunca são excluídas, para
-- qualquer papel, inclusive service_role e superusuário (RF-033, CA-006). Hermético: desfeito pelo rollback.

insert into public.customers (id, organization_id, person_type, document_display, legal_name, segment) values
  ('91000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', 'legal', '11222333000181', 'Hospital Alfa Ltda', 'hospital');
insert into public.customer_sites (id, organization_id, customer_id, name, postal_code, street, number, city, state) values
  ('92000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', '91000000-0000-0000-0000-00000000000a', 'Unidade A', '01001000', 'Praça da Sé', '1', 'São Paulo', 'SP');
insert into public.vehicles (id, organization_id, plate, vehicle_type, capacity_cylinders) values
  ('95000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', 'AAA1111', 'truck', 10);
insert into public.drivers (id, organization_id, full_name, cpf_display, cnh_display, cnh_category, cnh_valid_until) values
  ('96000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', 'Motorista A', 'x', 'x', 'D', current_date + 365);
insert into public.cylinder_types (id, organization_id, gas, capacity_value, capacity_unit, classification) values
  ('97000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', 'Oxigênio', 10, 'l', 'medicinal');
insert into public.cylinders (id, organization_id, cylinder_type_id, serial_number) values
  ('98000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', '97000000-0000-0000-0000-00000000000a', 'TRIP-A-001');
insert into public.trips (id, organization_id, number, planned_date, vehicle_id, driver_id, created_by) values
  ('99000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', 1, current_date, '95000000-0000-0000-0000-00000000000a', '96000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-000000000002');
insert into public.trip_stops (id, organization_id, trip_id, site_id, position) values
  ('9a000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', '99000000-0000-0000-0000-00000000000a', '92000000-0000-0000-0000-00000000000a', 1);
insert into public.trip_items (id, organization_id, trip_id, stop_id, cylinder_id, created_by) values
  ('9b000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', '99000000-0000-0000-0000-00000000000a', '9a000000-0000-0000-0000-00000000000a', '98000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-000000000002');
insert into public.trip_deliveries (id, organization_id, stop_id, request_id, delivered_at, recipient_name, results, recorded_by) values
  ('9c000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', '9a000000-0000-0000-0000-00000000000a', gen_random_uuid(), now(), 'Recebedor Fictício A', '[]', '10000000-0000-0000-0000-000000000002');
insert into public.trip_unlocks (id, organization_id, item_id, request_id, aal, actor_user_id) values
  ('9d000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', '9b000000-0000-0000-0000-00000000000a', gen_random_uuid(), 'aal1', '10000000-0000-0000-0000-000000000002');
insert into public.trip_events (id, organization_id, trip_id, sequence, event_type, actor_user_id) values
  ('9e000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', '99000000-0000-0000-0000-00000000000a', 1, 'trip_created', '10000000-0000-0000-0000-000000000002');

-- Superusuário (dono das tabelas): os gatilhos valem para todos.
select throws_ok($$ update public.trip_events set justification = 'x' $$, 'P0001', 'trip_record_immutable', 'update em trip_events é recusado');
select throws_ok($$ delete from public.trip_events $$, 'P0001', 'trip_record_immutable', 'delete em trip_events é recusado');
select throws_ok($$ truncate public.trip_events $$, 'P0001', 'trip_record_immutable', 'truncate em trip_events é recusado');
select throws_ok($$ update public.trip_deliveries set recipient_name = 'Outro Nome' $$, 'P0001', 'trip_record_immutable', 'update em trip_deliveries é recusado');
select throws_ok($$ delete from public.trip_deliveries $$, 'P0001', 'trip_record_immutable', 'delete em trip_deliveries é recusado');
select throws_ok($$ update public.trip_unlocks set justification = 'x' $$, 'P0001', 'trip_record_immutable', 'update em trip_unlocks é recusado');
select throws_ok($$ delete from public.trip_unlocks $$, 'P0001', 'trip_record_immutable', 'delete em trip_unlocks é recusado');
select throws_ok($$ delete from public.trips $$, 'P0001', 'trip_record_undeletable', 'delete em trips é recusado');
select throws_ok($$ delete from public.trip_stops $$, 'P0001', 'trip_record_undeletable', 'delete em trip_stops é recusado');
select throws_ok($$ delete from public.trip_items $$, 'P0001', 'trip_record_undeletable', 'delete em trip_items é recusado');
select throws_ok($$ truncate public.trips cascade $$, 'P0001', 'trip_record_undeletable', 'truncate em trips é recusado');
select lives_ok($$ update public.trip_items set item_status = 'checked', checked_at = now(), checked_by = '10000000-0000-0000-0000-000000000002' $$, 'update em trip_items continua permitido às funções de transição');

-- service_role: mesmos bloqueios (os gatilhos não dependem de papel).
set local role service_role;
select throws_ok($$ update public.trip_events set justification = 'x' $$, 'P0001', 'trip_record_immutable', 'service_role não altera trip_events');
select throws_ok($$ delete from public.trip_deliveries $$, 'P0001', 'trip_record_immutable', 'service_role não apaga trip_deliveries');
select throws_ok($$ update public.trip_unlocks set justification = 'x' $$, 'P0001', 'trip_record_immutable', 'service_role não altera trip_unlocks');
select throws_ok($$ delete from public.trips $$, 'P0001', 'trip_record_undeletable', 'service_role não apaga trips');
select throws_ok($$ delete from public.trip_items $$, 'P0001', 'trip_record_undeletable', 'service_role não apaga trip_items');
select throws_ok($$ truncate public.trip_events $$, 'P0001', 'trip_record_immutable', 'service_role não esvazia trip_events');
reset role;

select * from finish();
rollback;
