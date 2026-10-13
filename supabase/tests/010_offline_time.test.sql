begin;
select plan(23);

-- Spec 010, T016 (RED): a chegada e a entrega que vêm da fila medem a validade da posição contra o HORÁRIO INFORMADO do registro, e não contra
-- agora (RF-014, RF-015, research.md §9); horário informado com mais de 7 dias de atraso vira STALE_OFFLINE_OPERATION (conflito). Sem
-- `p_queued_at` (uso online) nada muda. Datas explícitas e data de São Paulo, nunca `current_date` em UTC. Hermético: desfeito pelo rollback.

delete from public.user_sessions where user_id in (
  '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000003');
insert into public.membership_roles (membership_id, role_id, assigned_by)
  select '30000000-0000-0000-0000-00000000000b', r.id, '10000000-0000-0000-0000-000000000001' from public.roles r where r.organization_id = '20000000-0000-0000-0000-00000000000b' and r.code = 'tenant_admin'
  on conflict do nothing;
select public.start_user_session('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000001001a2', 'aal1');
select public.start_user_session('10000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-0000001001b3', 'aal1');

insert into public.customers (id, organization_id, person_type, document_display, legal_name, segment) values
  ('91000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', 'legal', '11222333000181', 'Hospital Alfa Ltda', 'hospital');
insert into public.customer_sites (id, organization_id, customer_id, name, postal_code, street, number, city, state)
  select ('92000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid, '20000000-0000-0000-0000-00000000000a', '91000000-0000-0000-0000-00000000000a', 'Unidade ' || n, '01001000', 'Praça da Sé', n::text, 'São Paulo', 'SP' from generate_series(1, 8) n;
insert into public.vehicles (id, organization_id, plate, vehicle_type, capacity_cylinders) values
  ('95000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-00000000000a', 'OFF1001', 'truck', 20);
insert into public.drivers (id, organization_id, full_name, cpf_display, cnh_display, cnh_category, cnh_valid_until) values
  ('96000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-00000000000a', 'Motorista 1', 'x1', 'y1', 'D', (now() at time zone 'America/Sao_Paulo')::date + 365);
insert into public.cylinder_types (id, organization_id, gas, capacity_value, capacity_unit, classification) values
  ('97000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', 'Oxigênio', 10, 'l', 'medicinal');
insert into public.cylinders (id, organization_id, cylinder_type_id, serial_number, stock_status, hydro_last_result, hydro_next_due_on)
  select ('98000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid, '20000000-0000-0000-0000-00000000000a', '97000000-0000-0000-0000-00000000000a', 'OFF-' || lpad(n::text, 3, '0'), 'in_stock', 'approved', (now() at time zone 'America/Sao_Paulo')::date + 200
    from generate_series(1, 8) n;

create function pg_temp.cy(n integer) returns uuid language sql as $$ select ('98000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid $$;
create function pg_temp.ver(p_trip uuid) returns bigint language sql as $$ select version from public.trips where id = p_trip $$;
-- Viagem em andamento com uma parada por cilindro (cada parada em uma unidade), como administrador do A.
create function pg_temp.sail(p_cyls integer[]) returns uuid language plpgsql as $$
declare
  u constant uuid := '10000000-0000-0000-0000-000000000002'; s constant uuid := '60000000-0000-0000-0000-0000001001a2'; o constant uuid := '20000000-0000-0000-0000-00000000000a';
  t uuid; c integer;
begin
  t := (public.create_trip(u, s, o, gen_random_uuid(), (now() at time zone 'America/Sao_Paulo')::date, '95000000-0000-0000-0000-000000000001', '96000000-0000-0000-0000-000000000001', null,
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

-- Chegada: horário informado, hora da fila, leitura da posição.
create function pg_temp.arrive(p_trip uuid, p_pos integer, p_when timestamptz, p_queued timestamptz, p_read timestamptz, p_req uuid default gen_random_uuid(),
  p_user uuid default '10000000-0000-0000-0000-000000000002', p_session uuid default '60000000-0000-0000-0000-0000001001a2', p_org uuid default '20000000-0000-0000-0000-00000000000a')
returns jsonb language sql as $$
  select public.arrive_stop(p_user, p_session, p_org, p_req, p_trip, pg_temp.stop_id(p_trip, p_pos), p_when, -23.55, -46.633, 12, case when p_read is null then 'typed' else 'gps' end, p_read, p_queued)
$$;
-- Entrega: horário informado, hora da fila, leitura da posição.
create function pg_temp.deliver(p_trip uuid, p_pos integer, p_cyl integer, p_when timestamptz, p_queued timestamptz, p_read timestamptz) returns jsonb language sql as $$
  select public.register_delivery('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000001001a2', '20000000-0000-0000-0000-00000000000a', gen_random_uuid(), p_trip,
    pg_temp.stop_id(p_trip, p_pos), p_when, 'Recebedor Fictício', null, -23.55, -46.633, false,
    jsonb_build_array(jsonb_build_object('item_id', pg_temp.item(p_trip, p_cyl), 'delivered', true)), null, null, 12, case when p_read is null then 'typed' else 'gps' end, p_read, p_queued)
$$;

create temp table t as select pg_temp.sail(array[1, 2, 3, 4, 5, 6, 7, 8]) as trip;

-- Chegada.
select is(pg_temp.arrive((select trip from t), 1, now() - interval '1 minute', null, now() - interval '2 hours') ->> 'code', 'VALIDATION_FAILED',
  'online: posição lida há 2 horas continua recusada (sem p_queued_at nada muda)');
select is(pg_temp.arrive((select trip from t), 1, now() - interval '3 hours', now() - interval '3 hours', now() - interval '3 hours' - interval '2 minutes') ->> 'code', 'ARRIVED',
  'offline: posição lida 2 minutos antes do horário informado (há 3 horas) vale');
select is((select arrived_at < now() - interval '2 hours 59 minutes' from public.trip_stops where id = pg_temp.stop_id((select trip from t), 1)), true, 'a chegada guarda o horário informado');
select is(pg_temp.arrive((select trip from t), 2, now() - interval '3 hours', now() - interval '3 hours', now() - interval '3 hours' + interval '5 minutes') ->> 'code', 'VALIDATION_FAILED',
  'offline: posição lida depois do horário informado (no futuro do registro) é recusada');
select is(pg_temp.arrive((select trip from t), 2, now() - interval '3 hours', now() - interval '3 hours', now() - interval '3 hours' - interval '15 minutes') ->> 'code', 'VALIDATION_FAILED',
  'offline: posição lida mais de 10 minutos antes do horário informado é recusada');
select is((select status from public.trip_stops where id = pg_temp.stop_id((select trip from t), 2)), 'pending', 'a parada recusada continua pendente');

-- Sem p_arrived_at, o horário da fila vira a referência.
select is(public.arrive_stop('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000001001a2', '20000000-0000-0000-0000-00000000000a', gen_random_uuid(),
  (select trip from t), pg_temp.stop_id((select trip from t), 3), null, null, null, null, null, null, now() - interval '5 hours') ->> 'code', 'ARRIVED', 'offline sem p_arrived_at: usa o horário da fila');
select is((select arrived_at < now() - interval '4 hours 59 minutes' from public.trip_stops where id = pg_temp.stop_id((select trip from t), 3)), true, 'a chegada guarda o horário da fila como o do registro');

-- Janela de 7 dias.
select is(pg_temp.arrive((select trip from t), 4, now() - interval '8 days', now() - interval '8 days', null) ->> 'code', 'STALE_OFFLINE_OPERATION', 'offline: horário informado com mais de 7 dias é conflito');
select is((select status from public.trip_stops where id = pg_temp.stop_id((select trip from t), 4)), 'pending', 'a chegada em conflito não foi gravada');
select is(pg_temp.arrive((select trip from t), 4, now() - interval '6 days', now() - interval '6 days', null) ->> 'code', 'ARRIVED', 'offline: 6 dias de atraso ainda vale');
select is(pg_temp.arrive((select trip from t), 5, now() - interval '8 days', null, null) ->> 'code', 'ARRIVED', 'online (sem p_queued_at): a regra de 7 dias não se aplica');

-- Idempotência de um pedido de origem offline.
create temp table rq as select gen_random_uuid() as req;
select is(pg_temp.arrive((select trip from t), 6, now() - interval '2 hours', now() - interval '2 hours', null, (select req from rq)) ->> 'code', 'ARRIVED', 'primeiro envio da fila');
select is((pg_temp.arrive((select trip from t), 6, now() - interval '2 hours', now() - interval '2 hours', null, (select req from rq)) ->> 'replayed')::boolean, true, 'reenvio do mesmo pedido devolve o resultado gravado');

-- Entrega.
select is(pg_temp.deliver((select trip from t), 1, 1, now() - interval '3 hours', now() - interval '3 hours', now() - interval '3 hours' - interval '2 minutes') ->> 'code', 'DELIVERED',
  'entrega offline: posição lida 2 minutos antes do horário informado vale');
select is(pg_temp.deliver((select trip from t), 3, 3, now() - interval '8 days', now() - interval '8 days', null) ->> 'code', 'STALE_OFFLINE_OPERATION', 'entrega offline com mais de 7 dias é conflito');
select is((select count(*)::int from public.trip_deliveries where stop_id = pg_temp.stop_id((select trip from t), 3)), 0, 'a entrega em conflito não foi gravada');
select is(pg_temp.deliver((select trip from t), 4, 4, now() - interval '1 minute', null, now() - interval '2 hours') ->> 'code', 'VALIDATION_FAILED',
  'entrega online: posição lida há 2 horas continua recusada');
select is(pg_temp.deliver((select trip from t), 4, 4, now() - interval '3 hours', now() - interval '3 hours', now() - interval '3 hours' + interval '5 minutes') ->> 'code', 'VALIDATION_FAILED',
  'entrega offline: posição lida depois do horário informado é recusada');

-- Dois tenants.
select is(pg_temp.arrive((select trip from t), 7, now() - interval '1 hour', now() - interval '1 hour', null, gen_random_uuid(), '10000000-0000-0000-0000-000000000003',
  '60000000-0000-0000-0000-0000001001b3', '20000000-0000-0000-0000-00000000000b') ->> 'code', 'NOT_FOUND', 'o Tenant B não registra chegada na viagem do Tenant A');

-- Assinaturas e permissões.
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname in ('arrive_stop', 'register_delivery')), 2, 'uma só assinatura de cada função');
select is(has_function_privilege('service_role', 'public.arrive_stop(uuid, uuid, uuid, uuid, uuid, uuid, timestamptz, numeric, numeric, numeric, text, timestamptz, timestamptz)', 'execute')
  and not has_function_privilege('authenticated', 'public.arrive_stop(uuid, uuid, uuid, uuid, uuid, uuid, timestamptz, numeric, numeric, numeric, text, timestamptz, timestamptz)', 'execute'), true, 'arrive_stop: só a service_role executa');
select is(has_function_privilege('service_role', 'public.register_delivery(uuid, uuid, uuid, uuid, uuid, uuid, timestamptz, text, text, numeric, numeric, boolean, jsonb, uuid, text, numeric, text, timestamptz, timestamptz)', 'execute')
  and not has_function_privilege('authenticated', 'public.register_delivery(uuid, uuid, uuid, uuid, uuid, uuid, timestamptz, text, text, numeric, numeric, boolean, jsonb, uuid, text, numeric, text, timestamptz, timestamptz)', 'execute'), true, 'register_delivery: só a service_role executa');

select * from finish();
rollback;
