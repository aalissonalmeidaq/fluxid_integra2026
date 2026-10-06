-- Spec 006: permissões de cilindros e o papel padrão de auditor. Nenhum papel existente perde permissão (premissa 8).

insert into public.permissions (id, code, description, scope, delegability, critical) values
  ('40000000-0000-0000-0000-000000000010', 'cylinder.read', 'Ver cilindros', 'tenant', 'tenant_delegable', false),
  ('40000000-0000-0000-0000-000000000011', 'cylinder.write', 'Cadastrar e editar cilindros', 'tenant', 'tenant_delegable', false),
  ('40000000-0000-0000-0000-000000000012', 'cylinder.deactivate', 'Inativar e reativar cilindros', 'tenant', 'tenant_delegable', false),
  ('40000000-0000-0000-0000-000000000013', 'cylinder.identifier', 'Gerenciar identificadores de cilindros', 'tenant', 'tenant_delegable', false),
  ('40000000-0000-0000-0000-000000000014', 'cylinder.stock_in', 'Registrar entrada de cilindros no estoque', 'tenant', 'tenant_delegable', false),
  ('40000000-0000-0000-0000-000000000015', 'cylinder.test', 'Registrar teste hidrostático', 'tenant', 'tenant_delegable', false),
  ('40000000-0000-0000-0000-000000000016', 'cylinder.history', 'Ver o histórico de cilindros', 'tenant', 'tenant_delegable', false)
on conflict (id) do nothing;

-- Papéis padrão de cada tenant: o administrador recebe todas as permissões de cilindros; o operador de estoque, o operador
-- técnico e o novo auditor recebem as do contrato (contracts/permissoes-e-papeis.md). `driver` não recebe nenhuma.
create or replace function private.bootstrap_tenant_roles(p_organization uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform set_config('app.system_bootstrap', 'on', true);
  insert into public.roles (organization_id, code, name, description, scope, system) values
    (p_organization, 'tenant_admin', 'Administrador do tenant', 'Administra usuários, papéis, auditoria e cilindros do tenant', 'tenant', true),
    (p_organization, 'technical_operator', 'Operador técnico', 'Mantém identificadores e registra testes hidrostáticos de cilindros', 'tenant', true),
    (p_organization, 'stock_operator', 'Operador de estoque', 'Cadastra cilindros e registra entradas no estoque', 'tenant', true),
    (p_organization, 'tenant_auditor', 'Auditor do tenant', 'Consulta cilindros e o histórico, sem alterar nada', 'tenant', true),
    (p_organization, 'driver', 'Motorista', 'Acesso somente ao próprio perfil nesta Spec', 'tenant', true)
  on conflict (organization_id, code) do nothing;

  insert into public.role_permissions (role_id, permission_id)
  select r.id, p.id
  from public.roles r
  join public.permissions p on p.active
  where r.organization_id = p_organization
    and ((r.code = 'tenant_admin' and p.code in (
            'tenant.manage', 'audit.read', 'cylinder.read', 'cylinder.write', 'cylinder.deactivate',
            'cylinder.identifier', 'cylinder.stock_in', 'cylinder.test', 'cylinder.history'))
      or (r.code = 'stock_operator' and p.code in ('cylinder.read', 'cylinder.write', 'cylinder.stock_in', 'cylinder.history'))
      or (r.code = 'technical_operator' and p.code in ('cylinder.read', 'cylinder.identifier', 'cylinder.test', 'cylinder.history'))
      or (r.code = 'tenant_auditor' and p.code in ('cylinder.read', 'cylinder.history')))
  on conflict do nothing;
  perform set_config('app.system_bootstrap', 'off', true);
end $$;

revoke all on function private.bootstrap_tenant_roles(uuid) from public, anon, authenticated;

-- Descrições antigas dos papéis de sistema já criados ("somente o próprio perfil nesta Spec"). O gatilho de proteção dos
-- papéis de sistema é suspenso só para esta atualização de texto, dentro da migration.
alter table public.roles disable trigger protect_system_role;
update public.roles set description = 'Administra usuários, papéis, auditoria e cilindros do tenant'
 where system and code = 'tenant_admin' and description = 'Administra usuários, papéis e auditoria do tenant';
update public.roles set description = 'Mantém identificadores e registra testes hidrostáticos de cilindros'
 where system and code = 'technical_operator' and description = 'Acesso somente ao próprio perfil nesta Spec';
update public.roles set description = 'Cadastra cilindros e registra entradas no estoque'
 where system and code = 'stock_operator' and description = 'Acesso somente ao próprio perfil nesta Spec';
alter table public.roles enable trigger protect_system_role;

-- O papel Master possui todas as permissões ativas (Spec 002, RF-039): as novas entram nele, no escopo da organização proprietária.
do $$ begin
  perform set_config('app.system_bootstrap', 'on', true);
  insert into public.role_permissions (role_id, permission_id)
    select r.id, p.id from public.roles r join public.permissions p on p.code like 'cylinder.%' and p.active
     where r.code = 'master_fluxid' and r.organization_id is null
  on conflict do nothing;
  perform set_config('app.system_bootstrap', 'off', true);
end $$;

-- Tenants existentes recebem o auditor e as concessões (idempotente).
select private.bootstrap_tenant_roles(id) from public.organizations where kind = 'tenant';
