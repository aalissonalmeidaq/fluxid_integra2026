begin;
select plan(35);

-- Spec 006, US7: query_cylinder_history (RF-024 a RF-026, RF-042). Hermético.
delete from public.user_sessions where user_id in (
  '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000003');
insert into public.membership_roles (membership_id, role_id, assigned_by)
  select '30000000-0000-0000-0000-00000000000b', r.id, '10000000-0000-0000-0000-000000000001'
    from public.roles r where r.organization_id = '20000000-0000-0000-0000-00000000000b' and r.code = 'tenant_admin';
insert into auth.users (id, aud, role, email) values
  ('10000000-0000-0000-0000-0000000006c1', 'authenticated', 'authenticated', 'h-driver@example.invalid'),
  ('10000000-0000-0000-0000-0000000006d1', 'authenticated', 'authenticated', 'h-auditor@example.invalid'),
  ('10000000-0000-0000-0000-0000000006d2', 'authenticated', 'authenticated', 'h-readonly@example.invalid');
insert into public.profiles (user_id, display_name) values
  ('10000000-0000-0000-0000-0000000006c1', 'Motorista'), ('10000000-0000-0000-0000-0000000006d1', 'Auditor'), ('10000000-0000-0000-0000-0000000006d2', 'Só leitura');
insert into public.memberships (id, organization_id, user_id, status, activated_at) values
  ('30000000-0000-0000-0000-0000000006c1', '20000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-0000000006c1', 'active', now()),
  ('30000000-0000-0000-0000-0000000006d1', '20000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-0000000006d1', 'active', now()),
  ('30000000-0000-0000-0000-0000000006d2', '20000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-0000000006d2', 'active', now());
insert into public.roles (id, organization_id, code, name, scope) values
  ('50000000-0000-0000-0000-0000000006d2', '20000000-0000-0000-0000-00000000000a', 'cyl_read_only', 'Somente leitura', 'tenant');
insert into public.role_permissions (role_id, permission_id) select '50000000-0000-0000-0000-0000000006d2', id from public.permissions where code = 'cylinder.read';
insert into public.membership_roles (membership_id, role_id, assigned_by)
  select '30000000-0000-0000-0000-0000000006c1', r.id, '10000000-0000-0000-0000-000000000001' from public.roles r where r.organization_id = '20000000-0000-0000-0000-00000000000a' and r.code = 'driver';
insert into public.membership_roles (membership_id, role_id, assigned_by)
  select '30000000-0000-0000-0000-0000000006d1', r.id, '10000000-0000-0000-0000-000000000001' from public.roles r where r.organization_id = '20000000-0000-0000-0000-00000000000a' and r.code = 'tenant_auditor';
insert into public.membership_roles (membership_id, role_id, assigned_by) values
  ('30000000-0000-0000-0000-0000000006d2', '50000000-0000-0000-0000-0000000006d2', '10000000-0000-0000-0000-000000000001');
select public.start_user_session('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000600a2', 'aal1');
select public.start_user_session('10000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-0000000600b3', 'aal1');
select public.start_user_session('10000000-0000-0000-0000-0000000006c1', '60000000-0000-0000-0000-0000000600c1', 'aal1');
select public.start_user_session('10000000-0000-0000-0000-0000000006d1', '60000000-0000-0000-0000-0000000600d1', 'aal1');
select public.start_user_session('10000000-0000-0000-0000-0000000006d2', '60000000-0000-0000-0000-0000000600d2', 'aal1');

insert into public.cylinder_types (id, organization_id, gas, capacity_value, capacity_unit, classification) values
  ('71000000-0000-0000-0000-0000000006a1', '20000000-0000-0000-0000-00000000000a', 'Oxigênio', 10, 'l', 'medicinal'),
  ('71000000-0000-0000-0000-0000000006b1', '20000000-0000-0000-0000-00000000000b', 'Oxigênio', 10, 'l', 'medicinal');
insert into public.cylinders (id, organization_id, cylinder_type_id, serial_number) values
  ('72000000-0000-0000-0000-0000000006f1', '20000000-0000-0000-0000-00000000000a', '71000000-0000-0000-0000-0000000006a1', 'H1'),
  ('72000000-0000-0000-0000-0000000006f2', '20000000-0000-0000-0000-00000000000a', '71000000-0000-0000-0000-0000000006a1', 'H2'),
  ('72000000-0000-0000-0000-0000000006e1', '20000000-0000-0000-0000-00000000000b', '71000000-0000-0000-0000-0000000006b1', 'K1');

-- H1 com 3000 eventos (milhares): alterna tipos e distribui no tempo; H2 com 3 eventos de ordem conhecida.
insert into public.cylinder_events (organization_id, cylinder_id, sequence, event_type, actor_user_id, occurred_at, justification)
select '20000000-0000-0000-0000-00000000000a', '72000000-0000-0000-0000-0000000006f1', n,
       case when n = 1 then 'cylinder_created' when n % 3 = 0 then 'stock_in' else 'cylinder_updated' end,
       '10000000-0000-0000-0000-000000000002', timestamptz '2026-01-01 12:00:00+00' + (n || ' minutes')::interval, case when n % 100 = 0 then 'marco ' || n end
  from generate_series(1, 3000) n;
insert into public.cylinder_events (organization_id, cylinder_id, sequence, event_type, actor_user_id, occurred_at) values
  ('20000000-0000-0000-0000-00000000000a', '72000000-0000-0000-0000-0000000006f2', 1, 'cylinder_created', '10000000-0000-0000-0000-000000000002', timestamptz '2026-03-10 10:00:00+00'),
  ('20000000-0000-0000-0000-00000000000a', '72000000-0000-0000-0000-0000000006f2', 2, 'identifier_added', '10000000-0000-0000-0000-000000000002', timestamptz '2026-03-10 10:00:00+00'),
  ('20000000-0000-0000-0000-00000000000a', '72000000-0000-0000-0000-0000000006f2', 3, 'stock_in', '10000000-0000-0000-0000-000000000002', timestamptz '2026-03-10 10:00:00+00');
insert into public.cylinder_events (organization_id, cylinder_id, sequence, event_type, actor_user_id, references_event_id)
  select '20000000-0000-0000-0000-00000000000a', '72000000-0000-0000-0000-0000000006f2', 4, 'hydrostatic_test_rectified', '10000000-0000-0000-0000-000000000002',
         (select id from public.cylinder_events where cylinder_id = '72000000-0000-0000-0000-0000000006f2' and sequence = 3);
insert into public.cylinder_events (organization_id, cylinder_id, sequence, event_type, actor_user_id) values
  ('20000000-0000-0000-0000-00000000000b', '72000000-0000-0000-0000-0000000006e1', 1, 'cylinder_created', '10000000-0000-0000-0000-000000000003');

create temp table ids as select
  '10000000-0000-0000-0000-000000000002'::uuid as a, '60000000-0000-0000-0000-0000000600a2'::uuid as sa,
  '10000000-0000-0000-0000-000000000003'::uuid as b, '60000000-0000-0000-0000-0000000600b3'::uuid as sb,
  '20000000-0000-0000-0000-00000000000a'::uuid as oa, '20000000-0000-0000-0000-00000000000b'::uuid as ob,
  '72000000-0000-0000-0000-0000000006f1'::uuid as h1, '72000000-0000-0000-0000-0000000006f2'::uuid as h2, '72000000-0000-0000-0000-0000000006e1'::uuid as k1;

-- 1-8. Ordem e conteúdo.
select is((select public.query_cylinder_history(a, sa, oa, h2)->>'code' from ids), 'LISTED', 'histórico listado');
select is((select array_agg(e->>'sequence' order by ord) from ids, jsonb_array_elements(public.query_cylinder_history(a, sa, oa, h2)->'events') with ordinality t(e, ord)), array['4', '3', '2', '1'], 'padrão: do mais recente para o mais antigo');
select is((select array_agg(e->>'sequence' order by ord) from ids, jsonb_array_elements(public.query_cylinder_history(a, sa, oa, h2, null, null, null, 'asc')->'events') with ordinality t(e, ord)), array['1', '2', '3', '4'], 'a ordem pode ser invertida');
select is((select array_agg(e->>'event_type' order by ord) from ids, jsonb_array_elements(public.query_cylinder_history(a, sa, oa, h2, null, null, null, 'asc')->'events') with ordinality t(e, ord)),
  array['cylinder_created', 'identifier_added', 'stock_in', 'hydrostatic_test_rectified'], 'tipos na ordem de registro, mesmo com o mesmo instante');
select is((select count(distinct e->>'occurred_at')::int from ids, jsonb_array_elements(public.query_cylinder_history(a, sa, oa, h2)->'events') e where (e->>'sequence')::int <= 3), 1, 'os três primeiros eventos têm o mesmo instante e a ordem continua determinística');
select is((select e->>'actor_name' from ids, jsonb_array_elements(public.query_cylinder_history(a, sa, oa, h2)->'events') e limit 1), 'Administrador A', 'cada evento traz o nome de quem fez');
select is((select e->>'references_event_id' is not null from ids, jsonb_array_elements(public.query_cylinder_history(a, sa, oa, h2)->'events') e where e->>'sequence' = '4'), true, 'a correção referencia o evento anterior');
select is((select e->>'justification' from ids, jsonb_array_elements(public.query_cylinder_history(a, sa, oa, h1, null, null, null, 'asc', null, 1)->'events') e), null, 'justificativa ausente aparece como nula');

-- 9-15. Milhares de eventos: paginação por cursor, sem carregar tudo.
select is((select jsonb_array_length(public.query_cylinder_history(a, sa, oa, h1)->'events') from ids), 25, 'página padrão de 25 de 3000 eventos');
select is((select jsonb_array_length(public.query_cylinder_history(a, sa, oa, h1, null, null, null, 'desc', null, 1000)->'events') from ids), 100, 'o tamanho da página é limitado a 100');
create temp table p1 as select public.query_cylinder_history(a, sa, oa, h1, null, null, null, 'desc', null, 100) as r from ids;
create temp table p2 as select public.query_cylinder_history(a, sa, oa, h1, null, null, null, 'desc', (select r->>'next' from p1), 100) as r from ids;
select is((select r->'events'->0->>'sequence' from p1), '3000', 'primeira página começa no evento mais recente');
select is((select r->'events'->0->>'sequence' from p2), '2900', 'a segunda continua exatamente depois da primeira');
select is((select r->>'next' from p2), '2801', 'e aponta o próximo cursor');
select is((select public.query_cylinder_history(a, sa, oa, h1, null, null, null, 'asc', '2990', 100)->'events'->0->>'sequence' from ids), '2991', 'em ordem crescente o cursor avança');
select is((select jsonb_array_length(public.query_cylinder_history(a, sa, oa, h1, null, null, null, 'asc', '2990', 100)->'events') from ids), 10, 'a última página crescente tem os 10 restantes');
select is((select public.query_cylinder_history(a, sa, oa, h1, null, null, null, 'asc', '2990', 100)->>'next' from ids), null, 'e não tem próximo cursor');

-- 16-20. Filtros por tipo e período.
select is((select count(*)::int from ids, jsonb_array_elements(public.query_cylinder_history(a, sa, oa, h1, 'cylinder_created', null, null, 'desc', null, 100)->'events')), 1, 'filtro por tipo de evento');
select is((select public.query_cylinder_history(a, sa, oa, h1, 'stock_in', null, null, 'desc', null, 100)->'events'->0->>'sequence' from ids), '3000', 'filtro por tipo devolve os mais recentes primeiro');
select is((select jsonb_array_length(public.query_cylinder_history(a, sa, oa, h1, null, date '2026-01-01', date '2026-01-01', 'desc', null, 100)->'events') from ids), 100, 'filtro por período (1º de janeiro: 100 por página)');
select is((select public.query_cylinder_history(a, sa, oa, h1, null, date '2026-01-03', date '2026-01-03', 'asc', null, 100)->'events'->0->>'sequence' from ids), '2340', 'o período usa o dia de São Paulo');
select is((select jsonb_array_length(public.query_cylinder_history(a, sa, oa, h2, null, date '2026-03-11', date '2026-03-11')->'events') from ids), 0, 'período sem eventos: lista vazia');

-- 21-24. Validações.
select is((select public.query_cylinder_history(a, sa, oa, h1, null, null, null, 'aleatório')->>'code' from ids), 'VALIDATION_FAILED', 'ordem desconhecida: VALIDATION_FAILED');
select is((select public.query_cylinder_history(a, sa, oa, h1, null, null, null, 'desc', 'abc')->>'code' from ids), 'VALIDATION_FAILED', 'cursor inválido: VALIDATION_FAILED');
select is((select public.query_cylinder_history(a, sa, oa, h1, 'cylinder_apagado')->>'code' from ids), 'VALIDATION_FAILED', 'tipo de evento desconhecido: VALIDATION_FAILED');
select is((select public.query_cylinder_history(a, sa, oa, h1, null, date '2026-02-01', date '2026-01-01')->>'code' from ids), 'VALIDATION_FAILED', 'período invertido: VALIDATION_FAILED');

-- 25-31. Autorização e isolamento: a leitura exige cylinder.history; cilindro de outro tenant e inexistente respondem igual.
select is((select public.query_cylinder_history('10000000-0000-0000-0000-0000000006d1', '60000000-0000-0000-0000-0000000600d1', oa, h2)->>'code' from ids), 'LISTED', 'auditor lê o histórico');
select is((select public.query_cylinder_history('10000000-0000-0000-0000-0000000006d2', '60000000-0000-0000-0000-0000000600d2', oa, h2)->>'code' from ids), 'ACCESS_DENIED', 'só cylinder.read, sem cylinder.history: ACCESS_DENIED');
select is((select public.query_cylinder_history('10000000-0000-0000-0000-0000000006c1', '60000000-0000-0000-0000-0000000600c1', oa, h2)->>'code' from ids), 'ACCESS_DENIED', 'motorista: ACCESS_DENIED');
select is((select public.query_cylinder_history(a, '60000000-0000-0000-0000-0000deadbeef', oa, h2)->>'code' from ids), 'AUTH_REQUIRED', 'sessão desconhecida: AUTH_REQUIRED');
select is((select public.query_cylinder_history(b, sb, ob, h2)::text from ids), '{"code": "NOT_FOUND"}', 'B não lê o histórico de A: NOT_FOUND');
select is((select public.query_cylinder_history(b, sb, ob, '72000000-0000-0000-0000-00000000ffff')::text from ids), '{"code": "NOT_FOUND"}', 'inexistente: a mesma resposta (RF-042)');
select is((select public.query_cylinder_history(b, sb, oa, h2)->>'code' from ids), 'ACCESS_DENIED', 'B pedindo o contexto de A: ACCESS_DENIED');

-- 32-34. Somente leitura.
select is((select count(*)::int from public.audit_logs where action like 'cylinder.%'), 0, 'ler o histórico não gera auditoria de sucesso');
select is((select count(*)::int from public.cylinder_events where cylinder_id = (select h1 from ids)), 3000, 'e não altera eventos');
select is((select jsonb_array_length(public.query_cylinder_history(b, sb, ob, k1)->'events') from ids), 1, 'B lê o próprio histórico');

select * from finish(); rollback;
