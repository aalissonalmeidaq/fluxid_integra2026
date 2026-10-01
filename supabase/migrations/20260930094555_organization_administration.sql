create function public.global_actor_context(p_actor uuid, p_session uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'session_active', exists(select 1 from public.user_sessions s where s.user_id=p_actor and s.session_id=p_session and s.status='active' and s.expires_at>now() and s.last_seen_at>now()-interval '30 minutes'),
    'can_manage_platform', exists(
      select 1 from public.memberships m
      join public.organizations o on o.id=m.organization_id and o.kind='owner' and o.status='active'
      join public.membership_roles mr on mr.membership_id=m.id
      join public.roles r on r.id=mr.role_id and r.active and r.scope='global'
      join public.role_permissions rp on rp.role_id=r.id
      join public.permissions p on p.id=rp.permission_id and p.code='platform.manage' and p.active
      where m.user_id=p_actor and m.status='active'),
    'can_manage_master', exists(
      select 1 from public.memberships m join public.membership_roles mr on mr.membership_id=m.id
      join public.roles r on r.id=mr.role_id and r.code='master_fluxid' and r.active
      where m.user_id=p_actor and m.status='active'));
$$;

create function public.list_managed_organizations(p_actor uuid, p_session uuid)
returns table(id uuid, legal_name text, display_name text, status text, version bigint)
language plpgsql security definer set search_path = '' as $$
begin
  if not coalesce((public.global_actor_context(p_actor,p_session)->>'session_active')::boolean,false)
     or not coalesce((public.global_actor_context(p_actor,p_session)->>'can_manage_platform')::boolean,false) then
    raise exception using errcode='42501', message='access_denied';
  end if;
  return query select o.id,o.legal_name,o.display_name,o.status,o.version from public.organizations o where o.kind='tenant' order by o.created_at,o.id;
end; $$;

create function public.create_managed_organization(p_actor uuid,p_session uuid,p_legal_name text,p_display_name text,p_status text,p_justification text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare ctx jsonb; org public.organizations; admin_role uuid;
begin
  ctx:=public.global_actor_context(p_actor,p_session);
  if not coalesce((ctx->>'session_active')::boolean,false) or not coalesce((ctx->>'can_manage_platform')::boolean,false) then raise exception using errcode='42501',message='access_denied'; end if;
  insert into public.organizations(kind,legal_name,display_name,status) values('tenant',btrim(p_legal_name),btrim(p_display_name),p_status) returning * into org;
  insert into public.roles(organization_id,code,name,description,scope,system) values(org.id,'tenant_admin','Administrador do tenant','Administra o tenant','tenant',true) returning id into admin_role;
  insert into public.role_permissions(role_id,permission_id) select admin_role,p.id from public.permissions p where p.code in ('tenant.manage','audit.read') and p.active;
  perform private.write_audit_event(org.id,p_actor,p_session,'organization.create','organization',org.id::text,'success',null,p_justification,'{}');
  return jsonb_build_object('id',org.id,'status',org.status,'version',org.version);
end; $$;

create function public.change_managed_organization_status(p_actor uuid,p_session uuid,p_organization uuid,p_status text,p_expected_version bigint,p_justification text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare ctx jsonb; org public.organizations;
begin
  ctx:=public.global_actor_context(p_actor,p_session);
  if not coalesce((ctx->>'session_active')::boolean,false) or not coalesce((ctx->>'can_manage_platform')::boolean,false) then raise exception using errcode='42501',message='access_denied'; end if;
  update public.organizations set status=p_status,version=version+1,updated_at=now() where id=p_organization and kind='tenant' and version=p_expected_version returning * into org;
  if org.id is null then return null; end if;
  perform private.write_audit_event(org.id,p_actor,p_session,'organization.status.change','organization',org.id::text,'success',null,p_justification,jsonb_build_object('status',org.status,'version',org.version));
  return jsonb_build_object('id',org.id,'status',org.status,'version',org.version);
end; $$;

create function public.invite_first_tenant_admin(p_actor uuid,p_session uuid,p_organization uuid,p_email text,p_justification text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare ctx jsonb; role_id uuid; invitation_id uuid;
begin
  ctx:=public.global_actor_context(p_actor,p_session);
  if not coalesce((ctx->>'session_active')::boolean,false) or not coalesce((ctx->>'can_manage_platform')::boolean,false) then raise exception using errcode='42501',message='access_denied'; end if;
  select r.id into role_id from public.roles r where r.organization_id=p_organization and r.code='tenant_admin' and r.active;
  if role_id is null then raise exception using errcode='22023',message='invalid_tenant'; end if;
  update public.invitations set status='revoked',revoked_at=now() where organization_id=p_organization and email_normalized=lower(btrim(p_email)) and status in ('pending_delivery','sent');
  insert into public.invitations(organization_id,email_normalized,intended_role_id,created_by) values(p_organization,lower(btrim(p_email)),role_id,p_actor) returning id into invitation_id;
  perform private.write_audit_event(p_organization,p_actor,p_session,'organization.first_admin.invite','invitation',invitation_id::text,'success',null,p_justification,'{}');
  return invitation_id;
end; $$;

revoke all on function public.global_actor_context(uuid,uuid), public.list_managed_organizations(uuid,uuid), public.create_managed_organization(uuid,uuid,text,text,text,text), public.change_managed_organization_status(uuid,uuid,uuid,text,bigint,text), public.invite_first_tenant_admin(uuid,uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.global_actor_context(uuid,uuid), public.list_managed_organizations(uuid,uuid), public.create_managed_organization(uuid,uuid,text,text,text,text), public.change_managed_organization_status(uuid,uuid,uuid,text,bigint,text), public.invite_first_tenant_admin(uuid,uuid,uuid,text,text) to service_role;
