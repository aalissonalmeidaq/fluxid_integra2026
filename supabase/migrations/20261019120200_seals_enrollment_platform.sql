-- Spec 013, US2: operações do Master sobre a fila de pedidos (contracts/operacoes-plataforma.md; research.md, itens 5 a 7; RF-010 a
-- RF-014, RN-005, RN-006; constituição, princípio III). Toda operação exige platform.manage numa sessão ativa (o segundo fator é
-- conferido na borda, como em manage-organizations), justificativa de 5 a 500 caracteres nas que mudam estado, request_id
-- (idempotência) e expected_updated_at (duas decisões simultâneas: só a primeira vale). A auditoria é a da plataforma
-- (organization_id nulo) e, quando o tenant é afetado, também a dele. A justificativa vai no campo próprio da auditoria.

-- A organização dona da plataforma guarda a idempotência das operações do Master (private.seal_requests exige uma organização).
create function private.seal_platform_org() returns uuid language sql stable security definer set search_path = '' as $$
  select o.id from public.organizations o where o.kind = 'owner' order by o.created_at limit 1
$$;

create function private.seal_platform_authorize(p_actor uuid, p_session uuid) returns text
language plpgsql stable security definer set search_path = '' as $$
declare
  v_ctx jsonb := public.global_actor_context(p_actor, p_session);
begin
  if not coalesce((v_ctx->>'session_active')::boolean, false) then return 'AUTH_REQUIRED'; end if;
  if not coalesce((v_ctx->>'can_manage_platform')::boolean, false) then return 'ACCESS_DENIED'; end if;
  return null;
end $$;

create function private.seal_org_name(p_org uuid) returns jsonb language sql stable security definer set search_path = '' as $$
  select case when p_org is null then null else (select jsonb_build_object('id', o.id, 'name', o.display_name) from public.organizations o where o.id = p_org) end
$$;

-- Como o Master vê um pedido: nunca a chave, o resumo do endereço nem a chave do aparelho em conflito.
create function private.seal_enrollment_view(e public.seal_enrollments) returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', e.id, 'device_code', e.device_code, 'status', e.status,
    'conflict', e.conflict_at is not null, 'conflict_at', e.conflict_at, 'conflict_calls', e.conflict_calls,
    'first_seen_at', e.first_seen_at, 'last_seen_at', e.last_seen_at, 'calls', e.calls,
    'signal_dbm', e.signal_dbm, 'wifi_ssid', e.wifi_ssid, 'firmware_version', e.firmware_version,
    'organization', private.seal_org_name(e.organization_id), 'device_id', e.device_id,
    'last_organization', private.seal_org_name(e.last_organization_id), 'networks_cleared', e.last_organization_id is null,
    'forget_networks', e.forget_networks, 'forget_networks_requested_at', e.forget_networks_requested_at,
    'decided_at', e.decided_at, 'decision_note', e.decision_note,
    'origin', case when exists (select 1 from public.seal_devices d where d.enrollment_id = e.id and d.approved_by is null) then 'manual' else 'enrollment' end,
    'updated_at', e.updated_at)
$$;

-- Inativa uma linha de seal_devices na devolução e na retirada (data-model.md, "Ao inativar"): encerra o vínculo e a vigilância,
-- cancela os comandos pendentes (a senha do comando de rede sai do Vault em seal_command_finished), fecha os alertas abertos e mantém a
-- trava como a última confirmada (princípio IV). O tenant antigo é avisado pelo tempo real.
create function private.seal_deactivate_line(p_device uuid, p_reason text, p_by uuid, p_note text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_device public.seal_devices;
  v_command public.seal_commands;
begin
  select d.* into v_device from public.seal_devices d where d.id = p_device for update;
  update public.seal_devices set status = 'inactive', inactive_reason = p_reason, version = version + 1, updated_at = now() where id = p_device;
  perform private.seal_close_binding(p_device, 'device_inactivated', p_by, null);
  update public.seal_watches set ended_at = now(), end_reason = 'unbound' where device_id = p_device and ended_at is null;
  for v_command in select c.* from public.seal_commands c where c.device_id = p_device and c.status in ('pending', 'delivered') for update loop
    perform private.seal_command_event(v_command, 'cancelled', 'person', p_by, jsonb_build_object('reason', 'device_' || p_reason));
    update public.seal_commands set status = 'cancelled', cancel_reason = 'device_' || p_reason, finished_at = now(), updated_at = now() where id = v_command.id;
    perform private.seal_command_finished(v_command.id);
  end loop;
  update public.seal_alerts set status = 'closed', closed_at = now(), closed_by = p_by,
    close_note = case p_reason when 'returned' then 'Encerrado: lacre devolvido à plataforma.' else 'Encerrado: lacre retirado de operação pelo Master.' end
   where device_id = p_device and status <> 'closed';
  insert into public.seal_device_events (organization_id, device_id, event_type, justification, by_user)
  values (v_device.organization_id, p_device, p_reason, p_note, p_by);
  perform private.seal_broadcast(v_device.organization_id, 'device', p_device, null);
end $$;

-- Cilindro do lacre numa viagem em andamento (o mesmo critério do desvínculo da Spec 012).
create function private.seal_device_in_trip(p_device uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.seal_bindings b join public.trip_items i on i.cylinder_id = b.cylinder_id join public.trips t on t.id = i.trip_id
                  where b.device_id = p_device and b.unbound_at is null and i.is_open and t.status = 'in_progress')
$$;

-- Carrega o pedido para decidir: NOT_FOUND, STALE ou nulo (pode seguir).
create function private.seal_enrollment_guard(p_enrollment uuid, p_expected timestamptz) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_at timestamptz;
begin
  select e.updated_at into v_at from public.seal_enrollments e where e.id = p_enrollment for update;
  if v_at is null then return 'NOT_FOUND'; end if;
  if p_expected is null or v_at <> p_expected then return 'STALE'; end if;
  return null;
end $$;

create function public.list_enrollments(p_actor uuid, p_session uuid, p_status text default null, p_conflict boolean default null,
  p_offset integer default 0, p_limit integer default 50)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  denied text := private.seal_platform_authorize(p_actor, p_session);
  v_limits jsonb := private.seal_enrollment_limits();
begin
  if denied is not null then return jsonb_build_object('code', denied); end if;
  if p_status is not null and p_status not in ('pending', 'approved', 'refused', 'expired', 'returned') then
    return jsonb_build_object('code', 'VALIDATION_FAILED', 'fields', private.field_error('status', 'Situação desconhecida.'));
  end if;
  if coalesce(p_limit, 0) not between 1 and 100 or coalesce(p_offset, 0) < 0 then
    return jsonb_build_object('code', 'VALIDATION_FAILED', 'fields', private.field_error('limit', 'Use páginas de 1 a 100 pedidos.'));
  end if;
  return jsonb_build_object('code', 'LISTED',
    'items', coalesce((select jsonb_agg(private.seal_enrollment_view(e) order by e.last_seen_at desc, e.id) from (
        select * from public.seal_enrollments e
         where (p_status is null or e.status = p_status) and (p_conflict is null or (e.conflict_at is not null) = p_conflict)
         order by e.last_seen_at desc, e.id offset p_offset limit p_limit) e), '[]'::jsonb),
    'total', (select count(*) from public.seal_enrollments e
               where (p_status is null or e.status = p_status) and (p_conflict is null or (e.conflict_at is not null) = p_conflict)),
    'counts', (select jsonb_object_agg(s, (select count(*) from public.seal_enrollments e where e.status = s))
                 from unnest(array['pending', 'approved', 'refused', 'expired', 'returned']) s),
    'conflicts', (select count(*) from public.seal_enrollments e where e.conflict_at is not null),
    'rate_limited_last_24h', (select coalesce(sum(greatest(w.count - (v_limits->>'new_requests_per_source_per_hour')::int, 0)), 0)
                                from private.seal_enroll_rate_windows w
                               where w.bucket like 'enroll:%' and w.window_start > now() - interval '24 hours'));
end $$;

create function public.list_tenants_for_seals(p_actor uuid, p_session uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  denied text := private.seal_platform_authorize(p_actor, p_session);
begin
  if denied is not null then return jsonb_build_object('code', denied); end if;
  return jsonb_build_object('code', 'LISTED', 'items', coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'name', o.display_name) order by o.display_name, o.id)
    from public.organizations o where o.kind = 'tenant' and o.status = 'active'), '[]'::jsonb));
end $$;

create function public.approve_enrollment(p_actor uuid, p_session uuid, p_request uuid, p_enrollment uuid, p_organization uuid,
  p_justification text, p_expected_updated_at timestamptz)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  denied text := private.seal_platform_authorize(p_actor, p_session);
  replay jsonb;
  v_text text := private.seal_justification(p_justification);
  v_guard text;
  v_enrollment public.seal_enrollments;
  v_org public.organizations;
  v_device uuid;
  v_meta jsonb;
begin
  if denied is not null then return jsonb_build_object('code', denied); end if;
  replay := private.seal_replay(private.seal_platform_org(), p_request, 'approve_enrollment');
  if replay is not null then return replay; end if;
  if not private.seal_text_ok(v_text) then return jsonb_build_object('code', 'JUSTIFICATION_REQUIRED'); end if;
  v_guard := private.seal_enrollment_guard(p_enrollment, p_expected_updated_at);
  if v_guard is not null then return jsonb_build_object('code', v_guard); end if;
  select e.* into v_enrollment from public.seal_enrollments e where e.id = p_enrollment;
  if v_enrollment.status not in ('pending', 'returned', 'refused') then return jsonb_build_object('code', 'INVALID_STATE'); end if;
  if v_enrollment.conflict_at is not null then return jsonb_build_object('code', 'ENROLLMENT_CONFLICT'); end if;
  select o.* into v_org from public.organizations o where o.id = p_organization and o.kind = 'tenant';
  if v_org.id is null then return jsonb_build_object('code', 'NOT_FOUND'); end if;
  if v_org.status <> 'active' then return jsonb_build_object('code', 'TENANT_INACTIVE'); end if;
  if v_enrollment.last_organization_id is not null and v_enrollment.last_organization_id <> p_organization then
    return jsonb_build_object('code', 'NETWORKS_NOT_CLEARED');
  end if;
  if exists (select 1 from public.seal_devices d where d.device_code = v_enrollment.device_code and d.status = 'active') then
    return jsonb_build_object('code', 'INVALID_STATE');
  end if;

  insert into public.seal_devices (organization_id, device_code, label, key_hash, created_by, enrollment_id, approved_at, approved_by)
  values (p_organization, v_enrollment.device_code, 'Lacre ' || v_enrollment.device_code, v_enrollment.key_hash, p_actor, p_enrollment, now(), p_actor)
  returning id into v_device;
  insert into public.seal_device_events (organization_id, device_id, event_type, justification, by_user)
  values (p_organization, v_device, 'approved', v_text, p_actor);
  update public.seal_enrollments set status = 'approved', organization_id = p_organization, device_id = v_device, last_organization_id = p_organization,
    forget_networks = null, forget_networks_requested_at = null, decided_by = p_actor, decided_at = now(), decision_note = v_text, updated_at = now()
   where id = p_enrollment;
  v_meta := jsonb_build_object('device_code', v_enrollment.device_code, 'organization_id', p_organization, 'device_id', v_device);
  perform private.write_audit_event(null, p_actor, p_session, 'seal.enrollment_approve', 'seal_enrollment', p_enrollment::text, 'success', null, v_text, v_meta);
  perform private.write_audit_event(p_organization, p_actor, p_session, 'seal.enrollment_approve', 'seal_enrollment', p_enrollment::text, 'success', null, v_text, v_meta);
  perform private.seal_broadcast(p_organization, 'device', v_device, null);
  return private.seal_remember(private.seal_platform_org(), p_request, 'approve_enrollment',
    jsonb_build_object('code', 'APPROVED', 'enrollment_id', p_enrollment, 'device_id', v_device, 'organization_id', p_organization));
end $$;

create function public.refuse_enrollment(p_actor uuid, p_session uuid, p_request uuid, p_enrollment uuid, p_justification text,
  p_expected_updated_at timestamptz)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  denied text := private.seal_platform_authorize(p_actor, p_session);
  replay jsonb;
  v_text text := private.seal_justification(p_justification);
  v_guard text;
  v_enrollment public.seal_enrollments;
begin
  if denied is not null then return jsonb_build_object('code', denied); end if;
  replay := private.seal_replay(private.seal_platform_org(), p_request, 'refuse_enrollment');
  if replay is not null then return replay; end if;
  if not private.seal_text_ok(v_text) then return jsonb_build_object('code', 'JUSTIFICATION_REQUIRED'); end if;
  v_guard := private.seal_enrollment_guard(p_enrollment, p_expected_updated_at);
  if v_guard is not null then return jsonb_build_object('code', v_guard); end if;
  select e.* into v_enrollment from public.seal_enrollments e where e.id = p_enrollment;
  if v_enrollment.status <> 'pending' then return jsonb_build_object('code', 'INVALID_STATE'); end if;
  update public.seal_enrollments set status = 'refused', decided_by = p_actor, decided_at = now(), decision_note = v_text, updated_at = now()
   where id = p_enrollment;
  perform private.write_audit_event(null, p_actor, p_session, 'seal.enrollment_refuse', 'seal_enrollment', p_enrollment::text, 'success', null, v_text,
    jsonb_build_object('device_code', v_enrollment.device_code));
  return private.seal_remember(private.seal_platform_org(), p_request, 'refuse_enrollment', jsonb_build_object('code', 'REFUSED'));
end $$;

create function public.replace_enrollment_key(p_actor uuid, p_session uuid, p_request uuid, p_enrollment uuid, p_keep_current boolean,
  p_justification text, p_expected_updated_at timestamptz)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  denied text := private.seal_platform_authorize(p_actor, p_session);
  replay jsonb;
  v_text text := private.seal_justification(p_justification);
  v_guard text;
  v_enrollment public.seal_enrollments;
  v_keep boolean := coalesce(p_keep_current, false);
begin
  if denied is not null then return jsonb_build_object('code', denied); end if;
  replay := private.seal_replay(private.seal_platform_org(), p_request, 'replace_enrollment_key');
  if replay is not null then return replay; end if;
  if not private.seal_text_ok(v_text) then return jsonb_build_object('code', 'JUSTIFICATION_REQUIRED'); end if;
  v_guard := private.seal_enrollment_guard(p_enrollment, p_expected_updated_at);
  if v_guard is not null then return jsonb_build_object('code', v_guard); end if;
  select e.* into v_enrollment from public.seal_enrollments e where e.id = p_enrollment;
  if v_enrollment.conflict_at is null or v_enrollment.status = 'approved' then return jsonb_build_object('code', 'INVALID_STATE'); end if;
  update public.seal_enrollments set
    key_hash = case when v_keep then key_hash else conflict_key_hash end,
    status = case when v_keep then status else 'pending' end,
    conflict_at = null, conflict_key_hash = null, decided_by = p_actor, decided_at = now(), updated_at = now()
   where id = p_enrollment;
  perform private.write_audit_event(null, p_actor, p_session, 'seal.enrollment_key_replace', 'seal_enrollment', p_enrollment::text, 'success', null, v_text,
    jsonb_build_object('device_code', v_enrollment.device_code, 'keep_current', v_keep));
  return private.seal_remember(private.seal_platform_org(), p_request, 'replace_enrollment_key',
    jsonb_build_object('code', case when v_keep then 'CONFLICT_CLEARED' else 'KEY_REPLACED' end));
end $$;

create function public.withdraw_device(p_actor uuid, p_session uuid, p_request uuid, p_enrollment uuid, p_forget_networks text,
  p_justification text, p_expected_updated_at timestamptz)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  denied text := private.seal_platform_authorize(p_actor, p_session);
  replay jsonb;
  v_text text := private.seal_justification(p_justification);
  v_forget text := coalesce(p_forget_networks, 'extras');
  v_guard text;
  v_enrollment public.seal_enrollments;
  v_meta jsonb;
begin
  if denied is not null then return jsonb_build_object('code', denied); end if;
  replay := private.seal_replay(private.seal_platform_org(), p_request, 'withdraw_device');
  if replay is not null then return replay; end if;
  if v_forget not in ('extras', 'all') then
    return jsonb_build_object('code', 'VALIDATION_FAILED', 'fields', private.field_error('forget_networks', 'Use extras ou all.'));
  end if;
  if not private.seal_text_ok(v_text) then return jsonb_build_object('code', 'JUSTIFICATION_REQUIRED'); end if;
  v_guard := private.seal_enrollment_guard(p_enrollment, p_expected_updated_at);
  if v_guard is not null then return jsonb_build_object('code', v_guard); end if;
  select e.* into v_enrollment from public.seal_enrollments e where e.id = p_enrollment;
  if v_enrollment.status <> 'approved' then return jsonb_build_object('code', 'INVALID_STATE'); end if;
  if private.seal_device_in_trip(v_enrollment.device_id) then return jsonb_build_object('code', 'CYLINDER_IN_TRIP'); end if;

  perform private.seal_deactivate_line(v_enrollment.device_id, 'withdrawn', p_actor, v_text);
  update public.seal_enrollments set status = 'pending', organization_id = null, device_id = null,
    forget_networks = v_forget, forget_networks_requested_at = now(), decided_by = p_actor, decided_at = now(), decision_note = v_text, updated_at = now()
   where id = p_enrollment;
  v_meta := jsonb_build_object('device_code', v_enrollment.device_code, 'organization_id', v_enrollment.organization_id,
    'device_id', v_enrollment.device_id, 'forget_networks', v_forget);
  perform private.write_audit_event(null, p_actor, p_session, 'seal.device_withdraw', 'seal_enrollment', p_enrollment::text, 'success', null, v_text, v_meta);
  perform private.write_audit_event(v_enrollment.organization_id, p_actor, p_session, 'seal.device_withdraw', 'seal_enrollment', p_enrollment::text,
    'success', null, v_text, v_meta);
  return private.seal_remember(private.seal_platform_org(), p_request, 'withdraw_device', jsonb_build_object('code', 'WITHDRAWN'));
end $$;

create function public.request_forget_networks(p_actor uuid, p_session uuid, p_request uuid, p_enrollment uuid, p_justification text,
  p_expected_updated_at timestamptz)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  denied text := private.seal_platform_authorize(p_actor, p_session);
  replay jsonb;
  v_text text := private.seal_justification(p_justification);
  v_guard text;
  v_enrollment public.seal_enrollments;
begin
  if denied is not null then return jsonb_build_object('code', denied); end if;
  replay := private.seal_replay(private.seal_platform_org(), p_request, 'request_forget_networks');
  if replay is not null then return replay; end if;
  if not private.seal_text_ok(v_text) then return jsonb_build_object('code', 'JUSTIFICATION_REQUIRED'); end if;
  v_guard := private.seal_enrollment_guard(p_enrollment, p_expected_updated_at);
  if v_guard is not null then return jsonb_build_object('code', v_guard); end if;
  select e.* into v_enrollment from public.seal_enrollments e where e.id = p_enrollment;
  if v_enrollment.status = 'approved' or v_enrollment.last_organization_id is null then return jsonb_build_object('code', 'INVALID_STATE'); end if;
  update public.seal_enrollments set forget_networks = 'all', forget_networks_requested_at = now(), decided_by = p_actor, decided_at = now(), updated_at = now()
   where id = p_enrollment;
  perform private.write_audit_event(null, p_actor, p_session, 'seal.networks_forget_request', 'seal_enrollment', p_enrollment::text, 'success', null, v_text,
    jsonb_build_object('device_code', v_enrollment.device_code, 'last_organization_id', v_enrollment.last_organization_id));
  return private.seal_remember(private.seal_platform_org(), p_request, 'request_forget_networks', jsonb_build_object('code', 'FORGET_REQUESTED'));
end $$;

revoke all on function private.seal_platform_org(), private.seal_platform_authorize(uuid, uuid), private.seal_org_name(uuid),
  private.seal_enrollment_view(public.seal_enrollments), private.seal_deactivate_line(uuid, text, uuid, text), private.seal_device_in_trip(uuid),
  private.seal_enrollment_guard(uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.list_enrollments(uuid, uuid, text, boolean, integer, integer), public.list_tenants_for_seals(uuid, uuid),
  public.approve_enrollment(uuid, uuid, uuid, uuid, uuid, text, timestamptz), public.refuse_enrollment(uuid, uuid, uuid, uuid, text, timestamptz),
  public.replace_enrollment_key(uuid, uuid, uuid, uuid, boolean, text, timestamptz),
  public.withdraw_device(uuid, uuid, uuid, uuid, text, text, timestamptz), public.request_forget_networks(uuid, uuid, uuid, uuid, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.list_enrollments(uuid, uuid, text, boolean, integer, integer), public.list_tenants_for_seals(uuid, uuid),
  public.approve_enrollment(uuid, uuid, uuid, uuid, uuid, text, timestamptz), public.refuse_enrollment(uuid, uuid, uuid, uuid, text, timestamptz),
  public.replace_enrollment_key(uuid, uuid, uuid, uuid, boolean, text, timestamptz),
  public.withdraw_device(uuid, uuid, uuid, uuid, text, text, timestamptz), public.request_forget_networks(uuid, uuid, uuid, uuid, text, timestamptz)
  to service_role;
