begin;
select plan(43);

-- Spec 008, US6: histórico da viagem e viagens por cilindro e por unidade (RF-025 a RF-027, CA-006). Hermético: desfeito pelo rollback.
-- O Tenant B e o motorista (sem trip.history) provam o isolamento e as permissões.

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

create temp table q as select pg_temp.sail(jsonb_build_array(pg_temp.stop(1, array[1, 2]), pg_temp.stop(2, array[3])), 1, 1, array[1, 2, 3]) as t;
select pg_temp.arrive((select t from q), 1);
select pg_temp.deliver((select t from q), 1, '[[1, true, null], [2, true, null]]', 'Nome-reservado-QRS', null, null, -23.5501, -46.6331);
create temp table q2 as select pg_temp.sail(jsonb_build_array(pg_temp.stop(1, array[4])), 2, 2, array[4]) as t;

create function pg_temp.hist(p_user uuid, p_session uuid, p_trip uuid, p_type text default null, p_order text default null, p_cursor text default null, p_limit integer default null,
  p_from date default null, p_to date default null, p_org uuid default '20000000-0000-0000-0000-00000000000a') returns jsonb language sql as $$
  select public.trip_history(p_user, p_session, p_org, p_trip, p_type, p_from, p_to, p_order, p_cursor, p_limit)
$$;
create function pg_temp.adm_hist(p_trip uuid, p_type text default null, p_order text default null, p_cursor text default null, p_limit integer default null) returns jsonb language sql as $$
  select pg_temp.hist('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000800a2', p_trip, p_type, p_order, p_cursor, p_limit)
$$;

-- trip_history: permissão, isolamento e validação.
select is(pg_temp.hist('10000000-0000-0000-0000-0000000008c1', '60000000-0000-0000-0000-0000000800c1', (select t from q)) ->> 'code', 'ACCESS_DENIED', 'o motorista não tem trip.history');
select is(pg_temp.hist('10000000-0000-0000-0000-0000000008d1', '60000000-0000-0000-0000-0000000800d1', (select t from q)) ->> 'code', 'LISTED', 'o auditor consulta o histórico');
select is(pg_temp.hist('10000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-0000000800b3', (select t from q), p_org => '20000000-0000-0000-0000-00000000000b') ->> 'code', 'NOT_FOUND', 'o Tenant B não enxerga a viagem do Tenant A');
select is(pg_temp.hist('10000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-0000000800b3', (select t from q)) ->> 'code', 'ACCESS_DENIED', 'e não consulta o Tenant A com a sessão do B');
select is(pg_temp.adm_hist(gen_random_uuid()) ->> 'code', 'NOT_FOUND', 'viagem inexistente: NOT_FOUND');
select is(pg_temp.adm_hist((select t from q), 'inventado') ->> 'code', 'VALIDATION_FAILED', 'tipo de evento desconhecido é recusado');
select is(pg_temp.adm_hist((select t from q), p_order => 'lado') ->> 'code', 'VALIDATION_FAILED', 'ordem desconhecida é recusada');
select is(pg_temp.adm_hist((select t from q), p_cursor => 'lixo') ->> 'code', 'VALIDATION_FAILED', 'cursor inválido é recusado');

-- Ordem e paginação por sequência.
select is(jsonb_array_length(pg_temp.adm_hist((select t from q)) -> 'events'), (select count(*)::int from public.trip_events where trip_id = (select t from q)), 'sem filtro devolve todos os eventos da viagem');
select is((pg_temp.adm_hist((select t from q), p_order => 'asc') -> 'events' -> 0 ->> 'event_type'), 'trip_created', 'crescente começa por trip_created');
select is((pg_temp.adm_hist((select t from q)) -> 'events' -> 0 ->> 'sequence')::int, (select max(sequence)::int from public.trip_events where trip_id = (select t from q)), 'decrescente (padrão) começa pelo mais recente');
select is((pg_temp.adm_hist((select t from q), p_limit => 2) -> 'events' -> 0 ->> 'sequence')::int, (select max(sequence)::int from public.trip_events where trip_id = (select t from q)), 'página de 2 começa pelo mais recente');
select isnt(pg_temp.adm_hist((select t from q), p_limit => 2) ->> 'next', null, 'e traz o cursor da próxima página');

create function pg_temp.all_pages(p_trip uuid, p_order text, p_limit integer) returns integer[] language plpgsql as $$
declare r jsonb; c text := null; s integer[] := '{}'; e jsonb;
begin
  loop
    r := pg_temp.adm_hist(p_trip, null, p_order, c, p_limit);
    for e in select value from jsonb_array_elements(r -> 'events') loop s := s || (e ->> 'sequence')::integer; end loop;
    c := r ->> 'next';
    exit when c is null;
  end loop;
  return s;
end $$;
select is(pg_temp.all_pages((select t from q), 'asc', 2), (select array_agg(sequence::integer order by sequence) from public.trip_events where trip_id = (select t from q)), 'percorrer as páginas crescentes cobre cada evento uma vez, em ordem');
select is(pg_temp.all_pages((select t from q), 'desc', 3), (select array_agg(sequence::integer order by sequence desc) from public.trip_events where trip_id = (select t from q)), 'e as decrescentes também');

-- Filtros por tipo e período.
select is((select count(*)::int from jsonb_array_elements(pg_temp.adm_hist((select t from q), 'item_checked') -> 'events') e where e ->> 'event_type' <> 'item_checked'), 0, 'o filtro por tipo devolve só aquele tipo');
select is(jsonb_array_length(pg_temp.adm_hist((select t from q), 'item_checked') -> 'events'), 3, 'três conferências na viagem');
select is(jsonb_array_length(pg_temp.hist('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000800a2', (select t from q), p_from => current_date + 2) -> 'events'), 0, 'período no futuro: nada');
select is(jsonb_array_length(pg_temp.hist('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000800a2', (select t from q), p_from => current_date - 1, p_to => current_date + 1) -> 'events') > 0, true, 'período que cobre hoje: traz eventos');

-- Sem dado pessoal, e o autor aparece pelo nome de exibição.
select is(pg_temp.adm_hist((select t from q))::text !~* 'Nome-reservado|-23\.55', true, 'o histórico não traz o nome do recebedor nem a posição');
select isnt(pg_temp.adm_hist((select t from q)) -> 'events' -> 0 ->> 'actor_name', null, 'o evento traz o nome de quem agiu');

-- Imutabilidade do histórico.
select throws_ok($$update public.trip_events set event_type = 'trip_cancelled' where trip_id = (select t from q)$$, null, null, 'o histórico da viagem não se altera');
select throws_ok($$delete from public.trip_events where trip_id = (select t from q)$$, null, null, 'nem se apaga');

-- trips_of_cylinder.
create function pg_temp.oc(p_user uuid, p_session uuid, p_cyl uuid, p_org uuid default '20000000-0000-0000-0000-00000000000a') returns jsonb language sql as $$
  select public.trips_of_cylinder(p_user, p_session, p_org, p_cyl, null, null)
$$;
select is(pg_temp.oc('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000800a2', pg_temp.cy(1)) ->> 'code', 'LISTED', 'viagens do cilindro 1');
select is(jsonb_array_length(pg_temp.oc('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000800a2', pg_temp.cy(1)) -> 'items'), 1, 'o cilindro 1 esteve em uma viagem');
select is(pg_temp.oc('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000800a2', pg_temp.cy(1)) -> 'items' -> 0 ->> 'item_status', 'delivered', 'com a situação dele na viagem');
select is(jsonb_array_length(pg_temp.oc('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000800a2', pg_temp.cy(10)) -> 'items'), 0, 'cilindro sem viagem: lista vazia');
select is(pg_temp.oc('10000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-0000000800b3', pg_temp.cy(1), '20000000-0000-0000-0000-00000000000b') ->> 'code', 'NOT_FOUND', 'o Tenant B não enxerga o cilindro do A');
select is(pg_temp.oc('10000000-0000-0000-0000-0000000008c1', '60000000-0000-0000-0000-0000000800c1', pg_temp.cy(1)) ->> 'code', 'ACCESS_DENIED', 'o motorista não tem a leitura exigida');
select is(pg_temp.oc('10000000-0000-0000-0000-0000000008d1', '60000000-0000-0000-0000-0000000800d1', pg_temp.cy(1)) ->> 'code', 'LISTED', 'o auditor consulta');
select is(pg_temp.oc('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000800a2', gen_random_uuid()) ->> 'code', 'NOT_FOUND', 'cilindro inexistente: NOT_FOUND');
select is(pg_temp.oc('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000800a2', pg_temp.cy(1))::text !~* 'Nome-reservado', true, 'sem o nome do recebedor');

-- trips_of_site.
create function pg_temp.os(p_user uuid, p_session uuid, p_site integer, p_org uuid default '20000000-0000-0000-0000-00000000000a', p_limit integer default null, p_cursor text default null) returns jsonb language sql as $$
  select public.trips_of_site(p_user, p_session, p_org, ('92000000-0000-0000-0000-' || lpad(p_site::text, 12, '0'))::uuid, p_cursor, p_limit)
$$;
select is(jsonb_array_length(pg_temp.os('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000800a2', 1) -> 'items'), 2, 'a unidade 1 recebeu duas viagens');
select is(jsonb_array_length(pg_temp.os('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000800a2', 2) -> 'items'), 1, 'a unidade 2, uma');
select is(jsonb_array_length(pg_temp.os('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000800a2', 3) -> 'items'), 0, 'a unidade 3, nenhuma');
select is((pg_temp.os('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000800a2', 1) -> 'items' -> 0 ->> 'number')::int > (pg_temp.os('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000800a2', 1) -> 'items' -> 1 ->> 'number')::int, true, 'da mais recente para a mais antiga');
select is(pg_temp.os('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000800a2', 1, p_limit => 1) ->> 'next' is not null, true, 'limite de 1 traz o cursor');
select is(jsonb_array_length(pg_temp.os('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000800a2', 1, p_cursor => pg_temp.os('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000800a2', 1, p_limit => 1) ->> 'next') -> 'items'), 1, 'e a segunda página tem a outra viagem');
select is(pg_temp.os('10000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-0000000800b3', 1, '20000000-0000-0000-0000-00000000000b') ->> 'code', 'NOT_FOUND', 'o Tenant B não enxerga a unidade do A');
select is(pg_temp.os('10000000-0000-0000-0000-0000000008c1', '60000000-0000-0000-0000-0000000800c1', 1) ->> 'code', 'ACCESS_DENIED', 'o motorista não tem a leitura exigida');
select is(pg_temp.os('10000000-0000-0000-0000-0000000008d1', '60000000-0000-0000-0000-0000000800d1', 1) ->> 'code', 'LISTED', 'o auditor consulta');
select is(pg_temp.os('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000800a2', 1, p_cursor => 'lixo') ->> 'code', 'VALIDATION_FAILED', 'cursor inválido é recusado');

-- list_trips por cilindro ou unidade não vaza nada entre tenants: o B não tem viagem alguma.
select is((public.list_trips('10000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-0000000800b3', '20000000-0000-0000-0000-00000000000b', null, null, null, null, null, null, null, null, null, null, null) ->> 'code'), 'LISTED', 'o Tenant B lista as próprias viagens');

select * from finish();
rollback;
