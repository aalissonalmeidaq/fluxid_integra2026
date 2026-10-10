-- Spec 008, RF-015 e RF-013: a correção de uma entrega exige justificativa (5 a 500 caracteres) e a posição é por coordenadas ou no
-- endereço da unidade, nunca as duas. O servidor e o banco repetem as regras do formulário.
--
-- A justificativa vive no registro de correção (`correction_reason`) e no evento `delivery_corrected` da viagem, que só quem tem
-- `trip.history` lê. A auditoria registra apenas que houve justificativa, e nunca o texto nem o nome do recebedor.

alter table public.trip_deliveries add column correction_reason text;

alter table public.trip_deliveries
  add constraint trip_deliveries_correction_reason_check check (
    (supersedes_id is null and correction_reason is null)
    or (supersedes_id is not null and correction_reason is not null
        and char_length(correction_reason) between 5 and 500
        and correction_reason = btrim(correction_reason))),
  add constraint trip_deliveries_position_exclusive_check check (not (at_site_address and (latitude is not null or longitude is not null)));

-- A função muda de assinatura (novo parâmetro), então a antiga sai: não pode restar um caminho que corrija sem justificativa.
drop function public.register_delivery(uuid, uuid, uuid, uuid, uuid, uuid, timestamptz, text, text, numeric, numeric, boolean, jsonb, uuid);

create function public.register_delivery(
  p_actor uuid, p_session uuid, p_organization uuid, p_request uuid, p_trip uuid, p_stop uuid, p_delivered_at timestamptz, p_recipient_name text,
  p_recipient_role text, p_latitude numeric, p_longitude numeric, p_at_site_address boolean, p_results jsonb, p_supersedes uuid, p_correction_reason text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  denied text;
  replay jsonb;
  refusal jsonb;
  v_trip public.trips;
  v_stop public.trip_stops;
  v_name text := btrim(coalesce(p_recipient_name, ''));
  v_role text := nullif(btrim(coalesce(p_recipient_role, '')), '');
  v_corr text := nullif(btrim(regexp_replace(coalesce(p_correction_reason, ''), '\s+', ' ', 'g')), '');
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
  if coalesce(p_at_site_address, false) and (p_latitude is not null or p_longitude is not null) then
    v_errors := v_errors || private.field_error('at_site_address', 'Escolha só uma forma de informar a posição: as coordenadas ou no endereço da unidade.');
  end if;
  if p_supersedes is not null and (v_corr is null or char_length(v_corr) not between 5 and 500) then
    v_errors := v_errors || private.field_error('correction_reason', 'Explique por que corrige a entrega, em 5 a 500 caracteres.');
  elsif p_supersedes is null and v_corr is not null then
    v_errors := v_errors || private.field_error('correction_reason', 'A justificativa só vale na correção de uma entrega.');
  end if;
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
                                      results, supersedes_id, correction_reason, recorded_by)
  values (p_organization, p_stop, p_request, p_delivered_at, v_name, v_role, p_latitude, p_longitude, coalesce(p_at_site_address, false), v_outside, v_results, p_supersedes, v_corr, p_actor)
  returning id into v_delivery;

  v_event := case when p_supersedes is null then 'delivery_registered' else 'delivery_corrected' end;
  perform private.append_trip_event(p_trip, p_organization, v_event, p_actor, p_session, v_corr,
    jsonb_build_object('stop_id', p_stop, 'position', v_stop.position, 'delivered', v_n_delivered, 'not_delivered', v_n_not, 'has_recipient', true,
                       'outside_geofence', v_outside, 'stop_status', v_new_status));
  perform private.write_audit_event(p_organization, p_actor, p_session, case when p_supersedes is null then 'trip.deliver' else 'trip.correct_delivery' end, 'trip', p_trip::text, 'success', null, null,
    jsonb_build_object('trip_id', p_trip, 'stop_id', p_stop, 'delivered', v_n_delivered, 'not_delivered', v_n_not, 'has_recipient', true, 'outside_geofence', v_outside, 'has_correction_reason', v_corr is not null));
  v_result := jsonb_build_object('code', 'DELIVERED', 'delivery_id', v_delivery, 'stop_status', v_new_status, 'outside_geofence', v_outside);
  return private.trip_remember(p_organization, p_request, 'register_delivery', p_trip, v_result);
end $$;

revoke all on function
  public.register_delivery(uuid, uuid, uuid, uuid, uuid, uuid, timestamptz, text, text, numeric, numeric, boolean, jsonb, uuid, text) from public, anon, authenticated;
grant execute on function
  public.register_delivery(uuid, uuid, uuid, uuid, uuid, uuid, timestamptz, text, text, numeric, numeric, boolean, jsonb, uuid, text) to service_role;
