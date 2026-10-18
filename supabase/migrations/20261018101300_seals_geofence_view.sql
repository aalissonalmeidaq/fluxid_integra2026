-- Spec 012: geocercas sobre o mapa do lacre, para conferir de olho se ele está onde deveria (detalhe do lacre, do cilindro e do
-- alerta). Volta a geocerca esperada (unidade em vigilância ou destino da viagem em andamento) e as da organização a até 2 km da
-- última posição, com "dentro" e a distância calculados aqui (PostGIS), nunca no navegador. A geometria das geocercas é dado de
-- cadastro: só sai para quem também tem `geofence.read`. Nenhuma coordenada vai para auditoria ou evento.

create function public.seal_geofence_view(p_actor uuid, p_session uuid, p_organization uuid, p_device uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  denied text;
  v_device public.seal_devices;
  v_point extensions.geography;
  v_risk jsonb;
  v_site uuid;
  v_reason text;
  v_access boolean;
begin
  denied := private.cylinder_authorize(p_actor, p_session, p_organization, 'seal.read');
  if denied is not null then return jsonb_build_object('code', denied); end if;
  select d.* into v_device from public.seal_devices d where d.id = p_device and d.organization_id = p_organization;
  if v_device.id is null then return jsonb_build_object('code', 'NOT_FOUND'); end if;

  select p.point into v_point from public.seal_positions p where p.id = v_device.last_position_id;
  v_risk := private.seal_risk(v_device.id);
  -- Esperada: a unidade em vigilância; sem ela, o destino do cilindro na viagem em andamento.
  if (v_risk->>'site_id') is not null then
    v_site := (v_risk->>'site_id')::uuid;
    v_reason := 'watch';
  elsif (v_risk->>'trip_id') is not null then
    select s.site_id into v_site from public.trip_items i join public.trip_stops s on s.id = i.stop_id
     where i.cylinder_id = (v_risk->>'cylinder_id')::uuid and i.trip_id = (v_risk->>'trip_id')::uuid and i.is_open limit 1;
    v_reason := case when v_site is null then null else 'trip' end;
  end if;

  v_access := private.user_has_permission(p_actor, p_organization, 'geofence.read');
  return jsonb_build_object(
    'code', 'FOUND',
    'has_position', v_point is not null,
    'expected_reason', v_reason,
    'expected_site_name', (select s.name from public.customer_sites s where s.id = v_site),
    'geofence_access', v_access,
    'radius_nearby_m', 2000,
    'geofences', case when not v_access then '[]'::jsonb else coalesce((
      select jsonb_agg(x order by (x->>'expected')::boolean desc, (x->>'distance_m')::numeric nulls last, x->>'name') from (
        select jsonb_build_object(
          'id', g.id, 'name', g.name, 'site_id', g.site_id, 'site_name', s.name, 'shape', g.shape,
          'expected', g.site_id is not distinct from v_site,
          'center', case when g.center is null then null else jsonb_build_object(
            'latitude', round(extensions.st_y(g.center::extensions.geometry)::numeric, 6), 'longitude', round(extensions.st_x(g.center::extensions.geometry)::numeric, 6)) end,
          'radius_m', g.radius_m,
          'vertices', case when g.shape = 'polygon' then (
            select jsonb_agg(jsonb_build_object('latitude', (v->>'lat')::numeric, 'longitude', (v->>'lng')::numeric) order by n)
              from jsonb_array_elements(g.vertices) with ordinality as e(v, n)) else null end,
          'inside', case when v_point is null then null else extensions.st_covers(g.area, v_point) end,
          'distance_m', case when v_point is null then null else round(extensions.st_distance(g.area, v_point)::numeric) end) x
          from public.geofences g join public.customer_sites s on s.id = g.site_id
         where g.organization_id = p_organization and g.status = 'active'
           and (g.site_id = v_site or (v_point is not null and extensions.st_dwithin(g.area, v_point, 2000)))
         limit 20) t), '[]'::jsonb) end);
end $$;

revoke all on function public.seal_geofence_view(uuid, uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.seal_geofence_view(uuid, uuid, uuid, uuid) to service_role;
