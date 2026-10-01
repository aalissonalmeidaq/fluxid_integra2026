begin;
select plan(27);

-- Hermético: sessões e massa desta suíte são desfeitas pelo rollback.
delete from public.user_sessions where user_id in (
  '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000003',
  '10000000-0000-0000-0000-000000000004');

insert into auth.users (id, aud, role, email) values
  ('10000000-0000-0000-0000-0000000000e1', 'authenticated', 'authenticated', 'perm-dual@example.invalid'),
  ('10000000-0000-0000-0000-0000000000e2', 'authenticated', 'authenticated', 'perm-admin-fluxid@example.invalid'),
  ('10000000-0000-0000-0000-0000000000e3', 'authenticated', 'authenticated', 'perm-blocked@example.invalid');
insert into public.profiles (user_id, display_name) values
  ('10000000-0000-0000-0000-0000000000e1', 'Pessoa Dupla'),
  ('10000000-0000-0000-0000-0000000000e2', 'Administrador FluxID'),
  ('10000000-0000-0000-0000-0000000000e3', 'Vínculo Bloqueado');

-- e1: administradora no Tenant A e operadora técnica no Tenant B. e2: Administrador FluxID. e3: administrador com vínculo bloqueado.
insert into public.memberships (id, organization_id, user_id, status, activated_at) values
  ('30000000-0000-0000-0000-0000000000e1', '20000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-0000000000e1', 'active', now()),
  ('30000000-0000-0000-0000-0000000000e2', '20000000-0000-0000-0000-00000000000b', '10000000-0000-0000-0000-0000000000e1', 'active', now()),
  ('30000000-0000-0000-0000-0000000000e3', '20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-0000000000e2', 'active', now()),
  ('30000000-0000-0000-0000-0000000000e4', '20000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-0000000000e3', 'active', now());

insert into public.membership_roles (membership_id, role_id, assigned_by)
  select '30000000-0000-0000-0000-0000000000e1', r.id, '10000000-0000-0000-0000-000000000001'
    from public.roles r where r.organization_id = '20000000-0000-0000-0000-00000000000a' and r.code = 'tenant_admin';
insert into public.membership_roles (membership_id, role_id, assigned_by)
  select '30000000-0000-0000-0000-0000000000e2', r.id, '10000000-0000-0000-0000-000000000001'
    from public.roles r where r.organization_id = '20000000-0000-0000-0000-00000000000b' and r.code = 'technical_operator';
insert into public.membership_roles (membership_id, role_id, assigned_by) values
  ('30000000-0000-0000-0000-0000000000e3', '50000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001');
insert into public.membership_roles (membership_id, role_id, assigned_by)
  select '30000000-0000-0000-0000-0000000000e4', r.id, '10000000-0000-0000-0000-000000000001'
    from public.roles r where r.organization_id = '20000000-0000-0000-0000-00000000000a' and r.code = 'tenant_admin';
update public.memberships set status = 'blocked' where id = '30000000-0000-0000-0000-0000000000e4';

select public.start_user_session('10000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-0000000e0001', 'aal2');
select public.start_user_session('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000e0002', 'aal1');
select public.start_user_session('10000000-0000-0000-0000-000000000004', '60000000-0000-0000-0000-0000000e0004', 'aal1');
select public.start_user_session('10000000-0000-0000-0000-0000000000e1', '60000000-0000-0000-0000-0000000e00e1', 'aal1');
select public.start_user_session('10000000-0000-0000-0000-0000000000e2', '60000000-0000-0000-0000-0000000e00e2', 'aal2');
select public.start_user_session('10000000-0000-0000-0000-0000000000e3', '60000000-0000-0000-0000-0000000e00e3', 'aal1');

-- Atalho para as comparações: lista de códigos de uma chave do JSON.
create function pg_temp.codes(p jsonb, k text) returns text[] language sql as $$
  select coalesce(array(select jsonb_array_elements_text(p -> k) order by 1), '{}')
$$;

-- 1-3. Administrador do Tenant A: conjunto exato em A e nada em B.
select is(pg_temp.codes(public.get_actor_permissions('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000e0002', '20000000-0000-0000-0000-00000000000a'), 'tenant'),
  (select array_agg(p.code order by p.code) from public.role_permissions rp join public.permissions p on p.id = rp.permission_id and p.active
    where rp.role_id = '50000000-0000-0000-0000-000000000003'),
  'administrador A recebe exatamente as permissões do papel no Tenant A');
select is(pg_temp.codes(public.get_actor_permissions('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000e0002', '20000000-0000-0000-0000-00000000000a'), 'global'),
  '{}'::text[], 'administrador de tenant não tem permissão global');
select is(public.get_actor_permissions('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000e0002', '20000000-0000-0000-0000-00000000000b'),
  '{"kind":"listed","tenant":[],"global":[]}'::jsonb, 'tenant sem vínculo da pessoa devolve lista vazia, sem erro e sem dado do outro tenant');

-- 4. Operador técnico não tem tenant.manage nem audit.read.
select ok(not (pg_temp.codes(public.get_actor_permissions('10000000-0000-0000-0000-000000000004', '60000000-0000-0000-0000-0000000e0004', '20000000-0000-0000-0000-00000000000a'), 'tenant') && array['tenant.manage', 'audit.read']),
  'operador técnico não recebe tenant.manage nem audit.read');

-- 5-6. Mesma pessoa, conjuntos distintos por tenant.
select ok('tenant.manage' = any(pg_temp.codes(public.get_actor_permissions('10000000-0000-0000-0000-0000000000e1', '60000000-0000-0000-0000-0000000e00e1', '20000000-0000-0000-0000-00000000000a'), 'tenant')),
  'pessoa administradora em A recebe tenant.manage em A');
select ok(not ('tenant.manage' = any(pg_temp.codes(public.get_actor_permissions('10000000-0000-0000-0000-0000000000e1', '60000000-0000-0000-0000-0000000e00e1', '20000000-0000-0000-0000-00000000000b'), 'tenant'))),
  'a mesma pessoa, operadora em B, não recebe tenant.manage em B');

-- 7-8. Master: global igual a todas as permissões ativas; tenant vazio em tenant sem vínculo.
select is(pg_temp.codes(public.get_actor_permissions('10000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-0000000e0001', '20000000-0000-0000-0000-00000000000a'), 'global'),
  (select array_agg(code order by code) from public.permissions where active), 'Master recebe todas as permissões ativas em global');
select is(pg_temp.codes(public.get_actor_permissions('10000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-0000000e0001', '20000000-0000-0000-0000-00000000000a'), 'tenant'),
  '{}'::text[], 'Master sem vínculo no Tenant A recebe tenant vazio');

-- 9-11. Administrador FluxID: platform.manage, audit.read e profile.read, sem tenant.manage.
select is(pg_temp.codes(public.get_actor_permissions('10000000-0000-0000-0000-0000000000e2', '60000000-0000-0000-0000-0000000e00e2', null), 'global'),
  array['audit.read', 'platform.manage', 'profile.read'], 'Administrador FluxID recebe platform.manage, audit.read e profile.read em global');
select ok(not ('tenant.manage' = any(pg_temp.codes(public.get_actor_permissions('10000000-0000-0000-0000-0000000000e2', '60000000-0000-0000-0000-0000000e00e2', null), 'global'))),
  'Administrador FluxID não recebe tenant.manage');
select is(pg_temp.codes(public.get_actor_permissions('10000000-0000-0000-0000-0000000000e2', '60000000-0000-0000-0000-0000000e00e2', null), 'tenant'),
  '{}'::text[], 'sem organização informada, tenant volta vazio');

-- 12-13. Organização proprietária como tenant ativo: tenant e global coincidem e audit.read continua em global.
select is(pg_temp.codes(public.get_actor_permissions('10000000-0000-0000-0000-0000000000e2', '60000000-0000-0000-0000-0000000e00e2', '20000000-0000-0000-0000-000000000001'), 'tenant'),
  array['audit.read', 'platform.manage', 'profile.read'], 'na organização proprietária, tenant coincide com global');
select ok('audit.read' = any(pg_temp.codes(public.get_actor_permissions('10000000-0000-0000-0000-0000000000e2', '60000000-0000-0000-0000-0000000e00e2', '20000000-0000-0000-0000-000000000001'), 'global')),
  'audit.read, de escopo tenant, permanece em global');

-- 14. Vínculo bloqueado.
select is(public.get_actor_permissions('10000000-0000-0000-0000-0000000000e3', '60000000-0000-0000-0000-0000000e00e3', '20000000-0000-0000-0000-00000000000a'),
  '{"kind":"listed","tenant":[],"global":[]}'::jsonb, 'vínculo bloqueado devolve listas vazias');

-- 15. Tenant suspenso.
update public.organizations set status = 'suspended' where id = '20000000-0000-0000-0000-00000000000a';
select is(public.get_actor_permissions('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000e0002', '20000000-0000-0000-0000-00000000000a'),
  '{"kind":"listed","tenant":[],"global":[]}'::jsonb, 'tenant suspenso devolve listas vazias');
update public.organizations set status = 'active' where id = '20000000-0000-0000-0000-00000000000a';

-- 16. Papel inativado (papel personalizado: os papéis de sistema são imutáveis).
insert into public.roles (id, organization_id, code, name, scope, system) values
  ('50000000-0000-0000-0000-0000000000e1', '20000000-0000-0000-0000-00000000000a', 'custom_perm', 'Personalizado', 'tenant', false);
insert into public.role_permissions (role_id, permission_id) select '50000000-0000-0000-0000-0000000000e1', id from public.permissions where code = 'audit.read';
insert into public.membership_roles (membership_id, role_id, assigned_by) values
  ('30000000-0000-0000-0000-000000000004', '50000000-0000-0000-0000-0000000000e1', '10000000-0000-0000-0000-000000000001');
select ok('audit.read' = any(pg_temp.codes(public.get_actor_permissions('10000000-0000-0000-0000-000000000004', '60000000-0000-0000-0000-0000000e0004', '20000000-0000-0000-0000-00000000000a'), 'tenant')),
  'papel personalizado ativo concede audit.read ao operador');
update public.roles set active = false where id = '50000000-0000-0000-0000-0000000000e1';
select ok(not ('audit.read' = any(pg_temp.codes(public.get_actor_permissions('10000000-0000-0000-0000-000000000004', '60000000-0000-0000-0000-0000000e0004', '20000000-0000-0000-0000-00000000000a'), 'tenant'))),
  'papel inativado não concede permissão');

-- 17. Permissão inativada.
update public.permissions set active = false where code = 'tenant.manage';
select ok(not ('tenant.manage' = any(pg_temp.codes(public.get_actor_permissions('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000e0002', '20000000-0000-0000-0000-00000000000a'), 'tenant'))),
  'permissão inativada não aparece');
update public.permissions set active = true where code = 'tenant.manage';

-- 18-21. Sessão não vigente: de outra pessoa, expirada, revogada e inativa há mais de 30 minutos.
select is(public.get_actor_permissions('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000e0004', '20000000-0000-0000-0000-00000000000a'),
  '{"kind":"access_denied"}'::jsonb, 'sessão de outra pessoa é negada');
update public.user_sessions set expires_at = now() - interval '1 minute' where session_id = '60000000-0000-0000-0000-0000000e0002';
select is(public.get_actor_permissions('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000e0002', '20000000-0000-0000-0000-00000000000a'),
  '{"kind":"access_denied"}'::jsonb, 'sessão expirada é negada');
update public.user_sessions set expires_at = now() + interval '1 hour', last_seen_at = now() - interval '31 minutes' where session_id = '60000000-0000-0000-0000-0000000e0002';
select is(public.get_actor_permissions('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000e0002', '20000000-0000-0000-0000-00000000000a'),
  '{"kind":"access_denied"}'::jsonb, 'sessão sem atividade há mais de 30 minutos é negada');
update public.user_sessions set last_seen_at = now(), status = 'revoked' where session_id = '60000000-0000-0000-0000-0000000e0002';
select is(public.get_actor_permissions('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000e0002', '20000000-0000-0000-0000-00000000000a'),
  '{"kind":"access_denied"}'::jsonb, 'sessão revogada é negada');

-- 22. Formato mínimo: somente kind, tenant e global.
select is((select array_agg(k order by k) from jsonb_object_keys(public.get_actor_permissions('10000000-0000-0000-0000-000000000004', '60000000-0000-0000-0000-0000000e0004', '20000000-0000-0000-0000-00000000000a')) k),
  array['global', 'kind', 'tenant'], 'o JSON não tem chaves além de kind, tenant e global');

-- 23-26. Execução restrita ao service_role.
select is(has_function_privilege('anon', 'public.get_actor_permissions(uuid, uuid, uuid)', 'execute'), false, 'anon não executa');
select is(has_function_privilege('authenticated', 'public.get_actor_permissions(uuid, uuid, uuid)', 'execute'), false, 'authenticated não executa');
select is(has_function_privilege('service_role', 'public.get_actor_permissions(uuid, uuid, uuid)', 'execute'), true, 'service_role executa');
select is((select prosecdef from pg_proc where oid = 'public.get_actor_permissions(uuid, uuid, uuid)'::regprocedure), true, 'a função é security definer');

select * from finish();
rollback;
