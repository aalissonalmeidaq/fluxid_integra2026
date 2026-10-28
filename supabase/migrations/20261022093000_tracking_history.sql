-- Spec 015 (T059; US3, RF-019 a RF-021): histórico cronológico por viagem ou cilindro. Reúne no mesmo fio, em ordem por (instante, id),
-- as posições do celular e do lacre, as comparações (no instante do celular), as ocorrências, os alertas do lacre, os eventos da viagem e
-- as presenças pontuais. Período obrigatório de até 31 dias; cursor estável; até 200 itens por página. As lacunas não são inventadas
-- aqui: o cliente as marca entre posições sem evidência (src/domain/tracking/tracking-timeline.ts). Nunca há endereço.
create function public.query_tracking_history(p_actor uuid, p_session uuid, p_organization uuid, p_subject text, p_subject_id uuid,
  p_from timestamptz, p_to timestamptz, p_cursor_at timestamptz default null, p_cursor_id uuid default null, p_limit integer default 200)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  denied text;
  v_limit integer := least(greatest(coalesce(p_limit, 200), 1), 200);
  v_items jsonb;
  v_count integer;
  v_last jsonb;
begin
  denied := private.tracking_authorize(p_actor, p_session, p_organization, 'tracking.read');
  if denied is not null then return jsonb_build_object('code', denied); end if;
  if p_subject is null or p_subject not in ('trip', 'cylinder') or p_subject_id is null or p_from is null or p_to is null
     or p_to <= p_from or p_to - p_from > interval '31 days' or ((p_cursor_at is null) <> (p_cursor_id is null)) then
    return jsonb_build_object('code', 'VALIDATION_FAILED');
  end if;
  if p_subject = 'trip' and not exists (select 1 from public.trips t where t.id = p_subject_id and t.organization_id = p_organization)
     or p_subject = 'cylinder' and not exists (select 1 from public.cylinders c where c.id = p_subject_id and c.organization_id = p_organization) then
    return jsonb_build_object('code', 'NOT_FOUND');
  end if;

  with trip_cylinders as (
    select ti.cylinder_id from public.trip_items ti
     where p_subject = 'trip' and ti.trip_id = p_subject_id and ti.organization_id = p_organization
    union
    select p_subject_id where p_subject = 'cylinder'
  ),
  trip_window as (
    select coalesce(t.started_at, '-infinity'::timestamptz) as started, coalesce(t.completed_at, t.cancelled_at, 'infinity'::timestamptz) as ended
      from public.trips t where p_subject = 'trip' and t.id = p_subject_id
    union all
    select '-infinity'::timestamptz, 'infinity'::timestamptz where p_subject = 'cylinder'
  ),
  related_trips as (
    select p_subject_id as trip_id where p_subject = 'trip'
    union
    select ti.trip_id from public.trip_items ti where p_subject = 'cylinder' and ti.cylinder_id = p_subject_id and ti.organization_id = p_organization
  ),
  items as (
    -- Posições do celular (só no histórico da viagem: o celular é do motorista, não do cilindro).
    select m.id, m.observed_at as occurred_at,
           private.tracking_point_json(m.id, m.point, m.accuracy_m, m.observed_at, m.received_at)
             || jsonb_build_object('kind', 'position', 'origin', 'mobile', 'subject_id', m.trip_id, 'subject_label', 'Celular do motorista',
                  'sync_kind', m.sync_kind, 'validity', m.validity) as j
      from public.mobile_positions m
     where p_subject = 'trip' and m.organization_id = p_organization and m.trip_id = p_subject_id and m.validity <> 'context_invalid'
    union all
    -- Posições dos lacres dos cilindros (na janela da viagem, quando o assunto é a viagem).
    select sp.id, sp.read_at,
           private.tracking_point_json(sp.id, sp.point, sp.accuracy_m, sp.read_at, sp.received_at)
             || jsonb_build_object('kind', 'position', 'origin', 'seal', 'subject_id', sp.device_id, 'confirmed_at', sp.last_seen_at, 'quality', sp.quality,
                  'subject_label', d.label || ' · ' || c.serial_number)
      from public.seal_positions sp
      join public.seal_devices d on d.id = sp.device_id
      join public.cylinders c on c.id = sp.cylinder_id
      cross join trip_window w
     where sp.organization_id = p_organization and sp.cylinder_id in (select cylinder_id from trip_cylinders)
       and sp.read_at >= w.started and sp.read_at <= w.ended
    union all
    -- Comparações, no instante do celular.
    select pc.id, m.observed_at,
           jsonb_build_object('id', pc.id, 'kind', 'comparison', 'subject_id', pp.device_id, 'cylinder_id', pp.cylinder_id, 'result', pc.result,
             'reason', pc.reason, 'distance_m', pc.distance_m, 'retrospective', pc.retrospective, 'rule_version', pc.rule_version,
             'occurred_at', m.observed_at)
      from public.proximity_comparisons pc
      join public.proximity_pairs pp on pp.id = pc.pair_id
      join public.mobile_positions m on m.id = pc.mobile_position_id
     where pc.organization_id = p_organization
       and ((p_subject = 'trip' and pp.trip_id = p_subject_id) or (p_subject = 'cylinder' and pp.cylinder_id = p_subject_id))
    union all
    select o.id, o.opened_at,
           jsonb_build_object('id', o.id, 'kind', 'occurrence', 'subject_id', o.device_id, 'cylinder_id', o.cylinder_id, 'trip_id', o.trip_id,
             'status', o.status, 'detection_kind', o.detection_kind, 'alert_id', o.alert_id, 'occurred_at', o.opened_at)
      from public.proximity_occurrences o
     where o.organization_id = p_organization
       and ((p_subject = 'trip' and o.trip_id = p_subject_id) or (p_subject = 'cylinder' and o.cylinder_id = p_subject_id))
    union all
    select a.id, a.opened_at,
           jsonb_build_object('id', a.id, 'kind', 'alert', 'subject_id', a.device_id, 'cylinder_id', a.cylinder_id, 'alert_kind', a.kind,
             'severity', a.severity, 'status', a.status, 'occurred_at', a.opened_at)
      from public.seal_alerts a cross join trip_window w
     where a.organization_id = p_organization and a.cylinder_id in (select cylinder_id from trip_cylinders)
       and a.opened_at >= w.started and a.opened_at <= w.ended
    union all
    select e.id, e.occurred_at,
           jsonb_build_object('id', e.id, 'kind', 'event', 'subject_id', e.trip_id, 'trip_id', e.trip_id, 'event_type', e.event_type,
             'occurred_at', e.occurred_at)
      from public.trip_events e
     where e.organization_id = p_organization and e.trip_id in (select trip_id from related_trips)
       and (p_subject = 'trip' or e.event_type in ('trip_started', 'stop_arrived', 'delivery_registered', 'delivery_corrected',
            'unlock_registered', 'item_returned', 'trip_completed', 'trip_cancelled'))
    union all
    select pe.id, pe.observed_at,
           jsonb_build_object('id', pe.id, 'kind', 'presence', 'subject_id', pe.cylinder_id, 'cylinder_id', pe.cylinder_id, 'source', pe.source,
             'occurred_at', pe.observed_at)
      from public.proximity_presence_evidences pe
     where pe.organization_id = p_organization
       and ((p_subject = 'trip' and pe.trip_id = p_subject_id) or (p_subject = 'cylinder' and pe.cylinder_id = p_subject_id))
  ),
  page as (
    select i.id, i.occurred_at, i.j from items i
     where i.occurred_at >= p_from and i.occurred_at <= p_to
       and (p_cursor_at is null or (i.occurred_at, i.id) > (p_cursor_at, p_cursor_id))
     order by i.occurred_at, i.id
     limit v_limit + 1
  )
  select coalesce(jsonb_agg(p.j || jsonb_build_object('occurred_at', p.occurred_at) order by p.occurred_at, p.id), '[]'::jsonb), count(*)
    into v_items, v_count from page p;

  if v_count > v_limit then
    v_items := v_items - v_limit;
    v_last := v_items -> (v_limit - 1);
  end if;
  return jsonb_build_object('code', 'LISTED', 'generated_at', now(), 'rule', private.tracking_rule(p_organization),
    'items', v_items, 'next_cursor', case when v_last is null then null else jsonb_build_object('at', v_last->>'occurred_at', 'id', v_last->>'id') end);
end $$;

revoke all on function public.query_tracking_history(uuid, uuid, uuid, text, uuid, timestamptz, timestamptz, timestamptz, uuid, integer)
  from public, anon, authenticated;
grant execute on function public.query_tracking_history(uuid, uuid, uuid, text, uuid, timestamptz, timestamptz, timestamptz, uuid, integer)
  to service_role;
