-- Spec 008, US6: histórico da viagem e viagens por cilindro e por unidade (RF-025 a RF-027, CA-006).
-- O histórico é imutável (gatilhos da migration do esquema) e não traz dado pessoal: o nome do recebedor nunca entrou em evento algum.
-- A lista de viagens com todos os filtros já foi criada com o planejamento (`list_trips`); aqui entram as consultas que cruzam com os
-- cadastros de origem, que exigem também a leitura desse cadastro.

create function public.trip_history(
  p_actor uuid, p_session uuid, p_organization uuid, p_trip uuid, p_event_type text, p_from date, p_to date, p_order text, p_cursor text, p_limit integer)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  denied text;
  v_order text := coalesce(p_order, 'desc');
  v_limit integer := least(greatest(coalesce(p_limit, 25), 1), 100);
  v_cursor record;
  v_rows jsonb;
  v_count integer;
  v_items jsonb;
  v_next text := null;
  v_last jsonb;
begin
  denied := private.cylinder_authorize(p_actor, p_session, p_organization, 'trip.history');
  if denied is not null then return jsonb_build_object('code', denied); end if;
  if v_order not in ('asc', 'desc') then
    return jsonb_build_object('code', 'VALIDATION_FAILED', 'fields', private.field_error('order', 'Ordem desconhecida.'));
  end if;
  if p_event_type is not null and p_event_type not in (
    'trip_created', 'trip_updated', 'loading_started', 'loading_reverted', 'item_checked', 'item_unchecked', 'item_removed', 'trip_started', 'stop_arrived',
    'delivery_registered', 'delivery_corrected', 'unlock_registered', 'item_returned', 'trip_completed', 'trip_cancelled') then
    return jsonb_build_object('code', 'VALIDATION_FAILED', 'fields', private.field_error('event_type', 'Tipo de evento desconhecido.'));
  end if;
  select * into v_cursor from private.cursor_decode(p_cursor);
  if not v_cursor.valid then
    return jsonb_build_object('code', 'VALIDATION_FAILED', 'fields', private.field_error('cursor', 'Página inválida.'));
  end if;
  if not exists (select 1 from public.trips t where t.id = p_trip and t.organization_id = p_organization) then return jsonb_build_object('code', 'NOT_FOUND'); end if;

  -- A chave de ordenação é a sequência da viagem em texto de largura fixa; o desempate é o id.
  select jsonb_agg(jsonb_build_object('k', f.k, 'i', f.id, 'item', jsonb_build_object(
      'id', f.id, 'sequence', f.sequence, 'event_type', f.event_type, 'occurred_at', f.occurred_at, 'justification', f.justification, 'data', f.data,
      'actor_name', (select p.display_name from public.profiles p where p.user_id = f.actor_user_id))) order by case when v_order = 'asc' then f.sequence end asc, case when v_order = 'desc' then f.sequence end desc) into v_rows
    from (select e.*, lpad(e.sequence::text, 10, '0') as k from public.trip_events e
           where e.trip_id = p_trip and e.organization_id = p_organization
             and (p_event_type is null or e.event_type = p_event_type)
             and (p_from is null or (e.occurred_at at time zone 'America/Sao_Paulo')::date >= p_from)
             and (p_to is null or (e.occurred_at at time zone 'America/Sao_Paulo')::date <= p_to)
             and (p_cursor is null or case when v_order = 'asc' then (lpad(e.sequence::text, 10, '0'), e.id) > (v_cursor.sort_key, v_cursor.row_id)
                                           else (lpad(e.sequence::text, 10, '0'), e.id) < (v_cursor.sort_key, v_cursor.row_id) end)
           order by case when v_order = 'asc' then e.sequence end asc, case when v_order = 'desc' then e.sequence end desc limit v_limit + 1) f;
  v_rows := coalesce(v_rows, '[]'::jsonb);
  v_count := jsonb_array_length(v_rows);
  select coalesce(jsonb_agg(e.value -> 'item' order by e.ord), '[]'::jsonb) into v_items from jsonb_array_elements(v_rows) with ordinality as e(value, ord) where e.ord <= v_limit;
  if v_count > v_limit then
    v_last := v_rows -> (v_limit - 1);
    v_next := private.cursor_encode(v_last ->> 'k', (v_last ->> 'i')::uuid);
  end if;
  return jsonb_build_object('code', 'LISTED', 'events', v_items, 'next', v_next);
end $$;

-- Viagens em que o cilindro apareceu (RF-027): trip.read e a leitura do cadastro de cilindros.
create function public.trips_of_cylinder(p_actor uuid, p_session uuid, p_organization uuid, p_cylinder uuid, p_cursor text, p_limit integer)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  denied text;
  v_limit integer := least(greatest(coalesce(p_limit, 25), 1), 100);
  v_cursor record;
  v_rows jsonb;
  v_count integer;
  v_items jsonb;
  v_next text := null;
  v_last jsonb;
begin
  denied := private.cylinder_authorize(p_actor, p_session, p_organization, 'trip.read');
  if denied is not null then return jsonb_build_object('code', denied); end if;
  denied := private.cylinder_authorize(p_actor, p_session, p_organization, 'cylinder.read');
  if denied is not null then return jsonb_build_object('code', denied); end if;
  select * into v_cursor from private.cursor_decode(p_cursor);
  if not v_cursor.valid then
    return jsonb_build_object('code', 'VALIDATION_FAILED', 'fields', private.field_error('cursor', 'Página inválida.'));
  end if;
  if not exists (select 1 from public.cylinders c where c.id = p_cylinder and c.organization_id = p_organization) then return jsonb_build_object('code', 'NOT_FOUND'); end if;

  select jsonb_agg(jsonb_build_object('k', f.k, 'i', f.item_id, 'item', private.trip_list_item((select tr from public.trips tr where tr.id = f.trip_id)) || jsonb_build_object('item_status', f.item_status, 'lock_status', f.lock_status)) order by f.k desc, f.item_id desc) into v_rows
    from (select i.id as item_id, i.trip_id, i.item_status, i.lock_status, lpad(t.number::text, 10, '0') as k
            from public.trip_items i join public.trips t on t.id = i.trip_id
           where i.cylinder_id = p_cylinder and i.organization_id = p_organization
             and (p_cursor is null or (lpad(t.number::text, 10, '0'), i.id) < (v_cursor.sort_key, v_cursor.row_id))
           order by lpad(t.number::text, 10, '0') desc, i.id desc limit v_limit + 1) f;
  v_rows := coalesce(v_rows, '[]'::jsonb);
  v_count := jsonb_array_length(v_rows);
  select coalesce(jsonb_agg(e.value -> 'item' order by e.ord), '[]'::jsonb) into v_items from jsonb_array_elements(v_rows) with ordinality as e(value, ord) where e.ord <= v_limit;
  if v_count > v_limit then
    v_last := v_rows -> (v_limit - 1);
    v_next := private.cursor_encode(v_last ->> 'k', (v_last ->> 'i')::uuid);
  end if;
  return jsonb_build_object('code', 'LISTED', 'items', v_items, 'next', v_next);
end $$;

-- Viagens com parada na unidade (RF-027): trip.read e a leitura do cadastro de clientes.
create function public.trips_of_site(p_actor uuid, p_session uuid, p_organization uuid, p_site uuid, p_cursor text, p_limit integer)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  denied text;
  v_limit integer := least(greatest(coalesce(p_limit, 25), 1), 100);
  v_cursor record;
  v_rows jsonb;
  v_count integer;
  v_items jsonb;
  v_next text := null;
  v_last jsonb;
begin
  denied := private.cylinder_authorize(p_actor, p_session, p_organization, 'trip.read');
  if denied is not null then return jsonb_build_object('code', denied); end if;
  denied := private.cylinder_authorize(p_actor, p_session, p_organization, 'customer.read');
  if denied is not null then return jsonb_build_object('code', denied); end if;
  select * into v_cursor from private.cursor_decode(p_cursor);
  if not v_cursor.valid then
    return jsonb_build_object('code', 'VALIDATION_FAILED', 'fields', private.field_error('cursor', 'Página inválida.'));
  end if;
  if not exists (select 1 from public.customer_sites s where s.id = p_site and s.organization_id = p_organization) then return jsonb_build_object('code', 'NOT_FOUND'); end if;

  select jsonb_agg(jsonb_build_object('k', f.k, 'i', f.trip_id, 'item', private.trip_list_item((select tr from public.trips tr where tr.id = f.trip_id)) || jsonb_build_object('stop_status', f.stop_status)) order by f.k desc, f.trip_id desc) into v_rows
    from (select distinct on (t.id) t.id as trip_id, s.status as stop_status, lpad(t.number::text, 10, '0') as k
            from public.trip_stops s join public.trips t on t.id = s.trip_id
           where s.site_id = p_site and s.organization_id = p_organization and s.status <> 'removed'
             and (p_cursor is null or (lpad(t.number::text, 10, '0'), t.id) < (v_cursor.sort_key, v_cursor.row_id))
           order by t.id, s.position) f
   where true;
  -- A página corta o excesso depois de ordenar pela chave (distinct on exige a ordenação por viagem acima).
  v_rows := coalesce((select jsonb_agg(e.value order by e.value ->> 'k' desc, e.value ->> 'i' desc) from jsonb_array_elements(coalesce(v_rows, '[]'::jsonb)) e), '[]'::jsonb);
  v_count := jsonb_array_length(v_rows);
  select coalesce(jsonb_agg(e.value -> 'item' order by e.ord), '[]'::jsonb) into v_items from jsonb_array_elements(v_rows) with ordinality as e(value, ord) where e.ord <= v_limit;
  if v_count > v_limit then
    v_last := v_rows -> (v_limit - 1);
    v_next := private.cursor_encode(v_last ->> 'k', (v_last ->> 'i')::uuid);
  end if;
  return jsonb_build_object('code', 'LISTED', 'items', v_items, 'next', v_next);
end $$;

revoke all on function
  public.trip_history(uuid, uuid, uuid, uuid, text, date, date, text, text, integer),
  public.trips_of_cylinder(uuid, uuid, uuid, uuid, text, integer),
  public.trips_of_site(uuid, uuid, uuid, uuid, text, integer) from public, anon, authenticated;
grant execute on function
  public.trip_history(uuid, uuid, uuid, uuid, text, date, date, text, text, integer),
  public.trips_of_cylinder(uuid, uuid, uuid, uuid, text, integer),
  public.trips_of_site(uuid, uuid, uuid, uuid, text, integer) to service_role;
