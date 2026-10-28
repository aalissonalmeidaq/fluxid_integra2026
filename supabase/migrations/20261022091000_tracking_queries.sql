-- Spec 015 (T023; US1, RF-001 a RF-006): consultas de acompanhamento das viagens em andamento. Exigem `tracking.read`; viagem de
-- outra empresa é indistinguível de inexistente. As posições trazem origem, instante observado e recebido e precisão; o frescor é
-- calculado no cliente com a regra vigente devolvida aqui, para que lista, mapa e contadores usem o mesmo critério. Nada é estimado:
-- sem posição, o campo vem nulo.

-- Posição como evidência. Coordenadas com 6 casas (cerca de 0,1 m), só para o mapa de quem tem `tracking.read`.
create function private.tracking_point_json(p_id uuid, p_point extensions.geography, p_accuracy numeric, p_observed timestamptz,
  p_received timestamptz) returns jsonb
language sql immutable security definer set search_path = '' as $$
  select jsonb_build_object('id', p_id,
    'latitude', round(extensions.st_y(p_point::extensions.geometry)::numeric, 6),
    'longitude', round(extensions.st_x(p_point::extensions.geometry)::numeric, 6),
    'accuracy_m', p_accuracy, 'observed_at', p_observed, 'received_at', p_received)
$$;

-- Lacres da carga ainda aberta da viagem, com o vínculo vigente lacre-cilindro.
create function private.tracking_trip_seals(p_trip uuid) returns table (device_id uuid, label text, cylinder_id uuid, serial_number text,
  item_status text, bound_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select b.device_id, d.label, ti.cylinder_id, c.serial_number, ti.item_status, b.bound_at
    from public.trip_items ti
    join public.cylinders c on c.id = ti.cylinder_id and c.organization_id = ti.organization_id
    join public.seal_bindings b on b.cylinder_id = ti.cylinder_id and b.organization_id = ti.organization_id and b.unbound_at is null
    join public.seal_devices d on d.id = b.device_id and d.organization_id = b.organization_id
   where ti.trip_id = p_trip and ti.is_open
   order by c.serial_number, b.device_id
$$;

-- Última posição do lacre desde o vínculo. `confirmed_at` é a última vez que o lacre repetiu a mesma leitura.
create function private.tracking_seal_last(p_device uuid, p_since timestamptz) returns jsonb
language sql stable security definer set search_path = '' as $$
  select private.tracking_point_json(p.id, p.point, p.accuracy_m, p.read_at, p.received_at)
         || jsonb_build_object('confirmed_at', p.last_seen_at, 'quality', p.quality)
    from public.seal_positions p
   where p.device_id = p_device and p.read_at >= p_since
   order by p.read_at desc, p.id desc
   limit 1
$$;

-- Linha de acompanhamento de uma viagem: veículo, motorista, sessão de coleta, última posição do celular e lacres com a última posição.
create function private.tracking_trip_row(p_trip uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'trip_id', t.id, 'trip_number', t.number, 'status', t.status, 'started_at', t.started_at,
    'vehicle', jsonb_build_object('id', v.id, 'plate', v.plate),
    'driver', jsonb_build_object('id', dr.id, 'name', dr.full_name),
    'session', (select jsonb_build_object('id', s.id, 'status', s.status, 'platform', s.platform, 'capability', s.capability,
                  'capability_changed_at', s.capability_changed_at, 'notifications_denied', s.notifications_denied,
                  'last_online_confirmed_at', s.last_online_confirmed_at, 'started_at', s.started_at)
                  from public.tracking_sessions s where s.trip_id = t.id
                 order by (s.status = 'active') desc, s.started_at desc, s.id desc limit 1),
    'mobile', (select private.tracking_point_json(m.id, m.point, m.accuracy_m, m.observed_at, m.received_at)
                      || jsonb_build_object('sync_kind', m.sync_kind, 'validity', m.validity)
                 from public.mobile_positions m
                where m.organization_id = t.organization_id and m.trip_id = t.id and m.validity <> 'context_invalid'
                order by m.observed_at desc, m.id desc limit 1),
    'seals', coalesce((select jsonb_agg(jsonb_build_object('device_id', s.device_id, 'label', s.label, 'cylinder_id', s.cylinder_id,
                  'serial_number', s.serial_number, 'item_status', s.item_status, 'position', private.tracking_seal_last(s.device_id, s.bound_at)))
                  from private.tracking_trip_seals(t.id) s), '[]'::jsonb),
    -- As ocorrências de proximidade entram com a US2.
    'open_occurrences', 0)
  from public.trips t
  join public.vehicles v on v.id = t.vehicle_id and v.organization_id = t.organization_id
  join public.drivers dr on dr.id = t.driver_id and dr.organization_id = t.organization_id
  where t.id = p_trip
$$;

create function public.list_active_trip_tracking(p_actor uuid, p_session uuid, p_organization uuid, p_trip uuid default null,
  p_vehicle uuid default null, p_driver uuid default null, p_cursor_at timestamptz default null, p_cursor_id uuid default null,
  p_limit integer default 50)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  denied text;
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 100);
  v_ids uuid[];
  v_last_at timestamptz;
  v_last_id uuid;
  v_more boolean;
begin
  denied := private.tracking_authorize(p_actor, p_session, p_organization, 'tracking.read');
  if denied is not null then return jsonb_build_object('code', denied); end if;
  if (p_cursor_at is null) <> (p_cursor_id is null) then return jsonb_build_object('code', 'VALIDATION_FAILED'); end if;

  select array_agg(t.id order by t.started_at desc, t.id desc) into v_ids
    from (select t.id, t.started_at from public.trips t
           where t.organization_id = p_organization and t.status = 'in_progress'
             and (p_trip is null or t.id = p_trip) and (p_vehicle is null or t.vehicle_id = p_vehicle)
             and (p_driver is null or t.driver_id = p_driver)
             and (p_cursor_at is null or (t.started_at, t.id) < (p_cursor_at, p_cursor_id))
           order by t.started_at desc, t.id desc
           limit v_limit + 1) t;

  v_more := coalesce(array_length(v_ids, 1), 0) > v_limit;
  if v_more then
    v_ids := v_ids[1:v_limit];
    select t.started_at, t.id into v_last_at, v_last_id from public.trips t where t.id = v_ids[v_limit];
  end if;

  return jsonb_build_object('code', 'LISTED', 'generated_at', now(), 'rule', private.tracking_rule(p_organization),
    'items', coalesce((select jsonb_agg(private.tracking_trip_row(x.id) order by x.ord) from unnest(v_ids) with ordinality x(id, ord)), '[]'::jsonb),
    'next_cursor', case when v_more then jsonb_build_object('at', v_last_at, 'id', v_last_id) else null end);
end $$;

-- Detalhe da viagem com a trilha recente (última hora, até 120 pontos por origem) para desenhar os trechos no mapa.
create function public.get_trip_tracking(p_actor uuid, p_session uuid, p_organization uuid, p_trip uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  denied text;
  v_since timestamptz := now() - interval '1 hour';
begin
  denied := private.tracking_authorize(p_actor, p_session, p_organization, 'tracking.read');
  if denied is not null then return jsonb_build_object('code', denied); end if;
  if not exists (select 1 from public.trips t where t.id = p_trip and t.organization_id = p_organization) then
    return jsonb_build_object('code', 'NOT_FOUND');
  end if;

  return jsonb_build_object('code', 'FOUND', 'generated_at', now(), 'rule', private.tracking_rule(p_organization),
    'trip', private.tracking_trip_row(p_trip),
    'recent', jsonb_build_object(
      'mobile', coalesce((select jsonb_agg(x.j order by x.observed_at, x.id) from (
          select private.tracking_point_json(m.id, m.point, m.accuracy_m, m.observed_at, m.received_at)
                   || jsonb_build_object('sync_kind', m.sync_kind, 'validity', m.validity) as j, m.observed_at, m.id
            from public.mobile_positions m
           where m.organization_id = p_organization and m.trip_id = p_trip and m.observed_at >= v_since and m.validity <> 'context_invalid'
           order by m.observed_at desc, m.id desc limit 120) x), '[]'::jsonb),
      'seals', coalesce((select jsonb_agg(jsonb_build_object('device_id', s.device_id, 'positions', coalesce((
          select jsonb_agg(y.j order by y.read_at, y.id) from (
            select private.tracking_point_json(p.id, p.point, p.accuracy_m, p.read_at, p.received_at)
                     || jsonb_build_object('confirmed_at', p.last_seen_at, 'quality', p.quality) as j, p.read_at, p.id
              from public.seal_positions p
             where p.device_id = s.device_id and p.read_at >= greatest(s.bound_at, v_since)
             order by p.read_at desc, p.id desc limit 120) y), '[]'::jsonb)))
          from private.tracking_trip_seals(p_trip) s), '[]'::jsonb)));
end $$;

revoke all on function private.tracking_point_json(uuid, extensions.geography, numeric, timestamptz, timestamptz),
  private.tracking_trip_seals(uuid), private.tracking_seal_last(uuid, timestamptz), private.tracking_trip_row(uuid)
  from public, anon, authenticated;
revoke all on function public.list_active_trip_tracking(uuid, uuid, uuid, uuid, uuid, uuid, timestamptz, uuid, integer),
  public.get_trip_tracking(uuid, uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.list_active_trip_tracking(uuid, uuid, uuid, uuid, uuid, uuid, timestamptz, uuid, integer),
  public.get_trip_tracking(uuid, uuid, uuid, uuid) to service_role;
