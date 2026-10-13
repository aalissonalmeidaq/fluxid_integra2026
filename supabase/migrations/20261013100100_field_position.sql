-- Spec 009, US2: posição por GPS na chegada e na entrega (RF-009 a RF-015, RN-003, RN-004). A chegada não guardava posição alguma; agora guarda
-- as coordenadas, a precisão, a origem ("gps" ou "informada"), o horário da leitura e se está fora da geocerca da unidade. A entrega ganha a
-- precisão, a origem ("gps", "informada" ou "endereço da unidade") e o horário da leitura. A posição continua OPCIONAL e a precisão ruim só marca
-- a faixa, nunca bloqueia. O evento e a auditoria guardam a origem e a faixa de precisão, NUNCA as coordenadas.
--
-- As linhas anteriores da entrega ficam sem origem (o histórico é imutável): a restrição aceita origem nula.

alter table public.trip_stops
  add column arrival_latitude numeric(9,6),
  add column arrival_longitude numeric(9,6),
  add column arrival_accuracy_m numeric(8,1),
  add column arrival_position_source text,
  add column arrival_position_read_at timestamptz,
  add column arrival_outside_geofence boolean,
  add constraint trip_stops_arrival_position_check check (
    (arrival_latitude is null and arrival_longitude is null and arrival_accuracy_m is null and arrival_position_source is null
       and arrival_position_read_at is null and arrival_outside_geofence is null)
    or (arrival_latitude between -90 and 90 and arrival_longitude between -180 and 180 and arrival_position_source in ('gps', 'typed') and arrived_at is not null
        and (arrival_accuracy_m is null or arrival_accuracy_m between 0 and 100000)
        and (arrival_position_read_at is null or arrival_position_source = 'gps')));

alter table public.trip_deliveries
  add column accuracy_m numeric(8,1),
  add column position_source text,
  add column position_read_at timestamptz,
  add constraint trip_deliveries_position_meta_check check (
    (position_source is null and accuracy_m is null and position_read_at is null)
    or (position_source = 'site_address' and at_site_address and accuracy_m is null and position_read_at is null)
    or (position_source in ('gps', 'typed') and latitude is not null and (accuracy_m is null or accuracy_m between 0 and 100000)
        and (position_read_at is null or position_source = 'gps')));

-- As funções ganham parâmetros (com padrão nulo): as chamadas da Spec 008 continuam valendo, mas as assinaturas antigas saem, para não restar
-- duas funções com o mesmo nome.
drop function public.arrive_stop(uuid, uuid, uuid, uuid, uuid, uuid, timestamptz);
drop function public.register_delivery(uuid, uuid, uuid, uuid, uuid, uuid, timestamptz, text, text, numeric, numeric, boolean, jsonb, uuid, text);

create function public.arrive_stop(p_actor uuid, p_session uuid, p_organization uuid, p_request uuid, p_trip uuid, p_stop uuid, p_arrived_at timestamptz,
  p_latitude numeric default null, p_longitude numeric default null, p_accuracy_m numeric default null, p_position_source text default null,
  p_position_read_at timestamptz default null)
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
  v_source text;
  v_band text;
  v_outside boolean;
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

  -- Posição lida (Spec 009, RF-009 a RF-014): em par e dentro do intervalo; a origem corresponde ao dado; o horário da leitura só vale com "gps",
  -- sem futuro e com no máximo 10 minutos. A posição é opcional e a precisão ruim (acima de 100 m) só marca a faixa "low", nunca bloqueia.
  if (p_latitude is null) <> (p_longitude is null) then
    return jsonb_build_object('code', 'VALIDATION_FAILED', 'fields', private.field_error('latitude', 'Informe a latitude e a longitude juntas, ou deixe as duas em branco.'));
  elsif p_latitude is not null and (p_latitude not between -90 and 90 or p_longitude not between -180 and 180) then
    return jsonb_build_object('code', 'VALIDATION_FAILED', 'fields', private.field_error('latitude', 'A posição está fora do intervalo válido.'));
  end if;
  v_source := case when p_latitude is not null then coalesce(p_position_source, 'typed') else null end;
  if p_position_source is not null and (p_position_source not in ('gps', 'typed') or v_source is distinct from p_position_source) then
    return jsonb_build_object('code', 'VALIDATION_FAILED', 'fields', private.field_error('position_source', 'A origem da posição não confere com os dados.'));
  end if;
  if p_accuracy_m is not null and (p_latitude is null or p_accuracy_m not between 0 and 100000) then
    return jsonb_build_object('code', 'VALIDATION_FAILED', 'fields', private.field_error('accuracy_m', 'A precisão vai de 0 a 100000 metros e só vale com a posição.'));
  end if;
  if p_position_read_at is not null and (v_source is distinct from 'gps' or p_position_read_at > now() + interval '1 minute' or p_position_read_at < now() - interval '10 minutes') then
    return jsonb_build_object('code', 'VALIDATION_FAILED', 'fields', private.field_error('position_read_at', 'O horário da leitura da posição é inválido ou está velho demais.'));
  end if;
  v_band := case when p_accuracy_m is null then null when p_accuracy_m > 100 then 'low' else 'good' end;
  v_outside := private.point_inside_site_geofence(v_stop.site_id, p_latitude, p_longitude);
  if v_outside is not null then v_outside := not v_outside; end if;

  -- Chegada em qualquer ordem (RF-013): fora da ordem planejada grava a marca, sem mudar a posição.
  v_out_of_order := exists (select 1 from public.trip_stops o where o.trip_id = p_trip and o.status = 'pending' and o.position < v_stop.position);
  update public.trip_stops set status = 'on_site', arrived_at = v_when, arrived_by = p_actor, out_of_order = v_out_of_order,
         arrival_latitude = p_latitude, arrival_longitude = p_longitude, arrival_accuracy_m = p_accuracy_m, arrival_position_source = v_source,
         arrival_position_read_at = p_position_read_at, arrival_outside_geofence = v_outside
   where id = p_stop;
  perform private.append_trip_event(p_trip, p_organization, 'stop_arrived', p_actor, p_session, null,
    jsonb_build_object('stop_id', p_stop, 'position', v_stop.position, 'out_of_order', v_out_of_order, 'position_source', v_source, 'accuracy_band', v_band, 'outside_geofence', v_outside));
  perform private.write_audit_event(p_organization, p_actor, p_session, 'trip.arrive_stop', 'trip', p_trip::text, 'success', null, null,
    jsonb_build_object('trip_id', p_trip, 'stop_id', p_stop, 'out_of_order', v_out_of_order, 'position_source', v_source, 'accuracy_band', v_band, 'outside_geofence', v_outside));
  v_result := jsonb_build_object('code', 'ARRIVED', 'out_of_order', v_out_of_order, 'outside_geofence', v_outside);
  return private.trip_remember(p_organization, p_request, 'arrive_stop', p_trip, v_result);
end $$;

create function public.register_delivery(
  p_actor uuid, p_session uuid, p_organization uuid, p_request uuid, p_trip uuid, p_stop uuid, p_delivered_at timestamptz, p_recipient_name text,
  p_recipient_role text, p_latitude numeric, p_longitude numeric, p_at_site_address boolean, p_results jsonb, p_supersedes uuid, p_correction_reason text,
  p_accuracy_m numeric default null, p_position_source text default null, p_position_read_at timestamptz default null)
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
  v_source text;
  v_sources jsonb := '{}'::jsonb;
  v_pos_source text;
  v_band text;
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
  -- Origem, precisão e horário da leitura da posição (Spec 009, RF-010, RF-014): a origem corresponde ao dado; o horário só vale com "gps".
  if p_position_source is not null and not (
       (coalesce(p_at_site_address, false) and p_position_source = 'site_address')
       or (not coalesce(p_at_site_address, false) and p_latitude is not null and p_position_source in ('gps', 'typed'))) then
    v_errors := v_errors || private.field_error('position_source', 'A origem da posição não confere com os dados.');
  end if;
  v_pos_source := case when coalesce(p_at_site_address, false) then 'site_address' when p_latitude is not null then coalesce(p_position_source, 'typed') else null end;
  if p_accuracy_m is not null and (p_latitude is null or p_accuracy_m not between 0 and 100000) then
    v_errors := v_errors || private.field_error('accuracy_m', 'A precisão vai de 0 a 100000 metros e só vale com a posição.');
  end if;
  if p_position_read_at is not null and (v_pos_source is distinct from 'gps' or p_position_read_at > now() + interval '1 minute' or p_position_read_at < now() - interval '10 minutes') then
    v_errors := v_errors || private.field_error('position_read_at', 'O horário da leitura da posição é inválido ou está velho demais.');
  end if;
  v_band := case when p_accuracy_m is null then null when p_accuracy_m > 100 then 'low' else 'good' end;
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
    -- Spec 009 (RF-001a): o método de leitura de cada cilindro entregue é um dos quatro valores; sem informar, é "manual".
    if (v_entry ->> 'delivered')::boolean and v_entry ? 'source' and jsonb_typeof(v_entry -> 'source') <> 'null'
       and (jsonb_typeof(v_entry -> 'source') <> 'string' or (v_entry ->> 'source') <> all (array['manual', 'typed', 'camera', 'nfc'])) then
      return jsonb_build_object('code', 'VALIDATION_FAILED', 'fields', private.field_error('results.' || (v_entry ->> 'item_id') || '.source', 'Método de leitura inválido.'));
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
      v_source := coalesce(nullif(v_entry ->> 'source', ''), 'manual');
      v_sources := jsonb_set(v_sources, array[v_source], to_jsonb(coalesce((v_sources ->> v_source)::integer, 0) + 1));
      v_results := v_results || jsonb_build_array(jsonb_build_object('item_id', v_item.id, 'delivered', true, 'source', v_source));
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
                                      results, supersedes_id, correction_reason, recorded_by, accuracy_m, position_source, position_read_at)
  values (p_organization, p_stop, p_request, p_delivered_at, v_name, v_role, p_latitude, p_longitude, coalesce(p_at_site_address, false), v_outside, v_results, p_supersedes, v_corr, p_actor, p_accuracy_m, v_pos_source, p_position_read_at)
  returning id into v_delivery;

  v_event := case when p_supersedes is null then 'delivery_registered' else 'delivery_corrected' end;
  perform private.append_trip_event(p_trip, p_organization, v_event, p_actor, p_session, v_corr,
    jsonb_build_object('stop_id', p_stop, 'position', v_stop.position, 'delivered', v_n_delivered, 'not_delivered', v_n_not, 'has_recipient', true,
                       'outside_geofence', v_outside, 'stop_status', v_new_status, 'sources', v_sources, 'position_source', v_pos_source, 'accuracy_band', v_band));
  perform private.write_audit_event(p_organization, p_actor, p_session, case when p_supersedes is null then 'trip.deliver' else 'trip.correct_delivery' end, 'trip', p_trip::text, 'success', null, null,
    jsonb_build_object('trip_id', p_trip, 'stop_id', p_stop, 'delivered', v_n_delivered, 'not_delivered', v_n_not, 'has_recipient', true, 'outside_geofence', v_outside, 'has_correction_reason', v_corr is not null, 'sources', v_sources, 'position_source', v_pos_source, 'accuracy_band', v_band));
  v_result := jsonb_build_object('code', 'DELIVERED', 'delivery_id', v_delivery, 'stop_status', v_new_status, 'outside_geofence', v_outside);
  return private.trip_remember(p_organization, p_request, 'register_delivery', p_trip, v_result);
end $$;

create or replace function public.get_trip(p_actor uuid, p_session uuid, p_organization uuid, p_trip uuid)
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
        'arrival', case when s.arrival_position_source is null then null else jsonb_build_object(
          'latitude', s.arrival_latitude, 'longitude', s.arrival_longitude, 'accuracy_m', s.arrival_accuracy_m, 'position_source', s.arrival_position_source,
          'position_read_at', s.arrival_position_read_at, 'outside_geofence', s.arrival_outside_geofence) end,
        'site', jsonb_build_object('id', cs.id, 'name', cs.name, 'city', cs.city, 'state', cs.state, 'customer_id', cu.id,
                                   'customer_name', coalesce(cu.trade_name, cu.legal_name))) order by s.position nulls last, s.id)
        from public.trip_stops s join public.customer_sites cs on cs.id = s.site_id join public.customers cu on cu.id = cs.customer_id
       where s.trip_id = t.id and s.status <> 'removed'), '[]'::jsonb),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id, 'stop_id', i.stop_id, 'item_status', i.item_status, 'lock_status', i.lock_status, 'checked_at', i.checked_at, 'check_source', i.check_source,
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
        'accuracy_m', d.accuracy_m, 'position_source', d.position_source, 'position_read_at', d.position_read_at,
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

-- O detalhe da viagem (já restrito a quem tem trip.read) passa a trazer a posição da chegada, a origem e a precisão da entrega e o método de
-- cada conferência. O nome do recebedor continua só com trip.recipient.

revoke all on function public.arrive_stop(uuid, uuid, uuid, uuid, uuid, uuid, timestamptz, numeric, numeric, numeric, text, timestamptz) from public, anon, authenticated;
grant execute on function public.arrive_stop(uuid, uuid, uuid, uuid, uuid, uuid, timestamptz, numeric, numeric, numeric, text, timestamptz) to service_role;
revoke all on function public.register_delivery(uuid, uuid, uuid, uuid, uuid, uuid, timestamptz, text, text, numeric, numeric, boolean, jsonb, uuid, text, numeric, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.register_delivery(uuid, uuid, uuid, uuid, uuid, uuid, timestamptz, text, text, numeric, numeric, boolean, jsonb, uuid, text, numeric, text, timestamptz)
  to service_role;
