-- Spec 015 (T066; US4, RF-022, RF-023, RF-015): consultar, reconhecer e encerrar a ocorrência de afastamento. Reconhecer e encerrar
-- exigem a permissão de operar alertas (`seal.operate`, a mesma do alerta da Spec 012), versão otimista e pedido idempotente; encerrar
-- exige nota de 5 a 500 caracteres. A auditoria fica na mesma transação, sem coordenadas. O alerta do lacre acompanha a ocorrência, e
-- tratar o alerta pela tela de alertas acompanha a ocorrência (gatilho). Nada muda custódia, cilindro ou trava. Ocorrência só histórica
-- (viagem já encerrada) não é alerta e não é tratada.

create function public.get_proximity_occurrence(p_actor uuid, p_session uuid, p_organization uuid, p_occurrence uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  denied text;
  v_occurrence public.proximity_occurrences;
  v_first integer;
  v_confirming integer;
begin
  denied := private.tracking_authorize(p_actor, p_session, p_organization, 'tracking.read');
  if denied is not null then return jsonb_build_object('code', denied); end if;
  select o.* into v_occurrence from public.proximity_occurrences o where o.id = p_occurrence and o.organization_id = p_organization;
  if not found then return jsonb_build_object('code', 'NOT_FOUND'); end if;
  select c.sequence_ordinal into v_first from public.proximity_comparisons c where c.id = v_occurrence.first_comparison_id;
  select c.sequence_ordinal into v_confirming from public.proximity_comparisons c where c.id = v_occurrence.confirming_comparison_id;

  return jsonb_build_object('code', 'FOUND', 'occurrence', jsonb_build_object(
      'id', v_occurrence.id, 'status', v_occurrence.status, 'detection_kind', v_occurrence.detection_kind, 'version', v_occurrence.version,
      'opened_at', v_occurrence.opened_at, 'acknowledged_at', v_occurrence.acknowledged_at, 'closed_at', v_occurrence.closed_at,
      'close_note', v_occurrence.close_note, 'trip_id', v_occurrence.trip_id, 'cylinder_id', v_occurrence.cylinder_id, 'device_id', v_occurrence.device_id,
      'alert_id', v_occurrence.alert_id,
      'trip_number', (select t.number from public.trips t where t.id = v_occurrence.trip_id),
      'serial_number', (select c.serial_number from public.cylinders c where c.id = v_occurrence.cylinder_id),
      'device_label', (select d.label from public.seal_devices d where d.id = v_occurrence.device_id),
      'alert_status', (select a.status from public.seal_alerts a where a.id = v_occurrence.alert_id),
      'acknowledged_by_name', (select p.display_name from public.profiles p where p.user_id = v_occurrence.acknowledged_by),
      'closed_by_name', (select p.display_name from public.profiles p where p.user_id = v_occurrence.closed_by)),
    'evidences', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'observed_at', m.observed_at, 'result', c.result, 'reason', c.reason,
        'distance_m', c.distance_m, 'rule_version', c.rule_version, 'distance_threshold_m', c.distance_threshold_m, 'retrospective', c.retrospective)
        order by c.sequence_ordinal)
      from public.proximity_comparisons c join public.mobile_positions m on m.id = c.mobile_position_id
     where c.pair_id = v_occurrence.pair_id and c.result <> 'inconclusive' and c.sequence_ordinal between v_first and v_confirming), '[]'::jsonb));
end $$;

create function public.acknowledge_proximity_occurrence(p_actor uuid, p_session uuid, p_organization uuid, p_request uuid, p_occurrence uuid, p_version bigint)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  denied text;
  replay jsonb;
  v_occurrence public.proximity_occurrences;
begin
  denied := private.cylinder_authorize(p_actor, p_session, p_organization, 'seal.operate');
  if denied is not null then return jsonb_build_object('code', denied); end if;
  replay := private.seal_replay(p_organization, p_request, 'acknowledge_proximity_occurrence');
  if replay is not null then return replay; end if;
  select o.* into v_occurrence from public.proximity_occurrences o where o.id = p_occurrence and o.organization_id = p_organization for update;
  if not found then return jsonb_build_object('code', 'NOT_FOUND'); end if;
  if v_occurrence.status not in ('open', 'acknowledged') then return jsonb_build_object('code', 'INVALID_TRANSITION', 'from', v_occurrence.status); end if;
  if p_version is distinct from v_occurrence.version then return jsonb_build_object('code', 'VERSION_CONFLICT', 'version', v_occurrence.version); end if;

  update public.proximity_occurrences set status = 'acknowledged', acknowledged_at = coalesce(acknowledged_at, now()),
         acknowledged_by = coalesce(acknowledged_by, p_actor), version = version + 1, updated_at = now()
   where id = p_occurrence returning * into v_occurrence;
  update public.seal_alerts set status = 'acknowledged', acknowledged_at = coalesce(acknowledged_at, now()), acknowledged_by = coalesce(acknowledged_by, p_actor),
         updated_at = now()
   where id = v_occurrence.alert_id and status = 'open';
  perform private.tracking_audit(p_organization, p_actor, p_session, 'tracking.occurrence_acknowledge', 'proximity_occurrence', p_occurrence::text,
    'success', null, null, jsonb_build_object('trip_id', v_occurrence.trip_id, 'trip_item_id', v_occurrence.trip_item_id, 'version', v_occurrence.version));
  perform private.tracking_broadcast(p_organization, 'occurrence', v_occurrence.trip_id);
  return private.seal_remember(p_organization, p_request, 'acknowledge_proximity_occurrence',
    jsonb_build_object('code', 'ACKNOWLEDGED', 'version', v_occurrence.version));
end $$;

create function public.close_proximity_occurrence(p_actor uuid, p_session uuid, p_organization uuid, p_request uuid, p_occurrence uuid, p_version bigint,
  p_note text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  denied text;
  replay jsonb;
  v_occurrence public.proximity_occurrences;
  v_note text := nullif(btrim(regexp_replace(coalesce(p_note, ''), '\s+', ' ', 'g')), '');
begin
  denied := private.cylinder_authorize(p_actor, p_session, p_organization, 'seal.operate');
  if denied is not null then return jsonb_build_object('code', denied); end if;
  replay := private.seal_replay(p_organization, p_request, 'close_proximity_occurrence');
  if replay is not null then return replay; end if;
  if not private.seal_text_ok(v_note) then return jsonb_build_object('code', 'NOTE_REQUIRED'); end if;
  select o.* into v_occurrence from public.proximity_occurrences o where o.id = p_occurrence and o.organization_id = p_organization for update;
  if not found then return jsonb_build_object('code', 'NOT_FOUND'); end if;
  if v_occurrence.status not in ('open', 'acknowledged') then return jsonb_build_object('code', 'INVALID_TRANSITION', 'from', v_occurrence.status); end if;
  if p_version is distinct from v_occurrence.version then return jsonb_build_object('code', 'VERSION_CONFLICT', 'version', v_occurrence.version); end if;

  update public.proximity_occurrences set status = 'closed', closed_at = now(), closed_by = p_actor, close_note = v_note,
         acknowledged_at = coalesce(acknowledged_at, now()), acknowledged_by = coalesce(acknowledged_by, p_actor), version = version + 1, updated_at = now()
   where id = p_occurrence returning * into v_occurrence;
  update public.seal_alerts set status = 'closed', closed_at = now(), closed_by = p_actor, close_note = v_note,
         acknowledged_at = coalesce(acknowledged_at, now()), acknowledged_by = coalesce(acknowledged_by, p_actor), updated_at = now()
   where id = v_occurrence.alert_id and status <> 'closed';
  perform private.tracking_audit(p_organization, p_actor, p_session, 'tracking.occurrence_close', 'proximity_occurrence', p_occurrence::text,
    'success', null, v_note, jsonb_build_object('trip_id', v_occurrence.trip_id, 'trip_item_id', v_occurrence.trip_item_id,
      'detection_kind', v_occurrence.detection_kind, 'version', v_occurrence.version));
  perform private.tracking_broadcast(p_organization, 'occurrence', v_occurrence.trip_id);
  return private.seal_remember(p_organization, p_request, 'close_proximity_occurrence', jsonb_build_object('code', 'CLOSED', 'version', v_occurrence.version));
end $$;

-- O alerta tratado pela tela de alertas (Spec 012) leva a ocorrência junto. Quando a mudança veio da própria ocorrência, ela já está no
-- estado de destino e nada acontece.
create function private.tracking_on_proximity_alert() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.kind <> 'proximity_separation' or new.status = old.status then return null; end if;
  if new.status = 'acknowledged' then
    update public.proximity_occurrences set status = 'acknowledged', acknowledged_at = coalesce(acknowledged_at, new.acknowledged_at, now()),
           acknowledged_by = coalesce(acknowledged_by, new.acknowledged_by), version = version + 1, updated_at = now()
     where alert_id = new.id and status = 'open';
  elsif new.status = 'closed' then
    update public.proximity_occurrences set status = 'closed', closed_at = coalesce(new.closed_at, now()), closed_by = new.closed_by, close_note = new.close_note,
           acknowledged_at = coalesce(acknowledged_at, new.acknowledged_at, now()), acknowledged_by = coalesce(acknowledged_by, new.acknowledged_by, new.closed_by),
           version = version + 1, updated_at = now()
     where alert_id = new.id and status in ('open', 'acknowledged');
  end if;
  return null;
end $$;
create trigger seal_alerts_proximity_sync after update of status on public.seal_alerts
  for each row execute function private.tracking_on_proximity_alert();

revoke all on function private.tracking_on_proximity_alert() from public, anon, authenticated;
revoke all on function public.get_proximity_occurrence(uuid, uuid, uuid, uuid),
  public.acknowledge_proximity_occurrence(uuid, uuid, uuid, uuid, uuid, bigint),
  public.close_proximity_occurrence(uuid, uuid, uuid, uuid, uuid, bigint, text) from public, anon, authenticated;
grant execute on function public.get_proximity_occurrence(uuid, uuid, uuid, uuid),
  public.acknowledge_proximity_occurrence(uuid, uuid, uuid, uuid, uuid, bigint),
  public.close_proximity_occurrence(uuid, uuid, uuid, uuid, uuid, bigint, text) to service_role;
