-- Spec 012, US1: leituras do lacre para a tela (contracts/operacoes-servidor.md, `query-seals`). Toda RPC confere `seal.read` na
-- organização do ator e responde NOT_FOUND para registro de outra organização (RF-037). As coordenadas só saem destas leituras, para
-- quem tem a permissão; nunca em auditoria, evento ou notificação.

-- Última posição, saúde, trava e comando em curso de um dispositivo (o mesmo resumo em todas as telas).
create function private.seal_device_summary(p_device uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'device_id', d.id, 'device_code', d.device_code, 'label', d.label, 'status', d.status, 'health', d.health,
    'lock_state', d.lock_state, 'seal_state', d.seal_state, 'battery_pct', d.battery_pct, 'signal_dbm', d.signal_dbm,
    'last_seen_at', d.last_seen_at, 'report_interval_s', d.report_interval_s,
    'position', (select jsonb_build_object(
        'latitude', round(extensions.st_y(p.point::extensions.geometry)::numeric, 6), 'longitude', round(extensions.st_x(p.point::extensions.geometry)::numeric, 6),
        'accuracy_m', p.accuracy_m, 'quality', p.quality, 'read_at', p.read_at, 'last_seen_at', p.last_seen_at)
      from public.seal_positions p where p.id = d.last_position_id),
    'pending_command', (select jsonb_build_object('id', c.id, 'kind', c.kind, 'status', c.status, 'origin', c.origin, 'created_at', c.created_at)
      from public.seal_commands c where c.device_id = d.id and c.status in ('pending', 'delivered') and c.kind in ('lock', 'unlock')
      order by c.created_at desc limit 1),
    'watch', (select jsonb_build_object('site_id', w.site_id, 'site_name', s.name, 'started_at', w.started_at, 'suspended', w.suspended_at is not null)
      from public.seal_watches w join public.customer_sites s on s.id = w.site_id where w.device_id = d.id and w.ended_at is null limit 1),
    'violation', (select jsonb_build_object('id', v.id, 'status', v.status, 'first_outside_at', v.first_outside_at, 'distance_m', v.distance_m, 'returned_at', v.returned_at)
      from public.seal_violations v where v.device_id = d.id and v.status in ('open', 'returned') order by v.first_outside_at desc limit 1))
  from public.seal_devices d where d.id = p_device
$$;

-- Lista de lacres da organização, com filtros por saúde, trava e "sem cilindro" (tela de lacres, História 6).
create function public.list_seals(p_actor uuid, p_session uuid, p_organization uuid, p_health text default null, p_lock text default null,
  p_unbound boolean default null, p_offset integer default 0, p_limit integer default 50)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  denied text;
  v_items jsonb;
  v_total integer;
begin
  denied := private.cylinder_authorize(p_actor, p_session, p_organization, 'seal.read');
  if denied is not null then return jsonb_build_object('code', denied); end if;
  with filtered as (
    select d.id, d.label, b.cylinder_id, c.serial_number, c.custody_status
      from public.seal_devices d
      left join public.seal_bindings b on b.device_id = d.id and b.unbound_at is null
      left join public.cylinders c on c.id = b.cylinder_id
     where d.organization_id = p_organization
       and (p_health is null or d.health = p_health)
       and (p_lock is null or d.lock_state = p_lock)
       and (p_unbound is null or (b.id is null) = p_unbound)
  )
  select (select count(*) from filtered),
         coalesce((select jsonb_agg(private.seal_device_summary(f.id) || jsonb_build_object(
             'cylinder', case when f.cylinder_id is null then null else jsonb_build_object('id', f.cylinder_id, 'serial_number', f.serial_number, 'custody_status', f.custody_status) end)
           order by f.label, f.id)
           from (select * from filtered order by label, id offset greatest(p_offset, 0) limit least(greatest(p_limit, 1), 200)) f), '[]'::jsonb)
    into v_total, v_items;
  return jsonb_build_object('code', 'LISTED', 'items', v_items, 'total', v_total);
end $$;

-- Detalhe do dispositivo: resumo, rede em uso e nomes das redes guardadas (nunca senha), vínculos, últimos comandos e alertas.
create function public.get_seal(p_actor uuid, p_session uuid, p_organization uuid, p_device uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  denied text;
  v_device public.seal_devices;
begin
  denied := private.cylinder_authorize(p_actor, p_session, p_organization, 'seal.read');
  if denied is not null then return jsonb_build_object('code', denied); end if;
  select d.* into v_device from public.seal_devices d where d.id = p_device and d.organization_id = p_organization;
  if v_device.id is null then return jsonb_build_object('code', 'NOT_FOUND'); end if;
  return jsonb_build_object('code', 'FOUND', 'seal', private.seal_device_summary(v_device.id) || jsonb_build_object(
    'seal_code', v_device.seal_code, 'activated_at', v_device.activated_at, 'firmware_version', v_device.firmware_version,
    'wifi_in_use', v_device.wifi_in_use, 'wifi_saved', v_device.wifi_saved,
    'wifi_available', v_device.wifi_available, 'wifi_available_at', v_device.last_read_at,
    'version', v_device.version, 'created_at', v_device.created_at,
    'bindings', coalesce((select jsonb_agg(jsonb_build_object('cylinder_id', b.cylinder_id, 'serial_number', c.serial_number, 'bound_at', b.bound_at,
        'unbound_at', b.unbound_at, 'unbind_reason', b.unbind_reason) order by b.bound_at desc)
      from public.seal_bindings b join public.cylinders c on c.id = b.cylinder_id where b.device_id = v_device.id), '[]'::jsonb),
    'commands', coalesce((select jsonb_agg(x order by x->>'created_at' desc) from (
      select jsonb_build_object('id', c.id, 'kind', c.kind, 'origin', c.origin, 'status', c.status, 'created_at', c.created_at,
        'delivered_at', c.delivered_at, 'finished_at', c.finished_at, 'wifi_ssid', c.wifi_ssid) x
        from public.seal_commands c where c.device_id = v_device.id order by c.created_at desc limit 10) t), '[]'::jsonb),
    'alerts', coalesce((select jsonb_agg(x order by x->>'opened_at' desc) from (
      select jsonb_build_object('id', a.id, 'kind', a.kind, 'severity', a.severity, 'status', a.status, 'opened_at', a.opened_at, 'recovered_at', a.recovered_at) x
        from public.seal_alerts a where a.device_id = v_device.id order by a.opened_at desc limit 10) t), '[]'::jsonb)));
end $$;

-- Bloco "Lacre" no detalhe do cilindro (RF-011): o lacre do vínculo ativo, ou nulo ("cilindro sem lacre").
create function public.cylinder_seal_view(p_actor uuid, p_session uuid, p_organization uuid, p_cylinder uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  denied text;
  v_device uuid;
begin
  denied := private.cylinder_authorize(p_actor, p_session, p_organization, 'seal.read');
  if denied is not null then return jsonb_build_object('code', denied); end if;
  if not exists (select 1 from public.cylinders c where c.id = p_cylinder and c.organization_id = p_organization) then
    return jsonb_build_object('code', 'NOT_FOUND');
  end if;
  select b.device_id into v_device from public.seal_bindings b where b.cylinder_id = p_cylinder and b.unbound_at is null;
  return jsonb_build_object('code', 'FOUND', 'seal', case when v_device is null then null else private.seal_device_summary(v_device) end);
end $$;

-- Coluna "Trava física" no detalhe da viagem (RF-011, RF-030): um resumo por cilindro, "sem lacre" quando não há vínculo.
create function public.trip_seal_view(p_actor uuid, p_session uuid, p_organization uuid, p_trip uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  denied text;
begin
  denied := private.cylinder_authorize(p_actor, p_session, p_organization, 'seal.read');
  if denied is not null then return jsonb_build_object('code', denied); end if;
  if not exists (select 1 from public.trips t where t.id = p_trip and t.organization_id = p_organization) then
    return jsonb_build_object('code', 'NOT_FOUND');
  end if;
  return jsonb_build_object('code', 'FOUND', 'items', coalesce((
    select jsonb_agg(jsonb_build_object('item_id', i.id, 'cylinder_id', i.cylinder_id, 'serial_number', c.serial_number,
        'seal_command_id', i.seal_command_id,
        'seal', case when b.device_id is null then null else private.seal_device_summary(b.device_id) end) order by c.serial_number)
      from public.trip_items i
      join public.cylinders c on c.id = i.cylinder_id
      left join public.seal_bindings b on b.cylinder_id = i.cylinder_id and b.unbound_at is null
     where i.trip_id = p_trip and i.organization_id = p_organization and i.item_status <> 'removed'), '[]'::jsonb));
end $$;

-- Histórico de posições de um cilindro ou de um dispositivo (alternativa em texto ao mapa, RF-042), mais nova primeiro.
create function public.list_positions(p_actor uuid, p_session uuid, p_organization uuid, p_cylinder uuid default null, p_device uuid default null,
  p_from timestamptz default null, p_to timestamptz default null, p_offset integer default 0, p_limit integer default 100)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  denied text;
begin
  denied := private.cylinder_authorize(p_actor, p_session, p_organization, 'seal.read');
  if denied is not null then return jsonb_build_object('code', denied); end if;
  if (p_cylinder is null) = (p_device is null) then return jsonb_build_object('code', 'VALIDATION_FAILED'); end if;
  if p_cylinder is not null and not exists (select 1 from public.cylinders c where c.id = p_cylinder and c.organization_id = p_organization) then
    return jsonb_build_object('code', 'NOT_FOUND');
  end if;
  if p_device is not null and not exists (select 1 from public.seal_devices d where d.id = p_device and d.organization_id = p_organization) then
    return jsonb_build_object('code', 'NOT_FOUND');
  end if;
  return jsonb_build_object('code', 'LISTED', 'items', coalesce((
    select jsonb_agg(jsonb_build_object(
        'latitude', round(extensions.st_y(p.point::extensions.geometry)::numeric, 6), 'longitude', round(extensions.st_x(p.point::extensions.geometry)::numeric, 6),
        'accuracy_m', p.accuracy_m, 'quality', p.quality, 'seal_state', p.seal_state, 'battery_pct', p.battery_pct,
        'read_at', p.read_at, 'last_seen_at', p.last_seen_at, 'repeat_count', p.repeat_count) order by p.read_at desc)
      from (select * from public.seal_positions p
             where p.organization_id = p_organization
               and (p_cylinder is null or p.cylinder_id = p_cylinder) and (p_device is null or p.device_id = p_device)
               and (p_from is null or p.read_at >= p_from) and (p_to is null or p.read_at <= p_to)
             order by p.read_at desc offset greatest(p_offset, 0) limit least(greatest(p_limit, 1), 500)) p), '[]'::jsonb));
end $$;

revoke all on function private.seal_device_summary(uuid) from public, anon, authenticated;
revoke all on function public.list_seals(uuid, uuid, uuid, text, text, boolean, integer, integer), public.get_seal(uuid, uuid, uuid, uuid),
  public.cylinder_seal_view(uuid, uuid, uuid, uuid), public.trip_seal_view(uuid, uuid, uuid, uuid),
  public.list_positions(uuid, uuid, uuid, uuid, uuid, timestamptz, timestamptz, integer, integer) from public, anon, authenticated;
grant execute on function public.list_seals(uuid, uuid, uuid, text, text, boolean, integer, integer), public.get_seal(uuid, uuid, uuid, uuid),
  public.cylinder_seal_view(uuid, uuid, uuid, uuid), public.trip_seal_view(uuid, uuid, uuid, uuid),
  public.list_positions(uuid, uuid, uuid, uuid, uuid, timestamptz, timestamptz, integer, integer) to service_role;
