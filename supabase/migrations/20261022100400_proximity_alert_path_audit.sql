-- Spec 015 (RF-023, CS-008; validação humana de 27/10/2026): o alerta de afastamento tratado pela tela de alertas (Spec 012) leva a ocorrência
-- junto, mas não auditava a ocorrência, e o reconhecimento por esse caminho não deixava registro. Agora cada ocorrência que o gatilho muda
-- recebe o mesmo registro do caminho pela própria ocorrência (`tracking.occurrence_acknowledge` ou `tracking.occurrence_close`), com o
-- responsável do alerta e sem coordenadas. Quando a mudança veio da própria ocorrência, ela já está no estado de destino: nada é atualizado
-- e nada é auditado de novo.
create or replace function private.tracking_on_proximity_alert() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_occurrence public.proximity_occurrences;
begin
  if new.kind <> 'proximity_separation' or new.status = old.status then return null; end if;
  if new.status = 'acknowledged' then
    for v_occurrence in
      update public.proximity_occurrences set status = 'acknowledged', acknowledged_at = coalesce(acknowledged_at, new.acknowledged_at, now()),
             acknowledged_by = coalesce(acknowledged_by, new.acknowledged_by), version = version + 1, updated_at = now()
       where alert_id = new.id and status = 'open'
      returning * loop
      perform private.tracking_audit(v_occurrence.organization_id, new.acknowledged_by, null, 'tracking.occurrence_acknowledge', 'proximity_occurrence',
        v_occurrence.id::text, 'success', null, null, jsonb_build_object('trip_id', v_occurrence.trip_id, 'trip_item_id', v_occurrence.trip_item_id,
          'version', v_occurrence.version, 'via', 'alert'));
    end loop;
  elsif new.status = 'closed' then
    for v_occurrence in
      update public.proximity_occurrences set status = 'closed', closed_at = coalesce(new.closed_at, now()), closed_by = new.closed_by, close_note = new.close_note,
             acknowledged_at = coalesce(acknowledged_at, new.acknowledged_at, now()), acknowledged_by = coalesce(acknowledged_by, new.acknowledged_by, new.closed_by),
             version = version + 1, updated_at = now()
       where alert_id = new.id and status in ('open', 'acknowledged')
      returning * loop
      perform private.tracking_audit(v_occurrence.organization_id, new.closed_by, null, 'tracking.occurrence_close', 'proximity_occurrence',
        v_occurrence.id::text, 'success', null, new.close_note, jsonb_build_object('trip_id', v_occurrence.trip_id,
          'trip_item_id', v_occurrence.trip_item_id, 'detection_kind', v_occurrence.detection_kind, 'version', v_occurrence.version, 'via', 'alert'));
    end loop;
  end if;
  return null;
end $$;

revoke all on function private.tracking_on_proximity_alert() from public, anon, authenticated;
