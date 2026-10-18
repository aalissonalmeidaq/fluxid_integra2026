-- Spec 012, US5: cadastro do dispositivo e vínculo lacre–cilindro (RF-031 a RF-034, RF-039; research.md, item 2; princípio III). A chave
-- tem 32 bytes aleatórios, é devolvida UMA vez e só o SHA-256 fica no banco; a repetição do mesmo pedido não a devolve de novo.
-- Desativar, gerar chave nova e desvincular exigem justificativa de 5 a 500, que fica no histórico (nunca na auditoria).

create function private.seal_new_key() returns text language sql volatile set search_path = '' as $$
  select 'fxk_' || rtrim(translate(encode(extensions.gen_random_bytes(32), 'base64'), '+/', '-_'), '=')
$$;

create function private.seal_justification(p_text text) returns text language sql immutable set search_path = '' as $$
  select nullif(btrim(regexp_replace(coalesce(p_text, ''), '\s+', ' ', 'g')), '')
$$;

create function public.create_device(p_actor uuid, p_session uuid, p_organization uuid, p_request uuid, p_label text, p_report_interval_s integer default 60)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  denied text;
  replay jsonb;
  v_limits jsonb := private.seal_limits();
  v_label text := private.seal_justification(p_label);
  v_interval integer := coalesce(p_report_interval_s, (v_limits->>'report_interval_default_s')::int);
  v_key text := private.seal_new_key();
  v_code text := private.seal_random_code('DSP');
  v_id uuid;
begin
  denied := private.cylinder_authorize(p_actor, p_session, p_organization, 'seal.admin');
  if denied is not null then return jsonb_build_object('code', denied); end if;
  replay := private.seal_replay(p_organization, p_request, 'create_device');
  if replay is not null then return replay; end if;
  if v_label is null or char_length(v_label) not between 2 and 60 then
    return jsonb_build_object('code', 'VALIDATION_FAILED', 'fields', private.field_error('label', 'Dê um nome de 2 a 60 caracteres ao lacre.'));
  end if;
  if v_interval not between (v_limits->>'report_interval_min_s')::int and (v_limits->>'report_interval_max_s')::int then
    return jsonb_build_object('code', 'VALIDATION_FAILED', 'fields', private.field_error('report_interval_s', 'Use um intervalo de 30 a 900 segundos.'));
  end if;
  insert into public.seal_devices (organization_id, device_code, label, key_hash, report_interval_s, created_by)
  values (p_organization, v_code, v_label, extensions.digest(v_key, 'sha256'), v_interval, p_actor)
  returning id into v_id;
  insert into public.seal_device_events (organization_id, device_id, event_type, by_user) values (p_organization, v_id, 'created', p_actor);
  perform private.write_audit_event(p_organization, p_actor, p_session, 'seal.device_create', 'seal_device', v_id::text, 'success', null, null,
    jsonb_build_object('device_id', v_id, 'device_code', v_code));
  perform private.seal_remember(p_organization, p_request, 'create_device',
    jsonb_build_object('code', 'CREATED', 'device_id', v_id, 'device_code', v_code, 'key_shown', true));
  return jsonb_build_object('code', 'CREATED', 'device_id', v_id, 'device_code', v_code, 'device_key', v_key);
end $$;

create function public.update_device(p_actor uuid, p_session uuid, p_organization uuid, p_request uuid, p_device uuid, p_expected_version bigint,
  p_label text, p_report_interval_s integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  denied text;
  replay jsonb;
  v_limits jsonb := private.seal_limits();
  v_device public.seal_devices;
  v_label text := private.seal_justification(p_label);
begin
  denied := private.cylinder_authorize(p_actor, p_session, p_organization, 'seal.admin');
  if denied is not null then return jsonb_build_object('code', denied); end if;
  replay := private.seal_replay(p_organization, p_request, 'update_device');
  if replay is not null then return replay; end if;
  select d.* into v_device from public.seal_devices d where d.id = p_device and d.organization_id = p_organization for update;
  if v_device.id is null then return jsonb_build_object('code', 'NOT_FOUND'); end if;
  if v_device.version <> p_expected_version then return jsonb_build_object('code', 'VERSION_CONFLICT'); end if;
  if v_label is null or char_length(v_label) not between 2 and 60 then
    return jsonb_build_object('code', 'VALIDATION_FAILED', 'fields', private.field_error('label', 'Dê um nome de 2 a 60 caracteres ao lacre.'));
  end if;
  if p_report_interval_s not between (v_limits->>'report_interval_min_s')::int and (v_limits->>'report_interval_max_s')::int then
    return jsonb_build_object('code', 'VALIDATION_FAILED', 'fields', private.field_error('report_interval_s', 'Use um intervalo de 30 a 900 segundos.'));
  end if;
  update public.seal_devices set label = v_label, report_interval_s = p_report_interval_s, version = version + 1, updated_at = now() where id = p_device;
  insert into public.seal_device_events (organization_id, device_id, event_type, by_user, detail)
  values (p_organization, p_device, 'updated', p_actor, jsonb_build_object('report_interval_s', p_report_interval_s));
  perform private.write_audit_event(p_organization, p_actor, p_session, 'seal.device_update', 'seal_device', p_device::text, 'success', null, null,
    jsonb_build_object('device_id', p_device));
  return private.seal_remember(p_organization, p_request, 'update_device', jsonb_build_object('code', 'UPDATED', 'version', v_device.version + 1));
end $$;

-- Encerra o vínculo ativo do dispositivo (e a vigilância do cilindro) por um motivo; pessoa e justificativa só no manual.
create function private.seal_close_binding(p_device uuid, p_reason text, p_by uuid, p_justification text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_binding public.seal_bindings;
begin
  select b.* into v_binding from public.seal_bindings b where b.device_id = p_device and b.unbound_at is null for update;
  if v_binding.id is null then return null; end if;
  update public.seal_bindings set unbound_at = now(), unbound_by = p_by, unbind_reason = p_reason, unbind_justification = p_justification where id = v_binding.id;
  perform private.seal_end_watch(v_binding.cylinder_id, case when p_reason = 'cylinder_inactivated' then 'cylinder_inactivated' else 'unbound' end);
  perform private.seal_broadcast(v_binding.organization_id, 'binding', p_device, v_binding.cylinder_id);
  return v_binding.cylinder_id;
end $$;

create function public.deactivate_device(p_actor uuid, p_session uuid, p_organization uuid, p_request uuid, p_device uuid, p_justification text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  denied text;
  replay jsonb;
  v_device public.seal_devices;
  v_text text := private.seal_justification(p_justification);
  v_command public.seal_commands;
begin
  denied := private.cylinder_authorize(p_actor, p_session, p_organization, 'seal.admin');
  if denied is not null then return jsonb_build_object('code', denied); end if;
  replay := private.seal_replay(p_organization, p_request, 'deactivate_device');
  if replay is not null then return replay; end if;
  select d.* into v_device from public.seal_devices d where d.id = p_device and d.organization_id = p_organization for update;
  if v_device.id is null then return jsonb_build_object('code', 'NOT_FOUND'); end if;
  if not private.seal_text_ok(v_text) then return jsonb_build_object('code', 'JUSTIFICATION_REQUIRED'); end if;
  if v_device.status = 'inactive' then return jsonb_build_object('code', 'SEAL_INACTIVE'); end if;
  update public.seal_devices set status = 'inactive', version = version + 1, updated_at = now() where id = p_device;
  perform private.seal_close_binding(p_device, 'device_inactivated', p_actor, null);
  for v_command in select c.* from public.seal_commands c where c.device_id = p_device and c.status in ('pending', 'delivered') for update loop
    perform private.seal_command_event(v_command, 'cancelled', 'person', p_actor, jsonb_build_object('reason', 'device_inactivated'));
    update public.seal_commands set status = 'cancelled', cancel_reason = 'device_inactivated', finished_at = now(), updated_at = now() where id = v_command.id;
    perform private.seal_command_finished(v_command.id);
  end loop;
  insert into public.seal_device_events (organization_id, device_id, event_type, justification, by_user) values (p_organization, p_device, 'deactivated', v_text, p_actor);
  perform private.write_audit_event(p_organization, p_actor, p_session, 'seal.device_deactivate', 'seal_device', p_device::text, 'success', null, null,
    jsonb_build_object('device_id', p_device));
  return private.seal_remember(p_organization, p_request, 'deactivate_device', jsonb_build_object('code', 'INACTIVATED'));
end $$;

create function public.rotate_device_key(p_actor uuid, p_session uuid, p_organization uuid, p_request uuid, p_device uuid, p_justification text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  denied text;
  replay jsonb;
  v_device public.seal_devices;
  v_text text := private.seal_justification(p_justification);
  v_key text := private.seal_new_key();
begin
  denied := private.cylinder_authorize(p_actor, p_session, p_organization, 'seal.admin');
  if denied is not null then return jsonb_build_object('code', denied); end if;
  replay := private.seal_replay(p_organization, p_request, 'rotate_device_key');
  if replay is not null then return replay; end if;
  select d.* into v_device from public.seal_devices d where d.id = p_device and d.organization_id = p_organization for update;
  if v_device.id is null then return jsonb_build_object('code', 'NOT_FOUND'); end if;
  if not private.seal_text_ok(v_text) then return jsonb_build_object('code', 'JUSTIFICATION_REQUIRED'); end if;
  update public.seal_devices set key_hash = extensions.digest(v_key, 'sha256'), key_rotated_at = now(), version = version + 1, updated_at = now() where id = p_device;
  insert into public.seal_device_events (organization_id, device_id, event_type, justification, by_user) values (p_organization, p_device, 'key_rotated', v_text, p_actor);
  perform private.write_audit_event(p_organization, p_actor, p_session, 'seal.key_rotate', 'seal_device', p_device::text, 'success', null, null,
    jsonb_build_object('device_id', p_device));
  perform private.seal_remember(p_organization, p_request, 'rotate_device_key', jsonb_build_object('code', 'ROTATED', 'key_shown', true));
  return jsonb_build_object('code', 'ROTATED', 'device_key', v_key);
end $$;

create function public.bind_seal(p_actor uuid, p_session uuid, p_organization uuid, p_request uuid, p_device uuid, p_cylinder uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  denied text;
  replay jsonb;
  v_device public.seal_devices;
  v_cylinder public.cylinders;
  v_id uuid;
begin
  denied := private.cylinder_authorize(p_actor, p_session, p_organization, 'seal.operate');
  if denied is not null then return jsonb_build_object('code', denied); end if;
  replay := private.seal_replay(p_organization, p_request, 'bind_seal');
  if replay is not null then return replay; end if;
  select d.* into v_device from public.seal_devices d where d.id = p_device and d.organization_id = p_organization for update;
  select c.* into v_cylinder from public.cylinders c where c.id = p_cylinder and c.organization_id = p_organization for update;
  if v_device.id is null or v_cylinder.id is null then return jsonb_build_object('code', 'NOT_FOUND'); end if;
  if v_device.status <> 'active' then return jsonb_build_object('code', 'SEAL_INACTIVE'); end if;
  if v_cylinder.status <> 'active' then return jsonb_build_object('code', 'CYLINDER_INACTIVE'); end if;
  if exists (select 1 from public.seal_bindings b where b.device_id = p_device and b.unbound_at is null) then
    return jsonb_build_object('code', 'SEAL_ALREADY_BOUND');
  end if;
  if exists (select 1 from public.seal_bindings b where b.cylinder_id = p_cylinder and b.unbound_at is null) then
    return jsonb_build_object('code', 'CYLINDER_ALREADY_BOUND');
  end if;
  insert into public.seal_bindings (organization_id, device_id, cylinder_id, bound_by) values (p_organization, p_device, p_cylinder, p_actor) returning id into v_id;
  perform private.write_audit_event(p_organization, p_actor, p_session, 'seal.bind', 'seal_binding', v_id::text, 'success', null, null,
    jsonb_build_object('device_id', p_device, 'cylinder_id', p_cylinder));
  perform private.seal_broadcast(p_organization, 'binding', p_device, p_cylinder);
  return private.seal_remember(p_organization, p_request, 'bind_seal', jsonb_build_object('code', 'BOUND', 'binding_id', v_id));
end $$;

create function public.unbind_seal(p_actor uuid, p_session uuid, p_organization uuid, p_request uuid, p_device uuid, p_justification text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  denied text;
  replay jsonb;
  v_binding public.seal_bindings;
  v_text text := private.seal_justification(p_justification);
begin
  denied := private.cylinder_authorize(p_actor, p_session, p_organization, 'seal.operate');
  if denied is not null then return jsonb_build_object('code', denied); end if;
  replay := private.seal_replay(p_organization, p_request, 'unbind_seal');
  if replay is not null then return replay; end if;
  if not private.seal_text_ok(v_text) then return jsonb_build_object('code', 'JUSTIFICATION_REQUIRED'); end if;
  select b.* into v_binding from public.seal_bindings b where b.device_id = p_device and b.organization_id = p_organization and b.unbound_at is null;
  if v_binding.id is null then
    return jsonb_build_object('code', case when exists (select 1 from public.seal_devices d where d.id = p_device and d.organization_id = p_organization)
      then 'NO_BINDING' else 'NOT_FOUND' end);
  end if;
  if exists (select 1 from public.trip_items i join public.trips t on t.id = i.trip_id
              where i.cylinder_id = v_binding.cylinder_id and i.is_open and t.status = 'in_progress') then
    return jsonb_build_object('code', 'CYLINDER_IN_TRIP');
  end if;
  perform private.seal_close_binding(p_device, 'manual', p_actor, v_text);
  perform private.write_audit_event(p_organization, p_actor, p_session, 'seal.unbind', 'seal_binding', v_binding.id::text, 'success', null, null,
    jsonb_build_object('device_id', p_device, 'cylinder_id', v_binding.cylinder_id));
  return private.seal_remember(p_organization, p_request, 'unbind_seal', jsonb_build_object('code', 'UNBOUND'));
end $$;

-- Lacres ativos sem cilindro (História 5, cenário 2): avisaram a ativação e estão prontos para o vínculo.
create function public.list_unbound_active_seals(p_actor uuid, p_session uuid, p_organization uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  denied text;
begin
  denied := private.cylinder_authorize(p_actor, p_session, p_organization, 'seal.read');
  if denied is not null then return jsonb_build_object('code', denied); end if;
  return jsonb_build_object('code', 'LISTED', 'items', coalesce((
    select jsonb_agg(private.seal_device_summary(d.id) || jsonb_build_object('activated_at', d.activated_at) order by d.activated_at desc)
      from public.seal_devices d
     where d.organization_id = p_organization and d.status = 'active' and d.activated_at is not null
       and not exists (select 1 from public.seal_bindings b where b.device_id = d.id and b.unbound_at is null)), '[]'::jsonb));
end $$;

-- Cilindro inativado (Spec 006): o vínculo com o lacre é encerrado junto.
create function private.seal_cylinder_status_trigger() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_device uuid;
begin
  if new.status = 'inactive' and old.status is distinct from 'inactive' then
    select b.device_id into v_device from public.seal_bindings b where b.cylinder_id = new.id and b.unbound_at is null;
    if v_device is not null then perform private.seal_close_binding(v_device, 'cylinder_inactivated', null, null); end if;
  end if;
  return null;
end $$;
create trigger cylinders_seal_binding after update of status on public.cylinders
  for each row execute function private.seal_cylinder_status_trigger();

revoke all on function private.seal_new_key(), private.seal_justification(text), private.seal_close_binding(uuid, text, uuid, text),
  private.seal_cylinder_status_trigger() from public, anon, authenticated;
revoke all on function public.create_device(uuid, uuid, uuid, uuid, text, integer), public.update_device(uuid, uuid, uuid, uuid, uuid, bigint, text, integer),
  public.deactivate_device(uuid, uuid, uuid, uuid, uuid, text), public.rotate_device_key(uuid, uuid, uuid, uuid, uuid, text),
  public.bind_seal(uuid, uuid, uuid, uuid, uuid, uuid), public.unbind_seal(uuid, uuid, uuid, uuid, uuid, text),
  public.list_unbound_active_seals(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.create_device(uuid, uuid, uuid, uuid, text, integer), public.update_device(uuid, uuid, uuid, uuid, uuid, bigint, text, integer),
  public.deactivate_device(uuid, uuid, uuid, uuid, uuid, text), public.rotate_device_key(uuid, uuid, uuid, uuid, uuid, text),
  public.bind_seal(uuid, uuid, uuid, uuid, uuid, uuid), public.unbind_seal(uuid, uuid, uuid, uuid, uuid, text),
  public.list_unbound_active_seals(uuid, uuid, uuid) to service_role;
