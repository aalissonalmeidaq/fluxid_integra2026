begin;
select plan(59);

-- Spec 008, US5: concluir, cancelar e devolver ao estoque (RF-021 a RF-024, CA-003, CA-004). O gestor logístico tem trip.cancel e trip.operate,
-- mas não trip.exception; o operador de estoque não tem trip.cancel.

delete from public.user_sessions where user_id in (
  '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000003');
insert into public.membership_roles (membership_id, role_id, assigned_by)
  select '30000000-0000-0000-0000-00000000000b', r.id, '10000000-0000-0000-0000-000000000001' from public.roles r where r.organization_id = '20000000-0000-0000-0000-00000000000b' and r.code = 'tenant_admin';
select public.start_user_session('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000800a2', 'aal1');
select public.start_user_session('10000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-0000000800b3', 'aal1');

insert into auth.users (id, aud, role, email) values
  ('10000000-0000-0000-0000-0000000008c1', 'authenticated', 'authenticated', 'trip-driver@example.invalid'),
  ('10000000-0000-0000-0000-0000000008d1', 'authenticated', 'authenticated', 'trip-auditor@example.invalid');
insert into public.profiles (user_id, display_name) values ('10000000-0000-0000-0000-0000000008c1', 'Motorista Viagens'), ('10000000-0000-0000-0000-0000000008d1', 'Auditor Viagens');
insert into public.memberships (id, organization_id, user_id, status, activated_at) values
  ('30000000-0000-0000-0000-0000000008c1', '20000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-0000000008c1', 'active', now()),
  ('30000000-0000-0000-0000-0000000008d1', '20000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-0000000008d1', 'active', now());
insert into public.membership_roles (membership_id, role_id, assigned_by)
  select '30000000-0000-0000-0000-0000000008c1', r.id, '10000000-0000-0000-0000-000000000001' from public.roles r where r.organization_id = '20000000-0000-0000-0000-00000000000a' and r.code = 'driver';
insert into public.membership_roles (membership_id, role_id, assigned_by)
  select '30000000-0000-0000-0000-0000000008d1', r.id, '10000000-0000-0000-0000-000000000001' from public.roles r where r.organization_id = '20000000-0000-0000-0000-00000000000a' and r.code = 'tenant_auditor';
select public.start_user_session('10000000-0000-0000-0000-0000000008c1', '60000000-0000-0000-0000-0000000800c1', 'aal1');
select public.start_user_session('10000000-0000-0000-0000-0000000008d1', '60000000-0000-0000-0000-0000000800d1', 'aal1');

insert into public.customers (id, organization_id, person_type, document_display, legal_name, segment) values
  ('91000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', 'legal', '11222333000181', 'Hospital Alfa Ltda', 'hospital'),
  ('91000000-0000-0000-0000-00000000000b', '20000000-0000-0000-0000-00000000000b', 'legal', '11222333000181', 'Hospital Beta Ltda', 'hospital');
insert into public.customer_sites (id, organization_id, customer_id, name, postal_code, street, number, city, state)
  select ('92000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid, '20000000-0000-0000-0000-00000000000a', '91000000-0000-0000-0000-00000000000a', 'Unidade ' || n, '01001000', 'Praça da Sé', n::text, 'São Paulo', 'SP' from generate_series(1, 4) n;
insert into public.vehicles (id, organization_id, plate, vehicle_type, capacity_cylinders)
  select ('95000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid, '20000000-0000-0000-0000-00000000000a', 'DLV' || (1000 + n), 'truck', 20 from generate_series(1, 6) n;
insert into public.drivers (id, organization_id, full_name, cpf_display, cnh_display, cnh_category, cnh_valid_until)
  select ('96000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid, '20000000-0000-0000-0000-00000000000a', 'Motorista ' || n, 'x' || n, 'y' || n, 'D', current_date + 365 from generate_series(1, 6) n;
insert into public.cylinder_types (id, organization_id, gas, capacity_value, capacity_unit, classification) values
  ('97000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', 'Oxigênio', 10, 'l', 'medicinal');
insert into public.cylinders (id, organization_id, cylinder_type_id, serial_number, stock_status, hydro_last_result, hydro_next_due_on)
  select ('98000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid, '20000000-0000-0000-0000-00000000000a', '97000000-0000-0000-0000-00000000000a', 'DEL-' || lpad(n::text, 3, '0'), 'in_stock', 'approved', current_date + 200
    from generate_series(1, 40) n;

create function pg_temp.cy(n integer) returns uuid language sql as $$ select ('98000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid $$;
create function pg_temp.stop(p_site integer, p_cyls integer[]) returns jsonb language sql as $$
  select jsonb_build_object('site_id', ('92000000-0000-0000-0000-' || lpad(p_site::text, 12, '0'))::uuid, 'cylinder_ids', (select jsonb_agg(pg_temp.cy(c)) from unnest(p_cyls) c))
$$;
create function pg_temp.ver(p_trip uuid) returns bigint language sql as $$ select version from public.trips where id = p_trip $$;
-- Viagem em andamento: planeja, carrega, confere tudo e inicia, como administrador do A.
create function pg_temp.sail(p_stops jsonb, p_vehicle integer, p_driver integer, p_cyls integer[]) returns uuid language plpgsql as $$
declare
  u constant uuid := '10000000-0000-0000-0000-000000000002'; s constant uuid := '60000000-0000-0000-0000-0000000800a2'; o constant uuid := '20000000-0000-0000-0000-00000000000a';
  t uuid; c integer;
begin
  t := (public.create_trip(u, s, o, gen_random_uuid(), current_date, ('95000000-0000-0000-0000-' || lpad(p_vehicle::text, 12, '0'))::uuid, ('96000000-0000-0000-0000-' || lpad(p_driver::text, 12, '0'))::uuid, null, p_stops) ->> 'trip_id')::uuid;
  perform public.start_loading(u, s, o, gen_random_uuid(), t, pg_temp.ver(t));
  foreach c in array p_cyls loop
    perform public.check_item(u, s, o, gen_random_uuid(), t, (select id from public.trip_items where trip_id = t and cylinder_id = pg_temp.cy(c)));
  end loop;
  perform public.start_trip(u, s, o, gen_random_uuid(), t, pg_temp.ver(t));
  return t;
end $$;
create function pg_temp.stop_id(p_trip uuid, p_pos integer) returns uuid language sql as $$ select id from public.trip_stops where trip_id = p_trip and position = p_pos $$;
create function pg_temp.item(p_trip uuid, p_cyl integer) returns uuid language sql as $$ select id from public.trip_items where trip_id = p_trip and cylinder_id = pg_temp.cy(p_cyl) $$;
create function pg_temp.arrive(p_trip uuid, p_pos integer, p_user uuid default '10000000-0000-0000-0000-000000000002', p_session uuid default '60000000-0000-0000-0000-0000000800a2', p_org uuid default '20000000-0000-0000-0000-00000000000a') returns jsonb language sql as $$
  select public.arrive_stop(p_user, p_session, p_org, gen_random_uuid(), p_trip, pg_temp.stop_id(p_trip, p_pos), null)
$$;
-- results: lista de pares (cilindro, entregue, motivo).
create function pg_temp.res(p_trip uuid, p_items jsonb) returns jsonb language sql as $$
  select coalesce(jsonb_agg(jsonb_build_object('item_id', pg_temp.item(p_trip, (e ->> 0)::integer), 'delivered', (e ->> 1)::boolean, 'reason', e ->> 2)), '[]'::jsonb) from jsonb_array_elements(p_items) e
$$;
create function pg_temp.deliver(p_trip uuid, p_pos integer, p_items jsonb, p_name text default 'Recebedor Fictício', p_role text default null, p_when timestamptz default null,
  p_lat numeric default null, p_lon numeric default null, p_supersedes uuid default null, p_req uuid default gen_random_uuid(), p_user uuid default '10000000-0000-0000-0000-000000000002',
  p_session uuid default '60000000-0000-0000-0000-0000000800a2', p_org uuid default '20000000-0000-0000-0000-00000000000a') returns jsonb language sql as $$
  select public.register_delivery(p_user, p_session, p_org, p_req, p_trip, pg_temp.stop_id(p_trip, p_pos), coalesce(p_when, now() - interval '1 minute'), p_name, p_role, p_lat, p_lon, false,
    pg_temp.res(p_trip, p_items), p_supersedes)
$$;

insert into auth.users (id, aud, role, email) values
  ('10000000-0000-0000-0000-0000000008e1', 'authenticated', 'authenticated', 'trip-logistics@example.invalid'),
  ('10000000-0000-0000-0000-0000000008f1', 'authenticated', 'authenticated', 'trip-stock@example.invalid');
insert into public.profiles (user_id, display_name) values ('10000000-0000-0000-0000-0000000008e1', 'Gestor Logístico'), ('10000000-0000-0000-0000-0000000008f1', 'Operador de Estoque');
insert into public.memberships (id, organization_id, user_id, status, activated_at) values
  ('30000000-0000-0000-0000-0000000008e1', '20000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-0000000008e1', 'active', now()),
  ('30000000-0000-0000-0000-0000000008f1', '20000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-0000000008f1', 'active', now());
insert into public.membership_roles (membership_id, role_id, assigned_by)
  select '30000000-0000-0000-0000-0000000008e1', r.id, '10000000-0000-0000-0000-000000000001' from public.roles r where r.organization_id = '20000000-0000-0000-0000-00000000000a' and r.code = 'logistics_manager';
insert into public.membership_roles (membership_id, role_id, assigned_by)
  select '30000000-0000-0000-0000-0000000008f1', r.id, '10000000-0000-0000-0000-000000000001' from public.roles r where r.organization_id = '20000000-0000-0000-0000-00000000000a' and r.code = 'stock_operator';
select public.start_user_session('10000000-0000-0000-0000-0000000008e1', '60000000-0000-0000-0000-0000000800e1', 'aal1');
select public.start_user_session('10000000-0000-0000-0000-0000000008f1', '60000000-0000-0000-0000-0000000800f1', 'aal1');

create function pg_temp.status_of(p_trip uuid) returns text language sql as $$ select status from public.trips where id = p_trip $$;
create function pg_temp.sl(p_trip uuid) returns jsonb language sql as $$
  select public.start_loading('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000800a2', '20000000-0000-0000-0000-00000000000a', gen_random_uuid(), p_trip, pg_temp.ver(p_trip))
$$;
create function pg_temp.ck(p_trip uuid, p_cyl integer) returns jsonb language sql as $$
  select public.check_item('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000800a2', '20000000-0000-0000-0000-00000000000a', gen_random_uuid(), p_trip, pg_temp.item(p_trip, p_cyl))
$$;
create function pg_temp.complete(p_trip uuid, p_user uuid default '10000000-0000-0000-0000-000000000002', p_session uuid default '60000000-0000-0000-0000-0000000800a2',
  p_req uuid default gen_random_uuid(), p_org uuid default '20000000-0000-0000-0000-00000000000a') returns jsonb language sql as $$
  select public.complete_trip(p_user, p_session, p_org, p_req, p_trip, pg_temp.ver(p_trip))
$$;
create function pg_temp.cancel(p_trip uuid, p_why text default 'Viagem cancelada pelo cliente', p_user uuid default '10000000-0000-0000-0000-000000000002',
  p_session uuid default '60000000-0000-0000-0000-0000000800a2', p_req uuid default gen_random_uuid(), p_org uuid default '20000000-0000-0000-0000-00000000000a') returns jsonb language sql as $$
  select public.cancel_trip(p_user, p_session, p_org, p_req, p_trip, pg_temp.ver(p_trip), p_why)
$$;
create function pg_temp.ret(p_trip uuid, p_cyl integer, p_why text default 'Cilindro volta ao depósito', p_user uuid default '10000000-0000-0000-0000-000000000002',
  p_session uuid default '60000000-0000-0000-0000-0000000800a2', p_req uuid default gen_random_uuid(), p_org uuid default '20000000-0000-0000-0000-00000000000a') returns jsonb language sql as $$
  select public.return_item(p_user, p_session, p_org, p_req, p_trip, pg_temp.item(p_trip, p_cyl), p_why)
$$;
create function pg_temp.plan1(p_cyls integer[], p_vehicle integer, p_driver integer) returns uuid language sql as $$
  select (public.create_trip('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000800a2', '20000000-0000-0000-0000-00000000000a', gen_random_uuid(), current_date,
    ('95000000-0000-0000-0000-' || lpad(p_vehicle::text, 12, '0'))::uuid, ('96000000-0000-0000-0000-' || lpad(p_driver::text, 12, '0'))::uuid, null, jsonb_build_array(pg_temp.stop(1, p_cyls))) ->> 'trip_id')::uuid
$$;

create function pg_temp.plan_code(p_cyls integer[], p_vehicle integer, p_driver integer) returns text language sql as $$
  select public.create_trip('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000800a2', '20000000-0000-0000-0000-00000000000a', gen_random_uuid(), current_date,
    ('95000000-0000-0000-0000-' || lpad(p_vehicle::text, 12, '0'))::uuid, ('96000000-0000-0000-0000-' || lpad(p_driver::text, 12, '0'))::uuid, null, jsonb_build_array(pg_temp.stop(1, p_cyls))) ->> 'code'
$$;

-- 1. Concluir: todas as paradas encerradas e cada não entregue com uma decisão.
create temp table c as select pg_temp.sail(jsonb_build_array(pg_temp.stop(1, array[1, 2]), pg_temp.stop(2, array[3])), 1, 1, array[1, 2, 3]) as t;
select is(pg_temp.complete((select t from c)) ->> 'code', 'STOPS_OPEN', 'concluir com paradas pendentes: STOPS_OPEN');
select is(jsonb_array_length(pg_temp.complete((select t from c)) -> 'stop_ids'), 2, 'a resposta aponta as duas paradas abertas');
select is(pg_temp.status_of((select t from c)), 'in_progress', 'e a viagem segue em andamento');
select pg_temp.arrive((select t from c), 1);
select pg_temp.deliver((select t from c), 1, '[[1, true, null], [2, true, null]]');
select pg_temp.arrive((select t from c), 2);
select pg_temp.deliver((select t from c), 2, '[[3, false, "Cliente fechado no horário"]]');
select is(pg_temp.complete((select t from c)) ->> 'code', 'STOPS_OPEN', 'cilindro não entregue sem decisão também impede concluir');
select is(jsonb_array_length(pg_temp.complete((select t from c)) -> 'stop_ids'), 1, 'apontando só a parada com divergência em aberto');
select is(pg_temp.complete((select t from c), '10000000-0000-0000-0000-0000000008c1', '60000000-0000-0000-0000-0000000800c1') ->> 'code', 'ACCESS_DENIED', 'motorista não conclui');

-- 2. Retorno ao estoque: exceção, justificativa, só em trânsito ou não entregue.
select is(pg_temp.ret((select t from c), 3, 'Cilindro volta ao depósito', '10000000-0000-0000-0000-0000000008e1', '60000000-0000-0000-0000-0000000800e1') ->> 'code', 'ACCESS_DENIED', 'gestor sem trip.exception não devolve ao estoque');
select is(pg_temp.ret((select t from c), 3, '   ') ->> 'code', 'JUSTIFICATION_REQUIRED', 'sem justificativa: JUSTIFICATION_REQUIRED');
select is(pg_temp.ret((select t from c), 1) ->> 'code', 'INVALID_TRANSITION', 'cilindro já entregue não volta pelo retorno');
select is(pg_temp.ret((select t from c), 3) ->> 'code', 'RETURNED', 'devolve o não entregue ao estoque');
select is((select item_status from public.trip_items where id = pg_temp.item((select t from c), 3)), 'returned', 'item devolvido');
select is((select stock_status || '/' || custody_status from public.cylinders where id = pg_temp.cy(3)), 'in_stock/in_organization', 'cilindro em estoque e na organização');
select is((select custody_site_id is null from public.cylinders where id = pg_temp.cy(3)), true, 'sem unidade de cliente');
select is((select count(*)::int from public.cylinder_events where cylinder_id = pg_temp.cy(3) and event_type = 'trip_returned' and justification = 'Cilindro volta ao depósito'), 1, 'evento trip_returned no cilindro, com o motivo');
select is((select count(*)::int from public.trip_events where trip_id = (select t from c) and event_type = 'item_returned'), 1, 'evento item_returned na viagem');
select is((select count(*)::int from public.audit_logs where action = 'trip.return_item' and (metadata::text ~* 'deposito|depósito' or coalesce(justification, '') ~* 'dep')), 0, 'a auditoria não guarda a justificativa');
select is((select count(*)::int from public.trip_items where cylinder_id = pg_temp.cy(3) and is_open), 0, 'a reserva do cilindro foi liberada');
select is(pg_temp.ret((select t from c), 3) ->> 'code', 'INVALID_TRANSITION', 'devolver duas vezes');

-- 3. Concluir.
select is(pg_temp.complete((select t from c), '10000000-0000-0000-0000-0000000008f1', '60000000-0000-0000-0000-0000000800f1', gen_random_uuid(), '20000000-0000-0000-0000-00000000000b') ->> 'code', 'ACCESS_DENIED', 'quem não pertence à organização é negado');
create temp table rq as select gen_random_uuid() as r;
select is(pg_temp.complete((select t from c), '10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000800a2', (select r from rq)) ->> 'code', 'COMPLETED', 'com tudo encerrado e decidido, a viagem conclui');
select is((pg_temp.complete((select t from c), '10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000800a2', (select r from rq)) ->> 'replayed')::boolean, true, 'a repetição devolve o resultado gravado');
select is(pg_temp.status_of((select t from c)), 'completed', 'situação concluída');
select isnt((select completed_at from public.trips where id = (select t from c)), null, 'com a conclusão registrada');
select is((select completed_by from public.trips where id = (select t from c)), '10000000-0000-0000-0000-000000000002'::uuid, 'e quem concluiu');
select is((select count(*)::int from public.trip_events where trip_id = (select t from c) and event_type = 'trip_completed'), 1, 'um só evento trip_completed');
select is((select count(*)::int from public.audit_logs where action = 'trip.complete' and target_id = (select t::text from c)), 1, 'uma só auditoria trip.complete');

-- 4. Viagem concluída não aceita edição nem operação.
select is(pg_temp.complete((select t from c)) ->> 'code', 'TRIP_CLOSED', 'concluir de novo: TRIP_CLOSED');
select is(pg_temp.cancel((select t from c)) ->> 'code', 'TRIP_CLOSED', 'cancelar uma concluída: TRIP_CLOSED');
select is(pg_temp.ret((select t from c), 1) ->> 'code', 'TRIP_CLOSED', 'devolver numa concluída: TRIP_CLOSED');
select is(pg_temp.arrive((select t from c), 1) ->> 'code', 'TRIP_CLOSED', 'chegada numa concluída: TRIP_CLOSED');
select is(public.update_trip('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000800a2', '20000000-0000-0000-0000-00000000000a', gen_random_uuid(), (select t from c), pg_temp.ver((select t from c)),
  current_date, '95000000-0000-0000-0000-000000000001', '96000000-0000-0000-0000-000000000001', null, jsonb_build_array(pg_temp.stop(1, array[1]))) ->> 'code', 'TRIP_CLOSED', 'edição numa concluída: TRIP_CLOSED');
select is(pg_temp.complete(pg_temp.plan1(array[40], 2, 2)) ->> 'code', 'INVALID_TRANSITION', 'concluir uma viagem planejada: INVALID_TRANSITION');

-- 5. Cancelar antes de sair libera as reservas.
create temp table p as select pg_temp.plan1(array[10, 11], 2, 2) as t;
select is(pg_temp.cancel((select t from p), '   ') ->> 'code', 'JUSTIFICATION_REQUIRED', 'cancelar sem justificativa');
select is(pg_temp.cancel((select t from p), repeat('j', 501)) ->> 'code', 'JUSTIFICATION_REQUIRED', 'justificativa com 501 caracteres');
select is(pg_temp.cancel((select t from p), 'Viagem cancelada pelo cliente', '10000000-0000-0000-0000-0000000008f1', '60000000-0000-0000-0000-0000000800f1') ->> 'code', 'ACCESS_DENIED', 'operador de estoque (sem trip.cancel) não cancela');
select is(pg_temp.cancel((select t from p), 'Viagem cancelada pelo cliente', '10000000-0000-0000-0000-0000000008e1', '60000000-0000-0000-0000-0000000800e1') ->> 'code', 'CANCELLED', 'o gestor logístico cancela planejada');
select is(pg_temp.status_of((select t from p)), 'cancelled', 'situação cancelada');
select is((select cancel_reason from public.trips where id = (select t from p)), 'Viagem cancelada pelo cliente', 'com o motivo');
select is((select count(*)::int from public.trip_items where trip_id = (select t from p) and item_status = 'released'), 2, 'itens liberados');
select is((select count(*)::int from public.cylinder_events where cylinder_id in (pg_temp.cy(10), pg_temp.cy(11)) and event_type = 'trip_released'), 2, 'evento trip_released em cada cilindro');
select is((select count(*)::int from public.trip_items where cylinder_id in (pg_temp.cy(10), pg_temp.cy(11)) and is_open), 0, 'os cilindros estão disponíveis de novo');
select is(pg_temp.plan1(array[10, 11], 3, 3) is not null, true, 'e entram em outra viagem');
select is((select count(*)::int from public.audit_logs where action = 'trip.cancel' and (metadata::text ~* 'pelo cliente' or coalesce(justification, '') ~* 'pelo cliente')), 0, 'a auditoria não guarda o motivo');
select is(pg_temp.cancel((select t from p)) ->> 'code', 'TRIP_CLOSED', 'cancelar de novo: TRIP_CLOSED');

-- 6. Cancelar carregando, com cilindros já conferidos.
create temp table l as select pg_temp.plan1(array[20, 21], 4, 4) as t;
select pg_temp.sl((select t from l));
select pg_temp.ck((select t from l), 20);
select is(pg_temp.cancel((select t from l)) ->> 'code', 'CANCELLED', 'cancelar carregando');
select is((select count(*)::int from public.trip_items where trip_id = (select t from l) and item_status = 'released'), 2, 'os conferidos e os não conferidos são liberados');
select is((select stock_status from public.cylinders where id = pg_temp.cy(20)), 'in_stock', 'e os cilindros continuam em estoque');

-- 7. Cancelar em andamento exige a exceção e mantém em trânsito o que já saiu.
create temp table g as select pg_temp.sail(jsonb_build_array(pg_temp.stop(1, array[30, 31]), pg_temp.stop(2, array[32])), 5, 5, array[30, 31, 32]) as t;
select pg_temp.arrive((select t from g), 1);
select pg_temp.deliver((select t from g), 1, '[[30, true, null], [31, true, null]]');
select is(pg_temp.cancel((select t from g), 'Cliente suspendeu a entrega', '10000000-0000-0000-0000-0000000008e1', '60000000-0000-0000-0000-0000000800e1') ->> 'code', 'ACCESS_DENIED', 'gestor sem trip.exception não cancela em andamento');
select is(pg_temp.status_of((select t from g)), 'in_progress', 'e a viagem segue em andamento');
select is(pg_temp.cancel((select t from g), 'Cliente suspendeu a entrega') ->> 'in_transit', '1', 'administrador cancela em andamento e a resposta conta o que ficou em trânsito');
select is((select item_status from public.trip_items where id = pg_temp.item((select t from g), 32)), 'in_transit', 'o cilindro que já saiu continua em trânsito');
select is((select custody_status from public.cylinders where id = pg_temp.cy(32)), 'in_transit', 'com a custódia em trânsito');
select is((select count(*)::int from public.trip_items where cylinder_id = pg_temp.cy(32) and is_open), 1, 'e a reserva aberta, até uma decisão registrada');
select is((select count(*)::int from public.trip_items where trip_id = (select t from g) and item_status = 'delivered'), 2, 'o que foi entregue continua entregue');
select is(pg_temp.plan_code(array[32], 6, 6), 'CYLINDER_RESERVED', 'o cilindro em trânsito de viagem cancelada não entra em outra viagem');
select is(pg_temp.ret((select t from g), 32) ->> 'code', 'RETURNED', 'a decisão registrada é o retorno ao estoque');
select is((select stock_status from public.cylinders where id = pg_temp.cy(32)), 'in_stock', 'o cilindro volta ao estoque');
select is((select status from public.trip_stops where trip_id = (select t from g) and site_id = '92000000-0000-0000-0000-000000000002'), 'with_divergence', 'a parada sem nada a entregar fecha com divergência');
select is(pg_temp.plan_code(array[32], 6, 6), 'CREATED', 'e o cilindro volta a poder viajar');

select * from finish();
rollback;
