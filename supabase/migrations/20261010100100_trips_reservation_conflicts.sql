-- Spec 008, RF-004 e RNF-002: reserva concorrente de cilindro.
--
-- Quando outro operador reserva um cilindro entre a busca e a confirmação, o servidor recusa de forma determinística com CYLINDER_RESERVED
-- e devolve TODOS os cilindros em conflito de uma vez (em ordem fixa de id), para a tela tirar só esses e manter o resto. Nada é gravado.
-- A viagem que reservou (id e número) só é revelada a quem pode ler viagens (`trip.read`): sem essa permissão a pessoa sabe que o cilindro
-- foi reservado por outra operação, mas não por qual viagem. O isolamento por tenant continua: só cilindros da própria organização.

create function private.trip_check_new_cylinders(p_organization uuid, p_ids uuid[], p_actor uuid, p_session uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_cyl public.cylinders;
  v_open record;
  v_reason text;
  v_conflicts jsonb := '[]'::jsonb;
  v_can_read boolean;
begin
  if coalesce(array_length(p_ids, 1), 0) = 0 then return null; end if;
  perform 1 from public.cylinders c where c.organization_id = p_organization and c.id = any(p_ids) order by c.id for update;
  if (select count(*) from public.cylinders c where c.organization_id = p_organization and c.id = any(p_ids)) <> array_length(p_ids, 1) then
    return jsonb_build_object('code', 'NOT_FOUND', 'entity', 'cylinder');
  end if;
  v_can_read := private.actor_has_permission(p_actor, p_session, p_organization, 'trip.read');
  for v_cyl in select c.* from public.cylinders c where c.organization_id = p_organization and c.id = any(p_ids) order by c.id loop
    select t.id as trip_id, t.number as trip_number into v_open
      from public.trip_items i join public.trips t on t.id = i.trip_id where i.cylinder_id = v_cyl.id and i.is_open limit 1;
    if found then
      v_conflicts := v_conflicts || jsonb_build_array(jsonb_build_object('cylinder_id', v_cyl.id)
        || case when v_can_read then jsonb_build_object('trip_id', v_open.trip_id, 'trip_number', v_open.trip_number) else '{}'::jsonb end);
    end if;
  end loop;
  if jsonb_array_length(v_conflicts) > 0 then
    -- O primeiro conflito também vai nos campos de cima, como antes; `conflicts` traz todos.
    return jsonb_build_object('code', 'CYLINDER_RESERVED') || (v_conflicts -> 0) || jsonb_build_object('conflicts', v_conflicts);
  end if;
  for v_cyl in select c.* from public.cylinders c where c.organization_id = p_organization and c.id = any(p_ids) order by c.id loop
    v_reason := private.cylinder_trip_refusal(v_cyl);
    if v_reason is not null then
      return jsonb_build_object('code', 'CYLINDER_NOT_ELIGIBLE', 'cylinder_id', v_cyl.id, 'reason', v_reason);
    end if;
  end loop;
  return null;
end $$;
revoke all on function private.trip_check_new_cylinders(uuid, uuid[], uuid, uuid) from public, anon, authenticated;

create or replace function public.create_trip(
  p_actor uuid, p_session uuid, p_organization uuid, p_request uuid, p_planned_date date, p_vehicle uuid, p_driver uuid, p_notes text, p_stops jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  denied text;
  replay jsonb;
  errors jsonb;
  refusal jsonb;
  v_notes text := nullif(btrim(coalesce(p_notes, '')), '');
  v_vehicle public.vehicles;
  v_ids uuid[];
  v_trip uuid;
  v_number integer;
  v_stop record;
  v_stop_id uuid;
  v_site uuid;
  v_cyl uuid;
  v_result jsonb;
begin
  denied := private.cylinder_authorize(p_actor, p_session, p_organization, 'trip.write');
  if denied is not null then return jsonb_build_object('code', denied); end if;
  replay := private.trip_replay(p_organization, p_request, 'create_trip', null);
  if replay is not null then return replay; end if;

  errors := private.validate_trip_plan(p_planned_date, v_notes, p_stops, true);
  if jsonb_array_length(errors) > 0 then return jsonb_build_object('code', 'VALIDATION_FAILED', 'fields', errors); end if;

  refusal := private.trip_check_vehicle(p_organization, p_vehicle);
  if refusal is not null then return refusal; end if;
  refusal := private.trip_check_driver(p_organization, p_driver);
  if refusal is not null then return refusal; end if;
  for v_site in select (s.value ->> 'site_id')::uuid from jsonb_array_elements(p_stops) s loop
    refusal := private.trip_check_site(p_organization, v_site);
    if refusal is not null then return refusal; end if;
  end loop;

  select array(select (c)::uuid from jsonb_array_elements(p_stops) s, jsonb_array_elements_text(s.value -> 'cylinder_ids') c) into v_ids;
  select x.* into v_vehicle from public.vehicles x where x.id = p_vehicle;
  if array_length(v_ids, 1) > v_vehicle.capacity_cylinders then
    return jsonb_build_object('code', 'CAPACITY_EXCEEDED', 'capacity', v_vehicle.capacity_cylinders, 'requested', array_length(v_ids, 1));
  end if;
  refusal := private.trip_check_new_cylinders(p_organization, v_ids, p_actor, p_session);
  if refusal is not null then return refusal; end if;

  begin
    insert into private.trip_counters (organization_id, last_number) values (p_organization, 1)
    on conflict (organization_id) do update set last_number = private.trip_counters.last_number + 1
    returning last_number into v_number;
    insert into public.trips (organization_id, number, planned_date, vehicle_id, driver_id, notes, created_by)
    values (p_organization, v_number, p_planned_date, p_vehicle, p_driver, v_notes, p_actor)
    returning id into v_trip;
    for v_stop in select s.value as value, s.ord as ord from jsonb_array_elements(p_stops) with ordinality as s(value, ord) loop
      insert into public.trip_stops (organization_id, trip_id, site_id, position)
      values (p_organization, v_trip, (v_stop.value ->> 'site_id')::uuid, v_stop.ord) returning id into v_stop_id;
      insert into public.trip_items (organization_id, trip_id, stop_id, cylinder_id, created_by)
      select p_organization, v_trip, v_stop_id, c::uuid, p_actor from jsonb_array_elements_text(v_stop.value -> 'cylinder_ids') c;
    end loop;
  exception when unique_violation then
    -- Último recurso contra a corrida: o índice único parcial é a garantia final da reserva.
    return jsonb_build_object('code', 'CYLINDER_RESERVED');
  end;

  perform private.append_trip_event(v_trip, p_organization, 'trip_created', p_actor, p_session, null,
    jsonb_build_object('number', v_number, 'planned_date', p_planned_date, 'vehicle_id', p_vehicle, 'driver_id', p_driver,
                       'stops', jsonb_array_length(p_stops), 'cylinders', array_length(v_ids, 1)));
  foreach v_cyl in array (select array_agg(x order by x) from unnest(v_ids) x) loop
    perform private.append_cylinder_event(v_cyl, p_organization, 'trip_reserved', p_actor, p_session, null, jsonb_build_object('trip_id', v_trip, 'trip_number', v_number));
  end loop;
  perform private.write_audit_event(p_organization, p_actor, p_session, 'trip.create', 'trip', v_trip::text, 'success', null, null,
    jsonb_build_object('trip_id', v_trip, 'number', v_number, 'stops', jsonb_array_length(p_stops), 'cylinders', array_length(v_ids, 1)));
  v_result := jsonb_build_object('code', 'CREATED', 'trip_id', v_trip, 'number', v_number, 'version', 1);
  return private.trip_remember(p_organization, p_request, 'create_trip', v_trip, v_result);
end $$;

create or replace function public.update_trip(
  p_actor uuid, p_session uuid, p_organization uuid, p_request uuid, p_trip uuid, p_expected_version bigint, p_planned_date date, p_vehicle uuid,
  p_driver uuid, p_notes text, p_stops jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  denied text;
  replay jsonb;
  errors jsonb;
  refusal jsonb;
  v_notes text := nullif(btrim(coalesce(p_notes, '')), '');
  v_trip public.trips;
  v_vehicle public.vehicles;
  v_ids uuid[];
  v_current uuid[];
  v_new uuid[];
  v_busy record;
  v_stop record;
  v_stop_id uuid;
  v_kept uuid[] := '{}';
  v_item public.trip_items;
  v_cyl uuid;
  v_changes jsonb := '[]'::jsonb;
  v_added integer := 0;
  v_released integer := 0;
  v_version bigint;
  v_result jsonb;
begin
  denied := private.cylinder_authorize(p_actor, p_session, p_organization, 'trip.write');
  if denied is not null then return jsonb_build_object('code', denied); end if;
  replay := private.trip_replay(p_organization, p_request, 'update_trip', p_trip);
  if replay is not null then return replay; end if;

  select t.* into v_trip from public.trips t where t.id = p_trip and t.organization_id = p_organization for update;
  if not found then return jsonb_build_object('code', 'NOT_FOUND'); end if;
  if v_trip.status in ('completed', 'cancelled') then return jsonb_build_object('code', 'TRIP_CLOSED'); end if;
  if v_trip.status = 'in_progress' then return jsonb_build_object('code', 'INVALID_TRANSITION', 'from', 'in_progress', 'to', 'planned'); end if;
  if v_trip.version <> p_expected_version then return jsonb_build_object('code', 'VERSION_CONFLICT'); end if;

  errors := private.validate_trip_plan(p_planned_date, v_notes, p_stops, false);
  if jsonb_array_length(errors) > 0 then return jsonb_build_object('code', 'VALIDATION_FAILED', 'fields', errors); end if;

  if p_vehicle is distinct from v_trip.vehicle_id then
    refusal := private.trip_check_vehicle(p_organization, p_vehicle);
    if refusal is not null then return refusal; end if;
    if v_trip.status = 'loading' then
      select t.id as trip_id, t.number as trip_number into v_busy from public.trips t
       where t.vehicle_id = p_vehicle and t.id <> p_trip and t.status in ('loading', 'in_progress') limit 1;
      if found then return jsonb_build_object('code', 'RESOURCE_BUSY', 'entity', 'vehicle', 'trip_id', v_busy.trip_id, 'trip_number', v_busy.trip_number); end if;
    end if;
  end if;
  if p_driver is distinct from v_trip.driver_id then
    refusal := private.trip_check_driver(p_organization, p_driver);
    if refusal is not null then return refusal; end if;
    if v_trip.status = 'loading' then
      select t.id as trip_id, t.number as trip_number into v_busy from public.trips t
       where t.driver_id = p_driver and t.id <> p_trip and t.status in ('loading', 'in_progress') limit 1;
      if found then return jsonb_build_object('code', 'RESOURCE_BUSY', 'entity', 'driver', 'trip_id', v_busy.trip_id, 'trip_number', v_busy.trip_number); end if;
    end if;
  end if;

  for v_stop in select s.value as value from jsonb_array_elements(p_stops) s loop
    if nullif(v_stop.value ->> 'id', '') is not null then
      if not exists (select 1 from public.trip_stops x where x.id = (v_stop.value ->> 'id')::uuid and x.trip_id = p_trip and x.status <> 'removed') then
        return jsonb_build_object('code', 'NOT_FOUND', 'entity', 'stop');
      end if;
      if (v_stop.value ->> 'site_id')::uuid is distinct from (select x.site_id from public.trip_stops x where x.id = (v_stop.value ->> 'id')::uuid) then
        refusal := private.trip_check_site(p_organization, (v_stop.value ->> 'site_id')::uuid);
        if refusal is not null then return refusal; end if;
      end if;
    else
      refusal := private.trip_check_site(p_organization, (v_stop.value ->> 'site_id')::uuid);
      if refusal is not null then return refusal; end if;
    end if;
  end loop;

  select array(select (c)::uuid from jsonb_array_elements(p_stops) s, jsonb_array_elements_text(s.value -> 'cylinder_ids') c) into v_ids;
  select x.* into v_vehicle from public.vehicles x where x.id = p_vehicle and x.organization_id = p_organization;
  if not found then return jsonb_build_object('code', 'NOT_FOUND', 'entity', 'vehicle'); end if;
  if array_length(v_ids, 1) > v_vehicle.capacity_cylinders then
    return jsonb_build_object('code', 'CAPACITY_EXCEEDED', 'capacity', v_vehicle.capacity_cylinders, 'requested', array_length(v_ids, 1));
  end if;

  select coalesce(array_agg(i.cylinder_id), '{}') into v_current from public.trip_items i where i.trip_id = p_trip and i.item_status in ('planned', 'checked');
  if exists (select 1 from public.trip_items i where i.trip_id = p_trip and i.item_status = 'checked' and not (i.cylinder_id = any(v_ids))) then
    return jsonb_build_object('code', 'VALIDATION_FAILED', 'fields', private.field_error('cylinders', 'Cilindro já conferido só sai da viagem pela retirada com exceção.'));
  end if;
  if exists (select 1 from public.trip_items i where i.trip_id = p_trip and i.item_status = 'removed' and i.cylinder_id = any(v_ids)) then
    return jsonb_build_object('code', 'VALIDATION_FAILED', 'fields', private.field_error('cylinders', 'Cilindro retirado desta viagem não volta a ela.'));
  end if;
  select coalesce(array_agg(x), '{}') into v_new from unnest(v_ids) x where not (x = any(v_current));
  refusal := private.trip_check_new_cylinders(p_organization, v_new, p_actor, p_session);
  if refusal is not null then return refusal; end if;

  -- Gravação: cadastro da viagem, paradas na ordem recebida, itens e reservas.
  if p_planned_date is distinct from v_trip.planned_date then v_changes := v_changes || jsonb_build_array(jsonb_build_object('field', 'planned_date', 'old', v_trip.planned_date, 'new', p_planned_date)); end if;
  if p_vehicle is distinct from v_trip.vehicle_id then v_changes := v_changes || jsonb_build_array(jsonb_build_object('field', 'vehicle_id', 'old', v_trip.vehicle_id, 'new', p_vehicle)); end if;
  if p_driver is distinct from v_trip.driver_id then v_changes := v_changes || jsonb_build_array(jsonb_build_object('field', 'driver_id', 'old', v_trip.driver_id, 'new', p_driver)); end if;
  if v_notes is distinct from v_trip.notes then v_changes := v_changes || jsonb_build_array(jsonb_build_object('field', 'notes_changed', 'old', null, 'new', true)); end if;

  update public.trips set planned_date = p_planned_date, vehicle_id = p_vehicle, driver_id = p_driver, notes = v_notes, version = version + 1, updated_at = now()
   where id = p_trip returning version into v_version;

  for v_stop in select s.value as value, s.ord as ord from jsonb_array_elements(p_stops) with ordinality as s(value, ord) loop
    if nullif(v_stop.value ->> 'id', '') is not null then
      v_stop_id := (v_stop.value ->> 'id')::uuid;
      update public.trip_stops set site_id = (v_stop.value ->> 'site_id')::uuid, position = v_stop.ord where id = v_stop_id;
    else
      insert into public.trip_stops (organization_id, trip_id, site_id, position)
      values (p_organization, p_trip, (v_stop.value ->> 'site_id')::uuid, v_stop.ord) returning id into v_stop_id;
    end if;
    v_kept := v_kept || v_stop_id;
    for v_cyl in select (c)::uuid from jsonb_array_elements_text(v_stop.value -> 'cylinder_ids') c order by 1 loop
      select i.* into v_item from public.trip_items i where i.trip_id = p_trip and i.cylinder_id = v_cyl;
      if not found then
        insert into public.trip_items (organization_id, trip_id, stop_id, cylinder_id, created_by) values (p_organization, p_trip, v_stop_id, v_cyl, p_actor);
        v_added := v_added + 1;
        perform private.append_cylinder_event(v_cyl, p_organization, 'trip_reserved', p_actor, p_session, null, jsonb_build_object('trip_id', p_trip, 'trip_number', v_trip.number));
      elsif v_item.item_status = 'released' then
        update public.trip_items set item_status = 'planned', stop_id = v_stop_id, divergence_reason = null, checked_at = null, checked_by = null, updated_at = now() where id = v_item.id;
        v_added := v_added + 1;
        perform private.append_cylinder_event(v_cyl, p_organization, 'trip_reserved', p_actor, p_session, null, jsonb_build_object('trip_id', p_trip, 'trip_number', v_trip.number));
      elsif v_item.stop_id <> v_stop_id then
        update public.trip_items set stop_id = v_stop_id, updated_at = now() where id = v_item.id;
      end if;
    end loop;
  end loop;

  for v_item in select i.* from public.trip_items i where i.trip_id = p_trip and i.item_status = 'planned' and not (i.cylinder_id = any(v_ids)) order by i.cylinder_id loop
    update public.trip_items set item_status = 'released', updated_at = now() where id = v_item.id;
    v_released := v_released + 1;
    perform private.append_cylinder_event(v_item.cylinder_id, p_organization, 'trip_released', p_actor, p_session, null, jsonb_build_object('trip_id', p_trip, 'trip_number', v_trip.number));
  end loop;
  update public.trip_stops set status = 'removed', position = null
   where trip_id = p_trip and status <> 'removed' and not (id = any(v_kept));

  perform private.append_trip_event(p_trip, p_organization, 'trip_updated', p_actor, p_session, null,
    jsonb_build_object('changes', v_changes, 'stops', jsonb_array_length(p_stops), 'cylinders', array_length(v_ids, 1), 'added', v_added, 'released', v_released));
  perform private.write_audit_event(p_organization, p_actor, p_session, 'trip.update', 'trip', p_trip::text, 'success', null, null,
    jsonb_build_object('trip_id', p_trip, 'number', v_trip.number, 'stops', jsonb_array_length(p_stops), 'cylinders', array_length(v_ids, 1), 'added', v_added, 'released', v_released));
  v_result := jsonb_build_object('code', 'UPDATED', 'version', v_version);
  return private.trip_remember(p_organization, p_request, 'update_trip', p_trip, v_result);
end $$;

-- A versão antiga (sem o ator) sai: nenhum caminho revela a viagem de outra reserva sem conferir a permissão.
drop function private.trip_check_new_cylinders(uuid, uuid[]);
