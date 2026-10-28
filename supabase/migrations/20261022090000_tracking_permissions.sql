-- Spec 015: 4 permissões independentes de rastreamento, relatórios, avisos e regra de proximidade (RF-037, RF-009a;
-- contracts/permissoes-e-papeis.md). Nenhuma implica outra; `proximity_rule.manage` é crítica. Nenhum papel perde permissão.

insert into public.permissions (id, code, description, scope, delegability, critical) values
  ('40000000-0000-0000-0000-000000000053', 'tracking.read', 'Consultar acompanhamento, histórico, ocorrências de proximidade e a regra vigente', 'tenant', 'tenant_delegable', false),
  ('40000000-0000-0000-0000-000000000054', 'report.export', 'Solicitar e baixar exportações de relatórios, sem ampliar a leitura', 'tenant', 'tenant_delegable', false),
  ('40000000-0000-0000-0000-000000000055', 'notification_category.manage', 'Liberar ou retirar as categorias de aviso por e-mail da empresa', 'tenant', 'tenant_delegable', false),
  ('40000000-0000-0000-0000-000000000056', 'proximity_rule.manage', 'Alterar a regra de proximidade da empresa, com justificativa', 'tenant', 'tenant_delegable', true)
on conflict (id) do nothing;

-- Papéis padrão de cada empresa: os mapeamentos das Specs anteriores são mantidos e os da Spec 015 acrescentados por lista explícita.
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
            'cylinder.identifier', 'cylinder.stock_in', 'cylinder.test', 'cylinder.history',
            'tracking.read', 'report.export', 'notification_category.manage', 'proximity_rule.manage')
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
            'seal.read',
            'tracking.read', 'report.export'))
      or (r.code = 'logistics_manager' and p.code in (
            'trip.read', 'trip.write', 'trip.operate', 'trip.cancel', 'trip.unlock', 'trip.history', 'trip.recipient',
            'cylinder.read', 'customer.read', 'geofence.read', 'vehicle.read', 'driver.read',
            'seal.read', 'seal.operate',
            'tracking.read', 'report.export')))
  on conflict do nothing;
  perform set_config('app.system_bootstrap', 'off', true);
end $$;
revoke all on function private.bootstrap_tenant_roles(uuid) from public, anon, authenticated;

-- O papel Master possui todas as permissões ativas (Spec 002, RF-039): as da Spec 015 entram nele.
do $$ begin
  perform set_config('app.system_bootstrap', 'on', true);
  insert into public.role_permissions (role_id, permission_id)
    select r.id, p.id from public.roles r
      join public.permissions p on p.code in ('tracking.read', 'report.export', 'notification_category.manage', 'proximity_rule.manage') and p.active
     where r.code = 'master_fluxid' and r.organization_id is null
  on conflict do nothing;
  perform set_config('app.system_bootstrap', 'off', true);
end $$;

-- Empresas existentes recebem as concessões (idempotente).
select private.bootstrap_tenant_roles(id) from public.organizations where kind = 'tenant';
