-- Spec 007, US4: veículos com placa única, licenciamento calculado e situação operacional (RF-019 a RF-023, RF-038, CA-009).
-- A situação do licenciamento não é coluna: é calculada da data de vencimento e do dia de America/Sao_Paulo (research.md, decisão 9).
-- Placa, tipo e capacidade não são dados pessoais e podem aparecer no evento e na auditoria.

create function private.validity_status(p_due_on date, p_today date default null) returns text language sql stable set search_path = '' as $$
  select case
    when p_due_on is null then 'sem_data'
    when p_due_on < coalesce(p_today, (now() at time zone 'America/Sao_Paulo')::date) then 'vencido'
    when p_due_on - coalesce(p_today, (now() at time zone 'America/Sao_Paulo')::date) <= private.document_expiring_days() then 'a_vencer'
    else 'em_dia' end
$$;

create function private.validate_vehicle_fields(
  p_plate text, p_type text, p_type_detail text, p_brand text, p_model text, p_year integer, p_capacity integer, p_load numeric)
returns jsonb language plpgsql stable set search_path = '' as $$
declare
  errors jsonb := '[]'::jsonb;
  max_year integer := extract(year from (now() at time zone 'America/Sao_Paulo'))::integer + 1;
begin
  if private.normalize_plate(p_plate) is null then
    errors := errors || private.field_error('plate', 'Informe a placa no padrão ABC-1234 ou ABC1D23.');
  end if;
  if p_type is null or p_type not in ('truck', 'van', 'utility', 'other') then
    errors := errors || private.field_error('vehicle_type', 'Escolha o tipo do veículo.');
  elsif p_type = 'other' and (p_type_detail is null or char_length(btrim(p_type_detail)) not between 1 and 60) then
    errors := errors || private.field_error('vehicle_type_detail', 'Descreva o tipo em até 60 caracteres.');
  end if;
  if p_brand is not null and char_length(p_brand) > 60 then errors := errors || private.field_error('brand', 'Use até 60 caracteres na marca.'); end if;
  if p_model is not null and char_length(p_model) > 60 then errors := errors || private.field_error('model', 'Use até 60 caracteres no modelo.'); end if;
  if p_year is not null and p_year not between 1980 and max_year then
    errors := errors || private.field_error('manufacture_year', 'Informe o ano de 1980 até ' || max_year || '.');
  end if;
  if p_capacity is null or p_capacity not between 1 and 9999 then
    errors := errors || private.field_error('capacity_cylinders', 'Informe a capacidade em cilindros, de 1 a 9999.');
  end if;
  if p_load is not null and p_load <= 0 then errors := errors || private.field_error('max_load_kg', 'Informe a carga máxima maior que zero.'); end if;
  return errors;
end $$;

create function private.vehicle_json(v public.vehicles) returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'id', v.id, 'plate', v.plate, 'vehicle_type', v.vehicle_type, 'vehicle_type_detail', v.vehicle_type_detail, 'brand', v.brand, 'model', v.model,
    'manufacture_year', v.manufacture_year, 'capacity_cylinders', v.capacity_cylinders, 'max_load_kg', v.max_load_kg, 'licensing_due_on', v.licensing_due_on,
    'status', v.status, 'licensing_status', private.validity_status(v.licensing_due_on), 'version', v.version)
$$;

create function public.create_vehicle(
  p_actor uuid, p_session uuid, p_organization uuid, p_plate text, p_vehicle_type text, p_vehicle_type_detail text, p_brand text, p_model text,
  p_manufacture_year integer, p_capacity_cylinders integer, p_max_load_kg numeric, p_licensing_due_on date)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  denied text;
  errors jsonb;
  v_plate text := private.normalize_plate(p_plate);
  v_detail text := case when p_vehicle_type = 'other' then nullif(btrim(coalesce(p_vehicle_type_detail, '')), '') end;
  v_brand text := nullif(btrim(coalesce(p_brand, '')), '');
  v_model text := nullif(btrim(coalesce(p_model, '')), '');
  v_owner public.vehicles;
  v_id uuid;
begin
  denied := private.cylinder_authorize(p_actor, p_session, p_organization, 'vehicle.write');
  if denied is not null then return jsonb_build_object('code', denied); end if;
  errors := private.validate_vehicle_fields(p_plate, p_vehicle_type, v_detail, v_brand, v_model, p_manufacture_year, p_capacity_cylinders, p_max_load_kg);
  if jsonb_array_length(errors) > 0 then return jsonb_build_object('code', 'VALIDATION_FAILED', 'fields', errors); end if;

  perform pg_advisory_xact_lock(hashtextextended(p_organization::text || ':vehicle-plate:' || v_plate, 0));
  select v.* into v_owner from public.vehicles v where v.organization_id = p_organization and v.plate = v_plate;
  if found then return jsonb_build_object('code', 'PLATE_CONFLICT', 'vehicle_id', v_owner.id, 'plate', v_owner.plate); end if;

  insert into public.vehicles (organization_id, plate, vehicle_type, vehicle_type_detail, brand, model, manufacture_year, capacity_cylinders, max_load_kg, licensing_due_on, created_by)
  values (p_organization, v_plate, p_vehicle_type, v_detail, v_brand, v_model, p_manufacture_year, p_capacity_cylinders, p_max_load_kg, p_licensing_due_on, p_actor)
  returning id into v_id;
  perform private.append_registry_event('vehicle', v_id, p_organization, 'vehicle_created', p_actor, p_session, null,
    jsonb_build_object('plate', v_plate, 'vehicle_type', p_vehicle_type, 'capacity_cylinders', p_capacity_cylinders));
  perform private.write_audit_event(p_organization, p_actor, p_session, 'vehicle.create', 'vehicle', v_id::text, 'success', null, null,
    jsonb_build_object('vehicle_id', v_id, 'plate', v_plate));
  return jsonb_build_object('code', 'CREATED', 'vehicle_id', v_id, 'version', 1);
end $$;

create function public.update_vehicle(
  p_actor uuid, p_session uuid, p_organization uuid, p_vehicle uuid, p_expected_version bigint, p_plate text, p_vehicle_type text, p_vehicle_type_detail text,
  p_brand text, p_model text, p_manufacture_year integer, p_capacity_cylinders integer, p_max_load_kg numeric, p_licensing_due_on date, p_justification text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  denied text;
  errors jsonb;
  v_old public.vehicles;
  v_plate text := private.normalize_plate(p_plate);
  v_detail text := case when p_vehicle_type = 'other' then nullif(btrim(coalesce(p_vehicle_type_detail, '')), '') end;
  v_brand text := nullif(btrim(coalesce(p_brand, '')), '');
  v_model text := nullif(btrim(coalesce(p_model, '')), '');
  v_justification text := nullif(btrim(coalesce(p_justification, '')), '');
  v_owner public.vehicles;
  v_changes jsonb := '[]'::jsonb;
  v_new_version bigint;
begin
  denied := private.cylinder_authorize(p_actor, p_session, p_organization, 'vehicle.write');
  if denied is not null then return jsonb_build_object('code', denied); end if;
  select v.* into v_old from public.vehicles v where v.id = p_vehicle and v.organization_id = p_organization for update;
  if not found then return jsonb_build_object('code', 'NOT_FOUND'); end if;
  if v_old.version <> p_expected_version then return jsonb_build_object('code', 'VERSION_CONFLICT'); end if;
  if v_old.status = 'inactive' then return jsonb_build_object('code', 'INACTIVE_RECORD'); end if;

  errors := private.validate_vehicle_fields(p_plate, p_vehicle_type, v_detail, v_brand, v_model, p_manufacture_year, p_capacity_cylinders, p_max_load_kg);
  if jsonb_array_length(errors) > 0 then return jsonb_build_object('code', 'VALIDATION_FAILED', 'fields', errors); end if;
  if v_plate is distinct from v_old.plate then
    if v_justification is null or char_length(v_justification) not between 5 and 500 then return jsonb_build_object('code', 'JUSTIFICATION_REQUIRED'); end if;
    perform pg_advisory_xact_lock(hashtextextended(p_organization::text || ':vehicle-plate:' || v_plate, 0));
    select v.* into v_owner from public.vehicles v where v.organization_id = p_organization and v.plate = v_plate and v.id <> p_vehicle;
    if found then return jsonb_build_object('code', 'PLATE_CONFLICT', 'vehicle_id', v_owner.id, 'plate', v_owner.plate); end if;
  end if;

  if v_plate is distinct from v_old.plate then v_changes := v_changes || jsonb_build_array(jsonb_build_object('field', 'plate', 'old', v_old.plate, 'new', v_plate)); end if;
  if p_vehicle_type is distinct from v_old.vehicle_type then v_changes := v_changes || jsonb_build_array(jsonb_build_object('field', 'vehicle_type', 'old', v_old.vehicle_type, 'new', p_vehicle_type)); end if;
  if v_detail is distinct from v_old.vehicle_type_detail then v_changes := v_changes || jsonb_build_array(jsonb_build_object('field', 'vehicle_type_detail', 'old', v_old.vehicle_type_detail, 'new', v_detail)); end if;
  if v_brand is distinct from v_old.brand then v_changes := v_changes || jsonb_build_array(jsonb_build_object('field', 'brand', 'old', v_old.brand, 'new', v_brand)); end if;
  if v_model is distinct from v_old.model then v_changes := v_changes || jsonb_build_array(jsonb_build_object('field', 'model', 'old', v_old.model, 'new', v_model)); end if;
  if p_manufacture_year is distinct from v_old.manufacture_year then v_changes := v_changes || jsonb_build_array(jsonb_build_object('field', 'manufacture_year', 'old', v_old.manufacture_year, 'new', p_manufacture_year)); end if;
  if p_capacity_cylinders is distinct from v_old.capacity_cylinders then v_changes := v_changes || jsonb_build_array(jsonb_build_object('field', 'capacity_cylinders', 'old', v_old.capacity_cylinders, 'new', p_capacity_cylinders)); end if;
  if p_max_load_kg is distinct from v_old.max_load_kg then v_changes := v_changes || jsonb_build_array(jsonb_build_object('field', 'max_load_kg', 'old', v_old.max_load_kg, 'new', p_max_load_kg)); end if;
  if p_licensing_due_on is distinct from v_old.licensing_due_on then v_changes := v_changes || jsonb_build_array(jsonb_build_object('field', 'licensing_due_on', 'old', v_old.licensing_due_on, 'new', p_licensing_due_on)); end if;

  update public.vehicles
     set plate = v_plate, vehicle_type = p_vehicle_type, vehicle_type_detail = v_detail, brand = v_brand, model = v_model, manufacture_year = p_manufacture_year,
         capacity_cylinders = p_capacity_cylinders, max_load_kg = p_max_load_kg, licensing_due_on = p_licensing_due_on, version = version + 1, updated_at = now()
   where id = p_vehicle returning version into v_new_version;
  perform private.append_registry_event('vehicle', p_vehicle, p_organization, 'vehicle_updated', p_actor, p_session,
    case when v_plate is distinct from v_old.plate then v_justification end, jsonb_build_object('changes', v_changes));
  perform private.write_audit_event(p_organization, p_actor, p_session, 'vehicle.update', 'vehicle', p_vehicle::text, 'success', null, null,
    jsonb_build_object('vehicle_id', p_vehicle));
  return jsonb_build_object('code', 'UPDATED', 'version', v_new_version);
end $$;

-- Situação operacional (RF-021): disponível, em manutenção ou inativo. De "inativo" só se volta para "disponível"; a justificativa
-- é obrigatória ao ir para ou sair de "inativo".
create function public.change_vehicle_status(
  p_actor uuid, p_session uuid, p_organization uuid, p_vehicle uuid, p_expected_version bigint, p_status text, p_justification text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  denied text;
  v_old public.vehicles;
  v_justification text := nullif(btrim(coalesce(p_justification, '')), '');
  v_new_version bigint;
begin
  denied := private.cylinder_authorize(p_actor, p_session, p_organization, 'vehicle.deactivate');
  if denied is not null then return jsonb_build_object('code', denied); end if;
  if p_status is null or p_status not in ('available', 'maintenance', 'inactive') then
    return jsonb_build_object('code', 'VALIDATION_FAILED', 'fields', private.field_error('status', 'Situação desconhecida.'));
  end if;
  select v.* into v_old from public.vehicles v where v.id = p_vehicle and v.organization_id = p_organization for update;
  if not found then return jsonb_build_object('code', 'NOT_FOUND'); end if;
  if v_old.version <> p_expected_version then return jsonb_build_object('code', 'VERSION_CONFLICT'); end if;
  if v_old.status = p_status then
    return jsonb_build_object('code', case p_status when 'inactive' then 'ALREADY_INACTIVE' else 'VALIDATION_FAILED' end,
                              'fields', private.field_error('status', 'O veículo já está nesta situação.'));
  end if;
  if v_old.status = 'inactive' and p_status <> 'available' then
    return jsonb_build_object('code', 'VALIDATION_FAILED', 'fields', private.field_error('status', 'Um veículo inativo só volta para disponível.'));
  end if;
  if (p_status = 'inactive' or v_old.status = 'inactive') and (v_justification is null or char_length(v_justification) not between 5 and 500) then
    return jsonb_build_object('code', 'JUSTIFICATION_REQUIRED');
  end if;

  update public.vehicles
     set status = p_status, inactivated_at = case when p_status = 'inactive' then now() end, inactivated_by = case when p_status = 'inactive' then p_actor end,
         version = version + 1, updated_at = now()
   where id = p_vehicle returning version into v_new_version;
  perform private.append_registry_event('vehicle', p_vehicle, p_organization, 'vehicle_status_changed', p_actor, p_session, v_justification,
    jsonb_build_object('from', v_old.status, 'to', p_status));
  perform private.write_audit_event(p_organization, p_actor, p_session, 'vehicle.status_change', 'vehicle', p_vehicle::text, 'success', null, null,
    jsonb_build_object('vehicle_id', p_vehicle, 'from', v_old.status, 'to', p_status));
  return jsonb_build_object('code', 'STATUS_CHANGED', 'version', v_new_version, 'status', p_status);
end $$;

create function public.list_vehicles(
  p_actor uuid, p_session uuid, p_organization uuid, p_search text, p_status text, p_vehicle_type text, p_licensing_status text, p_sort text, p_cursor text, p_limit integer)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  denied text;
  v_status text := coalesce(p_status, 'active');
  v_sort text := coalesce(p_sort, 'plate');
  v_limit integer := least(greatest(coalesce(p_limit, 25), 1), 100);
  v_search text := nullif(btrim(coalesce(p_search, '')), '');
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_soon date := (now() at time zone 'America/Sao_Paulo')::date + private.document_expiring_days();
  v_cursor record;
  v_total bigint;
  v_rows jsonb;
  v_count integer;
  v_items jsonb;
  v_next text := null;
  v_last jsonb;
begin
  denied := private.cylinder_authorize(p_actor, p_session, p_organization, 'vehicle.read');
  if denied is not null then return jsonb_build_object('code', denied); end if;
  if v_status not in ('active', 'available', 'maintenance', 'inactive', 'all') then
    return jsonb_build_object('code', 'VALIDATION_FAILED', 'fields', private.field_error('status', 'Situação desconhecida.'));
  end if;
  if p_vehicle_type is not null and p_vehicle_type not in ('truck', 'van', 'utility', 'other') then
    return jsonb_build_object('code', 'VALIDATION_FAILED', 'fields', private.field_error('vehicle_type', 'Tipo desconhecido.'));
  end if;
  if p_licensing_status is not null and p_licensing_status not in ('em_dia', 'a_vencer', 'vencido', 'sem_data') then
    return jsonb_build_object('code', 'VALIDATION_FAILED', 'fields', private.field_error('licensing_status', 'Situação do licenciamento desconhecida.'));
  end if;
  if v_sort not in ('plate', 'plate_desc') then
    return jsonb_build_object('code', 'VALIDATION_FAILED', 'fields', private.field_error('sort', 'Ordenação desconhecida.'));
  end if;
  select * into v_cursor from private.cursor_decode(p_cursor);
  if not v_cursor.valid then
    return jsonb_build_object('code', 'VALIDATION_FAILED', 'fields', private.field_error('cursor', 'Página inválida.'));
  end if;

  select count(*) into v_total from public.vehicles v
   where v.organization_id = p_organization
     and (v_status = 'all' or (v_status = 'active' and v.status <> 'inactive') or v.status = v_status)
     and (p_vehicle_type is null or v.vehicle_type = p_vehicle_type)
     and (p_licensing_status is null
          or (p_licensing_status = 'sem_data' and v.licensing_due_on is null)
          or (p_licensing_status = 'vencido' and v.licensing_due_on < v_today)
          or (p_licensing_status = 'a_vencer' and v.licensing_due_on between v_today and v_soon)
          or (p_licensing_status = 'em_dia' and v.licensing_due_on > v_soon))
     and (v_search is null or lower(v.plate) like private.like_pattern(replace(replace(v_search, '-', ''), ' ', '')) or lower(coalesce(v.brand, '')) like private.like_pattern(v_search) or lower(coalesce(v.model, '')) like private.like_pattern(v_search));

  if v_sort = 'plate' then
    select jsonb_agg(jsonb_build_object('k', f.plate, 'i', f.id, 'item', private.vehicle_json(f)) order by f.plate, f.id) into v_rows
      from (select x.* from public.vehicles x
             where x.organization_id = p_organization
               and (v_status = 'all' or (v_status = 'active' and x.status <> 'inactive') or x.status = v_status)
               and (p_vehicle_type is null or x.vehicle_type = p_vehicle_type)
               and (p_licensing_status is null
                    or (p_licensing_status = 'sem_data' and x.licensing_due_on is null)
                    or (p_licensing_status = 'vencido' and x.licensing_due_on < v_today)
                    or (p_licensing_status = 'a_vencer' and x.licensing_due_on between v_today and v_soon)
                    or (p_licensing_status = 'em_dia' and x.licensing_due_on > v_soon))
               and (v_search is null or lower(x.plate) like private.like_pattern(replace(replace(v_search, '-', ''), ' ', '')) or lower(coalesce(x.brand, '')) like private.like_pattern(v_search) or lower(coalesce(x.model, '')) like private.like_pattern(v_search))
               and (p_cursor is null or (x.plate, x.id) > (v_cursor.sort_key, v_cursor.row_id))
             order by x.plate, x.id limit v_limit + 1) f;
  else
    select jsonb_agg(jsonb_build_object('k', f.plate, 'i', f.id, 'item', private.vehicle_json(f)) order by f.plate desc, f.id desc) into v_rows
      from (select x.* from public.vehicles x
             where x.organization_id = p_organization
               and (v_status = 'all' or (v_status = 'active' and x.status <> 'inactive') or x.status = v_status)
               and (p_vehicle_type is null or x.vehicle_type = p_vehicle_type)
               and (p_licensing_status is null
                    or (p_licensing_status = 'sem_data' and x.licensing_due_on is null)
                    or (p_licensing_status = 'vencido' and x.licensing_due_on < v_today)
                    or (p_licensing_status = 'a_vencer' and x.licensing_due_on between v_today and v_soon)
                    or (p_licensing_status = 'em_dia' and x.licensing_due_on > v_soon))
               and (v_search is null or lower(x.plate) like private.like_pattern(replace(replace(v_search, '-', ''), ' ', '')) or lower(coalesce(x.brand, '')) like private.like_pattern(v_search) or lower(coalesce(x.model, '')) like private.like_pattern(v_search))
               and (p_cursor is null or (x.plate, x.id) < (v_cursor.sort_key, v_cursor.row_id))
             order by x.plate desc, x.id desc limit v_limit + 1) f;
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

create function public.get_vehicle(p_actor uuid, p_session uuid, p_organization uuid, p_vehicle uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  denied text;
  v_veh public.vehicles;
begin
  denied := private.cylinder_authorize(p_actor, p_session, p_organization, 'vehicle.read');
  if denied is not null then return jsonb_build_object('code', denied); end if;
  select v.* into v_veh from public.vehicles v where v.id = p_vehicle and v.organization_id = p_organization;
  if not found then return jsonb_build_object('code', 'NOT_FOUND'); end if;
  return jsonb_build_object('code', 'FOUND', 'vehicle', private.vehicle_json(v_veh) || jsonb_build_object('created_at', v_veh.created_at), 'licensing_status', private.validity_status(v_veh.licensing_due_on));
end $$;

revoke all on function private.validity_status(date, date), private.validate_vehicle_fields(text, text, text, text, text, integer, integer, numeric),
  private.vehicle_json(public.vehicles) from public, anon, authenticated;
revoke all on function
  public.create_vehicle(uuid, uuid, uuid, text, text, text, text, text, integer, integer, numeric, date),
  public.update_vehicle(uuid, uuid, uuid, uuid, bigint, text, text, text, text, text, integer, integer, numeric, date, text),
  public.change_vehicle_status(uuid, uuid, uuid, uuid, bigint, text, text),
  public.list_vehicles(uuid, uuid, uuid, text, text, text, text, text, text, integer),
  public.get_vehicle(uuid, uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function
  public.create_vehicle(uuid, uuid, uuid, text, text, text, text, text, integer, integer, numeric, date),
  public.update_vehicle(uuid, uuid, uuid, uuid, bigint, text, text, text, text, text, integer, integer, numeric, date, text),
  public.change_vehicle_status(uuid, uuid, uuid, uuid, bigint, text, text),
  public.list_vehicles(uuid, uuid, uuid, text, text, text, text, text, text, integer),
  public.get_vehicle(uuid, uuid, uuid, uuid) to service_role;
