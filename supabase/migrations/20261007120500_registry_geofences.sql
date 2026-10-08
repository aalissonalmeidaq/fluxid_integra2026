-- Spec 007, US3: geocercas circulares e poligonais por unidade, com a decisão "ponto dentro" única no servidor (RF-013 a RF-018, CA-007).
-- A forma é validada e a área é calculada só aqui, nunca aceita do cliente (research.md, decisões 1 e 2). Coordenadas entram como
-- (latitude, longitude) e viram (longitude, latitude) em um só lugar: private.build_geofence_area. Funções do PostGIS ficam
-- qualificadas com `extensions.`.

-- Valida a forma e devolve a área em geography. `reason` vem preenchido quando a forma é inválida (mesmos motivos do TypeScript).
create function private.build_geofence_area(
  p_shape text, p_center jsonb, p_radius_m integer, p_vertices jsonb,
  out area extensions.geography, out reason text, out normalized jsonb)
language plpgsql immutable set search_path = '' as $$
declare
  v_lat numeric;
  v_lng numeric;
  v_count integer;
  v_points extensions.geometry[] := '{}';
  v_prev jsonb;
  v_item jsonb;
  v_geom extensions.geometry;
  v_first jsonb;
  v_collinear boolean;
  v_center extensions.geography;
begin
  reason := null;
  if p_shape = 'circle' then
    begin
      v_lat := (p_center->>'lat')::numeric;
      v_lng := (p_center->>'lng')::numeric;
    exception when others then
      reason := 'coordinate_range';
      return;
    end;
    if v_lat is null or v_lng is null or v_lat not between -90 and 90 or v_lng not between -180 and 180 then
      reason := 'coordinate_range';
      return;
    end if;
    if p_radius_m is null or p_radius_m < (private.geofence_limits()->>'radius_min_m')::integer or p_radius_m > (private.geofence_limits()->>'radius_max_m')::integer then
      reason := 'radius_range';
      return;
    end if;
    v_center := extensions.st_setsrid(extensions.st_makepoint(v_lng, v_lat), 4326)::extensions.geography;
    -- Polígono circunscrito (raio 1% maior) só para o pré-filtro por caixa; a decisão do círculo usa a distância ao centro.
    area := extensions.st_buffer(v_center, p_radius_m * 1.01)::extensions.geometry::extensions.geography;
    normalized := jsonb_build_object('center', jsonb_build_object('lat', v_lat, 'lng', v_lng));
    return;
  end if;

  if p_vertices is null or jsonb_typeof(p_vertices) <> 'array' then
    reason := 'vertex_count';
    return;
  end if;
  v_count := jsonb_array_length(p_vertices);
  if v_count < (private.geofence_limits()->>'vertices_min')::integer or v_count > (private.geofence_limits()->>'vertices_max')::integer then
    reason := 'vertex_count';
    return;
  end if;
  normalized := '[]'::jsonb;
  for v_item in select * from jsonb_array_elements(p_vertices) loop
    begin
      v_lat := (v_item->>'lat')::numeric;
      v_lng := (v_item->>'lng')::numeric;
    exception when others then
      reason := 'coordinate_range';
      return;
    end;
    if v_lat is null or v_lng is null or v_lat not between -90 and 90 or v_lng not between -180 and 180 then
      reason := 'coordinate_range';
      return;
    end if;
    -- Vértice igual ao anterior (inclusive o último igual ao primeiro) é repetição.
    if v_prev is not null and (v_prev->>'lat')::numeric = v_lat and (v_prev->>'lng')::numeric = v_lng then
      reason := 'duplicate_vertex';
      return;
    end if;
    v_prev := jsonb_build_object('lat', v_lat, 'lng', v_lng);
    if v_first is null then v_first := v_prev; end if;
    normalized := normalized || jsonb_build_array(v_prev);
    v_points := v_points || extensions.st_setsrid(extensions.st_makepoint(v_lng, v_lat), 4326);
  end loop;
  if (v_prev->>'lat')::numeric = (v_first->>'lat')::numeric and (v_prev->>'lng')::numeric = (v_first->>'lng')::numeric then
    reason := 'duplicate_vertex';
    return;
  end if;

  -- Todos os vértices alinhados: não há área (antes da validade, porque um anel degenerado também é inválido).
  v_collinear := extensions.st_area(extensions.st_convexhull(extensions.st_collect(v_points))) = 0;
  if v_collinear then
    reason := 'zero_area';
    return;
  end if;
  v_geom := extensions.st_makepolygon(extensions.st_makeline(v_points || v_points[1]));
  -- Cruzamento de arestas, inclusive toque em vértice e ponta que volta sobre si mesma.
  if not extensions.st_isvalid(v_geom) then
    reason := 'self_intersection';
    return;
  end if;
  if extensions.st_area(v_geom) = 0 then
    reason := 'zero_area';
    return;
  end if;
  -- Os dois sentidos (horário e anti-horário) são aceitos; a área é guardada com a orientação normalizada.
  area := extensions.st_forcerhr(v_geom)::extensions.geography;
end $$;

-- Geocercas ativas da mesma unidade que se cruzam com a área (RF-016a): avisa, nunca impede.
create function private.geofence_overlaps(p_site uuid, p_area extensions.geography, p_except uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', g.id, 'name', g.name) order by lower(g.name), g.id), '[]'::jsonb)
    from public.geofences g
   where g.site_id = p_site and g.status = 'active' and (p_except is null or g.id <> p_except) and extensions.st_intersects(g.area, p_area)
$$;

create function private.geofence_shape_json(g public.geofences) returns jsonb language sql stable set search_path = '' as $$
  select case g.shape
    when 'circle' then jsonb_build_object('shape', 'circle', 'center', jsonb_build_object('lat', extensions.st_y(g.center::extensions.geometry), 'lng', extensions.st_x(g.center::extensions.geometry)), 'radius_m', g.radius_m)
    else jsonb_build_object('shape', 'polygon', 'vertices', g.vertices) end
$$;

create function public.create_geofence(
  p_actor uuid, p_session uuid, p_organization uuid, p_site uuid, p_name text, p_shape text, p_center jsonb, p_radius_m integer, p_vertices jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  denied text;
  v_name text := btrim(coalesce(p_name, ''));
  v_site public.customer_sites;
  v_area extensions.geography;
  v_reason text;
  v_normalized jsonb;
  v_id uuid;
  v_overlaps jsonb;
begin
  denied := private.cylinder_authorize(p_actor, p_session, p_organization, 'geofence.write');
  if denied is not null then return jsonb_build_object('code', denied); end if;

  if char_length(v_name) not between 2 and 120 then
    return jsonb_build_object('code', 'VALIDATION_FAILED', 'fields', private.field_error('name', 'Informe o nome da geocerca com 2 a 120 caracteres.'));
  end if;
  if p_shape is null or p_shape not in ('circle', 'polygon') then
    return jsonb_build_object('code', 'VALIDATION_FAILED', 'fields', private.field_error('shape', 'Escolha círculo ou polígono.'));
  end if;

  select s.* into v_site from public.customer_sites s where s.id = p_site and s.organization_id = p_organization for share;
  if not found then return jsonb_build_object('code', 'NOT_FOUND'); end if;
  if v_site.status <> 'active' then return jsonb_build_object('code', 'PARENT_INACTIVE'); end if;

  select b.area, b.reason, b.normalized into v_area, v_reason, v_normalized from private.build_geofence_area(p_shape, p_center, p_radius_m, p_vertices) b;
  if v_reason is not null then return jsonb_build_object('code', 'GEOMETRY_INVALID', 'reason', v_reason); end if;

  perform pg_advisory_xact_lock(hashtextextended(p_site::text || ':geofence-name:' || lower(v_name), 0));
  if exists (select 1 from public.geofences g where g.site_id = p_site and lower(btrim(g.name)) = lower(v_name)) then
    return jsonb_build_object('code', 'NAME_CONFLICT');
  end if;

  insert into public.geofences (organization_id, site_id, name, shape, center, radius_m, vertices, area, created_by)
  values (p_organization, p_site, v_name, p_shape,
          case p_shape when 'circle' then extensions.st_setsrid(extensions.st_makepoint((p_center->>'lng')::numeric, (p_center->>'lat')::numeric), 4326)::extensions.geography end,
          case p_shape when 'circle' then p_radius_m end,
          case p_shape when 'polygon' then v_normalized end,
          v_area, p_actor)
  returning id into v_id;
  v_overlaps := private.geofence_overlaps(p_site, v_area, v_id);

  perform private.append_registry_event('geofence', v_id, p_organization, 'geofence_created', p_actor, p_session, null,
    jsonb_build_object('site_id', p_site, 'name', v_name) || (select private.geofence_shape_json(g) from public.geofences g where g.id = v_id));
  perform private.write_audit_event(p_organization, p_actor, p_session, 'geofence.create', 'geofence', v_id::text, 'success', null, null,
    jsonb_build_object('geofence_id', v_id, 'site_id', p_site, 'shape', p_shape));
  return jsonb_build_object('code', 'CREATED', 'geofence_id', v_id, 'version', 1, 'overlaps', v_overlaps);
end $$;

create function public.update_geofence(
  p_actor uuid, p_session uuid, p_organization uuid, p_geofence uuid, p_expected_version bigint, p_name text, p_shape text,
  p_center jsonb, p_radius_m integer, p_vertices jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  denied text;
  v_name text := btrim(coalesce(p_name, ''));
  v_old public.geofences;
  v_area extensions.geography;
  v_reason text;
  v_normalized jsonb;
  v_new public.geofences;
  v_overlaps jsonb;
begin
  denied := private.cylinder_authorize(p_actor, p_session, p_organization, 'geofence.write');
  if denied is not null then return jsonb_build_object('code', denied); end if;

  select g.* into v_old from public.geofences g where g.id = p_geofence and g.organization_id = p_organization for update;
  if not found then return jsonb_build_object('code', 'NOT_FOUND'); end if;
  if v_old.version <> p_expected_version then return jsonb_build_object('code', 'VERSION_CONFLICT'); end if;
  if v_old.status <> 'active' then return jsonb_build_object('code', 'INACTIVE_RECORD'); end if;

  if char_length(v_name) not between 2 and 120 then
    return jsonb_build_object('code', 'VALIDATION_FAILED', 'fields', private.field_error('name', 'Informe o nome da geocerca com 2 a 120 caracteres.'));
  end if;
  if p_shape is null or p_shape not in ('circle', 'polygon') then
    return jsonb_build_object('code', 'VALIDATION_FAILED', 'fields', private.field_error('shape', 'Escolha círculo ou polígono.'));
  end if;
  select b.area, b.reason, b.normalized into v_area, v_reason, v_normalized from private.build_geofence_area(p_shape, p_center, p_radius_m, p_vertices) b;
  if v_reason is not null then return jsonb_build_object('code', 'GEOMETRY_INVALID', 'reason', v_reason); end if;

  perform pg_advisory_xact_lock(hashtextextended(v_old.site_id::text || ':geofence-name:' || lower(v_name), 0));
  if exists (select 1 from public.geofences g where g.site_id = v_old.site_id and g.id <> p_geofence and lower(btrim(g.name)) = lower(v_name)) then
    return jsonb_build_object('code', 'NAME_CONFLICT');
  end if;

  update public.geofences
     set name = v_name, shape = p_shape,
         center = case p_shape when 'circle' then extensions.st_setsrid(extensions.st_makepoint((p_center->>'lng')::numeric, (p_center->>'lat')::numeric), 4326)::extensions.geography end,
         radius_m = case p_shape when 'circle' then p_radius_m end,
         vertices = case p_shape when 'polygon' then v_normalized end,
         area = v_area, version = version + 1, updated_at = now()
   where id = p_geofence
   returning * into v_new;
  v_overlaps := private.geofence_overlaps(v_new.site_id, v_area, p_geofence);

  perform private.append_registry_event('geofence', p_geofence, p_organization, 'geofence_updated', p_actor, p_session, null,
    jsonb_build_object('name_from', v_old.name, 'name_to', v_name, 'from', private.geofence_shape_json(v_old), 'to', private.geofence_shape_json(v_new)));
  perform private.write_audit_event(p_organization, p_actor, p_session, 'geofence.update', 'geofence', p_geofence::text, 'success', null, null,
    jsonb_build_object('geofence_id', p_geofence));
  return jsonb_build_object('code', 'UPDATED', 'version', v_new.version, 'overlaps', v_overlaps);
end $$;

create function public.list_geofences(
  p_actor uuid, p_session uuid, p_organization uuid, p_site uuid, p_customer uuid, p_search text, p_shape text, p_status text, p_cursor text, p_limit integer)
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
  denied := private.cylinder_authorize(p_actor, p_session, p_organization, 'geofence.read');
  if denied is not null then return jsonb_build_object('code', denied); end if;
  if v_status not in ('active', 'inactive', 'all') then
    return jsonb_build_object('code', 'VALIDATION_FAILED', 'fields', private.field_error('status', 'Situação cadastral desconhecida.'));
  end if;
  if p_shape is not null and p_shape not in ('circle', 'polygon') then
    return jsonb_build_object('code', 'VALIDATION_FAILED', 'fields', private.field_error('shape', 'Forma desconhecida.'));
  end if;
  select * into v_cursor from private.cursor_decode(p_cursor);
  if not v_cursor.valid then
    return jsonb_build_object('code', 'VALIDATION_FAILED', 'fields', private.field_error('cursor', 'Página inválida.'));
  end if;

  select count(*) into v_total
    from public.geofences g join public.customer_sites s on s.id = g.site_id join public.customers c on c.id = s.customer_id
   where g.organization_id = p_organization and (v_status = 'all' or g.status = v_status) and (p_shape is null or g.shape = p_shape)
     and (p_site is null or g.site_id = p_site) and (p_customer is null or s.customer_id = p_customer)
     and (v_search is null or g.id in (
              select g1.id from public.geofences g1 where g1.organization_id = p_organization and lower(g1.name) like private.like_pattern(v_search)
              union select g2.id from public.geofences g2 join public.customer_sites s2 on s2.id = g2.site_id join public.customers c2 on c2.id = s2.customer_id
                     where g2.organization_id = p_organization and c2.anonymized_at is null and lower(s2.name) like private.like_pattern(v_search)
              union select g3.id from public.geofences g3 join public.customer_sites s3 on s3.id = g3.site_id join public.customers c3 on c3.id = s3.customer_id
                     where g3.organization_id = p_organization and c3.anonymized_at is null and lower(c3.legal_name) like private.like_pattern(v_search)));

  select jsonb_agg(jsonb_build_object('k', lower(f.name), 'i', f.id, 'item', jsonb_build_object(
           'id', f.id, 'name', f.name, 'shape', f.shape, 'status', f.status, 'site_id', f.site_id, 'site_name', f.site_name,
           'customer_id', f.customer_id, 'customer_name', f.customer_name)) order by lower(f.name), f.id)
    into v_rows
    from (select g.id, g.name, g.shape, g.status, g.site_id, s.name as site_name, s.customer_id, c.legal_name as customer_name
            from public.geofences g join public.customer_sites s on s.id = g.site_id join public.customers c on c.id = s.customer_id
           where g.organization_id = p_organization and (v_status = 'all' or g.status = v_status) and (p_shape is null or g.shape = p_shape)
             and (p_site is null or g.site_id = p_site) and (p_customer is null or s.customer_id = p_customer)
             and (v_search is null or g.id in (
              select g1.id from public.geofences g1 where g1.organization_id = p_organization and lower(g1.name) like private.like_pattern(v_search)
              union select g2.id from public.geofences g2 join public.customer_sites s2 on s2.id = g2.site_id join public.customers c2 on c2.id = s2.customer_id
                     where g2.organization_id = p_organization and c2.anonymized_at is null and lower(s2.name) like private.like_pattern(v_search)
              union select g3.id from public.geofences g3 join public.customer_sites s3 on s3.id = g3.site_id join public.customers c3 on c3.id = s3.customer_id
                     where g3.organization_id = p_organization and c3.anonymized_at is null and lower(c3.legal_name) like private.like_pattern(v_search)))
             and (p_cursor is null or (lower(g.name), g.id) > (v_cursor.sort_key, v_cursor.row_id))
           order by lower(g.name), g.id limit v_limit + 1) f;

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

create function public.get_geofence(p_actor uuid, p_session uuid, p_organization uuid, p_geofence uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  denied text;
  v_geo public.geofences;
  v_site public.customer_sites;
  v_cust public.customers;
begin
  denied := private.cylinder_authorize(p_actor, p_session, p_organization, 'geofence.read');
  if denied is not null then return jsonb_build_object('code', denied); end if;
  select g.* into v_geo from public.geofences g where g.id = p_geofence and g.organization_id = p_organization;
  if not found then return jsonb_build_object('code', 'NOT_FOUND'); end if;
  select s.* into v_site from public.customer_sites s where s.id = v_geo.site_id;
  select c.* into v_cust from public.customers c where c.id = v_site.customer_id;
  return jsonb_build_object(
    'code', 'FOUND',
    'geofence', jsonb_build_object(
      'id', v_geo.id, 'name', v_geo.name, 'status', v_geo.status, 'version', v_geo.version, 'site_id', v_site.id, 'site_name', v_site.name,
      'site_status', v_site.status, 'customer_id', v_cust.id, 'customer_name', v_cust.legal_name,
      -- Área calculada só no servidor: o polígono pela geografia e o círculo pela fórmula (a área guardada é circunscrita).
      'area_m2', round(case v_geo.shape when 'circle' then pi() * v_geo.radius_m * v_geo.radius_m else extensions.st_area(v_geo.area) end)::bigint)
      || private.geofence_shape_json(v_geo));
end $$;

-- "Quais geocercas ativas contêm este ponto?" (RF-016): pré-filtro por caixa no índice GiST e decisão exata depois. Nada é gravado.
create function public.geofences_containing_point(
  p_actor uuid, p_session uuid, p_organization uuid, p_latitude numeric, p_longitude numeric, p_site uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  denied text;
  v_point extensions.geography;
begin
  denied := private.cylinder_authorize(p_actor, p_session, p_organization, 'geofence.read');
  if denied is not null then return jsonb_build_object('code', denied); end if;
  if p_latitude is null or p_latitude not between -90 and 90 then
    return jsonb_build_object('code', 'VALIDATION_FAILED', 'fields', private.field_error('latitude', 'A latitude vai de -90 a 90.'));
  end if;
  if p_longitude is null or p_longitude not between -180 and 180 then
    return jsonb_build_object('code', 'VALIDATION_FAILED', 'fields', private.field_error('longitude', 'A longitude vai de -180 a 180.'));
  end if;
  v_point := extensions.st_setsrid(extensions.st_makepoint(p_longitude, p_latitude), 4326)::extensions.geography;
  return jsonb_build_object('code', 'FOUND', 'geofences', coalesce((
    select jsonb_agg(jsonb_build_object('id', g.id, 'name', g.name, 'shape', g.shape, 'site_id', g.site_id) order by lower(g.name), g.id)
      from public.geofences g
     where g.organization_id = p_organization and g.status = 'active' and (p_site is null or g.site_id = p_site)
       and g.area operator(extensions.&&) v_point
       and case g.shape when 'circle' then extensions.st_dwithin(g.center, v_point, g.radius_m) else extensions.st_covers(g.area, v_point) end), '[]'::jsonb));
end $$;

create function public.point_in_geofence(
  p_actor uuid, p_session uuid, p_organization uuid, p_geofence uuid, p_latitude numeric, p_longitude numeric)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  denied text;
  v_geo public.geofences;
  v_point extensions.geography;
begin
  denied := private.cylinder_authorize(p_actor, p_session, p_organization, 'geofence.read');
  if denied is not null then return jsonb_build_object('code', denied); end if;
  if p_latitude is null or p_latitude not between -90 and 90 then
    return jsonb_build_object('code', 'VALIDATION_FAILED', 'fields', private.field_error('latitude', 'A latitude vai de -90 a 90.'));
  end if;
  if p_longitude is null or p_longitude not between -180 and 180 then
    return jsonb_build_object('code', 'VALIDATION_FAILED', 'fields', private.field_error('longitude', 'A longitude vai de -180 a 180.'));
  end if;
  select g.* into v_geo from public.geofences g where g.id = p_geofence and g.organization_id = p_organization;
  if not found then return jsonb_build_object('code', 'NOT_FOUND'); end if;
  if v_geo.status <> 'active' then return jsonb_build_object('code', 'INACTIVE_RECORD'); end if;
  v_point := extensions.st_setsrid(extensions.st_makepoint(p_longitude, p_latitude), 4326)::extensions.geography;
  -- Borda conta como dentro: ST_DWithin e ST_Covers incluem o contorno.
  return jsonb_build_object('code', 'FOUND', 'inside',
    case v_geo.shape when 'circle' then extensions.st_dwithin(v_geo.center, v_point, v_geo.radius_m) else extensions.st_covers(v_geo.area, v_point) end);
end $$;

revoke all on function private.build_geofence_area(text, jsonb, integer, jsonb), private.geofence_overlaps(uuid, extensions.geography, uuid),
  private.geofence_shape_json(public.geofences) from public, anon, authenticated;
revoke all on function
  public.create_geofence(uuid, uuid, uuid, uuid, text, text, jsonb, integer, jsonb),
  public.update_geofence(uuid, uuid, uuid, uuid, bigint, text, text, jsonb, integer, jsonb),
  public.list_geofences(uuid, uuid, uuid, uuid, uuid, text, text, text, text, integer),
  public.get_geofence(uuid, uuid, uuid, uuid),
  public.geofences_containing_point(uuid, uuid, uuid, numeric, numeric, uuid),
  public.point_in_geofence(uuid, uuid, uuid, uuid, numeric, numeric) from public, anon, authenticated;
grant execute on function
  public.create_geofence(uuid, uuid, uuid, uuid, text, text, jsonb, integer, jsonb),
  public.update_geofence(uuid, uuid, uuid, uuid, bigint, text, text, jsonb, integer, jsonb),
  public.list_geofences(uuid, uuid, uuid, uuid, uuid, text, text, text, text, integer),
  public.get_geofence(uuid, uuid, uuid, uuid),
  public.geofences_containing_point(uuid, uuid, uuid, numeric, numeric, uuid),
  public.point_in_geofence(uuid, uuid, uuid, uuid, numeric, numeric) to service_role;
