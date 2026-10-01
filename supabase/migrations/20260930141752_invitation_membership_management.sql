create index if not exists invitations_organization_created_idx on public.invitations(organization_id,created_at desc);

create function public.tenant_actor_authorized(p_actor uuid,p_session uuid,p_organization uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(
    select 1 from public.user_sessions s
    join public.memberships m on m.user_id=s.user_id and m.organization_id=p_organization and m.status='active'
    join public.organizations o on o.id=m.organization_id and o.status='active'
    join public.membership_roles mr on mr.membership_id=m.id
    join public.role_permissions rp on rp.role_id=mr.role_id
    join public.permissions p on p.id=rp.permission_id and p.code='tenant.manage' and p.active
    where s.user_id=p_actor and s.session_id=p_session and s.status='active' and s.expires_at>now() and s.last_seen_at>now()-interval '30 minutes'
  )
$$;

create function public.reserve_tenant_invitation(p_actor uuid,p_session uuid,p_organization uuid,p_email text,p_role uuid,p_justification text,p_resend boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare normalized text:=lower(btrim(p_email)); previous public.invitations; created public.invitations;
begin
  if not public.tenant_actor_authorized(p_actor,p_session,p_organization) then return jsonb_build_object('kind','access_denied'); end if;
  if char_length(normalized)>254 or normalized !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or char_length(btrim(p_justification)) not between 10 and 500 then return jsonb_build_object('kind','invalid'); end if;
  if not exists(select 1 from public.roles r where r.id=p_role and r.organization_id=p_organization and r.scope='tenant' and r.active) then return jsonb_build_object('kind','invalid'); end if;
  perform pg_advisory_xact_lock(hashtextextended(p_organization::text||':'||normalized,0));
  select * into previous from public.invitations i where i.organization_id=p_organization and i.email_normalized=normalized order by i.created_at desc limit 1 for update;
  if previous.id is not null and previous.status in ('pending_delivery','sent') and not p_resend then return jsonb_build_object('kind','conflict'); end if;
  if previous.id is not null and p_resend and previous.created_at>now()-interval '5 minutes' then return jsonb_build_object('kind','delivery_pending'); end if;
  update public.invitations set status='revoked',revoked_at=now() where organization_id=p_organization and email_normalized=normalized and status in ('pending_delivery','sent');
  insert into public.invitations(organization_id,email_normalized,intended_role_id,created_by,expires_at) values(p_organization,normalized,p_role,p_actor,now()+interval '72 hours') returning * into created;
  perform private.write_audit_event(p_organization,p_actor,p_session,'invitation.reserve','invitation',created.id::text,'success',null,p_justification,'{}');
  return jsonb_build_object('kind','reserved','id',created.id,'expires_at',created.expires_at);
end $$;

create function public.mark_invitation_delivery(p_invitation uuid,p_status text,p_auth_invite_id text default null)
returns void language plpgsql security definer set search_path='' as $$
begin
  if p_status not in ('sent','delivery_failed') then raise exception using errcode='22023',message='invalid_status'; end if;
  update public.invitations set status=p_status,auth_invite_id=case when p_status='sent' then left(p_auth_invite_id,200) else null end,sent_at=case when p_status='sent' then now() else null end where id=p_invitation and status='pending_delivery';
  if not found then raise exception using errcode='40001',message='invitation_state_conflict'; end if;
end $$;

create function public.accept_tenant_invitation(p_actor uuid,p_session uuid,p_invitation uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare invitation public.invitations; actor_email text; membership public.memberships;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_invitation::text,0));
  select * into invitation from public.invitations where id=p_invitation for update;
  if invitation.id is null or invitation.status in ('accepted','revoked') then return jsonb_build_object('kind','conflict'); end if;
  if invitation.expires_at<=now() then update public.invitations set status='expired' where id=p_invitation; return jsonb_build_object('kind','expired'); end if;
  if invitation.status<>'sent' then return jsonb_build_object('kind','conflict'); end if;
  if not exists(select 1 from public.user_sessions s where s.user_id=p_actor and s.session_id=p_session and s.status='active' and s.expires_at>now() and s.last_seen_at>now()-interval '30 minutes') then return jsonb_build_object('kind','conflict'); end if;
  select lower(email) into actor_email from auth.users where id=p_actor;
  if actor_email is distinct from invitation.email_normalized then return jsonb_build_object('kind','conflict'); end if;
  insert into public.memberships(organization_id,user_id,status,invited_at,activated_at) values(invitation.organization_id,p_actor,'active',invitation.created_at,now())
    on conflict(organization_id,user_id) do update set status='active',activated_at=now(),blocked_at=null,inactivated_at=null,version=public.memberships.version+1,updated_at=now() returning * into membership;
  insert into public.membership_roles(membership_id,role_id,assigned_by) values(membership.id,invitation.intended_role_id,invitation.created_by) on conflict do nothing;
  update public.invitations set status='accepted',accepted_at=now() where id=p_invitation;
  perform private.write_audit_event(invitation.organization_id,p_actor,p_session,'invitation.accept','invitation',invitation.id::text,'success',null,null,'{}');
  return jsonb_build_object('kind','accepted','membership_id',membership.id);
end $$;

create function public.change_tenant_membership_status(p_actor uuid,p_session uuid,p_organization uuid,p_membership uuid,p_status text,p_expected_version bigint,p_justification text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare target public.memberships; admin_role uuid; active_admins bigint;
begin
  if not public.tenant_actor_authorized(p_actor,p_session,p_organization) then return jsonb_build_object('kind','access_denied'); end if;
  if p_status not in ('active','blocked','inactive') or char_length(btrim(p_justification)) not between 10 and 500 then return jsonb_build_object('kind','conflict'); end if;
  perform pg_advisory_xact_lock(hashtextextended(p_organization::text||':tenant-admin',0));
  select * into target from public.memberships where id=p_membership and organization_id=p_organization for update;
  if target.id is null or target.version<>p_expected_version then return jsonb_build_object('kind','conflict'); end if;
  if p_status in ('blocked','inactive') then
    select r.id into admin_role from public.roles r join public.membership_roles mr on mr.role_id=r.id where mr.membership_id=target.id and r.organization_id=p_organization and r.code='tenant_admin' and r.active limit 1;
    if admin_role is not null then
      select count(distinct m.id) into active_admins from public.memberships m join public.membership_roles mr on mr.membership_id=m.id where m.organization_id=p_organization and m.status='active' and mr.role_id=admin_role and m.id<>target.id;
      if active_admins=0 then return jsonb_build_object('kind','last_admin'); end if;
    end if;
  end if;
  update public.memberships set status=p_status,version=version+1,updated_at=now(),blocked_at=case when p_status='blocked' then now() else null end,inactivated_at=case when p_status='inactive' then now() else null end,activated_at=case when p_status='active' then now() else activated_at end where id=target.id returning * into target;
  perform private.write_audit_event(p_organization,p_actor,p_session,'membership.status.change','membership',target.id::text,'success',null,p_justification,jsonb_build_object('status',target.status,'version',target.version));
  return jsonb_build_object('kind','changed','membership',jsonb_build_object('id',target.id,'organization_id',target.organization_id,'status',target.status,'version',target.version));
end $$;

revoke all on function public.tenant_actor_authorized(uuid,uuid,uuid),public.reserve_tenant_invitation(uuid,uuid,uuid,text,uuid,text,boolean),public.mark_invitation_delivery(uuid,text,text),public.accept_tenant_invitation(uuid,uuid,uuid),public.change_tenant_membership_status(uuid,uuid,uuid,uuid,text,bigint,text) from public,anon,authenticated;
grant execute on function public.tenant_actor_authorized(uuid,uuid,uuid),public.reserve_tenant_invitation(uuid,uuid,uuid,text,uuid,text,boolean),public.mark_invitation_delivery(uuid,text,text),public.accept_tenant_invitation(uuid,uuid,uuid),public.change_tenant_membership_status(uuid,uuid,uuid,uuid,text,bigint,text) to service_role;
