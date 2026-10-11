begin;
select plan(51);

-- Spec 008, US1 (leitura): get_trip, list_trips, trip_options e list_eligible_cylinders (RF-001a, RF-005, RF-026, RF-029, RF-030, CA-001).
-- Dois tenants: o A planeja, o B só serve para provar que nada atravessa. Hermético: desfeito pelo rollback.

delete from public.user_sessions where user_id in (
  '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000003');
insert into public.membership_roles (membership_id, role_id, assigned_by)
  select '30000000-0000-0000-0000-00000000000b', r.id, '10000000-0000-0000-0000-000000000001'
    from public.roles r where r.organization_id = '20000000-0000-0000-0000-00000000000b' and r.code = 'tenant_admin';
select public.start_user_session('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000800a2', 'aal1');
select public.start_user_session('10000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-0000000800b3', 'aal1');

-- Motorista (sem permissão de viagem) e auditor (trip.read e trip.history) no Tenant A.
insert into auth.users (id, aud, role, email) values
  ('10000000-0000-0000-0000-0000000008c1', 'authenticated', 'authenticated', 'trip-driver@example.invalid'),
  ('10000000-0000-0000-0000-0000000008d1', 'authenticated', 'authenticated', 'trip-auditor@example.invalid');
insert into public.profiles (user_id, display_name) values
  ('10000000-0000-0000-0000-0000000008c1', 'Motorista Viagens'), ('10000000-0000-0000-0000-0000000008d1', 'Auditor Viagens');
insert into public.memberships (id, organization_id, user_id, status, activated_at) values
  ('30000000-0000-0000-0000-0000000008c1', '20000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-0000000008c1', 'active', now()),
  ('30000000-0000-0000-0000-0000000008d1', '20000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-0000000008d1', 'active', now());
insert into public.membership_roles (membership_id, role_id, assigned_by)
  select '30000000-0000-0000-0000-0000000008c1', r.id, '10000000-0000-0000-0000-000000000001' from public.roles r where r.organization_id = '20000000-0000-0000-0000-00000000000a' and r.code = 'driver';
insert into public.membership_roles (membership_id, role_id, assigned_by)
  select '30000000-0000-0000-0000-0000000008d1', r.id, '10000000-0000-0000-0000-000000000001' from public.roles r where r.organization_id = '20000000-0000-0000-0000-00000000000a' and r.code = 'tenant_auditor';
select public.start_user_session('10000000-0000-0000-0000-0000000008c1', '60000000-0000-0000-0000-0000000800c1', 'aal1');
select public.start_user_session('10000000-0000-0000-0000-0000000008d1', '60000000-0000-0000-0000-0000000800d1', 'aal1');

insert into public.customers (id, organization_id, person_type, document_display, legal_name, trade_name, segment, status, inactivated_at) values
  ('91000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', 'legal', '11222333000181', 'Hospital Alfa Ltda', 'Alfa Saúde', 'hospital', 'active', null),
  ('91000000-0000-0000-0000-0000000000a2', '20000000-0000-0000-0000-00000000000a', 'legal', '22333444000181', 'Clínica Inativa Ltda', null, 'clinic', 'inactive', now()),
  ('91000000-0000-0000-0000-0000000000a3', '20000000-0000-0000-0000-00000000000a', 'individual', '***.***.***-11', 'Pessoa Física Fictícia', null, 'clinic', 'active', null),
  ('91000000-0000-0000-0000-00000000000b', '20000000-0000-0000-0000-00000000000b', 'legal', '11222333000181', 'Hospital Beta Ltda', null, 'hospital', 'active', null);
insert into public.customer_sites (id, organization_id, customer_id, name, postal_code, street, number, city, state, status, inactivated_at) values
  ('92000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-00000000000a', '91000000-0000-0000-0000-00000000000a', 'Unidade 1', '01001000', 'Praça da Sé', '1', 'São Paulo', 'SP', 'active', null),
  ('92000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-00000000000a', '91000000-0000-0000-0000-00000000000a', 'Unidade 2 inativa', '01001000', 'Praça da Sé', '2', 'São Paulo', 'SP', 'inactive', now()),
  ('92000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-00000000000a', '91000000-0000-0000-0000-0000000000a2', 'Unidade da clínica inativa', '01001000', 'Praça da Sé', '4', 'São Paulo', 'SP', 'active', null),
  ('92000000-0000-0000-0000-000000000005', '20000000-0000-0000-0000-00000000000a', '91000000-0000-0000-0000-0000000000a3', 'Residência', '01001000', 'Rua Fictícia', '5', 'Santos', 'SP', 'active', null),
  ('92000000-0000-0000-0000-00000000000b', '20000000-0000-0000-0000-00000000000b', '91000000-0000-0000-0000-00000000000b', 'Unidade B', '01001000', 'Praça da Sé', '1', 'São Paulo', 'SP', 'active', null);
insert into public.vehicles (id, organization_id, plate, vehicle_type, capacity_cylinders, status, inactivated_at, licensing_due_on) values
  ('95000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-00000000000a', 'AAA1111', 'truck', 10, 'available', null, current_date - 2),
  ('95000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-00000000000a', 'AAA2222', 'truck', 10, 'maintenance', null, null),
  ('95000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-00000000000a', 'AAA3333', 'van', 10, 'available', null, current_date + 400),
  ('95000000-0000-0000-0000-00000000000b', '20000000-0000-0000-0000-00000000000b', 'BBB1111', 'truck', 10, 'available', null, null);
insert into public.drivers (id, organization_id, full_name, cpf_display, cnh_display, cnh_category, cnh_valid_until, status, inactivated_at) values
  ('96000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-00000000000a', 'Motorista Alfa', 'x', 'x', 'D', current_date - 1, 'active', null),
  ('96000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-00000000000a', 'Motorista Inativo', 'y', 'y', 'D', current_date + 365, 'inactive', now()),
  ('96000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-00000000000a', 'Motorista Beta', 'z', 'z', 'D', current_date + 365, 'active', null),
  ('96000000-0000-0000-0000-00000000000b', '20000000-0000-0000-0000-00000000000b', 'Motorista do B', 'x', 'x', 'D', current_date + 365, 'active', null);
insert into public.cylinder_types (id, organization_id, gas, capacity_value, capacity_unit, classification) values
  ('97000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', 'Oxigênio', 10, 'l', 'medicinal'),
  ('97000000-0000-0000-0000-00000000000b', '20000000-0000-0000-0000-00000000000b', 'Oxigênio', 10, 'l', 'medicinal');
create function pg_temp.cy(n integer) returns uuid language sql as $$ select ('98000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid $$;
insert into public.cylinders (id, organization_id, cylinder_type_id, serial_number, stock_status, hydro_last_result, hydro_next_due_on)
  select pg_temp.cy(n), '20000000-0000-0000-0000-00000000000a', '97000000-0000-0000-0000-00000000000a', 'RD-' || lpad(n::text, 3, '0'), 'in_stock', 'approved', current_date + 200
    from generate_series(1, 12) n;
insert into public.cylinders (id, organization_id, cylinder_type_id, serial_number, stock_status, hydro_last_result, hydro_next_due_on) values
  (pg_temp.cy(21), '20000000-0000-0000-0000-00000000000a', '97000000-0000-0000-0000-00000000000a', 'RD-021', 'out_of_stock', 'approved', current_date + 200),
  (pg_temp.cy(23), '20000000-0000-0000-0000-00000000000a', '97000000-0000-0000-0000-00000000000a', 'RD-023', 'in_stock', 'approved', current_date - 1),
  (pg_temp.cy(24), '20000000-0000-0000-0000-00000000000a', '97000000-0000-0000-0000-00000000000a', 'RD-024', 'in_stock', 'rejected', null),
  (pg_temp.cy(30), '20000000-0000-0000-0000-00000000000b', '97000000-0000-0000-0000-00000000000b', 'RD-B-030', 'in_stock', 'approved', current_date + 200);
insert into public.cylinders (id, organization_id, cylinder_type_id, serial_number, status, inactivation_reason, stock_status, hydro_last_result, hydro_next_due_on) values
  (pg_temp.cy(22), '20000000-0000-0000-0000-00000000000a', '97000000-0000-0000-0000-00000000000a', 'RD-022', 'inactive', 'lost', 'out_of_stock', 'approved', current_date + 200);
insert into public.cylinder_identifiers (organization_id, cylinder_id, kind, value) values
  ('20000000-0000-0000-0000-00000000000a', pg_temp.cy(3), 'qr_code', 'QR-LEITURA-3');

create function pg_temp.stop(p_site integer, p_cyls integer[]) returns jsonb language sql as $$
  select jsonb_build_object('site_id', ('92000000-0000-0000-0000-' || lpad(p_site::text, 12, '0'))::uuid, 'cylinder_ids', (select jsonb_agg(pg_temp.cy(c)) from unnest(p_cyls) c))
$$;
create function pg_temp.mk(p_stops jsonb, p_vehicle integer, p_driver integer, p_date date) returns jsonb language sql as $$
  select public.create_trip('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000800a2', '20000000-0000-0000-0000-00000000000a', gen_random_uuid(), p_date,
    ('95000000-0000-0000-0000-' || lpad(p_vehicle::text, 12, '0'))::uuid, ('96000000-0000-0000-0000-' || lpad(p_driver::text, 12, '0'))::uuid, null, p_stops)
$$;
create function pg_temp.get(p_user uuid, p_session uuid, p_org uuid, p_trip uuid) returns jsonb language sql as $$ select public.get_trip(p_user, p_session, p_org, p_trip) $$;
create function pg_temp.list_a(p_search text default null, p_status text default null, p_sort text default null, p_cursor text default null, p_limit integer default null, p_custody text default null)
returns jsonb language sql as $$
  select public.list_trips('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000800a2', '20000000-0000-0000-0000-00000000000a', p_search, p_status, null, null, null, null, null, p_custody, p_sort, p_cursor, p_limit)
$$;

-- Três viagens do Tenant A (uma delas atrasada) e uma do Tenant B.
create temp table ta as select
  pg_temp.mk(jsonb_build_array(pg_temp.stop(1, array[1, 2])), 1, 1, current_date + 2) as r1,
  pg_temp.mk(jsonb_build_array(pg_temp.stop(5, array[3])), 3, 3, current_date + 5) as r2;
create temp table tb as select public.create_trip('10000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-0000000800b3', '20000000-0000-0000-0000-00000000000b', gen_random_uuid(), current_date,
  '95000000-0000-0000-0000-00000000000b', '96000000-0000-0000-0000-00000000000b', null, jsonb_build_array(jsonb_build_object('site_id', '92000000-0000-0000-0000-00000000000b', 'cylinder_ids', jsonb_build_array(pg_temp.cy(30))))) as r;
-- Viagem atrasada (data prevista no passado) e outra concluída: inseridas direto, como o resto da massa.
insert into public.trips (id, organization_id, number, planned_date, vehicle_id, driver_id, created_by, status, started_at, started_by, completed_at, completed_by) values
  ('99000000-0000-0000-0000-0000000000c1', '20000000-0000-0000-0000-00000000000a', 71, current_date - 4, '95000000-0000-0000-0000-000000000003', '96000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000002', 'planned', null, null, null, null),
  ('99000000-0000-0000-0000-0000000000c2', '20000000-0000-0000-0000-00000000000a', 72, current_date - 9, '95000000-0000-0000-0000-000000000003', '96000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000002', 'completed', now(), '10000000-0000-0000-0000-000000000002', now(), '10000000-0000-0000-0000-000000000002');

select is((select r1 ->> 'code' from ta), 'CREATED', 'preparação: primeira viagem do A');
select is((select r ->> 'code' from tb), 'CREATED', 'preparação: viagem do B');

-- get_trip.
select is(pg_temp.get('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000800a2', '20000000-0000-0000-0000-00000000000a', (select (r1 ->> 'trip_id')::uuid from ta)) ->> 'code', 'FOUND', 'A abre a própria viagem');
select is(pg_temp.get('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000800a2', '20000000-0000-0000-0000-00000000000a', (select (r1 ->> 'trip_id')::uuid from ta)) -> 'trip' ->> 'status', 'planned', 'detalhe com a situação');
select is(jsonb_array_length(pg_temp.get('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000800a2', '20000000-0000-0000-0000-00000000000a', (select (r1 ->> 'trip_id')::uuid from ta)) -> 'stops'), 1, 'uma parada');
select is(jsonb_array_length(pg_temp.get('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000800a2', '20000000-0000-0000-0000-00000000000a', (select (r1 ->> 'trip_id')::uuid from ta)) -> 'items'), 2, 'dois cilindros');
select is(pg_temp.get('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000800a2', '20000000-0000-0000-0000-00000000000a', (select (r1 ->> 'trip_id')::uuid from ta)) -> 'stops' -> 0 -> 'site' ->> 'customer_name', 'Alfa Saúde', 'o nome do cliente vem do nome fantasia');
select is(pg_temp.get('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000800a2', '20000000-0000-0000-0000-00000000000a', (select (r1 ->> 'trip_id')::uuid from ta)) -> 'warnings', '["licensing_expired", "cnh_expired"]'::jsonb, 'avisos de licenciamento e de CNH vencidos');
select is((pg_temp.get('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000800a2', '20000000-0000-0000-0000-00000000000a', (select (r1 ->> 'trip_id')::uuid from ta)) ->> 'overdue')::boolean, false, 'viagem no prazo não é atrasada');
select is((pg_temp.get('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000800a2', '20000000-0000-0000-0000-00000000000a', '99000000-0000-0000-0000-0000000000c1') ->> 'overdue')::boolean, true, 'planejada com data passada é atrasada');
select is((pg_temp.get('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000800a2', '20000000-0000-0000-0000-00000000000a', '99000000-0000-0000-0000-0000000000c2') ->> 'overdue')::boolean, false, 'concluída com data passada não é atrasada');
select is(pg_temp.get('10000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-0000000800b3', '20000000-0000-0000-0000-00000000000b', (select (r1 ->> 'trip_id')::uuid from ta)) ->> 'code', 'NOT_FOUND', 'B não abre viagem do A');
select is(pg_temp.get('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000800a2', '20000000-0000-0000-0000-00000000000a', (select (r ->> 'trip_id')::uuid from tb)) ->> 'code', 'NOT_FOUND', 'A não abre viagem do B');
select is(pg_temp.get('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000800a2', '20000000-0000-0000-0000-00000000000b', (select (r ->> 'trip_id')::uuid from tb)) ->> 'code', 'ACCESS_DENIED', 'A não age na organização B (sem vínculo)');

-- list_trips.
select is((pg_temp.list_a() ->> 'total')::int, 3, 'filtro padrão "abertas": as 2 planejadas e a atrasada');
select is((pg_temp.list_a(null, 'all') ->> 'total')::int, 4, 'todas: 4 viagens do A, nenhuma do B');
select is((pg_temp.list_a(null, 'completed') ->> 'total')::int, 1, 'filtro por situação');
select is(pg_temp.list_a(null, 'all') -> 'items' -> 0 ->> 'number', '72', 'ordem padrão: número decrescente');
select is(pg_temp.list_a(null, 'all', 'number_asc') -> 'items' -> 0 ->> 'number', '1', 'ordem crescente');
select is(pg_temp.list_a(null, 'all', 'date_desc') -> 'items' -> 0 ->> 'number', '2', 'por data prevista decrescente');
select is((pg_temp.list_a('72', 'all') ->> 'total')::int, 1, 'busca pelo número');
select is((pg_temp.list_a('aaa-1111', 'all') ->> 'total')::int, 1, 'busca pela placa, com ou sem hífen');
select is((pg_temp.list_a('motorista alfa', 'all') ->> 'total')::int, 1, 'busca pelo nome do motorista');
select is((pg_temp.list_a('alfa saúde', 'all') ->> 'total')::int, 1, 'busca pelo nome do cliente');
select is((pg_temp.list_a('fictícia', 'all') ->> 'total')::int, 1, 'busca pelo cliente pessoa física');
select is((pg_temp.list_a('hospital beta', 'all') ->> 'total')::int, 0, 'a busca não alcança o B');
select is(pg_temp.list_a(null, 'all') -> 'items' -> 3 -> 'vehicle' ->> 'plate', 'AAA1111', 'o item da lista traz a placa');
select is((pg_temp.list_a(null, 'all') -> 'items' -> 3 ->> 'cylinders')::int, 2, 'e a quantidade de cilindros');
select is((pg_temp.list_a(null, 'all') -> 'items' -> 1 ->> 'overdue')::boolean, true, 'a atrasada aparece marcada na lista');
select is(pg_temp.list_a(null, 'bogus') ->> 'code', 'VALIDATION_FAILED', 'situação desconhecida');
select is(pg_temp.list_a(null, 'all', null, 'não-é-cursor') ->> 'code', 'VALIDATION_FAILED', 'cursor inválido');
select is(pg_temp.list_a(null, 'all', null, null, 2) -> 'items' -> 1 ->> 'number', '71', 'a primeira página tem 2');
select isnt(pg_temp.list_a(null, 'all', null, null, 2) ->> 'next', null, 'e há próxima');
select is(pg_temp.list_a(null, 'all', null, pg_temp.list_a(null, 'all', null, null, 2) ->> 'next', 2) -> 'items' -> 0 ->> 'number', '2', 'a segunda página continua do ponto');
select is(pg_temp.list_a(null, 'all', null, pg_temp.list_a(null, 'all', null, null, 2) ->> 'next', 2) ->> 'next', null, 'e a última não tem próxima');
select is((public.list_trips('10000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-0000000800b3', '20000000-0000-0000-0000-00000000000b', null, 'all', null, null, null, null, null, null, null, null, null) ->> 'total')::int, 1, 'B lista só a própria viagem');

-- trip_options.
create temp table opt as select public.trip_options('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000800a2', '20000000-0000-0000-0000-00000000000a', null) as r;
select is((select jsonb_array_length(r -> 'vehicles') from opt), 2, 'só veículos disponíveis (manutenção e B ficam de fora)');
select is((select jsonb_array_length(r -> 'drivers') from opt), 2, 'só motoristas ativos');
select is((select jsonb_array_length(r -> 'sites') from opt), 2, 'só unidades ativas de clientes ativos');
select is(public.trip_options('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000800a2', '20000000-0000-0000-0000-00000000000a', 'aaa3') -> 'vehicles' -> 0 ->> 'plate', 'AAA3333', 'a busca filtra por placa');

-- list_eligible_cylinders.
create temp table elig as select public.list_eligible_cylinders('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000800a2', '20000000-0000-0000-0000-00000000000a', null, null, null, 100) as r;
select is((select jsonb_array_length(r -> 'items') from elig), 9, '12 cilindros em estoque menos os 3 já reservados (1, 2 e 3)');
select is((select count(*)::int from elig e, jsonb_array_elements(e.r -> 'items') i where i ->> 'serial_number' in ('RD-021', 'RD-022', 'RD-023', 'RD-024', 'RD-B-030', 'RD-001')), 0, 'sem reservado, inativo, fora do estoque, vencido, reprovado ou do B');
select is(public.list_eligible_cylinders('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000800a2', '20000000-0000-0000-0000-00000000000a', 'rd-004', null, null, 100) -> 'items' -> 0 ->> 'serial_number', 'RD-004', 'busca pelo número de série');
select is(jsonb_array_length(public.list_eligible_cylinders('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000800a2', '20000000-0000-0000-0000-00000000000a', 'QR-LEITURA-3', null, null, 100) -> 'items'), 0, 'o identificador de um cilindro reservado não o traz de volta');
select is((public.list_eligible_cylinders('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000800a2', '20000000-0000-0000-0000-00000000000a', null, null, null, 4) -> 'items' -> 3 ->> 'serial_number'), 'RD-007', 'paginação: 4 por página');
select is(public.list_eligible_cylinders('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000800a2', '20000000-0000-0000-0000-00000000000a', null, null,
  public.list_eligible_cylinders('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000800a2', '20000000-0000-0000-0000-00000000000a', null, null, null, 4) ->> 'next', 4) -> 'items' -> 0 ->> 'serial_number', 'RD-008', 'a segunda página continua do ponto');

-- Permissões: motorista não lê nada; auditor lê e não planeja.
select is(public.list_trips('10000000-0000-0000-0000-0000000008c1', '60000000-0000-0000-0000-0000000800c1', '20000000-0000-0000-0000-00000000000a', null, null, null, null, null, null, null, null, null, null, null) ->> 'code', 'ACCESS_DENIED', 'motorista não lista viagens');
select is(pg_temp.get('10000000-0000-0000-0000-0000000008c1', '60000000-0000-0000-0000-0000000800c1', '20000000-0000-0000-0000-00000000000a', (select (r1 ->> 'trip_id')::uuid from ta)) ->> 'code', 'ACCESS_DENIED', 'motorista não abre viagem');
select is(public.trip_options('10000000-0000-0000-0000-0000000008d1', '60000000-0000-0000-0000-0000000800d1', '20000000-0000-0000-0000-00000000000a', null) ->> 'code', 'ACCESS_DENIED', 'auditor (sem trip.write) não vê as opções do formulário');
select is(public.list_eligible_cylinders('10000000-0000-0000-0000-0000000008d1', '60000000-0000-0000-0000-0000000800d1', '20000000-0000-0000-0000-00000000000a', null, null, null, 10) ->> 'code', 'ACCESS_DENIED', 'nem os cilindros elegíveis');
select is(pg_temp.get('10000000-0000-0000-0000-0000000008d1', '60000000-0000-0000-0000-0000000800d1', '20000000-0000-0000-0000-00000000000a', (select (r1 ->> 'trip_id')::uuid from ta)) ->> 'code', 'FOUND', 'auditor abre a viagem');

select * from finish();
rollback;
