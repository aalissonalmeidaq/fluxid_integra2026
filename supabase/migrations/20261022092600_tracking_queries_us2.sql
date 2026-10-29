-- Spec 015 (US2 no acompanhamento da US1): a linha da viagem passa a contar as ocorrências de afastamento abertas ou reconhecidas e a
-- mostrar a coleta pausada quando o celular está há mais de 8 horas sem confirmação online (RF-007g). A sessão gravada não muda: o
-- estado pausado é derivado na leitura e some na próxima ingestão.
create or replace function private.tracking_trip_row(p_trip uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'trip_id', t.id, 'trip_number', t.number, 'status', t.status, 'started_at', t.started_at,
    'vehicle', jsonb_build_object('id', v.id, 'plate', v.plate),
    'driver', jsonb_build_object('id', dr.id, 'name', dr.full_name),
    'session', (select jsonb_build_object('id', s.id,
                  'status', case when s.status = 'active' and s.last_online_confirmed_at < now() - interval '8 hours' then 'paused_auth_expired' else s.status end,
                  'platform', s.platform, 'capability', s.capability,
                  'capability_changed_at', case when s.status = 'active' and s.last_online_confirmed_at < now() - interval '8 hours'
                                                then s.last_online_confirmed_at + interval '8 hours' else s.capability_changed_at end,
                  'notifications_denied', s.notifications_denied, 'last_online_confirmed_at', s.last_online_confirmed_at, 'started_at', s.started_at)
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
    'open_occurrences', (select count(*) from public.proximity_occurrences o
                          where o.organization_id = t.organization_id and o.trip_id = t.id and o.status in ('open', 'acknowledged')))
  from public.trips t
  join public.vehicles v on v.id = t.vehicle_id and v.organization_id = t.organization_id
  join public.drivers dr on dr.id = t.driver_id and dr.organization_id = t.organization_id
  where t.id = p_trip
$$;
revoke all on function private.tracking_trip_row(uuid) from public, anon, authenticated;
