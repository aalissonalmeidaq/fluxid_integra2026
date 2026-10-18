begin;
select plan(8);

-- Spec 012, US2: trava no início da viagem (RF-023, RN-008, MS-003). A viagem é montada direto no banco e iniciada na mesma ordem da
-- `start_trip` da Spec 008 (primeiro a viagem, depois os itens): um `lock` por cilindro com lacre ativo, nenhum para o sem lacre; a
-- repetição não duplica; a viagem não espera a confirmação; o fim da viagem cancela a trava ainda pendente. Hermético: rollback.

insert into public.customers (id, organization_id, person_type, document_display, legal_name, segment) values
  ('a1910000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', 'legal', '11222333000181', 'Hospital Alfa Ltda', 'hospital');
insert into public.customer_sites (id, organization_id, customer_id, name, postal_code, street, number, city, state) values
  ('a1920000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', 'a1910000-0000-0000-0000-00000000000a', 'Unidade A', '01001000', 'Praça da Sé', '1', 'São Paulo', 'SP');
insert into public.vehicles (id, organization_id, plate, vehicle_type, capacity_cylinders) values
  ('a1950000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', 'LCR1A23', 'truck', 10);
insert into public.drivers (id, organization_id, full_name, cpf_display, cnh_display, cnh_category, cnh_valid_until) values
  ('a1960000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', 'Motorista A', 'x', 'x', 'D', (now() at time zone 'America/Sao_Paulo')::date + 365);
insert into public.cylinder_types (id, organization_id, gas, capacity_value, capacity_unit, classification) values
  ('a1970000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', 'Oxigênio', 10, 'l', 'medicinal');
insert into public.cylinders (id, organization_id, cylinder_type_id, serial_number)
  select ('a1980000-0000-0000-0000-00000000000' || i)::uuid, '20000000-0000-0000-0000-00000000000a', 'a1970000-0000-0000-0000-00000000000a', 'TRIP-LOCK-' || i
    from generate_series(1, 4) i;
insert into public.seal_devices (id, organization_id, device_code, label, key_hash, created_by)
  select ('a1900000-0000-0000-0000-00000000000' || i)::uuid, '20000000-0000-0000-0000-00000000000a', 'DSP-TRIPL00' || i, 'Lacre ' || i,
    extensions.digest('k-' || i, 'sha256'), '10000000-0000-0000-0000-000000000002' from generate_series(1, 3) i;
insert into public.seal_bindings (organization_id, device_id, cylinder_id, bound_by)
  select '20000000-0000-0000-0000-00000000000a', ('a1900000-0000-0000-0000-00000000000' || i)::uuid, ('a1980000-0000-0000-0000-00000000000' || i)::uuid,
    '10000000-0000-0000-0000-000000000002' from generate_series(1, 3) i;
insert into public.trips (id, organization_id, number, planned_date, vehicle_id, driver_id, status, created_by) values
  ('a1990000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', 901, (now() at time zone 'America/Sao_Paulo')::date,
   'a1950000-0000-0000-0000-00000000000a', 'a1960000-0000-0000-0000-00000000000a', 'loading', '10000000-0000-0000-0000-000000000002');
insert into public.trip_stops (id, organization_id, trip_id, site_id, position) values
  ('a19a0000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', 'a1990000-0000-0000-0000-00000000000a', 'a1920000-0000-0000-0000-00000000000a', 1);
insert into public.trip_items (id, organization_id, trip_id, stop_id, cylinder_id, item_status, checked_at, created_by)
  select ('a19b0000-0000-0000-0000-00000000000' || i)::uuid, '20000000-0000-0000-0000-00000000000a', 'a1990000-0000-0000-0000-00000000000a',
    'a19a0000-0000-0000-0000-00000000000a', ('a1980000-0000-0000-0000-00000000000' || i)::uuid, 'checked', now(), '10000000-0000-0000-0000-000000000002'
    from generate_series(1, 4) i;

-- Início da viagem, como a start_trip faz.
update public.trips set status = 'in_progress', started_at = now(), started_by = '10000000-0000-0000-0000-000000000002' where id = 'a1990000-0000-0000-0000-00000000000a';
update public.trip_items set item_status = 'in_transit', lock_status = 'locked' where trip_id = 'a1990000-0000-0000-0000-00000000000a' and item_status = 'checked';

select is((select count(*)::int from public.seal_commands where trip_id = 'a1990000-0000-0000-0000-00000000000a' and kind = 'lock' and origin = 'trip_start'), 3,
  'um comando de travar por cilindro com lacre');
select is((select count(*)::int from public.trip_items where trip_id = 'a1990000-0000-0000-0000-00000000000a' and seal_command_id is not null), 3,
  'o item da viagem guarda o comando de travar');
select is((select seal_command_id from public.trip_items where id = 'a19b0000-0000-0000-0000-000000000004'), null::uuid, 'o cilindro sem lacre não ganha comando');
select is((select status from public.trips where id = 'a1990000-0000-0000-0000-00000000000a'), 'in_progress', 'a viagem começa sem esperar a confirmação (RN-008)');

-- Repetir o início não duplica (a idempotência da Spec 008 não chega aqui, mas o banco também não duplica).
select private.seal_on_item_departed(i) from public.trip_items i where i.trip_id = 'a1990000-0000-0000-0000-00000000000a';
select is((select count(*)::int from public.seal_commands where trip_id = 'a1990000-0000-0000-0000-00000000000a'), 3, 'repetir o início não duplica');

-- O lacre recebe o comando dele na próxima comunicação.
select is(public.seal_ingest('DSP-TRIPL001', extensions.digest('k-1', 'sha256'), extensions.digest('ip', 'sha256'), jsonb_build_object('protocol', 1, 'messages',
  jsonb_build_array(jsonb_build_object('message_id', 'T-1', 'type', 'position', 'read_at', now(), 'problem', null,
    'data', jsonb_build_object('latitude', -7.2, 'longitude', -39.3, 'quality', 'gps', 'accuracy_m', 5, 'battery_pct', 80, 'signal_dbm', -60, 'seal_state', 'closed')))))
  ->'body'->'command'->>'id', (select seal_command_id::text from public.trip_items where id = 'a19b0000-0000-0000-0000-000000000001'),
  'cada lacre recebe o próprio comando de travar');

-- O fim da viagem cancela a trava que ainda não foi entregue.
update public.trips set status = 'completed', completed_at = now(), completed_by = '10000000-0000-0000-0000-000000000002' where id = 'a1990000-0000-0000-0000-00000000000a';
select is((select count(*)::int from public.seal_commands where trip_id = 'a1990000-0000-0000-0000-00000000000a' and status = 'cancelled' and cancel_reason = 'trip_closed'), 2,
  'concluída a viagem, os comandos de travar ainda pendentes são cancelados');
select is((select status from public.seal_commands where id = (select seal_command_id from public.trip_items where id = 'a19b0000-0000-0000-0000-000000000001')), 'delivered',
  'o já entregue ao lacre continua esperando a confirmação');

select * from finish();
rollback;
