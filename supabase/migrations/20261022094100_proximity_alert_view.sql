-- Spec 015 (T069): o alerta de afastamento aponta a ocorrência de proximidade e diz se foi detectado depois (retrospectivo), para a
-- tela de alertas da Spec 012 levar ao detalhe da ocorrência. Os demais campos da visão do alerta não mudam.
create or replace function private.seal_alert_view(a public.seal_alerts) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id', a.id, 'kind', a.kind, 'severity', a.severity, 'source', a.source, 'status', a.status,
    'opened_at', a.opened_at, 'recovered_at', a.recovered_at, 'acknowledged_at', a.acknowledged_at, 'closed_at', a.closed_at,
    'device', jsonb_build_object('id', d.id, 'device_code', d.device_code, 'label', d.label),
    'cylinder', case when c.id is null then null else jsonb_build_object('id', c.id, 'serial_number', c.serial_number) end,
    'trip_id', a.context->'trip_id', 'site_id', a.context->'site_id',
    'occurrence_id', a.context->'occurrence_id', 'retrospective', coalesce((a.context->>'retrospective')::boolean, false))
  from public.seal_devices d left join public.cylinders c on c.id = a.cylinder_id where d.id = a.device_id
$$;
revoke all on function private.seal_alert_view(public.seal_alerts) from public, anon, authenticated;
