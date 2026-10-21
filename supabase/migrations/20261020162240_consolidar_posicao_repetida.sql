-- Spec 013, ajuste de bancada: o lacre continua transmitindo a cada minuto, mas uma posição repetida altera somente o horário em que
-- aquele ponto foi visto por último. A telemetria corrente (bateria, sinal e estado) continua atualizada em seal_devices pelo mesmo
-- processamento, sem reescrever o ponto histórico nem criar uma posição nova.
create or replace function private.seal_store_position(p_device uuid, p_message jsonb, p_message_row uuid, p_stale boolean)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_limits jsonb := private.seal_limits();
  v_org uuid;
  v_read timestamptz := (p_message->>'read_at')::timestamptz;
  v_point extensions.geography := extensions.st_setsrid(
    extensions.st_makepoint((p_message->>'longitude')::float8, (p_message->>'latitude')::float8), 4326)::extensions.geography;
  v_quality text := p_message->>'quality';
  v_state text := coalesce(p_message->>'seal_state', 'unknown');
  v_battery smallint := (p_message->>'battery_pct')::smallint;
  v_signal smallint := (p_message->>'signal_dbm')::smallint;
  v_prev public.seal_positions;
  v_cylinder uuid;
  v_position uuid;
  v_new boolean := false;
begin
  select d.organization_id into v_org from public.seal_devices d where d.id = p_device for update;
  select b.cylinder_id into v_cylinder from public.seal_bindings b
   where b.device_id = p_device and b.bound_at <= v_read and (b.unbound_at is null or b.unbound_at > v_read)
   order by b.bound_at desc limit 1;
  select p.* into v_prev from public.seal_positions p where p.device_id = p_device and p.read_at <= v_read order by p.read_at desc limit 1;

  if v_prev.id is not null and v_prev.quality = v_quality and v_prev.seal_state = v_state
     and extensions.st_distance(v_prev.point, v_point) <= (v_limits->>'repeat_distance_m')::numeric then
    update public.seal_positions
       set last_seen_at = greatest(last_seen_at, v_read)
     where id = v_prev.id;
    v_position := v_prev.id;
  else
    insert into public.seal_positions (organization_id, device_id, cylinder_id, message_id, point, accuracy_m, quality, seal_state,
      battery_pct, signal_dbm, read_at, last_seen_at)
    values (v_org, p_device, v_cylinder, p_message_row, v_point, (p_message->>'accuracy_m')::numeric, v_quality, v_state,
      v_battery, v_signal, v_read, v_read)
    returning id into v_position;
    v_new := true;
  end if;

  if not p_stale then
    update public.seal_devices set
      last_read_at = greatest(coalesce(last_read_at, v_read), v_read),
      last_position_id = v_position,
      battery_pct = v_battery,
      signal_dbm = v_signal,
      seal_state = v_state,
      wifi_in_use = case when p_message ? 'wifi' then (p_message->'wifi') || jsonb_build_object('at', v_read) else wifi_in_use end,
      wifi_available = coalesce(p_message->'available_networks', wifi_available),
      updated_at = now()
     where id = p_device;
    if v_new then perform private.seal_broadcast(v_org, 'position', p_device, v_cylinder); end if;
  end if;
  return v_position;
end $$;

revoke all on function private.seal_store_position(uuid, jsonb, uuid, boolean) from public, anon, authenticated;
