-- Spec 012, US6: notificações push do PWA (RF-036a a RF-036d, CA-010; research.md, item 8). Abrir um alerta que exige notificação põe
-- uma linha na fila por inscrição ativa de quem tem `seal.read` naquela organização; um gatilho chama a função `seal-push` por `pg_net`
-- (com um segredo do Vault), e a verificação automática reenvia o que ficou. A permissão é conferida de novo na hora do envio: quem a
-- perdeu tem a inscrição revogada e não recebe. O texto da notificação não tem coordenada, cliente nem nome de pessoa.

-- Permissão da pessoa na organização, sem depender de uma sessão (o envio acontece fora de qualquer sessão).
create function private.user_has_permission(p_user uuid, p_organization uuid, p_permission text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.memberships m
    join public.organizations o on o.id = m.organization_id and o.status = 'active'
    join public.membership_roles mr on mr.membership_id = m.id
    join public.roles r on r.id = mr.role_id and r.active
    join public.role_permissions rp on rp.role_id = r.id
    join public.permissions p on p.id = rp.permission_id and p.code = p_permission and p.active
    where m.user_id = p_user and m.organization_id = p_organization and m.status = 'active')
$$;

-- Segredos do envio no Vault: o segredo que a função apresenta ao banco e o endereço da função. Na nuvem, o endereço é trocado por
-- `vault.update_secret` para https://<projeto>.supabase.co/functions/v1/seal-push (docs/publicacao-em-nuvem.md).
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'seal_push_secret') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'seal_push_secret', 'Spec 012: segredo da função seal-push');
  end if;
  if not exists (select 1 from vault.secrets where name = 'seal_push_url') then
    perform vault.create_secret('http://supabase_kong_fluxid:8000/functions/v1/seal-push', 'seal_push_url', 'Spec 012: endereço da função seal-push');
  end if;
exception when others then
  raise notice 'Vault indisponível (%): configure os segredos seal_push_secret e seal_push_url.', sqlerrm;
end $$;

create function private.seal_push_secret_ok(p_secret text) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_secret is not null and exists (select 1 from vault.decrypted_secrets s where s.name = 'seal_push_secret' and s.decrypted_secret = p_secret)
$$;

-- Chama a função de envio; sem pg_net ou sem os segredos, não faz nada (a verificação automática tenta de novo).
create function private.seal_push_kick() returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_url text;
  v_secret text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'seal_push_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'seal_push_secret';
  if v_url is null or v_secret is null then return; end if;
  perform net.http_post(url := v_url, body := '{}'::jsonb,
    headers := jsonb_build_object('content-type', 'application/json', 'x-seal-push-secret', v_secret));
exception when others then
  raise notice 'notificação não disparada agora: %', sqlerrm;
end $$;

create function private.seal_push_enqueue(p_alert public.seal_alerts, p_kind text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.push_outbox (organization_id, alert_id, subscription_id, kind)
  select p_alert.organization_id, p_alert.id, s.id, p_kind
    from public.push_subscriptions s
   where s.organization_id = p_alert.organization_id and s.revoked_at is null
     and private.user_has_permission(s.user_id, p_alert.organization_id, 'seal.read')
  on conflict (alert_id, subscription_id, kind) do nothing;
end $$;

create function private.seal_alert_push_trigger() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' and new.requires_push then
    perform private.seal_push_enqueue(new, 'opened');
  elsif tg_op = 'UPDATE' and new.requires_push and new.kind = 'possible_loss' and old.recovered_at is null and new.recovered_at is not null then
    perform private.seal_push_enqueue(new, 'recovered');
  end if;
  return null;
end $$;
create trigger seal_alerts_push after insert or update of recovered_at on public.seal_alerts
  for each row execute function private.seal_alert_push_trigger();

create function private.seal_outbox_kick_trigger() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform private.seal_push_kick();
  return null;
end $$;
create trigger push_outbox_kick after insert on public.push_outbox for each statement execute function private.seal_outbox_kick_trigger();

-- Texto da notificação: tipo, código do cilindro (ou do lacre) e horário em São Paulo; nada de coordenada, cliente ou pessoa (RF-036c).
create function private.seal_push_text(p_kind text, p_push text, p_serial text, p_device_code text, p_at timestamptz) returns jsonb
language sql immutable set search_path = '' as $$
  select jsonb_build_object(
    'title', 'FluxID — ' || case when p_push = 'recovered' then 'lacre voltou a comunicar' else case p_kind
      when 'possible_loss' then 'possível extravio' when 'geofence_violation' then 'violação de geocerca'
      when 'comm_loss_lock' then 'travado por perda de comunicação' when 'seal_open' then 'lacre aberto' when 'seal_broken' then 'lacre rompido'
      when 'command_failed' then 'comando com erro' else 'alerta do lacre' end end,
    'body', coalesce('Cilindro ' || p_serial, 'Lacre ' || p_device_code) || ' · ' || to_char(p_at at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI'))
$$;

-- Lote para envio: confere a inscrição e a permissão de cada pessoa agora; quem perdeu a permissão tem a inscrição revogada.
create function private.claim_push_outbox_items(p_limit integer) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_row record;
  v_items jsonb := '[]'::jsonb;
begin
  for v_row in
    select o.id, o.kind, o.created_at, s.id as subscription_id, s.endpoint, s.p256dh, s.auth_secret, s.user_id, s.revoked_at,
           a.id as alert_id, a.kind as alert_kind, a.organization_id, a.opened_at, a.recovered_at, c.serial_number, d.device_code
      from public.push_outbox o
      join public.push_subscriptions s on s.id = o.subscription_id
      join public.seal_alerts a on a.id = o.alert_id
      join public.seal_devices d on d.id = a.device_id
      left join public.cylinders c on c.id = a.cylinder_id
     where o.status = 'pending' and o.attempts < 5
     order by o.created_at
     limit least(greatest(p_limit, 1), 100)
     for update of o skip locked
  loop
    if v_row.revoked_at is not null then
      update public.push_outbox set status = 'skipped' where id = v_row.id;
    elsif not private.user_has_permission(v_row.user_id, v_row.organization_id, 'seal.read') then
      update public.push_subscriptions set revoked_at = now(), revoke_reason = 'permission_lost' where id = v_row.subscription_id and revoked_at is null;
      update public.push_outbox set status = 'skipped' where subscription_id = v_row.subscription_id and status = 'pending';
    else
      update public.push_outbox set attempts = attempts + 1 where id = v_row.id;
      v_items := v_items || (jsonb_build_object('id', v_row.id, 'endpoint', v_row.endpoint, 'p256dh', v_row.p256dh, 'auth', v_row.auth_secret,
        'url', '/alertas/' || v_row.alert_id)
        || private.seal_push_text(v_row.alert_kind, v_row.kind, v_row.serial_number, v_row.device_code,
             case when v_row.kind = 'recovered' then coalesce(v_row.recovered_at, v_row.created_at) else v_row.opened_at end));
    end if;
  end loop;
  return v_items;
end $$;

-- Usadas só pela função `seal-push`, que apresenta o segredo do Vault.
create function public.claim_push_outbox(p_secret text, p_limit integer default 50) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if not private.seal_push_secret_ok(p_secret) then return jsonb_build_object('code', 'ACCESS_DENIED'); end if;
  return jsonb_build_object('code', 'OK', 'items', private.claim_push_outbox_items(p_limit));
end $$;

create function public.report_push_results(p_secret text, p_results jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_result jsonb;
begin
  if not private.seal_push_secret_ok(p_secret) then return jsonb_build_object('code', 'ACCESS_DENIED'); end if;
  for v_result in select value from jsonb_array_elements(coalesce(p_results, '[]'::jsonb)) loop
    if v_result->>'outcome' = 'sent' then
      update public.push_outbox set status = 'sent', sent_at = now(), last_error = null where id = (v_result->>'id')::uuid;
    elsif v_result->>'outcome' = 'gone' then
      update public.push_outbox set status = 'failed', last_error = 'gone' where id = (v_result->>'id')::uuid;
      update public.push_subscriptions s set revoked_at = now(), revoke_reason = 'gone'
        from public.push_outbox o where o.id = (v_result->>'id')::uuid and s.id = o.subscription_id and s.revoked_at is null;
    else
      update public.push_outbox set status = case when attempts >= 5 then 'failed' else 'pending' end,
        last_error = left(coalesce(v_result->>'error', 'failed'), 200) where id = (v_result->>'id')::uuid;
    end if;
  end loop;
  return jsonb_build_object('code', 'OK');
end $$;

-- A verificação automática reenvia o que ficou pendente.
create or replace function private.seal_watchdog_push() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.push_outbox where status = 'pending' and attempts < 5 and created_at < now() - interval '20 seconds') then
    perform private.seal_push_kick();
  end if;
end $$;

-- Inscrição do aparelho (RF-036b): ativar e desativar por aparelho; o mesmo endereço volta a valer para quem está no aparelho agora.
create function public.push_subscribe(p_actor uuid, p_session uuid, p_organization uuid, p_request uuid, p_endpoint text, p_p256dh text,
  p_auth text, p_label text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  denied text;
  replay jsonb;
  v_id uuid;
begin
  denied := private.cylinder_authorize(p_actor, p_session, p_organization, 'seal.read');
  if denied is not null then return jsonb_build_object('code', denied); end if;
  replay := private.seal_replay(p_organization, p_request, 'push_subscribe');
  if replay is not null then return replay; end if;
  if coalesce(char_length(p_endpoint), 0) not between 10 and 1000 or p_endpoint !~ '^https://' then
    return jsonb_build_object('code', 'VALIDATION_FAILED', 'fields', private.field_error('endpoint', 'Endereço de notificação inválido.'));
  end if;
  insert into public.push_subscriptions (organization_id, user_id, endpoint, p256dh, auth_secret, user_agent_label)
  values (p_organization, p_actor, p_endpoint, p_p256dh, p_auth, left(p_label, 80))
  on conflict (endpoint) do update set organization_id = excluded.organization_id, user_id = excluded.user_id, p256dh = excluded.p256dh,
    auth_secret = excluded.auth_secret, user_agent_label = excluded.user_agent_label, revoked_at = null, revoke_reason = null
  returning id into v_id;
  perform private.write_audit_event(p_organization, p_actor, p_session, 'seal.push_subscribe', 'push_subscription', v_id::text, 'success', null, null,
    jsonb_build_object('subscription_id', v_id));
  return private.seal_remember(p_organization, p_request, 'push_subscribe', jsonb_build_object('code', 'SUBSCRIBED', 'subscription_id', v_id));
end $$;

-- Desativar exige só a sessão: quem perdeu a permissão também pode desligar o próprio aparelho.
create function public.push_unsubscribe(p_actor uuid, p_session uuid, p_organization uuid, p_request uuid, p_endpoint text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  replay jsonb;
  v_id uuid;
begin
  if not exists (select 1 from public.user_sessions s where s.user_id = p_actor and s.session_id = p_session and s.status = 'active' and s.expires_at > now()) then
    return jsonb_build_object('code', 'AUTH_REQUIRED');
  end if;
  replay := private.seal_replay(p_organization, p_request, 'push_unsubscribe');
  if replay is not null then return replay; end if;
  update public.push_subscriptions set revoked_at = now(), revoke_reason = 'user'
   where endpoint = p_endpoint and user_id = p_actor and revoked_at is null returning id into v_id;
  if v_id is not null then
    perform private.write_audit_event(p_organization, p_actor, p_session, 'seal.push_unsubscribe', 'push_subscription', v_id::text, 'success', null, null,
      jsonb_build_object('subscription_id', v_id));
  end if;
  return private.seal_remember(p_organization, p_request, 'push_unsubscribe', jsonb_build_object('code', 'UNSUBSCRIBED'));
end $$;

create function public.push_status(p_actor uuid, p_session uuid, p_organization uuid, p_endpoint text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.user_sessions s where s.user_id = p_actor and s.session_id = p_session and s.status = 'active' and s.expires_at > now()) then
    return jsonb_build_object('code', 'AUTH_REQUIRED');
  end if;
  return jsonb_build_object('code', 'FOUND', 'active', exists (select 1 from public.push_subscriptions s
    where s.endpoint = p_endpoint and s.user_id = p_actor and s.organization_id = p_organization and s.revoked_at is null));
end $$;

revoke all on function private.user_has_permission(uuid, uuid, text), private.seal_push_secret_ok(text), private.seal_push_kick(),
  private.seal_push_enqueue(public.seal_alerts, text), private.seal_alert_push_trigger(), private.seal_outbox_kick_trigger(),
  private.seal_push_text(text, text, text, text, timestamptz), private.claim_push_outbox_items(integer) from public, anon, authenticated;
revoke all on function public.claim_push_outbox(text, integer), public.report_push_results(text, jsonb),
  public.push_subscribe(uuid, uuid, uuid, uuid, text, text, text, text), public.push_unsubscribe(uuid, uuid, uuid, uuid, text),
  public.push_status(uuid, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.claim_push_outbox(text, integer), public.report_push_results(text, jsonb),
  public.push_subscribe(uuid, uuid, uuid, uuid, text, text, text, text), public.push_unsubscribe(uuid, uuid, uuid, uuid, text),
  public.push_status(uuid, uuid, uuid, text) to service_role;
