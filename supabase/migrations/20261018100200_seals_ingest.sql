-- Spec 012, US1: ingestão das mensagens do lacre (RF-001 a RF-010, RF-032; research.md, itens 1 a 5). `seal_ingest` é criada UMA
-- única vez: autentica, aplica os limites, deduplica, ordena e repassa cada mensagem ao tratador do tipo dela. As histórias seguintes
-- substituem só os tratadores (`private.seal_handle_*`), `private.seal_after_batch` e `private.seal_build_response`.

-- Conversão tolerante de horário: a borda já validou o formato, mas o banco nunca deve falhar por um texto inesperado.
create function private.seal_try_instant(p_text text) returns timestamptz language plpgsql immutable set search_path = '' as $$
begin
  return p_text::timestamptz;
exception when others then
  return null;
end $$;

-- Código aleatório sem caracteres ambíguos (sem I, L, O e U), único na tabela: `DSP-` para dispositivo e `LCR-` para o lacre.
create function private.seal_random_code(p_prefix text) returns text language plpgsql volatile set search_path = '' as $$
declare
  v_alphabet constant text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  v_code text;
begin
  loop
    v_code := p_prefix || '-' || (select string_agg(substr(v_alphabet, 1 + floor(random() * 32)::int, 1), '') from generate_series(1, 8));
    exit when not exists (select 1 from public.seal_devices d where d.device_code = v_code or d.seal_code = v_code);
  end loop;
  return v_code;
end $$;

-- Alerta do lacre ou do FluxID, sem duplicar (RF-035): se já existe um aberto do mesmo tipo para o dispositivo, só o contexto muda.
-- O cilindro é o do vínculo ativo na abertura.
create function private.open_seal_alert(p_device uuid, p_kind text, p_severity text, p_source text, p_context jsonb, p_requires_push boolean)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid;
  v_cylinder uuid;
  v_id uuid;
begin
  select d.organization_id into v_org from public.seal_devices d where d.id = p_device;
  select b.cylinder_id into v_cylinder from public.seal_bindings b where b.device_id = p_device and b.unbound_at is null;
  insert into public.seal_alerts (organization_id, device_id, cylinder_id, kind, severity, source, context, requires_push)
  values (v_org, p_device, v_cylinder, p_kind, p_severity, p_source, coalesce(p_context, '{}'), p_requires_push)
  on conflict (device_id, kind) where status <> 'closed'
  do update set context = public.seal_alerts.context || excluded.context, updated_at = now()
  returning id into v_id;
  perform private.seal_broadcast(v_org, 'alert', p_device, v_cylinder);
  return v_id;
end $$;

-- Chave errada por endereço (RF-006): 10 falhas em 10 minutos bloqueiam o endereço por 15 minutos. O endereço chega só como hash.
create function private.seal_auth_failed(p_source bytea) returns void language plpgsql security definer set search_path = '' as $$
declare
  v_limits jsonb := private.seal_limits();
  v_count integer;
begin
  if p_source is null then return; end if;
  insert into private.seal_auth_failures as f (source_hash, window_start, count) values (p_source, now(), 1)
  on conflict (source_hash) do update set
    count = case when f.window_start < now() - make_interval(secs => (v_limits->>'auth_failures_window_s')::int) then 1 else f.count + 1 end,
    window_start = case when f.window_start < now() - make_interval(secs => (v_limits->>'auth_failures_window_s')::int) then now() else f.window_start end
  returning count into v_count;
  if v_count >= (v_limits->>'auth_failures_max')::int then
    update private.seal_auth_failures set blocked_until = now() + make_interval(secs => (v_limits->>'auth_block_s')::int) where source_hash = p_source;
  end if;
end $$;

-- Posição (RF-008 a RF-010, RN-009): a até 20 m da última posição GUARDADA com horário anterior ou igual, com a mesma qualidade e o
-- mesmo estado do lacre, só atualiza "visto por último", bateria, sinal e a contagem. A leitura atrasada (`p_stale`) entra no histórico
-- sem mudar a última posição do dispositivo. Devolve a posição (nova ou a repetida).
create function private.seal_store_position(p_device uuid, p_message jsonb, p_message_row uuid, p_stale boolean)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_limits jsonb := private.seal_limits();
  v_org uuid;
  v_read timestamptz := (p_message->>'read_at')::timestamptz;
  v_point extensions.geography := extensions.st_setsrid(
    extensions.st_makepoint((p_message->>'longitude')::float8, (p_message->>'latitude')::float8), 4326)::extensions.geography;
  v_quality text := p_message->>'quality';
  v_state text := coalesce(p_message->>'seal_state', 'unknown');
  v_battery smallint := (p_message->>'battery_pct')::smallint;
  v_signal smallint := (p_message->>'signal_dbm')::smallint;
  v_prev public.seal_positions;
  v_cylinder uuid;
  v_position uuid;
  v_new boolean := false;
begin
  select d.organization_id into v_org from public.seal_devices d where d.id = p_device for update;
  select b.cylinder_id into v_cylinder from public.seal_bindings b
   where b.device_id = p_device and b.bound_at <= v_read and (b.unbound_at is null or b.unbound_at > v_read)
   order by b.bound_at desc limit 1;
  select p.* into v_prev from public.seal_positions p where p.device_id = p_device and p.read_at <= v_read order by p.read_at desc limit 1;

  if v_prev.id is not null and v_prev.quality = v_quality and v_prev.seal_state = v_state
     and extensions.st_distance(v_prev.point, v_point) <= (v_limits->>'repeat_distance_m')::numeric then
    update public.seal_positions set
      last_seen_at = greatest(last_seen_at, v_read),
      battery_pct = case when v_read >= last_seen_at then v_battery else battery_pct end,
      signal_dbm = case when v_read >= last_seen_at then v_signal else signal_dbm end,
      repeat_count = repeat_count + 1
     where id = v_prev.id;
    v_position := v_prev.id;
  else
    insert into public.seal_positions (organization_id, device_id, cylinder_id, message_id, point, accuracy_m, quality, seal_state,
      battery_pct, signal_dbm, read_at, last_seen_at)
    values (v_org, p_device, v_cylinder, p_message_row, v_point, (p_message->>'accuracy_m')::numeric, v_quality, v_state,
      v_battery, v_signal, v_read, v_read)
    returning id into v_position;
    v_new := true;
  end if;

  if not p_stale then
    update public.seal_devices set
      last_read_at = greatest(coalesce(last_read_at, v_read), v_read),
      last_position_id = v_position,
      battery_pct = v_battery,
      signal_dbm = v_signal,
      seal_state = v_state,
      wifi_in_use = case when p_message ? 'wifi' then (p_message->'wifi') || jsonb_build_object('at', v_read) else wifi_in_use end,
      wifi_available = coalesce(p_message->'available_networks', wifi_available),
      updated_at = now()
     where id = p_device;
    if v_new then perform private.seal_broadcast(v_org, 'position', p_device, v_cylinder); end if;
  end if;
  return v_position;
end $$;

create or replace function private.seal_handle_position(p_device uuid, p_message jsonb, p_message_row uuid, p_stale boolean)
returns text language plpgsql security definer set search_path = '' as $$
begin
  perform private.seal_store_position(p_device, p_message, p_message_row, p_stale);
  return null;
end $$;

-- Ativação (RF-032): gera o identificador do lacre na primeira vez, registra a ativação e a posição. Se a válvula informada diverge
-- da trava confirmada, abre alerta sem mudar a trava (RN-010).
create or replace function private.seal_handle_activation(p_device uuid, p_message jsonb, p_message_row uuid, p_stale boolean)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_device public.seal_devices;
  v_valve text := p_message->>'valve';
begin
  select d.* into v_device from public.seal_devices d where d.id = p_device for update;
  update public.seal_devices set
    seal_code = coalesce(seal_code, private.seal_random_code('LCR')),
    activated_at = (p_message->>'read_at')::timestamptz,
    updated_at = now()
   where id = p_device;
  insert into public.seal_device_events (organization_id, device_id, event_type, at, detail)
  values (v_device.organization_id, p_device, 'activated', (p_message->>'read_at')::timestamptz, jsonb_build_object('valve', v_valve));
  perform private.seal_store_position(p_device, p_message, p_message_row, p_stale);
  if (v_valve = 'open' and v_device.lock_state in ('locked', 'locked_violation', 'locked_comm_loss'))
     or (v_valve = 'closed' and v_device.lock_state = 'unlocked') then
    perform private.open_seal_alert(p_device, 'command_failed', 'high', 'system',
      jsonb_build_object('reason', 'state_mismatch', 'valve', v_valve, 'lock_state', v_device.lock_state), true);
  end if;
  return null;
end $$;

-- Aviso de desligamento: registra o evento e a posição; a saúde e o alerta entram na US6.
create or replace function private.seal_handle_shutdown(p_device uuid, p_message jsonb, p_message_row uuid, p_stale boolean)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid;
begin
  select d.organization_id into v_org from public.seal_devices d where d.id = p_device;
  insert into public.seal_device_events (organization_id, device_id, event_type, at)
  values (v_org, p_device, 'shutdown', (p_message->>'read_at')::timestamptz);
  perform private.seal_store_position(p_device, p_message, p_message_row, p_stale);
  return null;
end $$;

-- Evento do lacre (boot, botão, válvula movida, volta à rede padrão): fica na própria mensagem recebida.
create or replace function private.seal_handle_event(p_device uuid, p_message jsonb, p_message_row uuid, p_stale boolean)
returns text language plpgsql security definer set search_path = '' as $$ begin return null; end $$;

-- Ponto de entrada do lacre (contracts/mensagens-do-lacre.md). A borda (`seal-gateway`) calcula o SHA-256 da chave e do endereço de
-- origem e entrega o corpo já validado: cada mensagem com `message_id`, `type`, `read_at`, `problem` (nulo ou o motivo da recusa) e
-- `data` (os campos do tipo). Devolve `{status, body, retry_after?}`; toda falha de autenticação tem exatamente o mesmo resultado.
create function public.seal_ingest(p_device_code text, p_key_hash bytea, p_source_hash bytea, p_body jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_limits jsonb := private.seal_limits();
  v_device public.seal_devices;
  v_block timestamptz;
  v_window timestamptz := date_trunc('minute', now());
  v_count integer;
  v_messages jsonb := p_body->'messages';
  v_results jsonb := '[]'::jsonb;
  v_item jsonb;
  v_message_id text;
  v_type text;
  v_read timestamptz;
  v_last timestamptz;
  v_row uuid;
  v_refusal text;
  v_data jsonb;
  v_watch integer;
begin
  -- Endereço bloqueado por chaves erradas: a mesma resposta de limite, sem dizer se o dispositivo existe.
  select f.blocked_until into v_block from private.seal_auth_failures f where f.source_hash = p_source_hash;
  if v_block is not null and v_block > now() then
    return jsonb_build_object('status', 429, 'retry_after', greatest(1, ceil(extract(epoch from v_block - now()))::int),
      'body', jsonb_build_object('error', 'rate_limited'));
  end if;

  select d.* into v_device from public.seal_devices d where d.device_code = p_device_code;
  if v_device.id is null or v_device.status <> 'active' or p_key_hash is null or v_device.key_hash <> p_key_hash then
    perform private.seal_auth_failed(p_source_hash);
    return jsonb_build_object('status', 401, 'body', jsonb_build_object('error', 'unauthorized'));
  end if;

  if not coalesce((v_limits->'protocols') @> jsonb_build_array(p_body->'protocol'), false) then
    return jsonb_build_object('status', 400, 'body', jsonb_build_object('error',
      case when jsonb_typeof(p_body->'protocol') = 'number' then 'unsupported_protocol' else 'invalid_body' end));
  end if;
  if jsonb_typeof(v_messages) is distinct from 'array' or jsonb_array_length(v_messages) not between 1 and (v_limits->>'batch_max')::int then
    return jsonb_build_object('status', 400, 'body', jsonb_build_object('error', 'invalid_body'));
  end if;

  -- Limite por dispositivo e por minuto (RF-006). O excesso não é gravado: o lacre reenvia com os mesmos identificadores.
  insert into private.seal_rate_windows as w (device_id, window_start, count) values (v_device.id, v_window, 1)
  on conflict (device_id, window_start) do update set count = w.count + 1
  returning count into v_count;
  delete from private.seal_rate_windows w where w.device_id = v_device.id and w.window_start < v_window - interval '1 hour';
  if v_count > (v_limits->>'device_requests_per_minute')::int then
    perform private.open_seal_alert(v_device.id, 'rate_limited', 'medium', 'system', jsonb_build_object('requests_in_minute', v_count), false);
    return jsonb_build_object('status', 429, 'retry_after', greatest(1, 60 - floor(extract(second from now()))::int),
      'body', jsonb_build_object('error', 'rate_limited'));
  end if;

  v_watch := coalesce((p_body->>'watch_version')::int, 0);
  update public.seal_devices set
    last_seen_at = now(),
    firmware_version = coalesce(nullif(p_body->>'firmware_version', ''), firmware_version),
    watch_version_ack = v_watch,
    updated_at = now()
   where id = v_device.id;

  for v_item in
    select value from jsonb_array_elements(v_messages) order by private.seal_try_instant(value->>'read_at') nulls last
  loop
    v_message_id := v_item->>'message_id';
    v_type := v_item->>'type';
    v_read := private.seal_try_instant(v_item->>'read_at');
    if v_message_id is null or char_length(v_message_id) not between 1 and 64 then
      return jsonb_build_object('status', 400, 'body', jsonb_build_object('error', 'invalid_body'));
    end if;
    if exists (select 1 from public.seal_messages m where m.device_id = v_device.id and m.message_id = v_message_id) then
      v_results := v_results || jsonb_build_object('message_id', v_message_id, 'status', 'duplicate');
      continue;
    end if;

    v_refusal := nullif(v_item->>'problem', '');
    if v_refusal is null and (v_read is null or v_type is null
        or v_type not in ('position', 'event', 'alert', 'command_result', 'activation', 'shutdown', 'network_change', 'auto_lock')) then
      v_refusal := 'invalid_field';
    end if;
    if v_refusal is null and v_read > now() + make_interval(secs => (v_limits->>'read_at_future_tolerance_s')::int) then
      v_refusal := 'read_at_in_future';
    end if;

    v_row := gen_random_uuid();
    v_data := coalesce(v_item->'data', '{}'::jsonb) || jsonb_build_object('read_at', v_read);
    if v_refusal is null then
      select d.last_read_at into v_last from public.seal_devices d where d.id = v_device.id;
      v_refusal := case v_type
        when 'position' then private.seal_handle_position(v_device.id, v_data, v_row, v_last is not null and v_read < v_last)
        when 'event' then private.seal_handle_event(v_device.id, v_data, v_row, v_last is not null and v_read < v_last)
        when 'alert' then private.seal_handle_alert(v_device.id, v_data, v_row, v_last is not null and v_read < v_last)
        when 'command_result' then private.seal_handle_command_result(v_device.id, v_data, v_row, v_last is not null and v_read < v_last)
        when 'activation' then private.seal_handle_activation(v_device.id, v_data, v_row, v_last is not null and v_read < v_last)
        when 'shutdown' then private.seal_handle_shutdown(v_device.id, v_data, v_row, v_last is not null and v_read < v_last)
        when 'network_change' then private.seal_handle_network_change(v_device.id, v_data, v_row, v_last is not null and v_read < v_last)
        when 'auto_lock' then private.seal_handle_auto_lock(v_device.id, v_data, v_row, v_last is not null and v_read < v_last)
      end;
    end if;

    -- A mensagem de tipo válido é registrada (gravada ou recusada); sem tipo válido, só o resultado volta ao lacre.
    if v_type in ('position', 'event', 'alert', 'command_result', 'activation', 'shutdown', 'network_change', 'auto_lock') then
      insert into public.seal_messages (id, organization_id, device_id, message_id, type, read_at, outcome, refusal_code, summary)
      values (v_row, v_device.organization_id, v_device.id, v_message_id, v_type, coalesce(v_read, now()),
        case when v_refusal is null then 'stored' else 'refused' end, v_refusal,
        coalesce(v_item->'data', '{}'::jsonb) - 'latitude' - 'longitude' - 'accuracy_m' - 'password');
    end if;
    v_results := v_results || case when v_refusal is null
      then jsonb_build_object('message_id', v_message_id, 'status', 'stored')
      else jsonb_build_object('message_id', v_message_id, 'status', 'refused', 'reason', v_refusal) end;
  end loop;

  perform private.seal_after_batch(v_device.id);
  select d.* into v_device from public.seal_devices d where d.id = v_device.id;
  return jsonb_build_object('status', 200, 'body', private.seal_build_response(v_device.id, v_watch) || jsonb_build_object(
    'server_time', now(), 'results', v_results, 'report_interval_s', v_device.report_interval_s));
end $$;

revoke all on function private.seal_try_instant(text), private.seal_random_code(text),
  private.open_seal_alert(uuid, text, text, text, jsonb, boolean), private.seal_auth_failed(bytea),
  private.seal_store_position(uuid, jsonb, uuid, boolean) from public, anon, authenticated;
revoke all on function public.seal_ingest(text, bytea, bytea, jsonb) from public, anon, authenticated;
grant execute on function public.seal_ingest(text, bytea, bytea, jsonb) to service_role;
