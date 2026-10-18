begin;
select plan(20);

-- Spec 012, US4: vigilância da geocerca do cliente e violação (RF-018 a RF-022a, RN-004, MS-005). A vigilância começa na entrega numa
-- unidade com geocerca ativa e termina na nova viagem ou na volta ao estoque. Duas posições com GPS seguidas fora, além de 50 m, abrem a
-- violação, o alerta alto e o comando de travar, devolvido já na resposta do envio que a causou. Hermético: rollback.

insert into public.customers (id, organization_id, person_type, document_display, legal_name, segment) values
  ('a2210000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', 'legal', '11222333000181', 'Hospital Alfa Ltda', 'hospital');
insert into public.customer_sites (id, organization_id, customer_id, name, postal_code, street, number, city, state) values
  ('a2220000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-00000000000a', 'a2210000-0000-0000-0000-00000000000a', 'Unidade com cerca', '01001000', 'Praça da Sé', '1', 'São Paulo', 'SP'),
  ('a2220000-0000-0000-0000-0000000000a2', '20000000-0000-0000-0000-00000000000a', 'a2210000-0000-0000-0000-00000000000a', 'Unidade sem cerca', '01001000', 'Praça da Sé', '2', 'São Paulo', 'SP');
insert into public.geofences (id, organization_id, site_id, name, shape, center, radius_m, area) values
  ('a2230000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-00000000000a', 'a2220000-0000-0000-0000-0000000000a1', 'Pátio', 'circle',
   extensions.st_setsrid(extensions.st_makepoint(-39.3, -7.2), 4326)::extensions.geography, 100,
   extensions.st_buffer(extensions.st_setsrid(extensions.st_makepoint(-39.3, -7.2), 4326)::extensions.geography, 100));
insert into public.vehicles (id, organization_id, plate, vehicle_type, capacity_cylinders) values
  ('a2250000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', 'LCR3C45', 'truck', 20);
insert into public.drivers (id, organization_id, full_name, cpf_display, cnh_display, cnh_category, cnh_valid_until) values
  ('a2260000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', 'Motorista A', 'x', 'x', 'D', (now() at time zone 'America/Sao_Paulo')::date + 365);
insert into public.cylinder_types (id, organization_id, gas, capacity_value, capacity_unit, classification) values
  ('a2270000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', 'Oxigênio', 10, 'l', 'medicinal');
insert into public.cylinders (id, organization_id, cylinder_type_id, serial_number)
  select ('a2280000-0000-0000-0000-00000000000' || i)::uuid, '20000000-0000-0000-0000-00000000000a', 'a2270000-0000-0000-0000-00000000000a', 'GEO-' || i
    from generate_series(1, 3) i;
insert into public.seal_devices (id, organization_id, device_code, label, key_hash, created_by, lock_state)
  select ('a2200000-0000-0000-0000-00000000000' || i)::uuid, '20000000-0000-0000-0000-00000000000a', 'DSP-GEOA000' || i, 'Lacre ' || i,
    extensions.digest('k-' || i, 'sha256'), '10000000-0000-0000-0000-000000000002', 'unlocked' from generate_series(1, 3) i;
insert into public.seal_bindings (organization_id, device_id, cylinder_id, bound_by, bound_at)
  select '20000000-0000-0000-0000-00000000000a', ('a2200000-0000-0000-0000-00000000000' || i)::uuid, ('a2280000-0000-0000-0000-00000000000' || i)::uuid,
    '10000000-0000-0000-0000-000000000002', now() - interval '1 day' from generate_series(1, 3) i;
insert into public.trips (id, organization_id, number, planned_date, vehicle_id, driver_id, status, started_at, started_by, created_by) values
  ('a2290000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', 960, (now() at time zone 'America/Sao_Paulo')::date,
   'a2250000-0000-0000-0000-00000000000a', 'a2260000-0000-0000-0000-00000000000a', 'in_progress', now() - interval '2 hours', '10000000-0000-0000-0000-000000000002',
   '10000000-0000-0000-0000-000000000002');
insert into public.trip_stops (id, organization_id, trip_id, site_id, position, status, arrived_at, arrived_by) values
  ('a22a0000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-00000000000a', 'a2290000-0000-0000-0000-00000000000a', 'a2220000-0000-0000-0000-0000000000a1', 1, 'on_site', now(), '10000000-0000-0000-0000-000000000002'),
  ('a22a0000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-00000000000a', 'a2290000-0000-0000-0000-00000000000a', 'a2220000-0000-0000-0000-0000000000a2', 2, 'on_site', now(), '10000000-0000-0000-0000-000000000002');
insert into public.trip_items (id, organization_id, trip_id, stop_id, cylinder_id, item_status, lock_status, checked_at, created_by)
  select ('a22b0000-0000-0000-0000-00000000000' || i)::uuid, '20000000-0000-0000-0000-00000000000a', 'a2290000-0000-0000-0000-00000000000a',
    case when i = 2 then 'a22a0000-0000-0000-0000-000000000002' else 'a22a0000-0000-0000-0000-000000000001' end::uuid,
    ('a2280000-0000-0000-0000-00000000000' || i)::uuid, 'delivered', 'locked', now() - interval '2 hours', '10000000-0000-0000-0000-000000000002'
    from generate_series(1, 3) i;
insert into public.trip_deliveries (organization_id, stop_id, request_id, delivered_at, recipient_name, results, recorded_by) values
  ('20000000-0000-0000-0000-00000000000a', 'a22a0000-0000-0000-0000-000000000001', gen_random_uuid(), now(), 'Recebedor Fictício',
   '[{"item_id": "a22b0000-0000-0000-0000-000000000001", "delivered": true}, {"item_id": "a22b0000-0000-0000-0000-000000000003", "delivered": true}]', '10000000-0000-0000-0000-000000000002'),
  ('20000000-0000-0000-0000-00000000000a', 'a22a0000-0000-0000-0000-000000000002', gen_random_uuid(), now(), 'Recebedor Fictício',
   '[{"item_id": "a22b0000-0000-0000-0000-000000000002", "delivered": true}]', '10000000-0000-0000-0000-000000000002');

create function pg_temp.send(p_code text, p_key text, p_dlat numeric, p_quality text default 'gps', p_watch int default 0) returns jsonb language sql as $$
  update private.seal_rate_windows set count = 0;
  select public.seal_ingest(p_code, extensions.digest(p_key, 'sha256'), extensions.digest('ip', 'sha256'), jsonb_build_object('protocol', 1, 'watch_version', p_watch,
    'messages', jsonb_build_array(jsonb_build_object('message_id', gen_random_uuid()::text, 'type', 'position', 'read_at', clock_timestamp(), 'problem', null,
      'data', jsonb_build_object('latitude', -7.2 + p_dlat, 'longitude', -39.3, 'quality', p_quality, 'accuracy_m', 5, 'battery_pct', 80, 'signal_dbm', -60, 'seal_state', 'closed')))))
$$;
create function pg_temp.violations() returns int language sql as $$
  select count(*)::int from public.seal_violations where device_id = 'a2200000-0000-0000-0000-000000000001'
$$;

-- Começo da vigilância.
select is((select site_id from public.seal_watches where cylinder_id = 'a2280000-0000-0000-0000-000000000001' and ended_at is null),
  'a2220000-0000-0000-0000-0000000000a1'::uuid, 'a entrega numa unidade com geocerca ativa abre a vigilância');
select is((select count(*)::int from public.seal_watches where cylinder_id = 'a2280000-0000-0000-0000-000000000002'), 0, 'unidade sem geocerca ativa: sem vigilância');

-- A resposta leva a vigilância e, na primeira vez, o contorno.
create temp table r0 as select pg_temp.send('DSP-GEOA0001', 'k-1', 0) as r;
select is((select r->'body'->'watch'->>'active' from r0), 'true', 'a resposta diz que o cilindro está sob vigilância');
select is((select r->'body'->'watch'->'fences'->0->>'shape' || ':' || (r->'body'->'watch'->'fences'->0->>'radius_m') from r0), 'circle:100',
  'e manda o contorno da geocerca quando o lacre não tem a versão atual');
select ok(not (pg_temp.send('DSP-GEOA0001', 'k-1', 0, 'gps', (select (r->'body'->'watch'->>'version')::int from r0))->'body'->'watch' ? 'fences'),
  'com a versão atual, o contorno não vai de novo');

-- Oscilação na borda e posição sem GPS não abrem violação.
select pg_temp.send('DSP-GEOA0001', 'k-1', 0.0013);
select pg_temp.send('DSP-GEOA0001', 'k-1', 0.0013);
select is(pg_temp.violations(), 0, 'fora, mas dentro da tolerância de 50 m: nada');
select pg_temp.send('DSP-GEOA0001', 'k-1', 0.002);
select pg_temp.send('DSP-GEOA0001', 'k-1', 0);
select is(pg_temp.violations(), 0, 'uma só posição fora, seguida de uma dentro: nada');
select pg_temp.send('DSP-GEOA0001', 'k-1', 0.002, 'last_known');
select pg_temp.send('DSP-GEOA0001', 'k-1', 0.0021, 'last_known');
select is(pg_temp.violations(), 0, 'posições sem GPS fora da cerca não abrem violação');

-- Duas posições com GPS seguidas fora, além da tolerância.
select pg_temp.send('DSP-GEOA0001', 'k-1', 0.002);
create temp table r2 as select pg_temp.send('DSP-GEOA0001', 'k-1', 0.0022) as r;
select is(pg_temp.violations(), 1, 'duas posições com GPS seguidas fora: violação');
select ok((select distance_m > 50 and geofence_id = 'a2230000-0000-0000-0000-0000000000a1' and first_outside_at is not null and status = 'open'
  from public.seal_violations where device_id = 'a2200000-0000-0000-0000-000000000001'), 'com a geocerca, o horário e a distância até ela');
select is((select r->'body'->'command'->>'kind' from r2), 'lock', 'o comando de travar já vai na resposta do envio que causou a violação');
select is((select origin from public.seal_commands where id = (select (r->'body'->'command'->>'id')::uuid from r2)), 'geofence_violation', 'com origem violação');
select is((select severity || ':' || requires_push from public.seal_alerts where device_id = 'a2200000-0000-0000-0000-000000000001' and kind = 'geofence_violation'),
  'high:true', 'e o alerta alto, com notificação');

-- Mais posições fora: nada novo; a violação guarda a última posição.
select pg_temp.send('DSP-GEOA0001', 'k-1', 0.004);
select is(pg_temp.violations() || ':' || (select count(*) from public.seal_commands where origin = 'geofence_violation'), '1:1', 'sem nova violação nem novo comando');

-- Confirmação: travada por violação. Volta para dentro: "retornou à área", sem destravar.
select public.seal_ingest('DSP-GEOA0001', extensions.digest('k-1', 'sha256'), extensions.digest('ip', 'sha256'), jsonb_build_object('protocol', 1, 'messages',
  jsonb_build_array(jsonb_build_object('message_id', 'CONF-1', 'type', 'command_result', 'read_at', clock_timestamp(), 'problem', null,
    'data', jsonb_build_object('command_id', (select (r->'body'->'command'->>'id') from r2), 'result', 'executed')))));
select is((select lock_state from public.seal_devices where id = 'a2200000-0000-0000-0000-000000000001'), 'locked_violation', 'travada por violação de geocerca');
select pg_temp.send('DSP-GEOA0001', 'k-1', 0);
select is((select status from public.seal_violations where device_id = 'a2200000-0000-0000-0000-000000000001'), 'returned', 'voltou: "retornou à área"');
select is((select count(*)::int from public.seal_commands where device_id = 'a2200000-0000-0000-0000-000000000001' and kind = 'unlock'), 0, 'e o lacre não destrava sozinho');

-- Geocerca inativada: vigilância suspensa, com alerta médio.
update public.geofences set status = 'inactive', inactivated_at = now() where id = 'a2230000-0000-0000-0000-0000000000a1';
select is((select (suspended_at is not null)::text from public.seal_watches where cylinder_id = 'a2280000-0000-0000-0000-000000000001' and ended_at is null)
  || ':' || (select severity from public.seal_alerts where device_id = 'a2200000-0000-0000-0000-000000000001' and kind = 'watch_suspended'), 'true:medium',
  'unidade sem geocerca ativa: vigilância suspensa e alerta médio');

-- Fim da vigilância: volta ao estoque e nova viagem.
update public.cylinders set stock_status = 'in_stock', custody_status = 'in_organization', custody_site_id = null where id = 'a2280000-0000-0000-0000-000000000003';
select is((select end_reason from public.seal_watches where cylinder_id = 'a2280000-0000-0000-0000-000000000003'), 'stock_in', 'a volta ao estoque encerra a vigilância');
select private.seal_end_watch('a2280000-0000-0000-0000-000000000001', 'new_trip');
select is((select r->'body'->'watch'->>'active' from (select pg_temp.send('DSP-GEOA0001', 'k-1', 0) as r) x), 'false', 'encerrada, a resposta diz ao lacre que não há vigilância');

select * from finish();
rollback;
