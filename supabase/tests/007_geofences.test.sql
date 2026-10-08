begin;
select plan(52);

-- Spec 007, US3: create_geofence e update_geofence (RF-013 a RF-018, RF-016a, CA-007). Hermético: desfeito pelo rollback.
-- Todos os dados são fictícios.

delete from public.user_sessions where user_id in (
  '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000003');
insert into public.membership_roles (membership_id, role_id, assigned_by)
  select '30000000-0000-0000-0000-00000000000b', r.id, '10000000-0000-0000-0000-000000000001'
    from public.roles r where r.organization_id = '20000000-0000-0000-0000-00000000000b' and r.code = 'tenant_admin';
insert into auth.users (id, aud, role, email) values
  ('10000000-0000-0000-0000-0000000007c1', 'authenticated', 'authenticated', 'g-driver@example.invalid'),
  ('10000000-0000-0000-0000-0000000007d1', 'authenticated', 'authenticated', 'g-auditor@example.invalid');
insert into public.profiles (user_id, display_name) values ('10000000-0000-0000-0000-0000000007c1', 'Motorista'), ('10000000-0000-0000-0000-0000000007d1', 'Auditor');
insert into public.memberships (id, organization_id, user_id, status, activated_at) values
  ('30000000-0000-0000-0000-0000000007c1', '20000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-0000000007c1', 'active', now()),
  ('30000000-0000-0000-0000-0000000007d1', '20000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-0000000007d1', 'active', now());
insert into public.membership_roles (membership_id, role_id, assigned_by)
  select m.id, r.id, '10000000-0000-0000-0000-000000000001'
    from (values ('30000000-0000-0000-0000-0000000007c1'::uuid, 'driver'), ('30000000-0000-0000-0000-0000000007d1', 'tenant_auditor')) m(id, code)
    join public.roles r on r.code = m.code and r.organization_id = '20000000-0000-0000-0000-00000000000a';
select public.start_user_session('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000700a2', 'aal1');
select public.start_user_session('10000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-0000000700b3', 'aal1');
select public.start_user_session('10000000-0000-0000-0000-0000000007c1', '60000000-0000-0000-0000-0000000700c1', 'aal1');
select public.start_user_session('10000000-0000-0000-0000-0000000007d1', '60000000-0000-0000-0000-0000000700d1', 'aal1');

-- Massa: duas unidades ativas em A (S1 e S2), uma inativa (S3), e uma unidade em B.
insert into public.customers (id, organization_id, person_type, document_display, legal_name, segment) values
  ('81000000-0000-0000-0000-0000000007a1', '20000000-0000-0000-0000-00000000000a', 'legal', '11222333000181', 'Hospital Alfa Ltda', 'hospital'),
  ('81000000-0000-0000-0000-0000000007b1', '20000000-0000-0000-0000-00000000000b', 'legal', '11222333000181', 'Hospital Beta Ltda', 'hospital');
insert into public.customer_sites (id, organization_id, customer_id, name, postal_code, street, number, city, state, status, inactivated_at) values
  ('82000000-0000-0000-0000-0000000007a1', '20000000-0000-0000-0000-00000000000a', '81000000-0000-0000-0000-0000000007a1', 'S1', '01001000', 'Praça da Sé', '1', 'São Paulo', 'SP', 'active', null),
  ('82000000-0000-0000-0000-0000000007a2', '20000000-0000-0000-0000-00000000000a', '81000000-0000-0000-0000-0000000007a1', 'S2', '01001000', 'Praça da Sé', '1', 'São Paulo', 'SP', 'active', null),
  ('82000000-0000-0000-0000-0000000007a3', '20000000-0000-0000-0000-00000000000a', '81000000-0000-0000-0000-0000000007a1', 'S3', '01001000', 'Praça da Sé', '1', 'São Paulo', 'SP', 'inactive', now()),
  ('82000000-0000-0000-0000-0000000007b1', '20000000-0000-0000-0000-00000000000b', '81000000-0000-0000-0000-0000000007b1', 'SB', '01001000', 'Praça da Sé', '1', 'São Paulo', 'SP', 'active', null);

create temp table r (k text primary key, v jsonb);
grant all on r to public;

-- Atalhos: ator A (administrador do Tenant A), ator B, motorista e auditor.
create function pg_temp.create_a(p_site uuid, p_name text, p_shape text, p_center jsonb, p_radius integer, p_vertices jsonb) returns jsonb language sql as $$
  select public.create_geofence('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000700a2', '20000000-0000-0000-0000-00000000000a',
    p_site, p_name, p_shape, p_center, p_radius, p_vertices)
$$;
create function pg_temp.circle(p_name text, p_radius integer, p_site uuid default '82000000-0000-0000-0000-0000000007a1', p_lat numeric default -23.55, p_lng numeric default -46.633)
returns jsonb language sql as $$
  select pg_temp.create_a(p_site, p_name, 'circle', jsonb_build_object('lat', p_lat, 'lng', p_lng), p_radius, null)
$$;
create function pg_temp.polygon(p_name text, p_vertices jsonb, p_site uuid default '82000000-0000-0000-0000-0000000007a1') returns jsonb language sql as $$
  select pg_temp.create_a(p_site, p_name, 'polygon', null, null, p_vertices)
$$;
create function pg_temp.ring(p_count integer, p_radius numeric default 0.01) returns jsonb language sql as $$
  select jsonb_agg(jsonb_build_object('lat', round((-23.55 + p_radius * sin(2 * pi() * k / p_count))::numeric, 6), 'lng', round((-46.633 + p_radius * cos(2 * pi() * k / p_count))::numeric, 6)) order by k)
    from generate_series(0, p_count - 1) k
$$;

-- ---------- círculo: raio nos limites
insert into r values
  ('c24', pg_temp.circle('C24', 24)), ('c25', pg_temp.circle('C25', 25)), ('c5000', pg_temp.circle('C5000', 5000, '82000000-0000-0000-0000-0000000007a2')),
  ('c5001', pg_temp.circle('C5001', 5001)), ('c200', pg_temp.circle('Portão 200', 200, '82000000-0000-0000-0000-0000000007a2', -23.5, -46.6));
select is((select v->>'code' from r where k = 'c24'), 'GEOMETRY_INVALID', 'raio de 24 m é recusado');
select is((select v->>'reason' from r where k = 'c24'), 'radius_range', 'o motivo é radius_range');
select is((select v->>'code' from r where k = 'c25'), 'CREATED', 'raio de 25 m é aceito');
select is((select v->>'code' from r where k = 'c5000'), 'CREATED', 'raio de 5000 m é aceito');
select is((select v->>'reason' from r where k = 'c5001'), 'radius_range', 'raio de 5001 m é recusado');
select is((select v->>'code' from r where k = 'c200'), 'CREATED', 'círculo de 200 m é criado');
select is((select (v->>'version')::int from r where k = 'c200'), 1, 'a versão inicial é 1');
select is((select status from public.geofences where id = (select (v->>'geofence_id')::uuid from r where k = 'c200')), 'active', 'nasce ativa');
select ok((select area is not null and extensions.st_area(area) > 100000 from public.geofences where id = (select (v->>'geofence_id')::uuid from r where k = 'c200')),
  'a área é calculada no servidor');
select is((select v->>'code' from (select pg_temp.circle('Lat90', 100, '82000000-0000-0000-0000-0000000007a2', 91, -46.6) v) s), 'GEOMETRY_INVALID', 'latitude fora do intervalo é recusada');
select is((select v->>'reason' from (select pg_temp.circle('Lng181', 100, '82000000-0000-0000-0000-0000000007a2', -23.5, 181) v) s), 'coordinate_range', 'longitude fora do intervalo é recusada');
select is((select v->>'code' from (select pg_temp.circle('Fora do Brasil', 100, '82000000-0000-0000-0000-0000000007a2', 48.8566, 2.3522) v) s), 'CREATED', 'geocerca fora do Brasil é aceita');
select is((select v->>'code' from (select pg_temp.circle('Antimeridiano', 500, '82000000-0000-0000-0000-0000000007a2', -17.7, 179.9999) v) s), 'CREATED', 'círculo no antimeridiano é aceito');

-- ---------- polígono: vértices nos limites e formas inválidas
insert into r values
  ('tri', pg_temp.polygon('Triângulo', '[{"lat":-23.55,"lng":-46.633},{"lat":-23.55,"lng":-46.630},{"lat":-23.548,"lng":-46.6315}]'::jsonb, '82000000-0000-0000-0000-0000000007a2')),
  ('two', pg_temp.polygon('Dois', '[{"lat":-23.55,"lng":-46.633},{"lat":-23.55,"lng":-46.630}]'::jsonb)),
  ('v100', pg_temp.polygon('Cem vértices', pg_temp.ring(100), '82000000-0000-0000-0000-0000000007a2')),
  ('v101', pg_temp.polygon('Cento e um', pg_temp.ring(101), '82000000-0000-0000-0000-0000000007a2')),
  ('bow', pg_temp.polygon('Gravata', '[{"lat":0,"lng":0},{"lat":1,"lng":1},{"lat":0,"lng":1},{"lat":1,"lng":0}]'::jsonb)),
  ('line', pg_temp.polygon('Reta', '[{"lat":0,"lng":0},{"lat":1,"lng":1},{"lat":2,"lng":2}]'::jsonb)),
  ('dup', pg_temp.polygon('Repetido', '[{"lat":0,"lng":0},{"lat":0,"lng":0},{"lat":1,"lng":1},{"lat":0,"lng":1}]'::jsonb)),
  ('closed', pg_temp.polygon('Fechado', '[{"lat":0,"lng":0},{"lat":1,"lng":1},{"lat":0,"lng":1},{"lat":0,"lng":0}]'::jsonb)),
  ('range', pg_temp.polygon('Fora da faixa', '[{"lat":0,"lng":0},{"lat":91,"lng":1},{"lat":0,"lng":1}]'::jsonb)),
  ('touch', pg_temp.polygon('Toque em vértice', '[{"lat":0,"lng":0},{"lat":2,"lng":0},{"lat":2,"lng":2},{"lat":1,"lng":0},{"lat":0,"lng":2}]'::jsonb)),
  ('cw', pg_temp.polygon('Horário', '[{"lat":0,"lng":0},{"lat":0,"lng":1},{"lat":1,"lng":1},{"lat":1,"lng":0}]'::jsonb)),
  ('ccw', pg_temp.polygon('Anti-horário', '[{"lat":0,"lng":0},{"lat":1,"lng":0},{"lat":1,"lng":1},{"lat":0,"lng":1}]'::jsonb));
select is((select v->>'code' from r where k = 'tri'), 'CREATED', 'triângulo (3 vértices) é aceito');
select is((select v->>'reason' from r where k = 'two'), 'vertex_count', 'dois vértices são recusados');
select is((select v->>'code' from r where k = 'v100'), 'CREATED', 'cem vértices são aceitos');
select is((select v->>'reason' from r where k = 'v101'), 'vertex_count', 'cento e um vértices são recusados');
select is((select v->>'reason' from r where k = 'bow'), 'self_intersection', 'polígono com arestas cruzadas é recusado');
select is((select v->>'reason' from r where k = 'line'), 'zero_area', 'vértices alinhados (área zero) são recusados');
select is((select v->>'reason' from r where k = 'dup'), 'duplicate_vertex', 'vértice repetido em sequência é recusado');
select is((select v->>'reason' from r where k = 'closed'), 'duplicate_vertex', 'repetir o primeiro vértice no fim é recusado');
select is((select v->>'reason' from r where k = 'range'), 'coordinate_range', 'coordenada fora do intervalo é recusada');
select is((select v->>'reason' from r where k = 'touch'), 'self_intersection', 'toque de aresta em vértice é recusado');
select is((select v->>'code' from r where k = 'cw'), 'CREATED', 'sentido horário é aceito');
select is((select v->>'code' from r where k = 'ccw'), 'CREATED', 'sentido anti-horário é aceito');
select is((select count(*)::int from public.geofences where name in ('Gravata', 'Reta', 'Repetido', 'Fechado', 'Fora da faixa', 'Toque em vértice', 'Dois', 'Cento e um')), 0, 'nada é gravado quando a forma é inválida');
select is((select vertices->0->>'lat' from public.geofences where name = 'Triângulo'), '-23.55', 'os vértices são guardados normalizados');

-- ---------- nome único por unidade, unidade inativa, outra organização, autorização
select is((select v->>'code' from (select pg_temp.circle('portão 200', 100, '82000000-0000-0000-0000-0000000007a2') v) s), 'NAME_CONFLICT', 'nome repetido na unidade (sem diferenciar caixa) é recusado');
select is((select v->>'code' from (select pg_temp.circle('Portão 200', 100) v) s), 'CREATED', 'o mesmo nome em outra unidade é aceito');
select is((select v->>'code' from (select pg_temp.circle('Em unidade inativa', 100, '82000000-0000-0000-0000-0000000007a3') v) s), 'PARENT_INACTIVE', 'unidade inativa não recebe geocerca');
select is((select v->>'code' from (select pg_temp.circle('Em outra organização', 100, '82000000-0000-0000-0000-0000000007b1') v) s), 'NOT_FOUND', 'unidade de outra organização responde NOT_FOUND');
select is((select v->>'code' from (select public.create_geofence('10000000-0000-0000-0000-0000000007c1', '60000000-0000-0000-0000-0000000700c1', '20000000-0000-0000-0000-00000000000a',
  '82000000-0000-0000-0000-0000000007a1', 'Motorista', 'circle', '{"lat":-23.5,"lng":-46.6}'::jsonb, 100, null) v) s), 'ACCESS_DENIED', 'o motorista não cria geocerca');
select is((select v->>'code' from (select public.create_geofence('10000000-0000-0000-0000-0000000007d1', '60000000-0000-0000-0000-0000000700d1', '20000000-0000-0000-0000-00000000000a',
  '82000000-0000-0000-0000-0000000007a1', 'Auditor', 'circle', '{"lat":-23.5,"lng":-46.6}'::jsonb, 100, null) v) s), 'ACCESS_DENIED', 'o auditor (só leitura) não cria geocerca');
select is((select v->>'code' from (select public.create_geofence('10000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-0000000700b3', '20000000-0000-0000-0000-00000000000b',
  '82000000-0000-0000-0000-0000000007a1', 'Invasão', 'circle', '{"lat":-23.5,"lng":-46.6}'::jsonb, 100, null) v) s), 'NOT_FOUND', 'o Tenant B não cria geocerca na unidade do A');
select is((select v->>'code' from (select pg_temp.create_a('82000000-0000-0000-0000-0000000007a1', 'X', 'circle', '{"lat":-23.5,"lng":-46.6}'::jsonb, 100, null) v) s), 'VALIDATION_FAILED', 'nome com 1 caractere é recusado');

-- ---------- sobreposição avisa e salva
insert into r values ('first', pg_temp.circle('Doca 1', 300, '82000000-0000-0000-0000-0000000007a1', -23.6, -46.7));
insert into r values ('second', pg_temp.circle('Doca 2', 300, '82000000-0000-0000-0000-0000000007a1', -23.6, -46.699));
select is((select v->>'code' from r where k = 'second'), 'CREATED', 'geocerca que se sobrepõe a outra da mesma unidade é salva');
select is((select v->'overlaps'->0->>'name' from r where k = 'second'), 'Doca 1', 'a resposta traz o nome da geocerca sobreposta');
select is((select jsonb_array_length(v->'overlaps') from r where k = 'first'), 0, 'a primeira não tem sobreposição');
select is((select jsonb_array_length(v->'overlaps') from (select pg_temp.circle('Doca de outra unidade', 300, '82000000-0000-0000-0000-0000000007a2', -23.6, -46.7) v) s), 0,
  'sobreposição com geocerca de outra unidade não gera aviso');

-- ---------- evento e auditoria
select is((select event_type from public.registry_events where entity_type = 'geofence' and entity_id = (select (v->>'geofence_id')::uuid from r where k = 'c200') and sequence = 1), 'geofence_created', 'evento geofence_created');
select ok(exists (select 1 from public.audit_logs where action = 'geofence.create' and target_id = (select v->>'geofence_id' from r where k = 'c200')), 'auditoria geofence.create gravada');

-- ---------- update_geofence
create function pg_temp.update_a(p_geofence uuid, p_version bigint, p_name text, p_shape text, p_center jsonb, p_radius integer, p_vertices jsonb) returns jsonb language sql as $$
  select public.update_geofence('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000700a2', '20000000-0000-0000-0000-00000000000a',
    p_geofence, p_version, p_name, p_shape, p_center, p_radius, p_vertices)
$$;
insert into r values ('upd', pg_temp.update_a((select (v->>'geofence_id')::uuid from r where k = 'c200'), 1, 'Portão 200 alterado', 'circle', '{"lat":-23.5,"lng":-46.6}'::jsonb, 250, null));
select is((select v->>'code' from r where k = 'upd'), 'UPDATED', 'a geocerca é editada');
select is((select (v->>'version')::int from r where k = 'upd'), 2, 'a versão sobe');
select is((select v->>'code' from (select pg_temp.update_a((select (v->>'geofence_id')::uuid from r where k = 'c200'), 1, 'Antigo', 'circle', '{"lat":-23.5,"lng":-46.6}'::jsonb, 250, null) v) s), 'VERSION_CONFLICT', 'versão antiga é recusada');
insert into r values ('toPoly', pg_temp.update_a((select (v->>'geofence_id')::uuid from r where k = 'c200'), 2, 'Portão 200 alterado', 'polygon', null, null,
  '[{"lat":-23.5,"lng":-46.6},{"lat":-23.5,"lng":-46.598},{"lat":-23.498,"lng":-46.599}]'::jsonb));
select is((select v->>'code' from r where k = 'toPoly'), 'UPDATED', 'a forma pode mudar de círculo para polígono');
select ok((select center is null and radius_m is null and vertices is not null from public.geofences where id = (select (v->>'geofence_id')::uuid from r where k = 'c200')), 'o centro e o raio saem e os vértices entram');
select is((select e.data->'from'->>'shape' || '>' || (e.data->'to'->>'shape') from public.registry_events e
            where e.event_type = 'geofence_updated' and e.entity_id = (select (v->>'geofence_id')::uuid from r where k = 'c200') and e.sequence = 3), 'circle>polygon', 'o evento traz a forma anterior e a nova');
select is((select v->>'code' from (select pg_temp.update_a((select (v->>'geofence_id')::uuid from r where k = 'c200'), 3, 'Triângulo', 'circle', '{"lat":-23.5,"lng":-46.6}'::jsonb, 250, null) v) s), 'NAME_CONFLICT', 'renomear para um nome usado na unidade é recusado');
select is((select v->>'reason' from (select pg_temp.update_a((select (v->>'geofence_id')::uuid from r where k = 'c200'), 3, 'Portão 200 alterado', 'circle', '{"lat":-23.5,"lng":-46.6}'::jsonb, 24, null) v) s), 'radius_range', 'a edição repete a validação da forma');
update public.geofences set status = 'inactive', inactivated_at = now(), inactivated_by = '10000000-0000-0000-0000-000000000002' where name = 'Doca 1';
select is((select v->>'code' from (select pg_temp.update_a((select (v->>'geofence_id')::uuid from r where k = 'first'), 1, 'Doca 1', 'circle', '{"lat":-23.6,"lng":-46.7}'::jsonb, 300, null) v) s), 'INACTIVE_RECORD', 'geocerca inativa não é editada');
select is((select v->>'code' from (select public.update_geofence('10000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-0000000700b3', '20000000-0000-0000-0000-00000000000b',
  (select (v->>'geofence_id')::uuid from r where k = 'c200'), 3, 'Invasão', 'circle', '{"lat":-23.5,"lng":-46.6}'::jsonb, 250, null) v) s), 'NOT_FOUND', 'o Tenant B não edita (nem enxerga) a geocerca do A');
select ok(not exists (select 1 from public.audit_logs where action like 'geofence.%' and metadata::text ~ '(11222333000181)'), 'nenhum documento na auditoria das geocercas');

select * from finish();
rollback;
