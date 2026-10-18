-- Spec 012, US6: saúde do lacre e verificação automática (RF-013 a RF-017, RN-002, CA-007; research.md, item 6; Clarifications 17/10).
-- A saúde muda na chegada das mensagens (posição, desligamento, alerta do lacre) e pela verificação que roda sozinha a cada minuto
-- (`pg_cron`, SQL puro). Nenhum estado de saúde muda a situação do cilindro. Possível extravio, com notificação, só para o cilindro em
-- viagem em andamento ou sob vigilância de geocerca; nos demais casos, alerta médio sem notificação.

-- Onde está o cilindro do lacre: em viagem em andamento, sob vigilância de geocerca, ou nenhum dos dois ("em risco" é um dos dois).
create function private.seal_risk(p_device uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'cylinder_id', b.cylinder_id,
    'trip_id', (select i.trip_id from public.trip_items i join public.trips t on t.id = i.trip_id
                 where i.cylinder_id = b.cylinder_id and i.is_open and t.status = 'in_progress' limit 1),
    'site_id', (select w.site_id from public.seal_watches w where w.cylinder_id = b.cylinder_id and w.ended_at is null limit 1))
  from (select (select b2.cylinder_id from public.seal_bindings b2 where b2.device_id = p_device and b2.unbound_at is null) as cylinder_id) b
$$;

create function private.seal_set_health(p_device uuid, p_health text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_device public.seal_devices;
begin
  select d.* into v_device from public.seal_devices d where d.id = p_device;
  if v_device.health is distinct from p_health then
    update public.seal_devices set health = p_health, health_changed_at = now(), updated_at = now() where id = p_device;
    perform private.seal_broadcast(v_device.organization_id, 'health',
      p_device, (select b.cylinder_id from public.seal_bindings b where b.device_id = p_device and b.unbound_at is null));
  end if;
end $$;

-- Lacre que voltou: os alertas de silêncio e de GPS registram a volta e continuam abertos até o gestor encerrar (RF-017).
create function private.seal_recover(p_device uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.seal_alerts set recovered_at = now(), updated_at = now()
   where device_id = p_device and status <> 'closed' and recovered_at is null and kind in ('possible_loss', 'no_comm', 'device_off', 'no_gps');
end $$;

-- Silêncio ou desligamento: possível extravio (alto, com notificação) em viagem ou vigilância; no estoque, alerta médio sem notificação.
create function private.seal_open_silence_alert(p_device uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_risk jsonb := private.seal_risk(p_device);
  v_context jsonb;
begin
  select jsonb_build_object('reason', p_reason, 'last_position_id', d.last_position_id, 'last_seen_at', d.last_seen_at,
      'trip_id', v_risk->'trip_id', 'site_id', v_risk->'site_id')
    into v_context from public.seal_devices d where d.id = p_device;
  if v_risk->>'trip_id' is not null or v_risk->>'site_id' is not null then
    perform private.open_seal_alert(p_device, 'possible_loss', 'high', 'system', v_context, true);
  else
    perform private.open_seal_alert(p_device, case when p_reason = 'shutdown' then 'device_off' else 'no_comm' end, 'medium', 'system', v_context, false);
  end if;
end $$;

-- Posição: grava (US1) e, para a leitura mais nova, atualiza a saúde, a bateria, o sinal e a sequência sem GPS.
create or replace function private.seal_handle_position(p_device uuid, p_message jsonb, p_message_row uuid, p_stale boolean)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_limits jsonb := private.seal_limits();
  v_before public.seal_devices;
  v_read timestamptz := (p_message->>'read_at')::timestamptz;
  v_gps boolean := p_message->>'quality' = 'gps';
  v_battery integer := (p_message->>'battery_pct')::int;
  v_signal integer := (p_message->>'signal_dbm')::int;
  v_low boolean;
  v_health text;
begin
  select d.* into v_before from public.seal_devices d where d.id = p_device;
  perform private.seal_store_position(p_device, p_message, p_message_row, p_stale);
  if p_stale then return null; end if;

  update public.seal_devices set no_gps_since = case when v_gps then null else coalesce(no_gps_since, v_read) end where id = p_device;
  v_low := v_battery is not null and v_battery < (v_limits->>'low_battery_pct')::int;

  -- Bateria e sinal: alerta na mudança, não a cada leitura (RF-016).
  if v_low and not coalesce(v_before.battery_pct < (v_limits->>'low_battery_pct')::int, false) then
    perform private.open_seal_alert(p_device, 'low_battery', 'medium', 'system', jsonb_build_object('battery_pct', v_battery), false);
  end if;
  if v_signal is not null and v_signal < (v_limits->>'weak_signal_dbm')::int
     and not coalesce(v_before.signal_dbm < (v_limits->>'weak_signal_dbm')::int, false) then
    perform private.open_seal_alert(p_device, 'weak_signal', 'medium', 'system', jsonb_build_object('signal_dbm', v_signal), false);
  end if;

  -- Saúde: com GPS, "funcionando" (ou "bateria baixa"); sem GPS, quem estava em silêncio volta a "funcionando" e a verificação
  -- automática decide o "sem GPS" depois de três intervalos.
  v_health := case
    when v_gps then case when v_low then 'low_battery' else 'ok' end
    when v_before.health in ('never_seen', 'no_comm', 'off') then case when v_low then 'low_battery' else 'ok' end
    else v_before.health end;
  if v_health = 'ok' and v_before.health = 'low_battery' and not v_gps then v_health := 'low_battery'; end if;
  perform private.seal_set_health(p_device, v_health);
  if v_gps or v_before.health in ('no_comm', 'off') then perform private.seal_recover(p_device); end if;
  return null;
end $$;

-- Aviso de desligamento: "desligado" na hora e o alerta conforme o lugar do cilindro (RF-014).
create or replace function private.seal_handle_shutdown(p_device uuid, p_message jsonb, p_message_row uuid, p_stale boolean)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid;
begin
  select d.organization_id into v_org from public.seal_devices d where d.id = p_device;
  insert into public.seal_device_events (organization_id, device_id, event_type, at)
  values (v_org, p_device, 'shutdown', (p_message->>'read_at')::timestamptz);
  perform private.seal_store_position(p_device, p_message, p_message_row, p_stale);
  if p_stale then return null; end if;
  perform private.seal_set_health(p_device, 'off');
  perform private.seal_open_silence_alert(p_device, 'shutdown');
  return null;
end $$;

-- Alerta enviado pelo próprio lacre (RF-016): não duplica; lacre aberto ou rompido estando travado é crítico.
create or replace function private.seal_handle_alert(p_device uuid, p_message jsonb, p_message_row uuid, p_stale boolean)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_code text := p_message->>'code';
  v_locked boolean;
begin
  select d.lock_state in ('locked', 'locked_violation', 'locked_comm_loss') into v_locked from public.seal_devices d where d.id = p_device;
  perform private.open_seal_alert(p_device, v_code,
    case when v_code in ('seal_open', 'seal_broken') then case when v_locked then 'critical' else 'high' end else 'medium' end,
    'device', jsonb_build_object('value', p_message->'value'), false);
  return null;
end $$;

-- Verificação automática (RF-013): sem ação humana, idempotente. Os prazos de comando entram na US2 (`seal_watchdog_commands`).
create function private.seal_watchdog_commands() returns void
language plpgsql security definer set search_path = '' as $$ begin return; end $$;
create function private.seal_watchdog_push() returns void
language plpgsql security definer set search_path = '' as $$ begin return; end $$;
create function private.seal_watchdog_watches() returns void
language plpgsql security definer set search_path = '' as $$ begin return; end $$;

create function private.run_seal_watchdog() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_limits jsonb := private.seal_limits();
  v_device public.seal_devices;
  v_silent integer := 0;
  v_no_gps integer := 0;
begin
  for v_device in
    select d.* from public.seal_devices d
     where d.status = 'active' and d.last_seen_at is not null and d.health not in ('no_comm', 'off')
       and d.last_seen_at < now() - make_interval(secs => d.report_interval_s + (v_limits->>'no_comm_grace_s')::int)
     for update skip locked
  loop
    perform private.seal_set_health(v_device.id, 'no_comm');
    perform private.seal_open_silence_alert(v_device.id, 'no_comm');
    v_silent := v_silent + 1;
  end loop;

  for v_device in
    select d.* from public.seal_devices d
     where d.status = 'active' and d.health in ('ok', 'low_battery') and d.no_gps_since is not null
       and d.no_gps_since < now() - make_interval(secs => d.report_interval_s * (v_limits->>'no_gps_intervals')::int)
     for update skip locked
  loop
    perform private.seal_set_health(v_device.id, 'no_gps');
    perform private.open_seal_alert(v_device.id, 'no_gps', 'medium', 'system', jsonb_build_object('since', v_device.no_gps_since), false);
    v_no_gps := v_no_gps + 1;
  end loop;

  perform private.seal_watchdog_commands();
  perform private.seal_watchdog_watches();
  perform private.seal_watchdog_push();
  return jsonb_build_object('no_comm', v_silent, 'no_gps', v_no_gps);
end $$;

revoke all on function private.seal_risk(uuid), private.seal_set_health(uuid, text), private.seal_recover(uuid),
  private.seal_open_silence_alert(uuid, text), private.seal_watchdog_commands(), private.seal_watchdog_push(), private.seal_watchdog_watches(),
  private.run_seal_watchdog() from public, anon, authenticated;

do $$
begin
  perform cron.schedule('fluxid-seal-watchdog', '* * * * *', 'select private.run_seal_watchdog()');
exception when others then
  raise notice 'pg_cron indisponível (%): agende private.run_seal_watchdog() a cada minuto pela plataforma.', sqlerrm;
end $$;
