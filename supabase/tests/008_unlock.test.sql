begin;
select plan(45);

-- Spec 008, US4: desbloqueio normal e excepcional como ato independente da entrega (RF-018 a RF-020, CA-005).
-- Gestor logístico (trip.unlock sem trip.exception) e operador de estoque (sem trip.unlock) provam a separação das permissões.

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
select public.start_user_session('10000000-0000-0000-0000-0000000008e1', '60000000-0000-0000-0000-0000000800e1', 'aal2');
select public.start_user_session('10000000-0000-0000-0000-0000000008f1', '60000000-0000-0000-0000-0000000800f1', 'aal2');

create function pg_temp.unlock(p_trip uuid, p_cyl integer, p_justification text default null, p_user uuid default '10000000-0000-0000-0000-000000000002',
  p_session uuid default '60000000-0000-0000-0000-0000000800a2', p_req uuid default gen_random_uuid(), p_org uuid default '20000000-0000-0000-0000-00000000000a') returns jsonb language sql as $$
  select public.register_unlock(p_user, p_session, p_org, p_req, p_trip, pg_temp.item(p_trip, p_cyl), p_justification)
$$;

create temp table u as select pg_temp.sail(jsonb_build_array(pg_temp.stop(1, array[1, 2]), pg_temp.stop(2, array[3])), 1, 1, array[1, 2, 3]) as t;
select pg_temp.arrive((select t from u), 1);
select pg_temp.deliver((select t from u), 1, '[[1, true, null], [2, true, null]]');
create temp table delivery_before as select id, recipient_name, delivered_at from public.trip_deliveries where stop_id = pg_temp.stop_id((select t from u), 1);

-- 1. Desbloqueio normal: item entregue, com trip.unlock, sem segundo fator e sem justificativa.
select is((select lock_status from public.trip_items where id = pg_temp.item((select t from u), 1)), 'locked', 'o item entregue continua bloqueado (lógico) até o desbloqueio');
select is(pg_temp.unlock((select t from u), 1) ->> 'code', 'UNLOCKED', 'desbloqueio normal sem justificativa');
select is((pg_temp.unlock((select t from u), 2, 'Cliente retirou os cilindros do local') ->> 'exceptional')::boolean, false, 'o normal não é excepcional');
select is((select lock_status from public.trip_items where id = pg_temp.item((select t from u), 1)), 'unlocked', 'desbloqueado');
select is((select item_status from public.trip_items where id = pg_temp.item((select t from u), 1)), 'delivered', 'a situação da entrega não mudou');
select is((select custody_status from public.cylinders where id = pg_temp.cy(1)), 'at_customer', 'nem a custódia do cilindro');
select is((select status from public.trip_stops where id = pg_temp.stop_id((select t from u), 1)), 'delivered', 'nem a da parada');
select is((select count(*)::int from public.trip_deliveries d join delivery_before b on b.id = d.id and b.recipient_name = d.recipient_name and b.delivered_at = d.delivered_at), 1, 'nem o registro da entrega');
select is((select aal || '/' || exceptional::text from public.trip_unlocks where item_id = pg_temp.item((select t from u), 1)), 'aal1/false', 'o registro guarda autor, nível da sessão e que não foi excepcional');
select is((select actor_user_id from public.trip_unlocks where item_id = pg_temp.item((select t from u), 1)), '10000000-0000-0000-0000-000000000002'::uuid, 'quem desbloqueou');
select is((select count(*)::int from public.trip_events where trip_id = (select t from u) and event_type = 'unlock_registered'), 2, 'um evento unlock_registered por desbloqueio');
select is((select count(*)::int from public.audit_logs where action = 'trip.unlock' and target_id = (select t::text from u)), 2, 'uma auditoria trip.unlock por desbloqueio');
select is((select count(*)::int from public.audit_logs where metadata::text ~* 'retirou os cilindros' or coalesce(justification, '') ~* 'retirou os cilindros'), 0, 'a auditoria não guarda a justificativa em texto');
select is(pg_temp.unlock((select t from u), 1) ->> 'code', 'INVALID_TRANSITION', 'segundo desbloqueio do mesmo item é recusado');
select is(pg_temp.unlock((select t from u), 1) ->> 'from', 'unlocked', 'com a situação de origem');

-- 2. Independência: desbloquear não entrega e entregar não desbloqueia.
select is((select lock_status from public.trip_items where id = pg_temp.item((select t from u), 3)), 'locked', 'o item em trânsito segue bloqueado');
select is((select count(*)::int from public.trip_items where trip_id = (select t from u) and lock_status = 'unlocked'), 2, 'só os dois desbloqueados mudaram');

-- 3. Desbloqueio excepcional (item ainda em trânsito): trip.unlock E trip.exception, aal2 e justificativa.
select is(pg_temp.unlock((select t from u), 3, 'Cilindro precisa voltar ao depósito', '10000000-0000-0000-0000-0000000008e1', '60000000-0000-0000-0000-0000000800e1') ->> 'code', 'ACCESS_DENIED', 'gestor sem trip.exception não faz desbloqueio excepcional');
select is(pg_temp.unlock((select t from u), 3, 'Cilindro precisa voltar ao depósito') ->> 'code', 'MFA_REQUIRED', 'sem segundo fator (aal1): MFA_REQUIRED');
select is((select lock_status from public.trip_items where id = pg_temp.item((select t from u), 3)), 'locked', 'e nada mudou');
select public.start_user_session('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000800a2', 'aal2');
select is(pg_temp.unlock((select t from u), 3) ->> 'code', 'JUSTIFICATION_REQUIRED', 'sem justificativa: JUSTIFICATION_REQUIRED');
select is(pg_temp.unlock((select t from u), 3, 'ruim') ->> 'code', 'JUSTIFICATION_REQUIRED', 'justificativa com menos de 5 caracteres');
select is(pg_temp.unlock((select t from u), 3, repeat('j', 501)) ->> 'code', 'JUSTIFICATION_REQUIRED', 'justificativa com 501 caracteres');
select is((pg_temp.unlock((select t from u), 3, 'Cilindro precisa voltar ao depósito') ->> 'exceptional')::boolean, true, 'excepcional com aal2, trip.exception e justificativa');
select is((select item_status || '/' || lock_status from public.trip_items where id = pg_temp.item((select t from u), 3)), 'in_transit/unlocked', 'o item segue em trânsito, desbloqueado');
select is((select aal || '/' || exceptional::text || '/' || justification from public.trip_unlocks where item_id = pg_temp.item((select t from u), 3)), 'aal2/true/Cilindro precisa voltar ao depósito', 'o registro guarda aal2, o excepcional e a justificativa');
select is((select custody_status from public.cylinders where id = pg_temp.cy(3)), 'in_transit', 'e o cilindro continua em trânsito');
select is((select count(*)::int from public.audit_logs where action = 'trip.unlock' and (metadata ->> 'exceptional')::boolean and metadata ->> 'aal' = 'aal2'), 1, 'a auditoria marca o excepcional e o aal2, sem o texto');
select is((select count(*)::int from public.audit_logs where metadata::text ~* 'voltar ao dep' or coalesce(justification, '') ~* 'voltar ao dep'), 0, 'e não guarda a justificativa');

-- 4. Permissões e escopo.
create temp table u2 as select pg_temp.sail(jsonb_build_array(pg_temp.stop(1, array[10])), 2, 2, array[10]) as t;
select is(pg_temp.unlock((select t from u2), 10, null, '10000000-0000-0000-0000-0000000008f1', '60000000-0000-0000-0000-0000000800f1') ->> 'code', 'ACCESS_DENIED', 'operador de estoque (sem trip.unlock) é negado');
select is(pg_temp.unlock((select t from u2), 10, null, '10000000-0000-0000-0000-0000000008c1', '60000000-0000-0000-0000-0000000800c1') ->> 'code', 'ACCESS_DENIED', 'motorista é negado');
select is(pg_temp.unlock((select t from u2), 10, null, '10000000-0000-0000-0000-0000000008d1', '60000000-0000-0000-0000-0000000800d1') ->> 'code', 'ACCESS_DENIED', 'auditor é negado');
select is(pg_temp.unlock((select t from u2), 10, null, '10000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-0000000800b3', gen_random_uuid(), '20000000-0000-0000-0000-00000000000b') ->> 'code', 'NOT_FOUND', 'o Tenant B não alcança a viagem do A');
select is(public.register_unlock('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000800a2', '20000000-0000-0000-0000-00000000000a', gen_random_uuid(), (select t from u2), pg_temp.item((select t from u), 1), null) ->> 'code', 'NOT_FOUND', 'item de outra viagem');
select is((select count(*)::int from public.trip_unlocks where item_id = pg_temp.item((select t from u2), 10)), 0, 'as recusas não gravaram nada');

-- 5. Antes da saída não há o que desbloquear; item retirado ou liberado nunca esteve bloqueado.
create temp table u3 as select (public.create_trip('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000800a2', '20000000-0000-0000-0000-00000000000a', gen_random_uuid(), current_date,
  '95000000-0000-0000-0000-000000000003', '96000000-0000-0000-0000-000000000003', null, jsonb_build_array(pg_temp.stop(1, array[20]))) ->> 'trip_id')::uuid as t;
select is(pg_temp.unlock((select t from u3), 20) ->> 'code', 'INVALID_TRANSITION', 'viagem planejada: nada bloqueado para desbloquear');

-- 6. O bloqueio nunca volta: nem pela API, nem por update direto.
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname ~ '(relock|reblock|lock_item|set_lock|lock_trip)'), 0, 'não existe operação de refazer o bloqueio');
select throws_ok($$ update public.trip_items set lock_status = 'locked' where id = pg_temp.item((select t from u), 1) $$, 'P0001', 'trip_lock_irreversible', 'unlocked → locked por update direto é recusado');
select throws_ok($$ update public.trip_items set lock_status = 'none' where id = pg_temp.item((select t from u), 3) $$, 'P0001', 'trip_lock_irreversible', 'locked/unlocked → none é recusado');
select lives_ok($$ update public.trip_items set updated_at = now() where id = pg_temp.item((select t from u), 1) $$, 'outras alterações do item seguem permitidas');

-- 7. Idempotência e leitura.
create temp table rq as select gen_random_uuid() as r;
create temp table u4 as select pg_temp.sail(jsonb_build_array(pg_temp.stop(1, array[30])), 4, 4, array[30]) as t;
select pg_temp.arrive((select t from u4), 1);
select pg_temp.deliver((select t from u4), 1, '[[30, true, null]]');
select is(pg_temp.unlock((select t from u4), 30, null, '10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000800a2', (select r from rq)) ->> 'code', 'UNLOCKED', 'primeira chamada desbloqueia');
select is((pg_temp.unlock((select t from u4), 30, null, '10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000800a2', (select r from rq)) ->> 'replayed')::boolean, true, 'a repetição devolve o resultado gravado');
select is((select count(*)::int from public.trip_unlocks where item_id = pg_temp.item((select t from u4), 30)), 1, 'sem desbloqueio duplicado');
select is(jsonb_array_length(public.get_trip('10000000-0000-0000-0000-0000000008d1', '60000000-0000-0000-0000-0000000800d1', '20000000-0000-0000-0000-00000000000a', (select t from u)) -> 'unlocks'), 3, 'get_trip lista os desbloqueios');
select is((select count(*)::int from jsonb_array_elements(public.get_trip('10000000-0000-0000-0000-0000000008d1', '60000000-0000-0000-0000-0000000800d1', '20000000-0000-0000-0000-00000000000a', (select t from u)) -> 'unlocks') e where (e ->> 'exceptional')::boolean and e ->> 'actor_name' = 'Administrador A'), 1, 'com o autor e a marca de excepcional');

select * from finish();
rollback;
