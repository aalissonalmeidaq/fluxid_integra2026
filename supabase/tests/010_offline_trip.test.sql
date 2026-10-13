begin;
select plan(27);

-- Spec 010, T020 (RED): `query_trip_offline` devolve ao aparelho a viagem aberta e, por cilindro previsto, os identificadores ATIVOS e normalizados, para
-- conferir por leitura sem servidor (RF-006, RF-007, contracts/operacoes-servidor.md §3). Só viagem em `loading` ou `in_progress`, só com `trip.operate`,
-- sem nome do recebedor, coordenadas registradas, anexos nem motorista. Dois tenants: o Tenant B recebe "não encontrado". Hermético: desfeito pelo rollback.

delete from public.user_sessions where user_id in (
  '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000003');
insert into public.membership_roles (membership_id, role_id, assigned_by)
  select '30000000-0000-0000-0000-00000000000b', r.id, '10000000-0000-0000-0000-000000000001' from public.roles r where r.organization_id = '20000000-0000-0000-0000-00000000000b' and r.code = 'tenant_admin'
  on conflict do nothing;
select public.start_user_session('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000001002a2', 'aal1');
select public.start_user_session('10000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-0000001002b3', 'aal1');

-- Um auditor (só vê) e um operador de estoque (opera) no Tenant A.
insert into auth.users (id, aud, role, email) values
  ('10000000-0000-0000-0000-0000001002d1', 'authenticated', 'authenticated', 'off-auditor@example.invalid'),
  ('10000000-0000-0000-0000-0000001002c1', 'authenticated', 'authenticated', 'off-operador@example.invalid');
insert into public.profiles (user_id, display_name) values ('10000000-0000-0000-0000-0000001002d1', 'Auditor Offline'), ('10000000-0000-0000-0000-0000001002c1', 'Operador Offline');
insert into public.memberships (id, organization_id, user_id, status, activated_at) values
  ('30000000-0000-0000-0000-0000001002d1', '20000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-0000001002d1', 'active', now()),
  ('30000000-0000-0000-0000-0000001002c1', '20000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-0000001002c1', 'active', now());
insert into public.membership_roles (membership_id, role_id, assigned_by)
  select '30000000-0000-0000-0000-0000001002d1', r.id, '10000000-0000-0000-0000-000000000001' from public.roles r where r.organization_id = '20000000-0000-0000-0000-00000000000a' and r.code = 'tenant_auditor';
insert into public.membership_roles (membership_id, role_id, assigned_by)
  select '30000000-0000-0000-0000-0000001002c1', r.id, '10000000-0000-0000-0000-000000000001' from public.roles r where r.organization_id = '20000000-0000-0000-0000-00000000000a' and r.code = 'stock_operator';
select public.start_user_session('10000000-0000-0000-0000-0000001002d1', '60000000-0000-0000-0000-0000001002d1', 'aal1');
select public.start_user_session('10000000-0000-0000-0000-0000001002c1', '60000000-0000-0000-0000-0000001002c1', 'aal1');

insert into public.customers (id, organization_id, person_type, document_display, legal_name, segment) values
  ('91000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', 'legal', '11222333000181', 'Hospital Alfa Ltda', 'hospital');
insert into public.customer_sites (id, organization_id, customer_id, name, postal_code, street, number, city, state)
  select ('92000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid, '20000000-0000-0000-0000-00000000000a', '91000000-0000-0000-0000-00000000000a', 'Unidade ' || n, '01001000', 'Praça da Sé', n::text, 'São Paulo', 'SP' from generate_series(1, 4) n;
insert into public.vehicles (id, organization_id, plate, vehicle_type, capacity_cylinders) values
  ('95000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-00000000000a', 'OFT1001', 'truck', 20),
  ('95000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-00000000000a', 'OFT1002', 'truck', 20);
insert into public.drivers (id, organization_id, full_name, cpf_display, cnh_display, cnh_category, cnh_valid_until)
  select ('96000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid, '20000000-0000-0000-0000-00000000000a', 'Motorista Sigiloso ' || n, 'x' || n, 'y' || n, 'D', (now() at time zone 'America/Sao_Paulo')::date + 365 from generate_series(1, 2) n;
insert into public.cylinder_types (id, organization_id, gas, capacity_value, capacity_unit, classification) values
  ('97000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', 'Oxigênio', 10, 'l', 'medicinal');
insert into public.cylinders (id, organization_id, cylinder_type_id, serial_number, stock_status, hydro_last_result, hydro_next_due_on)
  select ('98000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid, '20000000-0000-0000-0000-00000000000a', '97000000-0000-0000-0000-00000000000a', 'OFT-' || lpad(n::text, 3, '0'), 'in_stock', 'approved', (now() at time zone 'America/Sao_Paulo')::date + 200
    from generate_series(1, 4) n;
-- Identificadores: o cilindro 1 tem um QR e uma etiqueta NFC ativos e um QR antigo desativado; o 2 tem um QR; o 3 e o 4 não têm nenhum.
insert into public.cylinder_identifiers (id, organization_id, cylinder_id, kind, value) values
  ('99000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-00000000000a', '98000000-0000-0000-0000-000000000001', 'qr_code', 'qr-oft-001'),
  ('99000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-00000000000a', '98000000-0000-0000-0000-000000000001', 'nfc_tag', '04a23b1c'),
  ('99000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-00000000000a', '98000000-0000-0000-0000-000000000002', 'qr_code', 'QR-OFT-002');
insert into public.cylinder_identifiers (id, organization_id, cylinder_id, kind, value, status, deactivated_at, deactivated_by, deactivation_justification) values
  ('99000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-00000000000a', '98000000-0000-0000-0000-000000000001', 'qr_code', 'QR-OFT-VELHO', 'deactivated', now(), '10000000-0000-0000-0000-000000000002', 'etiqueta trocada');

create function pg_temp.cy(n integer) returns uuid language sql as $$ select ('98000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid $$;
create function pg_temp.ver(p_trip uuid) returns bigint language sql as $$ select version from public.trips where id = p_trip $$;
create function pg_temp.plan(p_unit integer, p_cyls integer[]) returns uuid language plpgsql as $$
declare
  u constant uuid := '10000000-0000-0000-0000-000000000002'; s constant uuid := '60000000-0000-0000-0000-0000001002a2'; o constant uuid := '20000000-0000-0000-0000-00000000000a';
begin
  return (public.create_trip(u, s, o, gen_random_uuid(), (now() at time zone 'America/Sao_Paulo')::date, ('95000000-0000-0000-0000-' || lpad(p_unit::text, 12, '0'))::uuid,
    ('96000000-0000-0000-0000-' || lpad(p_unit::text, 12, '0'))::uuid, null,
    (select jsonb_agg(jsonb_build_object('site_id', ('92000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid, 'cylinder_ids', jsonb_build_array(pg_temp.cy(x.cyl)))) from unnest(p_cyls) with ordinality as x(cyl, n))) ->> 'trip_id')::uuid;
end $$;
create function pg_temp.off(p_trip uuid, p_user uuid default '10000000-0000-0000-0000-000000000002', p_session uuid default '60000000-0000-0000-0000-0000001002a2',
  p_org uuid default '20000000-0000-0000-0000-00000000000a') returns jsonb language sql as $$ select public.query_trip_offline(p_user, p_session, p_org, p_trip) $$;

-- Viagem 1: em carregamento (cilindros 1 e 2). Viagem 2: planejada. Viagem 3: em andamento (cilindros 3 e 4), com uma entrega registrada.
create temp table t as select pg_temp.plan(1, array[1, 2]) as loading, pg_temp.plan(2, array[3, 4]) as running;
select public.start_loading('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000001002a2', '20000000-0000-0000-0000-00000000000a', gen_random_uuid(), (select loading from t), pg_temp.ver((select loading from t)));

-- Estados aceitos e recusados.
select is(pg_temp.off((select loading from t)) ->> 'code', 'OK', 'viagem em carregamento: devolve a viagem');
select is(pg_temp.off((select running from t)) ->> 'code', 'TRIP_STATE_INVALID', 'viagem planejada: não serve para operar offline');
select is(pg_temp.off((select loading from t)) -> 'trip' ->> 'status', 'loading', 'traz a situação da viagem');
select is((pg_temp.off((select loading from t)) -> 'trip' ->> 'version')::bigint, pg_temp.ver((select loading from t)), 'traz a versão da viagem');
select is(pg_temp.off((select loading from t)) ? 'fetched_at', true, 'traz a hora da busca');

-- Itens e identificadores.
select is(jsonb_array_length(pg_temp.off((select loading from t)) -> 'items'), 2, 'dois itens previstos');
select is((select jsonb_agg(v order by v) from jsonb_array_elements_text((select i -> 'identifiers' from jsonb_array_elements(pg_temp.off((select loading from t)) -> 'items') i
   where i -> 'cylinder' ->> 'serial_number' = 'OFT-001')) v), '["04A23B1C", "QR-OFT-001"]'::jsonb, 'os identificadores ativos do cilindro 1, já normalizados (maiúsculas)');
select is((select i -> 'identifiers' from jsonb_array_elements(pg_temp.off((select loading from t)) -> 'items') i where i -> 'cylinder' ->> 'serial_number' = 'OFT-002'), '["QR-OFT-002"]'::jsonb, 'o cilindro 2 tem um identificador');
select is((select position('QR-OFT-VELHO' in pg_temp.off((select loading from t))::text)), 0, 'identificador desativado não vai ao aparelho');
select is((select bool_and(i ? 'stop_id' and i ? 'item_status' and i -> 'cylinder' ? 'serial_number' and i -> 'cylinder' ? 'gas') from jsonb_array_elements(pg_temp.off((select loading from t)) -> 'items') i), true, 'cada item traz a parada, a situação e o cilindro');
select is(jsonb_array_length(pg_temp.off((select loading from t)) -> 'stops'), 2, 'duas paradas');
select is((pg_temp.off((select loading from t)) -> 'stops' -> 0 -> 'site' ->> 'name'), 'Unidade 1', 'a parada traz o nome da unidade');

-- Viagem em andamento: inicia, entrega e confere a cópia (entregas sem recebedor, sem coordenadas e sem anexos).
select public.check_item('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000001002a2', '20000000-0000-0000-0000-00000000000a', gen_random_uuid(), (select loading from t),
  (select id from public.trip_items where trip_id = (select loading from t) and cylinder_id = pg_temp.cy(1)));
select public.check_item('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000001002a2', '20000000-0000-0000-0000-00000000000a', gen_random_uuid(), (select loading from t),
  (select id from public.trip_items where trip_id = (select loading from t) and cylinder_id = pg_temp.cy(2)));
select public.start_trip('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000001002a2', '20000000-0000-0000-0000-00000000000a', gen_random_uuid(), (select loading from t), pg_temp.ver((select loading from t)));
select public.arrive_stop('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000001002a2', '20000000-0000-0000-0000-00000000000a', gen_random_uuid(), (select loading from t),
  (select id from public.trip_stops where trip_id = (select loading from t) and position = 1), null);
select public.register_delivery('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000001002a2', '20000000-0000-0000-0000-00000000000a', gen_random_uuid(), (select loading from t),
  (select id from public.trip_stops where trip_id = (select loading from t) and position = 1), now() - interval '1 minute', 'Recebedor Sigiloso', 'Enfermeiro', -23.55, -46.633, false,
  jsonb_build_array(jsonb_build_object('item_id', (select id from public.trip_items where trip_id = (select loading from t) and cylinder_id = pg_temp.cy(1)), 'delivered', true)), null, null);
select is(pg_temp.off((select loading from t)) -> 'trip' ->> 'status', 'in_progress', 'viagem em andamento também serve');
select is(jsonb_array_length(pg_temp.off((select loading from t)) -> 'deliveries'), 1, 'traz a entrega já registrada');
select is((pg_temp.off((select loading from t)) -> 'deliveries' -> 0 ? 'id') and (pg_temp.off((select loading from t)) -> 'deliveries' -> 0 ? 'stop_id'), true, 'a entrega traz só o identificador e a parada');
select is(position('Recebedor Sigiloso' in pg_temp.off((select loading from t))::text), 0, 'o nome do recebedor nunca vai ao aparelho');
select is(position('Enfermeiro' in pg_temp.off((select loading from t))::text), 0, 'a função do recebedor também não');
select is(position('-23.55' in pg_temp.off((select loading from t))::text), 0, 'as coordenadas registradas não vão ao aparelho');
select is(position('Motorista Sigiloso' in pg_temp.off((select loading from t))::text), 0, 'o nome do motorista não vai ao aparelho');
select is(pg_temp.off((select loading from t)) ? 'driver', false, 'não há bloco de motorista');

-- Permissões e tenants.
select is(pg_temp.off((select loading from t), '10000000-0000-0000-0000-0000001002d1', '60000000-0000-0000-0000-0000001002d1') ->> 'code', 'ACCESS_DENIED', 'o auditor (só vê) não recebe os identificadores');
select is(pg_temp.off((select loading from t), '10000000-0000-0000-0000-0000001002c1', '60000000-0000-0000-0000-0000001002c1') ->> 'code', 'OK', 'quem pode operar (operador de estoque) recebe');
select is(pg_temp.off((select loading from t), '10000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-0000001002b3', '20000000-0000-0000-0000-00000000000b') ->> 'code', 'NOT_FOUND',
  'o Tenant B recebe "não encontrado" para a viagem do Tenant A');
select is(pg_temp.off((select loading from t), '10000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-0000001002b3') ->> 'code', 'ACCESS_DENIED', 'o Tenant B não age na organização A');
select is(pg_temp.off(gen_random_uuid()) ->> 'code', 'NOT_FOUND', 'viagem inexistente');

-- Grants e assinatura única.
select is(has_function_privilege('authenticated', 'public.query_trip_offline(uuid, uuid, uuid, uuid)', 'execute'), false, 'o cliente não executa a função direto');
select is(has_function_privilege('service_role', 'public.query_trip_offline(uuid, uuid, uuid, uuid)', 'execute')
  and (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'query_trip_offline') = 1, true, 'só a service_role executa e há uma só assinatura');

select * from finish();
rollback;
