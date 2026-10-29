begin;
select plan(29);

-- Spec 015 (T036; RF-007e, RF-007f, RF-008 a RF-018, RF-023, CS-002, CS-008): avaliação de proximidade na transação de ingestão. Só três
-- comparações válidas consecutivas acima do limite abrem uma ocorrência e um alerta; inside reinicia; inconclusiva é neutra; um alerta
-- por par; retrospectiva com a viagem ativa abre alerta marcado, com a viagem encerrada vira só histórico; a entrega encerra o par e,
-- lida por câmera/NFC/digitação, registra presença pontual; nada muda custódia nem trava. Hermético: rollback.

delete from public.user_sessions where user_id in ('10000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000004',
  '10000000-0000-0000-0000-000000000005');
select public.start_user_session('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000001530a2', 'aal1');
select public.start_user_session('10000000-0000-0000-0000-000000000004', '60000000-0000-0000-0000-0000001530a4', 'aal1');
select public.start_user_session('10000000-0000-0000-0000-000000000005', '60000000-0000-0000-0000-0000001530a5', 'aal1');

-- Duas viagens em andamento do Tenant A, cada uma com um cilindro lacrado; os motoristas são os usuários 4 e 5.
insert into public.cylinder_types (id, organization_id, gas, capacity_value, capacity_unit, classification) values
  ('d1500000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', 'Oxigênio', 10, 'l', 'medicinal');
insert into public.cylinders (id, organization_id, cylinder_type_id, serial_number, custody_status) values
  ('d1510000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-00000000000a', 'd1500000-0000-0000-0000-00000000000a', 'PRX-A-1', 'in_transit'),
  ('d1510000-0000-0000-0000-0000000000a2', '20000000-0000-0000-0000-00000000000a', 'd1500000-0000-0000-0000-00000000000a', 'PRX-A-2', 'in_transit');
insert into public.vehicles (id, organization_id, plate, vehicle_type, capacity_cylinders) values
  ('d1520000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-00000000000a', 'PRX1A11', 'truck', 5),
  ('d1520000-0000-0000-0000-0000000000a2', '20000000-0000-0000-0000-00000000000a', 'PRX1A22', 'truck', 5);
insert into public.drivers (id, organization_id, full_name, cpf_display, cnh_display, cnh_category, cnh_valid_until, linked_user_id) values
  ('d1530000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-00000000000a', 'Motorista Quatro', 'x', 'x', 'D',
   (now() at time zone 'America/Sao_Paulo')::date + 365, '10000000-0000-0000-0000-000000000004'),
  ('d1530000-0000-0000-0000-0000000000a2', '20000000-0000-0000-0000-00000000000a', 'Motorista Cinco', 'x', 'x', 'D',
   (now() at time zone 'America/Sao_Paulo')::date + 365, '10000000-0000-0000-0000-000000000005');
insert into public.customers (id, organization_id, person_type, document_display, legal_name, segment) values
  ('d1540000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-00000000000a', 'legal', '11222333000181', 'Hospital Alfa Ltda', 'hospital');
insert into public.customer_sites (id, organization_id, customer_id, name, postal_code, street, number, city, state) values
  ('d1550000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-00000000000a', 'd1540000-0000-0000-0000-0000000000a1', 'Unidade', '01001000',
   'Praça da Sé', '1', 'São Paulo', 'SP');
insert into public.trips (id, organization_id, number, planned_date, vehicle_id, driver_id, status, started_at, started_by, created_by) values
  ('d1560000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-00000000000a', 9181, (now() at time zone 'America/Sao_Paulo')::date,
   'd1520000-0000-0000-0000-0000000000a1', 'd1530000-0000-0000-0000-0000000000a1', 'in_progress', now() - interval '2 hours',
   '10000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002'),
  ('d1560000-0000-0000-0000-0000000000a2', '20000000-0000-0000-0000-00000000000a', 9182, (now() at time zone 'America/Sao_Paulo')::date,
   'd1520000-0000-0000-0000-0000000000a2', 'd1530000-0000-0000-0000-0000000000a2', 'in_progress', now() - interval '2 hours',
   '10000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002');
insert into public.trip_stops (id, organization_id, trip_id, site_id, position) values
  ('d1570000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-00000000000a', 'd1560000-0000-0000-0000-0000000000a1', 'd1550000-0000-0000-0000-0000000000a1', 1),
  ('d1570000-0000-0000-0000-0000000000a2', '20000000-0000-0000-0000-00000000000a', 'd1560000-0000-0000-0000-0000000000a2', 'd1550000-0000-0000-0000-0000000000a1', 1);
insert into public.trip_items (id, organization_id, trip_id, stop_id, cylinder_id, item_status, lock_status, checked_at, created_by) values
  ('d1580000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-00000000000a', 'd1560000-0000-0000-0000-0000000000a1', 'd1570000-0000-0000-0000-0000000000a1',
   'd1510000-0000-0000-0000-0000000000a1', 'in_transit', 'locked', now(), '10000000-0000-0000-0000-000000000002'),
  ('d1580000-0000-0000-0000-0000000000a2', '20000000-0000-0000-0000-00000000000a', 'd1560000-0000-0000-0000-0000000000a2', 'd1570000-0000-0000-0000-0000000000a2',
   'd1510000-0000-0000-0000-0000000000a2', 'in_transit', 'locked', now(), '10000000-0000-0000-0000-000000000002');
insert into public.seal_devices (id, organization_id, device_code, label, key_hash, created_by, lock_state) values
  ('d1590000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-00000000000a', 'DSP-PRX15001', 'Lacre 1', extensions.digest('k1', 'sha256'),
   '10000000-0000-0000-0000-000000000002', 'locked'),
  ('d1590000-0000-0000-0000-0000000000a2', '20000000-0000-0000-0000-00000000000a', 'DSP-PRX15002', 'Lacre 2', extensions.digest('k2', 'sha256'),
   '10000000-0000-0000-0000-000000000002', 'locked');
insert into public.seal_bindings (organization_id, device_id, cylinder_id, bound_by, bound_at) values
  ('20000000-0000-0000-0000-00000000000a', 'd1590000-0000-0000-0000-0000000000a1', 'd1510000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-000000000002', now() - interval '3 hours'),
  ('20000000-0000-0000-0000-00000000000a', 'd1590000-0000-0000-0000-0000000000a2', 'd1510000-0000-0000-0000-0000000000a2', '10000000-0000-0000-0000-000000000002', now() - interval '3 hours');

-- Lacre `n` em (-7.23 + dlat, -39.31), lido `p_seconds_ago` atrás; celular sempre em (-7.23, -39.31). 0,002° ≈ 222 m.
create function pg_temp.seal(p_device text, p_seconds_ago integer, p_dlat numeric, p_accuracy numeric default 8) returns void language sql as $$
  insert into public.seal_positions (organization_id, device_id, cylinder_id, point, accuracy_m, quality, read_at, last_seen_at)
  select '20000000-0000-0000-0000-00000000000a', ('d1590000-0000-0000-0000-0000000000a' || p_device)::uuid, ('d1510000-0000-0000-0000-0000000000a' || p_device)::uuid,
    extensions.st_setsrid(extensions.st_makepoint(-39.31, -7.23 + p_dlat), 4326)::extensions.geography, p_accuracy, 'gps',
    now() - make_interval(secs => p_seconds_ago), now() - make_interval(secs => p_seconds_ago)
$$;
create function pg_temp.start(p_trip text, p_installation text) returns uuid language sql as $$
  select (public.start_tracking_session(('10000000-0000-0000-0000-00000000000' || (3 + p_trip::int))::uuid,
    ('60000000-0000-0000-0000-0000001530a' || (3 + p_trip::int))::uuid, '20000000-0000-0000-0000-00000000000a',
    gen_random_uuid(), ('d1560000-0000-0000-0000-0000000000a' || p_trip)::uuid, ('d15b0000-0000-0000-0000-0000000000a' || p_installation)::uuid,
    'android_native', 'full', false)->'session'->>'id')::uuid
$$;
create function pg_temp.mobile(p_tracking uuid, p_installation text, p_seq integer, p_seconds_ago integer) returns jsonb language sql as $$
  select public.ingest_driver_positions(('10000000-0000-0000-0000-00000000000' || (3 + p_installation::int))::uuid,
    ('60000000-0000-0000-0000-0000001530a' || (3 + p_installation::int))::uuid, '20000000-0000-0000-0000-00000000000a',
    gen_random_uuid(), p_tracking, ('d15b0000-0000-0000-0000-0000000000a' || p_installation)::uuid,
    jsonb_build_array(jsonb_build_object('client_position_id', gen_random_uuid(), 'sequence_no', p_seq,
      'observed_at', now() - make_interval(secs => p_seconds_ago), 'latitude', -7.23, 'longitude', -39.31, 'accuracy_m', 10)))
$$;
create temporary table t1 as select pg_temp.start('1', '1') as sid;
create function pg_temp.pair1() returns public.proximity_pairs language sql as $$
  select * from public.proximity_pairs where tracking_session_id = (select sid from t1)
$$;

-- 1. Fora, fora, dentro: reinicia sem ocorrência.
select pg_temp.seal('1', 60, 0.002); select pg_temp.mobile((select sid from t1), '1', 1, 55);
select pg_temp.seal('1', 50, 0.002); select pg_temp.mobile((select sid from t1), '1', 2, 45);
select is((pg_temp.pair1()).outside_streak::int, 2, 'duas comparações fora: sequência 2');
select pg_temp.seal('1', 40, 0.0002); select pg_temp.mobile((select sid from t1), '1', 3, 35);
select is((pg_temp.pair1()).outside_streak::int, 0, 'uma comparação dentro reinicia a sequência');
select is((select count(*)::int from public.proximity_occurrences where pair_id = (pg_temp.pair1()).id), 0, 'nenhuma ocorrência');
select is((select count(*)::int from public.proximity_comparisons where pair_id = (pg_temp.pair1()).id), 3, 'cada comparação é gravada');
select is((select jsonb_agg(result order by sequence_ordinal) from public.proximity_comparisons where pair_id = (pg_temp.pair1()).id),
  '["outside", "outside", "inside"]'::jsonb, 'resultados na ordem');
select ok((select abs(distance_m - 222) < 3 from public.proximity_comparisons where pair_id = (pg_temp.pair1()).id and sequence_ordinal = 1),
  'distância geodésica do PostGIS (≈ 222 m)');
select is((select rule_version from public.proximity_comparisons where pair_id = (pg_temp.pair1()).id limit 1), 1, 'a comparação aponta a versão da regra');

-- 2. Inconclusivas não contam: lacre parado há mais de 2 min e lacre impreciso.
select pg_temp.seal('1', 30, 0.002); select pg_temp.mobile((select sid from t1), '1', 4, 25);
select pg_temp.seal('1', 20, 0.002, 80); select pg_temp.mobile((select sid from t1), '1', 5, 15);
select is((select reason from public.proximity_comparisons where pair_id = (pg_temp.pair1()).id order by sequence_ordinal desc limit 1), 'imprecise',
  'lacre com precisão acima do limite: inconclusiva');
select is((pg_temp.pair1()).outside_streak::int, 1, 'inconclusiva não mexe na sequência');
select pg_temp.seal('1', 10, 0.002); select pg_temp.mobile((select sid from t1), '1', 6, 5);
select is((pg_temp.pair1()).outside_streak::int, 2, 'a sequência continua de onde parou');
select is((select count(*)::int from public.proximity_occurrences where pair_id = (pg_temp.pair1()).id), 0, 'duas válidas ainda não confirmam');

-- 3. A terceira válida consecutiva confirma: uma ocorrência e um alerta, sem mudar custódia nem trava.
select pg_temp.mobile((select sid from t1), '1', 7, 2);
select is((select count(*)::int from public.proximity_occurrences where pair_id = (pg_temp.pair1()).id and status = 'open'), 1, 'a terceira confirma');
select is((select detection_kind from public.proximity_occurrences where pair_id = (pg_temp.pair1()).id), 'live', 'detecção em tempo real');
select is((select a.kind || ':' || a.severity || ':' || a.status from public.proximity_occurrences o join public.seal_alerts a on a.id = o.alert_id
  where o.pair_id = (pg_temp.pair1()).id), 'proximity_separation:high:open', 'alerta de afastamento aberto');
select is((select jsonb_typeof(a.context->'latitude') from public.proximity_occurrences o join public.seal_alerts a on a.id = o.alert_id
  where o.pair_id = (pg_temp.pair1()).id), null, 'o alerta não leva coordenada');
select pg_temp.mobile((select sid from t1), '1', 8, 1);
select is((select count(*)::int from public.proximity_occurrences where pair_id = (pg_temp.pair1()).id), 1, 'novas comparações fora não abrem outra ocorrência');
select is((select count(*)::int from public.seal_alerts where device_id = 'd1590000-0000-0000-0000-0000000000a1' and kind = 'proximity_separation'), 1, 'um alerta só');
select is((select custody_status from public.cylinders where id = 'd1510000-0000-0000-0000-0000000000a1'), 'in_transit', 'custódia não muda');
select is((select lock_state from public.seal_devices where id = 'd1590000-0000-0000-0000-0000000000a1'), 'locked', 'trava não muda');
select is((select count(*)::int from public.audit_logs where action = 'tracking.proximity_open' and organization_id = '20000000-0000-0000-0000-00000000000a'
  and metadata::text !~ '(latitude|longitude|point)'), 1, 'abertura auditada sem coordenada');

select is((select (i->>'open_occurrences')::int from jsonb_array_elements(public.list_active_trip_tracking('10000000-0000-0000-0000-000000000002',
  '60000000-0000-0000-0000-0000001530a2', '20000000-0000-0000-0000-00000000000a')->'items') i where i->>'trip_id' = 'd1560000-0000-0000-0000-0000000000a1'), 1,
  'o acompanhamento conta a ocorrência aberta da viagem');

-- 4. Retrospectiva: com a viagem ativa, alerta marcado; com a viagem encerrada, só histórico.
create temporary table t2 as select pg_temp.start('2', '2') as sid;
select pg_temp.seal('2', 700, 0.003); select pg_temp.mobile((select sid from t2), '2', 1, 690);
select pg_temp.seal('2', 640, 0.003); select pg_temp.mobile((select sid from t2), '2', 2, 630);
select pg_temp.seal('2', 580, 0.003); select pg_temp.mobile((select sid from t2), '2', 3, 570);
select is((select o.status || ':' || o.detection_kind || ':' || (o.alert_id is not null) from public.proximity_occurrences o
  join public.proximity_pairs p on p.id = o.pair_id where p.tracking_session_id = (select sid from t2)), 'open:retrospective:true',
  'retrospectiva com a viagem ativa: alerta marcado como atrasado');
select is((select (a.context->>'retrospective')::boolean from public.proximity_occurrences o join public.proximity_pairs p on p.id = o.pair_id
  join public.seal_alerts a on a.id = o.alert_id where p.tracking_session_id = (select sid from t2)), true, 'o alerta diz que é retrospectivo');

-- Viagem 2 encerrada: o par fecha; posições antigas sincronizadas depois só viram histórico, sem alerta.
update public.seal_alerts set status = 'closed', closed_at = now(), closed_by = '10000000-0000-0000-0000-000000000002', close_note = 'Teste encerrado.'
 where device_id = 'd1590000-0000-0000-0000-0000000000a2';
update public.proximity_occurrences set status = 'closed', closed_at = now(), closed_by = '10000000-0000-0000-0000-000000000002', close_note = 'Teste encerrado.'
 where pair_id in (select id from public.proximity_pairs where tracking_session_id = (select sid from t2));
update public.proximity_pairs set outside_streak = 0 where tracking_session_id = (select sid from t2);
update public.trips set status = 'completed', completed_at = now(), completed_by = '10000000-0000-0000-0000-000000000002'
 where id = 'd1560000-0000-0000-0000-0000000000a2';
select is((select status from public.proximity_pairs where tracking_session_id = (select sid from t2)), 'session_ended', 'concluir a viagem encerra o par');
select pg_temp.seal('2', 400, 0.003); select pg_temp.mobile((select sid from t2), '2', 4, 390);
select pg_temp.seal('2', 340, 0.003); select pg_temp.mobile((select sid from t2), '2', 5, 330);
select pg_temp.seal('2', 280, 0.003); select pg_temp.mobile((select sid from t2), '2', 6, 270);
select is((select o.status || ':' || (o.alert_id is null) from public.proximity_occurrences o join public.proximity_pairs p on p.id = o.pair_id
  where p.tracking_session_id = (select sid from t2) and o.status <> 'closed'), 'historical_only:true', 'viagem encerrada: só histórico, sem alerta');

-- 5. Entrega: lida por câmera, registra presença pontual e encerra o par; a avaliação do par para.
insert into public.trip_deliveries (organization_id, stop_id, request_id, delivered_at, recipient_name, results, recorded_by) values
  ('20000000-0000-0000-0000-00000000000a', 'd1570000-0000-0000-0000-0000000000a1', gen_random_uuid(), now(), 'Recebedor Teste',
   jsonb_build_array(jsonb_build_object('item_id', 'd1580000-0000-0000-0000-0000000000a1', 'delivered', true, 'source', 'camera')),
   '10000000-0000-0000-0000-000000000004');
select is((pg_temp.pair1()).status, 'delivered', 'a entrega encerra o par');
select is((select source || ':' || kind from public.proximity_presence_evidences where trip_item_id = 'd1580000-0000-0000-0000-0000000000a1'),
  'camera:in_person_reading', 'leitura por câmera na entrega: presença pontual');
select is((select count(*)::int from public.proximity_comparisons where pair_id = (pg_temp.pair1()).id and evaluated_at > now() - interval '1 second'
  and mobile_position_id in (select id from public.mobile_positions where sequence_no = 9)), 0, 'sem avaliação depois da entrega')
  from (select pg_temp.mobile((select sid from t1), '1', 9, 0)) x;
select is((pg_temp.pair1()).outside_streak::int, 4, 'presença pontual não mexe na sequência');

select * from finish();
rollback;
