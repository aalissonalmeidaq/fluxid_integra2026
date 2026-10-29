-- Spec 015 (T044; RF-007a a RF-007h, contracts/rastreamento-e-sincronizacao.md): sessão de coleta e ingestão das posições do celular.
-- Só o motorista vinculado à viagem em andamento abre a sessão e envia posições, pela instalação de origem. Lotes de 1 a 100 itens,
-- processados na ordem recebida, idempotentes pela chave do cliente; o horário observado é preservado e a posição que chega depois da
-- idade máxima é retrospectiva. Cada posição gravada é avaliada na mesma transação (T045). Concluir ou cancelar a viagem encerra as
-- sessões e os pares, sem apagar evidência.

-- Motorista da viagem: sessão ativa, vínculo ativo com a empresa e a viagem atribuída a ele. Viagem de outra empresa: NOT_FOUND.
create function private.tracking_driver_authorize(p_actor uuid, p_session uuid, p_organization uuid, p_trip uuid)
returns text language plpgsql stable security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.user_sessions s where s.user_id = p_actor and s.session_id = p_session and s.status = 'active'
                   and s.expires_at > now() and s.last_seen_at > now() - interval '30 minutes') then
    return 'AUTH_REQUIRED';
  end if;
  if not exists (select 1 from public.memberships m where m.user_id = p_actor and m.organization_id = p_organization and m.status = 'active') then
    return 'ACCESS_DENIED';
  end if;
  if not exists (select 1 from public.trips t where t.id = p_trip and t.organization_id = p_organization) then return 'NOT_FOUND'; end if;
  if not exists (select 1 from public.trips t join public.drivers d on d.id = t.driver_id and d.organization_id = t.organization_id
                  where t.id = p_trip and d.linked_user_id = p_actor) then
    return 'ACCESS_DENIED';
  end if;
  return null;
end $$;

-- Janela de coleta offline (RF-007g): 8 horas desde a última confirmação online.
create function private.tracking_session_json(p_session public.tracking_sessions) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id', p_session.id, 'trip_id', p_session.trip_id, 'status', p_session.status, 'platform', p_session.platform,
    'capability', p_session.capability, 'notifications_denied', p_session.notifications_denied,
    'collect_until', p_session.last_online_confirmed_at + interval '8 hours', 'interval_s', 60)
$$;

-- Pares do celular com cada lacre da carga ainda aberta (vínculo vigente). Idempotente.
create function private.tracking_ensure_pairs(p_session uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.proximity_pairs (organization_id, tracking_session_id, trip_id, trip_item_id, cylinder_id, device_id, started_at)
  select s.organization_id, s.id, s.trip_id, ti.id, ti.cylinder_id, b.device_id, greatest(t.started_at, b.bound_at)
    from public.tracking_sessions s
    join public.trips t on t.id = s.trip_id
    join public.trip_items ti on ti.trip_id = s.trip_id and ti.is_open
    join public.seal_bindings b on b.cylinder_id = ti.cylinder_id and b.organization_id = ti.organization_id and b.unbound_at is null
   where s.id = p_session and s.status = 'active'
  on conflict (tracking_session_id, trip_item_id, device_id) do nothing;
end $$;

create function public.start_tracking_session(p_actor uuid, p_session uuid, p_organization uuid, p_request uuid, p_trip uuid,
  p_installation uuid, p_platform text, p_capability text, p_notifications_denied boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  denied text;
  v_session public.tracking_sessions;
begin
  select s.* into v_session from public.tracking_sessions s where s.organization_id = p_organization and s.request_id = p_request;
  if found and v_session.driver_user_id = p_actor then
    return jsonb_build_object('code', 'STARTED', 'session', private.tracking_session_json(v_session), 'rule', private.tracking_rule(p_organization));
  end if;
  if p_platform is null or p_platform not in ('android_native', 'web_visible') or p_capability is null
     or p_capability not in ('full', 'foreground_only', 'denied', 'unavailable') or p_installation is null then
    return jsonb_build_object('code', 'VALIDATION_FAILED');
  end if;
  denied := private.tracking_driver_authorize(p_actor, p_session, p_organization, p_trip);
  if denied is not null then return jsonb_build_object('code', denied); end if;
  if not exists (select 1 from public.trips t where t.id = p_trip and t.status = 'in_progress') then
    return jsonb_build_object('code', 'TRIP_STATE_INVALID');
  end if;

  select s.* into v_session from public.tracking_sessions s
   where s.trip_id = p_trip and s.device_installation_id = p_installation and s.status = 'active' for update;
  if found then
    update public.tracking_sessions set last_online_confirmed_at = now(), capability = p_capability,
           notifications_denied = coalesce(p_notifications_denied, false),
           capability_changed_at = case when capability <> p_capability or notifications_denied <> coalesce(p_notifications_denied, false)
                                        then now() else capability_changed_at end,
           updated_at = now(), version = version + 1
     where id = v_session.id returning * into v_session;
  else
    insert into public.tracking_sessions (organization_id, trip_id, driver_user_id, device_installation_id, platform, capability,
      notifications_denied, request_id)
    values (p_organization, p_trip, p_actor, p_installation, p_platform, p_capability, coalesce(p_notifications_denied, false), p_request)
    returning * into v_session;
  end if;
  perform private.tracking_ensure_pairs(v_session.id);
  perform private.tracking_audit(p_organization, p_actor, p_session, 'tracking.session_start', 'tracking_session', v_session.id::text, 'success',
    null, null, jsonb_build_object('trip_id', p_trip, 'platform', p_platform, 'capability', p_capability));
  return jsonb_build_object('code', 'STARTED', 'session', private.tracking_session_json(v_session), 'rule', private.tracking_rule(p_organization));
end $$;

-- O aparelho informa a capacidade de coleta (negada, só com a tela visível, notificação recusada): vira estado degradado na tela do gestor.
create function public.report_tracking_capability(p_actor uuid, p_session uuid, p_organization uuid, p_request uuid, p_tracking_session uuid,
  p_capability text, p_notifications_denied boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  denied text;
  v_session public.tracking_sessions;
begin
  if p_capability is null or p_capability not in ('full', 'foreground_only', 'denied', 'unavailable') then
    return jsonb_build_object('code', 'VALIDATION_FAILED');
  end if;
  select s.* into v_session from public.tracking_sessions s where s.id = p_tracking_session and s.organization_id = p_organization for update;
  if not found then return jsonb_build_object('code', 'NOT_FOUND'); end if;
  denied := private.tracking_driver_authorize(p_actor, p_session, p_organization, v_session.trip_id);
  if denied is not null then return jsonb_build_object('code', denied); end if;
  if v_session.driver_user_id <> p_actor then return jsonb_build_object('code', 'ACCESS_DENIED'); end if;
  if v_session.status in ('completed', 'cancelled') then return jsonb_build_object('code', 'SESSION_ENDED'); end if;
  update public.tracking_sessions set capability = p_capability, notifications_denied = coalesce(p_notifications_denied, false),
         capability_changed_at = case when capability <> p_capability or notifications_denied <> coalesce(p_notifications_denied, false)
                                      then now() else capability_changed_at end,
         updated_at = now(), version = version + 1
   where id = v_session.id;
  return jsonb_build_object('code', 'UPDATED');
end $$;

create function public.end_tracking_session(p_actor uuid, p_session uuid, p_organization uuid, p_request uuid, p_tracking_session uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  denied text;
  v_session public.tracking_sessions;
begin
  if p_reason is null or p_reason not in ('completed', 'cancelled') then return jsonb_build_object('code', 'VALIDATION_FAILED'); end if;
  select s.* into v_session from public.tracking_sessions s where s.id = p_tracking_session and s.organization_id = p_organization for update;
  if not found then return jsonb_build_object('code', 'NOT_FOUND'); end if;
  denied := private.tracking_driver_authorize(p_actor, p_session, p_organization, v_session.trip_id);
  if denied is not null then return jsonb_build_object('code', denied); end if;
  if v_session.driver_user_id <> p_actor then return jsonb_build_object('code', 'ACCESS_DENIED'); end if;
  if v_session.status in ('completed', 'cancelled') then return jsonb_build_object('code', 'ENDED', 'session', private.tracking_session_json(v_session)); end if;
  update public.tracking_sessions set status = p_reason, end_reason = p_reason, ended_at = now(), updated_at = now(), version = version + 1
   where id = v_session.id returning * into v_session;
  update public.proximity_pairs set status = 'session_ended', ended_at = now(), updated_at = now()
   where tracking_session_id = v_session.id and status = 'active';
  perform private.tracking_audit(p_organization, p_actor, p_session, 'tracking.session_end', 'tracking_session', v_session.id::text, 'success',
    null, null, jsonb_build_object('trip_id', v_session.trip_id, 'reason', p_reason));
  return jsonb_build_object('code', 'ENDED', 'session', private.tracking_session_json(v_session));
end $$;

create function public.ingest_driver_positions(p_actor uuid, p_session uuid, p_organization uuid, p_request uuid, p_tracking_session uuid,
  p_installation uuid, p_positions jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  denied text;
  v_session public.tracking_sessions;
  v_trip public.trips;
  v_rule jsonb := private.tracking_rule(p_organization);
  v_item jsonb;
  v_results jsonb := '[]'::jsonb;
  v_client uuid;
  v_sequence bigint;
  v_observed timestamptz;
  v_lat numeric;
  v_lng numeric;
  v_accuracy numeric;
  v_retro boolean;
  v_id uuid;
  v_evaluations integer;
begin
  if not exists (select 1 from public.user_sessions s where s.user_id = p_actor and s.session_id = p_session and s.status = 'active'
                   and s.expires_at > now() and s.last_seen_at > now() - interval '30 minutes') then
    return jsonb_build_object('code', 'AUTH_REQUIRED');
  end if;
  if p_positions is null or jsonb_typeof(p_positions) <> 'array' or jsonb_array_length(p_positions) = 0 then
    return jsonb_build_object('code', 'VALIDATION_FAILED');
  end if;
  if jsonb_array_length(p_positions) > 100 then return jsonb_build_object('code', 'BATCH_TOO_LARGE'); end if;

  select s.* into v_session from public.tracking_sessions s where s.id = p_tracking_session and s.organization_id = p_organization for update;
  if not found then return jsonb_build_object('code', 'NOT_FOUND'); end if;
  denied := private.tracking_driver_authorize(p_actor, p_session, p_organization, v_session.trip_id);
  if denied is not null then return jsonb_build_object('code', denied); end if;
  if v_session.driver_user_id <> p_actor then return jsonb_build_object('code', 'ACCESS_DENIED'); end if;
  if v_session.device_installation_id <> p_installation then return jsonb_build_object('code', 'CONTEXT_MISMATCH'); end if;
  select t.* into v_trip from public.trips t where t.id = v_session.trip_id;

  -- Chegar ao servidor confirma a conexão online e reabre a janela de coleta de 8 horas.
  update public.tracking_sessions set last_online_confirmed_at = now(), updated_at = now(),
         status = case when status = 'paused_auth_expired' then 'active' else status end
   where id = v_session.id returning * into v_session;

  for v_item in select value from jsonb_array_elements(p_positions) loop
    v_client := null;
    begin
      v_client := (v_item->>'client_position_id')::uuid;
      v_sequence := (v_item->>'sequence_no')::bigint;
      v_observed := (v_item->>'observed_at')::timestamptz;
      v_lat := (v_item->>'latitude')::numeric;
      v_lng := (v_item->>'longitude')::numeric;
      v_accuracy := nullif(v_item->>'accuracy_m', '')::numeric;
      if v_client is null or v_sequence is null or v_sequence < 0 or v_observed is null or v_lat is null or v_lng is null
         or v_lat not between -90 and 90 or v_lng not between -180 and 180 or (v_accuracy is not null and v_accuracy not between 0 and 100000) then
        raise exception using errcode = '22023';
      end if;
    exception when others then
      v_results := v_results || jsonb_build_array(jsonb_build_object('client_position_id', v_item->>'client_position_id', 'status', 'rejected',
        'retrospective', false, 'evaluations_created', 0, 'code', 'INVALID_INPUT'));
      continue;
    end;

    if v_observed > now() + interval '60 seconds' then
      v_results := v_results || jsonb_build_array(jsonb_build_object('client_position_id', v_client, 'status', 'rejected', 'retrospective', false,
        'evaluations_created', 0, 'code', 'POSITION_TOO_FUTURE'));
      continue;
    end if;
    if v_session.ended_at is not null and v_observed >= v_session.ended_at then
      v_results := v_results || jsonb_build_array(jsonb_build_object('client_position_id', v_client, 'status', 'rejected', 'retrospective', false,
        'evaluations_created', 0, 'code', 'SESSION_ENDED'));
      continue;
    end if;
    if v_trip.started_at is null or v_observed < v_trip.started_at then
      v_results := v_results || jsonb_build_array(jsonb_build_object('client_position_id', v_client, 'status', 'rejected', 'retrospective', false,
        'evaluations_created', 0, 'code', 'CONTEXT_MISMATCH'));
      continue;
    end if;

    v_retro := now() - v_observed > make_interval(secs => (v_rule->>'max_age_s')::int);
    insert into public.mobile_positions (organization_id, client_position_id, tracking_session_id, trip_id, driver_user_id, device_installation_id,
      sequence_no, point, accuracy_m, observed_at, sync_kind, validity)
    values (p_organization, v_client, v_session.id, v_session.trip_id, p_actor, p_installation, v_sequence,
      extensions.st_setsrid(extensions.st_makepoint(v_lng, v_lat), 4326)::extensions.geography, v_accuracy, v_observed,
      case when v_retro then 'retrospective' else 'live' end,
      case when v_accuracy is null or v_accuracy > (v_rule->>'max_accuracy_m')::numeric then 'imprecise' else 'valid' end)
    on conflict do nothing
    returning id into v_id;

    if v_id is null then
      v_results := v_results || jsonb_build_array(jsonb_build_object('client_position_id', v_client, 'status', 'duplicate',
        'retrospective', v_retro, 'evaluations_created', 0));
    else
      v_evaluations := private.evaluate_proximity_for_position(v_id);
      v_results := v_results || jsonb_build_array(jsonb_build_object('client_position_id', v_client, 'status', 'stored',
        'retrospective', v_retro, 'evaluations_created', v_evaluations));
    end if;
  end loop;

  return jsonb_build_object('code', 'INGESTED', 'server_time', now(), 'results', v_results);
end $$;

-- Concluir ou cancelar a viagem encerra as sessões ativas e os pares (RF-018), sem apagar nada.
create function private.tracking_on_trip_closed() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status in ('completed', 'cancelled') and old.status is distinct from new.status then
    update public.proximity_pairs p set status = 'session_ended', ended_at = now(), updated_at = now()
     where p.trip_id = new.id and p.status = 'active';
    update public.tracking_sessions s set status = new.status, end_reason = new.status, ended_at = now(), updated_at = now(), version = s.version + 1
     where s.trip_id = new.id and s.status in ('active', 'paused_auth_expired');
  end if;
  return null;
end $$;
create trigger trips_tracking_close after update of status on public.trips for each row execute function private.tracking_on_trip_closed();

revoke all on function private.tracking_driver_authorize(uuid, uuid, uuid, uuid), private.tracking_session_json(public.tracking_sessions),
  private.tracking_ensure_pairs(uuid), private.tracking_on_trip_closed() from public, anon, authenticated;
revoke all on function public.start_tracking_session(uuid, uuid, uuid, uuid, uuid, uuid, text, text, boolean),
  public.report_tracking_capability(uuid, uuid, uuid, uuid, uuid, text, boolean),
  public.end_tracking_session(uuid, uuid, uuid, uuid, uuid, text),
  public.ingest_driver_positions(uuid, uuid, uuid, uuid, uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.start_tracking_session(uuid, uuid, uuid, uuid, uuid, uuid, text, text, boolean),
  public.report_tracking_capability(uuid, uuid, uuid, uuid, uuid, text, boolean),
  public.end_tracking_session(uuid, uuid, uuid, uuid, uuid, text),
  public.ingest_driver_positions(uuid, uuid, uuid, uuid, uuid, uuid, jsonb) to service_role;
