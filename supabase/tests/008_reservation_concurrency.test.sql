begin;
select plan(10);

-- Spec 008, RF-004 e RNF-002: reserva de cilindro entre duas sessões do mesmo tenant. O pgTAP roda numa transação só, então aqui se prova
-- o resultado de cada ordem de chegada e o índice que sustenta a garantia; a corrida real de duas conexões fica em
-- tests/integration/trips-reservation.live.test.ts. Hermético: desfeito pelo rollback.

delete from public.user_sessions where user_id in (
  '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000003');
select public.start_user_session('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000800a2', 'aal1');

-- Segundo usuário do Tenant A com o papel Gestor logístico.
insert into auth.users (id, aud, role, email) values ('10000000-0000-0000-0000-0000000008e1', 'authenticated', 'authenticated', 'trip-logistics@example.invalid');
insert into public.profiles (user_id, display_name) values ('10000000-0000-0000-0000-0000000008e1', 'Gestor Logístico');
insert into public.memberships (id, organization_id, user_id, status, activated_at) values
  ('30000000-0000-0000-0000-0000000008e1', '20000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-0000000008e1', 'active', now());
insert into public.membership_roles (membership_id, role_id, assigned_by)
  select '30000000-0000-0000-0000-0000000008e1', r.id, '10000000-0000-0000-0000-000000000001' from public.roles r
   where r.organization_id = '20000000-0000-0000-0000-00000000000a' and r.code = 'logistics_manager';
select public.start_user_session('10000000-0000-0000-0000-0000000008e1', '60000000-0000-0000-0000-0000000800e1', 'aal1');

insert into public.customers (id, organization_id, person_type, document_display, legal_name, segment) values
  ('91000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', 'legal', '11222333000181', 'Hospital Alfa Ltda', 'hospital');
insert into public.customer_sites (id, organization_id, customer_id, name, postal_code, street, number, city, state) values
  ('92000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', '91000000-0000-0000-0000-00000000000a', 'Unidade A', '01001000', 'Praça da Sé', '1', 'São Paulo', 'SP');
insert into public.vehicles (id, organization_id, plate, vehicle_type, capacity_cylinders) values
  ('95000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-00000000000a', 'AAA1111', 'truck', 10),
  ('95000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-00000000000a', 'AAA2222', 'truck', 10);
insert into public.drivers (id, organization_id, full_name, cpf_display, cnh_display, cnh_category, cnh_valid_until) values
  ('96000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-00000000000a', 'Motorista 1', 'x', 'x', 'D', current_date + 365),
  ('96000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-00000000000a', 'Motorista 2', 'y', 'y', 'D', current_date + 365);
insert into public.cylinder_types (id, organization_id, gas, capacity_value, capacity_unit, classification) values
  ('97000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', 'Oxigênio', 10, 'l', 'medicinal');
insert into public.cylinders (id, organization_id, cylinder_type_id, serial_number, stock_status, hydro_last_result, hydro_next_due_on)
  select ('98000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid, '20000000-0000-0000-0000-00000000000a', '97000000-0000-0000-0000-00000000000a',
         'CON-' || lpad(n::text, 3, '0'), 'in_stock', 'approved', current_date + 200 from generate_series(1, 6) n;

create function pg_temp.cy(n integer) returns uuid language sql as $$ select ('98000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid $$;
create function pg_temp.plan_as(p_user uuid, p_session uuid, p_vehicle integer, p_driver integer, p_cyls integer[]) returns jsonb language sql as $$
  select public.create_trip(p_user, p_session, '20000000-0000-0000-0000-00000000000a', gen_random_uuid(), current_date,
    ('95000000-0000-0000-0000-' || lpad(p_vehicle::text, 12, '0'))::uuid, ('96000000-0000-0000-0000-' || lpad(p_driver::text, 12, '0'))::uuid, null,
    jsonb_build_array(jsonb_build_object('site_id', '92000000-0000-0000-0000-00000000000a', 'cylinder_ids', (select jsonb_agg(pg_temp.cy(c)) from unnest(p_cyls) c))))
$$;

-- A chega primeiro; o gestor logístico tenta os mesmos cilindros em outra ordem, com outro veículo e motorista.
create temp table a1 as select pg_temp.plan_as('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000800a2', 1, 1, array[1, 2]) as r;
create temp table b1 as select pg_temp.plan_as('10000000-0000-0000-0000-0000000008e1', '60000000-0000-0000-0000-0000000800e1', 2, 2, array[2, 1]) as r;
select is((select r ->> 'code' from a1), 'CREATED', 'a primeira sessão reserva');
select is((select r ->> 'code' from b1), 'CYLINDER_RESERVED', 'a segunda recebe CYLINDER_RESERVED');
select is((select r ->> 'trip_number' from b1), (select r ->> 'number' from a1), 'com o número da viagem vencedora');
select is((select r ->> 'trip_id' from b1), (select r ->> 'trip_id' from a1), 'e o id dela');
select is((select count(*)::int from public.trip_items where cylinder_id in (pg_temp.cy(1), pg_temp.cy(2)) and is_open), 2, 'cada cilindro tem exatamente uma reserva aberta');

-- Ordens diferentes e cilindros distintos não se atrapalham.
select is(pg_temp.plan_as('10000000-0000-0000-0000-0000000008e1', '60000000-0000-0000-0000-0000000800e1', 2, 2, array[4, 3]) ->> 'code', 'CREATED', 'cilindros livres, em qualquer ordem, são reservados');
select is(pg_temp.plan_as('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000800a2', 1, 1, array[3, 5]) ->> 'code', 'CYLINDER_RESERVED', 'um cilindro livre misturado a um reservado: recusado por inteiro');
select is((select count(*)::int from public.trip_items where cylinder_id = pg_temp.cy(5)), 0, 'o cilindro livre da tentativa recusada continua livre');

-- O índice é a garantia final, mesmo contra um erro de código.
select throws_ok($$ insert into public.trip_items (organization_id, trip_id, stop_id, cylinder_id, created_by)
  select i.organization_id, i.trip_id, i.stop_id, i.cylinder_id, i.created_by from public.trip_items i where i.cylinder_id = pg_temp.cy(1) and i.trip_id <> (select (r ->> 'trip_id')::uuid from a1)
  union all select '20000000-0000-0000-0000-00000000000a', t.id, s.id, pg_temp.cy(1), '10000000-0000-0000-0000-000000000002'
    from public.trips t join public.trip_stops s on s.trip_id = t.id where t.number = 2 limit 1 $$, '23505', null, 'inserir direto um segundo item aberto do mesmo cilindro viola o índice único');
select is((select count(*)::int from public.trip_items where cylinder_id = pg_temp.cy(1) and is_open), 1, 'e a reserva única continua intacta');

select * from finish();
rollback;
