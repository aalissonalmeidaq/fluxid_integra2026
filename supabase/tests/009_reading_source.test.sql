begin;
select plan(34);

-- Spec 009, US1: o método de leitura na conferência e na entrega (RF-001, RF-001a, RF-005, RN-001, RN-002, CA-002).
-- Hermético: desfeito pelo rollback. O Tenant B e o auditor provam o isolamento e as permissões.

delete from public.user_sessions where user_id in (
  '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000003');
insert into public.membership_roles (membership_id, role_id, assigned_by)
  select '30000000-0000-0000-0000-00000000000b', r.id, '10000000-0000-0000-0000-000000000001' from public.roles r where r.organization_id = '20000000-0000-0000-0000-00000000000b' and r.code = 'tenant_admin'
  on conflict do nothing;
select public.start_user_session('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000900a2', 'aal1');
select public.start_user_session('10000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-0000000900b3', 'aal1');

insert into auth.users (id, aud, role, email) values ('10000000-0000-0000-0000-0000000009d1', 'authenticated', 'authenticated', 'field-auditor@example.invalid');
insert into public.profiles (user_id, display_name) values ('10000000-0000-0000-0000-0000000009d1', 'Auditor Campo');
insert into public.memberships (id, organization_id, user_id, status, activated_at) values
  ('30000000-0000-0000-0000-0000000009d1', '20000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-0000000009d1', 'active', now());
insert into public.membership_roles (membership_id, role_id, assigned_by)
  select '30000000-0000-0000-0000-0000000009d1', r.id, '10000000-0000-0000-0000-000000000001' from public.roles r where r.organization_id = '20000000-0000-0000-0000-00000000000a' and r.code = 'tenant_auditor';
select public.start_user_session('10000000-0000-0000-0000-0000000009d1', '60000000-0000-0000-0000-0000000900d1', 'aal1');

insert into public.customers (id, organization_id, person_type, document_display, legal_name, segment) values
  ('91000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', 'legal', '11222333000181', 'Hospital Alfa Ltda', 'hospital');
insert into public.customer_sites (id, organization_id, customer_id, name, postal_code, street, number, city, state) values
  ('92000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-00000000000a', '91000000-0000-0000-0000-00000000000a', 'Unidade 1', '01001000', 'Praça da Sé', '1', 'São Paulo', 'SP');
insert into public.vehicles (id, organization_id, plate, vehicle_type, capacity_cylinders)
  select ('95000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid, '20000000-0000-0000-0000-00000000000a', 'FLD' || (2000 + n), 'truck', 20 from generate_series(1, 3) n;
insert into public.drivers (id, organization_id, full_name, cpf_display, cnh_display, cnh_category, cnh_valid_until)
  select ('96000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid, '20000000-0000-0000-0000-00000000000a', 'Motorista ' || n, 'x' || n, 'y' || n, 'D', (now() at time zone 'America/Sao_Paulo')::date + 365 from generate_series(1, 3) n;
insert into public.cylinder_types (id, organization_id, gas, capacity_value, capacity_unit, classification) values
  ('97000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', 'Oxigênio', 10, 'l', 'medicinal');
insert into public.cylinders (id, organization_id, cylinder_type_id, serial_number, stock_status, hydro_last_result, hydro_next_due_on)
  select ('98000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid, '20000000-0000-0000-0000-00000000000a', '97000000-0000-0000-0000-00000000000a', 'RDS-' || lpad(n::text, 3, '0'), 'in_stock', 'approved', (now() at time zone 'America/Sao_Paulo')::date + 200
    from generate_series(1, 12) n;

create function pg_temp.cy(n integer) returns uuid language sql as $$ select ('98000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid $$;
create function pg_temp.ver(p_trip uuid) returns bigint language sql as $$ select version from public.trips where id = p_trip $$;
create function pg_temp.item(p_trip uuid, p_cyl integer) returns uuid language sql as $$ select id from public.trip_items where trip_id = p_trip and cylinder_id = pg_temp.cy(p_cyl) $$;
-- Viagem em carregamento com os cilindros dados, como administrador do A.
create function pg_temp.loading(p_cyls integer[], p_unit integer default 1) returns uuid language plpgsql as $$
declare
  u constant uuid := '10000000-0000-0000-0000-000000000002'; s constant uuid := '60000000-0000-0000-0000-0000000900a2'; o constant uuid := '20000000-0000-0000-0000-00000000000a';
  t uuid;
begin
  t := (public.create_trip(u, s, o, gen_random_uuid(), (now() at time zone 'America/Sao_Paulo')::date, ('95000000-0000-0000-0000-' || lpad(p_unit::text, 12, '0'))::uuid, ('96000000-0000-0000-0000-' || lpad(p_unit::text, 12, '0'))::uuid, null,
    jsonb_build_array(jsonb_build_object('site_id', '92000000-0000-0000-0000-000000000001', 'cylinder_ids', (select jsonb_agg(pg_temp.cy(c)) from unnest(p_cyls) c)))) ->> 'trip_id')::uuid;
  perform public.start_loading(u, s, o, gen_random_uuid(), t, pg_temp.ver(t));
  return t;
end $$;
create function pg_temp.check_as(p_trip uuid, p_cyl integer, p_source text, p_user uuid default '10000000-0000-0000-0000-000000000002',
  p_session uuid default '60000000-0000-0000-0000-0000000900a2', p_org uuid default '20000000-0000-0000-0000-00000000000a') returns jsonb language sql as $$
  select public.check_item(p_user, p_session, p_org, gen_random_uuid(), p_trip, pg_temp.item(p_trip, p_cyl), p_source)
$$;
create function pg_temp.source_of(p_trip uuid, p_cyl integer) returns text language sql as $$ select check_source from public.trip_items where id = pg_temp.item(p_trip, p_cyl) $$;

-- Conferência: os quatro métodos.
create temp table t_loading as select pg_temp.loading(array[1, 2, 3, 4, 5]) as trip;
select is(pg_temp.check_as((select trip from t_loading), 1, 'manual') ->> 'code', 'CHECKED', 'conferir por toque funciona');
select is(pg_temp.source_of((select trip from t_loading), 1), 'manual', 'e grava o método "manual"');
select is(pg_temp.check_as((select trip from t_loading), 2, 'camera') ->> 'code', 'CHECKED', 'conferir pela câmera funciona');
select is(pg_temp.source_of((select trip from t_loading), 2), 'camera', 'e grava o método "camera"');
select is(pg_temp.check_as((select trip from t_loading), 3, 'nfc') ->> 'code', 'CHECKED', 'conferir por NFC funciona');
select is(pg_temp.source_of((select trip from t_loading), 3), 'nfc', 'e grava o método "nfc"');
select is(pg_temp.check_as((select trip from t_loading), 4, 'typed') ->> 'code', 'CHECKED', 'conferir por código digitado ou leitor funciona');
select is(pg_temp.source_of((select trip from t_loading), 4), 'typed', 'e grava o método "typed"');
select is(public.check_item('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000900a2', '20000000-0000-0000-0000-00000000000a', gen_random_uuid(),
  (select trip from t_loading), pg_temp.item((select trip from t_loading), 5)) ->> 'code', 'CHECKED', 'sem informar o método, a chamada antiga da Spec 008 continua valendo');
select is(pg_temp.source_of((select trip from t_loading), 5), 'manual', 'e o método padrão é "manual"');

-- Método inválido: recusado, nada muda.
create temp table t_invalid as select pg_temp.loading(array[6, 7], 2) as trip;
select is(pg_temp.check_as((select trip from t_invalid), 6, 'scan') ->> 'code', 'VALIDATION_FAILED', 'método fora da lista é recusado');
select is(pg_temp.check_as((select trip from t_invalid), 6, 'scan') -> 'fields' -> 0 ->> 'field', 'source', 'e o erro aponta o campo "source"');
select is((select item_status from public.trip_items where id = pg_temp.item((select trip from t_invalid), 6)), 'planned', 'o item continua previsto');
select is(pg_temp.check_as((select trip from t_invalid), 6, null) ->> 'code', 'CHECKED', 'método nulo (campo ausente na borda) vale como não informado');
select is(pg_temp.source_of((select trip from t_invalid), 6), 'manual', 'e fica "manual"');

-- Desfazer limpa o método, e o histórico e a auditoria guardam só o método.
select is(public.uncheck_item('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000900a2', '20000000-0000-0000-0000-00000000000a', gen_random_uuid(),
  (select trip from t_loading), pg_temp.item((select trip from t_loading), 2)) ->> 'code', 'UNCHECKED', 'desfazer a conferência funciona');
select is(pg_temp.source_of((select trip from t_loading), 2), null, 'e limpa o método');
select is((select data ->> 'source' from public.trip_events where trip_id = (select trip from t_loading) and event_type = 'item_checked' and data ->> 'item_id' = pg_temp.item((select trip from t_loading), 3)::text), 'nfc',
  'o evento item_checked guarda o método');
select is((select count(*)::int from public.audit_logs where action = 'trip.check_item' and metadata ->> 'source' = 'camera'), 1, 'a auditoria guarda o método da conferência');
select is((select count(*)::int from public.audit_logs where metadata::text ~* 'RDS-00|04A23B|QR-009'), 0, 'e nenhum valor lido');

-- Isolamento e permissão.
select is(pg_temp.check_as((select trip from t_invalid), 7, 'camera', '10000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-0000000900b3', '20000000-0000-0000-0000-00000000000b') ->> 'code', 'NOT_FOUND', 'o Tenant B não confere item do Tenant A');
select is(pg_temp.check_as((select trip from t_invalid), 7, 'camera', '10000000-0000-0000-0000-0000000009d1', '60000000-0000-0000-0000-0000000900d1') ->> 'code', 'ACCESS_DENIED', 'o auditor não confere');
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'check_item'), 1, 'existe uma só assinatura de check_item');
select is(has_function_privilege('authenticated', 'public.check_item(uuid, uuid, uuid, uuid, uuid, uuid, text)', 'execute') or has_function_privilege('anon', 'public.check_item(uuid, uuid, uuid, uuid, uuid, uuid, text)', 'execute'), false, 'só o servidor executa check_item');

-- Entrega: o método por cilindro.
create temp table t_delivery as select pg_temp.loading(array[9, 10, 11, 12], 3) as trip;
select pg_temp.check_as((select trip from t_delivery), c, 'manual') from generate_series(9, 12) c;
select public.start_trip('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000900a2', '20000000-0000-0000-0000-00000000000a', gen_random_uuid(), (select trip from t_delivery), pg_temp.ver((select trip from t_delivery)));
select public.arrive_stop('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000900a2', '20000000-0000-0000-0000-00000000000a', gen_random_uuid(), (select trip from t_delivery),
  (select id from public.trip_stops where trip_id = (select trip from t_delivery) and position = 1), null);
create function pg_temp.deliver(p_results jsonb, p_org uuid default '20000000-0000-0000-0000-00000000000a', p_user uuid default '10000000-0000-0000-0000-000000000002',
  p_session uuid default '60000000-0000-0000-0000-0000000900a2') returns jsonb language sql as $$
  select public.register_delivery(p_user, p_session, p_org, gen_random_uuid(), (select trip from t_delivery), (select id from public.trip_stops where trip_id = (select trip from t_delivery) and position = 1),
    now() - interval '1 minute', 'Recebedor Fictício', null, null, null, false, p_results, null, null)
$$;
create function pg_temp.entry(p_cyl integer, p_delivered boolean, p_source text default null, p_reason text default null) returns jsonb language sql as $$
  select jsonb_strip_nulls(jsonb_build_object('item_id', pg_temp.item((select trip from t_delivery), p_cyl), 'delivered', p_delivered, 'source', p_source, 'reason', p_reason))
$$;

select is(pg_temp.deliver(jsonb_build_array(pg_temp.entry(9, true, 'camera'), pg_temp.entry(10, true, 'bogus'), pg_temp.entry(11, true), pg_temp.entry(12, true))) -> 'fields' -> 0 ->> 'field', 'results.' || pg_temp.item((select trip from t_delivery), 10)::text || '.source',
  'método inválido num cilindro entregue é recusado e aponta o cilindro');
select is((select status from public.trip_stops where trip_id = (select trip from t_delivery) and position = 1), 'on_site', 'e a parada continua no local');
select is(pg_temp.deliver(jsonb_build_array(pg_temp.entry(9, true, 'camera'), pg_temp.entry(10, true, 'nfc'), pg_temp.entry(11, true), pg_temp.entry(12, false, 'camera', 'Cilindro não estava no endereço'))) ->> 'code', 'DELIVERED', 'a entrega com o método por cilindro é aceita');
select is((select r ->> 'source' from public.trip_deliveries d, jsonb_array_elements(d.results) r where r ->> 'item_id' = pg_temp.item((select trip from t_delivery), 9)::text), 'camera', 'o método da câmera fica no resultado do cilindro');
select is((select r ->> 'source' from public.trip_deliveries d, jsonb_array_elements(d.results) r where r ->> 'item_id' = pg_temp.item((select trip from t_delivery), 10)::text), 'nfc', 'o do NFC também');
select is((select r ->> 'source' from public.trip_deliveries d, jsonb_array_elements(d.results) r where r ->> 'item_id' = pg_temp.item((select trip from t_delivery), 11)::text), 'manual', 'sem informar, o cilindro entregue é "manual"');
select is((select r ? 'source' from public.trip_deliveries d, jsonb_array_elements(d.results) r where r ->> 'item_id' = pg_temp.item((select trip from t_delivery), 12)::text), false, 'cilindro não entregue não guarda método');
select is((select data -> 'sources' from public.trip_events where trip_id = (select trip from t_delivery) and event_type = 'delivery_registered'), '{"camera": 1, "nfc": 1, "manual": 1}'::jsonb, 'o evento da entrega conta os métodos, sem valores lidos');
select is((select metadata -> 'sources' from public.audit_logs where action = 'trip.deliver' order by occurred_at desc limit 1), '{"camera": 1, "nfc": 1, "manual": 1}'::jsonb, 'a auditoria também');
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'register_delivery'), 1, 'continua uma só assinatura de register_delivery');

select * from finish();
rollback;
