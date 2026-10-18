begin;
select plan(14);

-- Spec 012: geocercas sobre o mapa do lacre, para conferir de olho se ele está onde deveria. Volta a geocerca esperada (unidade em
-- vigilância ou destino da viagem em andamento) e as da organização a até 2 km da última posição, com "dentro" e a distância
-- calculados no banco. Outro tenant nunca aparece; sem geofence.read, nenhuma geometria sai. Hermético: rollback.

delete from public.user_sessions where user_id in ('10000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000003');
select public.start_user_session('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000001213a2', 'aal1');
select public.start_user_session('10000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-0000001213b3', 'aal1');

insert into public.customers (id, organization_id, person_type, document_display, legal_name, segment) values
  ('a3510000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', 'legal', '11222333000181', 'Hospital Alfa Ltda', 'hospital'),
  ('a3510000-0000-0000-0000-00000000000b', '20000000-0000-0000-0000-00000000000b', 'legal', '11222333000181', 'Hospital Beta Ltda', 'hospital');
insert into public.customer_sites (id, organization_id, customer_id, name, postal_code, street, number, city, state) values
  ('a3520000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-00000000000a', 'a3510000-0000-0000-0000-00000000000a', 'Laboratório', '63000000', 'Rua A', '1', 'Juazeiro do Norte', 'CE'),
  ('a3520000-0000-0000-0000-0000000000a2', '20000000-0000-0000-0000-00000000000a', 'a3510000-0000-0000-0000-00000000000a', 'Depósito longe', '63000000', 'Rua B', '2', 'Juazeiro do Norte', 'CE'),
  ('a3520000-0000-0000-0000-0000000000a3', '20000000-0000-0000-0000-00000000000a', 'a3510000-0000-0000-0000-00000000000a', 'Unidade de São Paulo', '01001000', 'Praça da Sé', '1', 'São Paulo', 'SP'),
  ('a3520000-0000-0000-0000-0000000000b1', '20000000-0000-0000-0000-00000000000b', 'a3510000-0000-0000-0000-00000000000b', 'Unidade do B', '63000000', 'Rua C', '3', 'Juazeiro do Norte', 'CE');

-- Laboratório: círculo de 150 m no ponto do lacre. Depósito: quadrado a ~1 km. São Paulo: fora dos 2 km (só aparece como esperada).
-- Unidade do B: mesmo ponto, mas de outro tenant.
create function pg_temp.circulo(p_lng double precision, p_lat double precision, p_raio int) returns extensions.geography language sql as $$
  select extensions.st_buffer(extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography, p_raio)
$$;
insert into public.geofences (id, organization_id, site_id, name, shape, center, radius_m, area) values
  ('a3530000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-00000000000a', 'a3520000-0000-0000-0000-0000000000a1', 'Bancada', 'circle',
   extensions.st_setsrid(extensions.st_makepoint(-39.309741, -7.258314), 4326)::extensions.geography, 150, pg_temp.circulo(-39.309741, -7.258314, 150)),
  ('a3530000-0000-0000-0000-0000000000a3', '20000000-0000-0000-0000-00000000000a', 'a3520000-0000-0000-0000-0000000000a3', 'Pátio SP', 'circle',
   extensions.st_setsrid(extensions.st_makepoint(-46.6339, -23.5505), 4326)::extensions.geography, 100, pg_temp.circulo(-46.6339, -23.5505, 100)),
  ('a3530000-0000-0000-0000-0000000000b1', '20000000-0000-0000-0000-00000000000b', 'a3520000-0000-0000-0000-0000000000b1', 'Do B', 'circle',
   extensions.st_setsrid(extensions.st_makepoint(-39.309741, -7.258314), 4326)::extensions.geography, 150, pg_temp.circulo(-39.309741, -7.258314, 150));
insert into public.geofences (id, organization_id, site_id, name, shape, vertices, area) values
  ('a3530000-0000-0000-0000-0000000000a2', '20000000-0000-0000-0000-00000000000a', 'a3520000-0000-0000-0000-0000000000a2', 'Depósito', 'polygon',
   '[{"lat":-7.258,"lng":-39.300},{"lat":-7.258,"lng":-39.299},{"lat":-7.257,"lng":-39.299},{"lat":-7.257,"lng":-39.300}]',
   extensions.st_geogfromtext('POLYGON((-39.300 -7.258, -39.299 -7.258, -39.299 -7.257, -39.300 -7.257, -39.300 -7.258))'));

insert into public.cylinder_types (id, organization_id, gas, capacity_value, capacity_unit, classification) values
  ('a3570000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', 'Oxigênio', 10, 'l', 'medicinal');
insert into public.cylinders (id, organization_id, cylinder_type_id, serial_number) values
  ('a3580000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-00000000000a', 'a3570000-0000-0000-0000-00000000000a', 'GEO-A-1');
insert into public.seal_devices (id, organization_id, device_code, label, key_hash, created_by) values
  ('a3500000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-00000000000a', 'DSP-GEOVIEW1', 'Lacre A', extensions.digest('k', 'sha256'), '10000000-0000-0000-0000-000000000002');

create function pg_temp.view(p_actor text, p_session text, p_org text) returns jsonb language sql as $$
  select public.seal_geofence_view(p_actor::uuid, p_session::uuid, p_org::uuid, 'a3500000-0000-0000-0000-0000000000a1')
$$;
create function pg_temp.a() returns jsonb language sql as $$
  select pg_temp.view('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000001213a2', '20000000-0000-0000-0000-00000000000a')
$$;
create function pg_temp.cerca(p_nome text) returns jsonb language sql as $$
  select g from jsonb_array_elements(pg_temp.a()->'geofences') g where g->>'name' = p_nome
$$;

-- Sem posição ainda: responde, sem geocercas próximas.
select is(pg_temp.a()->>'has_position', 'false', 'sem posição, a tela sabe que não há ponto');

-- O lacre manda a posição dentro da cerca da bancada.
update private.seal_rate_windows set count = 0;
select public.seal_ingest('DSP-GEOVIEW1', extensions.digest('k', 'sha256'), extensions.digest('ip', 'sha256'), jsonb_build_object('protocol', 1, 'messages', jsonb_build_array(
  jsonb_build_object('message_id', 'GEO-1', 'type', 'position', 'read_at', clock_timestamp(), 'problem', null, 'data', jsonb_build_object(
    'latitude', -7.258400, 'longitude', -39.309741, 'quality', 'gps', 'accuracy_m', 6, 'battery_pct', null, 'signal_dbm', -60, 'seal_state', 'unknown')))));

select is(pg_temp.a()->>'code', 'FOUND', 'consulta com seal.read na organização');
select is((select string_agg(g->>'name', ',' order by g->>'name') from jsonb_array_elements(pg_temp.a()->'geofences') g), 'Bancada,Depósito',
  'só as geocercas da organização a até 2 km (a de São Paulo e a do outro tenant ficam de fora)');
select ok((pg_temp.cerca('Bancada')->>'inside')::boolean and (pg_temp.cerca('Bancada')->>'distance_m')::numeric = 0, 'dentro da cerca da bancada, distância 0');
select ok(not (pg_temp.cerca('Depósito')->>'inside')::boolean and (pg_temp.cerca('Depósito')->>'distance_m')::numeric between 900 and 1100, 'fora do depósito, a ~1 km');
select is((pg_temp.cerca('Bancada')->>'radius_m')::int, 150, 'círculo com centro e raio');
select is(jsonb_array_length(pg_temp.cerca('Depósito')->'vertices'), 4, 'polígono com os vértices do cadastro');
select is(pg_temp.cerca('Bancada')->>'expected', 'false', 'sem vigilância nem viagem, nenhuma é a esperada');

-- Em vigilância de uma unidade longe: ela vem como esperada mesmo fora dos 2 km.
insert into public.seal_bindings (organization_id, device_id, cylinder_id, bound_by) values
  ('20000000-0000-0000-0000-00000000000a', 'a3500000-0000-0000-0000-0000000000a1', 'a3580000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-000000000002');
insert into public.seal_watches (organization_id, cylinder_id, device_id, site_id) values
  ('20000000-0000-0000-0000-00000000000a', 'a3580000-0000-0000-0000-0000000000a1', 'a3500000-0000-0000-0000-0000000000a1', 'a3520000-0000-0000-0000-0000000000a3');
select is(pg_temp.cerca('Pátio SP')->>'expected', 'true', 'a unidade em vigilância vem como esperada, mesmo longe');
select is(pg_temp.a()->>'expected_reason', 'watch', 'motivo da esperada: vigilância');
select is((pg_temp.a()->'geofences'->0->>'name'), 'Pátio SP', 'a esperada vem primeiro');

-- Outro tenant: não encontrado.
select ok(pg_temp.view('10000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-0000001213b3', '20000000-0000-0000-0000-00000000000b')->>'code'
  in ('NOT_FOUND', 'ACCESS_DENIED') and pg_temp.view('10000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-0000001213b3', '20000000-0000-0000-0000-00000000000b') ? 'geofences' = false,
  'o Tenant B não recebe o lacre nem as geocercas do A');

-- Sem geofence.read: nenhuma geometria, e a tela sabe por quê.
select set_config('app.system_bootstrap', 'on', true);
delete from public.role_permissions rp using public.roles r, public.permissions p
 where rp.role_id = r.id and rp.permission_id = p.id and r.organization_id = '20000000-0000-0000-0000-00000000000a' and p.code = 'geofence.read';
select set_config('app.system_bootstrap', 'off', true);
select is(pg_temp.a()->>'geofence_access', 'false', 'sem geofence.read, a resposta avisa');
select is(jsonb_array_length(pg_temp.a()->'geofences'), 0, 'e nenhuma geometria sai');

select * from finish();
rollback;
