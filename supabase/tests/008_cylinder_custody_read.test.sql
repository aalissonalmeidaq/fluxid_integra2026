begin;
select plan(13);

-- Spec 008, US6: a custódia aparece na lista e no detalhe do cilindro, com a unidade quando está no cliente, e a lista filtra por custódia (RF-024).

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

create temp table cr as select pg_temp.sail(jsonb_build_array(pg_temp.stop(1, array[1, 2]), pg_temp.stop(2, array[3])), 1, 1, array[1, 2, 3]) as t;
select pg_temp.arrive((select t from cr), 1);
select pg_temp.deliver((select t from cr), 1, '[[1, true, null], [2, false, "Sem espaço"]]', 'Recebedor Fictício');

create function pg_temp.lc(p_custody text default null, p_org uuid default '20000000-0000-0000-0000-00000000000a', p_user uuid default '10000000-0000-0000-0000-000000000002', p_session uuid default '60000000-0000-0000-0000-0000000800a2') returns jsonb language sql as $$
  select public.query_cylinders_list(p_user, p_session, p_org, null, 'all', null, null, null, null, null, 100, p_custody)
$$;
create function pg_temp.gc(p_cyl integer) returns jsonb language sql as $$
  select public.query_cylinder_get('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000800a2', '20000000-0000-0000-0000-00000000000a', pg_temp.cy(p_cyl)) -> 'cylinder'
$$;

select is((public.query_cylinders_list('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000800a2', '20000000-0000-0000-0000-00000000000a', null, 'all', null, null, null, null, null, 100) ->> 'code'), 'LISTED', 'sem o filtro a lista continua igual (onze argumentos nomeados antigos seguem valendo pelo padrão)');
select is((pg_temp.gc(1) ->> 'custody_status'), 'at_customer', 'detalhe: cilindro entregue está no cliente');
select is((pg_temp.gc(1) -> 'custody_site' ->> 'name'), 'Unidade 1', 'com a unidade do cliente');
select is((pg_temp.gc(3) ->> 'custody_status'), 'in_transit', 'detalhe: o que ainda está na viagem em andamento está em trânsito');
select is(pg_temp.gc(3) -> 'custody_site', 'null'::jsonb, 'e sem unidade');
select is((pg_temp.gc(10) ->> 'custody_status'), 'in_organization', 'detalhe: cilindro sem viagem está na organização');
select is((select count(*)::int from jsonb_array_elements(pg_temp.lc('at_customer') -> 'items') i where i ->> 'custody_status' = 'at_customer'), 1, 'filtro no cliente: um cilindro');
select is(jsonb_array_length(pg_temp.lc('at_customer') -> 'items'), 1, 'e só ele');
select is((pg_temp.lc('in_transit') ->> 'total')::int, 2, 'filtro em trânsito: o não entregue e o da parada 2');
select is((pg_temp.lc('in_organization') ->> 'total')::int, 37, 'filtro na organização: os outros 37');
select is((pg_temp.lc() ->> 'total')::int, 40, 'sem filtro: os 40');
select is(pg_temp.lc('perdido') ->> 'code', 'VALIDATION_FAILED', 'custódia desconhecida é recusada');
select is(pg_temp.lc('at_customer', '20000000-0000-0000-0000-00000000000b', '10000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-0000000800b3') ->> 'total', '0', 'o Tenant B não vê cilindro nenhum do A no cliente');

select * from finish();
rollback;
