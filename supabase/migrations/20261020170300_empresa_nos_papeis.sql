-- Pedido do responsável (20/10/2026, durante a Spec 014, T043): no sistema, "tenant" passa a ser "empresa". Os nomes e as descrições
-- dos papéis padrão aparecem nas telas (Papéis e permissões, Pessoas, convites), então mudam aqui. Os códigos (tenant_admin,
-- tenant_auditor) e o resto do modelo continuam como estão.

-- 1. Empresas novas já nascem com os textos novos.
create or replace function private.bootstrap_tenant_roles(p_organization uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform set_config('app.system_bootstrap', 'on', true);
  insert into public.roles (organization_id, code, name, description, scope, system) values
    (p_organization, 'tenant_admin', 'Administrador da empresa', 'Administra usuários, papéis, auditoria, cilindros, cadastros, viagens e lacres da empresa', 'tenant', true),
    (p_organization, 'technical_operator', 'Operador técnico', 'Mantém identificadores e registra testes hidrostáticos de cilindros', 'tenant', true),
    (p_organization, 'stock_operator', 'Operador de estoque', 'Cadastra cilindros, registra entradas no estoque, confere a carga das viagens e vincula lacres', 'tenant', true),
    (p_organization, 'tenant_auditor', 'Auditor da empresa', 'Consulta cilindros, cadastros, viagens, lacres e o histórico, sem alterar nada', 'tenant', true),
    (p_organization, 'driver', 'Motorista', 'Acesso somente ao próprio perfil nesta Spec', 'tenant', true),
    (p_organization, 'logistics_manager', 'Gestor logístico', 'Planeja e acompanha viagens, entregas, desbloqueios e lacres', 'tenant', true)
  on conflict (organization_id, code) do nothing;

  insert into public.role_permissions (role_id, permission_id)
  select r.id, p.id
  from public.roles r
  join public.permissions p on p.active
  where r.organization_id = p_organization
    and ((r.code = 'tenant_admin' and (p.code in (
            'tenant.manage', 'audit.read', 'cylinder.read', 'cylinder.write', 'cylinder.deactivate',
            'cylinder.identifier', 'cylinder.stock_in', 'cylinder.test', 'cylinder.history')
          or p.code ~ '^(customer|geofence|vehicle|driver|trip|seal)\.'))
      or (r.code = 'stock_operator' and p.code in (
            'cylinder.read', 'cylinder.write', 'cylinder.stock_in', 'cylinder.history',
            'customer.read', 'geofence.read', 'vehicle.read', 'driver.read',
            'trip.read', 'trip.operate', 'trip.history',
            'seal.read', 'seal.operate'))
      or (r.code = 'technical_operator' and p.code in (
            'cylinder.read', 'cylinder.identifier', 'cylinder.test', 'cylinder.history', 'customer.read', 'vehicle.read'))
      or (r.code = 'tenant_auditor' and p.code in (
            'cylinder.read', 'cylinder.history',
            'customer.read', 'customer.history', 'geofence.read', 'geofence.history',
            'vehicle.read', 'vehicle.history', 'driver.read', 'driver.history',
            'trip.read', 'trip.history',
            'seal.read'))
      or (r.code = 'logistics_manager' and p.code in (
            'trip.read', 'trip.write', 'trip.operate', 'trip.cancel', 'trip.unlock', 'trip.history', 'trip.recipient',
            'cylinder.read', 'customer.read', 'geofence.read', 'vehicle.read', 'driver.read',
            'seal.read', 'seal.operate')))
  on conflict do nothing;
  perform set_config('app.system_bootstrap', 'off', true);
end $$;

revoke all on function private.bootstrap_tenant_roles(uuid) from public, anon, authenticated;

-- 2. Empresas existentes: só os papéis de sistema (o gatilho de proteção é suspenso só para esta atualização).
alter table public.roles disable trigger protect_system_role;
update public.roles set name = 'Administrador da empresa' where system and code = 'tenant_admin' and name = 'Administrador do tenant';
update public.roles set name = 'Auditor da empresa' where system and code = 'tenant_auditor' and name = 'Auditor do tenant';
update public.roles set description = replace(replace(description, ' do tenant', ' da empresa'), 'o tenant', 'a empresa')
 where system and description ~ '\mtenant\M';
alter table public.roles enable trigger protect_system_role;
