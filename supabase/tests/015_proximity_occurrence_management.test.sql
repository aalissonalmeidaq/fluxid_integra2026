begin;
select plan(32);

-- Spec 015 (T063; US4, RF-022, RF-023, RF-015, CS-008): consultar, reconhecer e encerrar a ocorrência de afastamento. Exige a permissão
-- de operar alertas (`seal.operate`); versão otimista; nota obrigatória no encerramento; idempotência por pedido; auditoria sem
-- coordenadas; o alerta do lacre acompanha (e o tratamento pelo alerta acompanha a ocorrência); custódia e trava não mudam; ocorrência
-- só histórica não é tratável. Dois tenants. Hermético: rollback.

delete from public.user_sessions where user_id in ('10000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000003',
  '10000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000005');
insert into public.membership_roles (membership_id, role_id, assigned_by)
  select '30000000-0000-0000-0000-00000000000b', r.id, '10000000-0000-0000-0000-000000000001'
    from public.roles r where r.organization_id = '20000000-0000-0000-0000-00000000000b' and r.code = 'tenant_admin'
  on conflict do nothing;
-- O usuário 5 vira auditor no A: consulta, mas não opera alertas.
delete from public.membership_roles where membership_id = '30000000-0000-0000-0000-000000000005';
insert into public.membership_roles (membership_id, role_id, assigned_by)
  select '30000000-0000-0000-0000-000000000005', r.id, '10000000-0000-0000-0000-000000000001'
    from public.roles r where r.organization_id = '20000000-0000-0000-0000-00000000000a' and r.code = 'tenant_auditor';
select public.start_user_session('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000001560a2', 'aal1');
select public.start_user_session('10000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-0000001560b3', 'aal1');
select public.start_user_session('10000000-0000-0000-0000-000000000004', '60000000-0000-0000-0000-0000001560a4', 'aal1');
select public.start_user_session('10000000-0000-0000-0000-000000000005', '60000000-0000-0000-0000-0000001560a5', 'aal1');

insert into public.cylinder_types (id, organization_id, gas, capacity_value, capacity_unit, classification) values
  ('f1500000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', 'Oxigênio', 10, 'l', 'medicinal');
insert into public.cylinders (id, organization_id, cylinder_type_id, serial_number, custody_status) values
  ('f1510000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-00000000000a', 'f1500000-0000-0000-0000-00000000000a', 'OCC-A-1', 'in_transit'),
  ('f1510000-0000-0000-0000-0000000000a2', '20000000-0000-0000-0000-00000000000a', 'f1500000-0000-0000-0000-00000000000a', 'OCC-A-2', 'in_transit');
insert into public.vehicles (id, organization_id, plate, vehicle_type, capacity_cylinders) values
  ('f1520000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-00000000000a', 'OCC1A11', 'truck', 5);
insert into public.drivers (id, organization_id, full_name, cpf_display, cnh_display, cnh_category, cnh_valid_until, linked_user_id) values
  ('f1530000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-00000000000a', 'Motorista Quatro', 'x', 'x', 'D',
   (now() at time zone 'America/Sao_Paulo')::date + 365, '10000000-0000-0000-0000-000000000004');
insert into public.customers (id, organization_id, person_type, document_display, legal_name, segment) values
  ('f1540000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-00000000000a', 'legal', '11222333000181', 'Hospital Alfa Ltda', 'hospital');
insert into public.customer_sites (id, organization_id, customer_id, name, postal_code, street, number, city, state) values
  ('f1550000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-00000000000a', 'f1540000-0000-0000-0000-0000000000a1', 'Unidade', '01001000',
   'Praça da Sé', '1', 'São Paulo', 'SP');
insert into public.trips (id, organization_id, number, planned_date, vehicle_id, driver_id, status, started_at, started_by, created_by) values
  ('f1560000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-00000000000a', 9201, (now() at time zone 'America/Sao_Paulo')::date,
   'f1520000-0000-0000-0000-0000000000a1', 'f1530000-0000-0000-0000-0000000000a1', 'in_progress', now() - interval '2 hours',
   '10000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002');
insert into public.trip_stops (id, organization_id, trip_id, site_id, position) values
  ('f1570000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-00000000000a', 'f1560000-0000-0000-0000-0000000000a1', 'f1550000-0000-0000-0000-0000000000a1', 1);
insert into public.trip_items (id, organization_id, trip_id, stop_id, cylinder_id, item_status, lock_status, checked_at, created_by) values
  ('f1580000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-00000000000a', 'f1560000-0000-0000-0000-0000000000a1', 'f1570000-0000-0000-0000-0000000000a1',
   'f1510000-0000-0000-0000-0000000000a1', 'in_transit', 'locked', now(), '10000000-0000-0000-0000-000000000002'),
  ('f1580000-0000-0000-0000-0000000000a2', '20000000-0000-0000-0000-00000000000a', 'f1560000-0000-0000-0000-0000000000a1', 'f1570000-0000-0000-0000-0000000000a1',
   'f1510000-0000-0000-0000-0000000000a2', 'in_transit', 'locked', now(), '10000000-0000-0000-0000-000000000002');
insert into public.seal_devices (id, organization_id, device_code, label, key_hash, created_by, lock_state) values
  ('f1590000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-00000000000a', 'DSP-OCC15001', 'Lacre O1', extensions.digest('k1', 'sha256'),
   '10000000-0000-0000-0000-000000000002', 'locked'),
  ('f1590000-0000-0000-0000-0000000000a2', '20000000-0000-0000-0000-00000000000a', 'DSP-OCC15002', 'Lacre O2', extensions.digest('k2', 'sha256'),
   '10000000-0000-0000-0000-000000000002', 'locked');
insert into public.seal_bindings (organization_id, device_id, cylinder_id, bound_by, bound_at) values
  ('20000000-0000-0000-0000-00000000000a', 'f1590000-0000-0000-0000-0000000000a1', 'f1510000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-000000000002', now() - interval '3 hours'),
  ('20000000-0000-0000-0000-00000000000a', 'f1590000-0000-0000-0000-0000000000a2', 'f1510000-0000-0000-0000-0000000000a2', '10000000-0000-0000-0000-000000000002', now() - interval '3 hours');

-- Os dois lacres longe do celular em três ciclos: duas ocorrências abertas, cada uma com alerta.
create function pg_temp.cycle(p_seq integer, p_seconds_ago integer) returns void language plpgsql as $$
begin
  insert into public.seal_positions (organization_id, device_id, cylinder_id, point, accuracy_m, quality, read_at, last_seen_at)
  select '20000000-0000-0000-0000-00000000000a', d, c, extensions.st_setsrid(extensions.st_makepoint(-39.31, -7.227), 4326)::extensions.geography, 8, 'gps',
         now() - make_interval(secs => p_seconds_ago + 5), now() - make_interval(secs => p_seconds_ago + 5)
    from (values ('f1590000-0000-0000-0000-0000000000a1'::uuid, 'f1510000-0000-0000-0000-0000000000a1'::uuid),
                 ('f1590000-0000-0000-0000-0000000000a2'::uuid, 'f1510000-0000-0000-0000-0000000000a2'::uuid)) v(d, c);
  perform public.ingest_driver_positions('10000000-0000-0000-0000-000000000004', '60000000-0000-0000-0000-0000001560a4', '20000000-0000-0000-0000-00000000000a',
    gen_random_uuid(), (select sid from s), 'f15b0000-0000-0000-0000-0000000000a1',
    jsonb_build_array(jsonb_build_object('client_position_id', gen_random_uuid(), 'sequence_no', p_seq,
      'observed_at', now() - make_interval(secs => p_seconds_ago), 'latitude', -7.23, 'longitude', -39.31, 'accuracy_m', 10)));
end $$;
create temporary table s as select (public.start_tracking_session('10000000-0000-0000-0000-000000000004', '60000000-0000-0000-0000-0000001560a4',
  '20000000-0000-0000-0000-00000000000a', gen_random_uuid(), 'f1560000-0000-0000-0000-0000000000a1', 'f15b0000-0000-0000-0000-0000000000a1',
  'android_native', 'full', false)->'session'->>'id')::uuid as sid;
select pg_temp.cycle(1, 180); select pg_temp.cycle(2, 120); select pg_temp.cycle(3, 60);
create temporary table occ as select o.id, o.device_id, o.alert_id from public.proximity_occurrences o
  where o.trip_id = 'f1560000-0000-0000-0000-0000000000a1' order by o.device_id;

create function pg_temp.ack(p_user text, p_session text, p_org text, p_occ uuid, p_version bigint, p_request uuid default gen_random_uuid()) returns jsonb language sql as $$
  select public.acknowledge_proximity_occurrence(('10000000-0000-0000-0000-00000000000' || p_user)::uuid, ('60000000-0000-0000-0000-0000001560' || p_session)::uuid,
    ('20000000-0000-0000-0000-00000000000' || p_org)::uuid, p_request, p_occ, p_version)
$$;
create function pg_temp.close(p_user text, p_session text, p_org text, p_occ uuid, p_version bigint, p_note text, p_request uuid default gen_random_uuid()) returns jsonb language sql as $$
  select public.close_proximity_occurrence(('10000000-0000-0000-0000-00000000000' || p_user)::uuid, ('60000000-0000-0000-0000-0000001560' || p_session)::uuid,
    ('20000000-0000-0000-0000-00000000000' || p_org)::uuid, p_request, p_occ, p_version, p_note)
$$;
create function pg_temp.first() returns uuid language sql as $$ select id from occ order by device_id limit 1 $$;
create function pg_temp.second() returns uuid language sql as $$ select id from occ order by device_id desc limit 1 $$;

select is((select count(*)::int from occ), 2, 'duas ocorrências abertas para tratar');

-- 1. Consulta da ocorrência com as evidências.
create temporary table g as select public.get_proximity_occurrence('10000000-0000-0000-0000-000000000005', '60000000-0000-0000-0000-0000001560a5',
  '20000000-0000-0000-0000-00000000000a', pg_temp.first()) as r;
select is((select r->>'code' from g), 'FOUND', 'o auditor consulta a ocorrência');
select is((select r->'occurrence'->>'status' from g), 'open', 'aberta');
select is((select (r->'occurrence'->>'version')::int from g), 1, 'versão 1');
select is((select r->'occurrence'->>'serial_number' from g), 'OCC-A-1', 'cilindro identificado');
select is((select jsonb_array_length(r->'evidences') from g), 3, 'as três comparações que confirmaram');
select is((select jsonb_typeof(r->'evidences'->0->'distance_m') from g), 'number', 'evidência com a distância, sem coordenada');
select is((select count(*)::int from g, jsonb_array_elements(r->'evidences') e where e ? 'latitude'), 0, 'nenhuma coordenada nas evidências');
select is(public.get_proximity_occurrence('10000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-0000001560b3',
  '20000000-0000-0000-0000-00000000000b', pg_temp.first())->>'code', 'NOT_FOUND', 'ocorrência do A pelo B: inexistente');

select is((select (public.get_alert('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000001560a2', '20000000-0000-0000-0000-00000000000a',
  (select alert_id from occ where id = pg_temp.first()))->'alert'->>'occurrence_id')), pg_temp.first()::text, 'o alerta aponta a ocorrência');

-- 2. Autorização e validação.
select ok(not has_function_privilege('authenticated', 'public.close_proximity_occurrence(uuid, uuid, uuid, uuid, uuid, bigint, text)', 'execute'),
  'authenticated não encerra direto');
select is(pg_temp.ack('5', 'a5', 'a', pg_temp.first(), 1)->>'code', 'ACCESS_DENIED', 'auditor não reconhece');
select is(pg_temp.ack('2', 'a2', 'a', pg_temp.first(), 7)->>'code', 'VERSION_CONFLICT', 'versão antiga recusada');
select is(pg_temp.close('2', 'a2', 'a', pg_temp.first(), 1, 'ok')->>'code', 'NOTE_REQUIRED', 'nota curta recusada');

-- 3. Reconhecer: responsável e horário, sem encerrar; o alerta acompanha; idempotente.
select is(pg_temp.ack('2', 'a2', 'a', pg_temp.first(), 1, 'f15c0000-0000-0000-0000-000000000001')->>'code', 'ACKNOWLEDGED', 'admin reconhece');
select is(pg_temp.ack('2', 'a2', 'a', pg_temp.first(), 1, 'f15c0000-0000-0000-0000-000000000001')->>'code', 'ACKNOWLEDGED', 'repetir o pedido não duplica');
select is((select status || ':' || version || ':' || (acknowledged_by = '10000000-0000-0000-0000-000000000002') from public.proximity_occurrences
  where id = pg_temp.first()), 'acknowledged:2:true', 'reconhecida, versão 2, com o responsável');
select is((select a.status from public.seal_alerts a join occ on occ.alert_id = a.id where occ.id = pg_temp.first()), 'acknowledged', 'o alerta acompanha');
select is((select count(*)::int from public.audit_logs where action = 'tracking.occurrence_acknowledge' and target_id = pg_temp.first()::text), 1,
  'reconhecimento auditado uma vez');

-- 4. Encerrar com nota: auditado sem coordenada, alerta fechado, histórico original intacto, custódia e trava iguais.
select is(pg_temp.close('2', 'a2', 'a', pg_temp.first(), 2, 'Motorista parou para abastecer; carga conferida.')->>'code', 'CLOSED', 'admin encerra com nota');
select is((select status || ':' || close_note from public.proximity_occurrences where id = pg_temp.first()),
  'closed:Motorista parou para abastecer; carga conferida.', 'encerrada com a nota');
select is((select a.status from public.seal_alerts a join occ on occ.alert_id = a.id where occ.id = pg_temp.first()), 'closed', 'o alerta fecha junto');
select ok((select metadata::text !~ '(latitude|longitude|point)' and justification = 'Motorista parou para abastecer; carga conferida.'
  from public.audit_logs where action = 'tracking.occurrence_close' and target_id = pg_temp.first()::text), 'encerramento auditado com a nota, sem coordenada');
select is((select count(*)::int from public.proximity_comparisons pc join public.proximity_occurrences o on o.pair_id = pc.pair_id where o.id = pg_temp.first()), 3,
  'as comparações originais continuam');
select is((select custody_status || ':' || (select lock_state from public.seal_devices where id = 'f1590000-0000-0000-0000-0000000000a1')
  from public.cylinders where id = 'f1510000-0000-0000-0000-0000000000a1'), 'in_transit:locked', 'custódia e trava não mudam');

select is((select count(*)::int from public.audit_logs where action = 'tracking.occurrence_close' and target_id = pg_temp.first()::text), 1,
  'encerramento pela ocorrência auditado uma vez');

-- 5. Tratar pelo alerta (tela de alertas da Spec 012) acompanha a ocorrência e também audita a ocorrência (RF-023; validação humana de
-- 27/10/2026: reconhecer pela tela de alertas não deixava registro).
select public.acknowledge_alert('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000001560a2', '20000000-0000-0000-0000-00000000000a',
  gen_random_uuid(), (select alert_id from occ where id = pg_temp.second()));
select is((select status from public.proximity_occurrences where id = pg_temp.second()), 'acknowledged', 'reconhecer o alerta reconhece a ocorrência');
select is((select count(*)::int from public.audit_logs where action = 'tracking.occurrence_acknowledge' and target_id = pg_temp.second()::text
  and actor_user_id = '10000000-0000-0000-0000-000000000002'), 1, 'reconhecimento pela tela de alertas auditado na ocorrência, com o responsável');
select public.close_alert('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000001560a2', '20000000-0000-0000-0000-00000000000a',
  gen_random_uuid(), (select alert_id from occ where id = pg_temp.second()), 'Encerrado pela tela de alertas.');
select is((select status || ':' || close_note from public.proximity_occurrences where id = pg_temp.second()), 'closed:Encerrado pela tela de alertas.',
  'encerrar o alerta encerra a ocorrência');
select is((select count(*)::int from public.audit_logs where action = 'tracking.occurrence_close' and target_id = pg_temp.second()::text
  and actor_user_id = '10000000-0000-0000-0000-000000000002' and metadata::text !~ '(latitude|longitude|point)'), 1,
  'encerramento pela tela de alertas auditado na ocorrência, sem coordenada');
select is((select count(*)::int from public.audit_logs where action like 'tracking.occurrence_%' and target_id = pg_temp.first()::text), 2,
  'pela ocorrência: um registro de reconhecimento e um de encerramento, sem duplicar pelo alerta');
select is(pg_temp.ack('2', 'a2', 'a', pg_temp.second(), 2)->>'code', 'INVALID_TRANSITION', 'ocorrência encerrada não volta a ser reconhecida');

select * from finish();
rollback;
