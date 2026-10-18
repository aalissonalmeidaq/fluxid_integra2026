-- Spec 012: 3 permissões do lacre (RF-038; contracts/permissoes-e-papeis.md). Nenhum papel perde permissão; `seal.admin` é crítica.

insert into public.permissions (id, code, description, scope, delegability, critical) values
  ('40000000-0000-0000-0000-000000000050', 'seal.read', 'Ver lacres, posições, comandos, violações e alertas, e receber as notificações', 'tenant', 'tenant_delegable', false),
  ('40000000-0000-0000-0000-000000000051', 'seal.operate', 'Vincular e desvincular lacres, pedir travar ou destravar, reconhecer e encerrar alertas', 'tenant', 'tenant_delegable', false),
  ('40000000-0000-0000-0000-000000000052', 'seal.admin', 'Cadastrar, editar, desativar e trocar a chave de dispositivos, e alterar as redes Wi-Fi dos lacres', 'tenant', 'tenant_delegable', true)
on conflict (id) do nothing;

-- Papéis padrão de cada tenant: os mapeamentos das Specs 006, 007 e 008 são mantidos e os do lacre acrescentados.
create or replace function private.bootstrap_tenant_roles(p_organization uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform set_config('app.system_bootstrap', 'on', true);
  insert into public.roles (organization_id, code, name, description, scope, system) values
    (p_organization, 'tenant_admin', 'Administrador do tenant', 'Administra usuários, papéis, auditoria, cilindros, cadastros, viagens e lacres do tenant', 'tenant', true),
    (p_organization, 'technical_operator', 'Operador técnico', 'Mantém identificadores e registra testes hidrostáticos de cilindros', 'tenant', true),
    (p_organization, 'stock_operator', 'Operador de estoque', 'Cadastra cilindros, registra entradas no estoque, confere a carga das viagens e vincula lacres', 'tenant', true),
    (p_organization, 'tenant_auditor', 'Auditor do tenant', 'Consulta cilindros, cadastros, viagens, lacres e o histórico, sem alterar nada', 'tenant', true),
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

-- Descrições dos papéis de sistema que ganharam texto novo (o gatilho de proteção é suspenso só para esta atualização).
alter table public.roles disable trigger protect_system_role;
update public.roles set description = 'Administra usuários, papéis, auditoria, cilindros, cadastros, viagens e lacres do tenant'
 where system and code = 'tenant_admin' and description = 'Administra usuários, papéis, auditoria, cilindros, cadastros e viagens do tenant';
update public.roles set description = 'Cadastra cilindros, registra entradas no estoque, confere a carga das viagens e vincula lacres'
 where system and code = 'stock_operator' and description = 'Cadastra cilindros, registra entradas no estoque e confere a carga das viagens';
update public.roles set description = 'Consulta cilindros, cadastros, viagens, lacres e o histórico, sem alterar nada'
 where system and code = 'tenant_auditor' and description = 'Consulta cilindros, cadastros, viagens e o histórico, sem alterar nada';
update public.roles set description = 'Planeja e acompanha viagens, entregas, desbloqueios e lacres'
 where system and code = 'logistics_manager' and description = 'Planeja e acompanha viagens, entregas e desbloqueios';
alter table public.roles enable trigger protect_system_role;

-- O papel Master possui todas as permissões ativas (Spec 002, RF-039): as do lacre entram nele.
do $$ begin
  perform set_config('app.system_bootstrap', 'on', true);
  insert into public.role_permissions (role_id, permission_id)
    select r.id, p.id from public.roles r join public.permissions p on p.code ~ '^seal\.' and p.active
     where r.code = 'master_fluxid' and r.organization_id is null
  on conflict do nothing;
  perform set_config('app.system_bootstrap', 'off', true);
end $$;

-- Tenants existentes recebem as concessões (idempotente).
select private.bootstrap_tenant_roles(id) from public.organizations where kind = 'tenant';
