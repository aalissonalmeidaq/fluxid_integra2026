-- Spec 008, US3: chegada e entrega por parada, divergência e correção (RF-013 a RF-017, RF-024, RF-032; research.md, decisões 7 e 8).
-- O NOME e a FUNÇÃO do recebedor, a posição e as justificativas por cilindro ficam SÓ em trip_deliveries; evento e auditoria guardam
-- contagens, `has_recipient` e `outside_geofence` (CA-007). A leitura (get_trip) devolve "(restrito)" a quem não tem trip.recipient.

-- Comparação com a geocerca ativa da unidade (Spec 007): nulo se não há geocerca ativa ou posição; verdadeiro se o ponto está dentro de
-- alguma; falso se está fora de todas. A borda conta como dentro.
create function private.point_inside_site_geofence(p_site uuid, p_latitude numeric, p_longitude numeric)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare
  v_point extensions.geography;
  v_has boolean;
begin
  if p_latitude is null or p_longitude is null then return null; end if;
  select exists (select 1 from public.geofences g where g.site_id = p_site and g.status = 'active') into v_has;
  if not v_has then return null; end if;
  v_point := extensions.st_setsrid(extensions.st_makepoint(p_longitude, p_latitude), 4326)::extensions.geography;
  return exists (
    select 1 from public.geofences g
     where g.site_id = p_site and g.status = 'active'
       and case g.shape when 'circle' then extensions.st_dwithin(g.center, v_point, g.radius_m) else extensions.st_covers(g.area, v_point) end);
end $$;

create function public.arrive_stop(p_actor uuid, p_session uuid, p_organization uuid, p_request uuid, p_trip uuid, p_stop uuid, p_arrived_at timestamptz)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  denied text;
  replay jsonb;
  refusal jsonb;
  v_trip public.trips;
  v_stop public.trip_stops;
  v_when timestamptz := coalesce(p_arrived_at, now());
  v_out_of_order boolean;
  v_result jsonb;
begin
  denied := private.cylinder_authorize(p_actor, p_session, p_organization, 'trip.operate');
  if denied is not null then return jsonb_build_object('code', denied); end if;
  replay := private.trip_replay(p_organization, p_request, 'arrive_stop', p_trip);
  if replay is not null then return replay; end if;
  select t.* into v_trip from public.trips t where t.id = p_trip and t.organization_id = p_organization for update;
  if not found then return jsonb_build_object('code', 'NOT_FOUND'); end if;
  refusal := private.trip_expect(v_trip, 'in_progress', 'in_progress');
  if refusal is not null then return refusal; end if;
  select s.* into v_stop from public.trip_stops s where s.id = p_stop and s.trip_id = p_trip and s.organization_id = p_organization for update;
  if not found or v_stop.status = 'removed' then return jsonb_build_object('code', 'NOT_FOUND', 'entity', 'stop'); end if;
  if v_stop.status in ('delivered', 'with_divergence') then return jsonb_build_object('code', 'STOP_CLOSED'); end if;
  if v_stop.status <> 'pending' then return jsonb_build_object('code', 'INVALID_TRANSITION', 'from', v_stop.status, 'to', 'on_site'); end if;
  if v_when > now() + interval '1 minute' then
    return jsonb_build_object('code', 'VALIDATION_FAILED', 'fields', private.field_error('arrived_at', 'O horário da chegada não pode estar no futuro.'));
  end if;

  -- Chegada em qualquer ordem (RF-013): fora da ordem planejada grava a marca, sem mudar a posição.
  v_out_of_order := exists (select 1 from public.trip_stops o where o.trip_id = p_trip and o.status = 'pending' and o.position < v_stop.position);
  update public.trip_stops set status = 'on_site', arrived_at = v_when, arrived_by = p_actor, out_of_order = v_out_of_order where id = p_stop;
  perform private.append_trip_event(p_trip, p_organization, 'stop_arrived', p_actor, p_session, null,
    jsonb_build_object('stop_id', p_stop, 'position', v_stop.position, 'out_of_order', v_out_of_order));
  perform private.write_audit_event(p_organization, p_actor, p_session, 'trip.arrive_stop', 'trip', p_trip::text, 'success', null, null,
    jsonb_build_object('trip_id', p_trip, 'stop_id', p_stop, 'out_of_order', v_out_of_order));
  v_result := jsonb_build_object('code', 'ARRIVED', 'out_of_order', v_out_of_order);
  return private.trip_remember(p_organization, p_request, 'arrive_stop', p_trip, v_result);
end $$;

-- Entrega por parada inteira (RF-013): um registro com o resultado de cada cilindro previsto. Com `p_supersedes`, é a correção de um
-- registro anterior (novo registro; o original fica intacto, RF-015).
create function public.register_delivery(
  p_actor uuid, p_session uuid, p_organization uuid, p_request uuid, p_trip uuid, p_stop uuid, p_delivered_at timestamptz, p_recipient_name text,
  p_recipient_role text, p_latitude numeric, p_longitude numeric, p_at_site_address boolean, p_results jsonb, p_supersedes uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  denied text;
  replay jsonb;
  refusal jsonb;
  v_trip public.trips;
  v_stop public.trip_stops;
  v_name text := btrim(coalesce(p_recipient_name, ''));
  v_role text := nullif(btrim(coalesce(p_recipient_role, '')), '');
  v_errors jsonb := '[]'::jsonb;
  v_prev public.trip_deliveries;
  v_latest uuid;
  v_expected uuid[];
  v_given uuid[];
  v_entry jsonb;
  v_item public.trip_items;
  v_reason text;
  v_delivered_ids uuid[] := '{}';
  v_missing integer;
  v_outside boolean;
  v_new_status text;
  v_delivery uuid;
  v_n_delivered integer := 0;
  v_n_not integer := 0;
  v_results jsonb := '[]'::jsonb;
  v_result jsonb;
  v_event text;
begin
  denied := private.cylinder_authorize(p_actor, p_session, p_organization, 'trip.operate');
  if denied is not null then return jsonb_build_object('code', denied); end if;
  replay := private.trip_replay(p_organization, p_request, 'register_delivery', p_trip);
  if replay is not null then return replay; end if;
  select t.* into v_trip from public.trips t where t.id = p_trip and t.organization_id = p_organization for update;
  if not found then return jsonb_build_object('code', 'NOT_FOUND'); end if;
  refusal := private.trip_expect(v_trip, 'in_progress', 'in_progress');
  if refusal is not null then return refusal; end if;
  select s.* into v_stop from public.trip_stops s where s.id = p_stop and s.trip_id = p_trip and s.organization_id = p_organization for update;
  if not found or v_stop.status = 'removed' then return jsonb_build_object('code', 'NOT_FOUND', 'entity', 'stop'); end if;

  -- Estado da parada: o registro original só vale com a parada no local; a correção, com a parada já fechada.
  if p_supersedes is null then
    if v_stop.status in ('delivered', 'with_divergence') then return jsonb_build_object('code', 'STOP_CLOSED'); end if;
    if v_stop.status <> 'on_site' then return jsonb_build_object('code', 'INVALID_TRANSITION', 'from', v_stop.status, 'to', 'delivered'); end if;
  else
    if v_stop.status not in ('delivered', 'with_divergence') then return jsonb_build_object('code', 'INVALID_TRANSITION', 'from', v_stop.status, 'to', 'delivered'); end if;
    select d.id into v_latest from public.trip_deliveries d
     where d.stop_id = p_stop and not exists (select 1 from public.trip_deliveries n where n.supersedes_id = d.id) order by d.recorded_at desc, d.id limit 1;
    select d.* into v_prev from public.trip_deliveries d where d.id = p_supersedes and d.stop_id = p_stop;
    if not found then return jsonb_build_object('code', 'NOT_FOUND', 'entity', 'delivery'); end if;
    if v_latest is distinct from p_supersedes then
      return jsonb_build_object('code', 'VALIDATION_FAILED', 'fields', private.field_error('supersedes_id', 'Este registro já foi corrigido. Corrija o mais recente.'));
    end if;
  end if;

  -- Campos (RF-014, RF-017): recebedor, horário e posição.
  if char_length(v_name) not between 2 and 120 then v_errors := v_errors || private.field_error('recipient_name', 'Informe o nome de quem recebeu, de 2 a 120 caracteres.'); end if;
  if v_role is not null and char_length(v_role) > 80 then v_errors := v_errors || private.field_error('recipient_role', 'Use até 80 caracteres na função.'); end if;
  if p_delivered_at is null then v_errors := v_errors || private.field_error('delivered_at', 'Informe o horário da entrega.');
  elsif p_delivered_at > now() + interval '1 minute' then v_errors := v_errors || private.field_error('delivered_at', 'O horário da entrega não pode estar no futuro.'); end if;
  if (p_latitude is null) <> (p_longitude is null) then v_errors := v_errors || private.field_error('latitude', 'Informe a latitude e a longitude juntas, ou deixe as duas em branco.');
  elsif p_latitude is not null and (p_latitude not between -90 and 90 or p_longitude not between -180 and 180) then v_errors := v_errors || private.field_error('latitude', 'A posição está fora do intervalo válido.'); end if;
  if p_results is null or jsonb_typeof(p_results) <> 'array' then v_errors := v_errors || private.field_error('results', 'Informe o resultado de cada cilindro.'); end if;
  if jsonb_array_length(v_errors) > 0 then return jsonb_build_object('code', 'VALIDATION_FAILED', 'fields', v_errors); end if;

  -- Cilindros esperados: no registro original, todo item em trânsito da parada; na correção, os que ficaram sem entregar.
  select coalesce(array_agg(i.id order by i.id), '{}') into v_expected from public.trip_items i
   where i.stop_id = p_stop and i.item_status = case when p_supersedes is null then 'in_transit' else 'not_delivered' end;
  select coalesce(array_agg((e ->> 'item_id')::uuid order by (e ->> 'item_id')::uuid), '{}') into v_given from jsonb_array_elements(p_results) e;
  if exists (select 1 from unnest(v_given) g where not (g = any(v_expected))) then
    return jsonb_build_object('code', 'VALIDATION_FAILED', 'fields', private.field_error('results', 'Há cilindro que não estava previsto nesta parada.'));
  end if;
  if (select count(*) from unnest(v_given)) <> (select count(distinct g) from unnest(v_given) g) then
    return jsonb_build_object('code', 'VALIDATION_FAILED', 'fields', private.field_error('results', 'O mesmo cilindro aparece mais de uma vez.'));
  end if;
  if p_supersedes is null and array_length(v_expected, 1) is distinct from array_length(v_given, 1) then
    return jsonb_build_object('code', 'VALIDATION_FAILED', 'fields', private.field_error('results', 'Informe o resultado de todos os cilindros da parada.'));
  end if;
  for v_entry in select e from jsonb_array_elements(p_results) e loop
    if jsonb_typeof(v_entry -> 'delivered') <> 'boolean' then
      return jsonb_build_object('code', 'VALIDATION_FAILED', 'fields', private.field_error('results', 'Cada cilindro precisa de um resultado: entregue ou não.'));
    end if;
    v_reason := nullif(btrim(coalesce(v_entry ->> 'reason', '')), '');
    if not (v_entry ->> 'delivered')::boolean and (v_reason is null or char_length(v_reason) not between 5 and 500) then
      return jsonb_build_object('code', 'VALIDATION_FAILED', 'fields', private.field_error('results.' || (v_entry ->> 'item_id'), 'Explique por que não foi entregue, em 5 a 500 caracteres.'));
    end if;
  end loop;

  v_outside := private.point_inside_site_geofence(v_stop.site_id, p_latitude, p_longitude);
  if v_outside is not null then v_outside := not v_outside; end if;

  -- Efeitos sobre os itens e os cilindros.
  perform 1 from public.cylinders c where c.id in (select i.cylinder_id from public.trip_items i where i.id = any(v_given)) order by c.id for update;
  for v_entry in select e from jsonb_array_elements(p_results) e order by e ->> 'item_id' loop
    select i.* into v_item from public.trip_items i where i.id = (v_entry ->> 'item_id')::uuid;
    v_reason := nullif(btrim(coalesce(v_entry ->> 'reason', '')), '');
    if (v_entry ->> 'delivered')::boolean then
      update public.trip_items set item_status = 'delivered', divergence_reason = null, updated_at = now() where id = v_item.id;
      update public.cylinders set custody_status = 'at_customer', custody_site_id = v_stop.site_id, version = version + 1, updated_at = now() where id = v_item.cylinder_id;
      perform private.append_cylinder_event(v_item.cylinder_id, p_organization, 'trip_delivered', p_actor, p_session, null,
        jsonb_build_object('trip_id', p_trip, 'trip_number', v_trip.number, 'site_id', v_stop.site_id));
      v_n_delivered := v_n_delivered + 1;
      v_results := v_results || jsonb_build_array(jsonb_build_object('item_id', v_item.id, 'delivered', true));
    else
      update public.trip_items set item_status = 'not_delivered', divergence_reason = v_reason, updated_at = now() where id = v_item.id;
      v_n_not := v_n_not + 1;
      v_results := v_results || jsonb_build_array(jsonb_build_object('item_id', v_item.id, 'delivered', false, 'reason', v_reason));
    end if;
  end loop;

  select count(*) into v_missing from public.trip_items i where i.stop_id = p_stop and i.item_status in ('in_transit', 'not_delivered');
  v_new_status := case when v_missing = 0 then 'delivered' else 'with_divergence' end;
  update public.trip_stops set status = v_new_status, closed_at = now(), closed_by = p_actor where id = p_stop;

  insert into public.trip_deliveries (organization_id, stop_id, request_id, delivered_at, recipient_name, recipient_role, latitude, longitude, at_site_address, outside_geofence,
                                      results, supersedes_id, recorded_by)
  values (p_organization, p_stop, p_request, p_delivered_at, v_name, v_role, p_latitude, p_longitude, coalesce(p_at_site_address, false), v_outside, v_results, p_supersedes, p_actor)
  returning id into v_delivery;

  v_event := case when p_supersedes is null then 'delivery_registered' else 'delivery_corrected' end;
  perform private.append_trip_event(p_trip, p_organization, v_event, p_actor, p_session, null,
    jsonb_build_object('stop_id', p_stop, 'position', v_stop.position, 'delivered', v_n_delivered, 'not_delivered', v_n_not, 'has_recipient', true,
                       'outside_geofence', v_outside, 'stop_status', v_new_status));
  perform private.write_audit_event(p_organization, p_actor, p_session, case when p_supersedes is null then 'trip.deliver' else 'trip.correct_delivery' end, 'trip', p_trip::text, 'success', null, null,
    jsonb_build_object('trip_id', p_trip, 'stop_id', p_stop, 'delivered', v_n_delivered, 'not_delivered', v_n_not, 'has_recipient', true, 'outside_geofence', v_outside));
  v_result := jsonb_build_object('code', 'DELIVERED', 'delivery_id', v_delivery, 'stop_status', v_new_status, 'outside_geofence', v_outside);
  return private.trip_remember(p_organization, p_request, 'register_delivery', p_trip, v_result);
end $$;

revoke all on function private.point_inside_site_geofence(uuid, numeric, numeric) from public, anon, authenticated;
revoke all on function
  public.arrive_stop(uuid, uuid, uuid, uuid, uuid, uuid, timestamptz),
  public.register_delivery(uuid, uuid, uuid, uuid, uuid, uuid, timestamptz, text, text, numeric, numeric, boolean, jsonb, uuid) from public, anon, authenticated;
grant execute on function
  public.arrive_stop(uuid, uuid, uuid, uuid, uuid, uuid, timestamptz),
  public.register_delivery(uuid, uuid, uuid, uuid, uuid, uuid, timestamptz, text, text, numeric, numeric, boolean, jsonb, uuid) to service_role;
