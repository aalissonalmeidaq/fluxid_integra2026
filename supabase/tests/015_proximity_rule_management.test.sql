begin;
select plan(17);

-- Spec 015 (T041a; RF-009, RF-009a, princípio III): consultar e alterar a regra de proximidade. Alterar exige `proximity_rule.manage` e
-- justificativa, respeita as faixas, cria nova versão vigente sem reescrever comparações anteriores e audita valores anterior e novo.
-- Dois tenants. Hermético: rollback.

delete from public.user_sessions where user_id in ('10000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000003',
  '10000000-0000-0000-0000-000000000005');
insert into public.membership_roles (membership_id, role_id, assigned_by)
  select '30000000-0000-0000-0000-00000000000b', r.id, '10000000-0000-0000-0000-000000000001'
    from public.roles r where r.organization_id = '20000000-0000-0000-0000-00000000000b' and r.code = 'tenant_admin'
  on conflict do nothing;
-- O usuário 5 vira gestor logístico no A: lê a regra, mas não a altera.
delete from public.membership_roles where membership_id = '30000000-0000-0000-0000-000000000005';
insert into public.membership_roles (membership_id, role_id, assigned_by)
  select '30000000-0000-0000-0000-000000000005', r.id, '10000000-0000-0000-0000-000000000001'
    from public.roles r where r.organization_id = '20000000-0000-0000-0000-00000000000a' and r.code = 'logistics_manager';
select public.start_user_session('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000001540a2', 'aal1');
select public.start_user_session('10000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-0000001540b3', 'aal1');
select public.start_user_session('10000000-0000-0000-0000-000000000005', '60000000-0000-0000-0000-0000001540a5', 'aal1');

create function pg_temp.set_rule(p_user text, p_session text, p_org text, p_distance numeric, p_age integer, p_accuracy numeric, p_justification text,
  p_request uuid default gen_random_uuid()) returns jsonb language sql as $$
  select public.set_proximity_rule(('10000000-0000-0000-0000-00000000000' || p_user)::uuid, ('60000000-0000-0000-0000-0000001540' || p_session)::uuid,
    ('20000000-0000-0000-0000-00000000000' || p_org)::uuid, p_request, p_distance, p_age, p_accuracy, p_justification)
$$;
create function pg_temp.get_rule(p_user text, p_session text, p_org text) returns jsonb language sql as $$
  select public.get_proximity_rule(('10000000-0000-0000-0000-00000000000' || p_user)::uuid, ('60000000-0000-0000-0000-0000001540' || p_session)::uuid,
    ('20000000-0000-0000-0000-00000000000' || p_org)::uuid)
$$;

-- 1. Fronteira e leitura.
select ok(not has_function_privilege('authenticated', 'public.set_proximity_rule(uuid, uuid, uuid, uuid, numeric, integer, numeric, text)', 'execute'),
  'authenticated não altera a regra direto');
select is(pg_temp.get_rule('5', 'a5', 'a')->'rule'->>'version', '0', 'gestor lê o padrão (versão 0)');
select is((pg_temp.get_rule('5', 'a5', 'a')->'rule'->>'distance_m')::numeric, 100::numeric, 'padrão de 100 m');

-- 2. Autorização e validação.
select is(pg_temp.set_rule('5', 'a5', 'a', 200, 120, 50, 'Rota rural com sinal fraco.')->>'code', 'ACCESS_DENIED', 'gestor não altera a regra');
select is(pg_temp.set_rule('2', 'a2', 'b', 200, 120, 50, 'Rota rural com sinal fraco.')->>'code', 'ACCESS_DENIED', 'admin A não altera a regra do B');
select is(pg_temp.set_rule('2', 'a2', 'a', 501, 120, 50, 'Rota rural com sinal fraco.')->>'code', 'VALIDATION_FAILED', 'distância fora da faixa');
select is(pg_temp.set_rule('2', 'a2', 'a', 200, 59, 50, 'Rota rural com sinal fraco.')->>'code', 'VALIDATION_FAILED', 'idade fora da faixa');
select is(pg_temp.set_rule('2', 'a2', 'a', 200, 120, 101, 'Rota rural com sinal fraco.')->>'code', 'VALIDATION_FAILED', 'precisão fora da faixa');
select is(pg_temp.set_rule('2', 'a2', 'a', 200, 120, 50, 'curta')->>'code', 'JUSTIFICATION_REQUIRED', 'justificativa curta recusada');

-- 3. Alteração: nova versão, a anterior fechada, auditoria com valores anterior e novo.
select is(pg_temp.set_rule('2', 'a2', 'a', 200, 180, 40, 'Rota rural com sinal fraco.', 'c1540000-0000-0000-0000-000000000001')->>'code', 'UPDATED',
  'admin A altera a regra');
select is((select version || ':' || distance_threshold_m || ':' || max_age_seconds || ':' || max_accuracy_m from public.proximity_rules
  where organization_id = '20000000-0000-0000-0000-00000000000a' and valid_until is null), '1:200.0:180:40.0', 'versão 1 vigente com os novos limites');
select is(pg_temp.set_rule('2', 'a2', 'a', 200, 180, 40, 'Rota rural com sinal fraco.', 'c1540000-0000-0000-0000-000000000001')->'rule'->>'version', '1',
  'repetir o pedido não cria outra versão');
select is(pg_temp.set_rule('2', 'a2', 'a', 300, 180, 40, 'Ajuste depois do teste de campo.')->'rule'->>'version', '2', 'nova alteração: versão 2');
select is((select count(*)::int from public.proximity_rules where organization_id = '20000000-0000-0000-0000-00000000000a' and valid_until is not null), 1,
  'a versão anterior é fechada, não apagada');
select is((select metadata->'previous'->>'distance_m' || '>' || (metadata->'current'->>'distance_m') from public.audit_logs
  where action = 'tracking.rule_update' and organization_id = '20000000-0000-0000-0000-00000000000a' order by id desc limit 1), '200.0>300.0',
  'auditoria guarda o valor anterior e o novo');
select ok((select justification = 'Ajuste depois do teste de campo.' from public.audit_logs where action = 'tracking.rule_update' order by id desc limit 1),
  'auditoria guarda a justificativa');

-- 4. O B continua com o padrão.
select is(pg_temp.get_rule('3', 'b3', 'b')->'rule'->>'version', '0', 'a regra do A não afeta o B');

select * from finish();
rollback;
