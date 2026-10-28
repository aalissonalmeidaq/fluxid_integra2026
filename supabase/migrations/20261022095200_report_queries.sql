-- Spec 015 (T078; US5, RF-024 a RF-027, RF-036, RF-037): consultas canônicas dos seis relatórios. Uma fonte única
-- (`private.report_rows`) alimenta o resumo, as páginas da tabela e o arquivo exportado, sempre com o mesmo snapshot: um registro só
-- entra se já existia no instante do snapshot. A leitura segue a matriz do contrato e é decidida aqui, no servidor; `report.export` não
-- amplia leitura. Ordem estável por (instante, id). Sem coordenadas e sem nome de recebedor (minimização, RF-038).

create function private.report_permission(p_type text) returns text
language sql immutable security definer set search_path = '' as $$
  select case p_type
    when 'trips' then 'trip.read' when 'deliveries' then 'trip.read'
    when 'telemetry_availability' then 'tracking.read' when 'proximity' then 'tracking.read'
    when 'alerts' then 'seal.read' when 'custody' then 'cylinder.history' end
$$;

create function private.report_label(p_type text) returns text
language sql immutable security definer set search_path = '' as $$
  select case p_type
    when 'trips' then 'Viagens' when 'telemetry_availability' then 'Disponibilidade de telemetria'
    when 'proximity' then 'Ocorrências de proximidade' when 'alerts' then 'Alertas'
    when 'deliveries' then 'Entregas' when 'custody' then 'Histórico de custódia' end
$$;

-- Filtros aceitos por tipo, além do período (from e to, obrigatórios).
create function private.report_allowed_filters(p_type text) returns text[]
language sql immutable security definer set search_path = '' as $$
  select case p_type
    when 'trips' then array['trip_id', 'vehicle_id', 'driver_id', 'status']
    when 'telemetry_availability' then array['trip_id', 'vehicle_id', 'driver_id']
    when 'proximity' then array['trip_id', 'cylinder_id', 'seal_id', 'status']
    when 'alerts' then array['cylinder_id', 'seal_id', 'status']
    when 'deliveries' then array['trip_id']
    when 'custody' then array['cylinder_id', 'trip_id'] end
$$;

-- Nulo quando válido; senão o código sanitizado (INVALID_FILTER ou INVALID_PERIOD).
create function private.report_validate(p_type text, p_filters jsonb) returns text
language plpgsql immutable security definer set search_path = '' as $$
declare
  v_key text;
  v_from timestamptz;
  v_to timestamptz;
begin
  if private.report_permission(p_type) is null or p_filters is null or jsonb_typeof(p_filters) <> 'object' then return 'INVALID_FILTER'; end if;
  for v_key in select jsonb_object_keys(p_filters) loop
    if v_key in ('from', 'to') then continue; end if;
    if not (v_key = any (private.report_allowed_filters(p_type))) or jsonb_typeof(p_filters->v_key) <> 'string' then return 'INVALID_FILTER'; end if;
    if v_key <> 'status' and (p_filters->>v_key) !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return 'INVALID_FILTER'; end if;
    if v_key = 'status' and (p_filters->>v_key) !~ '^[a-z_]{1,40}(,[a-z_]{1,40}){0,9}$' then return 'INVALID_FILTER'; end if;
  end loop;
  begin
    v_from := (p_filters->>'from')::timestamptz;
    v_to := (p_filters->>'to')::timestamptz;
  exception when others then
    return 'INVALID_PERIOD';
  end;
  if v_from is null or v_to is null or v_to <= v_from or v_to - v_from > interval '366 days' then return 'INVALID_PERIOD'; end if;
  return null;
end $$;

create function private.report_columns(p_type text) returns jsonb
language sql immutable security definer set search_path = '' as $$
  select case p_type
    when 'trips' then '[{"key":"trip_number","label":"Viagem"},{"key":"status","label":"Situação"},{"key":"planned_date","label":"Data planejada"},
      {"key":"started_at","label":"Início"},{"key":"completed_at","label":"Conclusão"},{"key":"cancelled_at","label":"Cancelamento"},
      {"key":"vehicle_plate","label":"Veículo"},{"key":"driver_name","label":"Motorista"},{"key":"stops","label":"Paradas"},{"key":"items","label":"Cilindros"}]'::jsonb
    when 'telemetry_availability' then '[{"key":"trip_number","label":"Viagem"},{"key":"platform","label":"Plataforma"},{"key":"capability","label":"Capacidade"},
      {"key":"status","label":"Situação da coleta"},{"key":"started_at","label":"Início da coleta"},{"key":"ended_at","label":"Fim da coleta"},
      {"key":"positions","label":"Posições recebidas"},{"key":"retrospective_positions","label":"Recebidas depois"},
      {"key":"last_position_at","label":"Última posição"},{"key":"notifications_denied","label":"Notificação recusada"}]'::jsonb
    when 'proximity' then '[{"key":"opened_at","label":"Confirmada em"},{"key":"trip_number","label":"Viagem"},{"key":"serial_number","label":"Cilindro"},
      {"key":"device_label","label":"Lacre"},{"key":"status","label":"Situação"},{"key":"detection_kind","label":"Detecção"},
      {"key":"acknowledged_at","label":"Reconhecida em"},{"key":"closed_at","label":"Encerrada em"},{"key":"close_note","label":"Observação"}]'::jsonb
    when 'alerts' then '[{"key":"opened_at","label":"Aberto em"},{"key":"kind","label":"Tipo"},{"key":"severity","label":"Severidade"},
      {"key":"status","label":"Situação"},{"key":"device_label","label":"Lacre"},{"key":"serial_number","label":"Cilindro"},{"key":"closed_at","label":"Encerrado em"}]'::jsonb
    when 'deliveries' then '[{"key":"delivered_at","label":"Entregue em"},{"key":"trip_number","label":"Viagem"},{"key":"stop_position","label":"Parada"},
      {"key":"site_name","label":"Unidade"},{"key":"delivered_items","label":"Cilindros entregues"},{"key":"not_delivered_items","label":"Não entregues"},
      {"key":"outside_geofence","label":"Fora da geocerca"},{"key":"corrected","label":"Corrigida"}]'::jsonb
    when 'custody' then '[{"key":"occurred_at","label":"Data e hora"},{"key":"serial_number","label":"Cilindro"},{"key":"event_type","label":"Evento"},
      {"key":"trip_number","label":"Viagem"}]'::jsonb end
$$;

-- Fonte única: (id, instante, valores) do recorte autorizado, já filtrado por período e snapshot.
create function private.report_rows(p_organization uuid, p_type text, p_filters jsonb, p_snapshot timestamptz)
returns table (id uuid, occurred_at timestamptz, row_values jsonb)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_from timestamptz := (p_filters->>'from')::timestamptz;
  v_to timestamptz := (p_filters->>'to')::timestamptz;
  v_trip uuid := (p_filters->>'trip_id')::uuid;
  v_vehicle uuid := (p_filters->>'vehicle_id')::uuid;
  v_driver uuid := (p_filters->>'driver_id')::uuid;
  v_cylinder uuid := (p_filters->>'cylinder_id')::uuid;
  v_seal uuid := (p_filters->>'seal_id')::uuid;
  v_status text[] := string_to_array(p_filters->>'status', ',');
begin
  if p_type = 'trips' then
    return query
    select t.id, coalesce(t.started_at, t.created_at), jsonb_build_object('trip_number', t.number, 'status', t.status, 'planned_date', t.planned_date,
             'started_at', t.started_at, 'completed_at', t.completed_at, 'cancelled_at', t.cancelled_at, 'vehicle_plate', v.plate, 'driver_name', d.full_name,
             'stops', (select count(*) from public.trip_stops s where s.trip_id = t.id and s.status <> 'removed'),
             'items', (select count(*) from public.trip_items i where i.trip_id = t.id and i.item_status <> 'removed'))
      from public.trips t
      join public.vehicles v on v.id = t.vehicle_id and v.organization_id = t.organization_id
      join public.drivers d on d.id = t.driver_id and d.organization_id = t.organization_id
     where t.organization_id = p_organization and t.created_at <= p_snapshot
       and coalesce(t.started_at, t.created_at) between v_from and v_to
       and (v_trip is null or t.id = v_trip) and (v_vehicle is null or t.vehicle_id = v_vehicle) and (v_driver is null or t.driver_id = v_driver)
       and (v_status is null or t.status = any (v_status));
  elsif p_type = 'telemetry_availability' then
    return query
    select s.id, s.started_at, jsonb_build_object('trip_number', t.number, 'platform', s.platform, 'capability', s.capability, 'status', s.status,
             'started_at', s.started_at, 'ended_at', s.ended_at, 'notifications_denied', s.notifications_denied,
             'positions', (select count(*) from public.mobile_positions m where m.tracking_session_id = s.id and m.received_at <= p_snapshot),
             'retrospective_positions', (select count(*) from public.mobile_positions m where m.tracking_session_id = s.id and m.sync_kind = 'retrospective'
                                          and m.received_at <= p_snapshot),
             'last_position_at', (select max(m.observed_at) from public.mobile_positions m where m.tracking_session_id = s.id and m.received_at <= p_snapshot))
      from public.tracking_sessions s join public.trips t on t.id = s.trip_id
     where s.organization_id = p_organization and s.created_at <= p_snapshot and s.started_at between v_from and v_to
       and (v_trip is null or s.trip_id = v_trip) and (v_vehicle is null or t.vehicle_id = v_vehicle) and (v_driver is null or t.driver_id = v_driver);
  elsif p_type = 'proximity' then
    return query
    select o.id, o.opened_at, jsonb_build_object('opened_at', o.opened_at, 'trip_number', t.number, 'serial_number', c.serial_number, 'device_label', d.label,
             'status', o.status, 'detection_kind', o.detection_kind, 'acknowledged_at', o.acknowledged_at, 'closed_at', o.closed_at, 'close_note', o.close_note)
      from public.proximity_occurrences o
      join public.trips t on t.id = o.trip_id
      join public.cylinders c on c.id = o.cylinder_id
      join public.seal_devices d on d.id = o.device_id
     where o.organization_id = p_organization and o.created_at <= p_snapshot and o.opened_at between v_from and v_to
       and (v_trip is null or o.trip_id = v_trip) and (v_cylinder is null or o.cylinder_id = v_cylinder) and (v_seal is null or o.device_id = v_seal)
       and (v_status is null or o.status = any (v_status));
  elsif p_type = 'alerts' then
    return query
    select a.id, a.opened_at, jsonb_build_object('opened_at', a.opened_at, 'kind', a.kind, 'severity', a.severity, 'status', a.status, 'device_label', d.label,
             'serial_number', c.serial_number, 'closed_at', a.closed_at)
      from public.seal_alerts a
      join public.seal_devices d on d.id = a.device_id
      left join public.cylinders c on c.id = a.cylinder_id
     where a.organization_id = p_organization and a.opened_at <= p_snapshot and a.opened_at between v_from and v_to
       and (v_cylinder is null or a.cylinder_id = v_cylinder) and (v_seal is null or a.device_id = v_seal) and (v_status is null or a.status = any (v_status));
  elsif p_type = 'deliveries' then
    return query
    select dl.id, dl.delivered_at, jsonb_build_object('delivered_at', dl.delivered_at, 'trip_number', t.number, 'stop_position', st.position, 'site_name', cs.name,
             'delivered_items', (select count(*) from jsonb_array_elements(dl.results) r where (r->>'delivered')::boolean),
             'not_delivered_items', (select count(*) from jsonb_array_elements(dl.results) r where not (r->>'delivered')::boolean),
             'outside_geofence', dl.outside_geofence, 'corrected', dl.supersedes_id is not null)
      from public.trip_deliveries dl
      join public.trip_stops st on st.id = dl.stop_id
      join public.trips t on t.id = st.trip_id
      join public.customer_sites cs on cs.id = st.site_id
     where dl.organization_id = p_organization and dl.recorded_at <= p_snapshot and dl.delivered_at between v_from and v_to
       and not exists (select 1 from public.trip_deliveries newer where newer.supersedes_id = dl.id and newer.recorded_at <= p_snapshot)
       and (v_trip is null or t.id = v_trip);
  elsif p_type = 'custody' then
    return query
    select e.id, e.occurred_at, jsonb_build_object('occurred_at', e.occurred_at, 'serial_number', c.serial_number, 'event_type', e.event_type,
             'trip_number', (select t.number from public.trips t where t.id = nullif(e.data->>'trip_id', '')::uuid))
      from public.cylinder_events e join public.cylinders c on c.id = e.cylinder_id
     where e.organization_id = p_organization and e.occurred_at <= p_snapshot and e.occurred_at between v_from and v_to
       and e.event_type in ('stock_in', 'stock_out_inactivation', 'trip_reserved', 'trip_released', 'trip_departed', 'trip_delivered', 'trip_returned')
       and (v_cylinder is null or e.cylinder_id = v_cylinder) and (v_trip is null or e.data->>'trip_id' = v_trip::text);
  end if;
end $$;

-- Totais do recorte, cada um com o significado e a natureza (medido ou agregado).
create function private.report_totals(p_organization uuid, p_type text, p_filters jsonb, p_snapshot timestamptz) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v jsonb;
begin
  with r as (select x.row_values as j from private.report_rows(p_organization, p_type, p_filters, p_snapshot) x)
  select case p_type
    when 'trips' then jsonb_build_array(
      jsonb_build_object('key', 'trips', 'value', count(*), 'meaning', 'Viagens no período', 'kind', 'measured'),
      jsonb_build_object('key', 'in_progress', 'value', count(*) filter (where j->>'status' = 'in_progress'), 'meaning', 'Em andamento', 'kind', 'measured'),
      jsonb_build_object('key', 'completed', 'value', count(*) filter (where j->>'status' = 'completed'), 'meaning', 'Concluídas', 'kind', 'measured'),
      jsonb_build_object('key', 'cancelled', 'value', count(*) filter (where j->>'status' = 'cancelled'), 'meaning', 'Canceladas', 'kind', 'measured'))
    when 'telemetry_availability' then jsonb_build_array(
      jsonb_build_object('key', 'sessions', 'value', count(*), 'meaning', 'Coletas de celular no período', 'kind', 'measured'),
      jsonb_build_object('key', 'positions', 'value', coalesce(sum((j->>'positions')::int), 0), 'meaning', 'Posições recebidas', 'kind', 'aggregated'),
      jsonb_build_object('key', 'retrospective_positions', 'value', coalesce(sum((j->>'retrospective_positions')::int), 0), 'meaning', 'Posições recebidas depois', 'kind', 'aggregated'),
      jsonb_build_object('key', 'degraded_sessions', 'value', count(*) filter (where j->>'capability' <> 'full' or (j->>'notifications_denied')::boolean),
        'meaning', 'Coletas degradadas', 'kind', 'measured'))
    when 'proximity' then jsonb_build_array(
      jsonb_build_object('key', 'occurrences', 'value', count(*), 'meaning', 'Ocorrências confirmadas', 'kind', 'measured'),
      jsonb_build_object('key', 'open', 'value', count(*) filter (where j->>'status' in ('open', 'acknowledged')), 'meaning', 'Ainda em tratamento', 'kind', 'measured'),
      jsonb_build_object('key', 'closed', 'value', count(*) filter (where j->>'status' = 'closed'), 'meaning', 'Encerradas', 'kind', 'measured'),
      jsonb_build_object('key', 'historical_only', 'value', count(*) filter (where j->>'status' = 'historical_only'), 'meaning', 'Só no histórico', 'kind', 'measured'),
      jsonb_build_object('key', 'retrospective', 'value', count(*) filter (where j->>'detection_kind' = 'retrospective'), 'meaning', 'Detectadas depois', 'kind', 'measured'))
    when 'alerts' then jsonb_build_array(
      jsonb_build_object('key', 'alerts', 'value', count(*), 'meaning', 'Alertas no período', 'kind', 'measured'),
      jsonb_build_object('key', 'critical', 'value', count(*) filter (where j->>'severity' = 'critical'), 'meaning', 'Críticos', 'kind', 'measured'),
      jsonb_build_object('key', 'high', 'value', count(*) filter (where j->>'severity' = 'high'), 'meaning', 'Altos', 'kind', 'measured'),
      jsonb_build_object('key', 'open', 'value', count(*) filter (where j->>'status' <> 'closed'), 'meaning', 'Ainda abertos', 'kind', 'measured'))
    when 'deliveries' then jsonb_build_array(
      jsonb_build_object('key', 'deliveries', 'value', count(*), 'meaning', 'Entregas registradas', 'kind', 'measured'),
      jsonb_build_object('key', 'delivered_items', 'value', coalesce(sum((j->>'delivered_items')::int), 0), 'meaning', 'Cilindros entregues', 'kind', 'aggregated'),
      jsonb_build_object('key', 'not_delivered_items', 'value', coalesce(sum((j->>'not_delivered_items')::int), 0), 'meaning', 'Cilindros não entregues', 'kind', 'aggregated'),
      jsonb_build_object('key', 'outside_geofence', 'value', count(*) filter (where (j->>'outside_geofence')::boolean), 'meaning', 'Fora da geocerca', 'kind', 'measured'))
    else jsonb_build_array(
      jsonb_build_object('key', 'events', 'value', count(*), 'meaning', 'Movimentações de custódia', 'kind', 'measured'),
      jsonb_build_object('key', 'departed', 'value', count(*) filter (where j->>'event_type' = 'trip_departed'), 'meaning', 'Saídas em viagem', 'kind', 'measured'),
      jsonb_build_object('key', 'delivered', 'value', count(*) filter (where j->>'event_type' = 'trip_delivered'), 'meaning', 'Entregas ao cliente', 'kind', 'measured'),
      jsonb_build_object('key', 'returned', 'value', count(*) filter (where j->>'event_type' = 'trip_returned'), 'meaning', 'Devoluções ao estoque', 'kind', 'measured'))
    end into v
  from r;
  return v;
end $$;

-- Critérios por extenso, para a tela e o arquivo.
create function private.report_criteria_text(p_filters jsonb) returns text
language sql immutable security definer set search_path = '' as $$
  select 'De ' || (p_filters->>'from') || ' até ' || (p_filters->>'to')
    || coalesce((select string_agg('; ' || k || ' = ' || (p_filters->>k), '' order by k) from jsonb_object_keys(p_filters) k where k not in ('from', 'to')), '')
$$;

create function public.query_report_summary(p_actor uuid, p_session uuid, p_organization uuid, p_type text, p_filters jsonb, p_snapshot_at timestamptz default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  denied text;
  invalid text;
  v_snapshot timestamptz := least(coalesce(p_snapshot_at, now()), now());
begin
  if private.report_permission(p_type) is null then return jsonb_build_object('code', 'INVALID_FILTER'); end if;
  denied := private.tracking_authorize(p_actor, p_session, p_organization, private.report_permission(p_type));
  if denied is not null then return jsonb_build_object('code', denied); end if;
  invalid := private.report_validate(p_type, p_filters);
  if invalid is not null then return jsonb_build_object('code', invalid); end if;
  return jsonb_build_object('code', 'FOUND', 'report_type', p_type, 'label', private.report_label(p_type),
    'organization', (select jsonb_build_object('id', o.id, 'display_name', o.display_name) from public.organizations o where o.id = p_organization),
    'criteria', p_filters, 'criteria_text', private.report_criteria_text(p_filters), 'generated_at', now(), 'snapshot_at', v_snapshot,
    'columns', private.report_columns(p_type), 'totals', private.report_totals(p_organization, p_type, p_filters, v_snapshot),
    'row_count', (select count(*) from private.report_rows(p_organization, p_type, p_filters, v_snapshot)));
end $$;

create function public.query_report_rows(p_actor uuid, p_session uuid, p_organization uuid, p_type text, p_filters jsonb, p_snapshot_at timestamptz default null,
  p_cursor_at timestamptz default null, p_cursor_id uuid default null, p_limit integer default 50)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  denied text;
  invalid text;
  v_snapshot timestamptz := least(coalesce(p_snapshot_at, now()), now());
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_rows jsonb;
  v_count integer;
  v_last jsonb;
begin
  if private.report_permission(p_type) is null then return jsonb_build_object('code', 'INVALID_FILTER'); end if;
  denied := private.tracking_authorize(p_actor, p_session, p_organization, private.report_permission(p_type));
  if denied is not null then return jsonb_build_object('code', denied); end if;
  invalid := private.report_validate(p_type, p_filters);
  if invalid is not null then return jsonb_build_object('code', invalid); end if;
  if (p_cursor_at is null) <> (p_cursor_id is null) then return jsonb_build_object('code', 'INVALID_FILTER'); end if;

  select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'occurred_at', x.occurred_at, 'values', x.row_values) order by x.occurred_at, x.id), '[]'::jsonb), count(*)
    into v_rows, v_count
    from (select r.id, r.occurred_at, r.row_values from private.report_rows(p_organization, p_type, p_filters, v_snapshot) r
           where p_cursor_at is null or (r.occurred_at, r.id) > (p_cursor_at, p_cursor_id)
           order by r.occurred_at, r.id limit v_limit + 1) x;
  if v_count > v_limit then
    v_rows := v_rows - v_limit;
    v_last := v_rows -> (v_limit - 1);
  end if;
  return jsonb_build_object('code', 'LISTED', 'snapshot_at', v_snapshot, 'columns', private.report_columns(p_type), 'rows', v_rows,
    'next_cursor', case when v_last is null then null else jsonb_build_object('at', v_last->>'occurred_at', 'id', v_last->>'id') end);
end $$;

revoke all on function private.report_permission(text), private.report_label(text), private.report_allowed_filters(text), private.report_validate(text, jsonb),
  private.report_columns(text), private.report_rows(uuid, text, jsonb, timestamptz), private.report_totals(uuid, text, jsonb, timestamptz),
  private.report_criteria_text(jsonb) from public, anon, authenticated;
revoke all on function public.query_report_summary(uuid, uuid, uuid, text, jsonb, timestamptz),
  public.query_report_rows(uuid, uuid, uuid, text, jsonb, timestamptz, timestamptz, uuid, integer) from public, anon, authenticated;
grant execute on function public.query_report_summary(uuid, uuid, uuid, text, jsonb, timestamptz),
  public.query_report_rows(uuid, uuid, uuid, text, jsonb, timestamptz, timestamptz, uuid, integer) to service_role;
