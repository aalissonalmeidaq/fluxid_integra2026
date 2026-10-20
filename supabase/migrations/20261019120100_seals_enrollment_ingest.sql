-- Spec 013, US2: o pedido de aprovação pelo mesmo seal_ingest (contracts/pedido-de-aprovacao.md; research.md, itens 3, 4 e 11;
-- RF-008 a RF-010, RF-017, RN-003, RN-006). A Spec 012 criou seal_ingest uma única vez; esta spec a substitui inteira porque a busca
-- pelo código passa a olhar só a linha ativa (research.md, item 5) e porque o lacre sem linha ativa vira pedido. O caminho do lacre
-- aprovado (a partir da autenticação) é o mesmo da Spec 012.

-- Resumo do pedido tirado das mensagens do lacre que aguarda: a rede em uso e o sinal vêm do network_change. Nada vira dado de tenant.
create function private.seal_enrollment_touch(p_enrollment uuid, p_body jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_net jsonb;
  v_ssid text;
  v_rssi integer;
begin
  select m->'data' into v_net from jsonb_array_elements(coalesce(p_body->'messages', '[]'::jsonb)) m
   where m->>'type' = 'network_change' and m->>'problem' is null order by m->>'read_at' desc limit 1;
  v_ssid := nullif(v_net->'wifi'->>'ssid', '');
  v_rssi := case when jsonb_typeof(v_net->'wifi'->'rssi') = 'number' then (v_net->'wifi'->>'rssi')::numeric::int end;
  update public.seal_enrollments set
    last_seen_at = now(),
    calls = calls + 1,
    signal_dbm = case when v_rssi between -127 and 0 then v_rssi else signal_dbm end,
    wifi_ssid = case when v_ssid is not null and octet_length(v_ssid) <= 32 then v_ssid else wifi_ssid end,
    firmware_version = coalesce(nullif(left(p_body->>'firmware_version', 32), ''), firmware_version),
    updated_at = now()
   where id = p_enrollment;
end $$;

-- Confirmação do esquecimento das redes (RN-006): limpa o pedido aberto e, com 'all', libera a destinação a outro tenant. Sem pedido
-- aberto, o evento não tem efeito.
create function private.seal_networks_forgotten(p_enrollment uuid, p_detail text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.seal_enrollments set
    last_organization_id = case when p_detail = 'all' then null else last_organization_id end,
    forget_networks = null, forget_networks_requested_at = null, updated_at = now()
   where id = p_enrollment and forget_networks is not null
     and (p_detail = 'all' or forget_networks = 'extras');
end $$;

-- Marca de conflito: outro aparelho chamou com o mesmo código e outra chave (RF-010). O lacre conhecido não é afetado.
create function private.seal_mark_conflict(p_device_code text, p_key_hash bytea) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_key_hash is null or octet_length(p_key_hash) <> 32 then return; end if;
  update public.seal_enrollments set conflict_at = now(), conflict_key_hash = p_key_hash, conflict_calls = conflict_calls + 1, updated_at = now()
   where device_code = p_device_code;
end $$;

-- Janela de limite dos pedidos (research.md, item 11). Devolve a contagem depois desta chamada.
create function private.seal_enroll_hit(p_bucket text, p_window timestamptz) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_count integer;
begin
  insert into private.seal_enroll_rate_windows as w (bucket, window_start, count) values (p_bucket, p_window, 1)
  on conflict (bucket, window_start) do update set count = w.count + 1
  returning count into v_count;
  delete from private.seal_enroll_rate_windows w where w.bucket = p_bucket and w.window_start < p_window - interval '25 hours';
  return v_count;
end $$;

-- Lacre aprovado também confirma o esquecimento (por exemplo, devolvido e destinado de novo ao mesmo tenant antes de confirmar).
create or replace function private.seal_handle_event(p_device uuid, p_message jsonb, p_message_row uuid, p_stale boolean)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_device public.seal_devices;
begin
  if p_message->>'code' = 'networks_forgotten' then
    select d.* into v_device from public.seal_devices d where d.id = p_device;
    insert into public.seal_device_events (organization_id, device_id, event_type, at, detail)
    values (v_device.organization_id, p_device, 'networks_forgotten', (p_message->>'read_at')::timestamptz,
      jsonb_build_object('scope', p_message->>'detail'));
    perform private.seal_networks_forgotten(e.id, p_message->>'detail') from public.seal_enrollments e where e.device_id = p_device;
  end if;
  return null;
end $$;

-- Ponto de entrada do lacre (contracts/mensagens-do-lacre.md da Spec 012 e contracts/pedido-de-aprovacao.md desta spec).
create or replace function public.seal_ingest(p_device_code text, p_key_hash bytea, p_source_hash bytea, p_body jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_limits jsonb := private.seal_limits();
  v_enroll_limits jsonb := private.seal_enrollment_limits();
  v_device public.seal_devices;
  v_enrollment public.seal_enrollments;
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
  v_body jsonb;
begin
  -- Endereço bloqueado por chaves erradas: a mesma resposta de limite, sem dizer se o dispositivo existe.
  select f.blocked_until into v_block from private.seal_auth_failures f where f.source_hash = p_source_hash;
  if v_block is not null and v_block > now() then
    return jsonb_build_object('status', 429, 'retry_after', greatest(1, ceil(extract(epoch from v_block - now()))::int),
      'body', jsonb_build_object('error', 'rate_limited'));
  end if;

  select d.* into v_device from public.seal_devices d where d.device_code = p_device_code and d.status = 'active';

  -- Sem linha ativa: o lacre é um pedido de aprovação (research.md, item 3). Nada do corpo vira dado de tenant (RN-003).
  if v_device.id is null then
    if p_device_code is null or p_device_code !~ '^DSP-[0-9A-Z]{8}$' or p_key_hash is null or octet_length(p_key_hash) <> 32 then
      perform private.seal_auth_failed(p_source_hash);
      return jsonb_build_object('status', 401, 'body', jsonb_build_object('error', 'unauthorized'));
    end if;
    select e.* into v_enrollment from public.seal_enrollments e where e.device_code = p_device_code for update;

    if v_enrollment.id is null then
      -- Pedido novo: no máximo 20 por resumo de endereço e por hora; o excesso não é criado e é contado para o Master.
      v_count := private.seal_enroll_hit('enroll:' || coalesce(encode(p_source_hash, 'hex'), 'sem-origem'), date_trunc('hour', now()));
      if v_count > (v_enroll_limits->>'new_requests_per_source_per_hour')::int then
        return jsonb_build_object('status', 429, 'retry_after', greatest(1, ceil(extract(epoch from date_trunc('hour', now()) + interval '1 hour' - now()))::int),
          'body', jsonb_build_object('error', 'rate_limited'));
      end if;
      insert into public.seal_enrollments (device_code, key_hash, source_hash) values (p_device_code, p_key_hash, p_source_hash)
      returning * into v_enrollment;
      perform private.seal_enroll_hit('pending:' || v_enrollment.id::text, v_window);
      perform private.seal_enrollment_touch(v_enrollment.id, p_body);
      return jsonb_build_object('status', 202, 'body', jsonb_build_object('status', 'pending_approval',
        'report_interval_s', (v_limits->>'report_interval_default_s')::int));
    end if;

    -- Código conhecido com outra chave: 401 sem motivo e marca de conflito (CA-006 da Spec 012; RF-010).
    if v_enrollment.key_hash <> p_key_hash or v_enrollment.status = 'approved' then
      if v_enrollment.key_hash <> p_key_hash then perform private.seal_mark_conflict(p_device_code, p_key_hash); end if;
      perform private.seal_auth_failed(p_source_hash);
      return jsonb_build_object('status', 401, 'body', jsonb_build_object('error', 'unauthorized'));
    end if;

    -- Cada pedido segue o mesmo valor do limite por dispositivo da Spec 012.
    v_count := private.seal_enroll_hit('pending:' || v_enrollment.id::text, v_window);
    if v_count > (v_enroll_limits->>'pending_requests_per_minute')::int then
      return jsonb_build_object('status', 429, 'retry_after', greatest(1, 60 - floor(extract(second from now()))::int),
        'body', jsonb_build_object('error', 'rate_limited'));
    end if;

    if v_enrollment.status = 'refused' then
      update public.seal_enrollments set last_seen_at = now(), updated_at = now() where id = v_enrollment.id;
      return jsonb_build_object('status', 403, 'body', jsonb_build_object('status', 'refused'));
    end if;
    if v_enrollment.status = 'expired' then
      update public.seal_enrollments set status = 'pending', updated_at = now() where id = v_enrollment.id;
    end if;
    perform private.seal_enrollment_touch(v_enrollment.id, p_body);
    perform private.seal_networks_forgotten(v_enrollment.id, m->'data'->>'detail')
       from jsonb_array_elements(coalesce(v_messages, '[]'::jsonb)) m
      where m->>'type' = 'event' and m->>'problem' is null and m->'data'->>'code' = 'networks_forgotten';
    select e.* into v_enrollment from public.seal_enrollments e where e.id = v_enrollment.id;
    v_body := jsonb_build_object('status', 'pending_approval', 'report_interval_s', (v_limits->>'report_interval_default_s')::int);
    if v_enrollment.forget_networks is not null then v_body := v_body || jsonb_build_object('forget_networks', v_enrollment.forget_networks); end if;
    return jsonb_build_object('status', 202, 'body', v_body);
  end if;

  -- Linha ativa: o caminho da Spec 012. A chave errada marca o conflito no pedido, se houver.
  if p_key_hash is null or v_device.key_hash <> p_key_hash then
    perform private.seal_mark_conflict(p_device_code, p_key_hash);
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

revoke all on function private.seal_enrollment_touch(uuid, jsonb), private.seal_networks_forgotten(uuid, text),
  private.seal_mark_conflict(text, bytea), private.seal_enroll_hit(text, timestamptz) from public, anon, authenticated;
revoke all on function public.seal_ingest(text, bytea, bytea, jsonb) from public, anon, authenticated;
grant execute on function public.seal_ingest(text, bytea, bytea, jsonb) to service_role;
