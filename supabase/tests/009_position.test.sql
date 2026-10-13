begin;
select plan(51);

-- Spec 009, US2: posição por GPS na chegada e na entrega (RF-009 a RF-015, RF-017, RN-003, CA-001). Hermético: desfeito pelo rollback.
-- O Tenant B, o auditor e o motorista provam o isolamento e as permissões. As coordenadas nunca vão ao evento nem à auditoria.

delete from public.user_sessions where user_id in (
  '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000003');
insert into public.membership_roles (membership_id, role_id, assigned_by)
  select '30000000-0000-0000-0000-00000000000b', r.id, '10000000-0000-0000-0000-000000000001' from public.roles r where r.organization_id = '20000000-0000-0000-0000-00000000000b' and r.code = 'tenant_admin'
  on conflict do nothing;
select public.start_user_session('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000900a2', 'aal1');
select public.start_user_session('10000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-0000000900b3', 'aal1');

insert into auth.users (id, aud, role, email) values
  ('10000000-0000-0000-0000-0000000009c1', 'authenticated', 'authenticated', 'pos-driver@example.invalid'),
  ('10000000-0000-0000-0000-0000000009d1', 'authenticated', 'authenticated', 'pos-auditor@example.invalid');
insert into public.profiles (user_id, display_name) values ('10000000-0000-0000-0000-0000000009c1', 'Motorista Posição'), ('10000000-0000-0000-0000-0000000009d1', 'Auditor Posição');
insert into public.memberships (id, organization_id, user_id, status, activated_at) values
  ('30000000-0000-0000-0000-0000000009c1', '20000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-0000000009c1', 'active', now()),
  ('30000000-0000-0000-0000-0000000009d1', '20000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-0000000009d1', 'active', now());
insert into public.membership_roles (membership_id, role_id, assigned_by)
  select '30000000-0000-0000-0000-0000000009c1', r.id, '10000000-0000-0000-0000-000000000001' from public.roles r where r.organization_id = '20000000-0000-0000-0000-00000000000a' and r.code = 'driver';
insert into public.membership_roles (membership_id, role_id, assigned_by)
  select '30000000-0000-0000-0000-0000000009d1', r.id, '10000000-0000-0000-0000-000000000001' from public.roles r where r.organization_id = '20000000-0000-0000-0000-00000000000a' and r.code = 'tenant_auditor';
select public.start_user_session('10000000-0000-0000-0000-0000000009c1', '60000000-0000-0000-0000-0000000900c1', 'aal1');
select public.start_user_session('10000000-0000-0000-0000-0000000009d1', '60000000-0000-0000-0000-0000000900d1', 'aal1');

insert into public.customers (id, organization_id, person_type, document_display, legal_name, segment) values
  ('91000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', 'legal', '11222333000181', 'Hospital Alfa Ltda', 'hospital');
insert into public.customer_sites (id, organization_id, customer_id, name, postal_code, street, number, city, state)
  select ('92000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid, '20000000-0000-0000-0000-00000000000a', '91000000-0000-0000-0000-00000000000a', 'Unidade ' || n, '01001000', 'Praça da Sé', n::text, 'São Paulo', 'SP' from generate_series(1, 6) n;
insert into public.vehicles (id, organization_id, plate, vehicle_type, capacity_cylinders)
  select ('95000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid, '20000000-0000-0000-0000-00000000000a', 'POS' || (3000 + n), 'truck', 20 from generate_series(1, 3) n;
insert into public.drivers (id, organization_id, full_name, cpf_display, cnh_display, cnh_category, cnh_valid_until)
  select ('96000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid, '20000000-0000-0000-0000-00000000000a', 'Motorista ' || n, 'x' || n, 'y' || n, 'D', (now() at time zone 'America/Sao_Paulo')::date + 365 from generate_series(1, 3) n;
insert into public.cylinder_types (id, organization_id, gas, capacity_value, capacity_unit, classification) values
  ('97000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', 'Oxigênio', 10, 'l', 'medicinal');
insert into public.cylinders (id, organization_id, cylinder_type_id, serial_number, stock_status, hydro_last_result, hydro_next_due_on)
  select ('98000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid, '20000000-0000-0000-0000-00000000000a', '97000000-0000-0000-0000-00000000000a', 'POS-' || lpad(n::text, 3, '0'), 'in_stock', 'approved', (now() at time zone 'America/Sao_Paulo')::date + 200
    from generate_series(1, 16) n;
-- Geocerca circular de 200 m na unidade 1.
insert into public.geofences (id, organization_id, site_id, name, shape, center, radius_m, area) values
  ('94000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-00000000000a', '92000000-0000-0000-0000-000000000001', 'Geocerca da unidade 1', 'circle',
   extensions.st_point(-46.633, -23.55)::extensions.geography, 200, extensions.st_buffer(extensions.st_point(-46.633, -23.55)::extensions.geography, 210)::extensions.geography);

create function pg_temp.cy(n integer) returns uuid language sql as $$ select ('98000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid $$;
create function pg_temp.ver(p_trip uuid) returns bigint language sql as $$ select version from public.trips where id = p_trip $$;
-- Viagem em andamento com uma parada por cilindro (cada parada em uma unidade), como administrador do A.
create function pg_temp.sail(p_unit integer, p_cyls integer[]) returns uuid language plpgsql as $$
declare
  u constant uuid := '10000000-0000-0000-0000-000000000002'; s constant uuid := '60000000-0000-0000-0000-0000000900a2'; o constant uuid := '20000000-0000-0000-0000-00000000000a';
  t uuid; c integer;
begin
  t := (public.create_trip(u, s, o, gen_random_uuid(), (now() at time zone 'America/Sao_Paulo')::date, ('95000000-0000-0000-0000-' || lpad(p_unit::text, 12, '0'))::uuid, ('96000000-0000-0000-0000-' || lpad(p_unit::text, 12, '0'))::uuid, null,
    (select jsonb_agg(jsonb_build_object('site_id', ('92000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid, 'cylinder_ids', jsonb_build_array(pg_temp.cy(x.cyl)))) from unnest(p_cyls) with ordinality as x(cyl, n))) ->> 'trip_id')::uuid;
  perform public.start_loading(u, s, o, gen_random_uuid(), t, pg_temp.ver(t));
  foreach c in array p_cyls loop
    perform public.check_item(u, s, o, gen_random_uuid(), t, (select id from public.trip_items where trip_id = t and cylinder_id = pg_temp.cy(c)));
  end loop;
  perform public.start_trip(u, s, o, gen_random_uuid(), t, pg_temp.ver(t));
  return t;
end $$;
create function pg_temp.stop_id(p_trip uuid, p_pos integer) returns uuid language sql as $$ select id from public.trip_stops where trip_id = p_trip and position = p_pos $$;
create function pg_temp.item(p_trip uuid, p_cyl integer) returns uuid language sql as $$ select id from public.trip_items where trip_id = p_trip and cylinder_id = pg_temp.cy(p_cyl) $$;
create function pg_temp.arrive(p_trip uuid, p_pos integer, p_lat numeric default null, p_lon numeric default null, p_acc numeric default null, p_src text default null, p_read timestamptz default null,
  p_user uuid default '10000000-0000-0000-0000-000000000002', p_session uuid default '60000000-0000-0000-0000-0000000900a2', p_org uuid default '20000000-0000-0000-0000-00000000000a') returns jsonb language sql as $$
  select public.arrive_stop(p_user, p_session, p_org, gen_random_uuid(), p_trip, pg_temp.stop_id(p_trip, p_pos), null, p_lat, p_lon, p_acc, p_src, p_read)
$$;
create function pg_temp.deliver(p_trip uuid, p_pos integer, p_cyl integer, p_lat numeric default null, p_lon numeric default null, p_site boolean default false, p_acc numeric default null,
  p_src text default null, p_read timestamptz default null) returns jsonb language sql as $$
  select public.register_delivery('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000900a2', '20000000-0000-0000-0000-00000000000a', gen_random_uuid(), p_trip,
    pg_temp.stop_id(p_trip, p_pos), now() - interval '1 minute', 'Recebedor Fictício', null, p_lat, p_lon, p_site,
    jsonb_build_array(jsonb_build_object('item_id', pg_temp.item(p_trip, p_cyl), 'delivered', true)), null, null, p_acc, p_src, p_read)
$$;

create temp table t_arrive as select pg_temp.sail(1, array[1, 2, 3, 4, 5, 6]) as trip;

-- Chegada com posição do GPS.
select is(pg_temp.arrive((select trip from t_arrive), 1, -23.5505, -46.6333, 12.4, 'gps', now() - interval '30 seconds') ->> 'code', 'ARRIVED', 'chegada com a posição do GPS é aceita');
select is((select arrival_latitude from public.trip_stops where id = pg_temp.stop_id((select trip from t_arrive), 1)), -23.550500, 'guarda a latitude');
select is((select arrival_accuracy_m from public.trip_stops where id = pg_temp.stop_id((select trip from t_arrive), 1)), 12.4, 'a precisão em metros');
select is((select arrival_position_source from public.trip_stops where id = pg_temp.stop_id((select trip from t_arrive), 1)), 'gps', 'e a origem "gps"');
select isnt((select arrival_position_read_at from public.trip_stops where id = pg_temp.stop_id((select trip from t_arrive), 1)), null, 'e o horário da leitura');
select is((select arrival_outside_geofence from public.trip_stops where id = pg_temp.stop_id((select trip from t_arrive), 1)), false, 'dentro da geocerca da unidade 1: não está fora');
select is((select data ->> 'position_source' from public.trip_events where trip_id = (select trip from t_arrive) and event_type = 'stop_arrived' and (data ->> 'position')::int = 1), 'gps', 'o evento guarda a origem');
select is((select data ->> 'accuracy_band' from public.trip_events where trip_id = (select trip from t_arrive) and event_type = 'stop_arrived' and (data ->> 'position')::int = 1), 'good', 'e a faixa de precisão');
select ok((select not (data ? 'latitude' or data ? 'longitude' or data ? 'accuracy_m') from public.trip_events where trip_id = (select trip from t_arrive) and event_type = 'stop_arrived' and (data ->> 'position')::int = 1), 'mas nunca as coordenadas');
select is((select count(*)::int from public.audit_logs where action = 'trip.arrive_stop' and metadata ->> 'position_source' = 'gps'), 1, 'a auditoria guarda a origem');
select is((select count(*)::int from public.audit_logs where metadata::text ~ '23\.55|46\.63'), 0, 'e nenhuma coordenada');

-- Fora da geocerca, sem posição, digitada e precisão ruim.
select is((pg_temp.arrive((select trip from t_arrive), 2, -23.5, -46.6, 8, 'gps', now()) ->> 'code') || coalesce((select arrival_outside_geofence::text from public.trip_stops where id = pg_temp.stop_id((select trip from t_arrive), 2)), 'null'), 'ARRIVEDnull',
  'unidade sem geocerca: nenhuma comparação, o resultado fica nulo');
select is(public.arrive_stop('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000900a2', '20000000-0000-0000-0000-00000000000a', gen_random_uuid(), (select trip from t_arrive),
  pg_temp.stop_id((select trip from t_arrive), 3), null) ->> 'code', 'ARRIVED', 'a chamada antiga, sem posição, continua valendo');
select is((select arrival_latitude is null and arrival_position_source is null and arrival_outside_geofence is null from public.trip_stops where id = pg_temp.stop_id((select trip from t_arrive), 3)), true, 'e fica sem posição');
select is(pg_temp.arrive((select trip from t_arrive), 4, -23.55, -46.63, null, null, null) ->> 'code', 'ARRIVED', 'coordenadas sem informar a origem');
select is((select arrival_position_source from public.trip_stops where id = pg_temp.stop_id((select trip from t_arrive), 4)), 'typed', 'valem como "informada"');
select is(pg_temp.arrive((select trip from t_arrive), 5, -23.55, -46.63, 450, 'gps', now()) ->> 'code', 'ARRIVED', 'precisão ruim não bloqueia o registro');
select is((select data ->> 'accuracy_band' from public.trip_events where trip_id = (select trip from t_arrive) and event_type = 'stop_arrived' and (data ->> 'position')::int = 5), 'low', 'mas o evento marca a faixa "low"');

-- Validação da chegada.
create temp table t_bad as select pg_temp.sail(2, array[9, 10, 11, 12, 13, 14]) as trip;
select is(pg_temp.arrive((select trip from t_bad), 1, -23.55, null) ->> 'code', 'VALIDATION_FAILED', 'latitude sem longitude é recusada');
select is(pg_temp.arrive((select trip from t_bad), 1, 91, -46.6) ->> 'code', 'VALIDATION_FAILED', 'latitude fora do intervalo é recusada');
select is(pg_temp.arrive((select trip from t_bad), 1, -23.55, -181) ->> 'code', 'VALIDATION_FAILED', 'longitude fora do intervalo é recusada');
select is(pg_temp.arrive((select trip from t_bad), 1, -23.55, -46.6, -1) ->> 'code', 'VALIDATION_FAILED', 'precisão negativa é recusada');
select is(pg_temp.arrive((select trip from t_bad), 1, -23.55, -46.6, 100001) ->> 'code', 'VALIDATION_FAILED', 'precisão acima de 100000 é recusada');
select is(pg_temp.arrive((select trip from t_bad), 1, null, null, 10) ->> 'code', 'VALIDATION_FAILED', 'precisão sem coordenadas é recusada');
select is(pg_temp.arrive((select trip from t_bad), 1, -23.55, -46.6, 10, 'bogus') ->> 'code', 'VALIDATION_FAILED', 'origem desconhecida é recusada');
select is(pg_temp.arrive((select trip from t_bad), 1, null, null, null, 'gps') ->> 'code', 'VALIDATION_FAILED', 'origem "gps" sem coordenadas é recusada');
select is(pg_temp.arrive((select trip from t_bad), 1, -23.55, -46.6, 10, 'gps', now() + interval '5 minutes') ->> 'code', 'VALIDATION_FAILED', 'leitura no futuro é recusada');
select is(pg_temp.arrive((select trip from t_bad), 1, -23.55, -46.6, 10, 'gps', now() - interval '11 minutes') ->> 'code', 'VALIDATION_FAILED', 'leitura com mais de 10 minutos é recusada');
select is(pg_temp.arrive((select trip from t_bad), 1, -23.55, -46.6, 10, 'typed', now()) ->> 'code', 'VALIDATION_FAILED', 'horário da leitura só vale com a origem "gps"');
select is((select status from public.trip_stops where id = pg_temp.stop_id((select trip from t_bad), 1)), 'pending', 'a parada recusada continua pendente');

-- Entrega: origem, precisão e horário.
select is(pg_temp.deliver((select trip from t_arrive), 1, 1, -23.5502, -46.6331, false, 9.5, 'gps', now() - interval '20 seconds') ->> 'code', 'DELIVERED', 'entrega com a posição do GPS é aceita');
select is((select position_source || ':' || accuracy_m::text from public.trip_deliveries where stop_id = pg_temp.stop_id((select trip from t_arrive), 1)), 'gps:9.5', 'guarda a origem e a precisão');
select is(pg_temp.deliver((select trip from t_arrive), 4, 4, null, null, true) ->> 'code', 'DELIVERED', 'entrega "no endereço da unidade" é aceita');
select is((select position_source from public.trip_deliveries where stop_id = pg_temp.stop_id((select trip from t_arrive), 4)), 'site_address', 'e a origem é "site_address"');
select is(pg_temp.deliver((select trip from t_arrive), 5, 5, -23.55, -46.63) ->> 'code', 'DELIVERED', 'coordenadas sem origem na entrega');
select is((select position_source from public.trip_deliveries where stop_id = pg_temp.stop_id((select trip from t_arrive), 5)), 'typed', 'valem como "informada"');
select is((select data ->> 'position_source' from public.trip_events where trip_id = (select trip from t_arrive) and event_type = 'delivery_registered' and (data ->> 'position')::int = 1), 'gps', 'o evento da entrega guarda a origem');
select ok((select not (data ? 'latitude' or data ? 'longitude') from public.trip_events where trip_id = (select trip from t_arrive) and event_type = 'delivery_registered' and (data ->> 'position')::int = 1), 'sem coordenadas');
select is((select count(*)::int from public.audit_logs where action = 'trip.deliver' and metadata ->> 'accuracy_band' = 'good'), 1, 'a auditoria da entrega guarda a faixa de precisão');

-- Validação da entrega (a exclusividade de coordenadas e endereço da Spec 008 continua).
create temp table t_bad2 as select pg_temp.sail(3, array[7, 8]) as trip;
select pg_temp.arrive((select trip from t_bad2), 1);
select is(pg_temp.deliver((select trip from t_bad2), 1, 7, -23.55, -46.6, true) ->> 'code', 'VALIDATION_FAILED', 'coordenadas e endereço da unidade ao mesmo tempo continuam recusados');
select is(pg_temp.deliver((select trip from t_bad2), 1, 7, null, null, false, 10) ->> 'code', 'VALIDATION_FAILED', 'precisão sem coordenadas é recusada');
select is(pg_temp.deliver((select trip from t_bad2), 1, 7, -23.55, -46.6, false, 10, 'site_address') ->> 'code', 'VALIDATION_FAILED', 'origem que não confere com os dados é recusada');
select is(pg_temp.deliver((select trip from t_bad2), 1, 7, -23.55, -46.6, false, 10, 'gps', now() - interval '12 minutes') ->> 'code', 'VALIDATION_FAILED', 'leitura velha é recusada na entrega');

-- Restrições da tabela (defesa em profundidade) e escopo.
select throws_ok($$ update public.trip_stops set arrival_latitude = -23.5 where id = (select id from public.trip_stops where status = 'pending' and arrival_latitude is null limit 1) $$, '23514', null, 'coordenada sozinha na parada viola a restrição do banco');
select is(pg_temp.arrive((select trip from t_bad), 1, -23.55, -46.6, 10, 'gps', now(), '10000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-0000000900b3', '20000000-0000-0000-0000-00000000000b') ->> 'code', 'NOT_FOUND', 'o Tenant B não registra chegada no Tenant A');
select is(pg_temp.arrive((select trip from t_bad), 1, -23.55, -46.6, 10, 'gps', now(), '10000000-0000-0000-0000-0000000009d1', '60000000-0000-0000-0000-0000000900d1') ->> 'code', 'ACCESS_DENIED', 'o auditor não registra chegada');
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname in ('arrive_stop', 'register_delivery')), 2, 'uma só assinatura de arrive_stop e de register_delivery');
select is(has_function_privilege('authenticated', 'public.arrive_stop(uuid, uuid, uuid, uuid, uuid, uuid, timestamptz, numeric, numeric, numeric, text, timestamptz, timestamptz)', 'execute'), false, 'só o servidor executa arrive_stop');

-- Detalhe da viagem: origem, precisão e geocerca, só a quem tem trip.read.
select is(public.get_trip('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000900a2', '20000000-0000-0000-0000-00000000000a', (select trip from t_arrive)) -> 'stops' -> 0 -> 'arrival' ->> 'position_source', 'gps',
  'o detalhe mostra a origem da posição da chegada');
select is((select d ->> 'position_source' from jsonb_array_elements(public.get_trip('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000900a2', '20000000-0000-0000-0000-00000000000a', (select trip from t_arrive)) -> 'deliveries') d
   where d ->> 'stop_id' = pg_temp.stop_id((select trip from t_arrive), 1)::text), 'gps',
  'e da entrega');
select is(public.get_trip('10000000-0000-0000-0000-0000000009c1', '60000000-0000-0000-0000-0000000900c1', '20000000-0000-0000-0000-00000000000a', (select trip from t_arrive)) ->> 'code', 'ACCESS_DENIED', 'sem trip.read (motorista) o detalhe é negado');

select * from finish();
rollback;
