-- Spec 012, US4: vigilância da geocerca do cliente, violação e trava pelo próprio lacre (RF-018 a RF-022a, RN-004, RN-011, MS-005, MS-011;
-- research.md, item 12). Só o cilindro entregue e sob custódia do cliente é vigiado: pela geocerca da unidade da entrega, do momento da
-- entrega até uma nova viagem ou a volta ao estoque. Cada posição com GPS nova é comparada com a geocerca; duas seguidas fora, além de
-- 50 m, abrem a violação e o alerta. O comando de travar sai no fim do envio, se o lacre ainda não estiver travado e a última posição
-- continuar fora: assim um lote atrasado não trava com dado velho e o lacre que já travou sozinho não recebe outro comando.

-- Versão da vigilância única no FluxID inteiro: o lacre guarda a última e só recebe o contorno quando ela muda.
create sequence private.seal_watch_version_seq;
alter table public.seal_watches alter column version set default nextval('private.seal_watch_version_seq');

create or replace function private.seal_start_watch(p_item public.trip_items, p_site uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_device uuid;
  v_open public.seal_watches;
begin
  if not exists (select 1 from public.geofences g where g.site_id = p_site and g.status = 'active') then return; end if;
  select d.id into v_device from public.seal_bindings b join public.seal_devices d on d.id = b.device_id
   where b.cylinder_id = p_item.cylinder_id and b.unbound_at is null and d.status = 'active';
  if v_device is null then return; end if;
  select w.* into v_open from public.seal_watches w where w.cylinder_id = p_item.cylinder_id and w.ended_at is null;
  if v_open.id is not null and v_open.site_id = p_site and v_open.device_id = v_device then return; end if;
  if v_open.id is not null then perform private.seal_end_watch(p_item.cylinder_id, 'new_trip'); end if;
  insert into public.seal_watches (organization_id, cylinder_id, device_id, site_id, trip_item_id)
  values (p_item.organization_id, p_item.cylinder_id, v_device, p_site, p_item.id);
  perform private.seal_broadcast(p_item.organization_id, 'watch', v_device, p_item.cylinder_id);
end $$;

create or replace function private.seal_end_watch(p_cylinder uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_watch public.seal_watches;
begin
  for v_watch in select w.* from public.seal_watches w where w.cylinder_id = p_cylinder and w.ended_at is null for update loop
    update public.seal_watches set ended_at = now(), end_reason = p_reason where id = v_watch.id;
    perform private.seal_broadcast(v_watch.organization_id, 'watch', v_watch.device_id, p_cylinder);
  end loop;
end $$;

-- Distância até a geocerca ativa mais próxima da unidade (0 dentro, a borda conta como dentro); nula sem geocerca ativa.
create function private.seal_site_distance(p_site uuid, p_point extensions.geography, out distance numeric, out geofence_id uuid)
language sql stable security definer set search_path = '' as $$
  select round(extensions.st_distance(g.area, p_point)::numeric, 1), g.id
    from public.geofences g where g.site_id = p_site and g.status = 'active'
   order by extensions.st_distance(g.area, p_point) limit 1
$$;

-- Uma posição com GPS nova de um lacre sob vigilância (RF-018 a RF-020).
create function private.seal_evaluate_watch(p_device uuid, p_message jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_limits jsonb := private.seal_limits();
  v_watch public.seal_watches;
  v_device public.seal_devices;
  v_point extensions.geography;
  v_distance numeric;
  v_geofence uuid;
  v_open public.seal_violations;
  v_violation uuid;
begin
  if p_message->>'quality' <> 'gps' then return; end if;
  select w.* into v_watch from public.seal_watches w where w.device_id = p_device and w.ended_at is null and w.suspended_at is null for update;
  if v_watch.id is null then return; end if;
  select d.* into v_device from public.seal_devices d where d.id = p_device;
  v_point := extensions.st_setsrid(extensions.st_makepoint((p_message->>'longitude')::float8, (p_message->>'latitude')::float8), 4326)::extensions.geography;
  select s.distance, s.geofence_id into v_distance, v_geofence from private.seal_site_distance(v_watch.site_id, v_point) s;
  if v_distance is null then return; end if;
  select v.* into v_open from public.seal_violations v where v.watch_id = v_watch.id and v.status = 'open' for update;

  if v_distance > (v_limits->>'geofence_tolerance_m')::numeric then
    update public.seal_watches set outside_streak = outside_streak + 1 where id = v_watch.id;
    if v_open.id is not null then
      update public.seal_violations set last_position_id = v_device.last_position_id, distance_m = v_distance where id = v_open.id;
    elsif v_watch.outside_streak + 1 >= (v_limits->>'geofence_outside_streak')::int then
      insert into public.seal_violations (organization_id, watch_id, cylinder_id, device_id, geofence_id, first_outside_at, first_position_id, last_position_id, distance_m)
      values (v_watch.organization_id, v_watch.id, v_watch.cylinder_id, p_device, v_geofence, (p_message->>'read_at')::timestamptz,
        v_device.last_position_id, v_device.last_position_id, v_distance)
      returning id into v_violation;
      perform private.open_seal_alert(p_device, 'geofence_violation', 'high', 'system',
        jsonb_build_object('violation_id', v_violation, 'site_id', v_watch.site_id, 'distance_m', v_distance), true);
    end if;
  else
    update public.seal_watches set outside_streak = 0 where id = v_watch.id;
    if v_open.id is not null then
      update public.seal_violations set status = 'returned', returned_at = (p_message->>'read_at')::timestamptz where id = v_open.id;
      perform private.seal_broadcast(v_watch.organization_id, 'watch', p_device, v_watch.cylinder_id);
    end if;
  end if;
end $$;

-- Posição: grava, atualiza a saúde (US6) e, para a leitura mais nova, avalia a vigilância.
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
  if v_low and not coalesce(v_before.battery_pct < (v_limits->>'low_battery_pct')::int, false) then
    perform private.open_seal_alert(p_device, 'low_battery', 'medium', 'system', jsonb_build_object('battery_pct', v_battery), false);
  end if;
  if v_signal is not null and v_signal < (v_limits->>'weak_signal_dbm')::int
     and not coalesce(v_before.signal_dbm < (v_limits->>'weak_signal_dbm')::int, false) then
    perform private.open_seal_alert(p_device, 'weak_signal', 'medium', 'system', jsonb_build_object('signal_dbm', v_signal), false);
  end if;
  v_health := case
    when v_gps then case when v_low then 'low_battery' else 'ok' end
    when v_before.health in ('never_seen', 'no_comm', 'off') then case when v_low then 'low_battery' else 'ok' end
    else v_before.health end;
  if v_health = 'ok' and v_before.health = 'low_battery' and not v_gps then v_health := 'low_battery'; end if;
  perform private.seal_set_health(p_device, v_health);
  if v_gps or v_before.health in ('no_comm', 'off') then perform private.seal_recover(p_device); end if;

  perform private.seal_evaluate_watch(p_device, p_message);
  return null;
end $$;

-- Trava feita pelo próprio lacre, sem comunicação e fora da geocerca (RN-011): registra, alerta e não cria comando.
create or replace function private.seal_handle_auto_lock(p_device uuid, p_message jsonb, p_message_row uuid, p_stale boolean)
returns text language plpgsql security definer set search_path = '' as $$
begin
  perform private.seal_store_position(p_device, p_message, p_message_row, p_stale);
  perform private.seal_set_lock(p_device, 'locked_comm_loss');
  perform private.open_seal_alert(p_device, 'comm_loss_lock', 'high', 'system', jsonb_build_object('locked_at', p_message->>'locked_at'), true);
  return null;
end $$;

-- Fim do envio: a violação aberta sem comando ganha o de travar, se o lacre não estiver travado e a última posição continuar fora.
create or replace function private.seal_after_batch(p_device uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_device public.seal_devices;
  v_violation public.seal_violations;
  v_command uuid;
begin
  select d.* into v_device from public.seal_devices d where d.id = p_device;
  if v_device.status <> 'active' then return; end if;
  for v_violation in
    select v.* from public.seal_violations v join public.seal_watches w on w.id = v.watch_id
     where v.device_id = p_device and v.status = 'open' and v.command_id is null and w.ended_at is null and w.outside_streak > 0
     for update of v
  loop
    if v_device.lock_state not in ('locked', 'locked_violation', 'locked_comm_loss') then
      v_command := private.issue_seal_command(p_device, 'lock', 'geofence_violation', null, null, null, null, null, v_violation.id);
      update public.seal_violations set command_id = v_command where id = v_violation.id;
    end if;
  end loop;
end $$;

-- Vigilância na resposta ao lacre: ativa com a versão; o contorno só quando a versão do lacre é outra (research.md, item 12).
create or replace function private.seal_watch_payload(p_device uuid, p_watch_version integer) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_watch public.seal_watches;
begin
  select w.* into v_watch from public.seal_watches w where w.device_id = p_device and w.ended_at is null and w.suspended_at is null;
  if v_watch.id is null then return jsonb_build_object('active', false, 'version', 0); end if;
  if p_watch_version is not distinct from v_watch.version then return jsonb_build_object('active', true, 'version', v_watch.version); end if;
  return jsonb_build_object('active', true, 'version', v_watch.version, 'fences', coalesce((
    select jsonb_agg(case g.shape
      when 'circle' then jsonb_build_object('shape', 'circle', 'lat', round(extensions.st_y(g.center::extensions.geometry)::numeric, 6),
        'lng', round(extensions.st_x(g.center::extensions.geometry)::numeric, 6), 'radius_m', g.radius_m)
      else jsonb_build_object('shape', 'polygon', 'vertices', (select jsonb_agg(jsonb_build_array((v->>'lat')::numeric, (v->>'lng')::numeric))
        from jsonb_array_elements(g.vertices) v)) end order by g.id)
      from public.geofences g where g.site_id = v_watch.site_id and g.status = 'active'), '[]'::jsonb));
end $$;

-- Geocerca criada, editada ou inativada (Spec 007): a versão da vigilância muda para o lacre receber o contorno novo; sem geocerca ativa,
-- a vigilância fica suspensa, com alerta médio.
create function private.seal_refresh_site_watches(p_site uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_watch public.seal_watches;
  v_active boolean := exists (select 1 from public.geofences g where g.site_id = p_site and g.status = 'active');
begin
  for v_watch in select w.* from public.seal_watches w where w.site_id = p_site and w.ended_at is null for update loop
    update public.seal_watches set version = nextval('private.seal_watch_version_seq'), outside_streak = 0,
      suspended_at = case when v_active then null else coalesce(suspended_at, now()) end
     where id = v_watch.id;
    if not v_active and v_watch.suspended_at is null then
      perform private.open_seal_alert(v_watch.device_id, 'watch_suspended', 'medium', 'system', jsonb_build_object('site_id', p_site), false);
    end if;
    perform private.seal_broadcast(v_watch.organization_id, 'watch', v_watch.device_id, v_watch.cylinder_id);
  end loop;
end $$;

create function private.seal_geofence_trigger() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform private.seal_refresh_site_watches(new.site_id);
  return null;
end $$;
create trigger geofences_seal_watch after insert or update on public.geofences
  for each row execute function private.seal_geofence_trigger();

create or replace function private.seal_watchdog_watches() returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_site uuid;
begin
  for v_site in
    select distinct w.site_id from public.seal_watches w
     where w.ended_at is null and w.suspended_at is null
       and not exists (select 1 from public.geofences g where g.site_id = w.site_id and g.status = 'active')
  loop
    perform private.seal_refresh_site_watches(v_site);
  end loop;
end $$;

-- A vigilância termina na nova viagem (saída do cilindro) e na volta ao estoque (RN-004).
create or replace function private.seal_on_item_departed(p_item public.trip_items) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_device uuid;
  v_command uuid;
begin
  perform private.seal_end_watch(p_item.cylinder_id, 'new_trip');
  if p_item.seal_command_id is not null
     or exists (select 1 from public.seal_commands c where c.trip_item_id = p_item.id and c.origin = 'trip_start') then
    return;
  end if;
  select d.id into v_device from public.seal_bindings b join public.seal_devices d on d.id = b.device_id
   where b.cylinder_id = p_item.cylinder_id and b.unbound_at is null and d.status = 'active';
  if v_device is null then return; end if;
  v_command := private.issue_seal_command(v_device, 'lock', 'trip_start', null, null, null, p_item.trip_id, p_item.id, null);
  update public.trip_items set seal_command_id = v_command where id = p_item.id;
end $$;

create function private.seal_cylinder_stock_trigger() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.stock_status = 'in_stock' and old.stock_status is distinct from 'in_stock' then
    perform private.seal_end_watch(new.id, 'stock_in');
  end if;
  return null;
end $$;
create trigger cylinders_seal_watch after update of stock_status on public.cylinders
  for each row execute function private.seal_cylinder_stock_trigger();

revoke all on function private.seal_site_distance(uuid, extensions.geography), private.seal_evaluate_watch(uuid, jsonb),
  private.seal_refresh_site_watches(uuid), private.seal_geofence_trigger(), private.seal_cylinder_stock_trigger() from public, anon, authenticated;
