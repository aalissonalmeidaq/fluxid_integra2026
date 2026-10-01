-- RBAC: catálogo de referência, invariantes no banco e isolamento de role_permissions.
-- Os triggers de escopo e do último administrador eram stubs; a autorização não pode depender só das
-- funções de aplicação (RF-018, RF-021, RF-021A, RF-024, RN-008, RN-009).

-- 1. Catálogo inicial fechado (RF-021B) e papéis globais preestabelecidos: dados de referência, não de teste.
insert into public.permissions (id, code, description, scope, delegability, critical) values
  ('40000000-0000-0000-0000-000000000001', 'platform.manage', 'Administrar plataforma', 'global', 'non_delegable', true),
  ('40000000-0000-0000-0000-000000000002', 'tenant.manage', 'Administrar tenant', 'tenant', 'tenant_delegable', true),
  ('40000000-0000-0000-0000-000000000003', 'audit.read', 'Consultar auditoria', 'tenant', 'tenant_delegable', false),
  ('40000000-0000-0000-0000-000000000004', 'profile.read', 'Consultar perfil', 'tenant', 'tenant_delegable', false)
on conflict (id) do nothing;

insert into public.roles (id, organization_id, code, name, description, scope, system) values
  ('50000000-0000-0000-0000-000000000001', null, 'master_fluxid', 'Master FluxID', 'Papel global mestre', 'global', true),
  ('50000000-0000-0000-0000-000000000002', null, 'admin_fluxid', 'Administrador FluxID', 'Papel global administrativo', 'global', true)
on conflict (id) do nothing;

-- Master possui todas as permissões (RF-039); o Administrador FluxID administra a plataforma e audita, sem
-- tenant.manage e sem gerir usuários Master, que dependem do papel master_fluxid (RF-040, RN-002).
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.active
where (r.code = 'master_fluxid')
   or (r.code = 'admin_fluxid' and p.code in ('platform.manage', 'audit.read', 'profile.read'))
on conflict do nothing;

-- 2. Última barreira do administrador do tenant: reutiliza a mesma serialização das funções de vínculo.
create or replace function private.ensure_tenant_admin_remains(org uuid, membership uuid)
returns boolean language plpgsql stable security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.organizations o where o.id = org and o.kind = 'tenant' and o.status = 'active') then
    return true;
  end if;
  if not exists (
    select 1 from public.memberships m
      join public.membership_roles mr on mr.membership_id = m.id
      join public.roles r on r.id = mr.role_id
     where m.id = membership and m.organization_id = org and m.status = 'active'
       and r.code = 'tenant_admin' and r.system and r.active) then
    return true;
  end if;
  return exists (
    select 1 from public.memberships m
      join public.membership_roles mr on mr.membership_id = m.id
      join public.roles r on r.id = mr.role_id
     where m.organization_id = org and m.id <> membership and m.status = 'active'
       and r.code = 'tenant_admin' and r.system and r.active);
end $$;

-- 3. Permissões de papel: preestabelecido só muda na instalação confiável; personalizado só aceita delegáveis do tenant.
create or replace function private.validate_role_permission_scope()
returns trigger language plpgsql security definer set search_path = '' as $$
declare target_role public.roles; target_permission public.permissions; target_role_id uuid;
begin
  target_role_id := case when tg_op = 'DELETE' then old.role_id else new.role_id end;
  select * into target_role from public.roles where id = target_role_id;
  if target_role.system and coalesce(current_setting('app.system_bootstrap', true), '') <> 'on' then
    raise exception using errcode = '42501', message = 'system_role_immutable';
  end if;
  if tg_op = 'DELETE' then return old; end if;

  select * into target_permission from public.permissions where id = new.permission_id;
  if not target_permission.active then
    raise exception using errcode = '23514', message = 'permission_inactive';
  end if;
  if not coalesce(target_role.system, false) then
    if target_role.scope <> 'tenant' then
      raise exception using errcode = '23514', message = 'role_scope_invalid';
    end if;
    if target_permission.delegability <> 'tenant_delegable' then
      raise exception using errcode = '23514', message = 'permission_not_delegable';
    end if;
    if target_permission.scope <> 'tenant' then
      raise exception using errcode = '23514', message = 'permission_scope_mismatch';
    end if;
  end if;
  return new;
end $$;

drop trigger validate_role_permission on public.role_permissions;
create trigger validate_role_permission
  before insert or update or delete on public.role_permissions
  for each row execute function private.validate_role_permission_scope();

-- 4. Atribuição de papel: mesmo escopo organizacional, papel ativo e vínculo ativo.
create function private.validate_membership_role()
returns trigger language plpgsql security definer set search_path = '' as $$
declare target_role public.roles; target_membership public.memberships; target_org public.organizations;
begin
  select * into target_role from public.roles where id = new.role_id;
  select * into target_membership from public.memberships where id = new.membership_id;
  select * into target_org from public.organizations where id = target_membership.organization_id;
  if not target_role.active then
    raise exception using errcode = '23514', message = 'role_inactive';
  end if;
  if target_role.scope = 'global' then
    if target_org.kind <> 'owner' then
      raise exception using errcode = '23514', message = 'global_role_outside_owner';
    end if;
  elsif target_org.kind = 'owner' or target_role.organization_id is distinct from target_membership.organization_id then
    raise exception using errcode = '23514', message = 'role_organization_mismatch';
  end if;
  if target_membership.status <> 'active' then
    raise exception using errcode = '23514', message = 'membership_not_active';
  end if;
  return new;
end $$;

create trigger validate_membership_role
  before insert or update on public.membership_roles
  for each row execute function private.validate_membership_role();

-- 5. Último administrador: remover o papel ou tirar o vínculo de ativo é recusado, inclusive por escrita direta.
create function private.guard_membership_role_removal()
returns trigger language plpgsql security definer set search_path = '' as $$
declare target_role public.roles; org_id uuid;
begin
  select * into target_role from public.roles where id = old.role_id;
  if target_role.code = 'tenant_admin' and target_role.system then
    select m.organization_id into org_id from public.memberships m where m.id = old.membership_id;
    if org_id is not null then
      perform pg_advisory_xact_lock(hashtextextended(org_id::text || ':tenant-admin', 0));
      if not private.ensure_tenant_admin_remains(org_id, old.membership_id) then
        raise exception using errcode = '23514', message = 'last_admin_required';
      end if;
    end if;
  end if;
  return old;
end $$;

create trigger guard_membership_role_removal
  before delete on public.membership_roles
  for each row execute function private.guard_membership_role_removal();

create function private.guard_membership_status()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.status = 'active' and new.status <> 'active' then
    perform pg_advisory_xact_lock(hashtextextended(new.organization_id::text || ':tenant-admin', 0));
    if not private.ensure_tenant_admin_remains(new.organization_id, new.id) then
      raise exception using errcode = '23514', message = 'last_admin_required';
    end if;
  end if;
  return new;
end $$;

create trigger guard_membership_status
  before update of status on public.memberships
  for each row execute function private.guard_membership_status();

-- 6. Convite só para papel ativo do próprio tenant; mudanças de estado do convite não reavaliam o papel.
create or replace function private.validate_invitation_role()
returns trigger language plpgsql security definer set search_path = '' as $$
declare target_role public.roles;
begin
  if tg_op = 'UPDATE' and new.intended_role_id = old.intended_role_id and new.organization_id = old.organization_id then
    return new;
  end if;
  select * into target_role from public.roles where id = new.intended_role_id;
  if target_role.id is null or target_role.scope <> 'tenant' or not target_role.active
     or target_role.organization_id is distinct from new.organization_id then
    raise exception using errcode = '23514', message = 'invitation_role_invalid';
  end if;
  return new;
end $$;

-- 7. Papéis preestabelecidos de cada tenant (RF-017): criados na instalação confiável do tenant.
create function private.bootstrap_tenant_roles(p_organization uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform set_config('app.system_bootstrap', 'on', true);
  insert into public.roles (organization_id, code, name, description, scope, system) values
    (p_organization, 'tenant_admin', 'Administrador do tenant', 'Administra usuários, papéis e auditoria do tenant', 'tenant', true),
    (p_organization, 'technical_operator', 'Operador técnico', 'Acesso somente ao próprio perfil nesta Spec', 'tenant', true),
    (p_organization, 'stock_operator', 'Operador de estoque', 'Acesso somente ao próprio perfil nesta Spec', 'tenant', true),
    (p_organization, 'driver', 'Motorista', 'Acesso somente ao próprio perfil nesta Spec', 'tenant', true)
  on conflict (organization_id, code) do nothing;
  insert into public.role_permissions (role_id, permission_id)
  select r.id, p.id
  from public.roles r
  join public.permissions p on p.code in ('tenant.manage', 'audit.read') and p.active
  where r.organization_id = p_organization and r.code = 'tenant_admin'
  on conflict do nothing;
  perform set_config('app.system_bootstrap', 'off', true);
end $$;

revoke all on function
  private.ensure_tenant_admin_remains(uuid, uuid), private.validate_membership_role(),
  private.guard_membership_role_removal(), private.guard_membership_status(),
  private.bootstrap_tenant_roles(uuid)
from public, anon, authenticated;

-- Tenants existentes recebem os papéis que já deveriam ter (idempotente).
select private.bootstrap_tenant_roles(id) from public.organizations where kind = 'tenant';

create or replace function public.create_managed_organization(p_actor uuid, p_session uuid, p_legal_name text, p_display_name text, p_status text, p_justification text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare ctx jsonb; org public.organizations;
begin
  ctx := public.global_actor_context(p_actor, p_session);
  if not coalesce((ctx->>'session_active')::boolean, false) or not coalesce((ctx->>'can_manage_platform')::boolean, false) then
    raise exception using errcode = '42501', message = 'access_denied';
  end if;
  insert into public.organizations (kind, legal_name, display_name, status)
    values ('tenant', btrim(p_legal_name), btrim(p_display_name), 'inactive') returning * into org;
  perform private.bootstrap_tenant_roles(org.id);
  perform private.write_audit_event(org.id, p_actor, p_session, 'organization.create', 'organization', org.id::text, 'success', null, p_justification, '{}');
  return jsonb_build_object('id', org.id, 'status', org.status, 'version', org.version);
end $$;

-- 8. Isolamento: role_permissions deixava de respeitar o tenant do papel (using true).
drop policy role_permissions_authenticated on public.role_permissions;
create policy role_permissions_member on public.role_permissions for select to authenticated
  using ((select private.has_active_session())
         and exists (select 1 from public.roles r
                      where r.id = role_id
                        and (r.organization_id is null or (select private.is_active_member(r.organization_id)))));
