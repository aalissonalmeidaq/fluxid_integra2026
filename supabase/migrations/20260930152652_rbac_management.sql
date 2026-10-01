-- Gestão de papéis e atribuições do tenant. Todas as funções exigem sessão vigente e `tenant.manage` no tenant
-- (public.tenant_actor_authorized), ficam restritas ao service_role e registram auditoria na mesma transação.

create function public.list_tenant_access(p_actor uuid, p_session uuid, p_organization uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.tenant_actor_authorized(p_actor, p_session, p_organization) then
    return jsonb_build_object('kind', 'access_denied');
  end if;
  return jsonb_build_object(
    'kind', 'listed',
    'roles', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id, 'code', r.code, 'name', r.name, 'description', r.description, 'system', r.system,
        'active', r.active, 'version', r.version,
        'permissions', coalesce((
          select jsonb_agg(p.code order by p.code)
          from public.role_permissions rp join public.permissions p on p.id = rp.permission_id
          where rp.role_id = r.id), '[]'::jsonb)) order by r.system desc, r.name, r.id)
      from public.roles r
      where r.organization_id = p_organization and r.scope = 'tenant'), '[]'::jsonb),
    'permissions', coalesce((
      select jsonb_agg(jsonb_build_object('code', p.code, 'description', p.description, 'critical', p.critical, 'delegable', p.delegability = 'tenant_delegable') order by p.code)
      from public.permissions p where p.active), '[]'::jsonb),
    'assignments', coalesce((
      select jsonb_agg(jsonb_build_object('membership_id', mr.membership_id, 'role_id', mr.role_id) order by mr.membership_id, mr.role_id)
      from public.membership_roles mr join public.memberships m on m.id = mr.membership_id
      where m.organization_id = p_organization), '[]'::jsonb));
end $$;

create function public.save_tenant_role(
  p_actor uuid, p_session uuid, p_organization uuid, p_role uuid,
  p_name text, p_description text, p_permissions text[], p_expected_version bigint, p_justification text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  normalized text := btrim(coalesce(p_name, ''));
  codes text[];
  target public.roles;
begin
  if not public.tenant_actor_authorized(p_actor, p_session, p_organization) then
    return jsonb_build_object('kind', 'access_denied');
  end if;
  if char_length(normalized) not between 2 and 80
     or char_length(coalesce(p_description, '')) > 300
     or char_length(btrim(coalesce(p_justification, ''))) not between 10 and 500 then
    return jsonb_build_object('kind', 'invalid');
  end if;

  select coalesce(array_agg(distinct c), '{}') into codes from unnest(coalesce(p_permissions, '{}')) c;
  if (select count(*) from public.permissions p where p.code = any(codes) and p.active) <> coalesce(array_length(codes, 1), 0) then
    return jsonb_build_object('kind', 'invalid');
  end if;
  if exists (select 1 from public.permissions p where p.code = any(codes) and (p.delegability <> 'tenant_delegable' or p.scope <> 'tenant')) then
    return jsonb_build_object('kind', 'not_delegable');
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_organization::text || ':roles', 0));
  if p_role is null then
    insert into public.roles (organization_id, code, name, description, scope, system)
    values (p_organization, 'custom_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12), normalized, coalesce(p_description, ''), 'tenant', false)
    returning * into target;
    perform private.write_audit_event(p_organization, p_actor, p_session, 'role.create', 'role', target.id::text, 'success', null, p_justification,
      jsonb_build_object('permissions', to_jsonb(codes), 'version', target.version));
  else
    select * into target from public.roles
     where id = p_role and organization_id = p_organization and scope = 'tenant' for update;
    if target.id is null then return jsonb_build_object('kind', 'unavailable'); end if;
    if target.system then return jsonb_build_object('kind', 'immutable'); end if;
    if target.version <> p_expected_version then return jsonb_build_object('kind', 'conflict'); end if;
    update public.roles set name = normalized, description = coalesce(p_description, ''), version = version + 1, updated_at = now()
     where id = target.id returning * into target;
    delete from public.role_permissions where role_id = target.id;
    perform private.write_audit_event(p_organization, p_actor, p_session, 'role.update', 'role', target.id::text, 'success', null, p_justification,
      jsonb_build_object('permissions', to_jsonb(codes), 'version', target.version));
  end if;

  insert into public.role_permissions (role_id, permission_id)
  select target.id, p.id from public.permissions p where p.code = any(codes);
  return jsonb_build_object('kind', 'saved', 'role', jsonb_build_object('id', target.id, 'version', target.version));
end $$;

create function public.set_tenant_role_active(
  p_actor uuid, p_session uuid, p_organization uuid, p_role uuid, p_active boolean, p_expected_version bigint, p_justification text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare target public.roles;
begin
  if not public.tenant_actor_authorized(p_actor, p_session, p_organization) then
    return jsonb_build_object('kind', 'access_denied');
  end if;
  if char_length(btrim(coalesce(p_justification, ''))) not between 10 and 500 then
    return jsonb_build_object('kind', 'invalid');
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_organization::text || ':roles', 0));
  select * into target from public.roles
   where id = p_role and organization_id = p_organization and scope = 'tenant' for update;
  if target.id is null then return jsonb_build_object('kind', 'unavailable'); end if;
  if target.system then return jsonb_build_object('kind', 'immutable'); end if;
  if target.version <> p_expected_version then return jsonb_build_object('kind', 'conflict'); end if;
  update public.roles set active = p_active, version = version + 1, updated_at = now()
   where id = target.id returning * into target;
  perform private.write_audit_event(p_organization, p_actor, p_session,
    case when p_active then 'role.activate' else 'role.deactivate' end, 'role', target.id::text, 'success', null, p_justification,
    jsonb_build_object('version', target.version));
  return jsonb_build_object('kind', 'saved', 'role', jsonb_build_object('id', target.id, 'version', target.version, 'active', target.active));
end $$;

create function public.change_tenant_role_assignment(
  p_actor uuid, p_session uuid, p_organization uuid, p_membership uuid, p_role uuid, p_assign boolean, p_justification text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare target_membership public.memberships; target_role public.roles;
begin
  if not public.tenant_actor_authorized(p_actor, p_session, p_organization) then
    return jsonb_build_object('kind', 'access_denied');
  end if;
  if char_length(btrim(coalesce(p_justification, ''))) not between 10 and 500 then
    return jsonb_build_object('kind', 'invalid');
  end if;
  select * into target_membership from public.memberships where id = p_membership and organization_id = p_organization;
  select * into target_role from public.roles where id = p_role and organization_id = p_organization and scope = 'tenant';
  if target_membership.id is null or target_role.id is null then
    return jsonb_build_object('kind', 'unavailable');
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_organization::text || ':tenant-admin', 0));
  if p_assign then
    if not target_role.active or target_membership.status <> 'active' then
      return jsonb_build_object('kind', 'invalid');
    end if;
    insert into public.membership_roles (membership_id, role_id, assigned_by)
    values (p_membership, p_role, p_actor) on conflict do nothing;
  else
    if target_role.code = 'tenant_admin' and target_role.system
       and not private.ensure_tenant_admin_remains(p_organization, p_membership) then
      return jsonb_build_object('kind', 'last_admin');
    end if;
    delete from public.membership_roles where membership_id = p_membership and role_id = p_role;
  end if;

  perform private.write_audit_event(p_organization, p_actor, p_session,
    case when p_assign then 'role.assign' else 'role.unassign' end, 'membership', p_membership::text, 'success', null, p_justification,
    jsonb_build_object('role_id', p_role));
  return jsonb_build_object('kind', case when p_assign then 'assigned' else 'removed' end);
end $$;

revoke all on function
  public.list_tenant_access(uuid, uuid, uuid),
  public.save_tenant_role(uuid, uuid, uuid, uuid, text, text, text[], bigint, text),
  public.set_tenant_role_active(uuid, uuid, uuid, uuid, boolean, bigint, text),
  public.change_tenant_role_assignment(uuid, uuid, uuid, uuid, uuid, boolean, text)
from public, anon, authenticated;
grant execute on function
  public.list_tenant_access(uuid, uuid, uuid),
  public.save_tenant_role(uuid, uuid, uuid, uuid, text, text, text[], bigint, text),
  public.set_tenant_role_active(uuid, uuid, uuid, uuid, boolean, bigint, text),
  public.change_tenant_role_assignment(uuid, uuid, uuid, uuid, uuid, boolean, text)
to service_role;
