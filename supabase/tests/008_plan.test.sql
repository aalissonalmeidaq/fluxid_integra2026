begin;
select plan(82);

-- Spec 008, US1: planejar e editar viagens (RF-001 a RF-006, RF-006a, RF-024, RF-029). Hermético: desfeito pelo rollback.
-- Ator: administrador do Tenant A (tenant_admin). Tenant B só aparece para provar o isolamento.

delete from public.user_sessions where user_id in (
  '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000003');
select public.start_user_session('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000800a2', 'aal1');

-- Motorista (papel driver, sem permissão de viagem) no Tenant A.
insert into auth.users (id, aud, role, email) values ('10000000-0000-0000-0000-0000000008c1', 'authenticated', 'authenticated', 'trip-driver@example.invalid');
insert into public.profiles (user_id, display_name) values ('10000000-0000-0000-0000-0000000008c1', 'Motorista Viagens');
insert into public.memberships (id, organization_id, user_id, status, activated_at) values
  ('30000000-0000-0000-0000-0000000008c1', '20000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-0000000008c1', 'active', now());
insert into public.membership_roles (membership_id, role_id, assigned_by)
  select '30000000-0000-0000-0000-0000000008c1', r.id, '10000000-0000-0000-0000-000000000001'
    from public.roles r where r.organization_id = '20000000-0000-0000-0000-00000000000a' and r.code = 'driver';
select public.start_user_session('10000000-0000-0000-0000-0000000008c1', '60000000-0000-0000-0000-0000000800c1', 'aal1');

-- Cadastros do Tenant A.
insert into public.customers (id, organization_id, person_type, document_display, legal_name, segment, status, inactivated_at) values
  ('91000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', 'legal', '11222333000181', 'Hospital Alfa Ltda', 'hospital', 'active', null),
  ('91000000-0000-0000-0000-0000000000a2', '20000000-0000-0000-0000-00000000000a', 'legal', '22333444000181', 'Clínica Inativa Ltda', 'clinic', 'inactive', now()),
  ('91000000-0000-0000-0000-00000000000b', '20000000-0000-0000-0000-00000000000b', 'legal', '11222333000181', 'Hospital Beta Ltda', 'hospital', 'active', null);
insert into public.customer_sites (id, organization_id, customer_id, name, postal_code, street, number, city, state, status, inactivated_at) values
  ('92000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-00000000000a', '91000000-0000-0000-0000-00000000000a', 'Unidade 1', '01001000', 'Praça da Sé', '1', 'São Paulo', 'SP', 'active', null),
  ('92000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-00000000000a', '91000000-0000-0000-0000-00000000000a', 'Unidade 2', '01001000', 'Praça da Sé', '2', 'São Paulo', 'SP', 'active', null),
  ('92000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-00000000000a', '91000000-0000-0000-0000-00000000000a', 'Unidade 3 inativa', '01001000', 'Praça da Sé', '3', 'São Paulo', 'SP', 'inactive', now()),
  ('92000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-00000000000a', '91000000-0000-0000-0000-0000000000a2', 'Unidade da clínica inativa', '01001000', 'Praça da Sé', '4', 'São Paulo', 'SP', 'active', null),
  ('92000000-0000-0000-0000-00000000000b', '20000000-0000-0000-0000-00000000000b', '91000000-0000-0000-0000-00000000000b', 'Unidade B', '01001000', 'Praça da Sé', '1', 'São Paulo', 'SP', 'active', null);
insert into public.vehicles (id, organization_id, plate, vehicle_type, capacity_cylinders, status, inactivated_at) values
  ('95000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-00000000000a', 'AAA1111', 'truck', 4, 'available', null),
  ('95000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-00000000000a', 'AAA2222', 'truck', 4, 'maintenance', null),
  ('95000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-00000000000a', 'AAA3333', 'truck', 300, 'available', null),
  ('95000000-0000-0000-0000-00000000000b', '20000000-0000-0000-0000-00000000000b', 'BBB1111', 'truck', 10, 'available', null);
insert into public.drivers (id, organization_id, full_name, cpf_display, cnh_display, cnh_category, cnh_valid_until, status, inactivated_at) values
  ('96000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-00000000000a', 'Motorista A1', 'x', 'x', 'D', current_date + 365, 'active', null),
  ('96000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-00000000000a', 'Motorista A2 inativo', 'y', 'y', 'D', current_date + 365, 'inactive', now()),
  ('96000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-00000000000a', 'Motorista A3', 'z', 'z', 'D', current_date + 365, 'active', null),
  ('96000000-0000-0000-0000-00000000000b', '20000000-0000-0000-0000-00000000000b', 'Motorista B', 'x', 'x', 'D', current_date + 365, 'active', null);
insert into public.cylinder_types (id, organization_id, gas, capacity_value, capacity_unit, classification) values
  ('97000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', 'Oxigênio', 10, 'l', 'medicinal'),
  ('97000000-0000-0000-0000-00000000000b', '20000000-0000-0000-0000-00000000000b', 'Oxigênio', 10, 'l', 'medicinal');

create function pg_temp.cy(n integer) returns uuid language sql as $$ select ('98000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid $$;
-- 1 a 12 e 40 a 280: elegíveis. 21 fora do estoque, 22 inativo, 23 teste vencido, 24 reprovado, 25 sem teste, 26 teste a vencer.
insert into public.cylinders (id, organization_id, cylinder_type_id, serial_number, stock_status, hydro_last_result, hydro_next_due_on)
  select pg_temp.cy(n), '20000000-0000-0000-0000-00000000000a', '97000000-0000-0000-0000-00000000000a', 'PLN-' || lpad(n::text, 4, '0'), 'in_stock', 'approved', current_date + 200
    from generate_series(1, 12) n;
insert into public.cylinders (id, organization_id, cylinder_type_id, serial_number, stock_status, hydro_last_result, hydro_next_due_on)
  select pg_temp.cy(n), '20000000-0000-0000-0000-00000000000a', '97000000-0000-0000-0000-00000000000a', 'PLN-' || lpad(n::text, 4, '0'), 'in_stock', 'approved', current_date + 200
    from generate_series(40, 280) n;
insert into public.cylinders (id, organization_id, cylinder_type_id, serial_number, stock_status, hydro_last_result, hydro_next_due_on) values
  (pg_temp.cy(21), '20000000-0000-0000-0000-00000000000a', '97000000-0000-0000-0000-00000000000a', 'PLN-0021', 'out_of_stock', 'approved', current_date + 200),
  (pg_temp.cy(23), '20000000-0000-0000-0000-00000000000a', '97000000-0000-0000-0000-00000000000a', 'PLN-0023', 'in_stock', 'approved', current_date - 1),
  (pg_temp.cy(24), '20000000-0000-0000-0000-00000000000a', '97000000-0000-0000-0000-00000000000a', 'PLN-0024', 'in_stock', 'rejected', null),
  (pg_temp.cy(25), '20000000-0000-0000-0000-00000000000a', '97000000-0000-0000-0000-00000000000a', 'PLN-0025', 'in_stock', null, null),
  (pg_temp.cy(26), '20000000-0000-0000-0000-00000000000a', '97000000-0000-0000-0000-00000000000a', 'PLN-0026', 'in_stock', 'approved', current_date + 10),
  (pg_temp.cy(30), '20000000-0000-0000-0000-00000000000b', '97000000-0000-0000-0000-00000000000b', 'PLN-B-0030', 'in_stock', 'approved', current_date + 200);
insert into public.cylinders (id, organization_id, cylinder_type_id, serial_number, status, inactivation_reason, stock_status, hydro_last_result, hydro_next_due_on) values
  (pg_temp.cy(22), '20000000-0000-0000-0000-00000000000a', '97000000-0000-0000-0000-00000000000a', 'PLN-0022', 'inactive', 'lost', 'out_of_stock', 'approved', current_date + 200);

create function pg_temp.stop(p_site integer, p_cyls integer[]) returns jsonb language sql as $$
  select jsonb_build_object('site_id', ('92000000-0000-0000-0000-' || lpad(p_site::text, 12, '0'))::uuid, 'cylinder_ids', (select jsonb_agg(pg_temp.cy(c)) from unnest(p_cyls) c))
$$;
create function pg_temp.mk(p_stops jsonb, p_vehicle integer default 1, p_driver integer default 1, p_date date default current_date, p_notes text default null, p_req uuid default gen_random_uuid())
returns jsonb language sql as $$
  select public.create_trip('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000800a2', '20000000-0000-0000-0000-00000000000a', p_req, p_date,
    ('95000000-0000-0000-0000-' || lpad(p_vehicle::text, 12, '0'))::uuid, ('96000000-0000-0000-0000-' || lpad(p_driver::text, 12, '0'))::uuid, p_notes, p_stops)
$$;
create function pg_temp.upd(p_trip uuid, p_version bigint, p_stops jsonb, p_vehicle integer default 1, p_driver integer default 1, p_date date default current_date, p_notes text default null, p_req uuid default gen_random_uuid())
returns jsonb language sql as $$
  select public.update_trip('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000800a2', '20000000-0000-0000-0000-00000000000a', p_req, p_trip, p_version, p_date,
    ('95000000-0000-0000-0000-' || lpad(p_vehicle::text, 12, '0'))::uuid, ('96000000-0000-0000-0000-' || lpad(p_driver::text, 12, '0'))::uuid, p_notes, p_stops)
$$;
create function pg_temp.trips_a() returns integer language sql as $$ select count(*)::int from public.trips where organization_id = '20000000-0000-0000-0000-00000000000a' $$;

-- 1. Criação feliz: duas paradas e quatro cilindros.
create temp table t1 as select pg_temp.mk(jsonb_build_array(pg_temp.stop(1, array[1, 2]), pg_temp.stop(2, array[3, 4])), 1, 1, current_date, 'Observação sigilosa XYZ') as r;
select is((select r ->> 'code' from t1), 'CREATED', 'create_trip cria a viagem');
select is((select (r ->> 'number')::int from t1), 1, 'o primeiro número da organização é 1');
select is((select (r ->> 'version')::int from t1), 1, 'a versão começa em 1');
select is((select status from public.trips where id = (select (r ->> 'trip_id')::uuid from t1)), 'planned', 'nasce planejada');
select is((select count(*)::int from public.trip_stops where trip_id = (select (r ->> 'trip_id')::uuid from t1)), 2, 'duas paradas');
select is((select array_agg(position order by position) from public.trip_stops where trip_id = (select (r ->> 'trip_id')::uuid from t1)), array[1, 2]::smallint[], 'posições 1 e 2 na ordem recebida');
select is((select count(*)::int from public.trip_items where trip_id = (select (r ->> 'trip_id')::uuid from t1) and item_status = 'planned' and lock_status = 'none'), 4, 'quatro itens planejados e sem bloqueio');
select is((select array_agg(s.position order by s.position) from public.trip_items i join public.trip_stops s on s.id = i.stop_id where i.trip_id = (select (r ->> 'trip_id')::uuid from t1)),
  array[1, 1, 2, 2]::smallint[], 'dois cilindros em cada parada');
select is((select count(*)::int from public.trip_events where trip_id = (select (r ->> 'trip_id')::uuid from t1) and event_type = 'trip_created' and sequence = 1), 1, 'evento trip_created na sequência 1');
select is((select count(*)::int from public.cylinder_events where event_type = 'trip_reserved' and cylinder_id = any(array[pg_temp.cy(1), pg_temp.cy(2), pg_temp.cy(3), pg_temp.cy(4)])), 4, 'um evento trip_reserved em cada cilindro');
select is((select data ->> 'trip_number' from public.cylinder_events where event_type = 'trip_reserved' and cylinder_id = pg_temp.cy(1)), '1', 'o evento do cilindro aponta a viagem');
select is((select count(*)::int from public.audit_logs where action = 'trip.create' and target_id = (select r ->> 'trip_id' from t1) and result = 'success'), 1, 'auditoria trip.create gravada');
select is((select count(*)::int from public.audit_logs where metadata::text like '%sigilosa%' or justification like '%sigilosa%'), 0, 'a auditoria não guarda as observações');
select is((select count(*)::int from public.trip_events where data::text like '%sigilosa%' or justification like '%sigilosa%'), 0, 'o evento não guarda as observações');
select is((select notes from public.trips where id = (select (r ->> 'trip_id')::uuid from t1)), 'Observação sigilosa XYZ', 'as observações ficam só na viagem');

-- 2. Número sequencial por organização.
create temp table t2 as select pg_temp.mk(jsonb_build_array(pg_temp.stop(1, array[5, 6])), 3, 3) as r;
select is((select (r ->> 'number')::int from t2), 2, 'o segundo número é 2');

-- 3. Cilindro reservado.
select is(pg_temp.mk(jsonb_build_array(pg_temp.stop(1, array[1])), 3, 3) ->> 'code', 'CYLINDER_RESERVED', 'cilindro com item aberto é recusado');
select is(pg_temp.mk(jsonb_build_array(pg_temp.stop(1, array[1])), 3, 3) ->> 'trip_number', '1', 'a resposta traz a viagem que reservou');
select is(pg_temp.mk(jsonb_build_array(pg_temp.stop(1, array[1])), 3, 3) ->> 'trip_id', (select r ->> 'trip_id' from t1), 'e o id dela');
select is(pg_temp.mk(jsonb_build_array(pg_temp.stop(1, array[7, 1])), 3, 3) ->> 'cylinder_id', pg_temp.cy(1)::text, 'e o cilindro em conflito');
select is(pg_temp.trips_a(), 2, 'a recusa não cria viagem');
select is((select count(*)::int from public.trip_items where cylinder_id = pg_temp.cy(7)), 0, 'nem reserva o outro cilindro da mesma tentativa');

-- 4. Elegibilidade.
select is(pg_temp.mk(jsonb_build_array(pg_temp.stop(1, array[21])), 3, 3) ->> 'reason', 'out_of_stock', 'fora do estoque');
select is(pg_temp.mk(jsonb_build_array(pg_temp.stop(1, array[22])), 3, 3) ->> 'reason', 'inactive', 'inativo');
select is(pg_temp.mk(jsonb_build_array(pg_temp.stop(1, array[23])), 3, 3) ->> 'reason', 'hydro_expired', 'teste vencido');
select is(pg_temp.mk(jsonb_build_array(pg_temp.stop(1, array[24])), 3, 3) ->> 'reason', 'hydro_rejected', 'teste reprovado');
select is(pg_temp.mk(jsonb_build_array(pg_temp.stop(1, array[25])), 3, 3) ->> 'reason', 'hydro_missing', 'sem teste registrado');
select is(pg_temp.mk(jsonb_build_array(pg_temp.stop(1, array[23])), 3, 3) ->> 'code', 'CYLINDER_NOT_ELIGIBLE', 'o código é CYLINDER_NOT_ELIGIBLE');
select is((pg_temp.mk(jsonb_build_array(pg_temp.stop(1, array[26])), 3, 3)) ->> 'code', 'CREATED', 'teste a vencer é aceito');
select is(pg_temp.trips_a(), 3, 'só a viagem com teste a vencer foi criada');

-- 5. Capacidade.
select is(pg_temp.mk(jsonb_build_array(pg_temp.stop(1, array[8, 9, 10, 11, 12])), 1, 3) ->> 'code', 'CAPACITY_EXCEEDED', 'mais cilindros que a capacidade');
select is(pg_temp.mk(jsonb_build_array(pg_temp.stop(1, array[8, 9, 10, 11, 12])), 1, 3) ->> 'capacity', '4', 'a resposta traz a capacidade');
select is(pg_temp.mk(jsonb_build_array(pg_temp.stop(1, array[8, 9, 10, 11, 12])), 1, 3) ->> 'requested', '5', 'e a quantidade pedida');

-- 6. Cadastros indisponíveis.
select is(pg_temp.mk(jsonb_build_array(pg_temp.stop(1, array[8])), 2, 3) ->> 'code', 'PARENT_INACTIVE', 'veículo em manutenção');
select is(pg_temp.mk(jsonb_build_array(pg_temp.stop(1, array[8])), 2, 3) ->> 'entity', 'vehicle', 'a entidade é o veículo');
select is(pg_temp.mk(jsonb_build_array(pg_temp.stop(1, array[8])), 1, 2) ->> 'entity', 'driver', 'motorista inativo');
select is(pg_temp.mk(jsonb_build_array(pg_temp.stop(3, array[8])), 1, 3) ->> 'entity', 'site', 'unidade inativa');
select is(pg_temp.mk(jsonb_build_array(pg_temp.stop(4, array[8])), 1, 3) ->> 'entity', 'customer', 'cliente inativo');

-- 7. Isolamento: cadastro de outra organização responde NOT_FOUND.
select is(public.create_trip('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000800a2', '20000000-0000-0000-0000-00000000000a', gen_random_uuid(), current_date,
  '95000000-0000-0000-0000-00000000000b', '96000000-0000-0000-0000-000000000001', null, jsonb_build_array(pg_temp.stop(1, array[8]))) ->> 'code', 'NOT_FOUND', 'veículo de outra organização');
select is(public.create_trip('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000800a2', '20000000-0000-0000-0000-00000000000a', gen_random_uuid(), current_date,
  '95000000-0000-0000-0000-000000000001', '96000000-0000-0000-0000-00000000000b', null, jsonb_build_array(pg_temp.stop(1, array[8]))) ->> 'code', 'NOT_FOUND', 'motorista de outra organização');
select is(public.create_trip('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000800a2', '20000000-0000-0000-0000-00000000000a', gen_random_uuid(), current_date,
  '95000000-0000-0000-0000-000000000001', '96000000-0000-0000-0000-000000000001', null,
  jsonb_build_array(jsonb_build_object('site_id', '92000000-0000-0000-0000-00000000000b', 'cylinder_ids', jsonb_build_array(pg_temp.cy(8))))) ->> 'code', 'NOT_FOUND', 'unidade de outra organização');
select is(public.create_trip('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000800a2', '20000000-0000-0000-0000-00000000000a', gen_random_uuid(), current_date,
  '95000000-0000-0000-0000-000000000001', '96000000-0000-0000-0000-000000000001', null,
  jsonb_build_array(jsonb_build_object('site_id', '92000000-0000-0000-0000-000000000001', 'cylinder_ids', jsonb_build_array(pg_temp.cy(30))))) ->> 'code', 'NOT_FOUND', 'cilindro de outra organização');

-- 8. Validações de campo.
select is(pg_temp.mk('[]'::jsonb) ->> 'code', 'VALIDATION_FAILED', 'viagem sem parada');
select is(pg_temp.mk(jsonb_build_array(jsonb_build_object('site_id', '92000000-0000-0000-0000-000000000001', 'cylinder_ids', '[]'::jsonb))) ->> 'code', 'VALIDATION_FAILED', 'parada sem cilindro');
select is(pg_temp.mk((select jsonb_agg(pg_temp.stop(1, array[40 + n])) from generate_series(0, 30) n), 3, 3) ->> 'code', 'VALIDATION_FAILED', '31 paradas');
select is(pg_temp.mk(jsonb_build_array(pg_temp.stop(1, (select array_agg(n) from generate_series(40, 240) n))), 3, 3) ->> 'code', 'VALIDATION_FAILED', '201 cilindros numa parada');
select is(pg_temp.mk(jsonb_build_array(pg_temp.stop(1, (select array_agg(n) from generate_series(40, 239) n))), 3, 3) ->> 'code', 'CREATED', '200 cilindros numa parada passam');
select is(pg_temp.mk(jsonb_build_array(pg_temp.stop(1, array[8]), pg_temp.stop(2, array[8])), 3, 3) ->> 'code', 'VALIDATION_FAILED', 'o mesmo cilindro em duas paradas');
select is(pg_temp.mk(jsonb_build_array(pg_temp.stop(1, array[8])), 1, 3, current_date - 1) ->> 'code', 'VALIDATION_FAILED', 'data anterior a hoje na criação');
select is(pg_temp.mk(jsonb_build_array(pg_temp.stop(1, array[8])), 1, 3, current_date, repeat('n', 501)) ->> 'code', 'VALIDATION_FAILED', 'observações com 501 caracteres');
select is(pg_temp.mk((select jsonb_agg(pg_temp.stop(1, array[250 + n])) from generate_series(0, 29) n), 3, 3) ->> 'code', 'CREATED', '30 paradas passam');

-- 9. Permissão: motorista (sem trip.write) é negado e nada é criado.
select is(public.create_trip('10000000-0000-0000-0000-0000000008c1', '60000000-0000-0000-0000-0000000800c1', '20000000-0000-0000-0000-00000000000a', gen_random_uuid(), current_date,
  '95000000-0000-0000-0000-000000000001', '96000000-0000-0000-0000-000000000001', null, jsonb_build_array(pg_temp.stop(1, array[8]))) ->> 'code', 'ACCESS_DENIED', 'sem trip.write: negado');
select is(public.create_trip('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-000000000000', '20000000-0000-0000-0000-00000000000a', gen_random_uuid(), current_date,
  '95000000-0000-0000-0000-000000000001', '96000000-0000-0000-0000-000000000001', null, jsonb_build_array(pg_temp.stop(1, array[8]))) ->> 'code', 'AUTH_REQUIRED', 'sessão inválida: AUTH_REQUIRED');

-- 10. Edição.
-- Viagem 1 tem c1 e c2 na parada 1 e c3 e c4 na parada 2. Troca c2 por c8 e inverte as paradas.
create temp table stops1 as
  select jsonb_agg(jsonb_build_object('id', s.id, 'position', s.position) order by s.position) as v from public.trip_stops s where s.trip_id = (select (r ->> 'trip_id')::uuid from t1);
create temp table u1 as select pg_temp.upd((select (r ->> 'trip_id')::uuid from t1), 1, jsonb_build_array(
  jsonb_build_object('id', (select s.id from public.trip_stops s where s.trip_id = (select (r ->> 'trip_id')::uuid from t1) and s.position = 2), 'site_id', '92000000-0000-0000-0000-000000000002', 'cylinder_ids', jsonb_build_array(pg_temp.cy(3), pg_temp.cy(4))),
  jsonb_build_object('id', (select s.id from public.trip_stops s where s.trip_id = (select (r ->> 'trip_id')::uuid from t1) and s.position = 1), 'site_id', '92000000-0000-0000-0000-000000000001', 'cylinder_ids', jsonb_build_array(pg_temp.cy(1), pg_temp.cy(8)))),
  1, 1, current_date, null) as r;
select is((select r ->> 'code' from u1), 'UPDATED', 'update_trip responde UPDATED');
select is((select (r ->> 'version')::int from u1), 2, 'a versão sobe para 2');
select is((select position from public.trip_stops where trip_id = (select (r ->> 'trip_id')::uuid from t1) and site_id = '92000000-0000-0000-0000-000000000002'), 1::smallint, 'as paradas foram reordenadas');
select is((select item_status from public.trip_items where trip_id = (select (r ->> 'trip_id')::uuid from t1) and cylinder_id = pg_temp.cy(2)), 'released', 'o cilindro que saiu foi liberado');
select is((select item_status from public.trip_items where trip_id = (select (r ->> 'trip_id')::uuid from t1) and cylinder_id = pg_temp.cy(8)), 'planned', 'o cilindro novo foi reservado');
select is((select count(*)::int from public.cylinder_events where cylinder_id = pg_temp.cy(2) and event_type = 'trip_released'), 1, 'evento trip_released no cilindro que saiu');
select is((select count(*)::int from public.cylinder_events where cylinder_id = pg_temp.cy(8) and event_type = 'trip_reserved'), 1, 'evento trip_reserved no cilindro novo');
select is((select data -> 'changes' from public.trip_events where trip_id = (select (r ->> 'trip_id')::uuid from t1) and event_type = 'trip_updated'), '[{"field": "notes_changed", "old": null, "new": true}]'::jsonb, 'só a mudança nas observações é marcada, sem o texto');
select is((select (data ->> 'added')::int || '/' || (data ->> 'released')::int from public.trip_events where trip_id = (select (r ->> 'trip_id')::uuid from t1) and event_type = 'trip_updated'), '1/1', 'o evento conta o que entrou e o que saiu');
select is(pg_temp.upd((select (r ->> 'trip_id')::uuid from t1), 1, (select jsonb_build_array(jsonb_build_object('site_id', '92000000-0000-0000-0000-000000000001', 'cylinder_ids', jsonb_build_array(pg_temp.cy(1))))), 1, 1) ->> 'code',
  'VERSION_CONFLICT', 'versão antiga: VERSION_CONFLICT');
select is(pg_temp.mk(jsonb_build_array(pg_temp.stop(1, array[2])), 3, 3) ->> 'code', 'CREATED', 'o cilindro liberado pode entrar em outra viagem');

-- Edição com data passada é aceita em viagem já planejada; os campos mudados vão ao evento.
create temp table u2 as select pg_temp.upd((select (r ->> 'trip_id')::uuid from t2), 1, jsonb_build_array(jsonb_build_object(
  'id', (select s.id from public.trip_stops s where s.trip_id = (select (r ->> 'trip_id')::uuid from t2) and s.position = 1), 'site_id', '92000000-0000-0000-0000-000000000001', 'cylinder_ids', jsonb_build_array(pg_temp.cy(5), pg_temp.cy(6)))),
  3, 3, current_date - 3, 'novo texto sigiloso') as r;
select is((select r ->> 'code' from u2), 'UPDATED', 'data passada é aceita na edição');
select is((select jsonb_array_length(data -> 'changes') from public.trip_events where trip_id = (select (r ->> 'trip_id')::uuid from t2) and event_type = 'trip_updated'), 2, 'o evento lista data e observações alteradas');
select is((select count(*)::int from public.trip_events where data::text like '%sigiloso%'), 0, 'o texto das observações não vai ao evento');
select is((select count(*)::int from public.audit_logs where metadata::text like '%sigiloso%'), 0, 'nem à auditoria');

-- Edição: estados que não aceitam, item já conferido, retirado e outra organização.
insert into public.trips (id, organization_id, number, planned_date, vehicle_id, driver_id, created_by, status, started_at, started_by, completed_at, completed_by) values
  ('99000000-0000-0000-0000-0000000000c1', '20000000-0000-0000-0000-00000000000a', 91, current_date, '95000000-0000-0000-0000-000000000003', '96000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000002', 'completed', now(), '10000000-0000-0000-0000-000000000002', now(), '10000000-0000-0000-0000-000000000002'),
  ('99000000-0000-0000-0000-0000000000c2', '20000000-0000-0000-0000-00000000000a', 92, current_date, '95000000-0000-0000-0000-000000000003', '96000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000002', 'in_progress', now(), '10000000-0000-0000-0000-000000000002', null, null);
select is(pg_temp.upd('99000000-0000-0000-0000-0000000000c1', 1, jsonb_build_array(pg_temp.stop(1, array[8])), 3, 3) ->> 'code', 'TRIP_CLOSED', 'viagem concluída não aceita edição');
select is(pg_temp.upd('99000000-0000-0000-0000-0000000000c2', 1, jsonb_build_array(pg_temp.stop(1, array[8])), 3, 3) ->> 'code', 'INVALID_TRANSITION', 'viagem em andamento não aceita edição');
select is(pg_temp.upd(gen_random_uuid(), 1, jsonb_build_array(pg_temp.stop(1, array[8]))) ->> 'code', 'NOT_FOUND', 'viagem inexistente');

update public.trip_items set item_status = 'checked', checked_at = now() where trip_id = (select (r ->> 'trip_id')::uuid from t1) and cylinder_id = pg_temp.cy(8);
select is(pg_temp.upd((select (r ->> 'trip_id')::uuid from t1), 2, jsonb_build_array(
  jsonb_build_object('id', (select s.id from public.trip_stops s where s.trip_id = (select (r ->> 'trip_id')::uuid from t1) and s.position = 1), 'site_id', '92000000-0000-0000-0000-000000000002', 'cylinder_ids', jsonb_build_array(pg_temp.cy(3), pg_temp.cy(4))),
  jsonb_build_object('id', (select s.id from public.trip_stops s where s.trip_id = (select (r ->> 'trip_id')::uuid from t1) and s.position = 2), 'site_id', '92000000-0000-0000-0000-000000000001', 'cylinder_ids', jsonb_build_array(pg_temp.cy(1))))) ->> 'code',
  'VALIDATION_FAILED', 'cilindro já conferido não sai por update_trip');

-- Edição que reduz paradas: a parada que sai fica removida, sem perder a linha.
create temp table t3 as select pg_temp.mk(jsonb_build_array(pg_temp.stop(1, array[9]), pg_temp.stop(2, array[10])), 3, 3) as r;
select is((pg_temp.upd((select (r ->> 'trip_id')::uuid from t3), 1, jsonb_build_array(jsonb_build_object(
  'id', (select s.id from public.trip_stops s where s.trip_id = (select (r ->> 'trip_id')::uuid from t3) and s.position = 1), 'site_id', '92000000-0000-0000-0000-000000000001', 'cylinder_ids', jsonb_build_array(pg_temp.cy(9)))), 3, 3)) ->> 'code', 'UPDATED', 'remover uma parada');
select is((select count(*)::int from public.trip_stops where trip_id = (select (r ->> 'trip_id')::uuid from t3) and status = 'removed' and position is null), 1, 'a parada removida continua gravada, sem posição');
select is((select item_status from public.trip_items where trip_id = (select (r ->> 'trip_id')::uuid from t3) and cylinder_id = pg_temp.cy(10)), 'released', 'e o cilindro dela foi liberado');

-- Cilindro retirado (exceção) nunca volta à mesma viagem.
update public.trip_items set item_status = 'removed', divergence_reason = 'Motivo de teste' where trip_id = (select (r ->> 'trip_id')::uuid from t3) and cylinder_id = pg_temp.cy(9);
select is(pg_temp.upd((select (r ->> 'trip_id')::uuid from t3), 2, jsonb_build_array(jsonb_build_object(
  'id', (select s.id from public.trip_stops s where s.trip_id = (select (r ->> 'trip_id')::uuid from t3) and s.status = 'pending'), 'site_id', '92000000-0000-0000-0000-000000000001', 'cylinder_ids', jsonb_build_array(pg_temp.cy(9)))), 3, 3) ->> 'code', 'VALIDATION_FAILED', 'cilindro retirado não volta');

-- Datas coincidentes com outra viagem planejada do mesmo veículo e motorista são aceitas (RF-006a).
select is(pg_temp.mk(jsonb_build_array(pg_temp.stop(1, array[11])), 3, 3) ->> 'code', 'CREATED', 'mesmo veículo e motorista de outra viagem planejada');

-- Idempotência de create_trip: o mesmo request_id devolve a mesma viagem.
create temp table idem as select gen_random_uuid() as req;
create temp table c1 as select pg_temp.mk(jsonb_build_array(pg_temp.stop(1, array[12])), 3, 3, current_date, null, (select req from idem)) as r;
select is((select r ->> 'code' from c1), 'CREATED', 'primeira chamada cria');
select is(pg_temp.mk(jsonb_build_array(pg_temp.stop(1, array[12])), 3, 3, current_date, null, (select req from idem)) ->> 'trip_id', (select r ->> 'trip_id' from c1), 'a repetição devolve a mesma viagem');
select is((pg_temp.mk(jsonb_build_array(pg_temp.stop(1, array[12])), 3, 3, current_date, null, (select req from idem)) ->> 'replayed')::boolean, true, 'marcada como repetida');
select is((select count(*)::int from public.trips where id = (select (r ->> 'trip_id')::uuid from c1)), 1, 'sem viagem duplicada');
select is((select count(*)::int from public.cylinder_events where cylinder_id = pg_temp.cy(12) and event_type = 'trip_reserved'), 1, 'sem evento duplicado');

select * from finish();
rollback;
