begin;
select plan(27);

-- Spec 008, RF-004 e RNF-002: reserva concorrente de cilindro. O operador 1 carrega a lista de cilindros disponíveis, o operador 2 reserva o mesmo
-- cilindro e o operador 1 tenta confirmar: a recusa é determinística, lista só o cilindro em conflito e não grava nada. Hermético (rollback).

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
  select ('96000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid, '20000000-0000-0000-0000-00000000000a', 'Motorista ' || n, 'x' || n, 'y' || n, 'D', (now() at time zone 'America/Sao_Paulo')::date + 365 from generate_series(1, 6) n;
insert into public.cylinder_types (id, organization_id, gas, capacity_value, capacity_unit, classification) values
  ('97000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', 'Oxigênio', 10, 'l', 'medicinal');
insert into public.cylinders (id, organization_id, cylinder_type_id, serial_number, stock_status, hydro_last_result, hydro_next_due_on)
  select ('98000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid, '20000000-0000-0000-0000-00000000000a', '97000000-0000-0000-0000-00000000000a', 'DEL-' || lpad(n::text, 3, '0'), 'in_stock', 'approved', (now() at time zone 'America/Sao_Paulo')::date + 200
    from generate_series(1, 40) n;

create function pg_temp.cy(n integer) returns uuid language sql as $$ select ('98000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid $$;
create function pg_temp.stop(p_site integer, p_cyls integer[]) returns jsonb language sql as $$
  select jsonb_build_object('site_id', ('92000000-0000-0000-0000-' || lpad(p_site::text, 12, '0'))::uuid, 'cylinder_ids', (select jsonb_agg(pg_temp.cy(c)) from unnest(p_cyls) c))
$$;
create function pg_temp.ver(p_trip uuid) returns bigint language sql as $$ select version from public.trips where id = p_trip $$;

insert into auth.users (id, aud, role, email) values ('10000000-0000-0000-0000-0000000008e1', 'authenticated', 'authenticated', 'trip-writer-only@example.invalid');
insert into public.profiles (user_id, display_name) values ('10000000-0000-0000-0000-0000000008e1', 'Planejador sem leitura');
insert into public.memberships (id, organization_id, user_id, status, activated_at) values
  ('30000000-0000-0000-0000-0000000008e1', '20000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-0000000008e1', 'active', now());
insert into public.roles (id, organization_id, code, name, description, scope, system)
  values ('50000000-0000-0000-0000-0000000008e1', '20000000-0000-0000-0000-00000000000a', 'writer_only', 'Só planeja', 'Planeja viagens, sem ler', 'tenant', false);
insert into public.role_permissions (role_id, permission_id)
  select '50000000-0000-0000-0000-0000000008e1', p.id from public.permissions p where p.code = 'trip.write';
insert into public.membership_roles (membership_id, role_id, assigned_by)
  values ('30000000-0000-0000-0000-0000000008e1', '50000000-0000-0000-0000-0000000008e1', '10000000-0000-0000-0000-000000000001');
select public.start_user_session('10000000-0000-0000-0000-0000000008e1', '60000000-0000-0000-0000-0000000800e1', 'aal1');

-- Planejamento de um operador: usuário, sessão e organização escolhidos; o pedido novo a cada chamada.
create function pg_temp.plan(p_stops jsonb, p_vehicle integer, p_driver integer, p_user uuid default '10000000-0000-0000-0000-000000000002',
  p_session uuid default '60000000-0000-0000-0000-0000000800a2', p_org uuid default '20000000-0000-0000-0000-00000000000a') returns jsonb language sql as $$
  select public.create_trip(p_user, p_session, p_org, gen_random_uuid(), (now() at time zone 'America/Sao_Paulo')::date, ('95000000-0000-0000-0000-' || lpad(p_vehicle::text, 12, '0'))::uuid,
    ('96000000-0000-0000-0000-' || lpad(p_driver::text, 12, '0'))::uuid, null, p_stops)
$$;
create function pg_temp.eligible(p_user uuid default '10000000-0000-0000-0000-000000000002', p_session uuid default '60000000-0000-0000-0000-0000000800a2') returns jsonb language sql as $$
  select public.list_eligible_cylinders(p_user, p_session, '20000000-0000-0000-0000-00000000000a', null, null, null, 100)
$$;
create function pg_temp.lists(p_list jsonb, p_cyl integer) returns boolean language sql as $$
  select exists (select 1 from jsonb_array_elements(p_list -> 'items') i where (i ->> 'id')::uuid = pg_temp.cy(p_cyl))
$$;
create function pg_temp.conflict_ids(p jsonb) returns text[] language sql as $$
  select coalesce(array_agg(c ->> 'cylinder_id' order by c ->> 'cylinder_id'), '{}') from jsonb_array_elements(p -> 'conflicts') c
$$;
create temp table lista_op1 as select pg_temp.eligible() as l;

-- 1. O operador 1 carregou a lista: o cilindro 1 estava disponível para ele.
select is(pg_temp.lists((select l from lista_op1), 1), true, 'o operador 1 vê o cilindro 1 como disponível');
select is(pg_temp.lists((select l from lista_op1), 2), true, 'e o cilindro 2');

-- 2. O operador 2 reserva o cilindro 1 enquanto o operador 1 ainda monta a viagem com a lista antiga.
create temp table op2 as select pg_temp.plan(jsonb_build_array(pg_temp.stop(1, array[1])), 1, 1) as r;
select is((select r ->> 'code' from op2), 'CREATED', 'o operador 2 planeja a viagem com o cilindro 1');
create temp table op1 as select pg_temp.plan(jsonb_build_array(pg_temp.stop(2, array[1, 2, 3])), 2, 2) as r;

-- 3. O operador 1 confirma: recusa determinística, só o cilindro em conflito, nada gravado.
select is((select r ->> 'code' from op1), 'CYLINDER_RESERVED', 'o operador 1 recebe CYLINDER_RESERVED');
select is((select r ->> 'cylinder_id' from op1), pg_temp.cy(1)::text, 'o cilindro em conflito é o 1');
select is(pg_temp.conflict_ids((select r from op1)), array[pg_temp.cy(1)::text], 'a lista de conflitos tem só o cilindro 1 (os cilindros 2 e 3 estão livres)');
select is((select r ->> 'trip_id' from op1), (select r ->> 'trip_id' from op2), 'o conflito aponta a viagem do operador 2');
select is((select (r ->> 'trip_number')::int from op1), (select number from public.trips where id = (select (r ->> 'trip_id')::uuid from op2)), 'e o número dela');
select is((select count(*)::int from public.trips where organization_id = '20000000-0000-0000-0000-00000000000a'), 1, 'nenhuma viagem nova foi gravada pelo operador 1');
select is((select count(*)::int from public.trip_items where cylinder_id in (pg_temp.cy(2), pg_temp.cy(3))), 0, 'e os cilindros livres do operador 1 não ficaram reservados');
select is((select count(*)::int from public.trip_items where cylinder_id = pg_temp.cy(1) and is_open), 1, 'o cilindro 1 segue com uma só reserva, a do operador 2');
select is(pg_temp.lists(pg_temp.eligible(), 1), false, 'a lista nova já não oferece o cilindro 1');
select is(pg_temp.lists(pg_temp.eligible(), 2), true, 'mas continua oferecendo o 2');

-- 4. Repetir a confirmação (agora sem o cilindro em conflito) funciona: a recusa não deixou estado nenhum para trás.
select is(pg_temp.plan(jsonb_build_array(pg_temp.stop(2, array[2, 3])), 2, 2) ->> 'code', 'CREATED', 'sem o cilindro 1 a viagem do operador 1 é planejada');

-- 5. Vários cilindros em conflito: todos vêm de uma vez, em ordem fixa.
create temp table op3 as select pg_temp.plan(jsonb_build_array(pg_temp.stop(3, array[10, 11])), 3, 3) as r;
create temp table op4 as select pg_temp.plan(jsonb_build_array(pg_temp.stop(4, array[11, 10, 12, 13])), 4, 4) as r;
select is((select r ->> 'code' from op4), 'CYLINDER_RESERVED', 'dois cilindros reservados por outro operador: CYLINDER_RESERVED');
select is(pg_temp.conflict_ids((select r from op4)), array[pg_temp.cy(10)::text, pg_temp.cy(11)::text], 'os dois aparecem, e só eles');
select is((select count(*)::int from public.trip_items where cylinder_id in (pg_temp.cy(12), pg_temp.cy(13))), 0, 'os cilindros livres não são reservados');

-- 6. Edição: a mesma regra vale ao acrescentar um cilindro a uma viagem existente.
create temp table base as select pg_temp.plan(jsonb_build_array(pg_temp.stop(1, array[20])), 5, 5) as r;
create temp table outro as select pg_temp.plan(jsonb_build_array(pg_temp.stop(2, array[21])), 6, 6) as r;
select is(public.update_trip('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000800a2', '20000000-0000-0000-0000-00000000000a', gen_random_uuid(),
  (select (r ->> 'trip_id')::uuid from base), 1, (now() at time zone 'America/Sao_Paulo')::date, '95000000-0000-0000-0000-000000000005', '96000000-0000-0000-0000-000000000005', null,
  jsonb_build_array(jsonb_build_object('id', (select id from public.trip_stops where trip_id = (select (r ->> 'trip_id')::uuid from base)), 'site_id', '92000000-0000-0000-0000-000000000001',
    'cylinder_ids', jsonb_build_array(pg_temp.cy(20), pg_temp.cy(21), pg_temp.cy(22)))))
  ->> 'code', 'CYLINDER_RESERVED', 'a edição que inclui o cilindro 21, já reservado, também é recusada');
select is((select count(*)::int from public.trip_items where trip_id = (select (r ->> 'trip_id')::uuid from base) and item_status <> 'removed'), 1, 'e a viagem em edição continua com o cilindro 20, só');

-- 7. Permissões: quem planeja mas não lê viagens sabe que o cilindro foi reservado, não por qual viagem.
create temp table sem_leitura as select public.create_trip('10000000-0000-0000-0000-0000000008e1', '60000000-0000-0000-0000-0000000800e1', '20000000-0000-0000-0000-00000000000a', gen_random_uuid(), (now() at time zone 'America/Sao_Paulo')::date,
  '95000000-0000-0000-0000-000000000001', '96000000-0000-0000-0000-000000000001', null, jsonb_build_array(pg_temp.stop(1, array[1]))) as r;
select is((select r ->> 'code' from sem_leitura), 'CYLINDER_RESERVED', 'sem a permissão de leitura, o cilindro reservado é recusado do mesmo jeito');
select is((select r ->> 'trip_id' from sem_leitura), null, 'mas a viagem que o reservou não é revelada (sem id)');
select is((select r ->> 'trip_number' from sem_leitura), null, 'nem o número dela');
select is(pg_temp.conflict_ids((select r from sem_leitura)), array[pg_temp.cy(1)::text], 'só o cilindro em conflito, que a pessoa já tinha escolhido');
select is(((select r -> 'conflicts' -> 0 from sem_leitura) ? 'trip_id'), false, 'e a lista de conflitos também não leva a viagem');

-- 8. Isolamento: o Tenant B não alcança nem descobre as reservas do Tenant A.
select is(public.create_trip('10000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-0000000800b3', '20000000-0000-0000-0000-00000000000b', gen_random_uuid(), (now() at time zone 'America/Sao_Paulo')::date,
  '95000000-0000-0000-0000-000000000001', '96000000-0000-0000-0000-000000000001', null, jsonb_build_array(pg_temp.stop(1, array[1]))) ->> 'code', 'NOT_FOUND', 'o Tenant B não enxerga o cilindro do A (nem o seu conflito)');
select is(public.create_trip('10000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-0000000800b3', '20000000-0000-0000-0000-00000000000a', gen_random_uuid(), (now() at time zone 'America/Sao_Paulo')::date,
  '95000000-0000-0000-0000-000000000001', '96000000-0000-0000-0000-000000000001', null, jsonb_build_array(pg_temp.stop(1, array[1]))) ->> 'code', 'ACCESS_DENIED', 'e fingir ser da organização A é negado');
select is(pg_temp.plan(jsonb_build_array(pg_temp.stop(1, array[1])), 1, 1, '10000000-0000-0000-0000-0000000008d1', '60000000-0000-0000-0000-0000000800d1') ->> 'code', 'ACCESS_DENIED', 'o auditor não planeja');

select * from finish();
rollback;
