-- Spec 008, US2: conferir o carregamento e iniciar a viagem com bloqueio lógico (RF-007, RF-009 a RF-012, RF-024, RF-006a).
-- Cada transição confere o estado de origem sob `for update` e recusa qualquer outra com INVALID_TRANSITION, inclusive por chamada
-- direta (CA-003). Evento da viagem, evento do cilindro e auditoria entram na mesma transação. Nenhum texto de justificativa vai à
-- auditoria: só ao evento da viagem, onde a história precisa dele.

-- Quem ocupa o veículo ou o motorista (viagem carregando ou em andamento, exceto a própria). Devolve nulo ou o RESOURCE_BUSY.
create function private.trip_check_busy(p_organization uuid, p_trip public.trips)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_busy record;
begin
  select t.id as trip_id, t.number as trip_number into v_busy from public.trips t
   where t.organization_id = p_organization and t.vehicle_id = p_trip.vehicle_id and t.id <> p_trip.id and t.status in ('loading', 'in_progress') limit 1;
  if found then return jsonb_build_object('code', 'RESOURCE_BUSY', 'entity', 'vehicle', 'trip_id', v_busy.trip_id, 'trip_number', v_busy.trip_number); end if;
  select t.id as trip_id, t.number as trip_number into v_busy from public.trips t
   where t.organization_id = p_organization and t.driver_id = p_trip.driver_id and t.id <> p_trip.id and t.status in ('loading', 'in_progress') limit 1;
  if found then return jsonb_build_object('code', 'RESOURCE_BUSY', 'entity', 'driver', 'trip_id', v_busy.trip_id, 'trip_number', v_busy.trip_number); end if;
  return null;
end $$;

-- Serializa quem disputa o mesmo veículo ou motorista: a verificação de ocupação e a gravação do novo estado acontecem sem corrida. A
-- ordem fixa (veículo, depois motorista) evita impasse. Os índices únicos parciais continuam sendo a garantia final.
create function private.trip_lock_resources(p_organization uuid, p_trip public.trips)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(p_organization::text || ':trip-vehicle:' || p_trip.vehicle_id::text, 0));
  perform pg_advisory_xact_lock(hashtextextended(p_organization::text || ':trip-driver:' || p_trip.driver_id::text, 0));
end $$;

-- Recusa comum às transições da viagem: inexistente, encerrada ou fora do estado de origem. Devolve nulo quando pode seguir.
create function private.trip_expect(p_trip public.trips, p_from text, p_to text)
returns jsonb language plpgsql immutable set search_path = '' as $$
begin
  if p_trip.status in ('completed', 'cancelled') then return jsonb_build_object('code', 'TRIP_CLOSED'); end if;
  if p_trip.status <> p_from then return jsonb_build_object('code', 'INVALID_TRANSITION', 'from', p_trip.status, 'to', p_to); end if;
  return null;
end $$;

create function public.start_loading(p_actor uuid, p_session uuid, p_organization uuid, p_request uuid, p_trip uuid, p_expected_version bigint)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  denied text;
  replay jsonb;
  refusal jsonb;
  v_trip public.trips;
  v_version bigint;
  v_result jsonb;
begin
  denied := private.cylinder_authorize(p_actor, p_session, p_organization, 'trip.operate');
  if denied is not null then return jsonb_build_object('code', denied); end if;
  replay := private.trip_replay(p_organization, p_request, 'start_loading', p_trip);
  if replay is not null then return replay; end if;
  select t.* into v_trip from public.trips t where t.id = p_trip and t.organization_id = p_organization for update;
  if not found then return jsonb_build_object('code', 'NOT_FOUND'); end if;
  refusal := private.trip_expect(v_trip, 'planned', 'loading');
  if refusal is not null then return refusal; end if;
  if v_trip.version <> p_expected_version then return jsonb_build_object('code', 'VERSION_CONFLICT'); end if;
  perform private.trip_lock_resources(p_organization, v_trip);
  refusal := private.trip_check_busy(p_organization, v_trip);
  if refusal is not null then return refusal; end if;

  begin
    update public.trips set status = 'loading', version = version + 1, updated_at = now() where id = p_trip returning version into v_version;
  exception when unique_violation then
    -- Último recurso contra a corrida: os índices únicos parciais garantem uma viagem aberta por veículo e por motorista.
    return coalesce(private.trip_check_busy(p_organization, v_trip), jsonb_build_object('code', 'RESOURCE_BUSY', 'entity', 'vehicle'));
  end;
  perform private.append_trip_event(p_trip, p_organization, 'loading_started', p_actor, p_session, null, jsonb_build_object('number', v_trip.number));
  perform private.write_audit_event(p_organization, p_actor, p_session, 'trip.start_loading', 'trip', p_trip::text, 'success', null, null, jsonb_build_object('trip_id', p_trip, 'number', v_trip.number));
  v_result := jsonb_build_object('code', 'LOADING', 'version', v_version);
  return private.trip_remember(p_organization, p_request, 'start_loading', p_trip, v_result);
end $$;

create function public.revert_loading(p_actor uuid, p_session uuid, p_organization uuid, p_request uuid, p_trip uuid, p_expected_version bigint)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  denied text;
  replay jsonb;
  refusal jsonb;
  v_trip public.trips;
  v_version bigint;
  v_result jsonb;
begin
  denied := private.cylinder_authorize(p_actor, p_session, p_organization, 'trip.operate');
  if denied is not null then return jsonb_build_object('code', denied); end if;
  replay := private.trip_replay(p_organization, p_request, 'revert_loading', p_trip);
  if replay is not null then return replay; end if;
  select t.* into v_trip from public.trips t where t.id = p_trip and t.organization_id = p_organization for update;
  if not found then return jsonb_build_object('code', 'NOT_FOUND'); end if;
  refusal := private.trip_expect(v_trip, 'loading', 'planned');
  if refusal is not null then return refusal; end if;
  if v_trip.version <> p_expected_version then return jsonb_build_object('code', 'VERSION_CONFLICT'); end if;
  -- Só desfaz se nada foi conferido ou retirado: o carregamento já começou de verdade.
  if exists (select 1 from public.trip_items i where i.trip_id = p_trip and i.item_status not in ('planned', 'released')) then
    return jsonb_build_object('code', 'INVALID_TRANSITION', 'from', 'loading', 'to', 'planned');
  end if;
  update public.trips set status = 'planned', version = version + 1, updated_at = now() where id = p_trip returning version into v_version;
  perform private.append_trip_event(p_trip, p_organization, 'loading_reverted', p_actor, p_session, null, jsonb_build_object('number', v_trip.number));
  perform private.write_audit_event(p_organization, p_actor, p_session, 'trip.revert_loading', 'trip', p_trip::text, 'success', null, null, jsonb_build_object('trip_id', p_trip, 'number', v_trip.number));
  v_result := jsonb_build_object('code', 'REVERTED', 'version', v_version);
  return private.trip_remember(p_organization, p_request, 'revert_loading', p_trip, v_result);
end $$;

-- Conferência manual (a leitura por câmera ou NFC é da Fase 5): grava quem e quando.
create function public.check_item(p_actor uuid, p_session uuid, p_organization uuid, p_request uuid, p_trip uuid, p_item uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  denied text;
  replay jsonb;
  refusal jsonb;
  v_trip public.trips;
  v_item public.trip_items;
  v_checked integer;
  v_total integer;
  v_result jsonb;
begin
  denied := private.cylinder_authorize(p_actor, p_session, p_organization, 'trip.operate');
  if denied is not null then return jsonb_build_object('code', denied); end if;
  replay := private.trip_replay(p_organization, p_request, 'check_item', p_trip);
  if replay is not null then return replay; end if;
  select t.* into v_trip from public.trips t where t.id = p_trip and t.organization_id = p_organization for update;
  if not found then return jsonb_build_object('code', 'NOT_FOUND'); end if;
  refusal := private.trip_expect(v_trip, 'loading', 'loading');
  if refusal is not null then return refusal; end if;
  select i.* into v_item from public.trip_items i where i.id = p_item and i.trip_id = p_trip and i.organization_id = p_organization for update;
  if not found then return jsonb_build_object('code', 'NOT_FOUND', 'entity', 'item'); end if;
  if v_item.item_status <> 'planned' then return jsonb_build_object('code', 'INVALID_TRANSITION', 'from', v_item.item_status, 'to', 'checked'); end if;

  update public.trip_items set item_status = 'checked', checked_at = now(), checked_by = p_actor, check_source = 'manual', updated_at = now() where id = p_item;
  perform private.append_trip_event(p_trip, p_organization, 'item_checked', p_actor, p_session, null, jsonb_build_object('item_id', p_item, 'source', 'manual'));
  perform private.write_audit_event(p_organization, p_actor, p_session, 'trip.check_item', 'trip', p_trip::text, 'success', null, null, jsonb_build_object('trip_id', p_trip, 'item_id', p_item));
  select count(*) filter (where i.item_status = 'checked'), count(*) filter (where i.item_status in ('planned', 'checked')) into v_checked, v_total
    from public.trip_items i where i.trip_id = p_trip;
  v_result := jsonb_build_object('code', 'CHECKED', 'checked', v_checked, 'total', v_total);
  return private.trip_remember(p_organization, p_request, 'check_item', p_trip, v_result);
end $$;

create function public.uncheck_item(p_actor uuid, p_session uuid, p_organization uuid, p_request uuid, p_trip uuid, p_item uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  denied text;
  replay jsonb;
  refusal jsonb;
  v_trip public.trips;
  v_item public.trip_items;
  v_checked integer;
  v_total integer;
  v_result jsonb;
begin
  denied := private.cylinder_authorize(p_actor, p_session, p_organization, 'trip.operate');
  if denied is not null then return jsonb_build_object('code', denied); end if;
  replay := private.trip_replay(p_organization, p_request, 'uncheck_item', p_trip);
  if replay is not null then return replay; end if;
  select t.* into v_trip from public.trips t where t.id = p_trip and t.organization_id = p_organization for update;
  if not found then return jsonb_build_object('code', 'NOT_FOUND'); end if;
  refusal := private.trip_expect(v_trip, 'loading', 'loading');
  if refusal is not null then return refusal; end if;
  select i.* into v_item from public.trip_items i where i.id = p_item and i.trip_id = p_trip and i.organization_id = p_organization for update;
  if not found then return jsonb_build_object('code', 'NOT_FOUND', 'entity', 'item'); end if;
  if v_item.item_status <> 'checked' then return jsonb_build_object('code', 'INVALID_TRANSITION', 'from', v_item.item_status, 'to', 'planned'); end if;

  update public.trip_items set item_status = 'planned', checked_at = null, checked_by = null, check_source = null, updated_at = now() where id = p_item;
  perform private.append_trip_event(p_trip, p_organization, 'item_unchecked', p_actor, p_session, null, jsonb_build_object('item_id', p_item));
  perform private.write_audit_event(p_organization, p_actor, p_session, 'trip.uncheck_item', 'trip', p_trip::text, 'success', null, null, jsonb_build_object('trip_id', p_trip, 'item_id', p_item));
  select count(*) filter (where i.item_status = 'checked'), count(*) filter (where i.item_status in ('planned', 'checked')) into v_checked, v_total
    from public.trip_items i where i.trip_id = p_trip;
  v_result := jsonb_build_object('code', 'UNCHECKED', 'checked', v_checked, 'total', v_total);
  return private.trip_remember(p_organization, p_request, 'uncheck_item', p_trip, v_result);
end $$;

-- Retirada de um cilindro no carregamento (exceção): libera a reserva e registra o motivo (RF-012).
create function public.remove_item(p_actor uuid, p_session uuid, p_organization uuid, p_request uuid, p_trip uuid, p_item uuid, p_justification text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  denied text;
  replay jsonb;
  refusal jsonb;
  v_trip public.trips;
  v_item public.trip_items;
  v_justification text := nullif(btrim(coalesce(p_justification, '')), '');
  v_result jsonb;
begin
  denied := private.cylinder_authorize(p_actor, p_session, p_organization, 'trip.operate');
  if denied is not null then return jsonb_build_object('code', denied); end if;
  denied := private.cylinder_authorize(p_actor, p_session, p_organization, 'trip.exception');
  if denied is not null then return jsonb_build_object('code', denied); end if;
  replay := private.trip_replay(p_organization, p_request, 'remove_item', p_trip);
  if replay is not null then return replay; end if;
  select t.* into v_trip from public.trips t where t.id = p_trip and t.organization_id = p_organization for update;
  if not found then return jsonb_build_object('code', 'NOT_FOUND'); end if;
  refusal := private.trip_expect(v_trip, 'loading', 'loading');
  if refusal is not null then return refusal; end if;
  select i.* into v_item from public.trip_items i where i.id = p_item and i.trip_id = p_trip and i.organization_id = p_organization for update;
  if not found then return jsonb_build_object('code', 'NOT_FOUND', 'entity', 'item'); end if;
  if v_item.item_status not in ('planned', 'checked') then return jsonb_build_object('code', 'INVALID_TRANSITION', 'from', v_item.item_status, 'to', 'removed'); end if;
  if v_justification is null or char_length(v_justification) not between 5 and 500 then return jsonb_build_object('code', 'JUSTIFICATION_REQUIRED'); end if;

  update public.trip_items set item_status = 'removed', divergence_reason = v_justification, updated_at = now() where id = p_item;
  perform private.append_trip_event(p_trip, p_organization, 'item_removed', p_actor, p_session, v_justification, jsonb_build_object('item_id', p_item));
  perform private.append_cylinder_event(v_item.cylinder_id, p_organization, 'trip_released', p_actor, p_session, v_justification,
    jsonb_build_object('trip_id', p_trip, 'trip_number', v_trip.number, 'reason', 'removed'));
  perform private.write_audit_event(p_organization, p_actor, p_session, 'trip.remove_item', 'trip', p_trip::text, 'success', null, null, jsonb_build_object('trip_id', p_trip, 'item_id', p_item));
  v_result := jsonb_build_object('code', 'REMOVED');
  return private.trip_remember(p_organization, p_request, 'remove_item', p_trip, v_result);
end $$;

-- Início da viagem: revalida tudo no momento (RF-011), depois faz sair do estoque, ficar em trânsito e bloqueado (lógico).
create function public.start_trip(p_actor uuid, p_session uuid, p_organization uuid, p_request uuid, p_trip uuid, p_expected_version bigint)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  denied text;
  replay jsonb;
  refusal jsonb;
  v_trip public.trips;
  v_vehicle public.vehicles;
  v_driver public.drivers;
  v_pending uuid[];
  v_shipped integer;
  v_cyl public.cylinders;
  v_reason text;
  v_site record;
  v_version bigint;
  v_item record;
  v_result jsonb;
begin
  denied := private.cylinder_authorize(p_actor, p_session, p_organization, 'trip.operate');
  if denied is not null then return jsonb_build_object('code', denied); end if;
  replay := private.trip_replay(p_organization, p_request, 'start_trip', p_trip);
  if replay is not null then return replay; end if;
  select t.* into v_trip from public.trips t where t.id = p_trip and t.organization_id = p_organization for update;
  if not found then return jsonb_build_object('code', 'NOT_FOUND'); end if;
  refusal := private.trip_expect(v_trip, 'loading', 'in_progress');
  if refusal is not null then return refusal; end if;
  if v_trip.version <> p_expected_version then return jsonb_build_object('code', 'VERSION_CONFLICT'); end if;

  -- 1. Todos os cilindros previstos conferidos.
  select coalesce(array_agg(i.id order by i.id), '{}') into v_pending from public.trip_items i where i.trip_id = p_trip and i.item_status = 'planned';
  if array_length(v_pending, 1) > 0 then return jsonb_build_object('code', 'ITEMS_PENDING', 'item_ids', to_jsonb(v_pending)); end if;
  select count(*) into v_shipped from public.trip_items i where i.trip_id = p_trip and i.item_status = 'checked';
  if v_shipped = 0 then
    return jsonb_build_object('code', 'VALIDATION_FAILED', 'fields', private.field_error('cylinders', 'A viagem não tem cilindros conferidos para levar.'));
  end if;

  -- 2. Veículo, motorista, CNH, clientes e unidades.
  select x.* into v_vehicle from public.vehicles x where x.id = v_trip.vehicle_id;
  if v_vehicle.status <> 'available' then return jsonb_build_object('code', 'PARENT_INACTIVE', 'entity', 'vehicle', 'entity_id', v_vehicle.id); end if;
  select x.* into v_driver from public.drivers x where x.id = v_trip.driver_id;
  if v_driver.status <> 'active' then return jsonb_build_object('code', 'PARENT_INACTIVE', 'entity', 'driver', 'entity_id', v_driver.id); end if;
  if private.validity_status(v_driver.cnh_valid_until) = 'vencido' then return jsonb_build_object('code', 'DRIVER_LICENSE_EXPIRED'); end if;
  for v_site in
    select distinct cs.id as site_id, cs.status as site_status, cu.id as customer_id, cu.status as customer_status, cu.anonymized_at
      from public.trip_stops s join public.trip_items i on i.stop_id = s.id and i.item_status = 'checked'
      join public.customer_sites cs on cs.id = s.site_id join public.customers cu on cu.id = cs.customer_id
     where s.trip_id = p_trip order by cs.id loop
    if v_site.site_status <> 'active' and v_site.anonymized_at is null then return jsonb_build_object('code', 'PARENT_INACTIVE', 'entity', 'site', 'entity_id', v_site.site_id); end if;
    if v_site.customer_status <> 'active' and v_site.anonymized_at is null then return jsonb_build_object('code', 'PARENT_INACTIVE', 'entity', 'customer', 'entity_id', v_site.customer_id); end if;
  end loop;
  if v_shipped > v_vehicle.capacity_cylinders then
    return jsonb_build_object('code', 'CAPACITY_EXCEEDED', 'capacity', v_vehicle.capacity_cylinders, 'requested', v_shipped);
  end if;

  -- 3. Veículo e motorista livres de outra viagem aberta.
  perform private.trip_lock_resources(p_organization, v_trip);
  refusal := private.trip_check_busy(p_organization, v_trip);
  if refusal is not null then return refusal; end if;

  -- 4. Cilindros: trava em ordem fixa e confere o teste e o estoque de agora (o teste pode ter vencido depois do planejamento).
  perform 1 from public.cylinders c where c.id in (select i.cylinder_id from public.trip_items i where i.trip_id = p_trip and i.item_status = 'checked') order by c.id for update;
  for v_cyl in select c.* from public.cylinders c where c.id in (select i.cylinder_id from public.trip_items i where i.trip_id = p_trip and i.item_status = 'checked') order by c.id loop
    v_reason := private.cylinder_trip_refusal(v_cyl);
    if v_reason is not null then return jsonb_build_object('code', 'CYLINDER_NOT_ELIGIBLE', 'cylinder_id', v_cyl.id, 'reason', v_reason); end if;
  end loop;

  -- Tudo certo: efeitos.
  begin
    update public.trips set status = 'in_progress', started_at = now(), started_by = p_actor, version = version + 1, updated_at = now() where id = p_trip returning version into v_version;
  exception when unique_violation then
    return coalesce(private.trip_check_busy(p_organization, v_trip), jsonb_build_object('code', 'RESOURCE_BUSY', 'entity', 'vehicle'));
  end;
  update public.trip_items set item_status = 'in_transit', lock_status = 'locked', updated_at = now() where trip_id = p_trip and item_status = 'checked';
  for v_item in select i.cylinder_id from public.trip_items i where i.trip_id = p_trip and i.item_status = 'in_transit' order by i.cylinder_id loop
    update public.cylinders set stock_status = 'out_of_stock', custody_status = 'in_transit', custody_site_id = null, version = version + 1, updated_at = now() where id = v_item.cylinder_id;
    perform private.append_cylinder_event(v_item.cylinder_id, p_organization, 'trip_departed', p_actor, p_session, null, jsonb_build_object('trip_id', p_trip, 'trip_number', v_trip.number));
  end loop;
  -- Parada sem nenhum cilindro a levar (todos retirados) não tem o que entregar: sai do roteiro.
  update public.trip_stops s set status = 'removed', position = null
   where s.trip_id = p_trip and s.status = 'pending' and not exists (select 1 from public.trip_items i where i.stop_id = s.id and i.item_status = 'in_transit');
  perform private.append_trip_event(p_trip, p_organization, 'trip_started', p_actor, p_session, null, jsonb_build_object('number', v_trip.number, 'cylinders', v_shipped));
  perform private.write_audit_event(p_organization, p_actor, p_session, 'trip.start', 'trip', p_trip::text, 'success', null, null,
    jsonb_build_object('trip_id', p_trip, 'number', v_trip.number, 'cylinders', v_shipped));
  v_result := jsonb_build_object('code', 'STARTED', 'version', v_version);
  return private.trip_remember(p_organization, p_request, 'start_trip', p_trip, v_result);
end $$;

revoke all on function private.trip_check_busy(uuid, public.trips), private.trip_lock_resources(uuid, public.trips), private.trip_expect(public.trips, text, text) from public, anon, authenticated;
revoke all on function
  public.start_loading(uuid, uuid, uuid, uuid, uuid, bigint), public.revert_loading(uuid, uuid, uuid, uuid, uuid, bigint),
  public.check_item(uuid, uuid, uuid, uuid, uuid, uuid), public.uncheck_item(uuid, uuid, uuid, uuid, uuid, uuid),
  public.remove_item(uuid, uuid, uuid, uuid, uuid, uuid, text), public.start_trip(uuid, uuid, uuid, uuid, uuid, bigint) from public, anon, authenticated;
grant execute on function
  public.start_loading(uuid, uuid, uuid, uuid, uuid, bigint), public.revert_loading(uuid, uuid, uuid, uuid, uuid, bigint),
  public.check_item(uuid, uuid, uuid, uuid, uuid, uuid), public.uncheck_item(uuid, uuid, uuid, uuid, uuid, uuid),
  public.remove_item(uuid, uuid, uuid, uuid, uuid, uuid, text), public.start_trip(uuid, uuid, uuid, uuid, uuid, bigint) to service_role;
