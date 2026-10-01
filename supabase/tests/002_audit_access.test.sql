begin;
select plan(44);

-- Hermético: sessões e massa desta suíte são desfeitas pelo rollback.
delete from public.user_sessions where user_id in (
  '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000003');
delete from public.audit_logs where false;

insert into auth.users (id, aud, role, email) values
  ('10000000-0000-0000-0000-0000000000d1', 'authenticated', 'authenticated', 'audit-reader-a@example.invalid'),
  ('10000000-0000-0000-0000-0000000000d2', 'authenticated', 'authenticated', 'audit-plain-a@example.invalid'),
  ('10000000-0000-0000-0000-0000000000d3', 'authenticated', 'authenticated', 'audit-admin-fluxid@example.invalid');
insert into public.profiles (user_id, display_name) values
  ('10000000-0000-0000-0000-0000000000d1', 'Leitora de Auditoria'),
  ('10000000-0000-0000-0000-0000000000d2', 'Membro Comum'),
  ('10000000-0000-0000-0000-0000000000d3', 'Administrador FluxID');
insert into public.memberships (id, organization_id, user_id, status, activated_at) values
  ('30000000-0000-0000-0000-0000000000d1', '20000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-0000000000d1', 'active', now()),
  ('30000000-0000-0000-0000-0000000000d2', '20000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-0000000000d2', 'active', now()),
  ('30000000-0000-0000-0000-0000000000d3', '20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-0000000000d3', 'active', now());

-- Papel personalizado com audit.read e tenant.manage no Tenant A; Administrador FluxID (papel global) no proprietário.
insert into public.roles (id, organization_id, code, name, scope, system) values
  ('50000000-0000-0000-0000-0000000000d1', '20000000-0000-0000-0000-00000000000a', 'auditor_a', 'Auditor A', 'tenant', false);
insert into public.role_permissions (role_id, permission_id)
  select '50000000-0000-0000-0000-0000000000d1', id from public.permissions where code in ('audit.read', 'tenant.manage');
insert into public.membership_roles (membership_id, role_id, assigned_by) values
  ('30000000-0000-0000-0000-0000000000d1', '50000000-0000-0000-0000-0000000000d1', '10000000-0000-0000-0000-000000000002'),
  ('30000000-0000-0000-0000-0000000000d3', '50000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001');

-- No seed o Tenant B não tem administrador atribuído; aqui o administrador B recebe o papel oficial do próprio tenant.
insert into public.membership_roles (membership_id, role_id, assigned_by)
  select '30000000-0000-0000-0000-00000000000b', r.id, '10000000-0000-0000-0000-000000000003'
    from public.roles r where r.organization_id = '20000000-0000-0000-0000-00000000000b' and r.code = 'tenant_admin';

select public.start_user_session('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000da0a2', 'aal1');
select public.start_user_session('10000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-0000000da0a3', 'aal1');
select public.start_user_session('10000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-0000000da0a1', 'aal2');
select public.start_user_session('10000000-0000-0000-0000-0000000000d1', '60000000-0000-0000-0000-0000000da0d1', 'aal1');
select public.start_user_session('10000000-0000-0000-0000-0000000000d2', '60000000-0000-0000-0000-0000000da0d2', 'aal1');
select public.start_user_session('10000000-0000-0000-0000-0000000000d3', '60000000-0000-0000-0000-0000000da0d3', 'aal2');

-- Massa de eventos: cinco no Tenant A (dois com o mesmo instante), dois no B e um global.
insert into public.audit_logs (organization_id, actor_user_id, action, target_type, target_id, result, reason_code, occurred_at, metadata) values
  ('20000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-000000000002', 'role.create', 'role', 'r1', 'success', null, '2026-01-01T10:00:00Z', '{"permissions":["audit.read"],"secret_note":"nao-publicar"}'),
  ('20000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-000000000002', 'role.assign', 'membership', 'm1', 'success', null, '2026-01-02T10:00:00Z', '{}'),
  ('20000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-0000000000d2', 'invitation.send', 'invitation', 'i1', 'denied', 'permission_denied', '2026-01-03T10:00:00Z', '{}'),
  ('20000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-000000000002', 'membership.status.change', 'membership', 'm2', 'success', null, '2026-01-04T10:00:00Z', '{"status":"blocked"}'),
  ('20000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-000000000002', 'membership.status.change', 'membership', 'm3', 'failed', 'internal_error', '2026-01-04T10:00:00Z', '{}'),
  ('20000000-0000-0000-0000-00000000000b', '10000000-0000-0000-0000-000000000003', 'role.create', 'role', 'rb', 'success', null, '2026-01-05T10:00:00Z', '{}'),
  ('20000000-0000-0000-0000-00000000000b', '10000000-0000-0000-0000-000000000003', 'invitation.send', 'invitation', 'ib', 'success', null, '2026-01-06T10:00:00Z', '{}'),
  (null, '10000000-0000-0000-0000-000000000001', 'organization.create', 'organization', 'org', 'success', null, '2026-01-07T10:00:00Z', '{}');

create temp table page1 on commit drop as
  select public.query_audit_events('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000da0a2', 'tenant',
    '20000000-0000-0000-0000-00000000000a', '2026-01-01T00:00:00Z', '2026-01-31T23:59:59Z', null, null, null, null, null, null, 1) as result;

-- 1-4. Consulta do tenant: somente eventos do tenant ativo, mais recentes primeiro.
select is((select result->>'kind' from page1), 'listed', 'administrador A consulta a auditoria do próprio tenant');
select is(
  (public.query_audit_events('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000da0a2', 'tenant',
    '20000000-0000-0000-0000-00000000000a', '2026-01-01T00:00:00Z', '2026-01-31T23:59:59Z', null, null, null, null, null, null, 100)->'events')::jsonb @> '[{"target_id":"r1"}]'::jsonb,
  true, 'inclui eventos do próprio tenant');
select is(
  (select count(*)::int from jsonb_array_elements(public.query_audit_events('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000da0a2', 'tenant',
    '20000000-0000-0000-0000-00000000000a', '2026-01-01T00:00:00Z', '2026-01-31T23:59:59Z', null, null, null, null, null, null, 100)->'events') e
    where e->>'organization_id' is distinct from '20000000-0000-0000-0000-00000000000a'),
  0, 'não inclui eventos de outro tenant nem globais');
select is((select result->'events'->0->>'target_id' from page1), 'm3', 'o evento mais recente vem primeiro (empate no instante desempatado pelo id)');

-- 5-8. Paginação por (occurred_at, id): a página de um item atravessa o empate de instante sem repetir nem pular.
select is((select jsonb_array_length(result->'events') from page1), 1, 'a página respeita o limite');
select ok((select result->'next' is not null and result->'next'->>'occurred_at' is not null and result->'next'->>'id' is not null from page1), 'devolve o cursor da próxima página');
create temp table page2 on commit drop as
  select public.query_audit_events('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000da0a2', 'tenant',
    '20000000-0000-0000-0000-00000000000a', '2026-01-01T00:00:00Z', '2026-01-31T23:59:59Z', null, null, null, null,
    ((select result from page1)->'next'->>'occurred_at')::timestamptz, ((select result from page1)->'next'->>'id')::bigint, 1) as result;
select is((select result->'events'->0->>'target_id' from page2), 'm2', 'a segunda página traz o evento do mesmo instante, sem repetir nem pular');
create temp table page3 on commit drop as
  select public.query_audit_events('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000da0a2', 'tenant',
    '20000000-0000-0000-0000-00000000000a', '2026-01-01T00:00:00Z', '2026-01-31T23:59:59Z', null, null, null, null,
    ((select result from page2)->'next'->>'occurred_at')::timestamptz, ((select result from page2)->'next'->>'id')::bigint, 10) as result;
select ok((select jsonb_array_length(result->'events') = 3 and result->'events'->2->>'target_id' = 'r1' and result->'next' = 'null'::jsonb from page3), 'a última página termina sem cursor');
-- 9-13. Filtros restritos ao escopo autorizado.
select is((select jsonb_array_length(public.query_audit_events('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000da0a2', 'tenant', '20000000-0000-0000-0000-00000000000a', '2026-01-01T00:00:00Z', '2026-01-31T23:59:59Z', 'membership.status.change', null, null, null, null, null, 100)->'events')), 2, 'filtra por ação');
select is((select jsonb_array_length(public.query_audit_events('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000da0a2', 'tenant', '20000000-0000-0000-0000-00000000000a', '2026-01-01T00:00:00Z', '2026-01-31T23:59:59Z', null, 'denied', null, null, null, null, 100)->'events')), 1, 'filtra por resultado');
select is((select jsonb_array_length(public.query_audit_events('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000da0a2', 'tenant', '20000000-0000-0000-0000-00000000000a', '2026-01-01T00:00:00Z', '2026-01-31T23:59:59Z', null, null, '10000000-0000-0000-0000-0000000000d2', null, null, null, 100)->'events')), 1, 'filtra por ator');
select is((select jsonb_array_length(public.query_audit_events('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000da0a2', 'tenant', '20000000-0000-0000-0000-00000000000a', '2026-01-02T00:00:00Z', '2026-01-03T23:59:59Z', null, null, null, null, null, null, 100)->'events')), 2, 'filtra por período');
select is((select jsonb_array_length(public.query_audit_events('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000da0a2', 'tenant', '20000000-0000-0000-0000-00000000000a', '2026-01-01T00:00:00Z', '2026-01-31T23:59:59Z', null, null, null, 'invitation', null, null, 100)->'events')), 1, 'filtra por tipo de alvo');

-- 14-17. Entradas inválidas e sanitização.
select is(public.query_audit_events('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000da0a2', 'tenant', '20000000-0000-0000-0000-00000000000a', '2026-01-01T00:00:00Z', '2026-01-31T23:59:59Z', null, 'quebrado', null, null, null, null, 10)->>'kind', 'invalid', 'resultado fora da lista é recusado');
select is(public.query_audit_events('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000da0a2', 'tenant', '20000000-0000-0000-0000-00000000000a', '2026-01-01T00:00:00Z', '2026-01-31T23:59:59Z', 'acao com espaço; drop', null, null, null, null, null, 10)->>'kind', 'invalid', 'ação fora do padrão é recusada');
select is(public.query_audit_events('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000da0a2', 'tenant', null, null, null, null, null, null, null, null, null, 10)->>'kind', 'invalid', 'escopo de tenant exige a organização');
select ok(
  (select bool_and(not (e->'metadata' ? 'secret_note') and e ? 'origin' and not (e::text ~* 'password|token'))
     from jsonb_array_elements(public.query_audit_events('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000da0a2', 'tenant', '20000000-0000-0000-0000-00000000000a', '2026-01-01T00:00:00Z', '2026-01-31T23:59:59Z', null, null, null, null, null, null, 100)->'events') e),
  'os metadados passam por allowlist e o evento informa a origem técnica');

-- 18-23. Escopo e autorização: cada tenant só vê o próprio, e a permissão é a atual.
select is(public.query_audit_events('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000da0a2', 'tenant', '20000000-0000-0000-0000-00000000000b', '2026-01-01T00:00:00Z', '2026-01-31T23:59:59Z', null, null, null, null, null, null, 10)->>'kind', 'access_denied', 'administrador A não consulta o Tenant B');
select is(public.query_audit_events('10000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-0000000da0a3', 'tenant', '20000000-0000-0000-0000-00000000000a', '2026-01-01T00:00:00Z', '2026-01-31T23:59:59Z', null, null, null, null, null, null, 10)->>'kind', 'access_denied', 'administrador B não consulta o Tenant A');
select is((select jsonb_array_length(public.query_audit_events('10000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-0000000da0a3', 'tenant', '20000000-0000-0000-0000-00000000000b', '2026-01-01T00:00:00Z', '2026-01-31T23:59:59Z', null, null, null, null, null, null, 100)->'events')), 2, 'administrador B vê somente os eventos do Tenant B');
select is(public.query_audit_events('10000000-0000-0000-0000-0000000000d2', '60000000-0000-0000-0000-0000000da0d2', 'tenant', '20000000-0000-0000-0000-00000000000a', '2026-01-01T00:00:00Z', '2026-01-31T23:59:59Z', null, null, null, null, null, null, 10)->>'kind', 'access_denied', 'sem audit.read a consulta é negada');
select is(public.query_audit_events('10000000-0000-0000-0000-0000000000d1', '60000000-0000-0000-0000-0000000da0d1', 'tenant', '20000000-0000-0000-0000-00000000000a', '2026-01-01T00:00:00Z', '2026-01-31T23:59:59Z', null, null, null, null, null, null, 10)->>'kind', 'listed', 'papel personalizado com audit.read consulta o tenant');
select is(public.query_audit_events('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000da0d1', 'tenant', '20000000-0000-0000-0000-00000000000a', '2026-01-01T00:00:00Z', '2026-01-31T23:59:59Z', null, null, null, null, null, null, 10)->>'kind', 'access_denied', 'a sessão de outro usuário não autoriza a consulta');

-- 24-28. A permissão vale imediatamente: papel inativo, vínculo bloqueado, tenant suspenso, sessão revogada.
update public.roles set active = false where id = '50000000-0000-0000-0000-0000000000d1';
select is(public.query_audit_events('10000000-0000-0000-0000-0000000000d1', '60000000-0000-0000-0000-0000000da0d1', 'tenant', '20000000-0000-0000-0000-00000000000a', '2026-01-01T00:00:00Z', '2026-01-31T23:59:59Z', null, null, null, null, null, null, 10)->>'kind', 'access_denied', 'papel inativado deixa de conceder audit.read');
select is(public.tenant_actor_authorized('10000000-0000-0000-0000-0000000000d1', '60000000-0000-0000-0000-0000000da0d1', '20000000-0000-0000-0000-00000000000a'), false, 'papel inativado deixa de conceder tenant.manage');
update public.roles set active = true where id = '50000000-0000-0000-0000-0000000000d1';
update public.memberships set status = 'blocked' where id = '30000000-0000-0000-0000-0000000000d1';
select is(public.query_audit_events('10000000-0000-0000-0000-0000000000d1', '60000000-0000-0000-0000-0000000da0d1', 'tenant', '20000000-0000-0000-0000-00000000000a', '2026-01-01T00:00:00Z', '2026-01-31T23:59:59Z', null, null, null, null, null, null, 10)->>'kind', 'access_denied', 'vínculo bloqueado nega a consulta');
update public.memberships set status = 'active' where id = '30000000-0000-0000-0000-0000000000d1';
select public.end_user_session('10000000-0000-0000-0000-0000000000d1', '60000000-0000-0000-0000-0000000da0d1', 'user_revoked');
select is(public.query_audit_events('10000000-0000-0000-0000-0000000000d1', '60000000-0000-0000-0000-0000000da0d1', 'tenant', '20000000-0000-0000-0000-00000000000a', '2026-01-01T00:00:00Z', '2026-01-31T23:59:59Z', null, null, null, null, null, null, 10)->>'kind', 'access_denied', 'sessão revogada nega a consulta');
update public.organizations set status = 'suspended' where id = '20000000-0000-0000-0000-00000000000b';
select is(public.query_audit_events('10000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-0000000da0a3', 'tenant', '20000000-0000-0000-0000-00000000000b', '2026-01-01T00:00:00Z', '2026-01-31T23:59:59Z', null, null, null, null, null, null, 10)->>'kind', 'access_denied', 'tenant suspenso nega a consulta');
update public.organizations set status = 'active' where id = '20000000-0000-0000-0000-00000000000b';

-- 29-33. Consulta global: Master e Administrador FluxID; nunca um administrador de tenant; a consulta é auditada.
select is(public.query_audit_events('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000da0a2', 'global', null, null, null, null, null, null, null, null, null, 10)->>'kind', 'access_denied', 'audit.read de tenant não concede consulta global');
create temp table global_master on commit drop as
  select public.query_audit_events('10000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-0000000da0a1', 'global', null, '2026-01-01T00:00:00Z', '2026-01-31T23:59:59Z', null, null, null, null, null, null, 100) as result;
select is((select result->>'kind' from global_master), 'listed', 'Master consulta a auditoria global');
select ok((select bool_or(e->>'organization_id' = '20000000-0000-0000-0000-00000000000a') and bool_or(e->>'organization_id' = '20000000-0000-0000-0000-00000000000b') and bool_or(e->'organization_id' = 'null'::jsonb) from jsonb_array_elements((select result->'events' from global_master)) e), 'a consulta global inclui todos os tenants e os eventos globais');
select is(public.query_audit_events('10000000-0000-0000-0000-0000000000d3', '60000000-0000-0000-0000-0000000da0d3', 'global', null, null, null, null, null, null, null, null, null, 10)->>'kind', 'listed', 'Administrador FluxID consulta a auditoria global');
select ok(exists(select 1 from public.audit_logs where action = 'audit.query.global' and actor_user_id = '10000000-0000-0000-0000-000000000001' and result = 'success'), 'a consulta global é auditada');

-- 34-39. A trilha continua imutável e sem permissão de escrita para a aplicação.
create function public.tap_act_as(uid uuid, sid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated', 'session_id', sid, 'aal', 'aal1')::text, true);
end;
$$;
grant execute on function public.tap_act_as(uuid, uuid) to authenticated, anon;
create function public.tap_rows(command text) returns integer language plpgsql as $$
declare affected integer;
begin
  execute command;
  get diagnostics affected = row_count;
  return affected;
end;
$$;
grant execute on function public.tap_rows(text) to authenticated, anon;

set local role authenticated;
select public.tap_act_as('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000da0a2');
select ok((select count(*)::int from public.audit_logs) > 0, 'audit.read concede leitura da auditoria do próprio tenant pela Data API');
select is((select count(*)::int from public.audit_logs where organization_id = '20000000-0000-0000-0000-00000000000b'), 0, 'a Data API não entrega eventos de outro tenant');
select throws_ok($$ update public.audit_logs set result = 'success' $$, '42501', null, 'a aplicação não altera a auditoria');
select throws_ok($$ delete from public.audit_logs $$, '42501', null, 'a aplicação não exclui a auditoria');
select throws_ok($$ insert into public.audit_logs (action, target_type, result) values ('x', 'y', 'success') $$, '42501', null, 'a aplicação não escreve auditoria diretamente');
reset role;
select throws_ok($$ delete from public.audit_logs where action = 'role.create' $$, null, 'audit_immutable', 'nem o dono do banco exclui eventos recentes sem a rotina de retenção');

-- 40-44. Papel inativo também deixa de valer na RLS; execução restrita ao service_role; origem padrão.
update public.roles set active = false where id = '50000000-0000-0000-0000-0000000000d1';
select public.start_user_session('10000000-0000-0000-0000-0000000000d1', '60000000-0000-0000-0000-0000000da0e1', 'aal1');
set local role authenticated;
select public.tap_act_as('10000000-0000-0000-0000-0000000000d1', '60000000-0000-0000-0000-0000000da0e1');
select is((select count(*)::int from public.audit_logs), 0, 'papel inativado deixa de conceder leitura também pela RLS');
reset role;
update public.roles set active = true where id = '50000000-0000-0000-0000-0000000000d1';
set local role authenticated;
select public.tap_act_as('10000000-0000-0000-0000-0000000000d1', '60000000-0000-0000-0000-0000000da0e1');
select ok((select count(*)::int from public.audit_logs) > 0, 'papel reativado volta a conceder leitura');
reset role;
select is((select origin from public.audit_logs where action = 'role.create' and organization_id = '20000000-0000-0000-0000-00000000000a' and target_id = 'r1'), 'database', 'a origem técnica tem valor padrão');
select ok(
  not has_function_privilege('authenticated', 'public.query_audit_events(uuid,uuid,text,uuid,timestamptz,timestamptz,text,text,uuid,text,timestamptz,bigint,integer)', 'execute')
  and not has_function_privilege('anon', 'public.query_audit_events(uuid,uuid,text,uuid,timestamptz,timestamptz,text,text,uuid,text,timestamptz,bigint,integer)', 'execute')
  and has_function_privilege('service_role', 'public.query_audit_events(uuid,uuid,text,uuid,timestamptz,timestamptz,text,text,uuid,text,timestamptz,bigint,integer)', 'execute'),
  'consulta exclusiva do service_role');
select ok(not has_function_privilege('authenticated', 'private.actor_has_permission(uuid,uuid,uuid,text)', 'execute'), 'o helper de autorização não é executável pela aplicação');

select * from finish();
rollback;
