-- Spec 008, US5: concluir ou cancelar a viagem e devolver cilindros ao estoque (RF-021 a RF-024; research.md, decisão 10).
-- Nada some sozinho: cilindro em trânsito de uma viagem cancelada em andamento fica aberto até um registro de retorno ao estoque ou de
-- entrega tardia. `completed` e `cancelled` são finais. O texto das justificativas fica nos eventos e nas colunas da viagem, nunca na auditoria.

create function public.complete_trip(p_actor uuid, p_session uuid, p_organization uuid, p_request uuid, p_trip uuid, p_expected_version bigint)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  denied text;
  replay jsonb;
  refusal jsonb;
  v_trip public.trips;
  v_open uuid[];
  v_version bigint;
  v_delivered integer;
  v_returned integer;
  v_result jsonb;
begin
  denied := private.cylinder_authorize(p_actor, p_session, p_organization, 'trip.operate');
  if denied is not null then return jsonb_build_object('code', denied); end if;
  replay := private.trip_replay(p_organization, p_request, 'complete_trip', p_trip);
  if replay is not null then return replay; end if;
  select t.* into v_trip from public.trips t where t.id = p_trip and t.organization_id = p_organization for update;
  if not found then return jsonb_build_object('code', 'NOT_FOUND'); end if;
  refusal := private.trip_expect(v_trip, 'in_progress', 'completed');
  if refusal is not null then return refusal; end if;
  if v_trip.version <> p_expected_version then return jsonb_build_object('code', 'VERSION_CONFLICT'); end if;

  -- Toda parada precisa estar encerrada (entregue ou com divergência) e todo cilindro não entregue precisa de uma decisão: entregue por
  -- correção ou devolvido ao estoque. Pendência de qualquer tipo aponta a parada.
  select coalesce(array_agg(distinct s.id order by s.id), '{}') into v_open from public.trip_stops s
   where s.trip_id = p_trip and s.status <> 'removed'
     and (s.status in ('pending', 'on_site') or exists (select 1 from public.trip_items i where i.stop_id = s.id and i.item_status in ('in_transit', 'not_delivered')));
  if array_length(v_open, 1) > 0 then return jsonb_build_object('code', 'STOPS_OPEN', 'stop_ids', to_jsonb(v_open)); end if;

  update public.trips set status = 'completed', completed_at = now(), completed_by = p_actor, version = version + 1, updated_at = now() where id = p_trip returning version into v_version;
  select count(*) filter (where i.item_status = 'delivered'), count(*) filter (where i.item_status = 'returned') into v_delivered, v_returned from public.trip_items i where i.trip_id = p_trip;
  perform private.append_trip_event(p_trip, p_organization, 'trip_completed', p_actor, p_session, null, jsonb_build_object('number', v_trip.number, 'delivered', v_delivered, 'returned', v_returned));
  perform private.write_audit_event(p_organization, p_actor, p_session, 'trip.complete', 'trip', p_trip::text, 'success', null, null,
    jsonb_build_object('trip_id', p_trip, 'number', v_trip.number, 'delivered', v_delivered, 'returned', v_returned));
  v_result := jsonb_build_object('code', 'COMPLETED', 'version', v_version);
  return private.trip_remember(p_organization, p_request, 'complete_trip', p_trip, v_result);
end $$;

-- Cancelamento (RF-022): planejada ou carregando libera as reservas; em andamento exige também a exceção e mantém em trânsito o que já saiu.
create function public.cancel_trip(p_actor uuid, p_session uuid, p_organization uuid, p_request uuid, p_trip uuid, p_expected_version bigint, p_justification text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  denied text;
  replay jsonb;
  v_trip public.trips;
  v_justification text := nullif(btrim(coalesce(p_justification, '')), '');
  v_item record;
  v_released integer := 0;
  v_in_transit integer;
  v_version bigint;
  v_result jsonb;
begin
  denied := private.cylinder_authorize(p_actor, p_session, p_organization, 'trip.cancel');
  if denied is not null then return jsonb_build_object('code', denied); end if;
  replay := private.trip_replay(p_organization, p_request, 'cancel_trip', p_trip);
  if replay is not null then return replay; end if;
  select t.* into v_trip from public.trips t where t.id = p_trip and t.organization_id = p_organization for update;
  if not found then return jsonb_build_object('code', 'NOT_FOUND'); end if;
  if v_trip.status in ('completed', 'cancelled') then return jsonb_build_object('code', 'TRIP_CLOSED'); end if;
  if v_trip.status = 'in_progress' then
    denied := private.cylinder_authorize(p_actor, p_session, p_organization, 'trip.exception');
    if denied is not null then return jsonb_build_object('code', denied); end if;
  end if;
  if v_trip.version <> p_expected_version then return jsonb_build_object('code', 'VERSION_CONFLICT'); end if;
  if v_justification is null or char_length(v_justification) not between 5 and 500 then return jsonb_build_object('code', 'JUSTIFICATION_REQUIRED'); end if;

  -- Libera as reservas de quem ainda não saiu (planejado ou conferido): o cilindro volta a ficar elegível.
  perform 1 from public.cylinders c where c.id in (select i.cylinder_id from public.trip_items i where i.trip_id = p_trip and i.item_status in ('planned', 'checked')) order by c.id for update;
  for v_item in select i.id, i.cylinder_id from public.trip_items i where i.trip_id = p_trip and i.item_status in ('planned', 'checked') order by i.cylinder_id loop
    update public.trip_items set item_status = 'released', updated_at = now() where id = v_item.id;
    perform private.append_cylinder_event(v_item.cylinder_id, p_organization, 'trip_released', p_actor, p_session, v_justification,
      jsonb_build_object('trip_id', p_trip, 'trip_number', v_trip.number, 'reason', 'cancelled'));
    v_released := v_released + 1;
  end loop;
  select count(*) into v_in_transit from public.trip_items i where i.trip_id = p_trip and i.item_status in ('in_transit', 'not_delivered');

  update public.trips set status = 'cancelled', cancelled_at = now(), cancelled_by = p_actor, cancel_reason = v_justification, version = version + 1, updated_at = now()
   where id = p_trip returning version into v_version;
  perform private.append_trip_event(p_trip, p_organization, 'trip_cancelled', p_actor, p_session, v_justification,
    jsonb_build_object('number', v_trip.number, 'from', v_trip.status, 'released', v_released, 'in_transit', v_in_transit));
  perform private.write_audit_event(p_organization, p_actor, p_session, 'trip.cancel', 'trip', p_trip::text, 'success', null, null,
    jsonb_build_object('trip_id', p_trip, 'number', v_trip.number, 'from', v_trip.status, 'released', v_released, 'in_transit', v_in_transit));
  v_result := jsonb_build_object('code', 'CANCELLED', 'version', v_version, 'released', v_released, 'in_transit', v_in_transit);
  return private.trip_remember(p_organization, p_request, 'cancel_trip', p_trip, v_result);
end $$;

-- Retorno ao estoque (RF-023, exceção): cilindro em trânsito ou não entregue volta à organização, em estoque, com a justificativa.
create function public.return_item(p_actor uuid, p_session uuid, p_organization uuid, p_request uuid, p_trip uuid, p_item uuid, p_justification text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  denied text;
  replay jsonb;
  v_trip public.trips;
  v_item public.trip_items;
  v_stop public.trip_stops;
  v_justification text := nullif(btrim(coalesce(p_justification, '')), '');
  v_result jsonb;
begin
  denied := private.cylinder_authorize(p_actor, p_session, p_organization, 'trip.operate');
  if denied is not null then return jsonb_build_object('code', denied); end if;
  denied := private.cylinder_authorize(p_actor, p_session, p_organization, 'trip.exception');
  if denied is not null then return jsonb_build_object('code', denied); end if;
  replay := private.trip_replay(p_organization, p_request, 'return_item', p_trip);
  if replay is not null then return replay; end if;
  select t.* into v_trip from public.trips t where t.id = p_trip and t.organization_id = p_organization for update;
  if not found then return jsonb_build_object('code', 'NOT_FOUND'); end if;
  if v_trip.status = 'completed' then return jsonb_build_object('code', 'TRIP_CLOSED'); end if;
  if v_trip.status in ('planned', 'loading') then return jsonb_build_object('code', 'INVALID_TRANSITION', 'from', v_trip.status, 'to', 'returned'); end if;
  select i.* into v_item from public.trip_items i where i.id = p_item and i.trip_id = p_trip and i.organization_id = p_organization for update;
  if not found then return jsonb_build_object('code', 'NOT_FOUND', 'entity', 'item'); end if;
  if v_item.item_status not in ('in_transit', 'not_delivered') then return jsonb_build_object('code', 'INVALID_TRANSITION', 'from', v_item.item_status, 'to', 'returned'); end if;
  if v_justification is null or char_length(v_justification) not between 5 and 500 then return jsonb_build_object('code', 'JUSTIFICATION_REQUIRED'); end if;

  perform 1 from public.cylinders c where c.id = v_item.cylinder_id for update;
  update public.trip_items set item_status = 'returned', divergence_reason = coalesce(divergence_reason, v_justification), updated_at = now() where id = p_item;
  update public.cylinders set stock_status = 'in_stock', custody_status = 'in_organization', custody_site_id = null, version = version + 1, updated_at = now() where id = v_item.cylinder_id;
  perform private.append_cylinder_event(v_item.cylinder_id, p_organization, 'trip_returned', p_actor, p_session, v_justification, jsonb_build_object('trip_id', p_trip, 'trip_number', v_trip.number));
  -- A parada que ficou sem nenhum cilindro a entregar (todos devolvidos) fecha com divergência: não há mais o que registrar nela.
  select s.* into v_stop from public.trip_stops s where s.id = v_item.stop_id for update;
  if v_stop.status in ('pending', 'on_site') and not exists (select 1 from public.trip_items i where i.stop_id = v_stop.id and i.item_status = 'in_transit') then
    update public.trip_stops set status = 'with_divergence', arrived_at = coalesce(arrived_at, now()), arrived_by = coalesce(arrived_by, p_actor), closed_at = now(), closed_by = p_actor where id = v_stop.id;
  end if;
  perform private.append_trip_event(p_trip, p_organization, 'item_returned', p_actor, p_session, v_justification, jsonb_build_object('item_id', p_item, 'from', v_item.item_status));
  perform private.write_audit_event(p_organization, p_actor, p_session, 'trip.return_item', 'trip', p_trip::text, 'success', null, null,
    jsonb_build_object('trip_id', p_trip, 'item_id', p_item, 'from', v_item.item_status));
  v_result := jsonb_build_object('code', 'RETURNED');
  return private.trip_remember(p_organization, p_request, 'return_item', p_trip, v_result);
end $$;

revoke all on function
  public.complete_trip(uuid, uuid, uuid, uuid, uuid, bigint),
  public.cancel_trip(uuid, uuid, uuid, uuid, uuid, bigint, text),
  public.return_item(uuid, uuid, uuid, uuid, uuid, uuid, text) from public, anon, authenticated;
grant execute on function
  public.complete_trip(uuid, uuid, uuid, uuid, uuid, bigint),
  public.cancel_trip(uuid, uuid, uuid, uuid, uuid, bigint, text),
  public.return_item(uuid, uuid, uuid, uuid, uuid, uuid, text) to service_role;
