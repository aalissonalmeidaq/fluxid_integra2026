-- Spec 006, US1: cadastro e edição de cilindros e manutenção do catálogo de tipos (RF-001 a RF-004, RF-008, RF-040).
-- Toda RPC recebe ator e sessão do servidor (nunca do cliente), confere a permissão no banco a cada chamada e devolve um
-- jsonb com `code`. O evento de histórico e a auditoria entram na mesma transação do comando.

-- Autorização comum: null quando permitido; 'AUTH_REQUIRED' (sessão inválida) ou 'ACCESS_DENIED' (sem vínculo, papel ou permissão).
create function private.cylinder_authorize(p_actor uuid, p_session uuid, p_organization uuid, p_permission text)
returns text language plpgsql stable security definer set search_path = '' as $$
begin
  if not exists (
    select 1 from public.user_sessions s
    where s.user_id = p_actor and s.session_id = p_session and s.status = 'active'
      and s.expires_at > now() and s.last_seen_at > now() - interval '30 minutes'
  ) then
    return 'AUTH_REQUIRED';
  end if;
  if not private.actor_has_permission(p_actor, p_session, p_organization, p_permission) then
    return 'ACCESS_DENIED';
  end if;
  return null;
end $$;

create function private.field_error(p_field text, p_message text) returns jsonb
language sql immutable set search_path = '' as $$
  select jsonb_build_array(jsonb_build_object('field', p_field, 'message', p_message))
$$;

-- Regras dos campos cadastrais (RF-001), repetidas no servidor. Devolve a lista de erros por campo (vazia quando válido).
create function private.validate_cylinder_fields(p_serial text, p_manufacturer text, p_year integer, p_pressure numeric, p_notes text)
returns jsonb language plpgsql stable set search_path = '' as $$
declare
  errors jsonb := '[]'::jsonb;
  max_year integer := extract(year from (now() at time zone 'America/Sao_Paulo'))::integer;
begin
  if char_length(btrim(coalesce(p_serial, ''))) not between 1 and 60 then
    errors := errors || private.field_error('serial_number', 'Informe o número de série com até 60 caracteres.');
  end if;
  if p_manufacturer is not null and char_length(p_manufacturer) > 120 then
    errors := errors || private.field_error('manufacturer', 'Use até 120 caracteres no fabricante.');
  end if;
  if p_year is not null and (p_year < 1900 or p_year > max_year) then
    errors := errors || private.field_error('manufacture_year', 'Informe o ano de 1900 até o ano atual.');
  end if;
  if p_pressure is not null and (p_pressure <= 0 or p_pressure >= 100000) then
    errors := errors || private.field_error('working_pressure_bar', 'Informe uma pressão de trabalho maior que zero.');
  end if;
  if p_notes is not null and char_length(p_notes) > 500 then
    errors := errors || private.field_error('notes', 'Use até 500 caracteres nas observações.');
  end if;
  return errors;
end $$;

create function public.create_cylinder(
  p_actor uuid, p_session uuid, p_organization uuid, p_type uuid, p_serial text, p_manufacturer text, p_year integer,
  p_pressure numeric, p_notes text, p_identifier_kind text, p_identifier_value text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  denied text;
  errors jsonb;
  v_serial text := btrim(coalesce(p_serial, ''));
  v_value text := btrim(coalesce(p_identifier_value, ''));
  v_manufacturer text := nullif(btrim(coalesce(p_manufacturer, '')), '');
  v_notes text := nullif(btrim(coalesce(p_notes, '')), '');
  v_owner uuid;
  v_cylinder uuid;
  v_identifier uuid;
begin
  denied := private.cylinder_authorize(p_actor, p_session, p_organization, 'cylinder.write');
  if denied is not null then return jsonb_build_object('code', denied); end if;

  errors := private.validate_cylinder_fields(v_serial, v_manufacturer, p_year, p_pressure, v_notes);
  if not exists (select 1 from public.cylinder_types t where t.id = p_type and t.organization_id = p_organization and t.active) then
    errors := errors || private.field_error('cylinder_type_id', 'Escolha um tipo de cilindro ativo.');
  end if;
  if p_identifier_kind is null or p_identifier_kind not in ('qr_code', 'data_matrix', 'nfc_tag', 'hull_number') then
    errors := errors || private.field_error('identifier.kind', 'Escolha o tipo do identificador.');
  end if;
  if char_length(v_value) not between 1 and 200 or v_value ~ '[\r\n]' then
    errors := errors || private.field_error('identifier.value', 'Informe o valor do identificador com até 200 caracteres.');
  end if;
  if jsonb_array_length(errors) > 0 then
    return jsonb_build_object('code', 'VALIDATION_FAILED', 'fields', errors);
  end if;

  -- Unicidade por organização sob bloqueio consultivo, sempre na mesma ordem (série, depois identificador).
  perform pg_advisory_xact_lock(hashtextextended(p_organization::text || ':serial:' || upper(v_serial), 0));
  perform pg_advisory_xact_lock(hashtextextended(p_organization::text || ':ident:' || upper(v_value), 0));

  select c.id into v_owner from public.cylinders c where c.organization_id = p_organization and c.serial_normalized = upper(v_serial);
  if found then
    return jsonb_build_object('code', 'SERIAL_CONFLICT', 'cylinder_id', v_owner);
  end if;
  select i.cylinder_id into v_owner from public.cylinder_identifiers i
   where i.organization_id = p_organization and i.value_normalized = upper(v_value) and i.status = 'active';
  if found then
    return jsonb_build_object('code', 'IDENTIFIER_CONFLICT', 'cylinder_id', v_owner);
  end if;
  if exists (select 1 from public.cylinder_identifiers i where i.organization_id = p_organization and i.value_normalized = upper(v_value)) then
    return jsonb_build_object('code', 'IDENTIFIER_UNAVAILABLE');
  end if;

  insert into public.cylinders (organization_id, cylinder_type_id, serial_number, manufacturer, manufacture_year, working_pressure_bar, notes, created_by)
  values (p_organization, p_type, v_serial, v_manufacturer, p_year, p_pressure, v_notes, p_actor)
  returning id into v_cylinder;
  insert into public.cylinder_identifiers (organization_id, cylinder_id, kind, value, created_by)
  values (p_organization, v_cylinder, p_identifier_kind, v_value, p_actor)
  returning id into v_identifier;

  perform private.append_cylinder_event(v_cylinder, p_organization, 'cylinder_created', p_actor, p_session, null,
    jsonb_build_object('serial_number', v_serial, 'cylinder_type_id', p_type, 'manufacturer', v_manufacturer,
                       'manufacture_year', p_year, 'working_pressure_bar', p_pressure, 'notes', v_notes));
  perform private.append_cylinder_event(v_cylinder, p_organization, 'identifier_added', p_actor, p_session, null,
    jsonb_build_object('identifier_id', v_identifier, 'kind', p_identifier_kind));
  perform private.write_audit_event(p_organization, p_actor, p_session, 'cylinder.create', 'cylinder', v_cylinder::text, 'success', null, null,
    jsonb_build_object('cylinder_id', v_cylinder));

  return jsonb_build_object('code', 'CREATED', 'cylinder_id', v_cylinder, 'version', 1);
end $$;

create function public.update_cylinder(
  p_actor uuid, p_session uuid, p_organization uuid, p_cylinder uuid, p_expected_version bigint, p_type uuid, p_serial text,
  p_manufacturer text, p_year integer, p_pressure numeric, p_notes text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  denied text;
  errors jsonb;
  v_cyl public.cylinders;
  v_serial text := btrim(coalesce(p_serial, ''));
  v_manufacturer text := nullif(btrim(coalesce(p_manufacturer, '')), '');
  v_notes text := nullif(btrim(coalesce(p_notes, '')), '');
  v_owner uuid;
  changes jsonb := '{}'::jsonb;
  v_version bigint;
begin
  denied := private.cylinder_authorize(p_actor, p_session, p_organization, 'cylinder.write');
  if denied is not null then return jsonb_build_object('code', denied); end if;

  select c.* into v_cyl from public.cylinders c where c.id = p_cylinder and c.organization_id = p_organization for update;
  if not found then return jsonb_build_object('code', 'NOT_FOUND'); end if;
  if v_cyl.status <> 'active' then return jsonb_build_object('code', 'CYLINDER_INACTIVE'); end if;
  if v_cyl.version <> p_expected_version then return jsonb_build_object('code', 'VERSION_CONFLICT'); end if;

  errors := private.validate_cylinder_fields(v_serial, v_manufacturer, p_year, p_pressure, v_notes);
  if not exists (select 1 from public.cylinder_types t where t.id = p_type and t.organization_id = p_organization
                   and (t.active or t.id = v_cyl.cylinder_type_id)) then
    errors := errors || private.field_error('cylinder_type_id', 'Escolha um tipo de cilindro ativo.');
  end if;
  if jsonb_array_length(errors) > 0 then
    return jsonb_build_object('code', 'VALIDATION_FAILED', 'fields', errors);
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_organization::text || ':serial:' || upper(v_serial), 0));
  select c.id into v_owner from public.cylinders c
   where c.organization_id = p_organization and c.serial_normalized = upper(v_serial) and c.id <> p_cylinder;
  if found then return jsonb_build_object('code', 'SERIAL_CONFLICT', 'cylinder_id', v_owner); end if;

  if v_cyl.cylinder_type_id is distinct from p_type then
    changes := changes || jsonb_build_object('cylinder_type_id', jsonb_build_object('from', v_cyl.cylinder_type_id, 'to', p_type));
  end if;
  if v_cyl.serial_number is distinct from v_serial then
    changes := changes || jsonb_build_object('serial_number', jsonb_build_object('from', v_cyl.serial_number, 'to', v_serial));
  end if;
  if v_cyl.manufacturer is distinct from v_manufacturer then
    changes := changes || jsonb_build_object('manufacturer', jsonb_build_object('from', v_cyl.manufacturer, 'to', v_manufacturer));
  end if;
  if v_cyl.manufacture_year is distinct from p_year then
    changes := changes || jsonb_build_object('manufacture_year', jsonb_build_object('from', v_cyl.manufacture_year, 'to', p_year));
  end if;
  if v_cyl.working_pressure_bar is distinct from p_pressure then
    changes := changes || jsonb_build_object('working_pressure_bar', jsonb_build_object('from', v_cyl.working_pressure_bar, 'to', p_pressure));
  end if;
  if v_cyl.notes is distinct from v_notes then
    changes := changes || jsonb_build_object('notes', jsonb_build_object('from', v_cyl.notes, 'to', v_notes));
  end if;

  if changes = '{}'::jsonb then
    return jsonb_build_object('code', 'UPDATED', 'version', v_cyl.version, 'unchanged', true);
  end if;

  update public.cylinders
     set cylinder_type_id = p_type, serial_number = v_serial, manufacturer = v_manufacturer, manufacture_year = p_year,
         working_pressure_bar = p_pressure, notes = v_notes, version = version + 1, updated_at = now()
   where id = p_cylinder
   returning version into v_version;

  perform private.append_cylinder_event(p_cylinder, p_organization, 'cylinder_updated', p_actor, p_session, null, jsonb_build_object('changes', changes));
  perform private.write_audit_event(p_organization, p_actor, p_session, 'cylinder.update', 'cylinder', p_cylinder::text, 'success', null, null,
    jsonb_build_object('cylinder_id', p_cylinder, 'version', v_version, 'fields', (select jsonb_agg(k) from jsonb_object_keys(changes) k)));

  return jsonb_build_object('code', 'UPDATED', 'version', v_version);
end $$;

create function public.save_cylinder_type(
  p_actor uuid, p_session uuid, p_organization uuid, p_type uuid, p_gas text, p_capacity_value numeric,
  p_capacity_unit text, p_classification text, p_active boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  denied text;
  errors jsonb := '[]'::jsonb;
  v_gas text := btrim(coalesce(p_gas, ''));
  v_id uuid;
begin
  denied := private.cylinder_authorize(p_actor, p_session, p_organization, 'cylinder.write');
  if denied is not null then return jsonb_build_object('code', denied); end if;

  if char_length(v_gas) not between 2 and 80 then
    errors := errors || private.field_error('gas', 'Informe o gás com 2 a 80 caracteres.');
  end if;
  if p_capacity_value is null or p_capacity_value <= 0 then
    errors := errors || private.field_error('capacity_value', 'Informe uma capacidade maior que zero.');
  end if;
  if p_capacity_unit is null or p_capacity_unit not in ('l', 'm3', 'kg') then
    errors := errors || private.field_error('capacity_unit', 'Escolha a unidade da capacidade.');
  end if;
  if p_classification is null or p_classification not in ('medicinal', 'industrial') then
    errors := errors || private.field_error('classification', 'Escolha a classificação.');
  end if;
  if jsonb_array_length(errors) > 0 then
    return jsonb_build_object('code', 'VALIDATION_FAILED', 'fields', errors);
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_organization::text || ':type:' || lower(v_gas) || p_capacity_value || p_capacity_unit || p_classification, 0));

  if p_type is not null then
    perform 1 from public.cylinder_types t where t.id = p_type and t.organization_id = p_organization for update;
    if not found then return jsonb_build_object('code', 'NOT_FOUND'); end if;
  end if;

  if exists (select 1 from public.cylinder_types t
              where t.organization_id = p_organization and lower(btrim(t.gas)) = lower(v_gas) and t.capacity_value = p_capacity_value
                and t.capacity_unit = p_capacity_unit and t.classification = p_classification and t.id is distinct from p_type) then
    return jsonb_build_object('code', 'VALIDATION_FAILED', 'fields', private.field_error('gas', 'Já existe um tipo com este gás, capacidade e classificação.'));
  end if;

  if p_type is null then
    insert into public.cylinder_types (organization_id, gas, capacity_value, capacity_unit, classification, active, created_by)
    values (p_organization, v_gas, p_capacity_value, p_capacity_unit, p_classification, coalesce(p_active, true), p_actor)
    returning id into v_id;
  else
    update public.cylinder_types
       set gas = v_gas, capacity_value = p_capacity_value, capacity_unit = p_capacity_unit, classification = p_classification,
           active = coalesce(p_active, active)
     where id = p_type
     returning id into v_id;
  end if;

  perform private.write_audit_event(p_organization, p_actor, p_session, 'cylinder.type_save', 'cylinder_type', v_id::text, 'success', null, null,
    jsonb_build_object('type_id', v_id));
  return jsonb_build_object('code', 'TYPE_SAVED', 'type_id', v_id);
end $$;

revoke all on function private.cylinder_authorize(uuid, uuid, uuid, text), private.field_error(text, text),
  private.validate_cylinder_fields(text, text, integer, numeric, text) from public, anon, authenticated;
revoke all on function public.create_cylinder(uuid, uuid, uuid, uuid, text, text, integer, numeric, text, text, text),
  public.update_cylinder(uuid, uuid, uuid, uuid, bigint, uuid, text, text, integer, numeric, text),
  public.save_cylinder_type(uuid, uuid, uuid, uuid, text, numeric, text, text, boolean) from public, anon, authenticated;
grant execute on function public.create_cylinder(uuid, uuid, uuid, uuid, text, text, integer, numeric, text, text, text),
  public.update_cylinder(uuid, uuid, uuid, uuid, bigint, uuid, text, text, integer, numeric, text),
  public.save_cylinder_type(uuid, uuid, uuid, uuid, text, numeric, text, text, boolean) to service_role;
