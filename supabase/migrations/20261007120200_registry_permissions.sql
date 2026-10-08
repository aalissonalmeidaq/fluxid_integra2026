-- Spec 007: 20 permissões da Fase 3 e o mapeamento dos papéis padrão (RF-049, contracts/permissoes-e-papeis.md).
-- Nenhum papel existente perde permissão (premissa 8). As permissões de anonimização são críticas e só do administrador.

insert into public.permissions (id, code, description, scope, delegability, critical) values
  ('40000000-0000-0000-0000-000000000020', 'customer.read', 'Ver clientes e unidades', 'tenant', 'tenant_delegable', false),
  ('40000000-0000-0000-0000-000000000021', 'customer.write', 'Cadastrar e editar clientes e unidades', 'tenant', 'tenant_delegable', false),
  ('40000000-0000-0000-0000-000000000022', 'customer.deactivate', 'Inativar e reativar clientes e unidades', 'tenant', 'tenant_delegable', false),
  ('40000000-0000-0000-0000-000000000023', 'customer.history', 'Ver o histórico de clientes e unidades', 'tenant', 'tenant_delegable', false),
  ('40000000-0000-0000-0000-000000000024', 'customer.document', 'Ver o CPF completo de cliente pessoa física', 'tenant', 'tenant_delegable', false),
  ('40000000-0000-0000-0000-000000000025', 'customer.anonymize', 'Anonimizar dados pessoais de clientes pessoa física e de contatos', 'tenant', 'tenant_delegable', true),
  ('40000000-0000-0000-0000-000000000026', 'geofence.read', 'Ver geocercas', 'tenant', 'tenant_delegable', false),
  ('40000000-0000-0000-0000-000000000027', 'geofence.write', 'Cadastrar e editar geocercas', 'tenant', 'tenant_delegable', false),
  ('40000000-0000-0000-0000-000000000028', 'geofence.deactivate', 'Inativar e reativar geocercas', 'tenant', 'tenant_delegable', false),
  ('40000000-0000-0000-0000-000000000029', 'geofence.history', 'Ver o histórico de geocercas', 'tenant', 'tenant_delegable', false),
  ('40000000-0000-0000-0000-000000000030', 'vehicle.read', 'Ver veículos', 'tenant', 'tenant_delegable', false),
  ('40000000-0000-0000-0000-000000000031', 'vehicle.write', 'Cadastrar e editar veículos', 'tenant', 'tenant_delegable', false),
  ('40000000-0000-0000-0000-000000000032', 'vehicle.deactivate', 'Mudar a situação de veículos', 'tenant', 'tenant_delegable', false),
  ('40000000-0000-0000-0000-000000000033', 'vehicle.history', 'Ver o histórico de veículos', 'tenant', 'tenant_delegable', false),
  ('40000000-0000-0000-0000-000000000034', 'driver.read', 'Ver motoristas (documentos mascarados)', 'tenant', 'tenant_delegable', false),
  ('40000000-0000-0000-0000-000000000035', 'driver.write', 'Cadastrar e editar motoristas e vínculos', 'tenant', 'tenant_delegable', false),
  ('40000000-0000-0000-0000-000000000036', 'driver.deactivate', 'Inativar e reativar motoristas', 'tenant', 'tenant_delegable', false),
  ('40000000-0000-0000-0000-000000000037', 'driver.history', 'Ver o histórico de motoristas', 'tenant', 'tenant_delegable', false),
  ('40000000-0000-0000-0000-000000000038', 'driver.document', 'Ver o CPF e a CNH completos de motorista', 'tenant', 'tenant_delegable', false),
  ('40000000-0000-0000-0000-000000000039', 'driver.anonymize', 'Anonimizar dados pessoais de motoristas', 'tenant', 'tenant_delegable', true)
on conflict (id) do nothing;

-- Papéis padrão de cada tenant: o mapeamento da Spec 006 é mantido e o da Fase 3 é acrescentado.
create or replace function private.bootstrap_tenant_roles(p_organization uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform set_config('app.system_bootstrap', 'on', true);
  insert into public.roles (organization_id, code, name, description, scope, system) values
    (p_organization, 'tenant_admin', 'Administrador do tenant', 'Administra usuários, papéis, auditoria, cilindros e cadastros do tenant', 'tenant', true),
    (p_organization, 'technical_operator', 'Operador técnico', 'Mantém identificadores e registra testes hidrostáticos de cilindros', 'tenant', true),
    (p_organization, 'stock_operator', 'Operador de estoque', 'Cadastra cilindros e registra entradas no estoque', 'tenant', true),
    (p_organization, 'tenant_auditor', 'Auditor do tenant', 'Consulta cilindros, cadastros e o histórico, sem alterar nada', 'tenant', true),
    (p_organization, 'driver', 'Motorista', 'Acesso somente ao próprio perfil nesta Spec', 'tenant', true)
  on conflict (organization_id, code) do nothing;

  insert into public.role_permissions (role_id, permission_id)
  select r.id, p.id
  from public.roles r
  join public.permissions p on p.active
  where r.organization_id = p_organization
    and ((r.code = 'tenant_admin' and (p.code in (
            'tenant.manage', 'audit.read', 'cylinder.read', 'cylinder.write', 'cylinder.deactivate',
            'cylinder.identifier', 'cylinder.stock_in', 'cylinder.test', 'cylinder.history')
          or p.code ~ '^(customer|geofence|vehicle|driver)\.'))
      or (r.code = 'stock_operator' and p.code in (
            'cylinder.read', 'cylinder.write', 'cylinder.stock_in', 'cylinder.history',
            'customer.read', 'geofence.read', 'vehicle.read', 'driver.read'))
      or (r.code = 'technical_operator' and p.code in (
            'cylinder.read', 'cylinder.identifier', 'cylinder.test', 'cylinder.history', 'customer.read', 'vehicle.read'))
      or (r.code = 'tenant_auditor' and p.code in (
            'cylinder.read', 'cylinder.history',
            'customer.read', 'customer.history', 'geofence.read', 'geofence.history',
            'vehicle.read', 'vehicle.history', 'driver.read', 'driver.history')))
  on conflict do nothing;
  perform set_config('app.system_bootstrap', 'off', true);
end $$;

revoke all on function private.bootstrap_tenant_roles(uuid) from public, anon, authenticated;

-- Descrição do papel de administrador: inclui os cadastros. O gatilho de proteção dos papéis de sistema é suspenso só
-- para esta atualização de texto, dentro da migration.
alter table public.roles disable trigger protect_system_role;
update public.roles set description = 'Administra usuários, papéis, auditoria, cilindros e cadastros do tenant'
 where system and code = 'tenant_admin' and description = 'Administra usuários, papéis, auditoria e cilindros do tenant';
update public.roles set description = 'Consulta cilindros, cadastros e o histórico, sem alterar nada'
 where system and code = 'tenant_auditor' and description = 'Consulta cilindros e o histórico, sem alterar nada';
alter table public.roles enable trigger protect_system_role;

-- O papel Master possui todas as permissões ativas (Spec 002, RF-039): as novas entram nele, no escopo da organização proprietária.
do $$ begin
  perform set_config('app.system_bootstrap', 'on', true);
  insert into public.role_permissions (role_id, permission_id)
    select r.id, p.id from public.roles r join public.permissions p on p.code ~ '^(customer|geofence|vehicle|driver)\.' and p.active
     where r.code = 'master_fluxid' and r.organization_id is null
  on conflict do nothing;
  perform set_config('app.system_bootstrap', 'off', true);
end $$;

-- Tenants existentes recebem as concessões (idempotente).
select private.bootstrap_tenant_roles(id) from public.organizations where kind = 'tenant';
