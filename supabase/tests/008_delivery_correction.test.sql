begin;
select plan(48);

-- Spec 008, RF-015: a correção de uma entrega exige justificativa; a posição é por coordenadas ou no endereço da unidade, nunca as duas.
-- Hermético: desfeito pelo rollback. Ator: administrador do Tenant A; o Tenant B prova o isolamento.

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
create function pg_temp.deliver(p_trip uuid, p_pos integer, p_items jsonb, p_supersedes uuid default null, p_reason text default null, p_lat numeric default null, p_lon numeric default null,
  p_at_site boolean default false, p_name text default 'Recebedor Fictício', p_req uuid default gen_random_uuid(), p_user uuid default '10000000-0000-0000-0000-000000000002',
  p_session uuid default '60000000-0000-0000-0000-0000000800a2', p_org uuid default '20000000-0000-0000-0000-00000000000a') returns jsonb language sql as $$
  select public.register_delivery(p_user, p_session, p_org, p_req, p_trip, pg_temp.stop_id(p_trip, p_pos), now() - interval '1 minute', p_name, null, p_lat, p_lon, p_at_site,
    pg_temp.res(p_trip, p_items), p_supersedes, p_reason)
$$;
create function pg_temp.has_field(p jsonb, p_field text) returns boolean language sql as $$ select coalesce((select bool_or(f ->> 'field' = p_field) from jsonb_array_elements(p -> 'fields') f), false) $$;

-- Viagem com duas paradas entregues: a parada 1 por completo e a parada 2 com um cilindro não entregue.
create temp table k as select pg_temp.sail(jsonb_build_array(pg_temp.stop(1, array[1, 2]), pg_temp.stop(2, array[3])), 1, 1, array[1, 2, 3]) as t;
select pg_temp.arrive((select t from k), 1);
select pg_temp.arrive((select t from k), 2);
create temp table d1 as select pg_temp.deliver((select t from k), 1, '[[1, true, null], [2, true, null]]', null, null, null, null, true, 'Recebedor Original Fictício') as r;
create temp table d2 as select pg_temp.deliver((select t from k), 2, '[[3, false, "Cliente sem espaço para receber"]]', null, null, null, null, false, 'Segundo Recebedor Fictício') as r;
select is((select r ->> 'code' from d1), 'DELIVERED', 'prepara: entrega original da parada 1');
select is((select r ->> 'stop_status' from d2), 'with_divergence', 'prepara: parada 2 com divergência');
create temp table o1 as select id from public.trip_deliveries where stop_id = pg_temp.stop_id((select t from k), 1);
create temp table o2 as select id from public.trip_deliveries where stop_id = pg_temp.stop_id((select t from k), 2);

-- 1. A correção exige a justificativa de 5 a 500 caracteres.
select is(pg_temp.deliver((select t from k), 1, '[]', (select id from o1), null) ->> 'code', 'VALIDATION_FAILED', 'correção sem justificativa é recusada');
select ok(pg_temp.has_field(pg_temp.deliver((select t from k), 1, '[]', (select id from o1), null), 'correction_reason'), 'e o erro vem no campo correction_reason');
select is(pg_temp.deliver((select t from k), 1, '[]', (select id from o1), '') ->> 'code', 'VALIDATION_FAILED', 'justificativa vazia');
select is(pg_temp.deliver((select t from k), 1, '[]', (select id from o1), E'   \n\t  ') ->> 'code', 'VALIDATION_FAILED', 'justificativa só com espaços e quebras de linha');
select is(pg_temp.deliver((select t from k), 1, '[]', (select id from o1), 'Erro') ->> 'code', 'VALIDATION_FAILED', 'justificativa com 4 caracteres');
select is(pg_temp.deliver((select t from k), 1, '[]', (select id from o1), '  ab  c ') ->> 'code', 'VALIDATION_FAILED', 'conta depois de limpar os espaços: "ab c" tem 4 caracteres');
select is(pg_temp.deliver((select t from k), 1, '[]', (select id from o1), repeat('x', 501)) ->> 'code', 'VALIDATION_FAILED', 'justificativa com 501 caracteres');
select is((select count(*)::int from public.trip_deliveries where stop_id = pg_temp.stop_id((select t from k), 1)), 1, 'nenhuma recusa gravou registro');
select is(pg_temp.deliver((select t from k), 1, '[]', (select id from o1), 'Erro!') ->> 'code', 'DELIVERED', 'justificativa com 5 caracteres vale');
select is(pg_temp.deliver((select t from k), 2, '[[3, true, null]]', (select id from o2), repeat('x', 500)) ->> 'code', 'DELIVERED', 'justificativa com 500 caracteres vale');

-- 2. A correção válida é um novo registro imutável que aponta o original e leva a justificativa normalizada.
create temp table k2 as select pg_temp.sail(jsonb_build_array(pg_temp.stop(3, array[4, 5])), 2, 2, array[4, 5]) as t;
select pg_temp.arrive((select t from k2), 1);
select is(pg_temp.deliver((select t from k2), 1, '[[4, true, null], [5, true, null]]', null, null, null, null, false, 'Recebedor Original Dois') ->> 'code', 'DELIVERED', 'prepara: entrega da parada 3');
create temp table o3 as select id from public.trip_deliveries where stop_id = pg_temp.stop_id((select t from k2), 1);
select is(pg_temp.deliver((select t from k2), 1, '[]', (select id from o3), E'  Nome   do\n recebedor \t digitado   errado  ', null, null, false, 'Recebedor Corrigido Dois') ->> 'code', 'DELIVERED', 'correção válida');
select is((select correction_reason from public.trip_deliveries where supersedes_id = (select id from o3)), 'Nome do recebedor digitado errado', 'a justificativa é gravada com os espaços normalizados');
select is((select supersedes_id from public.trip_deliveries where correction_reason is not null and stop_id = pg_temp.stop_id((select t from k2), 1)), (select id from o3), 'o novo registro aponta o original em supersedes_id');
select is((select count(*)::int from public.trip_deliveries where stop_id = pg_temp.stop_id((select t from k2), 1)), 2, 'dois registros: nada foi apagado');
select is((select recipient_name || '/' || coalesce(correction_reason, 'sem') from public.trip_deliveries where id = (select id from o3)), 'Recebedor Original Dois/sem', 'o original continua intacto, sem justificativa de correção');
select is((select justification from public.trip_events where trip_id = (select t from k2) and event_type = 'delivery_corrected'), 'Nome do recebedor digitado errado', 'o histórico da viagem leva a justificativa no evento da correção');
select is((select count(*)::int from public.trip_events where trip_id = (select t from k2) and event_type = 'delivery_registered' and justification is not null), 0, 'a entrega original não tem justificativa no evento');
select is((select count(*)::int from public.audit_logs where action = 'trip.correct_delivery' and target_id = (select t::text from k2) and metadata::text like '%digitado errado%'), 0, 'o texto da justificativa não vai para a auditoria');
select is((select count(*)::int from public.audit_logs where action = 'trip.correct_delivery' and target_id = (select t::text from k2) and metadata::text like '%Recebedor%'), 0, 'nem o nome do recebedor');

-- 3. Na entrega original a justificativa de correção não vale.
create temp table k3 as select pg_temp.sail(jsonb_build_array(pg_temp.stop(3, array[6])), 3, 3, array[6]) as t;
select pg_temp.arrive((select t from k3), 1);
select is(pg_temp.deliver((select t from k3), 1, '[[6, true, null]]', null, 'Texto que não vale na original') ->> 'code', 'VALIDATION_FAILED', 'justificativa de correção em entrega original é recusada');
select is((select count(*)::int from public.trip_deliveries where stop_id = pg_temp.stop_id((select t from k3), 1)), 0, 'e nada foi gravado');

-- 4. Posição: coordenadas ou no endereço da unidade, nunca as duas.
select is(pg_temp.deliver((select t from k3), 1, '[[6, true, null]]', null, null, -23.55, -46.63, true) ->> 'code', 'VALIDATION_FAILED', 'coordenadas e endereço da unidade juntos são recusados');
select ok(pg_temp.has_field(pg_temp.deliver((select t from k3), 1, '[[6, true, null]]', null, null, -23.55, -46.63, true), 'at_site_address'), 'e o erro vem no campo at_site_address');
select is(pg_temp.deliver((select t from k3), 1, '[[6, true, null]]', null, null, -23.55, null, true) ->> 'code', 'VALIDATION_FAILED', 'só a latitude e o endereço da unidade juntos');
select is(pg_temp.deliver((select t from k3), 1, '[[6, true, null]]', null, null, -23.55, null, false) ->> 'code', 'VALIDATION_FAILED', 'o par de coordenadas continua exigido');
select is(pg_temp.deliver((select t from k3), 1, '[[6, true, null]]', null, null, 91, -46.63, false) ->> 'code', 'VALIDATION_FAILED', 'a faixa da latitude continua valendo');
select is(pg_temp.deliver((select t from k3), 1, '[[6, true, null]]', null, null, -23.55, -181, false) ->> 'code', 'VALIDATION_FAILED', 'a faixa da longitude continua valendo');
select is((select count(*)::int from public.trip_deliveries where stop_id = pg_temp.stop_id((select t from k3), 1)), 0, 'nenhuma combinação inválida gravou registro');
create temp table k4 as select pg_temp.sail(jsonb_build_array(pg_temp.stop(1, array[7]), pg_temp.stop(2, array[8]), pg_temp.stop(3, array[9])), 4, 4, array[7, 8, 9]) as t;
select pg_temp.arrive((select t from k4), 1);
select pg_temp.arrive((select t from k4), 2);
select pg_temp.arrive((select t from k4), 3);
select is(pg_temp.deliver((select t from k4), 1, '[[7, true, null]]', null, null, null, null, true) ->> 'code', 'DELIVERED', 'só no endereço da unidade vale');
select is(pg_temp.deliver((select t from k4), 2, '[[8, true, null]]', null, null, -23.55, -46.63, false) ->> 'code', 'DELIVERED', 'só coordenadas valem');
select is(pg_temp.deliver((select t from k4), 3, '[[9, true, null]]', null, null, null, null, false) ->> 'code', 'DELIVERED', 'sem posição vale');
select is((select at_site_address::text || '/' || coalesce(latitude::text, 'sem') from public.trip_deliveries where stop_id = pg_temp.stop_id((select t from k4), 1)), 'true/sem', 'no endereço da unidade, sem coordenadas gravadas');
select is((select outside_geofence from public.trip_deliveries where stop_id = pg_temp.stop_id((select t from k4), 1)), null, 'e o cálculo de geocerca não usa coordenadas (nenhuma comparação)');

-- 5. O banco repete as regras, sem depender da função.
select throws_ok($$ insert into public.trip_deliveries (organization_id, stop_id, request_id, delivered_at, recipient_name, results, supersedes_id, correction_reason, recorded_by)
  select '20000000-0000-0000-0000-00000000000a', stop_id, gen_random_uuid(), now(), 'Alguém Fictício', '[]', id, null, '10000000-0000-0000-0000-000000000002' from public.trip_deliveries where id = (select id from o2) $$, '23514', null, 'o banco recusa correção sem justificativa');
select throws_ok($$ insert into public.trip_deliveries (organization_id, stop_id, request_id, delivered_at, recipient_name, results, supersedes_id, correction_reason, recorded_by)
  select '20000000-0000-0000-0000-00000000000a', stop_id, gen_random_uuid(), now(), 'Alguém Fictício', '[]', id, 'Erro', '10000000-0000-0000-0000-000000000002' from public.trip_deliveries where id = (select id from o2) $$, '23514', null, 'o banco recusa justificativa com 4 caracteres');
select throws_ok($$ insert into public.trip_deliveries (organization_id, stop_id, request_id, delivered_at, recipient_name, results, supersedes_id, correction_reason, recorded_by)
  select '20000000-0000-0000-0000-00000000000a', stop_id, gen_random_uuid(), now(), 'Alguém Fictício', '[]', id, repeat('x', 501), '10000000-0000-0000-0000-000000000002' from public.trip_deliveries where id = (select id from o2) $$, '23514', null, 'o banco recusa justificativa com 501 caracteres');
select throws_ok($$ insert into public.trip_deliveries (organization_id, stop_id, request_id, delivered_at, recipient_name, results, supersedes_id, correction_reason, recorded_by)
  select '20000000-0000-0000-0000-00000000000a', stop_id, gen_random_uuid(), now(), 'Alguém Fictício', '[]', id, '      ', '10000000-0000-0000-0000-000000000002' from public.trip_deliveries where id = (select id from o2) $$, '23514', null, 'o banco recusa justificativa só com espaços');
select throws_ok($$ insert into public.trip_deliveries (organization_id, stop_id, request_id, delivered_at, recipient_name, results, supersedes_id, correction_reason, recorded_by)
  select '20000000-0000-0000-0000-00000000000a', stop_id, gen_random_uuid(), now(), 'Alguém Fictício', '[]', id, ' Erro valido ', '10000000-0000-0000-0000-000000000002' from public.trip_deliveries where id = (select id from o2) $$, '23514', null, 'o banco recusa justificativa com espaços nas pontas (não normalizada)');
select throws_ok($$ insert into public.trip_deliveries (organization_id, stop_id, request_id, delivered_at, recipient_name, results, correction_reason, recorded_by)
  select '20000000-0000-0000-0000-00000000000a', id, gen_random_uuid(), now(), 'Alguém Fictício', '[]', 'Justificativa em entrega original', '10000000-0000-0000-0000-000000000002' from public.trip_stops where id = pg_temp.stop_id((select t from k3), 1) $$,
  '23514', null, 'o banco recusa justificativa de correção em entrega original');
select throws_ok($$ insert into public.trip_deliveries (organization_id, stop_id, request_id, delivered_at, recipient_name, results, latitude, longitude, at_site_address, recorded_by)
  select '20000000-0000-0000-0000-00000000000a', id, gen_random_uuid(), now(), 'Alguém Fictício', '[]', -23.55, -46.63, true, '10000000-0000-0000-0000-000000000002' from public.trip_stops where id = pg_temp.stop_id((select t from k3), 1) $$,
  '23514', null, 'o banco recusa coordenadas com o endereço da unidade');
select lives_ok($$ insert into public.trip_deliveries (organization_id, stop_id, request_id, delivered_at, recipient_name, results, latitude, longitude, at_site_address, recorded_by)
  select '20000000-0000-0000-0000-00000000000a', id, gen_random_uuid(), now(), 'Alguém Fictício', '[]', -23.55, -46.63, false, '10000000-0000-0000-0000-000000000002' from public.trip_stops where id = pg_temp.stop_id((select t from k3), 1) $$,
  'o banco aceita só coordenadas');

-- 6. Isolamento entre tenants: o Tenant B não corrige a entrega do Tenant A.
create temp table antes as select count(*)::int as n from public.trip_deliveries;
select is(pg_temp.deliver((select t from k2), 1, '[]', (select id from o3), 'Tentativa de outro tenant', null, null, false, 'Intruso Fictício', gen_random_uuid(),
  '10000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-0000000800b3', '20000000-0000-0000-0000-00000000000b') ->> 'code', 'NOT_FOUND', 'o Tenant B não alcança a viagem do A para corrigir');
select is(pg_temp.deliver((select t from k2), 1, '[]', (select id from o3), 'Tentativa de outro tenant', null, null, false, 'Intruso Fictício', gen_random_uuid(),
  '10000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-0000000800b3', '20000000-0000-0000-0000-00000000000a') ->> 'code', 'ACCESS_DENIED', 'nem fingindo ser da organização A');
select is((select count(*)::int from public.trip_deliveries), (select n from antes), 'nenhum registro novo foi gravado');
select is((select count(*)::int from public.trip_deliveries where correction_reason like '%outro tenant%'), 0, 'a justificativa do intruso não foi gravada');

select * from finish();
rollback;
