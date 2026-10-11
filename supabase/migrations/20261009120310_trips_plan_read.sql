-- Spec 008, US1 (leitura): detalhe, lista, opções do formulário e cilindros elegíveis (RF-001a, RF-005, RF-017, RF-026, RF-029, RF-032).
-- Toda leitura confere a permissão no banco e filtra por organização; id de outra organização responde NOT_FOUND. O nome e a função
-- do recebedor só saem a quem tem `trip.recipient`; os demais recebem "(restrito)". Mesma lista e mesmo detalhe servem às histórias
-- seguintes, que só acrescentam operações novas.

-- 1. Filtro único da lista (a contagem e a página usam a mesma regra, como nos cadastros).
create function private.trip_filter(
  p_organization uuid, p_status text, p_search text, p_from date, p_to date, p_vehicle uuid, p_driver uuid, p_customer uuid, p_custody text)
returns setof public.trips language sql stable security definer set search_path = '' as $$
  select t.* from public.trips t
   where t.organization_id = p_organization
     and (p_status = 'all' or (p_status = 'open' and t.status in ('planned', 'loading', 'in_progress')) or t.status = p_status)
     and (p_from is null or t.planned_date >= p_from)
     and (p_to is null or t.planned_date <= p_to)
     and (p_vehicle is null or t.vehicle_id = p_vehicle)
     and (p_driver is null or t.driver_id = p_driver)
     and (p_customer is null or exists (
           select 1 from public.trip_stops s join public.customer_sites cs on cs.id = s.site_id
            where s.trip_id = t.id and s.status <> 'removed' and cs.customer_id = p_customer))
     and (p_custody is null or exists (
           select 1 from public.trip_items i join public.cylinders c on c.id = i.cylinder_id
            where i.trip_id = t.id and i.is_open and c.custody_status = p_custody))
     and (p_search is null
          or (p_search ~ '^[0-9]{1,9}$' and t.number = p_search::integer)
          or exists (select 1 from public.vehicles v where v.id = t.vehicle_id and lower(v.plate) like private.like_pattern(replace(replace(p_search, '-', ''), ' ', '')))
          or exists (select 1 from public.drivers d where d.id = t.driver_id and d.anonymized_at is null and lower(d.full_name) like private.like_pattern(p_search))
          or exists (select 1 from public.trip_stops s join public.customer_sites cs on cs.id = s.site_id join public.customers cu on cu.id = cs.customer_id
                      where s.trip_id = t.id and s.status <> 'removed' and cu.anonymized_at is null
                        and (lower(cu.legal_name) like private.like_pattern(p_search) or lower(cu.trade_name) like private.like_pattern(p_search))))
$$;

create function private.trip_list_item(t public.trips) returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', t.id, 'number', t.number, 'planned_date', t.planned_date, 'status', t.status, 'version', t.version,
    'overdue', t.status in ('planned', 'loading') and t.planned_date < (now() at time zone 'America/Sao_Paulo')::date,
    'vehicle', (select jsonb_build_object('id', v.id, 'plate', v.plate) from public.vehicles v where v.id = t.vehicle_id),
    'driver', (select jsonb_build_object('id', d.id, 'full_name', d.full_name) from public.drivers d where d.id = t.driver_id),
    'stops', (select count(*) from public.trip_stops s where s.trip_id = t.id and s.status <> 'removed'),
    'cylinders', (select count(*) from public.trip_items i where i.trip_id = t.id and i.item_status not in ('removed', 'released')),
    'divergences', (select count(*) from public.trip_stops s where s.trip_id = t.id and s.status = 'with_divergence')
                 + (select count(*) from public.trip_items i where i.trip_id = t.id and i.item_status = 'not_delivered'))
$$;

create function public.list_trips(
  p_actor uuid, p_session uuid, p_organization uuid, p_search text, p_status text, p_from date, p_to date, p_vehicle uuid, p_driver uuid,
  p_customer uuid, p_custody text, p_sort text, p_cursor text, p_limit integer)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  denied text;
  v_status text := coalesce(p_status, 'open');
  v_sort text := coalesce(p_sort, 'number_desc');
  v_limit integer := least(greatest(coalesce(p_limit, 25), 1), 100);
  v_search text := nullif(btrim(coalesce(p_search, '')), '');
  v_cursor record;
  v_total bigint;
  v_rows jsonb;
  v_count integer;
  v_items jsonb;
  v_next text := null;
  v_last jsonb;
begin
  denied := private.cylinder_authorize(p_actor, p_session, p_organization, 'trip.read');
  if denied is not null then return jsonb_build_object('code', denied); end if;
  if v_status not in ('open', 'planned', 'loading', 'in_progress', 'completed', 'cancelled', 'all') then
    return jsonb_build_object('code', 'VALIDATION_FAILED', 'fields', private.field_error('status', 'Situação desconhecida.'));
  end if;
  if p_custody is not null and p_custody not in ('in_organization', 'in_transit', 'at_customer') then
    return jsonb_build_object('code', 'VALIDATION_FAILED', 'fields', private.field_error('custody', 'Custódia desconhecida.'));
  end if;
  if v_sort not in ('number_desc', 'number_asc', 'date_desc', 'date_asc') then
    return jsonb_build_object('code', 'VALIDATION_FAILED', 'fields', private.field_error('sort', 'Ordenação desconhecida.'));
  end if;
  select * into v_cursor from private.cursor_decode(p_cursor);
  if not v_cursor.valid then
    return jsonb_build_object('code', 'VALIDATION_FAILED', 'fields', private.field_error('cursor', 'Página inválida.'));
  end if;

  select count(*) into v_total from private.trip_filter(p_organization, v_status, v_search, p_from, p_to, p_vehicle, p_driver, p_customer, p_custody);

  -- A chave de ordenação é texto de largura fixa: o número (ou a data prevista e o número), de modo que (chave, id) ordena e pagina.
  -- Só a página (limite + 1, para saber se há próxima) vira JSON.
  if v_sort in ('number_desc', 'date_desc') then
    select jsonb_agg(jsonb_build_object('k', f.k, 'i', f.id, 'item', private.trip_list_item((select tr from public.trips tr where tr.id = f.id))) order by f.k desc, f.id desc) into v_rows
      from (select y.id, y.k from (
              select x.id, case when v_sort = 'number_desc' then lpad(x.number::text, 10, '0') else to_char(x.planned_date, 'YYYYMMDD') || lpad(x.number::text, 10, '0') end as k
                from private.trip_filter(p_organization, v_status, v_search, p_from, p_to, p_vehicle, p_driver, p_customer, p_custody) x) y
             where p_cursor is null or (y.k, y.id) < (v_cursor.sort_key, v_cursor.row_id)
             order by y.k desc, y.id desc limit v_limit + 1) f;
  else
    select jsonb_agg(jsonb_build_object('k', f.k, 'i', f.id, 'item', private.trip_list_item((select tr from public.trips tr where tr.id = f.id))) order by f.k, f.id) into v_rows
      from (select y.id, y.k from (
              select x.id, case when v_sort = 'number_asc' then lpad(x.number::text, 10, '0') else to_char(x.planned_date, 'YYYYMMDD') || lpad(x.number::text, 10, '0') end as k
                from private.trip_filter(p_organization, v_status, v_search, p_from, p_to, p_vehicle, p_driver, p_customer, p_custody) x) y
             where p_cursor is null or (y.k, y.id) > (v_cursor.sort_key, v_cursor.row_id)
             order by y.k, y.id limit v_limit + 1) f;
  end if;

  v_rows := coalesce(v_rows, '[]'::jsonb);
  v_count := jsonb_array_length(v_rows);
  select coalesce(jsonb_agg(e.value -> 'item' order by e.ord), '[]'::jsonb) into v_items
    from jsonb_array_elements(v_rows) with ordinality as e(value, ord) where e.ord <= v_limit;
  if v_count > v_limit then
    v_last := v_rows -> (v_limit - 1);
    v_next := private.cursor_encode(v_last ->> 'k', (v_last ->> 'i')::uuid);
  end if;
  return jsonb_build_object('code', 'LISTED', 'items', v_items, 'total', v_total, 'next', v_next);
end $$;

-- 2. Detalhe da viagem.
create function public.get_trip(p_actor uuid, p_session uuid, p_organization uuid, p_trip uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  denied text;
  t public.trips;
  v_recipient boolean;
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_vehicle public.vehicles;
  v_driver public.drivers;
  v_warnings jsonb := '[]'::jsonb;
  v_licensing text;
  v_cnh text;
begin
  denied := private.cylinder_authorize(p_actor, p_session, p_organization, 'trip.read');
  if denied is not null then return jsonb_build_object('code', denied); end if;
  select x.* into t from public.trips x where x.id = p_trip and x.organization_id = p_organization;
  if not found then return jsonb_build_object('code', 'NOT_FOUND'); end if;
  v_recipient := private.actor_has_permission(p_actor, p_session, p_organization, 'trip.recipient');
  select x.* into v_vehicle from public.vehicles x where x.id = t.vehicle_id;
  select x.* into v_driver from public.drivers x where x.id = t.driver_id;

  v_licensing := private.validity_status(v_vehicle.licensing_due_on);
  v_cnh := private.validity_status(v_driver.cnh_valid_until);
  if t.status in ('planned', 'loading') then
    if v_licensing = 'vencido' then v_warnings := v_warnings || jsonb_build_array('licensing_expired');
    elsif v_licensing = 'a_vencer' then v_warnings := v_warnings || jsonb_build_array('licensing_expiring'); end if;
    if v_cnh = 'vencido' then v_warnings := v_warnings || jsonb_build_array('cnh_expired');
    elsif v_cnh = 'a_vencer' then v_warnings := v_warnings || jsonb_build_array('cnh_expiring'); end if;
    if v_vehicle.status <> 'available' then v_warnings := v_warnings || jsonb_build_array('vehicle_unavailable'); end if;
    if v_driver.status <> 'active' then v_warnings := v_warnings || jsonb_build_array('driver_inactive'); end if;
  end if;

  return jsonb_build_object(
    'code', 'FOUND',
    'overdue', t.status in ('planned', 'loading') and t.planned_date < v_today,
    'trip', jsonb_build_object(
      'id', t.id, 'number', t.number, 'planned_date', t.planned_date, 'status', t.status, 'notes', t.notes, 'cancel_reason', t.cancel_reason, 'version', t.version,
      'created_at', t.created_at, 'created_by_name', (select p.display_name from public.profiles p where p.user_id = t.created_by),
      'started_at', t.started_at, 'completed_at', t.completed_at, 'cancelled_at', t.cancelled_at),
    'vehicle', jsonb_build_object('id', v_vehicle.id, 'plate', v_vehicle.plate, 'capacity_cylinders', v_vehicle.capacity_cylinders, 'status', v_vehicle.status,
                                  'licensing_due_on', v_vehicle.licensing_due_on, 'licensing_status', v_licensing),
    'driver', jsonb_build_object('id', v_driver.id, 'full_name', v_driver.full_name, 'status', v_driver.status, 'cnh_valid_until', v_driver.cnh_valid_until, 'cnh_status', v_cnh),
    'stops', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'position', s.position, 'status', s.status, 'arrived_at', s.arrived_at, 'out_of_order', s.out_of_order, 'closed_at', s.closed_at,
        'site', jsonb_build_object('id', cs.id, 'name', cs.name, 'city', cs.city, 'state', cs.state, 'customer_id', cu.id,
                                   'customer_name', coalesce(cu.trade_name, cu.legal_name))) order by s.position nulls last, s.id)
        from public.trip_stops s join public.customer_sites cs on cs.id = s.site_id join public.customers cu on cu.id = cs.customer_id
       where s.trip_id = t.id and s.status <> 'removed'), '[]'::jsonb),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id, 'stop_id', i.stop_id, 'item_status', i.item_status, 'lock_status', i.lock_status, 'checked_at', i.checked_at,
        'checked_by_name', (select p.display_name from public.profiles p where p.user_id = i.checked_by), 'divergence_reason', i.divergence_reason,
        'cylinder', jsonb_build_object('id', c.id, 'serial_number', c.serial_number, 'gas', ct.gas, 'capacity_value', ct.capacity_value,
                                       'capacity_unit', ct.capacity_unit, 'status', c.status, 'stock_status', c.stock_status, 'custody_status', c.custody_status,
                                       'hydro_status', private.hydro_status(c.hydro_last_result, c.hydro_next_due_on))) order by c.serial_number, i.id)
        from public.trip_items i join public.cylinders c on c.id = i.cylinder_id join public.cylinder_types ct on ct.id = c.cylinder_type_id
       where i.trip_id = t.id and i.item_status not in ('released') and i.stop_id in (select x.id from public.trip_stops x where x.trip_id = t.id and x.status <> 'removed')), '[]'::jsonb),
    'deliveries', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', d.id, 'stop_id', d.stop_id, 'delivered_at', d.delivered_at,
        'recipient_name', case when v_recipient then d.recipient_name else '(restrito)' end,
        'recipient_role', case when v_recipient then d.recipient_role else '(restrito)' end,
        'latitude', d.latitude, 'longitude', d.longitude, 'at_site_address', d.at_site_address, 'outside_geofence', d.outside_geofence,
        'results', d.results, 'supersedes_id', d.supersedes_id,
        'recorded_by_name', (select p.display_name from public.profiles p where p.user_id = d.recorded_by), 'recorded_at', d.recorded_at) order by d.recorded_at, d.id)
        from public.trip_deliveries d join public.trip_stops s on s.id = d.stop_id where s.trip_id = t.id), '[]'::jsonb),
    'unlocks', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', u.id, 'item_id', u.item_id, 'exceptional', u.exceptional, 'justification', u.justification, 'aal', u.aal,
        'actor_name', (select p.display_name from public.profiles p where p.user_id = u.actor_user_id), 'occurred_at', u.occurred_at) order by u.occurred_at, u.id)
        from public.trip_unlocks u join public.trip_items i on i.id = u.item_id where i.trip_id = t.id), '[]'::jsonb),
    'warnings', v_warnings);
end $$;

-- 3. Opções do formulário: só veículos disponíveis, motoristas ativos e unidades ativas de clientes ativos.
create function public.trip_options(p_actor uuid, p_session uuid, p_organization uuid, p_search text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  denied text;
  v_search text := nullif(btrim(coalesce(p_search, '')), '');
begin
  denied := private.cylinder_authorize(p_actor, p_session, p_organization, 'trip.write');
  if denied is not null then return jsonb_build_object('code', denied); end if;
  return jsonb_build_object(
    'code', 'LISTED',
    'vehicles', coalesce((select jsonb_agg(jsonb_build_object(
        'id', v.id, 'plate', v.plate, 'capacity_cylinders', v.capacity_cylinders, 'licensing_due_on', v.licensing_due_on,
        'licensing_status', private.validity_status(v.licensing_due_on)) order by v.plate)
      from (select x.* from public.vehicles x where x.organization_id = p_organization and x.status = 'available'
               and (v_search is null or lower(x.plate) like private.like_pattern(replace(replace(v_search, '-', ''), ' ', '')))
             order by x.plate limit 100) v), '[]'::jsonb),
    'drivers', coalesce((select jsonb_agg(jsonb_build_object(
        'id', d.id, 'full_name', d.full_name, 'cnh_valid_until', d.cnh_valid_until, 'cnh_status', private.validity_status(d.cnh_valid_until)) order by lower(d.full_name), d.id)
      from (select x.* from public.drivers x where x.organization_id = p_organization and x.status = 'active'
               and (v_search is null or lower(x.full_name) like private.like_pattern(v_search))
             order by lower(x.full_name), x.id limit 100) d), '[]'::jsonb),
    'sites', coalesce((select jsonb_agg(jsonb_build_object(
        'id', s.id, 'name', s.name, 'city', s.city, 'state', s.state, 'customer_id', s.customer_id, 'customer_name', s.customer_name) order by lower(s.customer_name), lower(s.name), s.id)
      from (select x.id, x.name, x.city, x.state, x.customer_id, coalesce(cu.trade_name, cu.legal_name) as customer_name
              from public.customer_sites x join public.customers cu on cu.id = x.customer_id and cu.organization_id = x.organization_id
             where x.organization_id = p_organization and x.status = 'active' and cu.status = 'active'
               and (v_search is null or lower(x.name) like private.like_pattern(v_search) or lower(x.city) like private.like_pattern(v_search)
                    or lower(cu.legal_name) like private.like_pattern(v_search) or lower(coalesce(cu.trade_name, '')) like private.like_pattern(v_search))
             order by lower(coalesce(cu.trade_name, cu.legal_name)), lower(x.name), x.id limit 100) s), '[]'::jsonb));
end $$;

-- 4. Cilindros elegíveis para uma viagem: ativos, em estoque, com teste em dia ou a vencer e sem reserva aberta.
create function public.list_eligible_cylinders(
  p_actor uuid, p_session uuid, p_organization uuid, p_search text, p_type uuid, p_cursor text, p_limit integer)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  denied text;
  v_limit integer := least(greatest(coalesce(p_limit, 25), 1), 100);
  v_search text := nullif(btrim(coalesce(p_search, '')), '');
  v_cursor record;
  v_rows jsonb;
  v_count integer;
  v_items jsonb;
  v_next text := null;
  v_last jsonb;
begin
  denied := private.cylinder_authorize(p_actor, p_session, p_organization, 'trip.write');
  if denied is not null then return jsonb_build_object('code', denied); end if;
  select * into v_cursor from private.cursor_decode(p_cursor);
  if not v_cursor.valid then
    return jsonb_build_object('code', 'VALIDATION_FAILED', 'fields', private.field_error('cursor', 'Página inválida.'));
  end if;
  select jsonb_agg(jsonb_build_object('k', f.serial_normalized, 'i', f.id, 'item', jsonb_build_object(
      'id', f.id, 'serial_number', f.serial_number, 'gas', f.gas, 'capacity_value', f.capacity_value, 'capacity_unit', f.capacity_unit,
      'hydro_status', private.hydro_status(f.hydro_last_result, f.hydro_next_due_on))) order by f.serial_normalized, f.id) into v_rows
    from (select c.*, ct.gas, ct.capacity_value, ct.capacity_unit
            from public.cylinders c join public.cylinder_types ct on ct.id = c.cylinder_type_id
           where c.organization_id = p_organization and c.status = 'active' and c.stock_status = 'in_stock'
             and private.hydro_status(c.hydro_last_result, c.hydro_next_due_on) in ('em_dia', 'a_vencer')
             and not exists (select 1 from public.trip_items i where i.cylinder_id = c.id and i.is_open)
             and (p_type is null or c.cylinder_type_id = p_type)
             and (v_search is null or lower(c.serial_number) like private.like_pattern(v_search)
                  or exists (select 1 from public.cylinder_identifiers ci where ci.cylinder_id = c.id and ci.status = 'active' and lower(ci.value) like private.like_pattern(v_search)))
             and (p_cursor is null or (c.serial_normalized, c.id) > (v_cursor.sort_key, v_cursor.row_id))
           order by c.serial_normalized, c.id limit v_limit + 1) f;
  v_rows := coalesce(v_rows, '[]'::jsonb);
  v_count := jsonb_array_length(v_rows);
  select coalesce(jsonb_agg(e.value -> 'item' order by e.ord), '[]'::jsonb) into v_items
    from jsonb_array_elements(v_rows) with ordinality as e(value, ord) where e.ord <= v_limit;
  if v_count > v_limit then
    v_last := v_rows -> (v_limit - 1);
    v_next := private.cursor_encode(v_last ->> 'k', (v_last ->> 'i')::uuid);
  end if;
  return jsonb_build_object('code', 'LISTED', 'items', v_items, 'next', v_next);
end $$;

revoke all on function private.trip_filter(uuid, text, text, date, date, uuid, uuid, uuid, text), private.trip_list_item(public.trips) from public, anon, authenticated;
revoke all on function
  public.list_trips(uuid, uuid, uuid, text, text, date, date, uuid, uuid, uuid, text, text, text, integer),
  public.get_trip(uuid, uuid, uuid, uuid),
  public.trip_options(uuid, uuid, uuid, text),
  public.list_eligible_cylinders(uuid, uuid, uuid, text, uuid, text, integer) from public, anon, authenticated;
grant execute on function
  public.list_trips(uuid, uuid, uuid, text, text, date, date, uuid, uuid, uuid, text, text, text, integer),
  public.get_trip(uuid, uuid, uuid, uuid),
  public.trip_options(uuid, uuid, uuid, text),
  public.list_eligible_cylinders(uuid, uuid, uuid, text, uuid, text, integer) to service_role;
