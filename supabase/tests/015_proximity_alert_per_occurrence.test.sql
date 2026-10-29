begin;
select plan(9);

-- Spec 015 (T132; RF-014, RF-015; decisão da pessoa responsável em 28/10/2026): cada afastamento confirmado abre o próprio alerta. A regra
-- da Spec 012 de um alerta aberto por lacre e tipo continua para os alertas do lacre; no afastamento, a própria ocorrência já impede
-- duplicata (uma aberta por par). Antes, um alerta antigo ainda aberto ou reconhecido do mesmo lacre absorvia a ocorrência nova: sem push,
-- com o estado do antigo, e fechar um fechava as duas. Hermético: rollback.

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


-- Um alerta de afastamento antigo do mesmo lacre, já reconhecido e ainda não encerrado (de outra viagem).
insert into public.seal_alerts (id, organization_id, device_id, cylinder_id, kind, severity, source, context, requires_push, status, acknowledged_at,
  acknowledged_by) values
  ('d15f0000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-00000000000a', 'd1590000-0000-0000-0000-0000000000a1',
   'd1510000-0000-0000-0000-0000000000a1', 'proximity_separation', 'high', 'system', '{"occurrence_id": "d15e0000-0000-0000-0000-0000000000a1"}',
   true, 'acknowledged', now() - interval '1 day', '10000000-0000-0000-0000-000000000002');
insert into public.push_subscriptions (id, organization_id, user_id, endpoint, p256dh, auth_secret) values
  ('d15d0000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-000000000002',
   'https://push.example.invalid/prx', 'p', 'a');

-- Três comparações fora confirmam um afastamento novo.
select pg_temp.seal('1', 60, 0.002); select pg_temp.mobile((select sid from t1), '1', 1, 55);
select pg_temp.seal('1', 50, 0.002); select pg_temp.mobile((select sid from t1), '1', 2, 45);
select pg_temp.seal('1', 40, 0.002); select pg_temp.mobile((select sid from t1), '1', 3, 35);
create temporary table nova as select o.* from public.proximity_occurrences o where o.pair_id = (pg_temp.pair1()).id;

select is((select count(*)::int from nova), 1, 'o afastamento novo é confirmado');
select isnt((select alert_id from nova), 'd15f0000-0000-0000-0000-0000000000a1'::uuid, 'com um alerta próprio, não o antigo');
select is((select status || ':' || (context->>'occurrence_id') from public.seal_alerts where id = (select alert_id from nova)),
  'open:' || (select id from nova), 'o alerta novo está aberto e aponta a ocorrência nova');
select is((select status || ':' || (context->>'occurrence_id') from public.seal_alerts where id = 'd15f0000-0000-0000-0000-0000000000a1'),
  'acknowledged:d15e0000-0000-0000-0000-0000000000a1', 'o antigo segue como estava, sem misturar contexto');
select is((select count(*)::int from public.push_outbox where alert_id = (select alert_id from nova) and kind = 'opened'), 1,
  'o afastamento novo gera push');

-- Encerrar o alerta novo leva só a ocorrência nova.
update public.seal_alerts set status = 'closed', closed_at = now(), closed_by = '10000000-0000-0000-0000-000000000002', close_note = 'Conferido.'
 where id = (select alert_id from nova);
select is((select status from public.proximity_occurrences where id = (select id from nova)), 'closed', 'fechar o alerta novo fecha a ocorrência nova');
select is((select status from public.seal_alerts where id = 'd15f0000-0000-0000-0000-0000000000a1'), 'acknowledged', 'e não mexe no antigo');

-- Os alertas do lacre continuam sem duplicar (Spec 012).
select is(private.open_seal_alert('d1590000-0000-0000-0000-0000000000a1', 'seal_broken', 'critical', 'device', '{}', true),
  private.open_seal_alert('d1590000-0000-0000-0000-0000000000a1', 'seal_broken', 'critical', 'device', '{"n": 2}', true), 'violação do lacre: um alerta aberto só');
select throws_ok($$insert into public.seal_alerts (organization_id, device_id, cylinder_id, kind, severity, source, context, requires_push) values
  ('20000000-0000-0000-0000-00000000000a', 'd1590000-0000-0000-0000-0000000000a1', 'd1510000-0000-0000-0000-0000000000a1', 'proximity_separation', 'high',
   'system', (select jsonb_build_object('occurrence_id', id) from nova), true)$$, '23505', null, 'um alerta por ocorrência, nunca dois');

select * from finish();
rollback;
