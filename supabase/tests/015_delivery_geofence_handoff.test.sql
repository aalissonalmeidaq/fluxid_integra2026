begin;
select plan(9);

-- Spec 015 (T131; RF-017, cenário 3g do quickstart): depois da entrega, a proximidade com o motorista termina e prevalece a vigilância da
-- geocerca do destino da Spec 012. Fluxo completo: sessão de rastreamento ativa, entrega lida por câmera numa unidade com geocerca, o lacre
-- sai da cerca duas vezes seguidas (violação e alerta alto) e as posições novas do celular não geram comparação nem alerta de afastamento.
-- Hermético: rollback.

delete from public.user_sessions where user_id = '10000000-0000-0000-0000-000000000004';
select public.start_user_session('10000000-0000-0000-0000-000000000004', '60000000-0000-0000-0000-0000001531a4', 'aal1');

insert into public.cylinder_types (id, organization_id, gas, capacity_value, capacity_unit, classification) values
  ('d1600000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', 'Oxigênio', 10, 'l', 'medicinal');
insert into public.cylinders (id, organization_id, cylinder_type_id, serial_number, custody_status) values
  ('d1610000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-00000000000a', 'd1600000-0000-0000-0000-00000000000a', 'GEO-015-1', 'in_transit');
insert into public.vehicles (id, organization_id, plate, vehicle_type, capacity_cylinders) values
  ('d1620000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-00000000000a', 'GEO1A51', 'truck', 5);
insert into public.drivers (id, organization_id, full_name, cpf_display, cnh_display, cnh_category, cnh_valid_until, linked_user_id) values
  ('d1630000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-00000000000a', 'Motorista Quatro', 'x', 'x', 'D',
   (now() at time zone 'America/Sao_Paulo')::date + 365, '10000000-0000-0000-0000-000000000004');
insert into public.customers (id, organization_id, person_type, document_display, legal_name, segment) values
  ('d1640000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-00000000000a', 'legal', '11222333000181', 'Hospital Alfa Ltda', 'hospital');
insert into public.customer_sites (id, organization_id, customer_id, name, postal_code, street, number, city, state) values
  ('d1650000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-00000000000a', 'd1640000-0000-0000-0000-0000000000a1', 'Unidade com cerca',
   '01001000', 'Praça da Sé', '1', 'São Paulo', 'SP');
insert into public.geofences (id, organization_id, site_id, name, shape, center, radius_m, area) values
  ('d16a0000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-00000000000a', 'd1650000-0000-0000-0000-0000000000a1', 'Pátio', 'circle',
   extensions.st_setsrid(extensions.st_makepoint(-39.31, -7.23), 4326)::extensions.geography, 100,
   extensions.st_buffer(extensions.st_setsrid(extensions.st_makepoint(-39.31, -7.23), 4326)::extensions.geography, 100));
insert into public.trips (id, organization_id, number, planned_date, vehicle_id, driver_id, status, started_at, started_by, created_by) values
  ('d1660000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-00000000000a', 9191, (now() at time zone 'America/Sao_Paulo')::date,
   'd1620000-0000-0000-0000-0000000000a1', 'd1630000-0000-0000-0000-0000000000a1', 'in_progress', now() - interval '2 hours',
   '10000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002');
insert into public.trip_stops (id, organization_id, trip_id, site_id, position) values
  ('d1670000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-00000000000a', 'd1660000-0000-0000-0000-0000000000a1', 'd1650000-0000-0000-0000-0000000000a1', 1);
insert into public.trip_items (id, organization_id, trip_id, stop_id, cylinder_id, item_status, lock_status, checked_at, created_by) values
  ('d1680000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-00000000000a', 'd1660000-0000-0000-0000-0000000000a1', 'd1670000-0000-0000-0000-0000000000a1',
   'd1610000-0000-0000-0000-0000000000a1', 'in_transit', 'locked', now(), '10000000-0000-0000-0000-000000000002');
insert into public.seal_devices (id, organization_id, device_code, label, key_hash, created_by, lock_state) values
  ('d1690000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-00000000000a', 'DSP-GEO15001', 'Lacre 1', extensions.digest('k1', 'sha256'),
   '10000000-0000-0000-0000-000000000002', 'locked');
insert into public.seal_bindings (organization_id, device_id, cylinder_id, bound_by, bound_at) values
  ('20000000-0000-0000-0000-00000000000a', 'd1690000-0000-0000-0000-0000000000a1', 'd1610000-0000-0000-0000-0000000000a1',
   '10000000-0000-0000-0000-000000000002', now() - interval '3 hours');

-- Lacre pelo envio real da Spec 012, `p_dlat` graus ao norte do centro da cerca (0,003° ≈ 333 m); celular sempre no centro.
create function pg_temp.seal(p_dlat numeric) returns jsonb language sql as $$
  update private.seal_rate_windows set count = 0;
  select public.seal_ingest('DSP-GEO15001', extensions.digest('k1', 'sha256'), extensions.digest('ip', 'sha256'), jsonb_build_object('protocol', 1,
    'watch_version', 0, 'messages', jsonb_build_array(jsonb_build_object('message_id', gen_random_uuid()::text, 'type', 'position',
      'read_at', clock_timestamp(), 'problem', null, 'data', jsonb_build_object('latitude', -7.23 + p_dlat, 'longitude', -39.31, 'quality', 'gps',
        'accuracy_m', 5, 'battery_pct', 80, 'signal_dbm', -60, 'seal_state', 'closed')))))
$$;
create function pg_temp.mobile(p_tracking uuid, p_seq integer) returns jsonb language sql as $$
  select public.ingest_driver_positions('10000000-0000-0000-0000-000000000004', '60000000-0000-0000-0000-0000001531a4',
    '20000000-0000-0000-0000-00000000000a', gen_random_uuid(), p_tracking, 'd16b0000-0000-0000-0000-0000000000a1',
    jsonb_build_array(jsonb_build_object('client_position_id', gen_random_uuid(), 'sequence_no', p_seq, 'observed_at', clock_timestamp(),
      'latitude', -7.23, 'longitude', -39.31, 'accuracy_m', 10)))
$$;
create temporary table t as
  select (public.start_tracking_session('10000000-0000-0000-0000-000000000004', '60000000-0000-0000-0000-0000001531a4',
    '20000000-0000-0000-0000-00000000000a', gen_random_uuid(), 'd1660000-0000-0000-0000-0000000000a1', 'd16b0000-0000-0000-0000-0000000000a1',
    'android_native', 'full', false)->'session'->>'id')::uuid as sid;
create function pg_temp.pair() returns public.proximity_pairs language sql as $$
  select * from public.proximity_pairs where tracking_session_id = (select sid from t)
$$;
create function pg_temp.comparisons() returns int language sql as $$
  select count(*)::int from public.proximity_comparisons where pair_id = (pg_temp.pair()).id
$$;

-- Antes da entrega: lacre e celular juntos no pátio, a proximidade é avaliada.
select pg_temp.seal(0); select pg_temp.mobile((select sid from t), 1);
select is(pg_temp.comparisons(), 1, 'com a viagem em andamento, a proximidade é avaliada');

-- Entrega lida por câmera na unidade com geocerca.
insert into public.trip_deliveries (organization_id, stop_id, request_id, delivered_at, recipient_name, results, recorded_by) values
  ('20000000-0000-0000-0000-00000000000a', 'd1670000-0000-0000-0000-0000000000a1', gen_random_uuid(), now(), 'Recebedor Teste',
   jsonb_build_array(jsonb_build_object('item_id', 'd1680000-0000-0000-0000-0000000000a1', 'delivered', true, 'source', 'camera')),
   '10000000-0000-0000-0000-000000000004');
select is((pg_temp.pair()).status, 'delivered', 'a entrega encerra a proximidade do cilindro');
select is((select site_id from public.seal_watches where cylinder_id = 'd1610000-0000-0000-0000-0000000000a1' and ended_at is null),
  'd1650000-0000-0000-0000-0000000000a1'::uuid, 'e a vigilância da geocerca do destino começa');

-- O cilindro sai da cerca duas vezes seguidas, enquanto o celular segue no pátio.
select pg_temp.seal(0.003); select pg_temp.mobile((select sid from t), 2);
select pg_temp.seal(0.003); select pg_temp.mobile((select sid from t), 3);
select pg_temp.seal(0.003); select pg_temp.mobile((select sid from t), 4);
select is((select count(*)::int from public.seal_violations where cylinder_id = 'd1610000-0000-0000-0000-0000000000a1' and status = 'open'), 1,
  'a vigilância da geocerca abre a violação');
select is((select severity from public.seal_alerts where device_id = 'd1690000-0000-0000-0000-0000000000a1' and kind = 'geofence_violation'
  and closed_at is null), 'high', 'com alerta alto da Spec 012');
select is(pg_temp.comparisons(), 1, 'depois da entrega, nenhuma comparação de proximidade nova');
select is((pg_temp.pair()).outside_streak::int, 0, 'a sequência de afastamento não anda');
select is((select count(*)::int from public.proximity_occurrences where pair_id = (pg_temp.pair()).id), 0, 'nenhuma ocorrência de afastamento');
select is((select count(*)::int from public.seal_alerts where device_id = 'd1690000-0000-0000-0000-0000000000a1' and kind = 'proximity_separation'), 0,
  'e nenhum alerta de afastamento: só a vigilância da geocerca vale');

select * from finish();
rollback;
