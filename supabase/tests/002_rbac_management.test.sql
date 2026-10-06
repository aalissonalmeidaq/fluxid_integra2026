begin;
select plan(34);

-- Atores: Administrador do Tenant A (seed) e Administrador do Tenant B (seed, agora com papéis via bootstrap).
insert into public.user_sessions(session_id,user_id,status,aal,expires_at) values
  ('60000000-0000-0000-0000-0000000000a1','10000000-0000-0000-0000-000000000002','active','aal2',now()+interval '1 hour'),
  ('60000000-0000-0000-0000-0000000000a2','10000000-0000-0000-0000-000000000003','active','aal2',now()+interval '1 hour');
select set_config('app.system_bootstrap', 'on', true);
insert into public.role_permissions (role_id, permission_id)
  select r.id, p.id from public.roles r join public.permissions p on p.code = 'tenant.manage'
   where r.organization_id = '20000000-0000-0000-0000-00000000000b' and r.code = 'tenant_admin' on conflict do nothing;
insert into public.membership_roles (membership_id, role_id, assigned_by)
  select '30000000-0000-0000-0000-00000000000b', r.id, '10000000-0000-0000-0000-000000000003'
    from public.roles r where r.organization_id = '20000000-0000-0000-0000-00000000000b' and r.code = 'tenant_admin' on conflict do nothing;
select set_config('app.system_bootstrap', 'off', true);

insert into auth.users (id, aud, role, email) values
  ('10000000-0000-0000-0000-0000000000f3', 'authenticated', 'authenticated', 'rbac-op-a@example.invalid'),
  ('10000000-0000-0000-0000-0000000000f4', 'authenticated', 'authenticated', 'rbac-op-b@example.invalid');
insert into public.memberships (id, organization_id, user_id, status, activated_at) values
  ('30000000-0000-0000-0000-0000000000f3', '20000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-0000000000f3', 'active', now()),
  ('30000000-0000-0000-0000-0000000000f4', '20000000-0000-0000-0000-00000000000b', '10000000-0000-0000-0000-0000000000f4', 'active', now());

-- 1-6. Listagem restrita ao tenant do ator, com papéis, permissões e atribuições.
create temp table access_a on commit drop as
  select public.list_tenant_access('10000000-0000-0000-0000-000000000002','60000000-0000-0000-0000-0000000000a1','20000000-0000-0000-0000-00000000000a') as result;
select is((select result->>'kind' from access_a), 'listed', 'administrador A lista o acesso do próprio tenant');
select is((select count(*)::int from jsonb_array_elements((select result->'roles' from access_a)) r where (r->>'system')::boolean), 5, 'lista os cinco papéis preestabelecidos do tenant');
select ok((select result->'roles' @> '[{"code":"tenant_admin","system":true}]'::jsonb from access_a), 'identifica papéis preestabelecidos como imutáveis');
select ok((select result->'permissions' @> '[{"code":"audit.read","delegable":true},{"code":"platform.manage","delegable":false}]'::jsonb from access_a), 'informa a delegabilidade de cada permissão');
select ok(not (select result::text like '%50000000-0000-0000-0000-0000000000%' and result::text like '%0000000000f4%' from access_a), 'não vaza vínculos nem papéis de outro tenant');
select is(public.list_tenant_access('10000000-0000-0000-0000-000000000002','60000000-0000-0000-0000-0000000000a1','20000000-0000-0000-0000-00000000000b')->>'kind', 'access_denied', 'administrador A não lista o Tenant B');

-- 7-14. Criação de papel personalizado: somente permissões delegáveis; auditada.
create temp table created_role on commit drop as
  select public.save_tenant_role('10000000-0000-0000-0000-000000000002','60000000-0000-0000-0000-0000000000a1','20000000-0000-0000-0000-00000000000a',
    null, 'Auditor interno', 'Consulta a auditoria do tenant', array['audit.read'], null, 'Papel aprovado pela diretoria') as result;
select is((select result->>'kind' from created_role), 'saved', 'cria papel personalizado com permissão delegável');
select is((select (result->'role'->>'version')::int from created_role), 1, 'papel nasce na versão 1');
select is((select count(*)::int from public.role_permissions rp where rp.role_id = (select (result->'role'->>'id')::uuid from created_role)), 1, 'a permissão é associada ao papel');
select ok(not (select system from public.roles where id = (select (result->'role'->>'id')::uuid from created_role)), 'papel criado não é preestabelecido');
select is(public.save_tenant_role('10000000-0000-0000-0000-000000000002','60000000-0000-0000-0000-0000000000a1','20000000-0000-0000-0000-00000000000a',
    null, 'Escalada', 'Tenta permissão global', array['platform.manage'], null, 'Tentativa de escalada')->>'kind', 'not_delegable', 'permissão não delegável é recusada');
select is(public.save_tenant_role('10000000-0000-0000-0000-000000000002','60000000-0000-0000-0000-0000000000a1','20000000-0000-0000-0000-00000000000a',
    null, 'Inexistente', '', array['nao.existe'], null, 'Permissão que não existe')->>'kind', 'invalid', 'permissão desconhecida é recusada');
select is(public.save_tenant_role('10000000-0000-0000-0000-000000000002','60000000-0000-0000-0000-0000000000a1','20000000-0000-0000-0000-00000000000a',
    null, 'X', '', array['audit.read'], null, 'Nome curto demais')->>'kind', 'invalid', 'nome fora de 2 a 80 caracteres é recusado');
select is(public.save_tenant_role('10000000-0000-0000-0000-000000000002','60000000-0000-0000-0000-0000000000a1','20000000-0000-0000-0000-00000000000a',
    null, 'Sem justificativa', '', array['audit.read'], null, 'curta')->>'kind', 'invalid', 'justificativa curta é recusada');

-- 15-19. Alteração com controle de versão; papel preestabelecido é imutável; papel de outro tenant indisponível.
select is(public.save_tenant_role('10000000-0000-0000-0000-000000000002','60000000-0000-0000-0000-0000000000a1','20000000-0000-0000-0000-00000000000a',
    (select (result->'role'->>'id')::uuid from created_role), 'Auditor sênior', 'Descrição nova', array['audit.read','profile.read'], 1, 'Ampliação aprovada')->>'kind', 'saved', 'altera papel personalizado com a versão esperada');
select is((select version from public.roles where id = (select (result->'role'->>'id')::uuid from created_role)), 2::bigint, 'a versão é incrementada');
select is(public.save_tenant_role('10000000-0000-0000-0000-000000000002','60000000-0000-0000-0000-0000000000a1','20000000-0000-0000-0000-00000000000a',
    (select (result->'role'->>'id')::uuid from created_role), 'Auditor sênior', '', array['audit.read'], 1, 'Versão desatualizada')->>'kind', 'conflict', 'versão desatualizada retorna conflito');
select is(public.save_tenant_role('10000000-0000-0000-0000-000000000002','60000000-0000-0000-0000-0000000000a1','20000000-0000-0000-0000-00000000000a',
    '50000000-0000-0000-0000-000000000003', 'Renomeado', '', array['audit.read'], 1, 'Tentativa em papel oficial')->>'kind', 'immutable', 'papel preestabelecido é imutável');
select is(public.save_tenant_role('10000000-0000-0000-0000-000000000002','60000000-0000-0000-0000-0000000000a1','20000000-0000-0000-0000-00000000000a',
    (select id from public.roles where organization_id = '20000000-0000-0000-0000-00000000000b' and code = 'tenant_admin'), 'Invasão', '', array['audit.read'], 1, 'Papel de outro tenant')->>'kind', 'unavailable', 'papel de outro tenant é indisponível');

-- 20-22. Atribuição e remoção de papel a vínculo ativo do mesmo tenant.
select is(public.change_tenant_role_assignment('10000000-0000-0000-0000-000000000002','60000000-0000-0000-0000-0000000000a1','20000000-0000-0000-0000-00000000000a',
    '30000000-0000-0000-0000-0000000000f3', (select (result->'role'->>'id')::uuid from created_role), true, 'Atribuição aprovada pela gestão')->>'kind', 'assigned', 'atribui papel a vínculo ativo do tenant');
select is(public.change_tenant_role_assignment('10000000-0000-0000-0000-000000000002','60000000-0000-0000-0000-0000000000a1','20000000-0000-0000-0000-00000000000a',
    '30000000-0000-0000-0000-0000000000f4', (select (result->'role'->>'id')::uuid from created_role), true, 'Vínculo de outro tenant')->>'kind', 'unavailable', 'não atribui a vínculo de outro tenant');
select is(public.change_tenant_role_assignment('10000000-0000-0000-0000-000000000002','60000000-0000-0000-0000-0000000000a1','20000000-0000-0000-0000-00000000000a',
    '30000000-0000-0000-0000-0000000000f3', (select (result->'role'->>'id')::uuid from created_role), false, 'Remoção aprovada pela gestão')->>'kind', 'removed', 'remove o papel do vínculo');

-- 23-25. Último administrador protegido também pela fronteira de gestão.
select is(public.change_tenant_role_assignment('10000000-0000-0000-0000-000000000002','60000000-0000-0000-0000-0000000000a1','20000000-0000-0000-0000-00000000000a',
    '30000000-0000-0000-0000-00000000000a', '50000000-0000-0000-0000-000000000003', false, 'Tentativa de remover o último')->>'kind', 'last_admin', 'não remove o papel do último administrador');
select is(public.change_tenant_role_assignment('10000000-0000-0000-0000-000000000002','60000000-0000-0000-0000-0000000000a1','20000000-0000-0000-0000-00000000000a',
    '30000000-0000-0000-0000-0000000000f3', '50000000-0000-0000-0000-000000000003', true, 'Segundo administrador aprovado')->>'kind', 'assigned', 'atribui o papel de administrador a outro vínculo ativo');
select is(public.change_tenant_role_assignment('10000000-0000-0000-0000-000000000002','60000000-0000-0000-0000-0000000000a1','20000000-0000-0000-0000-00000000000a',
    '30000000-0000-0000-0000-00000000000a', '50000000-0000-0000-0000-000000000003', false, 'Transição de responsabilidade')->>'kind', 'removed', 'com outro administrador ativo a remoção é permitida');

-- 26-28. Inativação de papel personalizado com efeito imediato na autorização.
select is(public.set_tenant_role_active('10000000-0000-0000-0000-000000000002','60000000-0000-0000-0000-0000000000a2','20000000-0000-0000-0000-00000000000b',
    (select id from public.roles where organization_id = '20000000-0000-0000-0000-00000000000b' and code = 'tenant_admin'), false, 1, 'Ator de outro tenant')->>'kind', 'access_denied', 'sessão de outro usuário não inativa papéis do tenant');
select is(public.set_tenant_role_active('10000000-0000-0000-0000-000000000003','60000000-0000-0000-0000-0000000000a2','20000000-0000-0000-0000-00000000000b',
    (select id from public.roles where organization_id = '20000000-0000-0000-0000-00000000000b' and code = 'tenant_admin'), false, 1, 'Papel oficial é imutável')->>'kind', 'immutable', 'papel preestabelecido não é inativado');
select is(public.set_tenant_role_active('10000000-0000-0000-0000-000000000003','60000000-0000-0000-0000-0000000000a2','20000000-0000-0000-0000-00000000000b',
    (select id from public.roles where organization_id = '20000000-0000-0000-0000-00000000000b' and code = 'driver'), false, 1, 'Papel oficial é imutável')->>'kind', 'immutable', 'nenhum papel oficial é inativado');

-- 29-31. Auditoria de sucesso e sanitização.
select ok(exists(select 1 from public.audit_logs where action = 'role.create' and organization_id = '20000000-0000-0000-0000-00000000000a' and result = 'success'), 'criação de papel é auditada');
select ok(exists(select 1 from public.audit_logs where action = 'role.assign' and organization_id = '20000000-0000-0000-0000-00000000000a'), 'atribuição de papel é auditada');
select ok(not exists(select 1 from public.audit_logs where action like 'role.%' and metadata::text ~* 'senha|token|password'), 'a auditoria de papéis não carrega segredos');

-- 32-34. Execução exclusiva do service_role.
select ok(not has_function_privilege('authenticated', 'public.list_tenant_access(uuid,uuid,uuid)', 'execute') and has_function_privilege('service_role', 'public.list_tenant_access(uuid,uuid,uuid)', 'execute'), 'list_tenant_access exclusiva do service_role');
select ok(not has_function_privilege('authenticated', 'public.save_tenant_role(uuid,uuid,uuid,uuid,text,text,text[],bigint,text)', 'execute') and has_function_privilege('service_role', 'public.save_tenant_role(uuid,uuid,uuid,uuid,text,text,text[],bigint,text)', 'execute'), 'save_tenant_role exclusiva do service_role');
select ok(not has_function_privilege('anon', 'public.change_tenant_role_assignment(uuid,uuid,uuid,uuid,uuid,boolean,text)', 'execute') and has_function_privilege('service_role', 'public.set_tenant_role_active(uuid,uuid,uuid,uuid,boolean,bigint,text)', 'execute'), 'RPCs de atribuição e ativação restritas ao service_role');

select * from finish();
rollback;
