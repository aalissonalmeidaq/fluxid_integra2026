-- Spec 010, US1: a viagem para guardar no aparelho e operar sem conexão (RF-006, RF-007; contracts/operacoes-servidor.md §3).
-- Devolve só o necessário para conferir, chegar e entregar offline: a situação e a versão da viagem, as paradas (com a unidade), os itens com o
-- cilindro e os identificadores ATIVOS já normalizados (maiúsculas), e as entregas já registradas só com o identificador e a parada (para acrescentar
-- foto ou assinatura depois). NUNCA devolve o nome nem a função do recebedor, as coordenadas registradas, anexos nem dados do motorista.
-- Exige `trip.operate` (quem pode conferir e chegar) e a viagem em `loading` ou `in_progress`.

create function public.query_trip_offline(p_actor uuid, p_session uuid, p_organization uuid, p_trip uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  denied text;
  t public.trips;
  v_vehicle public.vehicles;
begin
  denied := private.cylinder_authorize(p_actor, p_session, p_organization, 'trip.operate');
  if denied is not null then return jsonb_build_object('code', denied); end if;
  select x.* into t from public.trips x where x.id = p_trip and x.organization_id = p_organization;
  if not found then return jsonb_build_object('code', 'NOT_FOUND'); end if;
  if t.status not in ('loading', 'in_progress') then return jsonb_build_object('code', 'TRIP_STATE_INVALID', 'status', t.status); end if;
  select x.* into v_vehicle from public.vehicles x where x.id = t.vehicle_id;

  return jsonb_build_object(
    'code', 'OK',
    'fetched_at', now(),
    'trip', jsonb_build_object('id', t.id, 'number', t.number, 'planned_date', t.planned_date, 'status', t.status, 'version', t.version),
    'vehicle', jsonb_build_object('plate', v_vehicle.plate),
    'stops', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'position', s.position, 'status', s.status, 'arrived_at', s.arrived_at,
        'site', jsonb_build_object('id', cs.id, 'name', cs.name, 'city', cs.city, 'state', cs.state, 'customer_name', coalesce(cu.trade_name, cu.legal_name))) order by s.position nulls last, s.id)
        from public.trip_stops s join public.customer_sites cs on cs.id = s.site_id join public.customers cu on cu.id = cs.customer_id
       where s.trip_id = t.id and s.status <> 'removed'), '[]'::jsonb),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id, 'stop_id', i.stop_id, 'item_status', i.item_status, 'lock_status', i.lock_status,
        'cylinder', jsonb_build_object('id', c.id, 'serial_number', c.serial_number, 'gas', ct.gas, 'capacity_value', ct.capacity_value, 'capacity_unit', ct.capacity_unit),
        'identifiers', coalesce((select jsonb_agg(x.value_normalized order by x.value_normalized) from public.cylinder_identifiers x
                                  where x.cylinder_id = c.id and x.organization_id = p_organization and x.status = 'active'), '[]'::jsonb)) order by c.serial_number, i.id)
        from public.trip_items i join public.cylinders c on c.id = i.cylinder_id join public.cylinder_types ct on ct.id = c.cylinder_type_id
       where i.trip_id = t.id and i.item_status not in ('released') and i.stop_id in (select y.id from public.trip_stops y where y.trip_id = t.id and y.status <> 'removed')), '[]'::jsonb),
    'deliveries', coalesce((
      select jsonb_agg(jsonb_build_object('id', d.id, 'stop_id', d.stop_id) order by d.recorded_at, d.id)
        from public.trip_deliveries d join public.trip_stops s on s.id = d.stop_id where s.trip_id = t.id), '[]'::jsonb));
end $$;

revoke all on function public.query_trip_offline(uuid, uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.query_trip_offline(uuid, uuid, uuid, uuid) to service_role;
