-- Spec 007, US2: consulta de clientes e unidades (RF-003, RF-040, RF-052). Somente leitura, sem auditoria de sucesso. Toda RPC confere
-- vínculo e permissão no banco, filtra por organização e responde NOT_FOUND igual para registro inexistente e de outra organização.
-- Nenhuma tabela de documentos é lida aqui, exceto a busca por igualdade do valor completo digitado; itens de lista nunca trazem CPF,
-- telefone ou e-mail completos (research.md, decisão 4).

-- Cursor opaco da paginação: base64 de "<chave de ordenação>|<id>". Comum a todas as listas desta spec.
create function private.cursor_encode(p_key text, p_id uuid) returns text language sql immutable set search_path = '' as $$
  select translate(encode(convert_to(p_key || '|' || p_id::text, 'UTF8'), 'base64'), E'\n', '')
$$;

create function private.cursor_decode(p_cursor text, out sort_key text, out row_id uuid, out valid boolean)
language plpgsql immutable set search_path = '' as $$
declare
  v_decoded text;
begin
  valid := true;
  if p_cursor is null then return; end if;
  begin
    v_decoded := convert_from(decode(p_cursor, 'base64'), 'UTF8');
    if v_decoded !~ '\|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'cursor'; end if;
    row_id := right(v_decoded, 36)::uuid;
    sort_key := left(v_decoded, length(v_decoded) - 37);
  exception when others then
    valid := false;
  end;
end $$;

-- Trecho de busca com os curingas do LIKE escapados.
create function private.like_pattern(p_search text) returns text language sql immutable set search_path = '' as $$
  select '%' || regexp_replace(lower(btrim(p_search)), '([\\%_])', '\\\1', 'g') || '%'
$$;

-- Valor de documento digitado, normalizado para a comparação por igualdade (CNPJ: maiúsculas; CPF: só dígitos). Nulo se não parece um.
create function private.search_document_key(p_search text) returns text language sql immutable set search_path = '' as $$
  select case
    when upper(regexp_replace(coalesce(p_search, ''), '[./ -]', '', 'g')) ~ '^[0-9]{11}$' then upper(regexp_replace(p_search, '[./ -]', '', 'g'))
    when upper(regexp_replace(coalesce(p_search, ''), '[./ -]', '', 'g')) ~ '^[0-9A-Z]{14}$' then upper(regexp_replace(p_search, '[./ -]', '', 'g'))
  end
$$;

create function private.customer_filter(p_organization uuid, p_status text, p_segment text, p_state text, p_has_geofence boolean, p_search text)
returns setof public.customers language sql stable security definer set search_path = '' as $$
  select c.* from public.customers c
   where c.organization_id = p_organization
     and (p_status = 'all' or c.status = p_status)
     and (p_segment is null or c.segment = p_segment)
     and (p_state is null or exists (select 1 from public.customer_sites s where s.customer_id = c.id and s.state = p_state))
     and (p_has_geofence is null or p_has_geofence = exists (
           select 1 from public.customer_sites s join public.geofences g on g.site_id = s.id and g.status = 'active' where s.customer_id = c.id))
     and (p_search is null or (
           c.anonymized_at is null and (
             lower(c.legal_name) like private.like_pattern(p_search) or lower(c.trade_name) like private.like_pattern(p_search)
             or exists (select 1 from public.customer_sites s where s.customer_id = c.id
                          and (lower(s.name) like private.like_pattern(p_search) or lower(s.city) like private.like_pattern(p_search)))
             or exists (select 1 from public.customer_documents d where d.customer_id = c.id and d.document_key = private.search_document_key(p_search)))))
$$;

create function private.customer_list_item(c public.customers) returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', c.id, 'person_type', c.person_type, 'document_display', c.document_display, 'legal_name', c.legal_name, 'trade_name', c.trade_name,
    'segment', c.segment, 'status', c.status, 'anonymized_at', c.anonymized_at,
    'cities', coalesce((select jsonb_agg(distinct s.city) from public.customer_sites s where s.customer_id = c.id), '[]'::jsonb),
    'site_count', (select count(*) from public.customer_sites s where s.customer_id = c.id))
$$;

create function public.list_customers(
  p_actor uuid, p_session uuid, p_organization uuid, p_search text, p_status text, p_segment text, p_state text, p_has_geofence boolean,
  p_sort text, p_cursor text, p_limit integer)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  denied text;
  v_status text := coalesce(p_status, 'active');
  v_sort text := coalesce(p_sort, 'name');
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
  denied := private.cylinder_authorize(p_actor, p_session, p_organization, 'customer.read');
  if denied is not null then return jsonb_build_object('code', denied); end if;
  if v_status not in ('active', 'inactive', 'all') then
    return jsonb_build_object('code', 'VALIDATION_FAILED', 'fields', private.field_error('status', 'Situação cadastral desconhecida.'));
  end if;
  if v_sort not in ('name', 'name_desc') then
    return jsonb_build_object('code', 'VALIDATION_FAILED', 'fields', private.field_error('sort', 'Ordenação desconhecida.'));
  end if;
  select * into v_cursor from private.cursor_decode(p_cursor);
  if not v_cursor.valid then
    return jsonb_build_object('code', 'VALIDATION_FAILED', 'fields', private.field_error('cursor', 'Página inválida.'));
  end if;

  select count(*) into v_total from private.customer_filter(p_organization, v_status, p_segment, p_state, p_has_geofence, v_search);

  if v_sort = 'name' then
    select jsonb_agg(jsonb_build_object('k', lower(f.legal_name), 'i', f.id, 'item', private.customer_list_item(f)) order by lower(f.legal_name), f.id) into v_rows
      from (select * from private.customer_filter(p_organization, v_status, p_segment, p_state, p_has_geofence, v_search) x
             where p_cursor is null or (lower(x.legal_name), x.id) > (v_cursor.sort_key, v_cursor.row_id)
             order by lower(x.legal_name), x.id limit v_limit + 1) f;
  else
    select jsonb_agg(jsonb_build_object('k', lower(f.legal_name), 'i', f.id, 'item', private.customer_list_item(f)) order by lower(f.legal_name) desc, f.id desc) into v_rows
      from (select * from private.customer_filter(p_organization, v_status, p_segment, p_state, p_has_geofence, v_search) x
             where p_cursor is null or (lower(x.legal_name), x.id) < (v_cursor.sort_key, v_cursor.row_id)
             order by lower(x.legal_name) desc, x.id desc limit v_limit + 1) f;
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

create function public.get_customer(p_actor uuid, p_session uuid, p_organization uuid, p_customer uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  denied text;
  v_cust public.customers;
  v_can_write boolean;
begin
  denied := private.cylinder_authorize(p_actor, p_session, p_organization, 'customer.read');
  if denied is not null then return jsonb_build_object('code', denied); end if;
  select c.* into v_cust from public.customers c where c.id = p_customer and c.organization_id = p_organization;
  if not found then return jsonb_build_object('code', 'NOT_FOUND'); end if;
  -- Telefone e e-mail dos contatos são dados pessoais: só quem edita clientes os recebe (RF-003).
  v_can_write := private.actor_has_permission(p_actor, p_session, p_organization, 'customer.write');
  return jsonb_build_object(
    'code', 'FOUND',
    'customer', jsonb_build_object(
      'id', v_cust.id, 'person_type', v_cust.person_type, 'document_display', v_cust.document_display, 'legal_name', v_cust.legal_name,
      'trade_name', v_cust.trade_name, 'segment', v_cust.segment, 'segment_detail', v_cust.segment_detail, 'notes', v_cust.notes,
      'status', v_cust.status, 'version', v_cust.version, 'anonymized_at', v_cust.anonymized_at, 'created_at', v_cust.created_at),
    'contacts', coalesce((
      select jsonb_agg(
               case when v_can_write
                 then jsonb_build_object('id', k.id, 'name', k.name, 'role', k.role, 'phone', k.phone, 'email', k.email, 'is_primary', k.is_primary, 'anonymized_at', k.anonymized_at)
                 else jsonb_build_object('id', k.id, 'name', k.name, 'role', k.role, 'is_primary', k.is_primary, 'anonymized_at', k.anonymized_at) end
               order by k.position, k.id)
        from public.customer_contacts k where k.customer_id = v_cust.id), '[]'::jsonb),
    'sites', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', s.id, 'name', s.name, 'city', s.city, 'state', s.state, 'status', s.status,
               'active_geofences', (select count(*) from public.geofences g where g.site_id = s.id and g.status = 'active'),
               'anonymized_at', v_cust.anonymized_at)
             order by lower(s.name), s.id)
        from public.customer_sites s where s.customer_id = v_cust.id), '[]'::jsonb));
end $$;

create function private.site_json(s public.customer_sites, c public.customers) returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', s.id, 'customer_id', s.customer_id, 'customer_name', c.legal_name, 'customer_status', c.status, 'name', s.name, 'postal_code', s.postal_code,
    'street', s.street, 'number', s.number, 'complement', s.complement, 'district', s.district, 'city', s.city, 'state', s.state,
    'ibge_code', s.ibge_code, 'latitude', s.latitude, 'longitude', s.longitude, 'receiving_contact_name', s.receiving_contact_name,
    'receiving_contact_phone', s.receiving_contact_phone, 'receiving_days', coalesce(to_jsonb(s.receiving_days), '[]'::jsonb),
    'receiving_from', s.receiving_from, 'receiving_to', s.receiving_to, 'access_instructions', s.access_instructions, 'status', s.status,
    'version', s.version, 'anonymized_at', c.anonymized_at)
$$;

create function public.list_sites(
  p_actor uuid, p_session uuid, p_organization uuid, p_customer uuid, p_search text, p_status text, p_cursor text, p_limit integer)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  denied text;
  v_status text := coalesce(p_status, 'active');
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
  denied := private.cylinder_authorize(p_actor, p_session, p_organization, 'customer.read');
  if denied is not null then return jsonb_build_object('code', denied); end if;
  if v_status not in ('active', 'inactive', 'all') then
    return jsonb_build_object('code', 'VALIDATION_FAILED', 'fields', private.field_error('status', 'Situação cadastral desconhecida.'));
  end if;
  select * into v_cursor from private.cursor_decode(p_cursor);
  if not v_cursor.valid then
    return jsonb_build_object('code', 'VALIDATION_FAILED', 'fields', private.field_error('cursor', 'Página inválida.'));
  end if;

  select count(*) into v_total from public.customer_sites s join public.customers c on c.id = s.customer_id
   where s.organization_id = p_organization and (p_customer is null or s.customer_id = p_customer) and (v_status = 'all' or s.status = v_status)
     and (v_search is null or (c.anonymized_at is null and (lower(s.name) like private.like_pattern(v_search) or lower(s.city) like private.like_pattern(v_search))));

  select jsonb_agg(jsonb_build_object('k', lower(f.name), 'i', f.id, 'item', jsonb_build_object(
           'id', f.id, 'customer_id', f.customer_id, 'customer_name', f.customer_name, 'name', f.name, 'city', f.city, 'state', f.state, 'status', f.status,
           'has_geofence', exists (select 1 from public.geofences g where g.site_id = f.id and g.status = 'active'))) order by lower(f.name), f.id)
    into v_rows
    from (select s.id, s.customer_id, c.legal_name as customer_name, s.name, s.city, s.state, s.status
            from public.customer_sites s join public.customers c on c.id = s.customer_id
           where s.organization_id = p_organization and (p_customer is null or s.customer_id = p_customer) and (v_status = 'all' or s.status = v_status)
             and (v_search is null or (c.anonymized_at is null and (lower(s.name) like private.like_pattern(v_search) or lower(s.city) like private.like_pattern(v_search))))
             and (p_cursor is null or (lower(s.name), s.id) > (v_cursor.sort_key, v_cursor.row_id))
           order by lower(s.name), s.id limit v_limit + 1) f;

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

create function public.get_site(p_actor uuid, p_session uuid, p_organization uuid, p_site uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  denied text;
  v_site public.customer_sites;
  v_cust public.customers;
begin
  denied := private.cylinder_authorize(p_actor, p_session, p_organization, 'customer.read');
  if denied is not null then return jsonb_build_object('code', denied); end if;
  select s.* into v_site from public.customer_sites s where s.id = p_site and s.organization_id = p_organization;
  if not found then return jsonb_build_object('code', 'NOT_FOUND'); end if;
  select c.* into v_cust from public.customers c where c.id = v_site.customer_id;
  return jsonb_build_object(
    'code', 'FOUND',
    'site', private.site_json(v_site, v_cust),
    'geofences', coalesce((
      select jsonb_agg(jsonb_build_object('id', g.id, 'name', g.name, 'shape', g.shape, 'status', g.status) order by lower(g.name), g.id)
        from public.geofences g where g.site_id = v_site.id), '[]'::jsonb));
end $$;

revoke all on function private.cursor_encode(text, uuid), private.cursor_decode(text), private.like_pattern(text), private.search_document_key(text),
  private.customer_filter(uuid, text, text, text, boolean, text), private.customer_list_item(public.customers),
  private.site_json(public.customer_sites, public.customers) from public, anon, authenticated;
revoke all on function
  public.list_customers(uuid, uuid, uuid, text, text, text, text, boolean, text, text, integer),
  public.get_customer(uuid, uuid, uuid, uuid),
  public.list_sites(uuid, uuid, uuid, uuid, text, text, text, integer),
  public.get_site(uuid, uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function
  public.list_customers(uuid, uuid, uuid, text, text, text, text, boolean, text, text, integer),
  public.get_customer(uuid, uuid, uuid, uuid),
  public.list_sites(uuid, uuid, uuid, uuid, text, text, text, integer),
  public.get_site(uuid, uuid, uuid, uuid) to service_role;
