begin;
select plan(90);

-- Spec 008, US2: carregamento, conferência, retirada com exceção e início da viagem (RF-007, RF-010 a RF-012, RF-024, RF-006a, CA-004).
-- Hermético: desfeito pelo rollback.

delete from public.user_sessions where user_id in (
  '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000003');
select public.start_user_session('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000800a2', 'aal1');

-- Gestor logístico (trip.operate, sem trip.exception) e operador de estoque (trip.operate, sem trip.exception e sem trip.write).
insert into auth.users (id, aud, role, email) values
  ('10000000-0000-0000-0000-0000000008e1', 'authenticated', 'authenticated', 'trip-logistics@example.invalid'),
  ('10000000-0000-0000-0000-0000000008f1', 'authenticated', 'authenticated', 'trip-stock@example.invalid'),
  ('10000000-0000-0000-0000-0000000008c1', 'authenticated', 'authenticated', 'trip-driver@example.invalid');
insert into public.profiles (user_id, display_name) values
  ('10000000-0000-0000-0000-0000000008e1', 'Gestor Logístico'), ('10000000-0000-0000-0000-0000000008f1', 'Operador de Estoque'), ('10000000-0000-0000-0000-0000000008c1', 'Motorista Viagens');
insert into public.memberships (id, organization_id, user_id, status, activated_at) values
  ('30000000-0000-0000-0000-0000000008e1', '20000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-0000000008e1', 'active', now()),
  ('30000000-0000-0000-0000-0000000008f1', '20000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-0000000008f1', 'active', now()),
  ('30000000-0000-0000-0000-0000000008c1', '20000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-0000000008c1', 'active', now());
insert into public.membership_roles (membership_id, role_id, assigned_by)
  select '30000000-0000-0000-0000-0000000008e1', r.id, '10000000-0000-0000-0000-000000000001' from public.roles r where r.organization_id = '20000000-0000-0000-0000-00000000000a' and r.code = 'logistics_manager';
insert into public.membership_roles (membership_id, role_id, assigned_by)
  select '30000000-0000-0000-0000-0000000008f1', r.id, '10000000-0000-0000-0000-000000000001' from public.roles r where r.organization_id = '20000000-0000-0000-0000-00000000000a' and r.code = 'stock_operator';
insert into public.membership_roles (membership_id, role_id, assigned_by)
  select '30000000-0000-0000-0000-0000000008c1', r.id, '10000000-0000-0000-0000-000000000001' from public.roles r where r.organization_id = '20000000-0000-0000-0000-00000000000a' and r.code = 'driver';
select public.start_user_session('10000000-0000-0000-0000-0000000008e1', '60000000-0000-0000-0000-0000000800e1', 'aal1');
select public.start_user_session('10000000-0000-0000-0000-0000000008f1', '60000000-0000-0000-0000-0000000800f1', 'aal1');
select public.start_user_session('10000000-0000-0000-0000-0000000008c1', '60000000-0000-0000-0000-0000000800c1', 'aal1');

insert into public.customers (id, organization_id, person_type, document_display, legal_name, segment) values
  ('91000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', 'legal', '11222333000181', 'Hospital Alfa Ltda', 'hospital'),
  ('91000000-0000-0000-0000-0000000000a2', '20000000-0000-0000-0000-00000000000a', 'legal', '22333444000181', 'Clínica Beta Ltda', 'clinic'),
  ('91000000-0000-0000-0000-0000000000a3', '20000000-0000-0000-0000-00000000000a', 'individual', '***.***.***-11', 'Pessoa Física Fictícia', 'clinic');
insert into public.customer_sites (id, organization_id, customer_id, name, postal_code, street, number, city, state) values
  ('92000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-00000000000a', '91000000-0000-0000-0000-00000000000a', 'Unidade 1', '01001000', 'Praça da Sé', '1', 'São Paulo', 'SP'),
  ('92000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-00000000000a', '91000000-0000-0000-0000-00000000000a', 'Unidade 2', '01001000', 'Praça da Sé', '2', 'São Paulo', 'SP'),
  ('92000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-00000000000a', '91000000-0000-0000-0000-0000000000a2', 'Unidade da clínica', '01001000', 'Praça da Sé', '3', 'São Paulo', 'SP'),
  ('92000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-00000000000a', '91000000-0000-0000-0000-0000000000a3', 'Residência', '01001000', 'Rua Fictícia', '4', 'Santos', 'SP');
insert into public.vehicles (id, organization_id, plate, vehicle_type, capacity_cylinders)
  select ('95000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid, '20000000-0000-0000-0000-00000000000a', 'AAA' || (1000 + n), 'truck', 10 from generate_series(1, 9) n;
insert into public.drivers (id, organization_id, full_name, cpf_display, cnh_display, cnh_category, cnh_valid_until)
  select ('96000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid, '20000000-0000-0000-0000-00000000000a', 'Motorista ' || n, 'x' || n, 'y' || n, 'D', current_date + 365 from generate_series(1, 9) n;
insert into public.cylinder_types (id, organization_id, gas, capacity_value, capacity_unit, classification) values
  ('97000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', 'Oxigênio', 10, 'l', 'medicinal');
insert into public.cylinders (id, organization_id, cylinder_type_id, serial_number, stock_status, hydro_last_result, hydro_next_due_on)
  select ('98000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid, '20000000-0000-0000-0000-00000000000a', '97000000-0000-0000-0000-00000000000a', 'LDG-' || lpad(n::text, 3, '0'), 'in_stock', 'approved', current_date + 200
    from generate_series(1, 60) n;

create function pg_temp.cy(n integer) returns uuid language sql as $$ select ('98000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid $$;
create function pg_temp.stop(p_site integer, p_cyls integer[]) returns jsonb language sql as $$
  select jsonb_build_object('site_id', ('92000000-0000-0000-0000-' || lpad(p_site::text, 12, '0'))::uuid, 'cylinder_ids', (select jsonb_agg(pg_temp.cy(c)) from unnest(p_cyls) c))
$$;
-- Ator padrão: administrador do A. Os papéis restritos passam o usuário e a sessão.
create function pg_temp.plan(p_stops jsonb, p_vehicle integer, p_driver integer) returns uuid language sql as $$
  select (public.create_trip('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000800a2', '20000000-0000-0000-0000-00000000000a', gen_random_uuid(), current_date,
    ('95000000-0000-0000-0000-' || lpad(p_vehicle::text, 12, '0'))::uuid, ('96000000-0000-0000-0000-' || lpad(p_driver::text, 12, '0'))::uuid, null, p_stops) ->> 'trip_id')::uuid
$$;
create function pg_temp.ver(p_trip uuid) returns bigint language sql as $$ select version from public.trips where id = p_trip $$;
create function pg_temp.sl(p_trip uuid, p_version bigint default null) returns jsonb language sql as $$
  select public.start_loading('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000800a2', '20000000-0000-0000-0000-00000000000a', gen_random_uuid(), p_trip, coalesce(p_version, pg_temp.ver(p_trip)))
$$;
create function pg_temp.rl(p_trip uuid) returns jsonb language sql as $$
  select public.revert_loading('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000800a2', '20000000-0000-0000-0000-00000000000a', gen_random_uuid(), p_trip, pg_temp.ver(p_trip))
$$;
create function pg_temp.item(p_trip uuid, p_cyl integer) returns uuid language sql as $$ select id from public.trip_items where trip_id = p_trip and cylinder_id = pg_temp.cy(p_cyl) $$;
create function pg_temp.ck(p_trip uuid, p_cyl integer) returns jsonb language sql as $$
  select public.check_item('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000800a2', '20000000-0000-0000-0000-00000000000a', gen_random_uuid(), p_trip, pg_temp.item(p_trip, p_cyl))
$$;
create function pg_temp.uck(p_trip uuid, p_cyl integer) returns jsonb language sql as $$
  select public.uncheck_item('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000800a2', '20000000-0000-0000-0000-00000000000a', gen_random_uuid(), p_trip, pg_temp.item(p_trip, p_cyl))
$$;
create function pg_temp.rm(p_user uuid, p_session uuid, p_trip uuid, p_cyl integer, p_reason text) returns jsonb language sql as $$
  select public.remove_item(p_user, p_session, '20000000-0000-0000-0000-00000000000a', gen_random_uuid(), p_trip, pg_temp.item(p_trip, p_cyl), p_reason)
$$;
create function pg_temp.st(p_trip uuid, p_version bigint default null) returns jsonb language sql as $$
  select public.start_trip('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000800a2', '20000000-0000-0000-0000-00000000000a', gen_random_uuid(), p_trip, coalesce(p_version, pg_temp.ver(p_trip)))
$$;
-- Viagem pronta para iniciar: carregando, com todos os cilindros conferidos.
create function pg_temp.ready(p_stops jsonb, p_vehicle integer, p_driver integer, p_cyls integer[]) returns uuid language plpgsql as $$
declare t uuid := pg_temp.plan(p_stops, p_vehicle, p_driver); c integer;
begin
  perform pg_temp.sl(t);
  foreach c in array p_cyls loop perform pg_temp.ck(t, c); end loop;
  return t;
end $$;
create function pg_temp.status_of(p_trip uuid) returns text language sql as $$ select status from public.trips where id = p_trip $$;

-- 1. Iniciar o carregamento.
create temp table k as select pg_temp.plan(jsonb_build_array(pg_temp.stop(1, array[1, 2]), pg_temp.stop(2, array[3])), 1, 1) as t1,
  pg_temp.plan(jsonb_build_array(pg_temp.stop(1, array[4])), 1, 2) as t2, pg_temp.plan(jsonb_build_array(pg_temp.stop(1, array[5])), 2, 1) as t3,
  pg_temp.plan(jsonb_build_array(pg_temp.stop(1, array[6])), 3, 3) as t4;
select is((pg_temp.sl((select t1 from k)) ->> 'code'), 'LOADING', 'start_loading: planned → loading');
select is(pg_temp.status_of((select t1 from k)), 'loading', 'a viagem está carregando');
select is((select version from public.trips where id = (select t1 from k)), 2::bigint, 'a versão subiu');
select is((select count(*)::int from public.trip_events where trip_id = (select t1 from k) and event_type = 'loading_started'), 1, 'evento loading_started');
select is((select count(*)::int from public.audit_logs where action = 'trip.start_loading' and target_id = (select t1::text from k)), 1, 'auditoria trip.start_loading');
select is(pg_temp.sl((select t1 from k)) ->> 'code', 'INVALID_TRANSITION', 'carregar de novo uma viagem que já carrega: INVALID_TRANSITION');
select is(pg_temp.sl((select t1 from k)) ->> 'from', 'loading', 'a resposta traz de onde veio');
select is(pg_temp.sl((select t2 from k), 99) ->> 'code', 'VERSION_CONFLICT', 'versão antiga: VERSION_CONFLICT');
select is(pg_temp.status_of((select t2 from k)), 'planned', 'e nada mudou');

-- Veículo ou motorista já ocupados por outra viagem carregando (RF-006a).
select is(pg_temp.sl((select t2 from k)) ->> 'code', 'RESOURCE_BUSY', 'mesmo veículo e motorista em outra viagem carregando: RESOURCE_BUSY');
select is(pg_temp.sl((select t2 from k)) ->> 'entity', 'vehicle', 'a entidade ocupada é o veículo');
select is(pg_temp.sl((select t2 from k)) ->> 'trip_id', (select t1::text from k), 'com a viagem que o ocupa');
select is(pg_temp.sl((select t3 from k)) ->> 'entity', 'driver', 'só o motorista ocupado: RESOURCE_BUSY do motorista');
select is(pg_temp.sl((select t4 from k)) ->> 'code', 'LOADING', 'veículo e motorista livres: segue');
select is(pg_temp.status_of((select t2 from k)), 'planned', 'a viagem recusada continua planejada');
select is((select count(*)::int from public.trips where vehicle_id = '95000000-0000-0000-0000-000000000001'), 2, 'duas viagens planejadas com o mesmo veículo foram aceitas (só carregar é exclusivo)');

-- 2. Conferência.
select is(pg_temp.ck((select t1 from k), 1) ->> 'code', 'CHECKED', 'check_item confere');
select is((pg_temp.ck((select t1 from k), 2) ->> 'checked'), '2', 'a resposta conta os conferidos');
select is((pg_temp.ck((select t1 from k), 3) ->> 'total'), '3', 'e o total');
select is((select item_status from public.trip_items where id = pg_temp.item((select t1 from k), 1)), 'checked', 'o item está conferido');
select is((select check_source from public.trip_items where id = pg_temp.item((select t1 from k), 1)), 'manual', 'origem manual');
select is((select checked_by from public.trip_items where id = pg_temp.item((select t1 from k), 1)), '10000000-0000-0000-0000-000000000002'::uuid, 'quem conferiu');
select isnt((select checked_at from public.trip_items where id = pg_temp.item((select t1 from k), 1)), null, 'quando conferiu');
select is((select version from public.trips where id = (select t1 from k)), 2::bigint, 'conferir não muda a versão da viagem');
select is(pg_temp.ck((select t1 from k), 1) ->> 'code', 'INVALID_TRANSITION', 'conferir de novo o que já está conferido');
select is(pg_temp.uck((select t1 from k), 3) ->> 'code', 'UNCHECKED', 'desfazer a conferência');
select is((select item_status || '/' || coalesce(checked_at::text, 'sem data') from public.trip_items where id = pg_temp.item((select t1 from k), 3)), 'planned/sem data', 'volta a planejado sem data');
select is(pg_temp.uck((select t1 from k), 3) ->> 'code', 'INVALID_TRANSITION', 'desfazer o que não está conferido');
select is(pg_temp.ck((select t2 from k), 4) ->> 'code', 'INVALID_TRANSITION', 'conferir numa viagem que ainda não carrega');
select is((select count(*)::int from public.trip_events where trip_id = (select t1 from k) and event_type in ('item_checked', 'item_unchecked')), 4, 'um evento por conferência e por desfazer');

-- Desfazer o carregamento só vale se nada foi conferido.
select is(pg_temp.rl((select t1 from k)) ->> 'code', 'INVALID_TRANSITION', 'revert_loading com item conferido: recusado');
select is(pg_temp.rl((select t4 from k)) ->> 'code', 'REVERTED', 'revert_loading sem conferência: volta a planejada');
select is(pg_temp.status_of((select t4 from k)), 'planned', 'a viagem voltou a planejada');
select is(pg_temp.rl((select t4 from k)) ->> 'code', 'INVALID_TRANSITION', 'desfazer o que já não carrega');
select is((select count(*)::int from public.trip_events where event_type = 'loading_reverted'), 1, 'evento loading_reverted');

-- 3. Retirada (exceção): precisa de trip.operate E trip.exception, de justificativa e do carregamento.
select is(pg_temp.rm('10000000-0000-0000-0000-0000000008e1', '60000000-0000-0000-0000-0000000800e1', (select t1 from k), 3, 'Cilindro avariado no pátio') ->> 'code', 'ACCESS_DENIED', 'gestor sem trip.exception não retira');
select is(pg_temp.rm('10000000-0000-0000-0000-0000000008f1', '60000000-0000-0000-0000-0000000800f1', (select t1 from k), 3, 'Cilindro avariado no pátio') ->> 'code', 'ACCESS_DENIED', 'operador de estoque não retira');
select is(pg_temp.rm('10000000-0000-0000-0000-0000000008c1', '60000000-0000-0000-0000-0000000800c1', (select t1 from k), 3, 'Cilindro avariado no pátio') ->> 'code', 'ACCESS_DENIED', 'motorista não retira');
select is(pg_temp.rm('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000800a2', (select t1 from k), 3, '   ') ->> 'code', 'JUSTIFICATION_REQUIRED', 'sem justificativa: recusado');
select is(pg_temp.rm('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000800a2', (select t1 from k), 3, repeat('j', 501)) ->> 'code', 'JUSTIFICATION_REQUIRED', 'justificativa com 501 caracteres: recusada');
select is((select item_status from public.trip_items where id = pg_temp.item((select t1 from k), 3)), 'planned', 'as recusas não mudaram o item');
select is(pg_temp.rm('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000800a2', (select t1 from k), 3, 'Cilindro avariado no pátio') ->> 'code', 'REMOVED', 'administrador retira com justificativa');
select is((select item_status || '/' || divergence_reason from public.trip_items where id = pg_temp.item((select t1 from k), 3)), 'removed/Cilindro avariado no pátio', 'item retirado com o motivo');
select is((select count(*)::int from public.cylinder_events where cylinder_id = pg_temp.cy(3) and event_type = 'trip_released' and justification = 'Cilindro avariado no pátio'), 1, 'evento trip_released no cilindro, com o motivo');
select is((select count(*)::int from public.trip_events where trip_id = (select t1 from k) and event_type = 'item_removed' and justification = 'Cilindro avariado no pátio'), 1, 'evento item_removed com o motivo');
select is((select count(*)::int from public.audit_logs where action = 'trip.remove_item' and (metadata::text like '%avariado%' or justification like '%avariado%')), 0, 'a auditoria não guarda o texto da justificativa');
select is((select count(*)::int from public.trip_items where cylinder_id = pg_temp.cy(3) and is_open), 0, 'a reserva do cilindro foi liberada');
select is(pg_temp.plan(jsonb_build_array(pg_temp.stop(1, array[3])), 4, 4) is not null, true, 'o cilindro liberado entra em outra viagem');
select is(pg_temp.rm('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000800a2', (select t1 from k), 3, 'Outra vez o mesmo') ->> 'code', 'INVALID_TRANSITION', 'retirar o que já foi retirado');
select is(pg_temp.rm('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000800a2', (select t2 from k), 4, 'Viagem que não carrega') ->> 'code', 'INVALID_TRANSITION', 'retirar numa viagem que não carrega');

-- 4. Início: itens pendentes.
create temp table k2 as select pg_temp.plan(jsonb_build_array(pg_temp.stop(1, array[10, 11]), pg_temp.stop(2, array[12])), 5, 5) as t;
select pg_temp.sl((select t from k2));
select pg_temp.ck((select t from k2), 10);
select is(pg_temp.st((select t from k2)) ->> 'code', 'ITEMS_PENDING', 'iniciar com cilindro não conferido: ITEMS_PENDING');
select is(jsonb_array_length(pg_temp.st((select t from k2)) -> 'item_ids'), 2, 'a resposta lista os dois que faltam');
select is(pg_temp.status_of((select t from k2)), 'loading', 'e a viagem não saiu');
select is((select count(*)::int from public.trip_items where trip_id = (select t from k2) and lock_status = 'locked'), 0, 'nenhum item bloqueado');
select is(pg_temp.st((select t from k2), 99) ->> 'code', 'VERSION_CONFLICT', 'versão antiga: VERSION_CONFLICT');
select is(pg_temp.st((select t2 from k)) ->> 'code', 'INVALID_TRANSITION', 'iniciar uma viagem que ainda não carrega');

-- 5. Início feliz: dois cilindros em duas paradas, um retirado (a parada dele sai do roteiro).
create temp table k3 as select pg_temp.plan(jsonb_build_array(pg_temp.stop(1, array[20, 21]), pg_temp.stop(2, array[22])), 6, 6) as t;
select pg_temp.sl((select t from k3));
select pg_temp.ck((select t from k3), 20);
select pg_temp.ck((select t from k3), 21);
select pg_temp.rm('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000800a2', (select t from k3), 22, 'Fora do pedido do cliente');
create temp table go as select pg_temp.st((select t from k3)) as r;
select is((select r ->> 'code' from go), 'STARTED', 'start_trip inicia');
select is(pg_temp.status_of((select t from k3)), 'in_progress', 'a viagem está em andamento');
select isnt((select started_at from public.trips where id = (select t from k3)), null, 'início registrado');
select is((select started_by from public.trips where id = (select t from k3)), '10000000-0000-0000-0000-000000000002'::uuid, 'e quem iniciou');
select is((select count(*)::int from public.trip_items where trip_id = (select t from k3) and item_status = 'in_transit' and lock_status = 'locked'), 2, 'itens em trânsito e bloqueados (lógico)');
select is((select stock_status || '/' || custody_status from public.cylinders where id = pg_temp.cy(20)), 'out_of_stock/in_transit', 'cilindro fora do estoque e em trânsito');
select is((select count(*)::int from public.cylinder_events where event_type = 'trip_departed' and cylinder_id in (pg_temp.cy(20), pg_temp.cy(21))), 2, 'evento trip_departed em cada cilindro');
select is((select stock_status from public.cylinders where id = pg_temp.cy(22)), 'in_stock', 'o cilindro retirado continua em estoque');
select is((select count(*)::int from public.trip_events where trip_id = (select t from k3) and event_type = 'trip_started'), 1, 'evento trip_started');
select is((select count(*)::int from public.audit_logs where action = 'trip.start' and target_id = (select t::text from k3)), 1, 'auditoria trip.start');
select is((select status from public.trip_stops where trip_id = (select t from k3) and site_id = '92000000-0000-0000-0000-000000000002'), 'removed', 'a parada sem cilindro a levar sai do roteiro');
select is((select status from public.trip_stops where trip_id = (select t from k3) and site_id = '92000000-0000-0000-0000-000000000001'), 'pending', 'a outra segue pendente');
select is(pg_temp.st((select t from k3)) ->> 'code', 'INVALID_TRANSITION', 'iniciar de novo: INVALID_TRANSITION');
select is(public.update_trip('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000800a2', '20000000-0000-0000-0000-00000000000a', gen_random_uuid(), (select t from k3), 3, current_date,
  '95000000-0000-0000-0000-000000000006', '96000000-0000-0000-0000-000000000006', null, jsonb_build_array(pg_temp.stop(1, array[20, 21]))) ->> 'code', 'INVALID_TRANSITION', 'depois de sair, a viagem não é mais editável');
select is(public.stock_in_cylinder('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000800a2', '20000000-0000-0000-0000-00000000000a', 'inexistente-xyz', gen_random_uuid()) ->> 'code', 'NOT_FOUND', 'a entrada no estoque continua funcionando para cilindro fora de viagem');
select is((public.get_trip('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000800a2', '20000000-0000-0000-0000-00000000000a', (select t from k3)) -> 'items' -> 0 -> 'cylinder' ->> 'custody_status'), 'in_transit', 'o detalhe mostra a custódia em trânsito');

-- 6. Revalidação no início: nada muda se qualquer verificação falha.
create temp table r1 as select pg_temp.ready(jsonb_build_array(pg_temp.stop(1, array[30])), 7, 7, array[30]) as t;
update public.drivers set cnh_valid_until = current_date - 1 where id = '96000000-0000-0000-0000-000000000007';
select is(pg_temp.st((select t from r1)) ->> 'code', 'DRIVER_LICENSE_EXPIRED', 'CNH vencida impede iniciar');
select is(pg_temp.status_of((select t from r1)) || '/' || (select stock_status from public.cylinders where id = pg_temp.cy(30)), 'loading/in_stock', 'nada mudou: viagem carregando e cilindro em estoque');
update public.drivers set cnh_valid_until = current_date + 20 where id = '96000000-0000-0000-0000-000000000007';
select is(pg_temp.st((select t from r1)) ->> 'code', 'STARTED', 'CNH a vencer só avisa: inicia');

create temp table r2 as select pg_temp.ready(jsonb_build_array(pg_temp.stop(1, array[31, 32])), 8, 8, array[31, 32]) as t;
update public.cylinders set hydro_next_due_on = current_date - 1 where id = pg_temp.cy(32);
select is(pg_temp.st((select t from r2)) ->> 'code', 'CYLINDER_NOT_ELIGIBLE', 'teste que venceu depois do planejamento impede');
select is(pg_temp.st((select t from r2)) ->> 'reason', 'hydro_expired', 'com o motivo');
select is(pg_temp.st((select t from r2)) ->> 'cylinder_id', pg_temp.cy(32)::text, 'e o cilindro');
select is((select count(*)::int from public.cylinders where id in (pg_temp.cy(31), pg_temp.cy(32)) and stock_status = 'out_of_stock'), 0, 'nenhum cilindro saiu do estoque');
update public.cylinders set hydro_next_due_on = current_date + 100 where id = pg_temp.cy(32);
update public.vehicles set status = 'maintenance' where id = '95000000-0000-0000-0000-000000000008';
select is(pg_temp.st((select t from r2)) ->> 'entity', 'vehicle', 'veículo que saiu de "disponível" impede');
update public.vehicles set status = 'available' where id = '95000000-0000-0000-0000-000000000008';
update public.drivers set status = 'inactive', inactivated_at = now() where id = '96000000-0000-0000-0000-000000000008';
select is(pg_temp.st((select t from r2)) ->> 'entity', 'driver', 'motorista inativado impede');
update public.drivers set status = 'active', inactivated_at = null where id = '96000000-0000-0000-0000-000000000008';
update public.vehicles set capacity_cylinders = 1 where id = '95000000-0000-0000-0000-000000000008';
select is(pg_temp.st((select t from r2)) ->> 'code', 'CAPACITY_EXCEEDED', 'veículo com capacidade reduzida impede');
update public.vehicles set capacity_cylinders = 10 where id = '95000000-0000-0000-0000-000000000008';
select is(pg_temp.status_of((select t from r2)), 'loading', 'a viagem segue carregando depois de todas as recusas');

create temp table r3 as select pg_temp.ready(jsonb_build_array(pg_temp.stop(3, array[40])), 9, 9, array[40]) as t;
update public.customers set status = 'inactive', inactivated_at = now() where id = '91000000-0000-0000-0000-0000000000a2';
select is(pg_temp.st((select t from r3)) ->> 'entity', 'customer', 'cliente inativado impede');
update public.customers set status = 'active', inactivated_at = null where id = '91000000-0000-0000-0000-0000000000a2';
update public.customer_sites set status = 'inactive', inactivated_at = now() where id = '92000000-0000-0000-0000-000000000003';
select is(pg_temp.st((select t from r3)) ->> 'entity', 'site', 'unidade inativada impede');
update public.customer_sites set status = 'active', inactivated_at = null where id = '92000000-0000-0000-0000-000000000003';
select is(pg_temp.status_of((select t from r3)), 'loading', 'e a viagem segue carregando');

-- Cliente anonimizado depois do planejamento: o nome é o fixo e a viagem segue operável (spec, casos de borda).
create temp table r4 as select pg_temp.ready(jsonb_build_array(pg_temp.stop(4, array[50])), 4, 4, array[50]) as t;
select set_config('app.registry_anonymizing', 'on', true);
update public.customers set legal_name = 'Cliente anonimizado', trade_name = null, notes = null, document_display = 'anonimizado', status = 'inactive', inactivated_at = now(),
  anonymized_at = now(), anonymized_by = '10000000-0000-0000-0000-000000000002' where id = '91000000-0000-0000-0000-0000000000a3';
select is(public.get_trip('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000800a2', '20000000-0000-0000-0000-00000000000a', (select t from r4)) -> 'stops' -> 0 -> 'site' ->> 'customer_name', 'Cliente anonimizado', 'o detalhe mostra o nome fixo');
select is(pg_temp.st((select t from r4)) ->> 'code', 'STARTED', 'a viagem de cliente anonimizado inicia normalmente');

-- Permissões: o motorista não opera nada.
select is(public.start_loading('10000000-0000-0000-0000-0000000008c1', '60000000-0000-0000-0000-0000000800c1', '20000000-0000-0000-0000-00000000000a', gen_random_uuid(), (select t4 from k), 1) ->> 'code', 'ACCESS_DENIED', 'motorista não inicia o carregamento');
select is(public.start_trip('10000000-0000-0000-0000-0000000008c1', '60000000-0000-0000-0000-0000000800c1', '20000000-0000-0000-0000-00000000000a', gen_random_uuid(), (select t from r2), 2) ->> 'code', 'ACCESS_DENIED', 'nem a viagem');

select * from finish();
rollback;
