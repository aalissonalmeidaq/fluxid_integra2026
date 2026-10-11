begin;
select plan(37);

-- Spec 008 (research.md, decisão 5): todo comando de manage-trips é idempotente por `request_id`. Este teste percorre as operações
-- já criadas: repetir o mesmo pedido devolve o resultado gravado com `replayed: true` sem efeito duplicado; o mesmo `request_id` com
-- outra operação ou outra viagem responde REQUEST_REUSED; `request_id` de outra organização não colide. As operações das histórias
-- seguintes entram na lista (em `ops`) conforme são criadas. Hermético: desfeito pelo rollback.

delete from public.user_sessions where user_id in (
  '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000003');
insert into public.membership_roles (membership_id, role_id, assigned_by)
  select '30000000-0000-0000-0000-00000000000b', r.id, '10000000-0000-0000-0000-000000000001'
    from public.roles r where r.organization_id = '20000000-0000-0000-0000-00000000000b' and r.code = 'tenant_admin';
select public.start_user_session('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000800a2', 'aal1');
select public.start_user_session('10000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-0000000800b3', 'aal1');

insert into public.customers (id, organization_id, person_type, document_display, legal_name, segment) values
  ('91000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', 'legal', '11222333000181', 'Hospital Alfa Ltda', 'hospital'),
  ('91000000-0000-0000-0000-00000000000b', '20000000-0000-0000-0000-00000000000b', 'legal', '11222333000181', 'Hospital Beta Ltda', 'hospital');
insert into public.customer_sites (id, organization_id, customer_id, name, postal_code, street, number, city, state) values
  ('92000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', '91000000-0000-0000-0000-00000000000a', 'Unidade A', '01001000', 'Praça da Sé', '1', 'São Paulo', 'SP'),
  ('92000000-0000-0000-0000-00000000000b', '20000000-0000-0000-0000-00000000000b', '91000000-0000-0000-0000-00000000000b', 'Unidade B', '01001000', 'Praça da Sé', '1', 'São Paulo', 'SP');
insert into public.vehicles (id, organization_id, plate, vehicle_type, capacity_cylinders) values
  ('95000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', 'AAA1111', 'truck', 10),
  ('95000000-0000-0000-0000-00000000000b', '20000000-0000-0000-0000-00000000000b', 'BBB1111', 'truck', 10);
insert into public.drivers (id, organization_id, full_name, cpf_display, cnh_display, cnh_category, cnh_valid_until) values
  ('96000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', 'Motorista A', 'x', 'x', 'D', current_date + 365),
  ('96000000-0000-0000-0000-00000000000b', '20000000-0000-0000-0000-00000000000b', 'Motorista B', 'x', 'x', 'D', current_date + 365);
insert into public.cylinder_types (id, organization_id, gas, capacity_value, capacity_unit, classification) values
  ('97000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', 'Oxigênio', 10, 'l', 'medicinal'),
  ('97000000-0000-0000-0000-00000000000b', '20000000-0000-0000-0000-00000000000b', 'Oxigênio', 10, 'l', 'medicinal');
insert into public.cylinders (id, organization_id, cylinder_type_id, serial_number, stock_status, hydro_last_result, hydro_next_due_on) values
  ('98000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-00000000000a', '97000000-0000-0000-0000-00000000000a', 'IDM-001', 'in_stock', 'approved', current_date + 200),
  ('98000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-00000000000a', '97000000-0000-0000-0000-00000000000a', 'IDM-002', 'in_stock', 'approved', current_date + 200),
  ('98000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-00000000000a', '97000000-0000-0000-0000-00000000000a', 'IDM-003', 'in_stock', 'approved', current_date + 200),
  ('98000000-0000-0000-0000-00000000000b', '20000000-0000-0000-0000-00000000000b', '97000000-0000-0000-0000-00000000000b', 'IDM-B-001', 'in_stock', 'approved', current_date + 200);

create function pg_temp.stops_a(p_cyls integer[]) returns jsonb language sql as $$
  select jsonb_build_array(jsonb_build_object('site_id', '92000000-0000-0000-0000-00000000000a', 'cylinder_ids', (select jsonb_agg(('98000000-0000-0000-0000-' || lpad(c::text, 12, '0'))::uuid) from unnest(p_cyls) c)))
$$;
create function pg_temp.create_a(p_req uuid, p_cyls integer[]) returns jsonb language sql as $$
  select public.create_trip('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000800a2', '20000000-0000-0000-0000-00000000000a', p_req, current_date,
    '95000000-0000-0000-0000-00000000000a', '96000000-0000-0000-0000-00000000000a', null, pg_temp.stops_a(p_cyls))
$$;
create function pg_temp.update_a(p_req uuid, p_trip uuid, p_version bigint, p_cyls integer[]) returns jsonb language sql as $$
  select public.update_trip('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000800a2', '20000000-0000-0000-0000-00000000000a', p_req, p_trip, p_version, current_date,
    '95000000-0000-0000-0000-00000000000a', '96000000-0000-0000-0000-00000000000a', null,
    jsonb_build_array(jsonb_build_object('id', (select s.id from public.trip_stops s where s.trip_id = p_trip and s.status <> 'removed' order by s.position limit 1),
      'site_id', '92000000-0000-0000-0000-00000000000a', 'cylinder_ids', (select jsonb_agg(('98000000-0000-0000-0000-' || lpad(c::text, 12, '0'))::uuid) from unnest(p_cyls) c))))
$$;

-- create_trip.
create temp table req as select gen_random_uuid() as create_req, gen_random_uuid() as update_req, gen_random_uuid() as shared_req;
create temp table c1 as select pg_temp.create_a((select create_req from req), array[1]) as r;
select is((select r ->> 'code' from c1), 'CREATED', 'create_trip: primeira chamada cria');
select is(pg_temp.create_a((select create_req from req), array[1]) ->> 'trip_id', (select r ->> 'trip_id' from c1), 'create_trip: a repetição devolve a mesma viagem');
select is((pg_temp.create_a((select create_req from req), array[1]) ->> 'replayed')::boolean, true, 'create_trip: marcada como repetida');
select is((select count(*)::int from public.trips where organization_id = '20000000-0000-0000-0000-00000000000a'), 1, 'create_trip: nenhuma viagem duplicada');
select is((select count(*)::int from public.trip_items), 1, 'create_trip: nenhum item duplicado');
select is((select count(*)::int from public.trip_events), 1, 'create_trip: nenhum evento duplicado');
select is((select count(*)::int from public.cylinder_events where event_type = 'trip_reserved'), 1, 'create_trip: nenhuma reserva duplicada no cilindro');
select is((select count(*)::int from public.audit_logs where action = 'trip.create'), 1, 'create_trip: nenhuma auditoria duplicada');
select is((select (r ->> 'number')::int from c1), 1, 'create_trip: o número não foi consumido pela repetição');

-- update_trip.
select is(pg_temp.update_a((select update_req from req), (select (r ->> 'trip_id')::uuid from c1), 1, array[1, 2]) ->> 'code', 'UPDATED', 'update_trip: primeira chamada edita');
select is((pg_temp.update_a((select update_req from req), (select (r ->> 'trip_id')::uuid from c1), 1, array[1, 2]) ->> 'replayed')::boolean, true, 'update_trip: a repetição devolve o resultado gravado (mesmo com a versão já avançada)');
select is((select version from public.trips where id = (select (r ->> 'trip_id')::uuid from c1)), 2::bigint, 'update_trip: a versão subiu uma vez só');
select is((select count(*)::int from public.trip_items where item_status = 'planned'), 2, 'update_trip: nenhum item duplicado');

-- REQUEST_REUSED: outra operação e outra viagem.
select is(pg_temp.update_a((select create_req from req), (select (r ->> 'trip_id')::uuid from c1), 2, array[1]) ->> 'code', 'REQUEST_REUSED', 'um request_id de create_trip não vale para update_trip');
select is(pg_temp.create_a((select update_req from req), array[3]) ->> 'code', 'REQUEST_REUSED', 'um request_id de update_trip não vale para create_trip');
create temp table c2 as select pg_temp.create_a((select shared_req from req), array[3]) as r;
select is(pg_temp.update_a((select shared_req from req), (select (r ->> 'trip_id')::uuid from c1), 2, array[1]) ->> 'code', 'REQUEST_REUSED', 'o mesmo request_id em outra viagem');

-- Outra organização não colide: o mesmo request_id vale de novo no Tenant B.
select is(public.create_trip('10000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-0000000800b3', '20000000-0000-0000-0000-00000000000b', (select create_req from req), current_date,
  '95000000-0000-0000-0000-00000000000b', '96000000-0000-0000-0000-00000000000b', null,
  jsonb_build_array(jsonb_build_object('site_id', '92000000-0000-0000-0000-00000000000b', 'cylinder_ids', jsonb_build_array('98000000-0000-0000-0000-00000000000b')))) ->> 'code', 'CREATED', 'o request_id de outra organização não colide');

-- ===== US2: carregamento e início =====
insert into public.cylinders (id, organization_id, cylinder_type_id, serial_number, stock_status, hydro_last_result, hydro_next_due_on)
  select ('98000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid, '20000000-0000-0000-0000-00000000000a', '97000000-0000-0000-0000-00000000000a', 'IDM-' || n, 'in_stock', 'approved', current_date + 200
    from generate_series(11, 16) n;
insert into public.vehicles (id, organization_id, plate, vehicle_type, capacity_cylinders) values
  ('95000000-0000-0000-0000-0000000000a3', '20000000-0000-0000-0000-00000000000a', 'AAA3333', 'truck', 10),
  ('95000000-0000-0000-0000-0000000000a4', '20000000-0000-0000-0000-00000000000a', 'AAA4444', 'truck', 10);
insert into public.drivers (id, organization_id, full_name, cpf_display, cnh_display, cnh_category, cnh_valid_until) values
  ('96000000-0000-0000-0000-0000000000a3', '20000000-0000-0000-0000-00000000000a', 'Motorista A3', 'z', 'z', 'D', current_date + 365),
  ('96000000-0000-0000-0000-0000000000a4', '20000000-0000-0000-0000-00000000000a', 'Motorista A4', 'w', 'w', 'D', current_date + 365);

create function pg_temp.cyl(n integer) returns uuid language sql as $$ select ('98000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid $$;
create function pg_temp.plan2(p_cyls integer[], p_vehicle uuid default '95000000-0000-0000-0000-00000000000a', p_driver uuid default '96000000-0000-0000-0000-00000000000a') returns uuid language sql as $$
  select (public.create_trip('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000800a2', '20000000-0000-0000-0000-00000000000a', gen_random_uuid(), current_date, p_vehicle, p_driver, null,
    jsonb_build_array(jsonb_build_object('site_id', '92000000-0000-0000-0000-00000000000a', 'cylinder_ids', (select jsonb_agg(pg_temp.cyl(c)) from unnest(p_cyls) c)))) ->> 'trip_id')::uuid
$$;
create function pg_temp.item2(p_trip uuid, p_cyl integer) returns uuid language sql as $$ select id from public.trip_items where trip_id = p_trip and cylinder_id = pg_temp.cyl(p_cyl) $$;
create function pg_temp.sl2(p_req uuid, p_trip uuid) returns jsonb language sql as $$
  select public.start_loading('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000800a2', '20000000-0000-0000-0000-00000000000a', p_req, p_trip, (select version from public.trips where id = p_trip)) $$;
create function pg_temp.rl2(p_req uuid, p_trip uuid) returns jsonb language sql as $$
  select public.revert_loading('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000800a2', '20000000-0000-0000-0000-00000000000a', p_req, p_trip, (select version from public.trips where id = p_trip)) $$;
create function pg_temp.st2(p_req uuid, p_trip uuid) returns jsonb language sql as $$
  select public.start_trip('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000800a2', '20000000-0000-0000-0000-00000000000a', p_req, p_trip, (select version from public.trips where id = p_trip)) $$;
create function pg_temp.ck2(p_req uuid, p_trip uuid, p_item uuid) returns jsonb language sql as $$
  select public.check_item('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000800a2', '20000000-0000-0000-0000-00000000000a', p_req, p_trip, p_item) $$;
create function pg_temp.uck2(p_req uuid, p_trip uuid, p_item uuid) returns jsonb language sql as $$
  select public.uncheck_item('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000800a2', '20000000-0000-0000-0000-00000000000a', p_req, p_trip, p_item) $$;
create function pg_temp.rm2(p_req uuid, p_trip uuid, p_item uuid) returns jsonb language sql as $$
  select public.remove_item('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000800a2', '20000000-0000-0000-0000-00000000000a', p_req, p_trip, p_item, 'Retirada de teste') $$;

create temp table rq as select gen_random_uuid() as r1, gen_random_uuid() as r2, gen_random_uuid() as r3, gen_random_uuid() as r4, gen_random_uuid() as r5, gen_random_uuid() as r6;
create temp table u as select pg_temp.plan2(array[11, 12]) as t, pg_temp.plan2(array[13], '95000000-0000-0000-0000-0000000000a3', '96000000-0000-0000-0000-0000000000a3') as t2, pg_temp.plan2(array[14], '95000000-0000-0000-0000-0000000000a4', '96000000-0000-0000-0000-0000000000a4') as t3;

select is(pg_temp.sl2((select r1 from rq), (select t from u)) ->> 'code', 'LOADING', 'start_loading: primeira chamada');
select is((pg_temp.sl2((select r1 from rq), (select t from u)) ->> 'replayed')::boolean, true, 'start_loading: a repetição devolve o resultado gravado');
select is((select version from public.trips where id = (select t from u)) || '/' || (select count(*) from public.trip_events where trip_id = (select t from u) and event_type = 'loading_started'), '2/1', 'start_loading: um só efeito');

select is(pg_temp.ck2((select r2 from rq), (select t from u), pg_temp.item2((select t from u), 11)) ->> 'code', 'CHECKED', 'check_item: primeira chamada');
select is((pg_temp.ck2((select r2 from rq), (select t from u), pg_temp.item2((select t from u), 11)) ->> 'replayed')::boolean, true, 'check_item: a repetição devolve o resultado gravado');
select is((select count(*)::int from public.trip_events where trip_id = (select t from u) and event_type = 'item_checked'), 1, 'check_item: um só evento');

select is(pg_temp.uck2((select r3 from rq), (select t from u), pg_temp.item2((select t from u), 11)) ->> 'code', 'UNCHECKED', 'uncheck_item: primeira chamada');
select is((pg_temp.uck2((select r3 from rq), (select t from u), pg_temp.item2((select t from u), 11)) ->> 'replayed')::boolean, true, 'uncheck_item: a repetição devolve o resultado gravado');
select is((select count(*)::int from public.trip_events where trip_id = (select t from u) and event_type = 'item_unchecked'), 1, 'uncheck_item: um só evento');

select is(pg_temp.rm2((select r4 from rq), (select t from u), pg_temp.item2((select t from u), 12)) ->> 'code', 'REMOVED', 'remove_item: primeira chamada');
select is((pg_temp.rm2((select r4 from rq), (select t from u), pg_temp.item2((select t from u), 12)) ->> 'replayed')::boolean, true, 'remove_item: a repetição devolve o resultado gravado');
select is((select count(*)::int from public.cylinder_events where cylinder_id = pg_temp.cyl(12) and event_type = 'trip_released'), 1, 'remove_item: um só evento no cilindro');

select pg_temp.sl2(gen_random_uuid(), (select t2 from u));
select is(pg_temp.rl2((select r5 from rq), (select t2 from u)) ->> 'code', 'REVERTED', 'revert_loading: primeira chamada');
select is((pg_temp.rl2((select r5 from rq), (select t2 from u)) ->> 'replayed')::boolean, true, 'revert_loading: a repetição devolve o resultado gravado');
select is((select count(*)::int from public.trip_events where trip_id = (select t2 from u) and event_type = 'loading_reverted'), 1, 'revert_loading: um só evento');

select pg_temp.sl2(gen_random_uuid(), (select t3 from u));
select pg_temp.ck2(gen_random_uuid(), (select t3 from u), pg_temp.item2((select t3 from u), 14));
select is(pg_temp.st2((select r6 from rq), (select t3 from u)) ->> 'code', 'STARTED', 'start_trip: primeira chamada');
select is((pg_temp.st2((select r6 from rq), (select t3 from u)) ->> 'replayed')::boolean, true, 'start_trip: a repetição devolve o resultado gravado');
select is((select count(*)::int from public.cylinder_events where cylinder_id = pg_temp.cyl(14) and event_type = 'trip_departed'), 1, 'start_trip: um só evento no cilindro');
select is((select count(*)::int from public.audit_logs where action = 'trip.start' and target_id = (select t3::text from u)), 1, 'start_trip: uma só auditoria');
select is(pg_temp.ck2((select r6 from rq), (select t3 from u), pg_temp.item2((select t3 from u), 14)) ->> 'code', 'REQUEST_REUSED', 'o request_id de start_trip não vale para check_item');

select * from finish();
rollback;
