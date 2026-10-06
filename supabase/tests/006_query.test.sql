begin;
select plan(47);

-- Spec 006, US2: query_cylinders_list, query_cylinder_get e query_cylinder_catalog (RF-012, RF-028, RF-042). Hermético.
delete from public.user_sessions where user_id in (
  '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000003');

insert into public.membership_roles (membership_id, role_id, assigned_by)
  select '30000000-0000-0000-0000-00000000000b', r.id, '10000000-0000-0000-0000-000000000001'
    from public.roles r where r.organization_id = '20000000-0000-0000-0000-00000000000b' and r.code = 'tenant_admin';

insert into auth.users (id, aud, role, email) values
  ('10000000-0000-0000-0000-0000000006c1', 'authenticated', 'authenticated', 'q-driver@example.invalid'),
  ('10000000-0000-0000-0000-0000000006d1', 'authenticated', 'authenticated', 'q-auditor@example.invalid');
insert into public.profiles (user_id, display_name) values
  ('10000000-0000-0000-0000-0000000006c1', 'Motorista'), ('10000000-0000-0000-0000-0000000006d1', 'Auditor');
insert into public.memberships (id, organization_id, user_id, status, activated_at) values
  ('30000000-0000-0000-0000-0000000006c1', '20000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-0000000006c1', 'active', now()),
  ('30000000-0000-0000-0000-0000000006d1', '20000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-0000000006d1', 'active', now());
insert into public.membership_roles (membership_id, role_id, assigned_by)
  select '30000000-0000-0000-0000-0000000006c1', r.id, '10000000-0000-0000-0000-000000000001' from public.roles r
   where r.organization_id = '20000000-0000-0000-0000-00000000000a' and r.code = 'driver';
insert into public.membership_roles (membership_id, role_id, assigned_by)
  select '30000000-0000-0000-0000-0000000006d1', r.id, '10000000-0000-0000-0000-000000000001' from public.roles r
   where r.organization_id = '20000000-0000-0000-0000-00000000000a' and r.code = 'tenant_auditor';

select public.start_user_session('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000600a2', 'aal1');
select public.start_user_session('10000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-0000000600b3', 'aal1');
select public.start_user_session('10000000-0000-0000-0000-0000000006c1', '60000000-0000-0000-0000-0000000600c1', 'aal1');
select public.start_user_session('10000000-0000-0000-0000-0000000006d1', '60000000-0000-0000-0000-0000000600d1', 'aal1');

-- Massa: dois tipos em A, um em B; 30 cilindros ativos em A (Q-001..Q-030), 2 inativos, 3 em B.
insert into public.cylinder_types (id, organization_id, gas, capacity_value, capacity_unit, classification) values
  ('71000000-0000-0000-0000-0000000006a1', '20000000-0000-0000-0000-00000000000a', 'Oxigênio', 10, 'l', 'medicinal'),
  ('71000000-0000-0000-0000-0000000006a2', '20000000-0000-0000-0000-00000000000a', 'Nitrogênio', 40, 'l', 'industrial'),
  ('71000000-0000-0000-0000-0000000006b1', '20000000-0000-0000-0000-00000000000b', 'Oxigênio', 10, 'l', 'medicinal');
insert into public.cylinders (id, organization_id, cylinder_type_id, serial_number, stock_status, hydro_last_result, hydro_next_due_on)
select ('72000000-0000-0000-0000-0000000600' || lpad(n::text, 2, '0'))::uuid, '20000000-0000-0000-0000-00000000000a',
       case when n % 2 = 0 then '71000000-0000-0000-0000-0000000006a2' else '71000000-0000-0000-0000-0000000006a1' end::uuid,
       'Q-' || lpad(n::text, 3, '0'),
       case when n <= 10 then 'in_stock' else 'out_of_stock' end,
       case when n <= 5 then 'approved' when n = 6 then 'rejected' when n <= 8 then 'approved' else null end,
       case when n <= 5 then current_date + 200 when n = 7 then current_date + 10 when n = 8 then current_date - 3 else null end
  from generate_series(1, 30) n;
insert into public.cylinders (id, organization_id, cylinder_type_id, serial_number, status, inactivation_reason) values
  ('72000000-0000-0000-0000-0000000600e1', '20000000-0000-0000-0000-00000000000a', '71000000-0000-0000-0000-0000000006a1', 'Q-INATIVO-1', 'inactive', 'lost'),
  ('72000000-0000-0000-0000-0000000600e2', '20000000-0000-0000-0000-00000000000a', '71000000-0000-0000-0000-0000000006a1', 'Q-INATIVO-2', 'inactive', 'written_off');
insert into public.cylinders (id, organization_id, cylinder_type_id, serial_number) values
  ('72000000-0000-0000-0000-0000000600b1', '20000000-0000-0000-0000-00000000000b', '71000000-0000-0000-0000-0000000006b1', 'Q-001'),
  ('72000000-0000-0000-0000-0000000600b2', '20000000-0000-0000-0000-00000000000b', '71000000-0000-0000-0000-0000000006b1', 'Q-B-002'),
  ('72000000-0000-0000-0000-0000000600b3', '20000000-0000-0000-0000-00000000000b', '71000000-0000-0000-0000-0000000006b1', 'Q-B-003');
-- Identificadores: Q-001 tem dois ativos e um desativado; Q-002 tem um; Q-INATIVO-1 mantém o seu ativo; B repete o valor de Q-001.
insert into public.cylinder_identifiers (organization_id, cylinder_id, kind, value) values
  ('20000000-0000-0000-0000-00000000000a', '72000000-0000-0000-0000-000000060001', 'qr_code', 'QR-0001'),
  ('20000000-0000-0000-0000-00000000000a', '72000000-0000-0000-0000-000000060001', 'nfc_tag', 'NFC-0001'),
  ('20000000-0000-0000-0000-00000000000a', '72000000-0000-0000-0000-000000060002', 'data_matrix', 'dm-0002'),
  ('20000000-0000-0000-0000-00000000000a', '72000000-0000-0000-0000-0000000600e1', 'qr_code', 'QR-INATIVO'),
  ('20000000-0000-0000-0000-00000000000b', '72000000-0000-0000-0000-0000000600b1', 'qr_code', 'QR-0001');
insert into public.cylinder_identifiers (organization_id, cylinder_id, kind, value, status, deactivated_at, deactivated_by, deactivation_justification) values
  ('20000000-0000-0000-0000-00000000000a', '72000000-0000-0000-0000-000000060001', 'hull_number', 'HULL-OLD', 'deactivated', now(), '10000000-0000-0000-0000-000000000002', 'Etiqueta danificada');
insert into public.cylinder_tests (id, organization_id, cylinder_id, performed_on, result, executor, next_due_on) values
  ('74000000-0000-0000-0000-0000000600a1', '20000000-0000-0000-0000-00000000000a', '72000000-0000-0000-0000-000000060001', current_date - 400, 'approved', 'Lab', current_date - 30);
insert into public.cylinder_tests (id, organization_id, cylinder_id, performed_on, result, executor, next_due_on, rectifies_test_id, rectification_justification) values
  ('74000000-0000-0000-0000-0000000600a2', '20000000-0000-0000-0000-00000000000a', '72000000-0000-0000-0000-000000060001', current_date - 400, 'approved', 'Lab', current_date + 200, '74000000-0000-0000-0000-0000000600a1', 'data corrigida');

create function pg_temp.lista(p_actor uuid, p_session uuid, p_org uuid, p_search text default null, p_status text default null,
  p_stock text default null, p_hydro text default null, p_type uuid default null, p_sort text default null, p_cursor text default null, p_limit integer default null)
returns jsonb language sql as $$
  select public.query_cylinders_list(p_actor, p_session, p_org, p_search, p_status, p_stock, p_hydro, p_type, p_sort, p_cursor, p_limit)
$$;
create temp table ids as select
  '10000000-0000-0000-0000-000000000002'::uuid as a, '60000000-0000-0000-0000-0000000600a2'::uuid as sa,
  '10000000-0000-0000-0000-000000000003'::uuid as b, '60000000-0000-0000-0000-0000000600b3'::uuid as sb,
  '20000000-0000-0000-0000-00000000000a'::uuid as oa, '20000000-0000-0000-0000-00000000000b'::uuid as ob;

-- 1-4. Catálogo.
select is((select jsonb_array_length(public.query_cylinder_catalog(a, sa, oa)->'types') from ids), 2, 'catálogo de A tem os 2 tipos de A');
select is((select public.query_cylinder_catalog(a, sa, oa)->>'code' from ids), 'LISTED', 'catálogo: LISTED');
select is((select public.query_cylinder_catalog('10000000-0000-0000-0000-0000000006c1', '60000000-0000-0000-0000-0000000600c1', oa)->>'code' from ids), 'ACCESS_DENIED', 'motorista sem cylinder.read: ACCESS_DENIED');
select is((select public.query_cylinder_catalog(a, '60000000-0000-0000-0000-0000deadbeef', oa)->>'code' from ids), 'AUTH_REQUIRED', 'sessão desconhecida: AUTH_REQUIRED');

-- 5-10. Lista: padrão ativos, total exato, isolamento.
select is((select pg_temp.lista(a, sa, oa)->>'total' from ids), '30', 'padrão: só ativos (30), total exato');
select is((select jsonb_array_length(pg_temp.lista(a, sa, oa)->'items') from ids), 25, 'página padrão de 25');
select is((select pg_temp.lista(a, sa, oa, null, 'inactive')->>'total' from ids), '2', 'inativos: 2');
select is((select pg_temp.lista(a, sa, oa, null, 'all')->>'total' from ids), '32', 'todos: 32');
select is((select pg_temp.lista(b, sb, ob)->>'total' from ids), '3', 'B vê só os 3 cilindros de B');
select is((select pg_temp.lista(b, sb, oa)->>'code' from ids), 'ACCESS_DENIED', 'B pedindo a organização A: ACCESS_DENIED');

-- 11-16. Busca.
select is((select pg_temp.lista(a, sa, oa, '  qr-0001 ')->'items'->0->>'serial_number' from ids), 'Q-001', 'busca por identificador (caixa e espaços ignorados) devolve o dono');
select is((select pg_temp.lista(a, sa, oa, 'dm-0002')->>'total' from ids), '1', 'busca por identificador de outro tipo');
select is((select pg_temp.lista(a, sa, oa, 'HULL-OLD')->>'total' from ids), '0', 'identificador desativado não encontra o cilindro');
select is((select pg_temp.lista(a, sa, oa, 'q-01')->>'total' from ids), '10', 'parte do número de série (Q-010..Q-019)');
select is((select pg_temp.lista(a, sa, oa, 'QR-0001', 'all')->>'total' from ids), '1', 'o mesmo valor de B não aparece na busca de A');
select is((select pg_temp.lista(b, sb, ob, 'QR-0001')->'items'->0->>'id' from ids), '72000000-0000-0000-0000-0000000600b1', 'B encontra o próprio cilindro com o mesmo valor');
select is((select pg_temp.lista(a, sa, oa, 'Q_0%')->>'total' from ids), '0', 'curingas de LIKE no texto da busca são tratados como texto');

-- 17-22. Filtros combinados.
select is((select pg_temp.lista(a, sa, oa, null, null, 'in_stock')->>'total' from ids), '10', 'em estoque: 10');
select is((select pg_temp.lista(a, sa, oa, null, null, null, 'em_dia')->>'total' from ids), '5', 'teste em dia: 5 (Q-001 conta pelo teste retificado)');
select is((select pg_temp.lista(a, sa, oa, null, null, null, 'a_vencer')->>'total' from ids), '1', 'a vencer: 1');
select is((select pg_temp.lista(a, sa, oa, null, null, null, 'vencido')->>'total' from ids), '1', 'vencido: 1');
select is((select pg_temp.lista(a, sa, oa, null, null, null, 'reprovado')->>'total' from ids), '1', 'reprovado: 1');
select is((select pg_temp.lista(a, sa, oa, null, null, 'in_stock', 'em_dia', '71000000-0000-0000-0000-0000000006a1')->>'total' from ids), '3', 'estoque + teste + tipo combinados (Q-001, Q-003, Q-005)');

-- 23-27. Paginação por cursor mantendo filtros, sem repetir nem perder itens.
create temp table pag as
  with p1 as (select pg_temp.lista(a, sa, oa, null, null, null, null, null, null, null, 12) as r from ids),
       p2 as (select pg_temp.lista(a, sa, oa, null, null, null, null, null, null, (select r->>'next' from p1), 12) as r from ids),
       p3 as (select pg_temp.lista(a, sa, oa, null, null, null, null, null, null, (select r->>'next' from p2), 12) as r from ids)
  select (select r from p1) as r1, (select r from p2) as r2, (select r from p3) as r3;
select is((select jsonb_array_length(r1->'items') || '/' || jsonb_array_length(r2->'items') || '/' || jsonb_array_length(r3->'items') from pag), '12/12/6', 'três páginas: 12, 12 e 6 itens');
select is((select r3->>'next' from pag), null, 'a última página não tem próximo cursor');
select is((select count(distinct i->>'id')::int from pag, jsonb_array_elements((r1->'items') || (r2->'items') || (r3->'items')) i), 30, 'as 30 linhas aparecem uma única vez');
select is((select r1->'items'->0->>'serial_number' from pag), 'Q-001', 'a primeira página começa pela menor série');
select is((select pg_temp.lista(a, sa, oa, null, null, null, null, null, 'serial_desc', null, 3)->'items'->0->>'serial_number' from ids), 'Q-030', 'ordenação decrescente');

-- 28-29. Cursor ou filtro inválido.
select is((select pg_temp.lista(a, sa, oa, null, null, null, null, null, null, 'não-é-cursor')->>'code' from ids), 'VALIDATION_FAILED', 'cursor inválido: VALIDATION_FAILED');
select is((select pg_temp.lista(a, sa, oa, null, 'tudo')->>'code' from ids), 'VALIDATION_FAILED', 'filtro cadastral desconhecido: VALIDATION_FAILED');

-- 30-33. Itens: tipo, contagem de identificadores ativos e situação do teste.
select is((select i->'type'->>'gas' from ids, jsonb_array_elements(pg_temp.lista(a, sa, oa, 'Q-001')->'items') i limit 1), 'Oxigênio', 'o item traz o tipo');
select is((select (i->>'active_identifier_count') from ids, jsonb_array_elements(pg_temp.lista(a, sa, oa, 'Q-001')->'items') i limit 1), '2', 'Q-001 tem 2 identificadores ativos (o desativado não conta)');
select is((select (i->>'active_identifier_count') from ids, jsonb_array_elements(pg_temp.lista(a, sa, oa, 'Q-020')->'items') i limit 1), '0', 'Q-020 não tem identificador ativo');
select is((select i->>'hydro_status' from ids, jsonb_array_elements(pg_temp.lista(a, sa, oa, 'Q-007')->'items') i limit 1), 'a_vencer', 'o item traz a situação do teste calculada');

-- 34-41. Detalhe.
select is((select public.query_cylinder_get(a, sa, oa, '72000000-0000-0000-0000-000000060001')->>'code' from ids), 'FOUND', 'detalhe encontrado');
select is((select jsonb_array_length(public.query_cylinder_get(a, sa, oa, '72000000-0000-0000-0000-000000060001')->'identifiers') from ids), 3, 'o detalhe traz identificadores ativos e desativados');
select is((select (public.query_cylinder_get(a, sa, oa, '72000000-0000-0000-0000-000000060001')->'identifiers'->2->>'status') from ids), 'deactivated', 'ativos primeiro: o desativado vem por último');
select is((select jsonb_array_length(public.query_cylinder_get(a, sa, oa, '72000000-0000-0000-0000-000000060001')->'tests') from ids), 2, 'o detalhe traz o original e a retificação');
select is((select public.query_cylinder_get(a, sa, oa, '72000000-0000-0000-0000-000000060001')->'tests'->0->>'superseded' from ids), 'false', 'o teste mais recente (retificação) não está substituído');
select is((select public.query_cylinder_get(a, sa, oa, '72000000-0000-0000-0000-000000060001')->>'hydro_status' from ids), 'em_dia', 'a situação do teste vem do registro efetivo');
select is((select public.query_cylinder_get(b, sb, ob, '72000000-0000-0000-0000-000000060001')::text from ids), '{"code": "NOT_FOUND"}', 'B não vê o cilindro de A: NOT_FOUND');
select is((select public.query_cylinder_get(b, sb, ob, '72000000-0000-0000-0000-00000000ffff')::text from ids), '{"code": "NOT_FOUND"}', 'inexistente: exatamente a mesma resposta (RF-042)');

-- 42-44. Auditor lê; motorista não; consultas não gravam auditoria.
select is((select public.query_cylinder_get('10000000-0000-0000-0000-0000000006d1', '60000000-0000-0000-0000-0000000600d1', oa, '72000000-0000-0000-0000-000000060001')->>'code' from ids), 'FOUND', 'auditor (cylinder.read) lê o detalhe');
select is((select public.query_cylinder_get('10000000-0000-0000-0000-0000000006c1', '60000000-0000-0000-0000-0000000600c1', oa, '72000000-0000-0000-0000-000000060001')->>'code' from ids), 'ACCESS_DENIED', 'motorista não lê o detalhe');
select is((select count(*)::int from public.audit_logs where action like 'cylinder.%'), 0, 'consultas não geram auditoria de sucesso');

-- 45-46. Série sem curingas e a organização inativa/suspensa nega.
select is((select pg_temp.lista(a, sa, oa, '%')->>'total' from ids), '0', 'o texto "%" não casa com tudo');
update public.organizations set status = 'suspended' where id = '20000000-0000-0000-0000-00000000000a';
select is((select pg_temp.lista(a, sa, oa)->>'code' from ids), 'ACCESS_DENIED', 'tenant suspenso: leitura negada');

select * from finish(); rollback;
