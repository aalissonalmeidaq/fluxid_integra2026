-- Spec 008, US1: planejar uma viagem com paradas e cilindros, com reserva atômica (RF-001 a RF-006, RF-024, RF-029; research.md, decisões 2, 5 e 6).
-- Toda RPC recebe ator e sessão do servidor, confere a permissão no banco a cada chamada e devolve um jsonb com `code`. O evento da
-- viagem, o evento do cilindro e a auditoria entram na mesma transação do comando. Nada é auditado ou registrado com observações,
-- nome de recebedor ou justificativa em texto aberto: só contagens, identificadores e situações.

-- 1. Histórico da viagem com sequência contínua, sob bloqueio da linha da viagem.
create function private.append_trip_event(
  p_trip uuid, p_organization uuid, p_event_type text, p_actor uuid, p_session uuid, p_justification text, p_data jsonb)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  next_sequence integer;
begin
  perform 1 from public.trips t where t.id = p_trip and t.organization_id = p_organization for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'trip_not_found';
  end if;
  select coalesce(max(e.sequence), 0) + 1 into next_sequence from public.trip_events e where e.trip_id = p_trip;
  insert into public.trip_events (organization_id, trip_id, sequence, event_type, actor_user_id, actor_session_id, justification, data)
  values (p_organization, p_trip, next_sequence, p_event_type, p_actor, p_session, p_justification, coalesce(p_data, '{}'::jsonb));
  return next_sequence;
end $$;

-- 2. Idempotência por `request_id` (research.md, decisão 5). `trip_replay` devolve o resultado gravado (com `replayed`), REQUEST_REUSED
-- quando o pedido já foi usado por outra operação ou outra viagem, ou nulo quando o pedido é novo. Duas requisições simultâneas com o
-- mesmo `request_id` são serializadas pela trava de aviso.
create function private.trip_replay(p_organization uuid, p_request uuid, p_operation text, p_trip uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_req private.trip_requests;
begin
  if p_request is null then
    return jsonb_build_object('code', 'VALIDATION_FAILED', 'fields', private.field_error('request_id', 'Campo obrigatório.'));
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_organization::text || ':trip-request:' || p_request::text, 0));
  select r.* into v_req from private.trip_requests r where r.organization_id = p_organization and r.request_id = p_request;
  if not found then return null; end if;
  if v_req.operation <> p_operation or (p_trip is not null and v_req.trip_id is distinct from p_trip) then
    return jsonb_build_object('code', 'REQUEST_REUSED');
  end if;
  return v_req.result || jsonb_build_object('replayed', true);
end $$;

create function private.trip_remember(p_organization uuid, p_request uuid, p_operation text, p_trip uuid, p_result jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  insert into private.trip_requests (organization_id, request_id, operation, trip_id, result) values (p_organization, p_request, p_operation, p_trip, p_result);
  return p_result;
end $$;

-- 3. Elegibilidade do cilindro para a viagem (RF-005): ativo, em estoque e com teste em dia ou a vencer. Devolve o motivo da recusa
-- (`inactive`, `out_of_stock`, `hydro_expired`, `hydro_rejected` ou `hydro_missing`) ou nulo quando está elegível.
create function private.cylinder_trip_refusal(c public.cylinders) returns text language sql stable set search_path = '' as $$
  select case
    when c.status <> 'active' then 'inactive'
    when c.stock_status <> 'in_stock' then 'out_of_stock'
    else case private.hydro_status(c.hydro_last_result, c.hydro_next_due_on)
      when 'reprovado' then 'hydro_rejected' when 'vencido' then 'hydro_expired' when 'sem_teste' then 'hydro_missing' else null end
  end
$$;

-- 4. Regras de campo do planejamento, repetidas no servidor. Devolve a lista de erros por campo (vazia quando válido).
create function private.validate_trip_plan(p_planned_date date, p_notes text, p_stops jsonb, p_creating boolean)
returns jsonb language plpgsql stable set search_path = '' as $$
declare
  errors jsonb := '[]'::jsonb;
  limits jsonb := private.trip_limits();
  v_stop jsonb;
  v_count integer;
  v_ids text[];
begin
  if p_planned_date is null then
    errors := errors || private.field_error('planned_date', 'Informe a data prevista.');
  elsif p_creating and p_planned_date < (now() at time zone 'America/Sao_Paulo')::date then
    errors := errors || private.field_error('planned_date', 'Escolha hoje ou uma data futura.');
  end if;
  if p_notes is not null and char_length(p_notes) > (limits ->> 'max_notes')::integer then
    errors := errors || private.field_error('notes', 'Use até ' || (limits ->> 'max_notes') || ' caracteres nas observações.');
  end if;
  if p_stops is null or jsonb_typeof(p_stops) <> 'array' or jsonb_array_length(p_stops) = 0 then
    return errors || private.field_error('stops', 'Inclua pelo menos uma parada.');
  end if;
  if jsonb_array_length(p_stops) > (limits ->> 'max_stops')::integer then
    return errors || private.field_error('stops', 'Uma viagem tem no máximo ' || (limits ->> 'max_stops') || ' paradas.');
  end if;
  v_ids := '{}';
  for v_stop in select value from jsonb_array_elements(p_stops) loop
    if jsonb_typeof(v_stop) <> 'object' or jsonb_typeof(v_stop -> 'cylinder_ids') is distinct from 'array' then
      return errors || private.field_error('stops', 'Parada inválida.');
    end if;
    v_count := jsonb_array_length(v_stop -> 'cylinder_ids');
    if v_count = 0 then
      errors := errors || private.field_error('stops', 'Cada parada precisa de pelo menos um cilindro.');
    elsif v_count > (limits ->> 'max_cylinders_per_stop')::integer then
      errors := errors || private.field_error('stops', 'Cada parada aceita no máximo ' || (limits ->> 'max_cylinders_per_stop') || ' cilindros.');
    end if;
    v_ids := v_ids || array(select jsonb_array_elements_text(v_stop -> 'cylinder_ids'));
  end loop;
  if (select count(*) from unnest(v_ids)) <> (select count(distinct x) from unnest(v_ids) x) then
    errors := errors || private.field_error('cylinders', 'O mesmo cilindro aparece mais de uma vez na viagem.');
  end if;
  return errors;
end $$;

-- 5. Cadastros da viagem. Cada função devolve nulo quando está tudo certo, ou o jsonb de recusa (NOT_FOUND de outra organização,
-- PARENT_INACTIVE para cadastro indisponível).
create function private.trip_check_vehicle(p_organization uuid, p_vehicle uuid) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v public.vehicles;
begin
  select x.* into v from public.vehicles x where x.id = p_vehicle and x.organization_id = p_organization;
  if not found then return jsonb_build_object('code', 'NOT_FOUND', 'entity', 'vehicle'); end if;
  if v.status <> 'available' then return jsonb_build_object('code', 'PARENT_INACTIVE', 'entity', 'vehicle', 'entity_id', v.id); end if;
  return null;
end $$;

create function private.trip_check_driver(p_organization uuid, p_driver uuid) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare d public.drivers;
begin
  select x.* into d from public.drivers x where x.id = p_driver and x.organization_id = p_organization;
  if not found then return jsonb_build_object('code', 'NOT_FOUND', 'entity', 'driver'); end if;
  if d.status <> 'active' then return jsonb_build_object('code', 'PARENT_INACTIVE', 'entity', 'driver', 'entity_id', d.id); end if;
  return null;
end $$;

create function private.trip_check_site(p_organization uuid, p_site uuid) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare s record;
begin
  select x.id, x.status as site_status, c.id as customer_id, c.status as customer_status into s
    from public.customer_sites x join public.customers c on c.id = x.customer_id and c.organization_id = x.organization_id
   where x.id = p_site and x.organization_id = p_organization;
  if not found then return jsonb_build_object('code', 'NOT_FOUND', 'entity', 'site'); end if;
  if s.site_status <> 'active' then return jsonb_build_object('code', 'PARENT_INACTIVE', 'entity', 'site', 'entity_id', s.id); end if;
  if s.customer_status <> 'active' then return jsonb_build_object('code', 'PARENT_INACTIVE', 'entity', 'customer', 'entity_id', s.customer_id); end if;
  return null;
end $$;

-- Cilindros novos do planejamento: trava as linhas em ordem fixa de id (evita impasse entre viagens que disputam os mesmos cilindros),
-- depois confere reserva aberta e elegibilidade. Devolve nulo ou o jsonb de recusa, sem gravar nada.
create function private.trip_check_new_cylinders(p_organization uuid, p_ids uuid[])
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_cyl public.cylinders;
  v_open record;
  v_reason text;
begin
  if coalesce(array_length(p_ids, 1), 0) = 0 then return null; end if;
  perform 1 from public.cylinders c where c.organization_id = p_organization and c.id = any(p_ids) order by c.id for update;
  if (select count(*) from public.cylinders c where c.organization_id = p_organization and c.id = any(p_ids)) <> array_length(p_ids, 1) then
    return jsonb_build_object('code', 'NOT_FOUND', 'entity', 'cylinder');
  end if;
  for v_cyl in select c.* from public.cylinders c where c.organization_id = p_organization and c.id = any(p_ids) order by c.id loop
    select t.id as trip_id, t.number as trip_number into v_open
      from public.trip_items i join public.trips t on t.id = i.trip_id where i.cylinder_id = v_cyl.id and i.is_open limit 1;
    if found then
      return jsonb_build_object('code', 'CYLINDER_RESERVED', 'cylinder_id', v_cyl.id, 'trip_id', v_open.trip_id, 'trip_number', v_open.trip_number);
    end if;
    v_reason := private.cylinder_trip_refusal(v_cyl);
    if v_reason is not null then
      return jsonb_build_object('code', 'CYLINDER_NOT_ELIGIBLE', 'cylinder_id', v_cyl.id, 'reason', v_reason);
    end if;
  end loop;
  return null;
end $$;

-- 6. Criar a viagem.
create function public.create_trip(
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
  refusal := private.trip_check_new_cylinders(p_organization, v_ids);
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

-- 7. Editar a viagem (só planejada ou carregando). As paradas chegam na ordem desejada, com `id` quando já existem; a que sai da lista
-- fica `removed`. As reservas acompanham: cilindro novo é reservado, o que saiu é liberado. Cilindro já conferido só sai por `remove_item`.
create function public.update_trip(
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
  refusal := private.trip_check_new_cylinders(p_organization, v_new);
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

revoke all on function private.append_trip_event(uuid, uuid, text, uuid, uuid, text, jsonb), private.trip_replay(uuid, uuid, text, uuid),
  private.trip_remember(uuid, uuid, text, uuid, jsonb), private.cylinder_trip_refusal(public.cylinders), private.validate_trip_plan(date, text, jsonb, boolean),
  private.trip_check_vehicle(uuid, uuid), private.trip_check_driver(uuid, uuid), private.trip_check_site(uuid, uuid), private.trip_check_new_cylinders(uuid, uuid[])
  from public, anon, authenticated;
revoke all on function
  public.create_trip(uuid, uuid, uuid, uuid, date, uuid, uuid, text, jsonb),
  public.update_trip(uuid, uuid, uuid, uuid, uuid, bigint, date, uuid, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function
  public.create_trip(uuid, uuid, uuid, uuid, date, uuid, uuid, text, jsonb),
  public.update_trip(uuid, uuid, uuid, uuid, uuid, bigint, date, uuid, uuid, text, jsonb) to service_role;
