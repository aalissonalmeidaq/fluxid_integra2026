-- Spec 008, US6: a custódia do cilindro (em estoque, em trânsito, no cliente) aparece na lista e no detalhe, com a unidade do cliente
-- quando está "no cliente", e a lista de cilindros ganha o filtro por custódia (RF-024). O comportamento atual não muda: o filtro é opcional.
-- A unidade só traz id, nome e cliente (para o link) (dado de cadastro, não pessoal).

drop function public.query_cylinders_list(uuid, uuid, uuid, text, text, text, text, uuid, text, text, integer);
drop function private.filter_cylinders(uuid, text, text, text, uuid, text);

create function private.filter_cylinders(
  p_organization uuid, p_status text, p_stock_status text, p_hydro_status text, p_type uuid, p_search text, p_custody text default null)
returns setof public.cylinders language sql stable set search_path = '' as $$
  select c.*
    from public.cylinders c
   where c.organization_id = p_organization
     and (p_status = 'all' or c.status = p_status)
     and (p_stock_status is null or c.stock_status = p_stock_status)
     and (p_custody is null or c.custody_status = p_custody)
     and (p_type is null or c.cylinder_type_id = p_type)
     and (p_hydro_status is null or private.hydro_status(c.hydro_last_result, c.hydro_next_due_on) = p_hydro_status)
     and (p_search is null
          or c.serial_normalized like '%' || replace(replace(replace(p_search, '\', '\\'), '%', '\%'), '_', '\_') || '%' escape '\'
          or exists (select 1 from public.cylinder_identifiers i
                      where i.cylinder_id = c.id and i.status = 'active' and i.value_normalized = p_search))
$$;

create or replace function private.cylinder_list_item(p_cylinder public.cylinders) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'id', p_cylinder.id,
    'serial_number', p_cylinder.serial_number,
    'type', (select private.cylinder_type_json(t) from public.cylinder_types t where t.id = p_cylinder.cylinder_type_id),
    'status', p_cylinder.status,
    'stock_status', p_cylinder.stock_status,
    'custody_status', p_cylinder.custody_status,
    'custody_site', (select jsonb_build_object('id', s.id, 'name', s.name, 'customer_id', s.customer_id) from public.customer_sites s where s.id = p_cylinder.custody_site_id and s.organization_id = p_cylinder.organization_id),
    'hydro_status', private.hydro_status(p_cylinder.hydro_last_result, p_cylinder.hydro_next_due_on),
    'active_identifier_count', (select count(*) from public.cylinder_identifiers i where i.cylinder_id = p_cylinder.id and i.status = 'active'),
    'version', p_cylinder.version)
$$;

create function public.query_cylinders_list(
  p_actor uuid, p_session uuid, p_organization uuid, p_search text, p_status text, p_stock_status text, p_hydro_status text,
  p_type uuid, p_sort text, p_cursor text, p_limit integer, p_custody text default null)
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
  if p_custody is not null and p_custody not in ('in_organization', 'in_transit', 'at_customer') then
    return jsonb_build_object('code', 'VALIDATION_FAILED', 'fields', private.field_error('custody', 'Custódia desconhecida.'));
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

  select count(*) into v_total from private.filter_cylinders(p_organization, v_status, p_stock_status, p_hydro_status, p_type, v_search, p_custody);

  -- Duas consultas, uma por sentido, para o índice (organização, série) servir a ordenação sem ordenar tudo.
  if v_sort = 'serial' then
    select jsonb_agg(jsonb_build_object('s', f.serial_normalized, 'i', f.id, 'item', private.cylinder_list_item(f)) order by f.serial_normalized, f.id)
      into v_rows
      from (select * from private.filter_cylinders(p_organization, v_status, p_stock_status, p_hydro_status, p_type, v_search, p_custody) x
             where p_cursor is null or (x.serial_normalized, x.id) > (v_cur_serial, v_cur_id)
             order by x.serial_normalized, x.id limit v_limit + 1) f;
  else
    select jsonb_agg(jsonb_build_object('s', f.serial_normalized, 'i', f.id, 'item', private.cylinder_list_item(f)) order by f.serial_normalized desc, f.id desc)
      into v_rows
      from (select * from private.filter_cylinders(p_organization, v_status, p_stock_status, p_hydro_status, p_type, v_search, p_custody) x
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

revoke all on function public.query_cylinders_list(uuid, uuid, uuid, text, text, text, text, uuid, text, text, integer, text) from public, anon, authenticated;
grant execute on function public.query_cylinders_list(uuid, uuid, uuid, text, text, text, text, uuid, text, text, integer, text) to service_role;
