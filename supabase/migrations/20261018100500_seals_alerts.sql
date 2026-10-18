-- Spec 012, US6: alertas do lacre numa lista única (RF-016, RF-035, RF-036, RF-036a). Reconhecer e encerrar exigem `seal.operate`;
-- encerrar exige observação de 5 a 500 caracteres e gera auditoria, sem a observação em texto aberto (RF-039).

-- Toda notificação segue a mesma regra (RF-036a): possível extravio e todo alerta alto ou crítico.
create or replace function private.open_seal_alert(p_device uuid, p_kind text, p_severity text, p_source text, p_context jsonb, p_requires_push boolean)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid;
  v_cylinder uuid;
  v_id uuid;
begin
  select d.organization_id into v_org from public.seal_devices d where d.id = p_device;
  select b.cylinder_id into v_cylinder from public.seal_bindings b where b.device_id = p_device and b.unbound_at is null;
  insert into public.seal_alerts (organization_id, device_id, cylinder_id, kind, severity, source, context, requires_push)
  values (v_org, p_device, v_cylinder, p_kind, p_severity, p_source, coalesce(p_context, '{}'),
    p_requires_push or p_kind = 'possible_loss' or p_severity in ('high', 'critical'))
  on conflict (device_id, kind) where status <> 'closed'
  do update set context = public.seal_alerts.context || excluded.context, updated_at = now()
  returning id into v_id;
  perform private.seal_broadcast(v_org, 'alert', p_device, v_cylinder);
  return v_id;
end $$;

-- Idempotência dos comandos da tela (como `trip_replay`): o mesmo `request_id` devolve o resultado gravado; com outra operação, REQUEST_REUSED.
create function private.seal_replay(p_organization uuid, p_request uuid, p_operation text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_req private.seal_requests;
begin
  if p_request is null then
    return jsonb_build_object('code', 'VALIDATION_FAILED', 'fields', private.field_error('request_id', 'Campo obrigatório.'));
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_organization::text || ':seal-request:' || p_request::text, 0));
  select r.* into v_req from private.seal_requests r where r.organization_id = p_organization and r.request_id = p_request;
  if v_req.request_id is null then return null; end if;
  if v_req.operation <> p_operation then return jsonb_build_object('code', 'REQUEST_REUSED'); end if;
  return v_req.result || jsonb_build_object('replayed', true);
end $$;

create function private.seal_remember(p_organization uuid, p_request uuid, p_operation text, p_result jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  insert into private.seal_requests (organization_id, request_id, operation, result) values (p_organization, p_request, p_operation, p_result);
  return p_result;
end $$;

create function private.seal_alert_view(a public.seal_alerts) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id', a.id, 'kind', a.kind, 'severity', a.severity, 'source', a.source, 'status', a.status,
    'opened_at', a.opened_at, 'recovered_at', a.recovered_at, 'acknowledged_at', a.acknowledged_at, 'closed_at', a.closed_at,
    'device', jsonb_build_object('id', d.id, 'device_code', d.device_code, 'label', d.label),
    'cylinder', case when c.id is null then null else jsonb_build_object('id', c.id, 'serial_number', c.serial_number) end,
    'trip_id', a.context->'trip_id', 'site_id', a.context->'site_id')
  from public.seal_devices d left join public.cylinders c on c.id = a.cylinder_id where d.id = a.device_id
$$;

create function public.list_alerts(p_actor uuid, p_session uuid, p_organization uuid, p_status text default null, p_severity text default null,
  p_kind text default null, p_offset integer default 0, p_limit integer default 50)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  denied text;
begin
  denied := private.cylinder_authorize(p_actor, p_session, p_organization, 'seal.read');
  if denied is not null then return jsonb_build_object('code', denied); end if;
  return jsonb_build_object('code', 'LISTED',
    'total', (select count(*) from public.seal_alerts a where a.organization_id = p_organization
      and (p_status is null or (p_status = 'active' and a.status <> 'closed') or a.status = p_status)
      and (p_severity is null or a.severity = p_severity) and (p_kind is null or a.kind = p_kind)),
    'items', coalesce((select jsonb_agg(private.seal_alert_view(a) order by a.opened_at desc, a.id)
      from (select * from public.seal_alerts a where a.organization_id = p_organization
              and (p_status is null or (p_status = 'active' and a.status <> 'closed') or a.status = p_status)
              and (p_severity is null or a.severity = p_severity) and (p_kind is null or a.kind = p_kind)
            order by a.opened_at desc, a.id offset greatest(p_offset, 0) limit least(greatest(p_limit, 1), 200)) a), '[]'::jsonb));
end $$;

-- Detalhe do alerta (destino do toque na notificação, RF-036c): o alerta, o resumo do lacre com a última posição e o contexto.
create function public.get_alert(p_actor uuid, p_session uuid, p_organization uuid, p_alert uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  denied text;
  v_alert public.seal_alerts;
begin
  denied := private.cylinder_authorize(p_actor, p_session, p_organization, 'seal.read');
  if denied is not null then return jsonb_build_object('code', denied); end if;
  select a.* into v_alert from public.seal_alerts a where a.id = p_alert and a.organization_id = p_organization;
  if v_alert.id is null then return jsonb_build_object('code', 'NOT_FOUND'); end if;
  return jsonb_build_object('code', 'FOUND', 'alert', private.seal_alert_view(v_alert) || jsonb_build_object(
    'close_note', v_alert.close_note, 'seal', private.seal_device_summary(v_alert.device_id)));
end $$;

create function public.acknowledge_alert(p_actor uuid, p_session uuid, p_organization uuid, p_request uuid, p_alert uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  denied text;
  replay jsonb;
  v_alert public.seal_alerts;
begin
  denied := private.cylinder_authorize(p_actor, p_session, p_organization, 'seal.operate');
  if denied is not null then return jsonb_build_object('code', denied); end if;
  replay := private.seal_replay(p_organization, p_request, 'acknowledge_alert');
  if replay is not null then return replay; end if;
  select a.* into v_alert from public.seal_alerts a where a.id = p_alert and a.organization_id = p_organization for update;
  if v_alert.id is null then return jsonb_build_object('code', 'NOT_FOUND'); end if;
  if v_alert.status = 'closed' then return jsonb_build_object('code', 'ALERT_CLOSED'); end if;
  update public.seal_alerts set status = 'acknowledged', acknowledged_at = coalesce(acknowledged_at, now()), acknowledged_by = coalesce(acknowledged_by, p_actor),
    updated_at = now() where id = p_alert;
  perform private.seal_broadcast(p_organization, 'alert', v_alert.device_id, v_alert.cylinder_id);
  return private.seal_remember(p_organization, p_request, 'acknowledge_alert', jsonb_build_object('code', 'ACKNOWLEDGED'));
end $$;

create function public.close_alert(p_actor uuid, p_session uuid, p_organization uuid, p_request uuid, p_alert uuid, p_note text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  denied text;
  replay jsonb;
  v_alert public.seal_alerts;
  v_note text := nullif(btrim(regexp_replace(coalesce(p_note, ''), '\s+', ' ', 'g')), '');
begin
  denied := private.cylinder_authorize(p_actor, p_session, p_organization, 'seal.operate');
  if denied is not null then return jsonb_build_object('code', denied); end if;
  replay := private.seal_replay(p_organization, p_request, 'close_alert');
  if replay is not null then return replay; end if;
  if not private.seal_text_ok(v_note) then return jsonb_build_object('code', 'NOTE_REQUIRED'); end if;
  select a.* into v_alert from public.seal_alerts a where a.id = p_alert and a.organization_id = p_organization for update;
  if v_alert.id is null then return jsonb_build_object('code', 'NOT_FOUND'); end if;
  if v_alert.status = 'closed' then return jsonb_build_object('code', 'ALERT_CLOSED'); end if;
  update public.seal_alerts set status = 'closed', closed_at = now(), closed_by = p_actor, close_note = v_note,
    acknowledged_at = coalesce(acknowledged_at, now()), acknowledged_by = coalesce(acknowledged_by, p_actor), updated_at = now()
   where id = p_alert;
  perform private.write_audit_event(p_organization, p_actor, p_session, 'seal.alert_close', 'seal_alert', p_alert::text, 'success', null, null,
    jsonb_build_object('alert_id', p_alert, 'kind', v_alert.kind, 'severity', v_alert.severity, 'device_id', v_alert.device_id));
  perform private.seal_broadcast(p_organization, 'alert', v_alert.device_id, v_alert.cylinder_id);
  return private.seal_remember(p_organization, p_request, 'close_alert', jsonb_build_object('code', 'CLOSED'));
end $$;

revoke all on function private.seal_replay(uuid, uuid, text), private.seal_remember(uuid, uuid, text, jsonb),
  private.seal_alert_view(public.seal_alerts) from public, anon, authenticated;
revoke all on function public.list_alerts(uuid, uuid, uuid, text, text, text, integer, integer), public.get_alert(uuid, uuid, uuid, uuid),
  public.acknowledge_alert(uuid, uuid, uuid, uuid, uuid), public.close_alert(uuid, uuid, uuid, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.list_alerts(uuid, uuid, uuid, text, text, text, integer, integer), public.get_alert(uuid, uuid, uuid, uuid),
  public.acknowledge_alert(uuid, uuid, uuid, uuid, uuid), public.close_alert(uuid, uuid, uuid, uuid, uuid, text) to service_role;
