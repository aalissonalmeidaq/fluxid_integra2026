-- Spec 015 (T095; US6, RF-034, RF-035): enfileirar os avisos por e-mail. Abrir um alerta de lacre alto ou crítico, recuperá-lo e confirmar
-- um afastamento põem no máximo um item por (empresa, ocorrência, transição, destinatário), só para quem tem vínculo ativo, a permissão
-- de leitura da categoria, a categoria liberada e a própria escolha ligada. O alerta de afastamento é avisado como afastamento, não como
-- alerta de lacre; afastamento só histórico (viagem já encerrada) e alerta médio não geram aviso. Enfileirar não envia nada: só grava a
-- referência, na mesma transação do evento, sem coordenada nem corpo.

create function private.email_enqueue(p_organization uuid, p_category text, p_type text, p_occurrence uuid, p_transition text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.email_category_enabled(p_organization, p_category) then return; end if;
  insert into public.email_notification_outbox (organization_id, category, occurrence_type, occurrence_id, transition, recipient_user_id)
  select p_organization, p_category, p_type, p_occurrence, p_transition, p.user_id
    from public.email_notification_preferences p
   where p.organization_id = p_organization and p.category = p_category and p.enabled
     and private.email_recipient_block(p_organization, p.user_id, p_category) is null
  on conflict (organization_id, occurrence_type, occurrence_id, transition, recipient_user_id) do nothing;
end $$;

create function private.email_on_seal_alert() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.kind = 'proximity_separation' or new.severity not in ('high', 'critical') then return null; end if;
  if tg_op = 'INSERT' then
    perform private.email_enqueue(new.organization_id, 'seal_high_critical', 'seal_alert', new.id, 'opened');
  elsif old.recovered_at is null and new.recovered_at is not null then
    perform private.email_enqueue(new.organization_id, 'seal_recovered', 'seal_alert', new.id, 'recovered');
  end if;
  return null;
end $$;
create trigger seal_alerts_email after insert or update of recovered_at on public.seal_alerts
  for each row execute function private.email_on_seal_alert();

create function private.email_on_proximity_occurrence() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'open' then
    perform private.email_enqueue(new.organization_id, 'proximity_confirmed', 'proximity_occurrence', new.id, 'opened');
  end if;
  return null;
end $$;
create trigger proximity_occurrences_email after insert on public.proximity_occurrences
  for each row execute function private.email_on_proximity_occurrence();

-- Disparo da função de envio por pg_net, só quando o endereço `email_notifications_url` foi configurado (provedor escolhido e
-- autorizado). Sem ele, não faz nada e os itens esperam.
create function private.email_kick() returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_url text;
  v_secret text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'email_notifications_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'email_notifications_secret';
  if v_url is null or v_secret is null then return; end if;
  perform net.http_post(url := v_url, body := '{}'::jsonb,
    headers := jsonb_build_object('content-type', 'application/json', 'x-email-notifications-secret', v_secret));
exception when others then
  raise notice 'aviso por e-mail não disparado agora: %', sqlerrm;
end $$;

create function private.email_outbox_kick_trigger() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform private.email_kick();
  return null;
end $$;
create trigger email_notification_outbox_kick after insert on public.email_notification_outbox
  for each statement execute function private.email_outbox_kick_trigger();

-- A verificação automática dos lacres (a cada minuto) também dispara as novas tentativas vencidas e as reclamações abandonadas.
create or replace function private.seal_watchdog_push() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.push_outbox where status = 'pending' and attempts < 5 and created_at < now() - interval '20 seconds') then
    perform private.seal_push_kick();
  end if;
  if exists (select 1 from public.email_notification_outbox
              where (status in ('pending', 'retry') and next_attempt_at <= now()) or (status = 'processing' and claimed_at < now() - interval '5 minutes')) then
    perform private.email_kick();
  end if;
end $$;

revoke all on function private.email_enqueue(uuid, text, text, uuid, text), private.email_on_seal_alert(), private.email_on_proximity_occurrence(),
  private.email_kick(), private.email_outbox_kick_trigger(), private.seal_watchdog_push() from public, anon, authenticated;
