begin;
select plan(27);

-- Spec 007, US3: geofences_containing_point, point_in_geofence, list_geofences e get_geofence (RF-016, RNF-003). Hermético.

delete from public.user_sessions where user_id in (
  '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000003');
insert into public.membership_roles (membership_id, role_id, assigned_by)
  select '30000000-0000-0000-0000-00000000000b', r.id, '10000000-0000-0000-0000-000000000001'
    from public.roles r where r.organization_id = '20000000-0000-0000-0000-00000000000b' and r.code = 'tenant_admin';
select public.start_user_session('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000700a2', 'aal1');
select public.start_user_session('10000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-0000000700b3', 'aal1');

insert into public.customers (id, organization_id, person_type, document_display, legal_name, segment) values
  ('81000000-0000-0000-0000-0000000007a1', '20000000-0000-0000-0000-00000000000a', 'legal', '11222333000181', 'Hospital Alfa Ltda', 'hospital'),
  ('81000000-0000-0000-0000-0000000007b1', '20000000-0000-0000-0000-00000000000b', 'legal', '11222333000181', 'Hospital Beta Ltda', 'hospital');
insert into public.customer_sites (id, organization_id, customer_id, name, postal_code, street, number, city, state) values
  ('82000000-0000-0000-0000-0000000007a1', '20000000-0000-0000-0000-00000000000a', '81000000-0000-0000-0000-0000000007a1', 'S1', '01001000', 'Praça da Sé', '1', 'São Paulo', 'SP'),
  ('82000000-0000-0000-0000-0000000007b1', '20000000-0000-0000-0000-00000000000b', '81000000-0000-0000-0000-0000000007b1', 'SB', '01001000', 'Praça da Sé', '1', 'São Paulo', 'SP');

create temp table r (k text primary key, v jsonb);
grant all on r to public;
create function pg_temp.create_a(p_name text, p_shape text, p_center jsonb, p_radius integer, p_vertices jsonb) returns jsonb language sql as $$
  select public.create_geofence('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000700a2', '20000000-0000-0000-0000-00000000000a',
    '82000000-0000-0000-0000-0000000007a1', p_name, p_shape, p_center, p_radius, p_vertices)
$$;
create function pg_temp.inside_a(p_geofence uuid, p_lat numeric, p_lng numeric) returns jsonb language sql as $$
  select public.point_in_geofence('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000700a2', '20000000-0000-0000-0000-00000000000a', p_geofence, p_lat, p_lng)
$$;
create function pg_temp.containing_a(p_lat numeric, p_lng numeric) returns jsonb language sql as $$
  select public.geofences_containing_point('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000700a2', '20000000-0000-0000-0000-00000000000a', p_lat, p_lng, null)
$$;

-- Círculo de 200 m em (-23.55, -46.633) e quadrado de 0,002 grau de lado em (-23.50, -46.60).
insert into r values
  ('circle', pg_temp.create_a('Círculo', 'circle', '{"lat":-23.55,"lng":-46.633}'::jsonb, 200, null)),
  ('square', pg_temp.create_a('Quadrado', 'polygon', null, null, '[{"lat":-23.501,"lng":-46.601},{"lat":-23.501,"lng":-46.599},{"lat":-23.499,"lng":-46.599},{"lat":-23.499,"lng":-46.601}]'::jsonb));

select is((select (pg_temp.inside_a((select (v->>'geofence_id')::uuid from r where k = 'circle'), -23.55, -46.633)->>'inside')::boolean), true, 'o centro do círculo está dentro');
select is((select (pg_temp.inside_a((select (v->>'geofence_id')::uuid from r where k = 'circle'), -23.55, -46.6325)->>'inside')::boolean), true, 'ponto a cerca de 50 m está dentro');
select is((select (pg_temp.inside_a((select (v->>'geofence_id')::uuid from r where k = 'circle'), -23.54, -46.633)->>'inside')::boolean), false, 'ponto a cerca de 1,1 km está fora');
select is((select (pg_temp.inside_a((select (v->>'geofence_id')::uuid from r where k = 'circle'),
  (select extensions.st_y(extensions.st_project(center, 199.9, 0)::extensions.geometry)::numeric from public.geofences where name = 'Círculo'),
  -46.633)->>'inside')::boolean), true, 'ponto a 199,9 m do centro está dentro');
select is((select (pg_temp.inside_a((select (v->>'geofence_id')::uuid from r where k = 'circle'),
  (select extensions.st_y(extensions.st_project(center, 200.5, 0)::extensions.geometry)::numeric from public.geofences where name = 'Círculo'),
  -46.633)->>'inside')::boolean), false, 'ponto a 200,5 m do centro está fora');
select is((select (pg_temp.inside_a((select (v->>'geofence_id')::uuid from r where k = 'square'), -23.5, -46.6)->>'inside')::boolean), true, 'o centro do polígono está dentro');
select is((select (pg_temp.inside_a((select (v->>'geofence_id')::uuid from r where k = 'square'), -23.5, -46.58)->>'inside')::boolean), false, 'ponto fora do polígono');
select is((select (pg_temp.inside_a((select (v->>'geofence_id')::uuid from r where k = 'square'), -23.501, -46.601)->>'inside')::boolean), true, 'a borda (vértice) do polígono conta como dentro');
select is((select (pg_temp.inside_a((select (v->>'geofence_id')::uuid from r where k = 'square'), -23.501, -46.6)->>'inside')::boolean), true, 'a borda (meio de uma aresta) do polígono conta como dentro');

-- ---------- quais geocercas contêm o ponto
select is((select jsonb_array_length(pg_temp.containing_a(-23.55, -46.633)->'geofences')), 1, 'o ponto do círculo é contido por uma geocerca');
select is((select pg_temp.containing_a(-23.55, -46.633)->'geofences'->0->>'name'), 'Círculo', 'a resposta traz o nome');
select is((select jsonb_array_length(pg_temp.containing_a(-10, -50)->'geofences')), 0, 'ponto sem geocerca devolve lista vazia');
select is((select pg_temp.containing_a(95, 0)->>'code'), 'VALIDATION_FAILED', 'latitude fora do intervalo é recusada');
select is((select count(*)::int from public.registry_events where event_type like 'geofence%' and entity_type = 'geofence') , 2, 'consultar não grava nada (só os dois eventos de criação)');

-- ---------- isolamento e inativa
select is((select public.point_in_geofence('10000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-0000000700b3', '20000000-0000-0000-0000-00000000000b',
  (select (v->>'geofence_id')::uuid from r where k = 'circle'), -23.55, -46.633)->>'code'), 'NOT_FOUND', 'o Tenant B não consulta a geocerca do A');
select is((select jsonb_array_length(public.geofences_containing_point('10000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-0000000700b3', '20000000-0000-0000-0000-00000000000b', -23.55, -46.633, null)->'geofences')), 0,
  'a consulta por ponto do Tenant B não encontra a geocerca do A');
update public.geofences set status = 'inactive', inactivated_at = now(), inactivated_by = '10000000-0000-0000-0000-000000000002' where name = 'Quadrado';
select is((select pg_temp.inside_a((select (v->>'geofence_id')::uuid from r where k = 'square'), -23.5, -46.6)->>'code'), 'INACTIVE_RECORD', 'geocerca inativa responde INACTIVE_RECORD');
select is((select jsonb_array_length(pg_temp.containing_a(-23.5, -46.6)->'geofences')), 0, 'geocerca inativa não entra na consulta por ponto');

-- ---------- lista e detalhe
select is((select (public.list_geofences('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000700a2', '20000000-0000-0000-0000-00000000000a', null, null, null, null, null, null, null)->>'total')::int), 1, 'a lista padrão traz só as ativas');
select is((select (public.list_geofences('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000700a2', '20000000-0000-0000-0000-00000000000a', null, null, null, null, 'all', null, null)->>'total')::int), 2, 'a lista com todas traz as duas');
select is((select public.list_geofences('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000700a2', '20000000-0000-0000-0000-00000000000a', null, null, 'hospital alfa', 'polygon', 'all', null, null)->'items'->0->>'name'), 'Quadrado', 'busca pelo cliente e filtro de forma');
select is((select (public.list_geofences('10000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-0000000700b3', '20000000-0000-0000-0000-00000000000b', null, null, null, null, 'all', null, null)->>'total')::int), 0, 'o Tenant B lista zero geocercas');
select is((select public.get_geofence('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000700a2', '20000000-0000-0000-0000-00000000000a', (select (v->>'geofence_id')::uuid from r where k = 'circle'))->'geofence'->>'radius_m'), '200', 'o detalhe do círculo traz o raio');
select is((select jsonb_array_length(public.get_geofence('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000700a2', '20000000-0000-0000-0000-00000000000a', (select (v->>'geofence_id')::uuid from r where k = 'square'))->'geofence'->'vertices')), 4, 'o detalhe do polígono traz os vértices');
select ok((select (public.get_geofence('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000700a2', '20000000-0000-0000-0000-00000000000a', (select (v->>'geofence_id')::uuid from r where k = 'square'))->'geofence'->>'area_m2')::bigint > 40000), 'a área do polígono é calculada no servidor');
select is((select public.get_geofence('10000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-0000000700b3', '20000000-0000-0000-0000-00000000000b', (select (v->>'geofence_id')::uuid from r where k = 'circle'))->>'code'), 'NOT_FOUND', 'o Tenant B não vê o detalhe');

-- ---------- índice GiST com 50 mil geocercas (RNF-003)
insert into public.geofences (organization_id, site_id, name, shape, center, radius_m, area)
select '20000000-0000-0000-0000-00000000000a', '82000000-0000-0000-0000-0000000007a1', 'Massa ' || n, 'circle',
       extensions.st_setsrid(extensions.st_makepoint(-60 + (n % 250) * 0.1, -30 + (n / 250) * 0.1), 4326)::extensions.geography, 100,
       extensions.st_buffer(extensions.st_setsrid(extensions.st_makepoint(-60 + (n % 250) * 0.1, -30 + (n / 250) * 0.1), 4326)::extensions.geography, 101)
  from generate_series(1, 50000) n;
analyze public.geofences;
create temp table plan (p text);
do $$
declare j jsonb;
begin
  execute $q$explain (format json) select g.id from public.geofences g
     where g.organization_id = '20000000-0000-0000-0000-00000000000a' and g.status = 'active'
       and g.area operator(extensions.&&) extensions.st_setsrid(extensions.st_makepoint(-46.633, -23.55), 4326)::extensions.geography$q$ into j;
  insert into plan values (j::text);
end $$;
select ok((select p like '%geofences_area_idx%' from plan), 'o plano usa o índice GiST com 50 mil geocercas');

select * from finish();
rollback;
