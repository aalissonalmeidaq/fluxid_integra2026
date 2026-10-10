begin;
select plan(64);

-- Spec 008, US3: chegada e entrega por parada, divergência e correção (RF-013 a RF-015, RF-024, CA-004). Hermético: desfeito pelo rollback.
-- Ator: administrador do Tenant A. O Tenant B, o motorista e o auditor provam o isolamento e as permissões.

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

create temp table k as select pg_temp.sail(jsonb_build_array(pg_temp.stop(1, array[1, 2]), pg_temp.stop(2, array[3]), pg_temp.stop(3, array[4])), 1, 1, array[1, 2, 3, 4]) as t;

-- 1. Chegada.
select is(pg_temp.arrive((select t from k), 2) ->> 'code', 'ARRIVED', 'arrive_stop em qualquer ordem: chega na parada 2 primeiro');
select is((pg_temp.arrive((select t from k), 3) ->> 'out_of_order')::boolean, true, 'chegar na parada 3 com a 1 pendente também é fora da ordem');
select is((select out_of_order from public.trip_stops where id = pg_temp.stop_id((select t from k), 2)), true, 'a parada 2 foi marcada fora da ordem');
select is((select position from public.trip_stops where id = pg_temp.stop_id((select t from k), 2)), 2::smallint, 'e a posição planejada não mudou');
select is((select (data ->> 'out_of_order')::boolean from public.trip_events where trip_id = (select t from k) and event_type = 'stop_arrived' order by sequence limit 1), true, 'o evento stop_arrived leva a marca');
select is(pg_temp.arrive((select t from k), 1) ->> 'out_of_order', 'false', 'a parada 1, a primeira da ordem, não é fora da ordem');
select is((select status from public.trip_stops where id = pg_temp.stop_id((select t from k), 1)), 'on_site', 'chegou ao local');
select is(pg_temp.arrive((select t from k), 1) ->> 'code', 'INVALID_TRANSITION', 'chegar de novo: INVALID_TRANSITION');
select is((select count(*)::int from public.audit_logs where action = 'trip.arrive_stop' and target_id = (select t::text from k)), 3, 'uma auditoria por chegada');

-- 2. Entrega só com a parada no local; validações sem gravar nada.
create temp table k0 as select pg_temp.sail(jsonb_build_array(pg_temp.stop(4, array[30])), 2, 2, array[30]) as t;
select is(pg_temp.deliver((select t from k0), 1, '[[30, true, null]]') ->> 'code', 'INVALID_TRANSITION', 'entregar numa parada que ainda não chegou');
select pg_temp.arrive((select t from k0), 1);
select is(pg_temp.deliver((select t from k), 1, '[[1, true, null], [2, true, null]]', 'A') ->> 'code', 'VALIDATION_FAILED', 'nome do recebedor com 1 caractere');
select is(pg_temp.deliver((select t from k), 1, '[[1, true, null], [2, true, null]]', repeat('n', 121)) ->> 'code', 'VALIDATION_FAILED', 'nome do recebedor com 121 caracteres');
select is(pg_temp.deliver((select t from k), 1, '[[1, true, null], [2, true, null]]', 'Recebedor Fictício', repeat('f', 81)) ->> 'code', 'VALIDATION_FAILED', 'função com 81 caracteres');
select is(pg_temp.deliver((select t from k), 1, '[[1, true, null], [2, true, null]]', 'Recebedor Fictício', null, now() + interval '2 hours') ->> 'code', 'VALIDATION_FAILED', 'horário no futuro');
select is(pg_temp.deliver((select t from k), 1, '[[1, true, null], [2, true, null]]', 'Recebedor Fictício', null, null, -23.5, null) ->> 'code', 'VALIDATION_FAILED', 'latitude sem longitude');
select is(pg_temp.deliver((select t from k), 1, '[[1, true, null], [2, true, null]]', 'Recebedor Fictício', null, null, 91, -46.6) ->> 'code', 'VALIDATION_FAILED', 'posição fora do intervalo');
select is(pg_temp.deliver((select t from k), 1, '[[1, true, null]]') ->> 'code', 'VALIDATION_FAILED', 'falta o resultado de um cilindro da parada');
select is(pg_temp.deliver((select t from k), 1, '[[1, true, null], [3, true, null]]') ->> 'code', 'VALIDATION_FAILED', 'cilindro de outra parada não estava previsto aqui');
select is(pg_temp.deliver((select t from k), 1, '[[1, true, null], [2, false, null]]') ->> 'code', 'VALIDATION_FAILED', 'não entregue sem motivo');
select is(pg_temp.deliver((select t from k), 1, '[[1, true, null], [2, false, "ruim"]]') ->> 'code', 'VALIDATION_FAILED', 'motivo com menos de 5 caracteres também é recusado');
select is(pg_temp.deliver((select t from k), 1, '[[1, true, null], [2, true, null]]') ->> 'code', 'DELIVERED', 'entrega completa da parada 1');
select is((select count(*)::int from public.trip_deliveries where stop_id = pg_temp.stop_id((select t from k), 1)), 1, 'só a entrega válida foi gravada (as recusas não gravam nada)');

-- 3. Efeitos da entrega completa.
select is((select status from public.trip_stops where id = pg_temp.stop_id((select t from k), 1)), 'delivered', 'parada entregue');
select isnt((select closed_at from public.trip_stops where id = pg_temp.stop_id((select t from k), 1)), null, 'com fechamento registrado');
select is((select count(*)::int from public.trip_items where trip_id = (select t from k) and cylinder_id in (pg_temp.cy(1), pg_temp.cy(2)) and item_status = 'delivered'), 2, 'itens entregues');
select is((select custody_status || '/' || custody_site_id::text from public.cylinders where id = pg_temp.cy(1)), 'at_customer/92000000-0000-0000-0000-000000000001', 'cilindro no cliente, na unidade da parada');
select is((select stock_status from public.cylinders where id = pg_temp.cy(1)), 'out_of_stock', 'e continua fora do estoque');
select is((select count(*)::int from public.cylinder_events where cylinder_id in (pg_temp.cy(1), pg_temp.cy(2)) and event_type = 'trip_delivered'), 2, 'evento trip_delivered em cada cilindro');
select is((select lock_status from public.trip_items where id = pg_temp.item((select t from k), 1)), 'locked', 'a entrega não mexe no bloqueio (independente)');
select is(pg_temp.deliver((select t from k), 1, '[[1, true, null], [2, true, null]]') ->> 'code', 'STOP_CLOSED', 'parada fechada: STOP_CLOSED');
select is(pg_temp.arrive((select t from k), 1) ->> 'code', 'STOP_CLOSED', 'e não aceita nova chegada');

-- 4. Divergência: um cilindro não entregue.
select is(pg_temp.deliver((select t from k), 2, '[[3, false, "Cliente sem espaço para receber"]]', 'Outra Pessoa Fictícia', 'Enfermeira') ->> 'stop_status', 'with_divergence', 'parada 2 com divergência');
select is((select item_status || '/' || divergence_reason from public.trip_items where id = pg_temp.item((select t from k), 3)), 'not_delivered/Cliente sem espaço para receber', 'item não entregue com o motivo');
select is((select custody_status from public.cylinders where id = pg_temp.cy(3)), 'in_transit', 'o cilindro não entregue continua em trânsito');
select is((select count(*)::int from public.cylinder_events where cylinder_id = pg_temp.cy(3) and event_type = 'trip_delivered'), 0, 'sem evento de entrega para ele');
select is((select count(*)::int from public.trip_items where cylinder_id = pg_temp.cy(3) and is_open), 1, 'e a reserva dele continua aberta');

-- 5. Correção: novo registro, original preservado.
create temp table orig as select id from public.trip_deliveries where stop_id = pg_temp.stop_id((select t from k), 2);
select is(pg_temp.deliver((select t from k), 2, '[[3, true, null]]', 'Pessoa Que Recebeu Depois', null, null, null, null, (select id from orig)) ->> 'stop_status', 'delivered', 'a correção que entrega o que faltava fecha a parada como entregue');
select is((select count(*)::int from public.trip_deliveries where stop_id = pg_temp.stop_id((select t from k), 2)), 2, 'dois registros: o original e a correção');
select is((select recipient_name from public.trip_deliveries where id = (select id from orig)), 'Outra Pessoa Fictícia', 'o original continua intacto');
select is((select count(*)::int from public.trip_deliveries where supersedes_id = (select id from orig)), 1, 'a correção aponta o original');
select is((select item_status from public.trip_items where id = pg_temp.item((select t from k), 3)), 'delivered', 'o item corrigido foi entregue');
select is((select custody_status from public.cylinders where id = pg_temp.cy(3)), 'at_customer', 'e o cilindro foi para o cliente');
select is((select count(*)::int from public.trip_events where trip_id = (select t from k) and event_type = 'delivery_corrected'), 1, 'evento delivery_corrected');
select is((select count(*)::int from public.audit_logs where action = 'trip.correct_delivery'), 1, 'auditoria trip.correct_delivery');
select is(pg_temp.deliver((select t from k), 2, '[]', 'Terceira Pessoa Fictícia', null, null, null, null, (select id from orig)) ->> 'code', 'VALIDATION_FAILED', 'corrigir de novo o registro já corrigido é recusado');
select is(pg_temp.deliver((select t from k), 2, '[]', 'Pessoa Corrigida Fictícia', null, null, null, null, (select id from public.trip_deliveries where supersedes_id = (select id from orig))) ->> 'code', 'DELIVERED', 'correção só de dados (sem cilindros) do registro mais recente');
select is((select count(*)::int from public.trip_deliveries where stop_id = pg_temp.stop_id((select t from k), 2)), 3, 'três registros, nenhum apagado');
select is(pg_temp.deliver((select t from k), 1, '[]', 'Qualquer Pessoa', null, null, null, null, gen_random_uuid()) ->> 'code', 'NOT_FOUND', 'correção que aponta registro inexistente');

-- 6. Estado da viagem.
create temp table kl as select (public.create_trip('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000800a2', '20000000-0000-0000-0000-00000000000a', gen_random_uuid(), current_date,
  '95000000-0000-0000-0000-000000000003', '96000000-0000-0000-0000-000000000003', null, jsonb_build_array(pg_temp.stop(4, array[31]))) ->> 'trip_id')::uuid as t;
select is(pg_temp.arrive((select t from kl), 1) ->> 'code', 'INVALID_TRANSITION', 'chegar numa viagem planejada');
select is(pg_temp.deliver((select t from kl), 1, '[[31, true, null]]') ->> 'code', 'INVALID_TRANSITION', 'entregar numa viagem que não saiu');
update public.trips set status = 'completed', started_at = now(), started_by = '10000000-0000-0000-0000-000000000002', completed_at = now(), completed_by = '10000000-0000-0000-0000-000000000002'
  where id = (select t from kl);
select is(pg_temp.arrive((select t from kl), 1) ->> 'code', 'TRIP_CLOSED', 'chegar numa viagem concluída: TRIP_CLOSED');
select is(pg_temp.deliver((select t from kl), 1, '[[31, true, null]]') ->> 'code', 'TRIP_CLOSED', 'entregar numa viagem concluída: TRIP_CLOSED');

-- 7. Idempotência e permissões.
create temp table k2 as select pg_temp.sail(jsonb_build_array(pg_temp.stop(1, array[10]), pg_temp.stop(2, array[11])), 4, 4, array[10, 11]) as t, gen_random_uuid() as req;
select pg_temp.arrive((select t from k2), 1);
select is(pg_temp.deliver((select t from k2), 1, '[[10, true, null]]', 'Recebedor Fictício', null, null, null, null, null, (select req from k2)) ->> 'code', 'DELIVERED', 'primeira chamada entrega');
select is((pg_temp.deliver((select t from k2), 1, '[[10, true, null]]', 'Recebedor Fictício', null, null, null, null, null, (select req from k2)) ->> 'replayed')::boolean, true, 'a repetição devolve o resultado gravado');
select is((select count(*)::int from public.trip_deliveries where stop_id = pg_temp.stop_id((select t from k2), 1)), 1, 'sem entrega duplicada');
select is((select count(*)::int from public.cylinder_events where cylinder_id = pg_temp.cy(10) and event_type = 'trip_delivered'), 1, 'sem evento duplicado no cilindro');
select pg_temp.arrive((select t from k2), 2);
select is(pg_temp.deliver((select t from k2), 2, '[[11, false, "Cliente fechado no horário"]]', 'Recebedor Fictício') ->> 'stop_status', 'with_divergence', 'a segunda parada, com pedido novo, fecha com divergência');

-- Permissões e isolamento.
create temp table k3 as select pg_temp.sail(jsonb_build_array(pg_temp.stop(1, array[20])), 5, 5, array[20]) as t;
select is(pg_temp.arrive((select t from k3), 1, '10000000-0000-0000-0000-0000000008c1', '60000000-0000-0000-0000-0000000800c1') ->> 'code', 'ACCESS_DENIED', 'motorista não registra chegada');
select is(pg_temp.arrive((select t from k3), 1, '10000000-0000-0000-0000-0000000008d1', '60000000-0000-0000-0000-0000000800d1') ->> 'code', 'ACCESS_DENIED', 'auditor não registra chegada');
select pg_temp.arrive((select t from k3), 1);
select is(pg_temp.deliver((select t from k3), 1, '[[20, true, null]]', 'Recebedor Fictício', null, null, null, null, null, gen_random_uuid(), '10000000-0000-0000-0000-0000000008d1', '60000000-0000-0000-0000-0000000800d1') ->> 'code', 'ACCESS_DENIED', 'auditor não registra entrega');
select is(pg_temp.deliver((select t from k3), 1, '[[20, true, null]]', 'Recebedor Fictício', null, null, null, null, null, gen_random_uuid(), '10000000-0000-0000-0000-0000000008c1', '60000000-0000-0000-0000-0000000800c1') ->> 'code', 'ACCESS_DENIED', 'motorista não registra entrega');
select is(pg_temp.arrive((select t from k3), 1, '10000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-0000000800b3', '20000000-0000-0000-0000-00000000000b') ->> 'code', 'NOT_FOUND', 'o Tenant B não alcança a viagem do A');
select is(pg_temp.deliver((select t from k3), 1, '[[20, true, null]]', 'Recebedor Fictício', null, null, null, null, null, gen_random_uuid(), '10000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-0000000800b3', '20000000-0000-0000-0000-00000000000b') ->> 'code', 'NOT_FOUND', 'nem entrega nela');
select is((select status from public.trip_stops where id = pg_temp.stop_id((select t from k3), 1)), 'on_site', 'e a parada continua como estava');

select * from finish();
rollback;
