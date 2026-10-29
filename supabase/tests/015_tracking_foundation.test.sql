begin;
select plan(26);

-- Spec 015 (T010; RF-036, RF-037, RF-023, princípio III): fundação do rastreamento. Prova sessão, permissão independente, isolamento
-- entre o Tenant A e o Tenant B, helpers privados `security definer set search_path = ''` fora do alcance do cliente, escrita direta
-- negada no catálogo e auditoria sem coordenadas. Hermético: rollback.

delete from public.user_sessions where user_id in ('10000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000003',
  '10000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000005');
-- O usuário 3 administra o Tenant B; o usuário 5 passa a ser só gestor logístico no Tenant A.
insert into public.membership_roles (membership_id, role_id, assigned_by)
  select '30000000-0000-0000-0000-00000000000b', r.id, '10000000-0000-0000-0000-000000000001'
    from public.roles r where r.organization_id = '20000000-0000-0000-0000-00000000000b' and r.code = 'tenant_admin'
  on conflict do nothing;
delete from public.membership_roles where membership_id = '30000000-0000-0000-0000-000000000005';
insert into public.membership_roles (membership_id, role_id, assigned_by)
  select '30000000-0000-0000-0000-000000000005', r.id, '10000000-0000-0000-0000-000000000001'
    from public.roles r where r.organization_id = '20000000-0000-0000-0000-00000000000a' and r.code = 'logistics_manager';
select public.start_user_session('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000001500a2', 'aal1');
select public.start_user_session('10000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-0000001500b3', 'aal1');
select public.start_user_session('10000000-0000-0000-0000-000000000004', '60000000-0000-0000-0000-0000001500a4', 'aal1');
select public.start_user_session('10000000-0000-0000-0000-000000000005', '60000000-0000-0000-0000-0000001500a5', 'aal1');

create function pg_temp.auth(p_user text, p_session text, p_org text, p_permission text) returns text language sql as $$
  select private.tracking_authorize(('10000000-0000-0000-0000-00000000000' || p_user)::uuid,
    ('60000000-0000-0000-0000-0000001500' || p_session)::uuid, ('20000000-0000-0000-0000-00000000000' || p_org)::uuid, p_permission)
$$;

-- Helpers privados: definer, search_path vazio e nenhum privilégio para o cliente.
select ok((select bool_and(p.prosecdef and p.proconfig @> array['search_path=""'])
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'private' and p.proname in ('tracking_authorize', 'tracking_sanitize', 'tracking_audit')),
  'os helpers são security definer com search_path vazio');
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'private' and p.proname in ('tracking_authorize', 'tracking_sanitize', 'tracking_audit')), 3, 'os três helpers existem');
select ok(not has_function_privilege('authenticated', 'private.tracking_authorize(uuid, uuid, uuid, text)', 'execute'),
  'authenticated não executa tracking_authorize');
select ok(not has_function_privilege('anon', 'private.tracking_audit(uuid, uuid, uuid, text, text, text, text, text, text, jsonb)', 'execute'),
  'anon não executa tracking_audit');

-- Sessão: sem sessão ativa, nada é autorizado.
select is(private.tracking_authorize('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000001500ff',
  '20000000-0000-0000-0000-00000000000a', 'tracking.read'), 'AUTH_REQUIRED', 'sessão inexistente: AUTH_REQUIRED');
update public.user_sessions set status = 'revoked' where session_id = '60000000-0000-0000-0000-0000001500a4';
select is(pg_temp.auth('4', 'a4', 'a', 'tracking.read'), 'AUTH_REQUIRED', 'sessão revogada: AUTH_REQUIRED');

-- Administrador: as quatro permissões na própria empresa e nenhuma na outra (dois tenants).
select is(pg_temp.auth('2', 'a2', 'a', 'tracking.read'), null, 'admin A: tracking.read no A');
select is(pg_temp.auth('2', 'a2', 'a', 'report.export'), null, 'admin A: report.export no A');
select is(pg_temp.auth('2', 'a2', 'a', 'notification_category.manage'), null, 'admin A: notification_category.manage no A');
select is(pg_temp.auth('2', 'a2', 'a', 'proximity_rule.manage'), null, 'admin A: proximity_rule.manage no A');
select is(pg_temp.auth('2', 'a2', 'b', 'tracking.read'), 'ACCESS_DENIED', 'admin A: nada no B');
select is(pg_temp.auth('3', 'b3', 'b', 'tracking.read'), null, 'admin B: tracking.read no B');
select is(pg_temp.auth('3', 'b3', 'a', 'tracking.read'), 'ACCESS_DENIED', 'admin B: nada no A');
select is(pg_temp.auth('3', 'b3', 'a', 'report.export'), 'ACCESS_DENIED', 'admin B: não exporta do A');

-- Gestor logístico: consulta e exporta, mas não administra avisos nem a regra (sem implicação entre permissões).
select is(pg_temp.auth('5', 'a5', 'a', 'tracking.read'), null, 'gestor: tracking.read');
select is(pg_temp.auth('5', 'a5', 'a', 'report.export'), null, 'gestor: report.export');
select is(pg_temp.auth('5', 'a5', 'a', 'notification_category.manage'), 'ACCESS_DENIED', 'gestor: sem notification_category.manage');
select is(pg_temp.auth('5', 'a5', 'a', 'proximity_rule.manage'), 'ACCESS_DENIED', 'gestor: sem proximity_rule.manage');

-- Uma permissão não traz as outras: um papel personalizado só com report.export exporta, mas não consulta o rastreamento.
insert into public.roles (id, organization_id, code, name, description, scope, system) values
  ('50000000-0000-0000-0000-0000000015e1', '20000000-0000-0000-0000-00000000000a', 'exportador_015', 'Exportador', 'Só exporta', 'tenant', false);
insert into public.role_permissions (role_id, permission_id)
  select '50000000-0000-0000-0000-0000000015e1', p.id from public.permissions p where p.code = 'report.export';
delete from public.membership_roles where membership_id = '30000000-0000-0000-0000-000000000005';
insert into public.membership_roles (membership_id, role_id, assigned_by)
  values ('30000000-0000-0000-0000-000000000005', '50000000-0000-0000-0000-0000000015e1', '10000000-0000-0000-0000-000000000001');
select is(pg_temp.auth('5', 'a5', 'a', 'tracking.read'), 'ACCESS_DENIED', 'só report.export: tracking.read negado');
select is(pg_temp.auth('5', 'a5', 'a', 'report.export'), null, 'só report.export: exporta');

-- Sanitização: chaves de localização somem em qualquer nível; o resto permanece.
select is(private.tracking_sanitize('{"trip_id":"t1","lat":-7.2,"lng":-39.3,"nested":{"latitude":1,"longitude":2,"count":3},
  "items":[{"point":"POINT(1 2)","address":"Rua X","kind":"gap"}]}'::jsonb),
  '{"trip_id":"t1","nested":{"count":3},"items":[{"kind":"gap"}]}'::jsonb, 'remove coordenadas, ponto e endereço, inclusive aninhados');

-- Auditoria: grava ação e resultado com metadados sanitizados.
select ok(private.tracking_audit('20000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-000000000002',
  '60000000-0000-0000-0000-0000001500a2', 'tracking.test', 'trip', 'tap-015', 'success', null, null,
  '{"filters":{"trip_id":"x"},"lat":1,"lng":2,"coordinates":[1,2]}'::jsonb) > 0, 'tracking_audit devolve o id do registro');
select is((select metadata from public.audit_logs where action = 'tracking.test' and target_id = 'tap-015'),
  '{"filters":{"trip_id":"x"}}'::jsonb, 'a auditoria não guarda coordenadas');

-- Escrita direta negada: o cliente não se concede permissão nem cria permissão nova.
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '10000000-0000-0000-0000-000000000005', 'role', 'authenticated',
  'session_id', '60000000-0000-0000-0000-0000001500a5', 'aal', 'aal1')::text, true);
select throws_ok($$insert into public.role_permissions (role_id, permission_id) select r.id, p.id from public.roles r, public.permissions p
  where r.code = 'logistics_manager' and r.organization_id = '20000000-0000-0000-0000-00000000000a' and p.code = 'proximity_rule.manage'$$,
  '42501', null, 'authenticated não insere em role_permissions');
select throws_ok($$insert into public.permissions (code, description, scope, delegability) values ('tracking.write', 'x', 'tenant', 'tenant_delegable')$$,
  '42501', null, 'authenticated não cria permissão');
select throws_ok($$select private.tracking_authorize('10000000-0000-0000-0000-000000000005', '60000000-0000-0000-0000-0000001500a5',
  '20000000-0000-0000-0000-00000000000a', 'tracking.read')$$, '42501', null, 'authenticated não chama o helper privado');
reset role;

select * from finish();
rollback;
