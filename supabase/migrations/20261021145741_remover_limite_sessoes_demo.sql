-- Spec 014, RF-011a: as cinco contas compartilhadas da demonstração não disputam o limite de três sessões simultâneas.
-- A identificação vem da tabela privada criada pelo servidor. Timebox, inatividade, rate limit e auditoria permanecem iguais.
create or replace function public.start_user_session(p_user_id uuid, p_session_id uuid, p_aal text default 'aal1')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  existing public.user_sessions%rowtype;
  stale record;
  active_count integer;
  is_demo boolean := private.is_demo_account(p_user_id);
begin
  if p_aal not in ('aal1', 'aal2') then
    raise exception using errcode = '22023', message = 'invalid_session';
  end if;

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
    if existing.user_id <> p_user_id or existing.kind <> 'interactive' then
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

  if not is_demo then
    select count(*) into active_count
      from public.user_sessions where user_id = p_user_id and status = 'active' and kind = 'interactive';

    if active_count >= 3 then
      return jsonb_build_object(
        'status', 'limit_reached',
        'sessions', (
          select coalesce(jsonb_agg(jsonb_build_object(
            'session_id', s.session_id, 'started_at', s.started_at,
            'last_seen_at', s.last_seen_at, 'aal', s.aal) order by s.started_at), '[]'::jsonb)
            from public.user_sessions s where s.user_id = p_user_id and s.status = 'active' and s.kind = 'interactive'));
    end if;
  end if;

  insert into public.user_sessions (session_id, user_id, aal, started_at, last_seen_at, expires_at)
  values (p_session_id, p_user_id, p_aal, now(), now(), now() + interval '8 hours');

  return jsonb_build_object('status', 'started', 'expires_at', now() + interval '8 hours');
end;
$$;

revoke all on function public.start_user_session(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.start_user_session(uuid, uuid, text) to service_role;

comment on function public.start_user_session(uuid, uuid, text) is
  'Registra sessão interativa sob lock por usuário; contas demo aceitam sessões simultâneas sem limite e demais contas mantêm o limite de três.';
