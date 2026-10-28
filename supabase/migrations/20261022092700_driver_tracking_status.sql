-- Spec 015 (T053): situação do motorista numa viagem, para o painel de coleta decidir se aparece e se retoma a sessão. Exige só sessão e
-- vínculo ativos (o motorista não tem `tracking.read`); viagem de outra empresa é inexistente. Quem não é o motorista recebe apenas
-- `is_driver = false`, sem auditoria de negação: não é uma tentativa de acesso, é a tela perguntando se deve mostrar o painel.
create function public.get_driver_tracking_status(p_actor uuid, p_session uuid, p_organization uuid, p_trip uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_driver boolean;
  v_session public.tracking_sessions;
begin
  if not exists (select 1 from public.user_sessions s where s.user_id = p_actor and s.session_id = p_session and s.status = 'active'
                   and s.expires_at > now() and s.last_seen_at > now() - interval '30 minutes') then
    return jsonb_build_object('code', 'AUTH_REQUIRED');
  end if;
  if not exists (select 1 from public.memberships m where m.user_id = p_actor and m.organization_id = p_organization and m.status = 'active') then
    return jsonb_build_object('code', 'ACCESS_DENIED');
  end if;
  select exists (select 1 from public.drivers d where d.id = t.driver_id and d.organization_id = t.organization_id and d.linked_user_id = p_actor)
    into v_driver from public.trips t where t.id = p_trip and t.organization_id = p_organization;
  if not found then return jsonb_build_object('code', 'NOT_FOUND'); end if;
  if v_driver then
    select s.* into v_session from public.tracking_sessions s
     where s.trip_id = p_trip and s.driver_user_id = p_actor and s.status in ('active', 'paused_auth_expired')
     order by s.started_at desc limit 1;
  end if;
  return jsonb_build_object('code', 'FOUND', 'is_driver', v_driver,
    'trip_status', (select t.status from public.trips t where t.id = p_trip),
    'session', case when v_session.id is null then null else private.tracking_session_json(v_session) end);
end $$;

revoke all on function public.get_driver_tracking_status(uuid, uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.get_driver_tracking_status(uuid, uuid, uuid, uuid) to service_role;
