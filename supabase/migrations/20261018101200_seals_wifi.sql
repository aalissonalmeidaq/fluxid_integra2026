-- Spec 012, US7: redes Wi-Fi do lacre configuradas pelo sistema (RF-034a a RF-034f, RN-012, RN-013, CA-008, CA-009; research.md, item 10).
-- A senha digitada vai para o Supabase Vault e o comando guarda só a referência; ela só sai na resposta ao próprio lacre e é apagada quando
-- o comando termina de qualquer jeito (confirmado, com erro, cancelado ou expirado). A rede só entra na lista quando o lacre confirma.

-- Risco de deixar o lacre sem comunicar durante a troca: cilindro em viagem em andamento ou sob vigilância de geocerca (RF-034f).
create function private.seal_wifi_risky(p_device uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select (r->>'trip_id') is not null or (r->>'site_id') is not null from (select private.seal_risk(p_device) as r) x
$$;

create function private.seal_wifi_guard(p_actor uuid, p_session uuid, p_organization uuid, p_request uuid, p_device uuid, p_operation text, p_confirm_risk boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  denied text;
  replay jsonb;
  v_device public.seal_devices;
begin
  denied := private.cylinder_authorize(p_actor, p_session, p_organization, 'seal.admin');
  if denied is not null then return jsonb_build_object('code', denied); end if;
  replay := private.seal_replay(p_organization, p_request, p_operation);
  if replay is not null then return replay; end if;
  select d.* into v_device from public.seal_devices d where d.id = p_device and d.organization_id = p_organization;
  if v_device.id is null then return jsonb_build_object('code', 'NOT_FOUND'); end if;
  if v_device.status <> 'active' then return jsonb_build_object('code', 'SEAL_INACTIVE'); end if;
  if private.seal_wifi_risky(p_device) and not coalesce(p_confirm_risk, false) then return jsonb_build_object('code', 'WIFI_RISK_NOT_CONFIRMED'); end if;
  return null;
end $$;

create function public.wifi_add(p_actor uuid, p_session uuid, p_organization uuid, p_request uuid, p_device uuid, p_ssid text, p_password text,
  p_open boolean default false, p_confirm_risk boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  refusal jsonb;
  v_limits jsonb := private.seal_limits();
  v_saved jsonb;
  v_secret uuid;
  v_command uuid;
begin
  refusal := private.seal_wifi_guard(p_actor, p_session, p_organization, p_request, p_device, 'wifi_add', p_confirm_risk);
  if refusal is not null then return refusal; end if;
  if p_ssid is null or octet_length(p_ssid) not between 1 and 32 then
    return jsonb_build_object('code', 'VALIDATION_FAILED', 'fields', private.field_error('ssid', 'Informe o nome da rede com até 32 caracteres.'));
  end if;
  if not coalesce(p_open, false) and (p_password is null or char_length(p_password) not between 8 and 63) then
    return jsonb_build_object('code', 'VALIDATION_FAILED', 'fields', private.field_error('password', 'A senha da rede tem de 8 a 63 caracteres.'));
  end if;
  select d.wifi_saved into v_saved from public.seal_devices d where d.id = p_device;
  if not (v_saved ? p_ssid) and jsonb_array_length(v_saved) >= (v_limits->>'wifi_list_max')::int then
    return jsonb_build_object('code', 'WIFI_LIST_FULL');
  end if;
  if not coalesce(p_open, false) then
    v_secret := vault.create_secret(p_password, 'seal-wifi-' || gen_random_uuid()::text, 'Spec 012: senha temporária de rede do lacre');
  end if;
  v_command := private.issue_seal_command(p_device, 'wifi_add', 'admin_network', p_actor, null, null, null, null, null,
    jsonb_build_object('wifi_ssid', p_ssid, 'wifi_open', coalesce(p_open, false), 'wifi_secret_id', v_secret));
  perform private.write_audit_event(p_organization, p_actor, p_session, 'seal.wifi_add', 'seal_device', p_device::text, 'success', null, null,
    jsonb_build_object('device_id', p_device, 'ssid', p_ssid, 'open', coalesce(p_open, false)));
  return private.seal_remember(p_organization, p_request, 'wifi_add', jsonb_build_object('code', 'REQUESTED', 'command_id', v_command));
end $$;

create function public.wifi_remove(p_actor uuid, p_session uuid, p_organization uuid, p_request uuid, p_device uuid, p_ssid text, p_confirm_risk boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  refusal jsonb;
  v_command uuid;
begin
  refusal := private.seal_wifi_guard(p_actor, p_session, p_organization, p_request, p_device, 'wifi_remove', p_confirm_risk);
  if refusal is not null then return refusal; end if;
  if not exists (select 1 from public.seal_devices d where d.id = p_device and d.wifi_saved ? p_ssid) then
    return jsonb_build_object('code', 'WIFI_NOT_IN_LIST');
  end if;
  v_command := private.issue_seal_command(p_device, 'wifi_remove', 'admin_network', p_actor, null, null, null, null, null, jsonb_build_object('wifi_ssid', p_ssid));
  perform private.write_audit_event(p_organization, p_actor, p_session, 'seal.wifi_remove', 'seal_device', p_device::text, 'success', null, null,
    jsonb_build_object('device_id', p_device, 'ssid', p_ssid));
  return private.seal_remember(p_organization, p_request, 'wifi_remove', jsonb_build_object('code', 'REQUESTED', 'command_id', v_command));
end $$;

create function public.wifi_reset(p_actor uuid, p_session uuid, p_organization uuid, p_request uuid, p_device uuid, p_justification text, p_confirm_risk boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  refusal jsonb;
  v_text text := private.seal_justification(p_justification);
  v_command uuid;
begin
  refusal := private.seal_wifi_guard(p_actor, p_session, p_organization, p_request, p_device, 'wifi_reset', p_confirm_risk);
  if refusal is not null then return refusal; end if;
  if not private.seal_text_ok(v_text) then return jsonb_build_object('code', 'JUSTIFICATION_REQUIRED'); end if;
  v_command := private.issue_seal_command(p_device, 'wifi_reset', 'admin_network', p_actor, v_text, null, null, null, null, '{}');
  perform private.write_audit_event(p_organization, p_actor, p_session, 'seal.wifi_reset', 'seal_device', p_device::text, 'success', null, null,
    jsonb_build_object('device_id', p_device));
  return private.seal_remember(p_organization, p_request, 'wifi_reset', jsonb_build_object('code', 'REQUESTED', 'command_id', v_command));
end $$;

-- Campos do comando de rede na resposta ao lacre: a senha é lida do Vault só aqui.
create or replace function private.seal_command_payload(p_command public.seal_commands) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_password text;
begin
  if p_command.kind = 'wifi_add' then
    if p_command.wifi_secret_id is not null then
      select s.decrypted_secret into v_password from vault.decrypted_secrets s where s.id = p_command.wifi_secret_id;
    end if;
    return jsonb_build_object('ssid', p_command.wifi_ssid, 'open', coalesce(p_command.wifi_open, false))
      || case when v_password is null then '{}'::jsonb else jsonb_build_object('password', v_password) end;
  elsif p_command.kind = 'wifi_remove' then
    return jsonb_build_object('ssid', p_command.wifi_ssid);
  end if;
  return '{}'::jsonb;
end $$;

-- Comando terminado de qualquer jeito: a senha some do Vault (RF-034c).
create or replace function private.seal_command_finished(p_command uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_secret uuid;
begin
  select c.wifi_secret_id into v_secret from public.seal_commands c where c.id = p_command;
  if v_secret is null then return; end if;
  delete from vault.secrets where id = v_secret;
  update public.seal_commands set wifi_secret_id = null where id = p_command;
end $$;

-- Resultado do lacre para os comandos de rede (RF-034d): confirmada, a lista muda; com erro, alerta médio com o motivo.
create or replace function private.seal_apply_wifi_result(p_command public.seal_commands, p_result text, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_result = 'executed' then
    update public.seal_devices set wifi_saved = case p_command.kind
        when 'wifi_add' then case when wifi_saved ? p_command.wifi_ssid then wifi_saved else wifi_saved || jsonb_build_array(p_command.wifi_ssid) end
        when 'wifi_remove' then wifi_saved - p_command.wifi_ssid
        else '[]'::jsonb end,
      updated_at = now()
     where id = p_command.device_id;
  else
    perform private.open_seal_alert(p_command.device_id, 'wifi_change_failed', 'medium', 'system',
      jsonb_build_object('reason', p_reason, 'ssid', p_command.wifi_ssid, 'kind', p_command.kind), false);
  end if;
end $$;

-- O lacre trocou de rede sozinho (rede da lista sumiu, volta à padrão): a tela mostra a rede em uso e as guardadas (RF-034e).
create or replace function private.seal_handle_network_change(p_device uuid, p_message jsonb, p_message_row uuid, p_stale boolean)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid;
begin
  select d.organization_id into v_org from public.seal_devices d where d.id = p_device;
  if not p_stale then
    update public.seal_devices set wifi_in_use = (p_message->'wifi') || jsonb_build_object('at', p_message->>'read_at'),
      wifi_saved = coalesce(p_message->'saved', wifi_saved), updated_at = now()
     where id = p_device;
  end if;
  insert into public.seal_device_events (organization_id, device_id, event_type, at, detail)
  values (v_org, p_device, 'network_changed', (p_message->>'read_at')::timestamptz, jsonb_build_object('ssid', p_message->'wifi'->>'ssid', 'kind', p_message->'wifi'->>'kind'));
  perform private.seal_broadcast(v_org, 'network', p_device, null);
  return null;
end $$;

revoke all on function private.seal_wifi_risky(uuid), private.seal_wifi_guard(uuid, uuid, uuid, uuid, uuid, text, boolean) from public, anon, authenticated;
revoke all on function public.wifi_add(uuid, uuid, uuid, uuid, uuid, text, text, boolean, boolean), public.wifi_remove(uuid, uuid, uuid, uuid, uuid, text, boolean),
  public.wifi_reset(uuid, uuid, uuid, uuid, uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.wifi_add(uuid, uuid, uuid, uuid, uuid, text, text, boolean, boolean), public.wifi_remove(uuid, uuid, uuid, uuid, uuid, text, boolean),
  public.wifi_reset(uuid, uuid, uuid, uuid, uuid, text, boolean) to service_role;
