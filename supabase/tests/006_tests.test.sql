begin;
select plan(42);

-- Spec 006, US4: register_hydrostatic_test e rectify_hydrostatic_test (RF-019, RF-020, RF-022, RF-040). Hermético.
delete from public.user_sessions where user_id in (
  '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000003');
insert into public.membership_roles (membership_id, role_id, assigned_by)
  select '30000000-0000-0000-0000-00000000000b', r.id, '10000000-0000-0000-0000-000000000001'
    from public.roles r where r.organization_id = '20000000-0000-0000-0000-00000000000b' and r.code = 'tenant_admin';
insert into auth.users (id, aud, role, email) values
  ('10000000-0000-0000-0000-0000000006a1', 'authenticated', 'authenticated', 't-stock@example.invalid'),
  ('10000000-0000-0000-0000-0000000006a2', 'authenticated', 'authenticated', 't-tech@example.invalid');
insert into public.profiles (user_id, display_name) values
  ('10000000-0000-0000-0000-0000000006a1', 'Estoquista'), ('10000000-0000-0000-0000-0000000006a2', 'Técnico');
insert into public.memberships (id, organization_id, user_id, status, activated_at) values
  ('30000000-0000-0000-0000-0000000006a1', '20000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-0000000006a1', 'active', now()),
  ('30000000-0000-0000-0000-0000000006a2', '20000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-0000000006a2', 'active', now());
insert into public.membership_roles (membership_id, role_id, assigned_by)
  select '30000000-0000-0000-0000-0000000006a1', r.id, '10000000-0000-0000-0000-000000000001' from public.roles r
   where r.organization_id = '20000000-0000-0000-0000-00000000000a' and r.code = 'stock_operator';
insert into public.membership_roles (membership_id, role_id, assigned_by)
  select '30000000-0000-0000-0000-0000000006a2', r.id, '10000000-0000-0000-0000-000000000001' from public.roles r
   where r.organization_id = '20000000-0000-0000-0000-00000000000a' and r.code = 'technical_operator';
select public.start_user_session('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000600a2', 'aal1');
select public.start_user_session('10000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-0000000600b3', 'aal1');
select public.start_user_session('10000000-0000-0000-0000-0000000006a1', '60000000-0000-0000-0000-0000000600a1', 'aal1');
select public.start_user_session('10000000-0000-0000-0000-0000000006a2', '60000000-0000-0000-0000-0000000600a4', 'aal1');

insert into public.cylinder_types (id, organization_id, gas, capacity_value, capacity_unit, classification) values
  ('71000000-0000-0000-0000-0000000006a1', '20000000-0000-0000-0000-00000000000a', 'Oxigênio', 10, 'l', 'medicinal'),
  ('71000000-0000-0000-0000-0000000006b1', '20000000-0000-0000-0000-00000000000b', 'Oxigênio', 10, 'l', 'medicinal');
insert into public.cylinders (id, organization_id, cylinder_type_id, serial_number) values
  ('72000000-0000-0000-0000-0000000006f1', '20000000-0000-0000-0000-00000000000a', '71000000-0000-0000-0000-0000000006a1', 'T1'),
  ('72000000-0000-0000-0000-0000000006f2', '20000000-0000-0000-0000-00000000000a', '71000000-0000-0000-0000-0000000006a1', 'T2'),
  ('72000000-0000-0000-0000-0000000006e1', '20000000-0000-0000-0000-00000000000b', '71000000-0000-0000-0000-0000000006b1', 'U1');
insert into public.cylinders (id, organization_id, cylinder_type_id, serial_number, status, inactivation_reason) values
  ('72000000-0000-0000-0000-0000000006f3', '20000000-0000-0000-0000-00000000000a', '71000000-0000-0000-0000-0000000006a1', 'T3', 'inactive', 'lost');

create temp table ids as select
  '10000000-0000-0000-0000-000000000002'::uuid as a, '60000000-0000-0000-0000-0000000600a2'::uuid as sa,
  '10000000-0000-0000-0000-000000000003'::uuid as b, '60000000-0000-0000-0000-0000000600b3'::uuid as sb,
  '10000000-0000-0000-0000-0000000006a2'::uuid as t, '60000000-0000-0000-0000-0000000600a4'::uuid as st,
  '10000000-0000-0000-0000-0000000006a1'::uuid as e, '60000000-0000-0000-0000-0000000600a1'::uuid as se,
  '20000000-0000-0000-0000-00000000000a'::uuid as oa, '20000000-0000-0000-0000-00000000000b'::uuid as ob,
  '72000000-0000-0000-0000-0000000006f1'::uuid as t1, '72000000-0000-0000-0000-0000000006f2'::uuid as t2,
  '72000000-0000-0000-0000-0000000006f3'::uuid as t3, '72000000-0000-0000-0000-0000000006e1'::uuid as u1;

-- 1-8. Teste aprovado: entra no histórico, situação "em dia", auditoria.
create temp table r1 as select public.register_hydrostatic_test(t, st, oa, t1, current_date - 5, 'approved', 'L-100', ' Laboratório Alfa ', current_date + 180, 'ok') as r from ids;
select is((select r->>'code' from r1), 'OK', 'teste aprovado registrado pelo técnico (cylinder.test)');
select is((select r->>'hydro_status' from r1), 'em_dia', 'a resposta traz a situação "em dia" (próxima data a 180 dias)');
select is((select hydro_last_result || '/' || (hydro_next_due_on = current_date + 180) from public.cylinders where id = (select t1 from ids)), 'approved/true', 'o cilindro guarda o último resultado e a próxima data');
select is((select version from public.cylinders where id = (select t1 from ids)), 1::bigint, 'registrar teste não incrementa a versão do cadastro');
select is((select executor from public.cylinder_tests where id = (select (r->>'test_id')::uuid from r1)), 'Laboratório Alfa', 'o executor é aparado');
select is((select event_type from public.cylinder_events where cylinder_id = (select t1 from ids) order by sequence desc limit 1), 'hydrostatic_test_registered', 'evento hydrostatic_test_registered');
select is((select count(*)::int from public.audit_logs where action = 'cylinder.test_register' and result = 'success' and target_id = (select t1::text from ids)), 1, 'uma auditoria cylinder.test_register');
select is((select count(*)::int from public.cylinder_events e where e.cylinder_id = (select t1 from ids) and e.data->>'test_id' = (select r->>'test_id' from r1)), 1, 'o evento guarda o id do teste');

-- 9-14. Situação por datas: o teste de maior data de realização é o efetivo.
select is((select public.register_hydrostatic_test(t, st, oa, t2, current_date - 5, 'approved', null, 'Lab', current_date + 20, null)->>'hydro_status' from ids), 'a_vencer', 'próxima data a 20 dias: a vencer');
select is((select public.register_hydrostatic_test(t, st, oa, t2, current_date - 4, 'approved', null, 'Lab', current_date + 31, null)->>'hydro_status' from ids), 'em_dia', 'mais recente a 31 dias: em dia');
select is((select public.register_hydrostatic_test(t, st, oa, t2, current_date - 3, 'rejected', null, 'Lab', null, 'furo')->>'hydro_status' from ids), 'reprovado', 'reprovado: situação reprovado');
select is((select hydro_last_result || '/' || coalesce(hydro_next_due_on::text, 'nulo') from public.cylinders where id = (select t2 from ids)), 'rejected/nulo', 'reprovado zera a próxima data');
select is((select public.register_hydrostatic_test(t, st, oa, t2, current_date - 2, 'approved', null, 'Lab', current_date + 90, null)->>'hydro_status' from ids), 'em_dia', 'aprovado posterior substitui o reprovado');
select is((select public.register_hydrostatic_test(t, st, oa, t2, current_date - 400, 'approved', null, 'Lab', current_date - 30, null)->>'hydro_status' from ids), 'em_dia', 'um teste antigo registrado depois não derruba o mais recente');

-- 15-24. Validações com campos.
select is((select public.register_hydrostatic_test(t, st, oa, t1, current_date + 1, 'approved', null, 'Lab', current_date + 100, null)->'fields'->0->>'field' from ids), 'performed_on', 'data de realização futura: erro no campo');
select is((select public.register_hydrostatic_test(t, st, oa, t1, current_date - 1, 'approved', null, 'Lab', null, null)->'fields'->0->>'field' from ids), 'next_due_on', 'aprovado sem próxima data: erro no campo');
select is((select public.register_hydrostatic_test(t, st, oa, t1, current_date - 1, 'approved', null, 'Lab', current_date - 1, null)->'fields'->0->>'field' from ids), 'next_due_on', 'próxima data não posterior à realização: erro');
select is((select public.register_hydrostatic_test(t, st, oa, t1, current_date - 1, 'approved', null, 'Lab', current_date + 4000, null)->'fields'->0->>'field' from ids), 'next_due_on', 'próxima data a mais de 10 anos: erro');
select is((select public.register_hydrostatic_test(t, st, oa, t1, current_date - 1, 'passou', null, 'Lab', current_date + 10, null)->'fields'->0->>'field' from ids), 'result', 'resultado desconhecido: erro no campo');
select is((select public.register_hydrostatic_test(t, st, oa, t1, current_date - 1, 'approved', null, 'L', current_date + 10, null)->'fields'->0->>'field' from ids), 'executor', 'executor curto demais: erro no campo');
select is((select public.register_hydrostatic_test(t, st, oa, t1, current_date - 1, 'approved', repeat('9', 61), 'Lab', current_date + 10, null)->'fields'->0->>'field' from ids), 'report_number', 'laudo acima de 60 caracteres: erro no campo');
select is((select public.register_hydrostatic_test(t, st, oa, t1, current_date - 1, 'rejected', null, 'Lab', null, repeat('x', 501))->'fields'->0->>'field' from ids), 'notes', 'observações acima de 500: erro no campo');
select is((select count(*)::int from public.cylinder_tests where cylinder_id = (select t1 from ids)), 1, 'nenhuma validação recusada deixou registro');
select is((select public.register_hydrostatic_test(t, st, oa, t3, current_date - 1, 'approved', null, 'Lab', current_date + 100, null)->>'code' from ids), 'CYLINDER_INACTIVE', 'cilindro inativo não recebe teste');

-- 25-30. Autorização e isolamento.
select is((select public.register_hydrostatic_test(e, se, oa, t1, current_date - 1, 'approved', null, 'Lab', current_date + 100, null)->>'code' from ids), 'ACCESS_DENIED', 'estoquista sem cylinder.test: ACCESS_DENIED');
select is((select public.register_hydrostatic_test(b, sb, ob, t1, current_date - 1, 'approved', null, 'Lab', current_date + 100, null)->>'code' from ids), 'NOT_FOUND', 'B não registra teste em cilindro de A: NOT_FOUND');
select is((select public.register_hydrostatic_test(b, sb, oa, t1, current_date - 1, 'approved', null, 'Lab', current_date + 100, null)->>'code' from ids), 'ACCESS_DENIED', 'B pedindo o contexto de A: ACCESS_DENIED');
select is((select public.register_hydrostatic_test(t, '60000000-0000-0000-0000-0000deadbeef', oa, t1, current_date - 1, 'approved', null, 'Lab', current_date + 100, null)->>'code' from ids), 'AUTH_REQUIRED', 'sessão desconhecida: AUTH_REQUIRED');
select is((select public.register_hydrostatic_test(t, st, oa, '72000000-0000-0000-0000-00000000ffff', current_date - 1, 'approved', null, 'Lab', current_date + 100, null)->>'code' from ids), 'NOT_FOUND', 'cilindro inexistente: NOT_FOUND');
select is((select public.register_hydrostatic_test(a, sa, oa, t1, current_date - 1, 'approved', null, 'Lab', current_date + 100, null)->>'code' from ids), 'OK', 'administrador do tenant também registra');

-- 31-42. Retificação: nova linha que referencia o original; o original permanece.
create temp table orig as select (r->>'test_id')::uuid as id from r1;
create temp table ret as select public.rectify_hydrostatic_test(t, st, oa, (select id from orig), current_date - 5, 'approved', 'L-100', 'Laboratório Alfa', current_date + 360, 'data corrigida', 'Próxima data digitada errada') as r from ids;
select is((select r->>'code' from ret), 'OK', 'retificação registrada');
select is((select count(*)::int from public.cylinder_tests where id = (select id from orig)), 1, 'o original continua existindo');
select is((select rectifies_test_id from public.cylinder_tests where id = (select (r->>'test_id')::uuid from ret)), (select id from orig), 'a retificação referencia o original');
select is((select rectification_justification from public.cylinder_tests where id = (select (r->>'test_id')::uuid from ret)), 'Próxima data digitada errada', 'e guarda a justificativa');
select is((select hydro_next_due_on from public.cylinders where id = (select t1 from ids)), current_date + 100, 'o efetivo continua sendo o teste mais recente (feito depois, com próxima data a 100 dias)');
select is((select event_type from public.cylinder_events where cylinder_id = (select t1 from ids) order by sequence desc limit 1), 'hydrostatic_test_rectified', 'evento hydrostatic_test_rectified');
select is((select e.references_event_id is not null from public.cylinder_events e where e.cylinder_id = (select t1 from ids) and e.event_type = 'hydrostatic_test_rectified'), true, 'o evento referencia o evento anterior');
select is((select count(*)::int from public.audit_logs where action = 'cylinder.test_rectify' and result = 'success'), 1, 'uma auditoria cylinder.test_rectify');
select is((select public.rectify_hydrostatic_test(t, st, oa, (select id from orig), current_date - 5, 'approved', null, 'Lab', current_date + 100, null, 'tentando de novo')->>'code' from ids), 'VALIDATION_FAILED', 'retificar um registro já retificado é recusado');
select is((select public.rectify_hydrostatic_test(t, st, oa, (select (r->>'test_id')::uuid from ret), current_date - 5, 'approved', null, 'Lab', current_date + 100, null, 'abc')->>'code' from ids), 'JUSTIFICATION_REQUIRED', 'justificativa com menos de 5 caracteres é recusada');
select is((select public.rectify_hydrostatic_test(e, se, oa, (select (r->>'test_id')::uuid from ret), current_date - 5, 'approved', null, 'Lab', current_date + 100, null, 'sem permissão')->>'code' from ids), 'ACCESS_DENIED', 'estoquista não retifica');
select is((select public.rectify_hydrostatic_test(b, sb, ob, (select (r->>'test_id')::uuid from ret), current_date - 5, 'approved', null, 'Lab', current_date + 100, null, 'outro tenant')->>'code' from ids), 'NOT_FOUND', 'B não retifica teste de A: NOT_FOUND');

select * from finish(); rollback;
