begin;
select plan(30);

-- Massa isolada: papel personalizado em cada tenant do seed e um segundo administrador no Tenant A.
insert into public.roles (id, organization_id, code, name, scope, system) values
  ('50000000-0000-0000-0000-0000000000e1', '20000000-0000-0000-0000-00000000000a', 'custom_a', 'Papel A', 'tenant', false),
  ('50000000-0000-0000-0000-0000000000e2', '20000000-0000-0000-0000-00000000000b', 'custom_b', 'Papel B', 'tenant', false);

insert into auth.users (id, aud, role, email) values
  ('10000000-0000-0000-0000-0000000000e3', 'authenticated', 'authenticated', 'rbac-second-admin@example.invalid'),
  ('10000000-0000-0000-0000-0000000000e4', 'authenticated', 'authenticated', 'rbac-invited@example.invalid');
insert into public.memberships (id, organization_id, user_id, status, activated_at) values
  ('30000000-0000-0000-0000-0000000000e3', '20000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-0000000000e3', 'active', now());
insert into public.memberships (id, organization_id, user_id, status) values
  ('30000000-0000-0000-0000-0000000000e4', '20000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-0000000000e4', 'invited');

-- 1-6. Catálogo instalado pelas migrations (não depende do seed).
select is((select count(*)::int from public.permissions where code in ('platform.manage','tenant.manage','audit.read','profile.read')), 4, 'catálogo inicial fechado com 4 permissões');
select is((select delegability from public.permissions where code = 'platform.manage'), 'non_delegable', 'platform.manage não é delegável');
select is((select count(*)::int from public.role_permissions rp join public.roles r on r.id = rp.role_id where r.code = 'master_fluxid'), 31, 'Master possui todas as permissões');
select is(
  (select array_agg(p.code order by p.code) from public.role_permissions rp join public.roles r on r.id = rp.role_id join public.permissions p on p.id = rp.permission_id where r.code = 'admin_fluxid'),
  array['audit.read','platform.manage','profile.read'], 'Administrador FluxID gerencia a plataforma e audita, sem tenant.manage');
select is((select count(*)::int from public.roles where scope = 'global' and system and organization_id is null), 2, 'dois papéis globais preestabelecidos');
select ok(not exists(select 1 from public.role_permissions rp join public.roles r on r.id = rp.role_id join public.permissions p on p.id = rp.permission_id where r.code in ('technical_operator','stock_operator','driver') and p.code not like 'cylinder.%' and p.code !~ '^(customer|geofence|vehicle|driver)\.read$'), 'operadores e motorista não têm permissões nesta Spec');

-- 7-11. Delegabilidade e escopo em papel personalizado.
select lives_ok($$ insert into public.role_permissions (role_id, permission_id) select '50000000-0000-0000-0000-0000000000e1', id from public.permissions where code = 'audit.read' $$, 'permissão delegável entra em papel personalizado');
select throws_ok($$ insert into public.role_permissions (role_id, permission_id) select '50000000-0000-0000-0000-0000000000e1', id from public.permissions where code = 'platform.manage' $$, '23514', 'permission_not_delegable', 'permissão não delegável é recusada em papel de tenant');
select throws_ok($$ insert into public.role_permissions (role_id, permission_id) select '50000000-0000-0000-0000-0000000000e1', id from public.permissions where code = 'platform.manage' $$, '23514', null, 'a recusa vale também para o service_role (nível do banco)');
update public.permissions set active = false where code = 'profile.read';
select throws_ok($$ insert into public.role_permissions (role_id, permission_id) select '50000000-0000-0000-0000-0000000000e1', id from public.permissions where code = 'profile.read' $$, '23514', 'permission_inactive', 'permissão inativa é recusada');
update public.permissions set active = true where code = 'profile.read';
select lives_ok($$ delete from public.role_permissions where role_id = '50000000-0000-0000-0000-0000000000e1' $$, 'remover permissão de papel personalizado é permitido');

-- 12-15. Imutabilidade das permissões dos papéis preestabelecidos.
select throws_ok($$ insert into public.role_permissions (role_id, permission_id) select '50000000-0000-0000-0000-000000000003', id from public.permissions where code = 'profile.read' $$, '42501', 'system_role_immutable', 'não acrescenta permissão a papel preestabelecido');
select throws_ok($$ delete from public.role_permissions where role_id = '50000000-0000-0000-0000-000000000003' $$, '42501', 'system_role_immutable', 'não remove permissão de papel preestabelecido');
select throws_ok($$ update public.roles set name = 'Outro nome' where id = '50000000-0000-0000-0000-000000000003' $$, 'P0001', 'system_role_immutable', 'não renomeia papel preestabelecido');
select lives_ok($$ select set_config('app.system_bootstrap', 'on', true); insert into public.role_permissions (role_id, permission_id) select '50000000-0000-0000-0000-000000000003', id from public.permissions where code = 'profile.read'; select set_config('app.system_bootstrap', 'off', true) $$, 'somente a instalação confiável (bootstrap) altera papéis preestabelecidos');

-- 16-20. Atribuição de papel restrita ao mesmo escopo e a vínculo ativo.
select throws_ok($$ insert into public.membership_roles (membership_id, role_id, assigned_by) values ('30000000-0000-0000-0000-0000000000e3', '50000000-0000-0000-0000-0000000000e2', '10000000-0000-0000-0000-000000000002') $$, '23514', 'role_organization_mismatch', 'papel de outro tenant não é atribuído');
select throws_ok($$ insert into public.membership_roles (membership_id, role_id, assigned_by) values ('30000000-0000-0000-0000-0000000000e3', '50000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002') $$, '23514', 'global_role_outside_owner', 'papel global não é atribuído a vínculo de tenant');
select throws_ok($$ insert into public.membership_roles (membership_id, role_id, assigned_by) values ('30000000-0000-0000-0000-0000000000e4', '50000000-0000-0000-0000-0000000000e1', '10000000-0000-0000-0000-000000000002') $$, '23514', 'membership_not_active', 'vínculo apenas convidado não recebe papel');
select lives_ok($$ insert into public.membership_roles (membership_id, role_id, assigned_by) values ('30000000-0000-0000-0000-0000000000e3', '50000000-0000-0000-0000-0000000000e1', '10000000-0000-0000-0000-000000000002') $$, 'papel do mesmo tenant é atribuído a vínculo ativo');
select throws_ok($$ insert into public.membership_roles (membership_id, role_id, assigned_by) values ('30000000-0000-0000-0000-00000000000b', '50000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000003') $$, '23514', 'role_organization_mismatch', 'papel administrativo do Tenant A não vai para vínculo do Tenant B');

-- 21-25. Invariante do último administrador do tenant ativo.
select throws_ok($$ delete from public.membership_roles where membership_id = '30000000-0000-0000-0000-00000000000a' and role_id = '50000000-0000-0000-0000-000000000003' $$, '23514', 'last_admin_required', 'remover o papel do último administrador é recusado');
select throws_ok($$ update public.memberships set status = 'blocked' where id = '30000000-0000-0000-0000-00000000000a' $$, '23514', 'last_admin_required', 'bloquear o último administrador é recusado mesmo por atualização direta');
select lives_ok($$ insert into public.membership_roles (membership_id, role_id, assigned_by) values ('30000000-0000-0000-0000-0000000000e3', '50000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000002') $$, 'um segundo administrador ativo é atribuído');
select lives_ok($$ update public.memberships set status = 'blocked' where id = '30000000-0000-0000-0000-00000000000a' $$, 'com outro administrador ativo o bloqueio é permitido');
select throws_ok($$ delete from public.membership_roles where membership_id = '30000000-0000-0000-0000-0000000000e3' and role_id = '50000000-0000-0000-0000-000000000003' $$, '23514', 'last_admin_required', 'o administrador restante passa a ser o último e fica protegido');

-- 26-27. Convite só para papel ativo do próprio tenant.
select throws_ok($$ insert into public.invitations (organization_id, email_normalized, intended_role_id, created_by) values ('20000000-0000-0000-0000-00000000000a', 'x@example.invalid', '50000000-0000-0000-0000-0000000000e2', '10000000-0000-0000-0000-000000000002') $$, '23514', 'invitation_role_invalid', 'convite com papel de outro tenant é recusado');
select lives_ok($$ insert into public.invitations (organization_id, email_normalized, intended_role_id, created_by) values ('20000000-0000-0000-0000-00000000000a', 'y@example.invalid', '50000000-0000-0000-0000-0000000000e1', '10000000-0000-0000-0000-000000000002') $$, 'convite com papel do próprio tenant é aceito');

-- 28-30. A remoção de permissão vale imediatamente para a autorização atual, sem renovar sessão.
select public.start_user_session('10000000-0000-0000-0000-0000000000e3', '60000000-0000-0000-0000-0000000000e3', 'aal2');
select ok(public.tenant_actor_authorized('10000000-0000-0000-0000-0000000000e3', '60000000-0000-0000-0000-0000000000e3', '20000000-0000-0000-0000-00000000000a'), 'administrador autorizado com a sessão atual');
select lives_ok($$ select set_config('app.system_bootstrap', 'on', true); delete from public.role_permissions where role_id = '50000000-0000-0000-0000-000000000003' and permission_id = (select id from public.permissions where code = 'tenant.manage'); select set_config('app.system_bootstrap', 'off', true) $$, 'permissão removida na instalação confiável');
select ok(not public.tenant_actor_authorized('10000000-0000-0000-0000-0000000000e3', '60000000-0000-0000-0000-0000000000e3', '20000000-0000-0000-0000-00000000000a'), 'a mesma sessão perde o acesso imediatamente');

select * from finish();
rollback;
