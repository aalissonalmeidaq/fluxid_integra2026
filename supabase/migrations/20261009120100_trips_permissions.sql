-- Spec 008: 8 permissões de viagem e o papel padrão Gestor logístico (RF-028, RF-031; contracts/permissoes-e-papeis.md).
-- Nenhum papel existente perde permissão. `trip.exception` é crítica: só o administrador do tenant a recebe por padrão.

insert into public.permissions (id, code, description, scope, delegability, critical) values
  ('40000000-0000-0000-0000-000000000040', 'trip.read', 'Ver viagens', 'tenant', 'tenant_delegable', false),
  ('40000000-0000-0000-0000-000000000041', 'trip.write', 'Planejar e editar viagens', 'tenant', 'tenant_delegable', false),
  ('40000000-0000-0000-0000-000000000042', 'trip.operate', 'Conferir, iniciar, registrar entrega e concluir viagens', 'tenant', 'tenant_delegable', false),
  ('40000000-0000-0000-0000-000000000043', 'trip.cancel', 'Cancelar viagens', 'tenant', 'tenant_delegable', false),
  ('40000000-0000-0000-0000-000000000044', 'trip.unlock', 'Registrar o desbloqueio de cilindros', 'tenant', 'tenant_delegable', false),
  ('40000000-0000-0000-0000-000000000045', 'trip.exception', 'Aprovar exceções de viagem (retirar item, retornar ao estoque, cancelar em andamento, desbloqueio excepcional)', 'tenant', 'tenant_delegable', true),
  ('40000000-0000-0000-0000-000000000046', 'trip.history', 'Ver o histórico de viagens', 'tenant', 'tenant_delegable', false),
  ('40000000-0000-0000-0000-000000000047', 'trip.recipient', 'Ver o nome e a função do recebedor de uma entrega', 'tenant', 'tenant_delegable', false)
on conflict (id) do nothing;

-- Papéis padrão de cada tenant: os mapeamentos das Specs 006 e 007 são mantidos e o da Fase 4 é acrescentado.
create or replace function private.bootstrap_tenant_roles(p_organization uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform set_config('app.system_bootstrap', 'on', true);
  insert into public.roles (organization_id, code, name, description, scope, system) values
    (p_organization, 'tenant_admin', 'Administrador do tenant', 'Administra usuários, papéis, auditoria, cilindros, cadastros e viagens do tenant', 'tenant', true),
    (p_organization, 'technical_operator', 'Operador técnico', 'Mantém identificadores e registra testes hidrostáticos de cilindros', 'tenant', true),
    (p_organization, 'stock_operator', 'Operador de estoque', 'Cadastra cilindros, registra entradas no estoque e confere a carga das viagens', 'tenant', true),
    (p_organization, 'tenant_auditor', 'Auditor do tenant', 'Consulta cilindros, cadastros, viagens e o histórico, sem alterar nada', 'tenant', true),
    (p_organization, 'driver', 'Motorista', 'Acesso somente ao próprio perfil nesta Spec', 'tenant', true),
    (p_organization, 'logistics_manager', 'Gestor logístico', 'Planeja e acompanha viagens, entregas e desbloqueios', 'tenant', true)
  on conflict (organization_id, code) do nothing;

  insert into public.role_permissions (role_id, permission_id)
  select r.id, p.id
  from public.roles r
  join public.permissions p on p.active
  where r.organization_id = p_organization
    and ((r.code = 'tenant_admin' and (p.code in (
            'tenant.manage', 'audit.read', 'cylinder.read', 'cylinder.write', 'cylinder.deactivate',
            'cylinder.identifier', 'cylinder.stock_in', 'cylinder.test', 'cylinder.history')
          or p.code ~ '^(customer|geofence|vehicle|driver|trip)\.'))
      or (r.code = 'stock_operator' and p.code in (
            'cylinder.read', 'cylinder.write', 'cylinder.stock_in', 'cylinder.history',
            'customer.read', 'geofence.read', 'vehicle.read', 'driver.read',
            'trip.read', 'trip.operate', 'trip.history'))
      or (r.code = 'technical_operator' and p.code in (
            'cylinder.read', 'cylinder.identifier', 'cylinder.test', 'cylinder.history', 'customer.read', 'vehicle.read'))
      or (r.code = 'tenant_auditor' and p.code in (
            'cylinder.read', 'cylinder.history',
            'customer.read', 'customer.history', 'geofence.read', 'geofence.history',
            'vehicle.read', 'vehicle.history', 'driver.read', 'driver.history',
            'trip.read', 'trip.history'))
      or (r.code = 'logistics_manager' and p.code in (
            'trip.read', 'trip.write', 'trip.operate', 'trip.cancel', 'trip.unlock', 'trip.history', 'trip.recipient',
            'cylinder.read', 'customer.read', 'geofence.read', 'vehicle.read', 'driver.read')))
  on conflict do nothing;
  perform set_config('app.system_bootstrap', 'off', true);
end $$;

revoke all on function private.bootstrap_tenant_roles(uuid) from public, anon, authenticated;

-- Descrições dos papéis de sistema que ganharam texto novo (o gatilho de proteção é suspenso só para esta atualização).
alter table public.roles disable trigger protect_system_role;
update public.roles set description = 'Administra usuários, papéis, auditoria, cilindros, cadastros e viagens do tenant'
 where system and code = 'tenant_admin' and description = 'Administra usuários, papéis, auditoria, cilindros e cadastros do tenant';
update public.roles set description = 'Cadastra cilindros, registra entradas no estoque e confere a carga das viagens'
 where system and code = 'stock_operator' and description = 'Cadastra cilindros e registra entradas no estoque';
update public.roles set description = 'Consulta cilindros, cadastros, viagens e o histórico, sem alterar nada'
 where system and code = 'tenant_auditor' and description = 'Consulta cilindros, cadastros e o histórico, sem alterar nada';
alter table public.roles enable trigger protect_system_role;

-- O papel Master possui todas as permissões ativas (Spec 002, RF-039): as de viagem entram nele.
do $$ begin
  perform set_config('app.system_bootstrap', 'on', true);
  insert into public.role_permissions (role_id, permission_id)
    select r.id, p.id from public.roles r join public.permissions p on p.code ~ '^trip\.' and p.active
     where r.code = 'master_fluxid' and r.organization_id is null
  on conflict do nothing;
  perform set_config('app.system_bootstrap', 'off', true);
end $$;

-- Tenants existentes recebem o papel novo e as concessões (idempotente).
select private.bootstrap_tenant_roles(id) from public.organizations where kind = 'tenant';
