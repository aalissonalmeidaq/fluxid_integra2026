-- Spec 012, US2: comandos do lacre com estados explícitos (RF-025 a RF-029, RN-001, RN-005, CA-002; research.md, item 9; Clarifications
-- 17/10). Só a confirmação `executed` muda a trava; erro, expiração e trava não entregue em 30 min deixam "não confirmada" e abrem alerta.
-- A resposta ao lacre leva no máximo um comando (trava antes de rede); o entregue volta até a confirmação, com o mesmo id.

create function private.seal_command_event(p_command public.seal_commands, p_to text, p_by_kind text, p_by_user uuid, p_detail jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into public.seal_command_events (organization_id, command_id, from_status, to_status, by_kind, by_user, detail)
  values (p_command.organization_id, p_command.id, p_command.status, p_to, p_by_kind, p_by_user, coalesce(p_detail, '{}'));
end $$;

-- Cria um comando. Um novo comando de trava cancela o de trava ainda não confirmado (RF-029); o de rede para a mesma rede, idem (US7).
create function private.issue_seal_command(p_device uuid, p_kind text, p_origin text, p_requested_by uuid, p_justification text, p_aal text,
  p_trip uuid, p_item uuid, p_violation uuid, p_extra jsonb default '{}')
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_device public.seal_devices;
  v_old public.seal_commands;
  v_command public.seal_commands;
  v_by text := case when p_requested_by is null then 'system' else 'person' end;
begin
  select d.* into v_device from public.seal_devices d where d.id = p_device for update;
  for v_old in
    select c.* from public.seal_commands c
     where c.device_id = p_device and c.status in ('pending', 'delivered')
       and ((p_kind in ('lock', 'unlock') and c.kind in ('lock', 'unlock'))
         or (p_kind like 'wifi\_%' and c.kind like 'wifi\_%' and c.wifi_ssid is not distinct from (p_extra->>'wifi_ssid')))
     for update
  loop
    perform private.seal_command_event(v_old, 'cancelled', v_by, p_requested_by, jsonb_build_object('reason', 'superseded'));
    update public.seal_commands set status = 'cancelled', cancel_reason = 'superseded', finished_at = now(), updated_at = now() where id = v_old.id;
    perform private.seal_command_finished(v_old.id);
  end loop;

  insert into public.seal_commands (organization_id, device_id, cylinder_id, kind, origin, trip_id, trip_item_id, violation_id, requested_by,
    justification, aal, wifi_ssid, wifi_open, wifi_secret_id, proof)
  values (v_device.organization_id, p_device, (select b.cylinder_id from public.seal_bindings b where b.device_id = p_device and b.unbound_at is null),
    p_kind, p_origin, p_trip, p_item, p_violation, p_requested_by, p_justification, p_aal, p_extra->>'wifi_ssid', (p_extra->>'wifi_open')::boolean,
    (p_extra->>'wifi_secret_id')::uuid, p_extra->'proof')
  returning * into v_command;
  insert into public.seal_command_events (organization_id, command_id, from_status, to_status, by_kind, by_user, detail)
  values (v_command.organization_id, v_command.id, null, 'pending', v_by, p_requested_by, jsonb_build_object('origin', p_origin));
  perform private.seal_broadcast(v_device.organization_id, 'command', p_device, v_command.cylinder_id);
  return v_command.id;
end $$;

-- Gancho para quem precisa agir quando um comando termina (a senha de rede some do Vault na US7).
create function private.seal_command_finished(p_command uuid) returns void
language plpgsql security definer set search_path = '' as $$ begin return; end $$;

-- Campos extras do comando na resposta ao lacre (rede na US7).
create function private.seal_command_payload(p_command public.seal_commands) returns jsonb
language plpgsql security definer set search_path = '' as $$ begin return '{}'::jsonb; end $$;

-- O próximo comando para o lacre: no máximo um, trava antes de rede, o entregue e não confirmado de novo (o lacre pode não ter recebido).
create function private.next_seal_command(p_device uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_command public.seal_commands;
begin
  select c.* into v_command from public.seal_commands c
   where c.device_id = p_device and c.status in ('pending', 'delivered')
   order by (c.kind in ('lock', 'unlock')) desc, c.created_at
   limit 1 for update;
  if v_command.id is null then return null; end if;
  if v_command.status = 'pending' then
    perform private.seal_command_event(v_command, 'delivered', 'device', null, '{}');
    update public.seal_commands set status = 'delivered', delivered_at = now(), updated_at = now() where id = v_command.id;
    perform private.seal_broadcast(v_command.organization_id, 'command', p_device, v_command.cylinder_id);
  end if;
  return jsonb_build_object('id', v_command.id, 'kind', v_command.kind, 'issued_at', v_command.created_at) || private.seal_command_payload(v_command);
end $$;

-- Vigilância da geocerca na resposta (US4); por enquanto, sempre inativa.
create function private.seal_watch_payload(p_device uuid, p_watch_version integer) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  return jsonb_build_object('active', false, 'version', 0);
end $$;

create or replace function private.seal_build_response(p_device uuid, p_watch_version integer) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  return jsonb_build_object('command', private.next_seal_command(p_device), 'watch', private.seal_watch_payload(p_device, p_watch_version));
end $$;

-- Resultado de trava e de rede no lacre (o de rede é da US7).
create function private.seal_apply_wifi_result(p_command public.seal_commands, p_result text, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$ begin return; end $$;

create function private.seal_set_lock(p_device uuid, p_state text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_device public.seal_devices;
begin
  select d.* into v_device from public.seal_devices d where d.id = p_device;
  if v_device.lock_state is distinct from p_state then
    update public.seal_devices set lock_state = p_state, lock_changed_at = now(), updated_at = now() where id = p_device;
    perform private.seal_broadcast(v_device.organization_id, 'lock', p_device,
      (select b.cylinder_id from public.seal_bindings b where b.device_id = p_device and b.unbound_at is null));
  end if;
end $$;

create or replace function private.seal_handle_command_result(p_device uuid, p_message jsonb, p_message_row uuid, p_stale boolean)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_command public.seal_commands;
  v_org uuid;
  v_result text := p_message->>'result';
  v_reason text := p_message->>'reason';
  v_response jsonb := jsonb_build_object('result', p_message->>'result', 'reason', p_message->>'reason', 'at', p_message->>'read_at');
begin
  select d.organization_id into v_org from public.seal_devices d where d.id = p_device;
  select c.* into v_command from public.seal_commands c where c.id = (p_message->>'command_id')::uuid and c.organization_id = v_org for update;
  if v_command.id is null then return 'unknown_command'; end if;
  if v_command.device_id <> p_device then return 'command_of_other_device'; end if;

  -- Já decidido: confirmação repetida não faz nada; a de um comando cancelado ou expirado fica registrada sem mudar a trava (RF-029).
  if v_command.status in ('confirmed', 'failed') then return null; end if;
  if v_command.status in ('cancelled', 'expired') then
    perform private.seal_command_event(v_command, v_command.status, 'device', null, jsonb_build_object('late_result', v_response));
    return null;
  end if;

  perform private.seal_command_event(v_command, case when v_result = 'executed' then 'confirmed' else 'failed' end, 'device', null, v_response);
  update public.seal_commands set status = case when v_result = 'executed' then 'confirmed' else 'failed' end, device_response = v_response,
    delivered_at = coalesce(delivered_at, now()), finished_at = now(), updated_at = now()
   where id = v_command.id;

  if v_command.kind in ('lock', 'unlock') then
    if v_result = 'executed' then
      perform private.seal_set_lock(p_device, case
        when v_command.kind = 'unlock' then 'unlocked'
        when v_command.origin = 'geofence_violation' then 'locked_violation'
        else 'locked' end);
    else
      perform private.seal_set_lock(p_device, 'unconfirmed');
      perform private.open_seal_alert(p_device, 'command_failed', 'high', 'system',
        jsonb_build_object('command_id', v_command.id, 'kind', v_command.kind, 'reason', v_reason), true);
    end if;
  else
    perform private.seal_apply_wifi_result(v_command, v_result, v_reason);
  end if;
  perform private.seal_command_finished(v_command.id);
  perform private.seal_broadcast(v_command.organization_id, 'command', p_device, v_command.cylinder_id);
  return null;
end $$;

-- Prazos dos comandos na verificação automática (RF-028; Clarifications 17/10).
create or replace function private.seal_watchdog_commands() returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_limits jsonb := private.seal_limits();
  v_command public.seal_commands;
begin
  -- Entregue e não confirmado em 10 min: expira, a trava fica "não confirmada" e abre alerta.
  for v_command in
    select c.* from public.seal_commands c
     where c.status = 'delivered' and c.delivered_at < now() - make_interval(secs => (v_limits->>'command_confirm_timeout_s')::int)
     for update skip locked
  loop
    perform private.seal_command_event(v_command, 'expired', 'system', null, jsonb_build_object('reason', 'not_confirmed'));
    update public.seal_commands set status = 'expired', finished_at = now(), updated_at = now() where id = v_command.id;
    if v_command.kind in ('lock', 'unlock') then
      perform private.seal_set_lock(v_command.device_id, 'unconfirmed');
      perform private.open_seal_alert(v_command.device_id, 'command_expired', case when v_command.kind = 'lock' then 'high' else 'medium' end, 'system',
        jsonb_build_object('command_id', v_command.id, 'kind', v_command.kind), false);
    end if;
    perform private.seal_command_finished(v_command.id);
  end loop;

  -- Trava não entregue em 30 min: NÃO expira enquanto o motivo valer; a trava fica "não confirmada" e abre um alerta, uma vez.
  for v_command in
    select c.* from public.seal_commands c
     where c.status = 'pending' and c.kind in ('lock', 'unlock') and c.not_delivered_alert_at is null
       and c.created_at < now() - make_interval(secs => (v_limits->>'command_not_delivered_s')::int)
     for update skip locked
  loop
    update public.seal_commands set not_delivered_alert_at = now(), updated_at = now() where id = v_command.id;
    perform private.seal_set_lock(v_command.device_id, 'unconfirmed');
    perform private.open_seal_alert(v_command.device_id, 'command_not_delivered', case when v_command.kind = 'lock' then 'high' else 'medium' end, 'system',
      jsonb_build_object('command_id', v_command.id, 'kind', v_command.kind), false);
  end loop;

  -- Comando de rede não entregue em 30 min expira (a senha some do Vault no gancho de término, US7).
  for v_command in
    select c.* from public.seal_commands c
     where c.status = 'pending' and c.kind like 'wifi\_%'
       and c.created_at < now() - make_interval(secs => (v_limits->>'command_not_delivered_s')::int)
     for update skip locked
  loop
    perform private.seal_command_event(v_command, 'expired', 'system', null, jsonb_build_object('reason', 'not_delivered'));
    update public.seal_commands set status = 'expired', finished_at = now(), updated_at = now() where id = v_command.id;
    perform private.seal_command_finished(v_command.id);
  end loop;
end $$;

-- Pedido manual pela tela, pelo cilindro (RF-025). Travar exige justificativa; destravar é sempre fora da regra da entrega, então exige
-- também a sessão com segundo fator (RN-005) e vira origem `exceptional`.
create function private.seal_manual_command(p_actor uuid, p_session uuid, p_organization uuid, p_request uuid, p_cylinder uuid, p_justification text, p_kind text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  denied text;
  replay jsonb;
  v_justification text := nullif(btrim(regexp_replace(coalesce(p_justification, ''), '\s+', ' ', 'g')), '');
  v_device public.seal_devices;
  v_command uuid;
  v_exceptional boolean := p_kind = 'unlock';
begin
  denied := private.cylinder_authorize(p_actor, p_session, p_organization, 'seal.operate');
  if denied is not null then return jsonb_build_object('code', denied); end if;
  replay := private.seal_replay(p_organization, p_request, 'request_' || p_kind);
  if replay is not null then return replay; end if;
  if not exists (select 1 from public.cylinders c where c.id = p_cylinder and c.organization_id = p_organization) then
    return jsonb_build_object('code', 'NOT_FOUND');
  end if;
  if not private.seal_text_ok(v_justification) then return jsonb_build_object('code', 'JUSTIFICATION_REQUIRED'); end if;
  if v_exceptional and not private.session_has_aal2(p_actor, p_session) then return jsonb_build_object('code', 'MFA_REQUIRED'); end if;
  select d.* into v_device from public.seal_bindings b join public.seal_devices d on d.id = b.device_id
   where b.cylinder_id = p_cylinder and b.unbound_at is null and b.organization_id = p_organization;
  if v_device.id is null then return jsonb_build_object('code', 'NO_BINDING'); end if;
  if v_device.status <> 'active' then return jsonb_build_object('code', 'SEAL_INACTIVE'); end if;

  v_command := private.issue_seal_command(v_device.id, p_kind, case when v_exceptional then 'exceptional' else 'manual' end, p_actor, v_justification,
    case when v_exceptional then 'aal2' else null end, null, null, null);
  perform private.write_audit_event(p_organization, p_actor, p_session, case when v_exceptional then 'seal.unlock_exceptional' else 'seal.command_manual' end,
    'seal_command', v_command::text, 'success', null, null,
    jsonb_build_object('command_id', v_command, 'kind', p_kind, 'device_id', v_device.id, 'cylinder_id', p_cylinder));
  return private.seal_remember(p_organization, p_request, 'request_' || p_kind, jsonb_build_object('code', 'REQUESTED', 'command_id', v_command));
end $$;

create function public.request_lock(p_actor uuid, p_session uuid, p_organization uuid, p_request uuid, p_cylinder uuid, p_justification text)
returns jsonb language sql security definer set search_path = '' as $$
  select private.seal_manual_command(p_actor, p_session, p_organization, p_request, p_cylinder, p_justification, 'lock')
$$;
create function public.request_unlock(p_actor uuid, p_session uuid, p_organization uuid, p_request uuid, p_cylinder uuid, p_justification text)
returns jsonb language sql security definer set search_path = '' as $$
  select private.seal_manual_command(p_actor, p_session, p_organization, p_request, p_cylinder, p_justification, 'unlock')
$$;

-- Comandos de um dispositivo, com o histórico de estados (tela do dispositivo).
create function public.list_commands(p_actor uuid, p_session uuid, p_organization uuid, p_device uuid, p_limit integer default 20)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  denied text;
begin
  denied := private.cylinder_authorize(p_actor, p_session, p_organization, 'seal.read');
  if denied is not null then return jsonb_build_object('code', denied); end if;
  if not exists (select 1 from public.seal_devices d where d.id = p_device and d.organization_id = p_organization) then
    return jsonb_build_object('code', 'NOT_FOUND');
  end if;
  return jsonb_build_object('code', 'LISTED', 'items', coalesce((
    select jsonb_agg(jsonb_build_object('id', c.id, 'kind', c.kind, 'origin', c.origin, 'status', c.status, 'created_at', c.created_at,
        'delivered_at', c.delivered_at, 'finished_at', c.finished_at, 'wifi_ssid', c.wifi_ssid,
        'events', (select jsonb_agg(jsonb_build_object('to', e.to_status, 'at', e.at, 'by', e.by_kind) order by e.at)
                     from public.seal_command_events e where e.command_id = c.id)) order by c.created_at desc)
      from (select * from public.seal_commands c where c.device_id = p_device order by c.created_at desc limit least(greatest(p_limit, 1), 100)) c), '[]'::jsonb));
end $$;

revoke all on function private.seal_command_event(public.seal_commands, text, text, uuid, jsonb),
  private.issue_seal_command(uuid, text, text, uuid, text, text, uuid, uuid, uuid, jsonb), private.seal_command_finished(uuid),
  private.seal_command_payload(public.seal_commands), private.next_seal_command(uuid), private.seal_watch_payload(uuid, integer),
  private.seal_apply_wifi_result(public.seal_commands, text, text), private.seal_set_lock(uuid, text),
  private.seal_manual_command(uuid, uuid, uuid, uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.request_lock(uuid, uuid, uuid, uuid, uuid, text), public.request_unlock(uuid, uuid, uuid, uuid, uuid, text),
  public.list_commands(uuid, uuid, uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.request_lock(uuid, uuid, uuid, uuid, uuid, text), public.request_unlock(uuid, uuid, uuid, uuid, uuid, text),
  public.list_commands(uuid, uuid, uuid, uuid, integer) to service_role;
