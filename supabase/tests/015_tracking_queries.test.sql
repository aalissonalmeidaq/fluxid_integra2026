begin;
select plan(30);

-- Spec 015 (T019; US1, RF-001 a RF-006, RF-036): consultas de acompanhamento `list_active_trip_tracking` e `get_trip_tracking`. Exigem
-- `tracking.read` e sessão; o Tenant B nunca vê a viagem do A (e vice-versa), por id ou por lista; paginação estável por
-- (started_at, id); o aviso em tempo real leva só tipo e viagem, nunca coordenada. Hermético: rollback.

delete from public.user_sessions where user_id in ('10000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000003',
  '10000000-0000-0000-0000-000000000005');
insert into public.membership_roles (membership_id, role_id, assigned_by)
  select '30000000-0000-0000-0000-00000000000b', r.id, '10000000-0000-0000-0000-000000000001'
    from public.roles r where r.organization_id = '20000000-0000-0000-0000-00000000000b' and r.code = 'tenant_admin'
  on conflict do nothing;
select public.start_user_session('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000001510a2', 'aal1');
select public.start_user_session('10000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-0000001510b3', 'aal1');
-- O usuário 5 do Tenant A é operador técnico: sem tracking.read.
select public.start_user_session('10000000-0000-0000-0000-000000000005', '60000000-0000-0000-0000-0000001510a5', 'aal1');

-- Fixtures: no A, duas viagens em andamento (uma com sessão, celular e lacre) e uma planejada; no B, uma em andamento.
insert into public.cylinder_types (id, organization_id, gas, capacity_value, capacity_unit, classification) values
  ('b1500000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', 'Oxigênio', 10, 'l', 'medicinal');
insert into public.cylinders (id, organization_id, cylinder_type_id, serial_number) values
  ('b1510000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-00000000000a', 'b1500000-0000-0000-0000-00000000000a', 'TRK-A-1');
insert into public.vehicles (id, organization_id, plate, vehicle_type, capacity_cylinders) values
  ('b1520000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-00000000000a', 'TRQ1A11', 'truck', 5),
  ('b1520000-0000-0000-0000-0000000000a2', '20000000-0000-0000-0000-00000000000a', 'TRQ1A22', 'truck', 5),
  ('b1520000-0000-0000-0000-0000000000a3', '20000000-0000-0000-0000-00000000000a', 'TRQ1A33', 'truck', 5),
  ('b1520000-0000-0000-0000-0000000000b1', '20000000-0000-0000-0000-00000000000b', 'TRQ1B11', 'truck', 5);
insert into public.drivers (id, organization_id, full_name, cpf_display, cnh_display, cnh_category, cnh_valid_until, linked_user_id) values
  ('b1530000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-00000000000a', 'Motorista Um', 'x', 'x', 'D',
   (now() at time zone 'America/Sao_Paulo')::date + 365, '10000000-0000-0000-0000-000000000004'),
  ('b1530000-0000-0000-0000-0000000000a2', '20000000-0000-0000-0000-00000000000a', 'Motorista Dois', 'x', 'x', 'D',
   (now() at time zone 'America/Sao_Paulo')::date + 365, null),
  ('b1530000-0000-0000-0000-0000000000a3', '20000000-0000-0000-0000-00000000000a', 'Motorista Três', 'x', 'x', 'D',
   (now() at time zone 'America/Sao_Paulo')::date + 365, null),
  ('b1530000-0000-0000-0000-0000000000b1', '20000000-0000-0000-0000-00000000000b', 'Motorista B', 'x', 'x', 'D',
   (now() at time zone 'America/Sao_Paulo')::date + 365, null);
insert into public.customers (id, organization_id, person_type, document_display, legal_name, segment) values
  ('b1540000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-00000000000a', 'legal', '11222333000181', 'Hospital Alfa Ltda', 'hospital');
insert into public.customer_sites (id, organization_id, customer_id, name, postal_code, street, number, city, state) values
  ('b1550000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-00000000000a', 'b1540000-0000-0000-0000-0000000000a1', 'Unidade', '01001000',
   'Praça da Sé', '1', 'São Paulo', 'SP');
insert into public.trips (id, organization_id, number, planned_date, vehicle_id, driver_id, status, started_at, started_by, created_by) values
  ('b1560000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-00000000000a', 9161, (now() at time zone 'America/Sao_Paulo')::date,
   'b1520000-0000-0000-0000-0000000000a1', 'b1530000-0000-0000-0000-0000000000a1', 'in_progress', now() - interval '30 minutes',
   '10000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002'),
  ('b1560000-0000-0000-0000-0000000000a2', '20000000-0000-0000-0000-00000000000a', 9162, (now() at time zone 'America/Sao_Paulo')::date,
   'b1520000-0000-0000-0000-0000000000a2', 'b1530000-0000-0000-0000-0000000000a2', 'in_progress', now() - interval '10 minutes',
   '10000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002'),
  ('b1560000-0000-0000-0000-0000000000b1', '20000000-0000-0000-0000-00000000000b', 9163, (now() at time zone 'America/Sao_Paulo')::date,
   'b1520000-0000-0000-0000-0000000000b1', 'b1530000-0000-0000-0000-0000000000b1', 'in_progress', now() - interval '5 minutes',
   '10000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000003');
insert into public.trips (id, organization_id, number, planned_date, vehicle_id, driver_id, status, created_by) values
  ('b1560000-0000-0000-0000-0000000000a3', '20000000-0000-0000-0000-00000000000a', 9164, (now() at time zone 'America/Sao_Paulo')::date,
   'b1520000-0000-0000-0000-0000000000a3', 'b1530000-0000-0000-0000-0000000000a3', 'planned', '10000000-0000-0000-0000-000000000002');
insert into public.trip_stops (id, organization_id, trip_id, site_id, position) values
  ('b1570000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-00000000000a', 'b1560000-0000-0000-0000-0000000000a1',
   'b1550000-0000-0000-0000-0000000000a1', 1);
insert into public.trip_items (organization_id, trip_id, stop_id, cylinder_id, item_status, lock_status, checked_at, created_by) values
  ('20000000-0000-0000-0000-00000000000a', 'b1560000-0000-0000-0000-0000000000a1', 'b1570000-0000-0000-0000-0000000000a1',
   'b1510000-0000-0000-0000-0000000000a1', 'in_transit', 'locked', now(), '10000000-0000-0000-0000-000000000002');
insert into public.seal_devices (id, organization_id, device_code, label, key_hash, created_by) values
  ('b1580000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-00000000000a', 'DSP-TRK15001', 'Lacre do C1', extensions.digest('k', 'sha256'),
   '10000000-0000-0000-0000-000000000002');
insert into public.seal_bindings (organization_id, device_id, cylinder_id, bound_by, bound_at) values
  ('20000000-0000-0000-0000-00000000000a', 'b1580000-0000-0000-0000-0000000000a1', 'b1510000-0000-0000-0000-0000000000a1',
   '10000000-0000-0000-0000-000000000002', now() - interval '2 hours');
insert into public.seal_positions (organization_id, device_id, cylinder_id, point, accuracy_m, quality, read_at) values
  ('20000000-0000-0000-0000-00000000000a', 'b1580000-0000-0000-0000-0000000000a1', 'b1510000-0000-0000-0000-0000000000a1',
   extensions.st_setsrid(extensions.st_makepoint(-39.310, -7.230), 4326)::extensions.geography, 12, 'gps', now() - interval '3 minutes'),
  ('20000000-0000-0000-0000-00000000000a', 'b1580000-0000-0000-0000-0000000000a1', 'b1510000-0000-0000-0000-0000000000a1',
   extensions.st_setsrid(extensions.st_makepoint(-39.311, -7.231), 4326)::extensions.geography, 9, 'gps', now() - interval '1 minute');
insert into public.tracking_sessions (id, organization_id, trip_id, driver_user_id, device_installation_id, platform, capability, request_id) values
  ('b1590000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-00000000000a', 'b1560000-0000-0000-0000-0000000000a1',
   '10000000-0000-0000-0000-000000000004', 'b15a0000-0000-0000-0000-0000000000a1', 'web_visible', 'foreground_only', gen_random_uuid());
insert into public.mobile_positions (organization_id, client_position_id, tracking_session_id, trip_id, driver_user_id, device_installation_id,
  sequence_no, point, accuracy_m, observed_at, sync_kind, validity) values
  ('20000000-0000-0000-0000-00000000000a', gen_random_uuid(), 'b1590000-0000-0000-0000-0000000000a1', 'b1560000-0000-0000-0000-0000000000a1',
   '10000000-0000-0000-0000-000000000004', 'b15a0000-0000-0000-0000-0000000000a1', 1,
   extensions.st_setsrid(extensions.st_makepoint(-39.312, -7.232), 4326)::extensions.geography, 20, now() - interval '2 minutes', 'live', 'valid'),
  ('20000000-0000-0000-0000-00000000000a', gen_random_uuid(), 'b1590000-0000-0000-0000-0000000000a1', 'b1560000-0000-0000-0000-0000000000a1',
   '10000000-0000-0000-0000-000000000004', 'b15a0000-0000-0000-0000-0000000000a1', 2,
   extensions.st_setsrid(extensions.st_makepoint(-39.313, -7.233), 4326)::extensions.geography, 15, now() - interval '30 seconds', 'live', 'valid');

create function pg_temp.list(p_user text, p_session text, p_org text, p_extra text default '') returns jsonb language plpgsql as $$
declare v jsonb;
begin
  execute format('select public.list_active_trip_tracking(%L, %L, %L%s)', '10000000-0000-0000-0000-00000000000' || p_user,
    '60000000-0000-0000-0000-0000001510' || p_session, '20000000-0000-0000-0000-00000000000' || p_org, p_extra) into v;
  return v;
end $$;
create function pg_temp.get(p_user text, p_session text, p_org text, p_trip uuid) returns jsonb language sql as $$
  select public.get_trip_tracking(('10000000-0000-0000-0000-00000000000' || p_user)::uuid, ('60000000-0000-0000-0000-0000001510' || p_session)::uuid,
    ('20000000-0000-0000-0000-00000000000' || p_org)::uuid, p_trip)
$$;

-- 1. Fronteira: só service_role executa; permissão e sessão conferidas.
select ok(not has_function_privilege('authenticated', 'public.list_active_trip_tracking(uuid, uuid, uuid, uuid, uuid, uuid, timestamptz, uuid, integer)', 'execute'),
  'authenticated não chama list_active_trip_tracking');
select ok(has_function_privilege('service_role', 'public.get_trip_tracking(uuid, uuid, uuid, uuid)', 'execute'), 'service_role chama get_trip_tracking');
select is(pg_temp.list('5', 'a5', 'a')->>'code', 'ACCESS_DENIED', 'sem tracking.read: negado');
select is(public.list_active_trip_tracking('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000001510ff',
  '20000000-0000-0000-0000-00000000000a')->>'code', 'AUTH_REQUIRED', 'sem sessão: AUTH_REQUIRED');
select is(pg_temp.list('2', 'a2', 'b')->>'code', 'ACCESS_DENIED', 'admin A pedindo o B: negado');

-- 2. Lista do A: só as viagens em andamento do A, mais recentes primeiro, com regra vigente.
select is(pg_temp.list('2', 'a2', 'a')->>'code', 'LISTED', 'admin A lista');
select is((select jsonb_agg(i->>'trip_id') from jsonb_array_elements(pg_temp.list('2', 'a2', 'a')->'items') i),
  '["b1560000-0000-0000-0000-0000000000a2", "b1560000-0000-0000-0000-0000000000a1"]'::jsonb, 'só as em andamento do A, por início decrescente');
select is((pg_temp.list('2', 'a2', 'a')->'rule'->>'distance_m')::numeric, 100::numeric, 'a lista traz a regra vigente');
select ok(pg_temp.list('2', 'a2', 'a')->>'generated_at' is not null, 'a lista traz o instante de geração');
select is((select jsonb_agg(i->>'trip_id') from jsonb_array_elements(pg_temp.list('3', 'b3', 'b')->'items') i),
  '["b1560000-0000-0000-0000-0000000000b1"]'::jsonb, 'admin B vê só a do B');

-- 3. Conteúdo de uma linha: celular e lacre com origem, instante, precisão e a sessão degradada.
create temporary table row_a1 as select i as row from jsonb_array_elements(pg_temp.list('2', 'a2', 'a')->'items') i
  where i->>'trip_id' = 'b1560000-0000-0000-0000-0000000000a1';
select is((select row->'mobile'->>'accuracy_m' from row_a1)::numeric, 15::numeric, 'celular: a posição mais recente');
select ok((select (row->'mobile'->>'observed_at')::timestamptz < (row->'mobile'->>'received_at')::timestamptz from row_a1), 'celular: observado e recebido separados');
select is((select row->'session'->>'capability' from row_a1), 'foreground_only', 'sessão: capacidade reduzida informada');
select ok((select row->'session'->>'capability_changed_at' from row_a1) is not null, 'sessão: desde quando');
select is((select jsonb_array_length(row->'seals') from row_a1), 1, 'um lacre na carga');
select is((select row->'seals'->0->>'serial_number' from row_a1), 'TRK-A-1', 'lacre: cilindro identificado');
select is((select (row->'seals'->0->'position'->>'accuracy_m')::numeric from row_a1), 9::numeric, 'lacre: a posição mais recente');
select is((select row->'driver'->>'name' from row_a1), 'Motorista Um', 'motorista identificado');
select is((select jsonb_typeof(row->'mobile'->'latitude') from row_a1), 'number', 'coordenadas só para quem tem tracking.read, para o mapa');
select is((select row->'session' from jsonb_array_elements(pg_temp.list('2', 'a2', 'a')->'items') i(row)
  where row->>'trip_id' = 'b1560000-0000-0000-0000-0000000000a2'), 'null'::jsonb, 'viagem sem sessão: sessão nula, sem posição inventada');

-- 4. Filtros e cursor estável.
select is((select jsonb_agg(i->>'trip_id') from jsonb_array_elements(pg_temp.list('2', 'a2', 'a',
  ', p_vehicle => ''b1520000-0000-0000-0000-0000000000a1''')->'items') i), '["b1560000-0000-0000-0000-0000000000a1"]'::jsonb, 'filtro por veículo');
select is(jsonb_array_length(pg_temp.list('2', 'a2', 'a', ', p_limit => 1')->'items'), 1, 'limite respeitado');
select is((select jsonb_agg(i->>'trip_id') from jsonb_array_elements(pg_temp.list('2', 'a2', 'a', format(', p_cursor_at => %L, p_cursor_id => %L',
  pg_temp.list('2', 'a2', 'a', ', p_limit => 1')->'next_cursor'->>'at', pg_temp.list('2', 'a2', 'a', ', p_limit => 1')->'next_cursor'->>'id'))->'items') i),
  '["b1560000-0000-0000-0000-0000000000a1"]'::jsonb, 'a próxima página continua sem repetir');
select is(pg_temp.list('2', 'a2', 'a')->'next_cursor', 'null'::jsonb, 'última página sem cursor');

-- 5. Detalhe: trilha recente das origens e isolamento por id.
select is(pg_temp.get('2', 'a2', 'a', 'b1560000-0000-0000-0000-0000000000a1')->>'code', 'FOUND', 'admin A abre a viagem do A');
select is(jsonb_array_length(pg_temp.get('2', 'a2', 'a', 'b1560000-0000-0000-0000-0000000000a1')->'recent'->'mobile'), 2, 'trilha recente do celular');
select is(jsonb_array_length(pg_temp.get('2', 'a2', 'a', 'b1560000-0000-0000-0000-0000000000a1')->'recent'->'seals'->0->'positions'), 2,
  'trilha recente do lacre');
select is(pg_temp.get('2', 'a2', 'a', 'b1560000-0000-0000-0000-0000000000b1')->>'code', 'NOT_FOUND', 'viagem do B pelo A: inexistente');
select is(pg_temp.get('3', 'b3', 'b', 'b1560000-0000-0000-0000-0000000000a1')->>'code', 'NOT_FOUND', 'viagem do A pelo B: inexistente');

-- 6. Aviso em tempo real: nova posição do celular avisa o canal da empresa, sem coordenada.
insert into public.mobile_positions (organization_id, client_position_id, tracking_session_id, trip_id, driver_user_id, device_installation_id,
  sequence_no, point, accuracy_m, observed_at, sync_kind, validity) values
  ('20000000-0000-0000-0000-00000000000a', gen_random_uuid(), 'b1590000-0000-0000-0000-0000000000a1', 'b1560000-0000-0000-0000-0000000000a1',
   '10000000-0000-0000-0000-000000000004', 'b15a0000-0000-0000-0000-0000000000a1', 3,
   extensions.st_setsrid(extensions.st_makepoint(-39.314, -7.234), 4326)::extensions.geography, 15, now(), 'live', 'valid');
select is((select payload - 'id' from realtime.messages where topic = 'tracking:20000000-0000-0000-0000-00000000000a' order by inserted_at desc limit 1),
  '{"kind": "position", "trip_id": "b1560000-0000-0000-0000-0000000000a1"}'::jsonb, 'aviso só com tipo e viagem, sem coordenada');

select * from finish();
rollback;
