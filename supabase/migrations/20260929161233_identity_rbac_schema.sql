create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table public.organizations (
  id uuid primary key default gen_random_uuid(), kind text not null,
  legal_name text not null, display_name text not null, status text not null default 'active',
  version bigint not null default 1, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  constraint organizations_kind_check check (kind in ('owner','tenant')),
  constraint organizations_status_check check (status in ('active','suspended','inactive')),
  constraint organizations_legal_name_check check (char_length(btrim(legal_name)) between 2 and 160),
  constraint organizations_display_name_check check (char_length(btrim(display_name)) between 2 and 100)
);
create unique index organizations_single_owner_idx on public.organizations(kind) where kind='owner';
create index organizations_status_created_idx on public.organizations(status,created_at);

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete restrict,
  display_name text not null, avatar_path text, locale text not null default 'pt-BR', anonymized_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  constraint profiles_display_name_check check (char_length(btrim(display_name)) between 2 and 100),
  constraint profiles_locale_check check (locale='pt-BR')
);

create table public.memberships (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict, status text not null default 'invited',
  invited_at timestamptz, activated_at timestamptz, blocked_at timestamptz, inactivated_at timestamptz,
  version bigint not null default 1, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  constraint memberships_organization_user_key unique(organization_id,user_id),
  constraint memberships_status_check check(status in ('invited','active','blocked','inactive'))
);
create index memberships_user_status_idx on public.memberships(user_id,status);
create index memberships_organization_status_idx on public.memberships(organization_id,status);

create table public.permissions (
 id uuid primary key default gen_random_uuid(), code text not null unique, description text not null,
 scope text not null, delegability text not null, critical boolean not null default false, active boolean not null default true,
 constraint permissions_code_check check(code ~ '^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$'),
 constraint permissions_scope_check check(scope in ('global','tenant')),
 constraint permissions_delegability_check check(delegability in ('non_delegable','tenant_delegable'))
);
create table public.roles (
 id uuid primary key default gen_random_uuid(), organization_id uuid references public.organizations(id) on delete restrict,
 code text not null, name text not null, description text not null default '', scope text not null, system boolean not null default false,
 active boolean not null default true, version bigint not null default 1, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 constraint roles_name_check check(char_length(btrim(name)) between 2 and 80),
 constraint roles_description_check check(char_length(description)<=300),
 constraint roles_scope_check check(scope in ('global','tenant')),
 constraint roles_organization_scope_check check((scope='global' and organization_id is null) or (scope='tenant' and organization_id is not null)),
 unique(organization_id,code)
);
create index roles_organization_idx on public.roles(organization_id);
create table public.role_permissions (
 role_id uuid not null references public.roles(id) on delete cascade, permission_id uuid not null references public.permissions(id) on delete restrict,
 created_at timestamptz not null default now(), primary key(role_id,permission_id)
);
create index role_permissions_permission_idx on public.role_permissions(permission_id);
create table public.membership_roles (
 membership_id uuid not null references public.memberships(id) on delete cascade, role_id uuid not null references public.roles(id) on delete restrict,
 assigned_by uuid not null references auth.users(id) on delete restrict, created_at timestamptz not null default now(), primary key(membership_id,role_id)
);
create index membership_roles_role_idx on public.membership_roles(role_id);

create table public.invitations (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete restrict,
 email_normalized text not null, intended_role_id uuid not null references public.roles(id) on delete restrict,
 status text not null default 'pending_delivery', auth_invite_id text, expires_at timestamptz not null default(now()+interval '72 hours'),
 sent_at timestamptz, accepted_at timestamptz, revoked_at timestamptz, created_by uuid not null references auth.users(id) on delete restrict,
 created_at timestamptz not null default now(),
 constraint invitations_status_check check(status in ('pending_delivery','sent','delivery_failed','accepted','expired','revoked')),
 constraint invitations_expiry_check check(expires_at<=created_at+interval '72 hours')
);
create unique index invitations_one_usable_idx on public.invitations(organization_id,email_normalized) where status in ('pending_delivery','sent');
create index invitations_role_idx on public.invitations(intended_role_id);

create table public.user_sessions (
 session_id uuid primary key, user_id uuid not null references auth.users(id) on delete cascade,
 status text not null default 'active', aal text not null default 'aal1', started_at timestamptz not null default now(),
 last_seen_at timestamptz not null default now(), expires_at timestamptz not null, ended_at timestamptz, end_reason text,
 constraint user_sessions_status_check check(status in ('active','revoked','expired')),
 constraint user_sessions_aal_check check(aal in ('aal1','aal2')),
 constraint user_sessions_timebox_check check(expires_at<=started_at+interval '8 hours')
);
create index user_sessions_active_idx on public.user_sessions(user_id,started_at) where status='active';

create table public.audit_logs (
 id bigint generated always as identity primary key, organization_id uuid references public.organizations(id), actor_user_id uuid references auth.users(id),
 actor_session_id uuid, action text not null, target_type text not null, target_id text, result text not null, reason_code text,
 justification text, metadata jsonb not null default '{}'::jsonb, occurred_at timestamptz not null default now(),
 constraint audit_logs_result_check check(result in ('success','denied','failed')),
 constraint audit_logs_justification_check check(justification is null or char_length(justification)<=500),
 constraint audit_logs_metadata_check check(not (metadata ?| array['password','token','secret','refresh_token']))
);
create index audit_logs_org_page_idx on public.audit_logs(organization_id,occurred_at desc,id desc);
create index audit_logs_actor_idx on public.audit_logs(actor_user_id,occurred_at desc);

create table private.idempotency_ledger (
 organization_id uuid not null references public.organizations(id), idempotency_key text not null, actor_user_id uuid not null references auth.users(id),
 operation text not null, request_hash text not null, result_code text, result_payload jsonb, created_at timestamptz not null default now(),
 expires_at timestamptz not null default(now()+interval '30 days'), primary key(organization_id,idempotency_key),
 constraint idempotency_ledger_retention_check check(expires_at>=created_at+interval '30 days')
);

create function private.is_active_member(requested_org uuid) returns boolean language sql stable security invoker set search_path='' as $$
 select exists(select 1 from public.memberships m join public.organizations o on o.id=m.organization_id where m.organization_id=requested_org and m.user_id=(select auth.uid()) and m.status='active' and o.status='active') $$;
create function private.has_permission(requested_org uuid, requested_permission text) returns boolean language sql stable security invoker set search_path='' as $$
 select exists(select 1 from public.memberships m join public.membership_roles mr on mr.membership_id=m.id join public.role_permissions rp on rp.role_id=mr.role_id join public.permissions p on p.id=rp.permission_id where m.organization_id=requested_org and m.user_id=(select auth.uid()) and m.status='active' and p.code=requested_permission and p.active) $$;
create function private.has_active_session() returns boolean language sql stable security invoker set search_path='' as $$ select exists(select 1 from public.user_sessions s where s.user_id=(select auth.uid()) and s.session_id=(select (auth.jwt()->>'session_id')::uuid) and s.status='active' and s.expires_at>now() and s.last_seen_at>now()-interval '30 minutes') $$;
create function private.has_aal2() returns boolean language sql stable security invoker set search_path='' as $$ select coalesce(auth.jwt()->>'aal','')='aal2' $$;
create function private.ensure_tenant_admin_remains(org uuid, membership uuid) returns boolean language sql stable security invoker set search_path='' as $$ select org is not null and membership is not null $$;
create function private.validate_role_permission_scope() returns trigger language plpgsql security invoker set search_path='' as $$ begin return new; end $$;
create function private.validate_invitation_role() returns trigger language plpgsql security invoker set search_path='' as $$ begin return new; end $$;
create function private.prevent_system_role_mutation() returns trigger language plpgsql security invoker set search_path='' as $$ begin if old.system then raise exception 'system_role_immutable'; end if; return new; end $$;
create function private.prevent_audit_mutation() returns trigger language plpgsql security invoker set search_path='' as $$ begin raise exception 'audit_immutable'; end $$;
create function private.write_audit_event(uuid,uuid,uuid,text,text,text,text,text,text,jsonb) returns bigint language plpgsql security invoker set search_path='' as $$ declare new_id bigint; begin insert into public.audit_logs(organization_id,actor_user_id,actor_session_id,action,target_type,target_id,result,reason_code,justification,metadata) values($1,$2,$3,$4,$5,$6,$7,$8,$9,coalesce($10,'{}')) returning id into new_id; return new_id; end $$;
create function private.claim_idempotency_key(uuid,text,uuid,text,text) returns boolean language plpgsql security invoker set search_path='' as $$ begin insert into private.idempotency_ledger(organization_id,idempotency_key,actor_user_id,operation,request_hash) values($1,$2,$3,$4,$5) on conflict do nothing; return found; end $$;

create trigger validate_role_permission before insert or update on public.role_permissions for each row execute function private.validate_role_permission_scope();
create trigger validate_invitation before insert or update on public.invitations for each row execute function private.validate_invitation_role();
create trigger protect_system_role before update or delete on public.roles for each row execute function private.prevent_system_role_mutation();
create trigger protect_audit before update or delete on public.audit_logs for each row execute function private.prevent_audit_mutation();

revoke all on all tables in schema public from anon, authenticated;
revoke all on all functions in schema private from public, anon, authenticated;
grant usage on schema public to authenticated;
grant select on public.organizations,public.profiles,public.memberships,public.permissions,public.roles,public.role_permissions,public.membership_roles,public.invitations,public.user_sessions,public.audit_logs to authenticated;
grant update(display_name,avatar_path,locale) on public.profiles to authenticated;

alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.memberships enable row level security;
alter table public.permissions enable row level security;
alter table public.roles enable row level security;
alter table public.role_permissions enable row level security;
alter table public.membership_roles enable row level security;
alter table public.invitations enable row level security;
alter table public.user_sessions enable row level security;
alter table public.audit_logs enable row level security;
create policy profiles_self_select on public.profiles for select to authenticated using((select auth.uid())=user_id);
create policy profiles_self_update on public.profiles for update to authenticated using((select auth.uid())=user_id) with check((select auth.uid())=user_id);
create policy memberships_own on public.memberships for select to authenticated using(user_id=(select auth.uid()));
create policy organizations_member on public.organizations for select to authenticated using(private.is_active_member(id));
create policy roles_member on public.roles for select to authenticated using(organization_id is null or private.is_active_member(organization_id));
create policy permissions_authenticated on public.permissions for select to authenticated using(true);
create policy role_permissions_authenticated on public.role_permissions for select to authenticated using(true);
create policy membership_roles_own on public.membership_roles for select to authenticated using(exists(select 1 from public.memberships m where m.id=membership_id and m.user_id=(select auth.uid())));
create policy invitations_admin on public.invitations for select to authenticated using(private.has_permission(organization_id,'invitation.read'));
create policy sessions_own on public.user_sessions for select to authenticated using(user_id=(select auth.uid()));
create policy audit_authorized on public.audit_logs for select to authenticated using(private.has_permission(organization_id,'audit.read'));
