-- Spec 006, US2: consultas de cilindros (lista, detalhe e catálogo). Somente leitura, sem auditoria de sucesso (contracts/operacoes-servidor.md).
-- Cilindro inexistente e cilindro de outra organização produzem exatamente a mesma resposta (RF-042).

-- Filtro comum da lista e do total. SQL simples e estável: o planejador o expande junto da consulta chamadora.
-- `p_search` já chega normalizado (upper + btrim); % e _ do texto digitado são tratados como texto.
create function private.filter_cylinders(
  p_organization uuid, p_status text, p_stock_status text, p_hydro_status text, p_type uuid, p_search text)
returns setof public.cylinders language sql stable set search_path = '' as $$
  select c.*
    from public.cylinders c
   where c.organization_id = p_organization
     and (p_status = 'all' or c.status = p_status)
     and (p_stock_status is null or c.stock_status = p_stock_status)
     and (p_type is null or c.cylinder_type_id = p_type)
     and (p_hydro_status is null or private.hydro_status(c.hydro_last_result, c.hydro_next_due_on) = p_hydro_status)
     and (p_search is null
          or c.serial_normalized like '%' || replace(replace(replace(p_search, '\', '\\'), '%', '\%'), '_', '\_') || '%' escape '\'
          or exists (select 1 from public.cylinder_identifiers i
                      where i.cylinder_id = c.id and i.status = 'active' and i.value_normalized = p_search))
$$;

create function private.cylinder_type_json(p_type public.cylinder_types) returns jsonb
language sql immutable set search_path = '' as $$
  select jsonb_build_object('id', p_type.id, 'gas', p_type.gas, 'capacity_value', p_type.capacity_value,
                            'capacity_unit', p_type.capacity_unit, 'classification', p_type.classification, 'active', p_type.active)
$$;

create function private.cylinder_list_item(p_cylinder public.cylinders) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'id', p_cylinder.id,
    'serial_number', p_cylinder.serial_number,
    'type', (select private.cylinder_type_json(t) from public.cylinder_types t where t.id = p_cylinder.cylinder_type_id),
    'status', p_cylinder.status,
    'stock_status', p_cylinder.stock_status,
    'hydro_status', private.hydro_status(p_cylinder.hydro_last_result, p_cylinder.hydro_next_due_on),
    'active_identifier_count', (select count(*) from public.cylinder_identifiers i where i.cylinder_id = p_cylinder.id and i.status = 'active'),
    'version', p_cylinder.version)
$$;

create function public.query_cylinder_catalog(p_actor uuid, p_session uuid, p_organization uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  denied text := private.cylinder_authorize(p_actor, p_session, p_organization, 'cylinder.read');
begin
  if denied is not null then return jsonb_build_object('code', denied); end if;
  return jsonb_build_object('code', 'LISTED', 'types', coalesce((
    select jsonb_agg(private.cylinder_type_json(t) order by lower(t.gas), t.capacity_value, t.id)
      from public.cylinder_types t where t.organization_id = p_organization), '[]'::jsonb));
end $$;

create function public.query_cylinders_list(
  p_actor uuid, p_session uuid, p_organization uuid, p_search text, p_status text, p_stock_status text, p_hydro_status text,
  p_type uuid, p_sort text, p_cursor text, p_limit integer)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  denied text;
  v_status text := coalesce(p_status, 'active');
  v_sort text := coalesce(p_sort, 'serial');
  v_limit integer := least(greatest(coalesce(p_limit, 25), 1), 100);
  v_search text := nullif(upper(btrim(coalesce(p_search, ''))), '');
  v_total bigint;
  v_rows jsonb;
  v_count integer;
  v_decoded text;
  v_cur_serial text;
  v_cur_id uuid;
  v_items jsonb;
  v_next text := null;
  v_last jsonb;
begin
  denied := private.cylinder_authorize(p_actor, p_session, p_organization, 'cylinder.read');
  if denied is not null then return jsonb_build_object('code', denied); end if;

  if v_status not in ('active', 'inactive', 'all') then
    return jsonb_build_object('code', 'VALIDATION_FAILED', 'fields', private.field_error('status', 'Situação cadastral desconhecida.'));
  end if;
  if p_stock_status is not null and p_stock_status not in ('in_stock', 'out_of_stock') then
    return jsonb_build_object('code', 'VALIDATION_FAILED', 'fields', private.field_error('stock_status', 'Situação de estoque desconhecida.'));
  end if;
  if p_hydro_status is not null and p_hydro_status not in ('em_dia', 'a_vencer', 'vencido', 'reprovado', 'sem_teste') then
    return jsonb_build_object('code', 'VALIDATION_FAILED', 'fields', private.field_error('hydro_status', 'Situação do teste desconhecida.'));
  end if;
  if v_sort not in ('serial', 'serial_desc') then
    return jsonb_build_object('code', 'VALIDATION_FAILED', 'fields', private.field_error('sort', 'Ordenação desconhecida.'));
  end if;

  if p_cursor is not null then
    begin
      v_decoded := convert_from(decode(p_cursor, 'base64'), 'UTF8');
      if v_decoded !~ '\|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'cursor'; end if;
      v_cur_id := right(v_decoded, 36)::uuid;
      v_cur_serial := left(v_decoded, length(v_decoded) - 37);
    exception when others then
      return jsonb_build_object('code', 'VALIDATION_FAILED', 'fields', private.field_error('cursor', 'Página inválida.'));
    end;
  end if;

  select count(*) into v_total from private.filter_cylinders(p_organization, v_status, p_stock_status, p_hydro_status, p_type, v_search);

  -- Duas consultas, uma por sentido, para o índice (organização, série) servir a ordenação sem ordenar tudo.
  if v_sort = 'serial' then
    select jsonb_agg(jsonb_build_object('s', f.serial_normalized, 'i', f.id, 'item', private.cylinder_list_item(f)) order by f.serial_normalized, f.id)
      into v_rows
      from (select * from private.filter_cylinders(p_organization, v_status, p_stock_status, p_hydro_status, p_type, v_search) x
             where p_cursor is null or (x.serial_normalized, x.id) > (v_cur_serial, v_cur_id)
             order by x.serial_normalized, x.id limit v_limit + 1) f;
  else
    select jsonb_agg(jsonb_build_object('s', f.serial_normalized, 'i', f.id, 'item', private.cylinder_list_item(f)) order by f.serial_normalized desc, f.id desc)
      into v_rows
      from (select * from private.filter_cylinders(p_organization, v_status, p_stock_status, p_hydro_status, p_type, v_search) x
             where p_cursor is null or (x.serial_normalized, x.id) < (v_cur_serial, v_cur_id)
             order by x.serial_normalized desc, x.id desc limit v_limit + 1) f;
  end if;

  v_rows := coalesce(v_rows, '[]'::jsonb);
  v_count := jsonb_array_length(v_rows);
  select coalesce(jsonb_agg(e.value -> 'item' order by e.ord), '[]'::jsonb) into v_items
    from jsonb_array_elements(v_rows) with ordinality as e(value, ord) where e.ord <= v_limit;
  if v_count > v_limit then
    v_last := v_rows -> (v_limit - 1);
    v_next := translate(encode(convert_to((v_last ->> 's') || '|' || (v_last ->> 'i'), 'UTF8'), 'base64'), E'\n', '');
  end if;

  return jsonb_build_object('code', 'LISTED', 'items', v_items, 'total', v_total, 'next', v_next);
end $$;

create function public.query_cylinder_get(p_actor uuid, p_session uuid, p_organization uuid, p_cylinder uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  denied text := private.cylinder_authorize(p_actor, p_session, p_organization, 'cylinder.read');
  v_cyl public.cylinders;
begin
  if denied is not null then return jsonb_build_object('code', denied); end if;
  select c.* into v_cyl from public.cylinders c where c.id = p_cylinder and c.organization_id = p_organization;
  if not found then return jsonb_build_object('code', 'NOT_FOUND'); end if;

  return jsonb_build_object(
    'code', 'FOUND',
    'cylinder', private.cylinder_list_item(v_cyl) || jsonb_build_object(
      'manufacturer', v_cyl.manufacturer, 'manufacture_year', v_cyl.manufacture_year, 'working_pressure_bar', v_cyl.working_pressure_bar,
      'notes', v_cyl.notes, 'inactivation_reason', v_cyl.inactivation_reason, 'hydro_last_result', v_cyl.hydro_last_result,
      'hydro_next_due_on', v_cyl.hydro_next_due_on, 'created_at', v_cyl.created_at),
    'hydro_status', private.hydro_status(v_cyl.hydro_last_result, v_cyl.hydro_next_due_on),
    'identifiers', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id, 'kind', i.kind, 'value', i.value, 'status', i.status, 'created_at', i.created_at, 'deactivated_at', i.deactivated_at,
        'deactivation_justification', i.deactivation_justification, 'transferred', i.transferred_to_identifier_id is not null)
        order by (i.status = 'deactivated'), i.created_at, i.id)
        from public.cylinder_identifiers i where i.cylinder_id = v_cyl.id), '[]'::jsonb),
    'tests', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', t.id, 'performed_on', t.performed_on, 'result', t.result, 'report_number', t.report_number, 'executor', t.executor,
        'next_due_on', t.next_due_on, 'notes', t.notes, 'rectifies_test_id', t.rectifies_test_id,
        'rectification_justification', t.rectification_justification, 'created_at', t.created_at,
        'superseded', exists (select 1 from public.cylinder_tests r where r.rectifies_test_id = t.id))
        order by t.performed_on desc, t.created_at desc, (t.rectifies_test_id is not null) desc, t.id)
        from public.cylinder_tests t where t.cylinder_id = v_cyl.id), '[]'::jsonb));
end $$;

revoke all on function private.filter_cylinders(uuid, text, text, text, uuid, text), private.cylinder_type_json(public.cylinder_types),
  private.cylinder_list_item(public.cylinders) from public, anon, authenticated;
revoke all on function public.query_cylinder_catalog(uuid, uuid, uuid),
  public.query_cylinders_list(uuid, uuid, uuid, text, text, text, text, uuid, text, text, integer),
  public.query_cylinder_get(uuid, uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.query_cylinder_catalog(uuid, uuid, uuid),
  public.query_cylinders_list(uuid, uuid, uuid, text, text, text, text, uuid, text, text, integer),
  public.query_cylinder_get(uuid, uuid, uuid, uuid) to service_role;
