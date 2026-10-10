begin;
select plan(45);

-- Spec 008: restrições do data-model.md, uma a uma, e chaves compostas por organização (RF-002, RF-003, RF-004, RF-029).
-- Hermético: desfeito pelo rollback.

insert into public.customers (id, organization_id, person_type, document_display, legal_name, segment) values
  ('91000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', 'legal', '11222333000181', 'Hospital Alfa Ltda', 'hospital'),
  ('91000000-0000-0000-0000-00000000000b', '20000000-0000-0000-0000-00000000000b', 'legal', '11222333000181', 'Hospital Beta Ltda', 'hospital');
insert into public.customer_sites (id, organization_id, customer_id, name, postal_code, street, number, city, state) values
  ('92000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', '91000000-0000-0000-0000-00000000000a', 'Unidade A', '01001000', 'Praça da Sé', '1', 'São Paulo', 'SP'),
  ('92000000-0000-0000-0000-0000000000a2', '20000000-0000-0000-0000-00000000000a', '91000000-0000-0000-0000-00000000000a', 'Unidade A2', '01001000', 'Praça da Sé', '2', 'São Paulo', 'SP'),
  ('92000000-0000-0000-0000-00000000000b', '20000000-0000-0000-0000-00000000000b', '91000000-0000-0000-0000-00000000000b', 'Unidade B', '01001000', 'Praça da Sé', '1', 'São Paulo', 'SP');
insert into public.vehicles (id, organization_id, plate, vehicle_type, capacity_cylinders) values
  ('95000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', 'AAA1111', 'truck', 10),
  ('95000000-0000-0000-0000-0000000000a2', '20000000-0000-0000-0000-00000000000a', 'AAA2222', 'truck', 10),
  ('95000000-0000-0000-0000-00000000000b', '20000000-0000-0000-0000-00000000000b', 'BBB1111', 'truck', 10);
insert into public.drivers (id, organization_id, full_name, cpf_display, cnh_display, cnh_category, cnh_valid_until) values
  ('96000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', 'Motorista A', 'x', 'x', 'D', current_date + 365),
  ('96000000-0000-0000-0000-0000000000a2', '20000000-0000-0000-0000-00000000000a', 'Motorista A2', 'y', 'y', 'D', current_date + 365),
  ('96000000-0000-0000-0000-00000000000b', '20000000-0000-0000-0000-00000000000b', 'Motorista B', 'x', 'x', 'D', current_date + 365);
insert into public.cylinder_types (id, organization_id, gas, capacity_value, capacity_unit, classification) values
  ('97000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', 'Oxigênio', 10, 'l', 'medicinal'),
  ('97000000-0000-0000-0000-00000000000b', '20000000-0000-0000-0000-00000000000b', 'Oxigênio', 10, 'l', 'medicinal');
insert into public.cylinders (id, organization_id, cylinder_type_id, serial_number) values
  ('98000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-00000000000a', '97000000-0000-0000-0000-00000000000a', 'CON-A-001'),
  ('98000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-00000000000a', '97000000-0000-0000-0000-00000000000a', 'CON-A-002'),
  ('98000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-00000000000a', '97000000-0000-0000-0000-00000000000a', 'CON-A-003'),
  ('98000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-00000000000a', '97000000-0000-0000-0000-00000000000a', 'CON-A-004'),
  ('98000000-0000-0000-0000-00000000000b', '20000000-0000-0000-0000-00000000000b', '97000000-0000-0000-0000-00000000000b', 'CON-B-001');

insert into public.trips (id, organization_id, number, planned_date, vehicle_id, driver_id, created_by) values
  ('99000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-00000000000a', 1, current_date, '95000000-0000-0000-0000-00000000000a', '96000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-000000000002'),
  ('99000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-00000000000a', 2, current_date, '95000000-0000-0000-0000-00000000000a', '96000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-000000000002'),
  ('99000000-0000-0000-0000-00000000000b', '20000000-0000-0000-0000-00000000000b', 1, current_date, '95000000-0000-0000-0000-00000000000b', '96000000-0000-0000-0000-00000000000b', '10000000-0000-0000-0000-000000000003');
insert into public.trip_stops (id, organization_id, trip_id, site_id, position) values
  ('9a000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-00000000000a', '99000000-0000-0000-0000-000000000001', '92000000-0000-0000-0000-00000000000a', 1),
  ('9a000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-00000000000a', '99000000-0000-0000-0000-000000000002', '92000000-0000-0000-0000-00000000000a', 1);

-- trips: situação, observações, cancelamento, número.
select throws_ok($$ insert into public.trips (organization_id, number, planned_date, vehicle_id, driver_id, status, created_by) values
  ('20000000-0000-0000-0000-00000000000a', 9, current_date, '95000000-0000-0000-0000-00000000000a', '96000000-0000-0000-0000-00000000000a', 'paused', '10000000-0000-0000-0000-000000000002') $$,
  '23514', null, 'trips.status fora da lista é recusado');
select lives_ok($$ update public.trips set notes = repeat('n', 500) where id = '99000000-0000-0000-0000-000000000001' $$, 'observações com 500 caracteres passam');
select throws_ok($$ update public.trips set notes = repeat('n', 501) where id = '99000000-0000-0000-0000-000000000001' $$, '23514', null, 'observações com 501 caracteres são recusadas');
select throws_ok($$ insert into public.trips (organization_id, number, planned_date, vehicle_id, driver_id, created_by) values
  ('20000000-0000-0000-0000-00000000000a', 1, current_date, '95000000-0000-0000-0000-0000000000a2', '96000000-0000-0000-0000-0000000000a2', '10000000-0000-0000-0000-000000000002') $$,
  '23505', null, 'número repetido na organização é recusado');
select lives_ok($$ insert into public.trips (organization_id, number, planned_date, vehicle_id, driver_id, created_by) values
  ('20000000-0000-0000-0000-00000000000b', 2, current_date, '95000000-0000-0000-0000-00000000000b', '96000000-0000-0000-0000-00000000000b', '10000000-0000-0000-0000-000000000003') $$,
  'o mesmo número em outra organização é aceito');
select throws_ok($$ update public.trips set status = 'cancelled', cancelled_at = now(), cancelled_by = '10000000-0000-0000-0000-000000000002'
  where id = '99000000-0000-0000-0000-000000000002' $$, '23514', null, 'cancelada sem motivo é recusada');
select throws_ok($$ update public.trips set status = 'cancelled', cancelled_at = now(), cancelled_by = '10000000-0000-0000-0000-000000000002', cancel_reason = repeat('m', 501)
  where id = '99000000-0000-0000-0000-000000000002' $$, '23514', null, 'motivo de cancelamento com 501 caracteres é recusado');
select throws_ok($$ update public.trips set status = 'in_progress' where id = '99000000-0000-0000-0000-000000000002' $$,
  '23514', null, 'em andamento sem início registrado é recusada (coerência entre situação e datas)');

-- Um veículo e um motorista em no máximo uma viagem aberta.
select lives_ok($$ update public.trips set status = 'loading' where id = '99000000-0000-0000-0000-000000000001' $$, 'a primeira viagem do veículo pode carregar');
select throws_ok($$ update public.trips set status = 'loading' where id = '99000000-0000-0000-0000-000000000002' $$, '23505', null, 'a segunda viagem com o mesmo veículo e motorista não carrega junto');
select throws_ok($$ update public.trips set vehicle_id = '95000000-0000-0000-0000-0000000000a2', status = 'loading' where id = '99000000-0000-0000-0000-000000000002' $$,
  '23505', null, 'veículo diferente com o mesmo motorista também é recusado (índice do motorista)');
select throws_ok($$ update public.trips set driver_id = '96000000-0000-0000-0000-0000000000a2', status = 'loading' where id = '99000000-0000-0000-0000-000000000002' $$,
  '23505', null, 'motorista diferente com o mesmo veículo também é recusado (índice do veículo)');
select lives_ok($$ update public.trips set vehicle_id = '95000000-0000-0000-0000-0000000000a2', driver_id = '96000000-0000-0000-0000-0000000000a2', status = 'loading'
  where id = '99000000-0000-0000-0000-000000000002' $$, 'veículo e motorista livres permitem a segunda viagem');

-- trip_stops.
select throws_ok($$ insert into public.trip_stops (organization_id, trip_id, site_id, position) values
  ('20000000-0000-0000-0000-00000000000a', '99000000-0000-0000-0000-000000000001', '92000000-0000-0000-0000-0000000000a2', 0) $$, '23514', null, 'posição 0 é recusada');
select throws_ok($$ insert into public.trip_stops (organization_id, trip_id, site_id, position) values
  ('20000000-0000-0000-0000-00000000000a', '99000000-0000-0000-0000-000000000001', '92000000-0000-0000-0000-0000000000a2', 31) $$, '23514', null, 'posição 31 é recusada');
select throws_ok($$ insert into public.trip_stops (organization_id, trip_id, site_id, position, status) values
  ('20000000-0000-0000-0000-00000000000a', '99000000-0000-0000-0000-000000000001', '92000000-0000-0000-0000-0000000000a2', 2, 'lost') $$, '23514', null, 'situação de parada fora da lista é recusada');
set constraints trip_stops_position_key immediate;
select throws_ok($$ insert into public.trip_stops (organization_id, trip_id, site_id, position) values
  ('20000000-0000-0000-0000-00000000000a', '99000000-0000-0000-0000-000000000001', '92000000-0000-0000-0000-0000000000a2', 1) $$, '23505', null, 'posição repetida na mesma viagem é recusada');
set constraints trip_stops_position_key deferred;
select lives_ok($$ insert into public.trip_stops (organization_id, trip_id, site_id, position) values
  ('20000000-0000-0000-0000-00000000000a', '99000000-0000-0000-0000-000000000001', '92000000-0000-0000-0000-0000000000a2', 30) $$, 'a posição 30 é aceita');
select throws_ok($$ insert into public.trip_stops (organization_id, trip_id, site_id, position) values
  ('20000000-0000-0000-0000-00000000000b', '99000000-0000-0000-0000-00000000000b', '92000000-0000-0000-0000-00000000000a', 1) $$, '23503', null, 'parada com unidade de outra organização é recusada');
select throws_ok($$ insert into public.trip_stops (organization_id, trip_id, site_id, position) values
  ('20000000-0000-0000-0000-00000000000b', '99000000-0000-0000-0000-000000000001', '92000000-0000-0000-0000-00000000000b', 5) $$, '23503', null, 'parada de organização diferente da viagem é recusada');

-- trip_items.
select lives_ok($$ insert into public.trip_items (id, organization_id, trip_id, stop_id, cylinder_id, created_by) values
  ('9b000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-00000000000a', '99000000-0000-0000-0000-000000000001', '9a000000-0000-0000-0000-000000000001', '98000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002') $$,
  'item planejado é aceito');
select throws_ok($$ insert into public.trip_items (organization_id, trip_id, stop_id, cylinder_id, item_status, created_by) values
  ('20000000-0000-0000-0000-00000000000a', '99000000-0000-0000-0000-000000000001', '9a000000-0000-0000-0000-000000000001', '98000000-0000-0000-0000-000000000002', 'lost', '10000000-0000-0000-0000-000000000002') $$,
  '23514', null, 'situação do item fora da lista é recusada');
select throws_ok($$ insert into public.trip_items (organization_id, trip_id, stop_id, cylinder_id, created_by) values
  ('20000000-0000-0000-0000-00000000000a', '99000000-0000-0000-0000-000000000001', '9a000000-0000-0000-0000-000000000001', '98000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002') $$,
  '23505', null, 'o mesmo cilindro não repete na mesma viagem');
select throws_ok($$ insert into public.trip_items (organization_id, trip_id, stop_id, cylinder_id, created_by) values
  ('20000000-0000-0000-0000-00000000000a', '99000000-0000-0000-0000-000000000002', '9a000000-0000-0000-0000-000000000002', '98000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002') $$,
  '23505', null, 'cilindro com item aberto em outra viagem é recusado (reserva única)');
select throws_ok($$ insert into public.trip_items (organization_id, trip_id, stop_id, cylinder_id, created_by) values
  ('20000000-0000-0000-0000-00000000000a', '99000000-0000-0000-0000-000000000001', '9a000000-0000-0000-0000-000000000001', '98000000-0000-0000-0000-00000000000b', '10000000-0000-0000-0000-000000000002') $$,
  '23503', null, 'cilindro de outra organização é recusado');
select throws_ok($$ insert into public.trip_items (organization_id, trip_id, stop_id, cylinder_id, created_by) values
  ('20000000-0000-0000-0000-00000000000a', '99000000-0000-0000-0000-000000000001', '9a000000-0000-0000-0000-000000000002', '98000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000002') $$,
  '23503', null, 'parada de outra viagem é recusada');
select lives_ok($$ update public.trip_items set item_status = 'released' where id = '9b000000-0000-0000-0000-000000000001' $$, 'item liberado deixa de ser aberto');
select is((select is_open from public.trip_items where id = '9b000000-0000-0000-0000-000000000001'), false, 'is_open é falso em released');
select lives_ok($$ insert into public.trip_items (organization_id, trip_id, stop_id, cylinder_id, created_by) values
  ('20000000-0000-0000-0000-00000000000a', '99000000-0000-0000-0000-000000000002', '9a000000-0000-0000-0000-000000000002', '98000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002') $$,
  'depois de liberado, o cilindro pode entrar em outra viagem');
select throws_ok($$ update public.trip_items set item_status = 'not_delivered', checked_at = now() where cylinder_id = '98000000-0000-0000-0000-000000000001' and trip_id = '99000000-0000-0000-0000-000000000002' $$,
  '23514', null, 'não entregue sem motivo é recusado');
select throws_ok($$ update public.trip_items set item_status = 'removed', divergence_reason = repeat('d', 501) where cylinder_id = '98000000-0000-0000-0000-000000000001' and trip_id = '99000000-0000-0000-0000-000000000002' $$,
  '23514', null, 'motivo com 501 caracteres é recusado');
select throws_ok($$ update public.trip_items set lock_status = 'locked' where cylinder_id = '98000000-0000-0000-0000-000000000001' and trip_id = '99000000-0000-0000-0000-000000000002' $$,
  '23514', null, 'bloqueado em item apenas planejado é recusado');

-- trip_deliveries.
select throws_ok($$ insert into public.trip_deliveries (organization_id, stop_id, request_id, delivered_at, recipient_name, results, recorded_by) values
  ('20000000-0000-0000-0000-00000000000a', '9a000000-0000-0000-0000-000000000001', gen_random_uuid(), now(), 'X', '[]', '10000000-0000-0000-0000-000000000002') $$,
  '23514', null, 'nome do recebedor com 1 caractere é recusado');
select throws_ok($$ insert into public.trip_deliveries (organization_id, stop_id, request_id, delivered_at, recipient_name, results, recorded_by) values
  ('20000000-0000-0000-0000-00000000000a', '9a000000-0000-0000-0000-000000000001', gen_random_uuid(), now(), repeat('n', 121), '[]', '10000000-0000-0000-0000-000000000002') $$,
  '23514', null, 'nome do recebedor com 121 caracteres é recusado');
select throws_ok($$ insert into public.trip_deliveries (organization_id, stop_id, request_id, delivered_at, recipient_name, recipient_role, results, recorded_by) values
  ('20000000-0000-0000-0000-00000000000a', '9a000000-0000-0000-0000-000000000001', gen_random_uuid(), now(), 'Recebedor Fictício', repeat('f', 81), '[]', '10000000-0000-0000-0000-000000000002') $$,
  '23514', null, 'função do recebedor com 81 caracteres é recusada');
select throws_ok($$ insert into public.trip_deliveries (organization_id, stop_id, request_id, delivered_at, recipient_name, latitude, results, recorded_by) values
  ('20000000-0000-0000-0000-00000000000a', '9a000000-0000-0000-0000-000000000001', gen_random_uuid(), now(), 'Recebedor Fictício', -23.5, '[]', '10000000-0000-0000-0000-000000000002') $$,
  '23514', null, 'latitude sem longitude é recusada');
select throws_ok($$ insert into public.trip_deliveries (organization_id, stop_id, request_id, delivered_at, recipient_name, latitude, longitude, results, recorded_by) values
  ('20000000-0000-0000-0000-00000000000a', '9a000000-0000-0000-0000-000000000001', gen_random_uuid(), now(), 'Recebedor Fictício', 91, -46.6, '[]', '10000000-0000-0000-0000-000000000002') $$,
  '23514', null, 'latitude fora do intervalo é recusada');
select lives_ok($$ insert into public.trip_deliveries (id, organization_id, stop_id, request_id, delivered_at, recipient_name, latitude, longitude, results, recorded_by) values
  ('9c000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-00000000000a', '9a000000-0000-0000-0000-000000000001', gen_random_uuid(), now(), 'Recebedor Fictício', -23.55, -46.63, '[]', '10000000-0000-0000-0000-000000000002') $$,
  'entrega com posição completa é aceita');
select throws_ok($$ insert into public.trip_deliveries (organization_id, stop_id, request_id, delivered_at, recipient_name, results, recorded_by) values
  ('20000000-0000-0000-0000-00000000000a', '9a000000-0000-0000-0000-000000000001', gen_random_uuid(), now(), 'Outro Recebedor', '[]', '10000000-0000-0000-0000-000000000002') $$,
  '23505', null, 'uma única entrega original por parada');

-- trip_unlocks e trip_events.
select lives_ok($$ insert into public.trip_unlocks (organization_id, item_id, request_id, aal, actor_user_id) values
  ('20000000-0000-0000-0000-00000000000a', '9b000000-0000-0000-0000-000000000001', gen_random_uuid(), 'aal1', '10000000-0000-0000-0000-000000000002') $$, 'desbloqueio normal é aceito');
select throws_ok($$ insert into public.trip_unlocks (organization_id, item_id, request_id, aal, actor_user_id) values
  ('20000000-0000-0000-0000-00000000000a', '9b000000-0000-0000-0000-000000000001', gen_random_uuid(), 'aal1', '10000000-0000-0000-0000-000000000002') $$, '23505', null, 'cada item é desbloqueado uma vez');
select throws_ok($$ insert into public.trip_unlocks (organization_id, item_id, request_id, exceptional, aal, actor_user_id) values
  ('20000000-0000-0000-0000-00000000000a', '9b000000-0000-0000-0000-000000000001', gen_random_uuid(), true, 'aal2', '10000000-0000-0000-0000-000000000002') $$,
  '23514', null, 'desbloqueio excepcional sem justificativa é recusado');
select throws_ok($$ insert into public.trip_unlocks (organization_id, item_id, request_id, exceptional, justification, aal, actor_user_id) values
  ('20000000-0000-0000-0000-00000000000a', '9b000000-0000-0000-0000-000000000001', gen_random_uuid(), true, 'Motivo registrado', 'aal1', '10000000-0000-0000-0000-000000000002') $$,
  '23514', null, 'desbloqueio excepcional sem segundo fator é recusado');
select throws_ok($$ insert into public.trip_events (organization_id, trip_id, sequence, event_type, actor_user_id) values
  ('20000000-0000-0000-0000-00000000000a', '99000000-0000-0000-0000-000000000001', 1, 'trip_exploded', '10000000-0000-0000-0000-000000000002') $$,
  '23514', null, 'tipo de evento fora da lista é recusado');
select throws_ok($$ insert into public.trip_events (organization_id, trip_id, sequence, event_type, actor_user_id, data) values
  ('20000000-0000-0000-0000-00000000000a', '99000000-0000-0000-0000-000000000001', 1, 'trip_created', '10000000-0000-0000-0000-000000000002', '{"token":"x"}') $$,
  '23514', null, 'evento com token nos dados é recusado');

select * from finish();
rollback;
