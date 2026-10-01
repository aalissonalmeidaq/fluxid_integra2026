-- RF-009: todo tenant nasce inativo e só pode ser ativado com ao menos um Administrador do tenant ativo.

create function private.tenant_has_active_admin(p_organization uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(
    select 1
    from public.memberships m
    join public.membership_roles mr on mr.membership_id = m.id
    join public.roles r on r.id = mr.role_id and r.code = 'tenant_admin' and r.active and r.organization_id = p_organization
    where m.organization_id = p_organization and m.status = 'active'
  )
$$;

create function private.require_admin_for_tenant_activation()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.kind = 'tenant' and new.status = 'active' and old.status is distinct from 'active'
     and not private.tenant_has_active_admin(new.id) then
    raise exception using errcode = '23514', message = 'tenant_admin_required';
  end if;
  return new;
end $$;

create trigger require_admin_for_tenant_activation
  before update of status on public.organizations
  for each row execute function private.require_admin_for_tenant_activation();

revoke all on function private.tenant_has_active_admin(uuid), private.require_admin_for_tenant_activation() from public, anon, authenticated;

-- O estado inicial é sempre `inactive`; o parâmetro permanece por compatibilidade da assinatura.
create or replace function public.create_managed_organization(p_actor uuid,p_session uuid,p_legal_name text,p_display_name text,p_status text,p_justification text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare ctx jsonb; org public.organizations; admin_role uuid;
begin
  ctx:=public.global_actor_context(p_actor,p_session);
  if not coalesce((ctx->>'session_active')::boolean,false) or not coalesce((ctx->>'can_manage_platform')::boolean,false) then raise exception using errcode='42501',message='access_denied'; end if;
  insert into public.organizations(kind,legal_name,display_name,status) values('tenant',btrim(p_legal_name),btrim(p_display_name),'inactive') returning * into org;
  insert into public.roles(organization_id,code,name,description,scope,system) values(org.id,'tenant_admin','Administrador do tenant','Administra o tenant','tenant',true) returning id into admin_role;
  insert into public.role_permissions(role_id,permission_id) select admin_role,p.id from public.permissions p where p.code in ('tenant.manage','audit.read') and p.active;
  perform private.write_audit_event(org.id,p_actor,p_session,'organization.create','organization',org.id::text,'success',null,p_justification,'{}');
  return jsonb_build_object('id',org.id,'status',org.status,'version',org.version);
end; $$;

create or replace function public.change_managed_organization_status(p_actor uuid,p_session uuid,p_organization uuid,p_status text,p_expected_version bigint,p_justification text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare ctx jsonb; org public.organizations;
begin
  ctx:=public.global_actor_context(p_actor,p_session);
  if not coalesce((ctx->>'session_active')::boolean,false) or not coalesce((ctx->>'can_manage_platform')::boolean,false) then raise exception using errcode='42501',message='access_denied'; end if;
  if p_status = 'active' and not private.tenant_has_active_admin(p_organization) then
    return jsonb_build_object('kind','admin_required');
  end if;
  update public.organizations set status=p_status,version=version+1,updated_at=now() where id=p_organization and kind='tenant' and version=p_expected_version returning * into org;
  if org.id is null then return null; end if;
  perform private.write_audit_event(org.id,p_actor,p_session,'organization.status.change','organization',org.id::text,'success',null,p_justification,jsonb_build_object('status',org.status,'version',org.version));
  return jsonb_build_object('id',org.id,'status',org.status,'version',org.version);
end; $$;
