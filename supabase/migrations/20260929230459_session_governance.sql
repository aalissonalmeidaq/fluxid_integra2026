-- Governança de sessões (US1): limite de três sessões, timebox de 8 horas, inatividade de 30 minutos,
-- elegibilidade de login, limite de tentativas e auditoria sanitizada de autenticação.
-- Todas as funções são de uso exclusivo do service_role, chamado somente pelas Edge Functions.

create table private.login_failures (
  key_hash text primary key check (key_hash ~ '^[0-9a-f]{64}$'),
  failures integer not null check (failures > 0),
  window_started_at timestamptz not null default now()
);
alter table private.login_failures enable row level security;
create index login_failures_window_idx on private.login_failures(window_started_at);

create function private.expire_user_session(p_session_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.user_sessions
     set status = 'expired', ended_at = now(), end_reason = p_reason
   where session_id = p_session_id and status = 'active';
  delete from auth.sessions where id = p_session_id;
end;
$$;

create function public.start_user_session(p_user_id uuid, p_session_id uuid, p_aal text default 'aal1')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  existing public.user_sessions%rowtype;
  stale record;
  active_count integer;
begin
  if p_aal not in ('aal1', 'aal2') then
    raise exception using errcode = '22023', message = 'invalid_session';
  end if;

  -- Serializa a criação por usuário para que o limite valha sob concorrência.
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

  for stale in
    select session_id, case when expires_at <= now() then 'timebox' else 'inactivity' end as reason
      from public.user_sessions
     where user_id = p_user_id and status = 'active'
       and (expires_at <= now() or last_seen_at <= now() - interval '30 minutes')
  loop
    perform private.expire_user_session(stale.session_id, stale.reason);
  end loop;

  select * into existing from public.user_sessions where session_id = p_session_id;
  if found then
    if existing.user_id <> p_user_id then
      raise exception using errcode = '42501', message = 'session_owner_mismatch';
    end if;
    if existing.status <> 'active' then
      return jsonb_build_object('status', 'ended');
    end if;
    if p_aal = 'aal2' and existing.aal = 'aal1' then
      update public.user_sessions set aal = 'aal2' where session_id = p_session_id;
    end if;
    return jsonb_build_object('status', 'started', 'expires_at', existing.expires_at);
  end if;

  select count(*) into active_count
    from public.user_sessions where user_id = p_user_id and status = 'active';

  if active_count >= 3 then
    return jsonb_build_object(
      'status', 'limit_reached',
      'sessions', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'session_id', s.session_id, 'started_at', s.started_at,
          'last_seen_at', s.last_seen_at, 'aal', s.aal) order by s.started_at), '[]'::jsonb)
          from public.user_sessions s where s.user_id = p_user_id and s.status = 'active'));
  end if;

  insert into public.user_sessions (session_id, user_id, aal, started_at, last_seen_at, expires_at)
  values (p_session_id, p_user_id, p_aal, now(), now(), now() + interval '8 hours');

  return jsonb_build_object('status', 'started', 'expires_at', now() + interval '8 hours');
end;
$$;

create function public.end_user_session(p_user_id uuid, p_session_id uuid, p_reason text default 'user_logout')
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  affected integer;
begin
  if p_reason is null or p_reason !~ '^[a-z_]{1,60}$' then
    raise exception using errcode = '22023', message = 'invalid_reason';
  end if;

  update public.user_sessions
     set status = 'revoked', ended_at = now(), end_reason = p_reason
   where session_id = p_session_id and user_id = p_user_id and status = 'active';
  get diagnostics affected = row_count;
  if affected = 0 then
    return false;
  end if;

  delete from auth.sessions where id = p_session_id and user_id = p_user_id;
  return true;
end;
$$;

create function public.validate_user_session(p_user_id uuid, p_session_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  s public.user_sessions%rowtype;
begin
  select * into s from public.user_sessions where session_id = p_session_id and user_id = p_user_id;
  if not found then
    return jsonb_build_object('status', 'missing');
  end if;
  if s.status = 'revoked' then
    return jsonb_build_object('status', 'revoked');
  end if;
  if s.status = 'expired' then
    return jsonb_build_object('status', 'expired', 'reason', s.end_reason);
  end if;
  if s.expires_at <= now() then
    perform private.expire_user_session(p_session_id, 'timebox');
    return jsonb_build_object('status', 'expired', 'reason', 'timebox');
  end if;
  if s.last_seen_at <= now() - interval '30 minutes' then
    perform private.expire_user_session(p_session_id, 'inactivity');
    return jsonb_build_object('status', 'expired', 'reason', 'inactivity');
  end if;

  update public.user_sessions set last_seen_at = now() where session_id = p_session_id;
  return jsonb_build_object('status', 'active', 'aal', s.aal, 'expires_at', s.expires_at);
end;
$$;

create function public.login_eligibility(p_user_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'eligible', exists (
      select 1 from public.memberships m
        join public.organizations o on o.id = m.organization_id
       where m.user_id = p_user_id and m.status = 'active' and o.status = 'active'),
    'requires_mfa', exists (
      select 1 from public.memberships m
        join public.organizations o on o.id = m.organization_id and o.kind = 'owner' and o.status = 'active'
        join public.membership_roles mr on mr.membership_id = m.id
        join public.roles r on r.id = mr.role_id and r.code in ('master_fluxid', 'admin_fluxid')
       where m.user_id = p_user_id and m.status = 'active'));
$$;

create function public.register_login_failure(p_key_hash text) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  total integer;
begin
  delete from private.login_failures where window_started_at < now() - interval '1 day';
  insert into private.login_failures (key_hash, failures, window_started_at)
  values (p_key_hash, 1, now())
  on conflict (key_hash) do update
     set failures = case when private.login_failures.window_started_at < now() - interval '15 minutes'
                         then 1 else private.login_failures.failures + 1 end,
         window_started_at = case when private.login_failures.window_started_at < now() - interval '15 minutes'
                                  then now() else private.login_failures.window_started_at end
  returning failures into total;
  return total;
end;
$$;

create function public.is_login_rate_limited(p_key_hash text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from private.login_failures
     where key_hash = p_key_hash and failures >= 5
       and window_started_at >= now() - interval '15 minutes');
$$;

create function public.clear_login_failures(p_key_hash text) returns void
language sql security definer set search_path = '' as $$
  delete from private.login_failures where key_hash = p_key_hash;
$$;

create function public.record_auth_event(
  p_actor uuid, p_session uuid, p_action text, p_result text, p_reason text, p_organization uuid
) returns bigint language plpgsql security definer set search_path = '' as $$
begin
  if p_action not in (
       'auth.login', 'auth.login.failed', 'auth.login.rate_limited', 'auth.logout',
       'auth.session.limit_reached', 'auth.session.revoke', 'auth.session.expire', 'auth.mfa.verify')
     or p_result not in ('success', 'denied', 'failed')
     or (p_reason is not null and p_reason !~ '^[a-z0-9_]{1,60}$') then
    raise exception using errcode = '22023', message = 'invalid_auth_event';
  end if;
  return private.write_audit_event(
    p_organization, p_actor, p_session, p_action, 'session', p_session::text, p_result, p_reason, null, '{}'::jsonb);
end;
$$;

revoke all on function private.expire_user_session(uuid, text) from public, anon, authenticated;
revoke all on function public.start_user_session(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.end_user_session(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.validate_user_session(uuid, uuid) from public, anon, authenticated;
revoke all on function public.login_eligibility(uuid) from public, anon, authenticated;
revoke all on function public.register_login_failure(text) from public, anon, authenticated;
revoke all on function public.is_login_rate_limited(text) from public, anon, authenticated;
revoke all on function public.clear_login_failures(text) from public, anon, authenticated;
revoke all on function public.record_auth_event(uuid, uuid, text, text, text, uuid) from public, anon, authenticated;

grant execute on function public.start_user_session(uuid, uuid, text) to service_role;
grant execute on function public.end_user_session(uuid, uuid, text) to service_role;
grant execute on function public.validate_user_session(uuid, uuid) to service_role;
grant execute on function public.login_eligibility(uuid) to service_role;
grant execute on function public.register_login_failure(text) to service_role;
grant execute on function public.is_login_rate_limited(text) to service_role;
grant execute on function public.clear_login_failures(text) to service_role;
grant execute on function public.record_auth_event(uuid, uuid, text, text, text, uuid) to service_role;

comment on function public.start_user_session(uuid, uuid, text) is
  'Registra sessão aceita sob lock por usuário; no quarto login devolve a lista sanitizada sem revogar nada.';
comment on function public.validate_user_session(uuid, uuid) is
  'Confirma sessão ativa, aplica timebox de 8 horas e inatividade de 30 minutos e registra atividade confiável.';
