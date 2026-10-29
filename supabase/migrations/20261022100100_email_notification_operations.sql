-- Spec 015 (T094; US6, contracts/avisos-email.md): operações dos avisos por e-mail. Administrar as categorias exige
-- `notification_category.manage`, versão otimista, idempotência e auditoria; retirar uma categoria cancela o que ainda não foi
-- reclamado. A preferência é só da própria pessoa e só para o que foi liberado e o que a permissão de leitura alcança. O envio é da
-- função servidora, que apresenta o segredo do Vault: reclama um lote curto, revalida cada item e relata o resultado de forma
-- idempotente. Nenhuma operação daqui altera o alerta ou a ocorrência de origem. A auditoria guarda categorias, nunca e-mail ou corpo.

create function private.email_categories() returns text[]
language sql immutable set search_path = '' as $$
  select array['proximity_confirmed', 'seal_high_critical', 'seal_recovered']
$$;

-- Leitura que cada categoria exige do destinatário (o administrar não torna ninguém destinatário).
create function private.email_category_permission(p_category text) returns text
language sql immutable set search_path = '' as $$
  select case p_category when 'proximity_confirmed' then 'tracking.read' else 'seal.read' end
$$;

create function private.email_category_enabled(p_organization uuid, p_category text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select c.enabled from public.email_notification_categories c where c.organization_id = p_organization and c.category = p_category), false)
$$;

-- Motivo de um item não poder sair agora (nulo quando pode): vínculo, permissão, liberação e escolha valem no instante do envio.
create function private.email_recipient_block(p_organization uuid, p_user uuid, p_category text) returns text
language sql stable security definer set search_path = '' as $$
  select case
    when not exists (select 1 from public.memberships m join public.organizations o on o.id = m.organization_id and o.status = 'active'
                      where m.organization_id = p_organization and m.user_id = p_user and m.status = 'active') then 'MEMBERSHIP_INACTIVE'
    when not private.user_has_permission(p_user, p_organization, private.email_category_permission(p_category)) then 'PERMISSION_LOST'
    when not private.email_category_enabled(p_organization, p_category) then 'CATEGORY_DISABLED'
    when not coalesce((select p.enabled from public.email_notification_preferences p
                        where p.organization_id = p_organization and p.user_id = p_user and p.category = p_category), false) then 'PREFERENCE_OFF'
  end
$$;

-- Sessão ativa e vínculo ativo, sem exigir permissão: a preferência é da própria pessoa.
create function private.email_member_authorize(p_actor uuid, p_session uuid, p_organization uuid) returns text
language sql stable security definer set search_path = '' as $$
  select case
    when not exists (select 1 from public.user_sessions s where s.user_id = p_actor and s.session_id = p_session and s.status = 'active'
                      and s.expires_at > now() and s.last_seen_at > now() - interval '30 minutes') then 'AUTH_REQUIRED'
    when not exists (select 1 from public.memberships m join public.organizations o on o.id = m.organization_id and o.status = 'active'
                      where m.organization_id = p_organization and m.user_id = p_actor and m.status = 'active') then 'ACCESS_DENIED'
  end
$$;

create function private.email_categories_view(p_organization uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('version', coalesce((select max(c.version) from public.email_notification_categories c where c.organization_id = p_organization), 0),
    'categories', (select jsonb_agg(jsonb_build_object('category', k, 'enabled', private.email_category_enabled(p_organization, k)) order by k)
                     from unnest(private.email_categories()) k))
$$;

create function public.get_notification_categories(p_actor uuid, p_session uuid, p_organization uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  denied text := private.tracking_authorize(p_actor, p_session, p_organization, 'notification_category.manage');
begin
  if denied is not null then return jsonb_build_object('code', denied); end if;
  return jsonb_build_object('code', 'FOUND') || private.email_categories_view(p_organization);
end $$;

create function public.set_notification_categories(p_actor uuid, p_session uuid, p_organization uuid, p_request uuid, p_categories text[], p_version bigint)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  denied text := private.tracking_authorize(p_actor, p_session, p_organization, 'notification_category.manage');
  replay jsonb;
  v_current bigint;
  v_enabled text[] := coalesce(p_categories, '{}');
  v_result jsonb;
begin
  if denied is not null then return jsonb_build_object('code', denied); end if;
  replay := private.seal_replay(p_organization, p_request, 'set_notification_categories');
  if replay is not null then return replay; end if;
  if not v_enabled <@ private.email_categories() then
    return jsonb_build_object('code', 'VALIDATION_FAILED', 'fields', private.field_error('categories', 'Categoria desconhecida.'));
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_organization::text || ':email-categories', 0));
  select coalesce(max(c.version), 0) into v_current from public.email_notification_categories c where c.organization_id = p_organization;
  if p_version is distinct from v_current then return jsonb_build_object('code', 'VERSION_CONFLICT', 'version', v_current); end if;

  insert into public.email_notification_categories (organization_id, category, enabled, version, updated_by, updated_at)
  select p_organization, k, k = any(v_enabled), v_current + 1, p_actor, now() from unnest(private.email_categories()) k
  on conflict (organization_id, category) do update set enabled = excluded.enabled, version = excluded.version,
    updated_by = excluded.updated_by, updated_at = excluded.updated_at;
  -- Retirar uma categoria cancela o que ainda não foi reclamado; o histórico de entrega fica.
  update public.email_notification_outbox set status = 'cancelled', last_error_code = 'CATEGORY_DISABLED', updated_at = now()
   where organization_id = p_organization and status in ('pending', 'retry') and not (category = any(v_enabled));

  perform private.tracking_audit(p_organization, p_actor, p_session, 'notification.categories_update', 'organization', p_organization::text,
    'success', null, null, jsonb_build_object('enabled', to_jsonb(v_enabled), 'version', v_current + 1));
  v_result := jsonb_build_object('code', 'UPDATED') || private.email_categories_view(p_organization);
  return private.seal_remember(p_organization, p_request, 'set_notification_categories', v_result);
end $$;

create function private.email_preferences_view(p_organization uuid, p_user uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_agg(jsonb_build_object('category', k,
      'allowed', private.email_category_enabled(p_organization, k)
                 and private.user_has_permission(p_user, p_organization, private.email_category_permission(k)),
      'enabled', coalesce(p.enabled, false)
                 and private.email_category_enabled(p_organization, k)
                 and private.user_has_permission(p_user, p_organization, private.email_category_permission(k)),
      'reason', case
        when not private.email_category_enabled(p_organization, k) then 'not_released'
        when not private.user_has_permission(p_user, p_organization, private.email_category_permission(k)) then 'no_permission' end)
    order by k)
    from unnest(private.email_categories()) k
    left join public.email_notification_preferences p on p.organization_id = p_organization and p.user_id = p_user and p.category = k
$$;

create function public.get_my_email_preferences(p_actor uuid, p_session uuid, p_organization uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  denied text := private.email_member_authorize(p_actor, p_session, p_organization);
begin
  if denied is not null then return jsonb_build_object('code', denied); end if;
  return jsonb_build_object('code', 'FOUND', 'categories', private.email_preferences_view(p_organization, p_actor));
end $$;

create function public.set_my_email_preferences(p_actor uuid, p_session uuid, p_organization uuid, p_request uuid, p_categories text[])
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  denied text := private.email_member_authorize(p_actor, p_session, p_organization);
  replay jsonb;
  v_enabled text[] := coalesce(p_categories, '{}');
  v_result jsonb;
begin
  if denied is not null then return jsonb_build_object('code', denied); end if;
  replay := private.seal_replay(p_organization, p_request, 'set_my_email_preferences');
  if replay is not null then return replay; end if;
  if not v_enabled <@ private.email_categories() then
    return jsonb_build_object('code', 'VALIDATION_FAILED', 'fields', private.field_error('categories', 'Categoria desconhecida.'));
  end if;
  if exists (select 1 from unnest(v_enabled) k where not private.email_category_enabled(p_organization, k)
              or not private.user_has_permission(p_actor, p_organization, private.email_category_permission(k))) then
    return jsonb_build_object('code', 'CATEGORY_NOT_ALLOWED');
  end if;
  -- Só as categorias liberadas têm linha; as demais continuam desligadas pela ausência.
  insert into public.email_notification_preferences (organization_id, user_id, category, enabled, updated_at)
  select p_organization, p_actor, c.category, c.category = any(v_enabled), now()
    from public.email_notification_categories c where c.organization_id = p_organization and c.enabled
  on conflict (organization_id, user_id, category) do update set enabled = excluded.enabled, updated_at = excluded.updated_at;
  update public.email_notification_preferences set enabled = false, updated_at = now()
   where organization_id = p_organization and user_id = p_actor and enabled and not (category = any(v_enabled));

  perform private.tracking_audit(p_organization, p_actor, p_session, 'notification.preferences_update', 'user', p_actor::text,
    'success', null, null, jsonb_build_object('enabled', to_jsonb(v_enabled)));
  v_result := jsonb_build_object('code', 'UPDATED', 'categories', private.email_preferences_view(p_organization, p_actor));
  return private.seal_remember(p_organization, p_request, 'set_my_email_preferences', v_result);
end $$;

-- Segredo que a função servidora apresenta. O endereço da função (`email_notifications_url`) NÃO é criado aqui: sem provedor escolhido e
-- autorizado, nada dispara o envio sozinho (contracts/avisos-email.md). Ver docs/publicacao-em-nuvem.md.
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'email_notifications_secret') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'email_notifications_secret', 'Spec 015: segredo da função email-notifications');
  end if;
exception when others then
  raise notice 'Vault indisponível (%): configure o segredo email_notifications_secret.', sqlerrm;
end $$;

create function private.email_secret_ok(p_secret text) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_secret is not null and exists (select 1 from vault.decrypted_secrets s where s.name = 'email_notifications_secret' and s.decrypted_secret = p_secret)
$$;

-- Contexto mínimo de um item: empresa, instante, severidade ou estado, identificador operacional e o caminho do registro no FluxID.
create function private.email_item_context(p_item public.email_notification_outbox) returns jsonb
language sql stable security definer set search_path = '' as $$
  select case p_item.occurrence_type
    when 'seal_alert' then (
      select jsonb_build_object('occurred_at', case when p_item.transition = 'recovered' then coalesce(a.recovered_at, a.updated_at) else a.opened_at end,
        'severity', a.severity, 'kind', a.kind, 'identifier', coalesce(c.serial_number, d.device_code), 'path', '/alertas/' || a.id)
        from public.seal_alerts a join public.seal_devices d on d.id = a.device_id left join public.cylinders c on c.id = a.cylinder_id
       where a.id = p_item.occurrence_id and a.organization_id = p_item.organization_id)
    else (
      select jsonb_build_object('occurred_at', o.opened_at, 'severity', 'high', 'kind', 'proximity_separation', 'identifier', c.serial_number,
        'path', '/rastreamento/ocorrencias/' || o.id)
        from public.proximity_occurrences o join public.cylinders c on c.id = o.cylinder_id
       where o.id = p_item.occurrence_id and o.organization_id = p_item.organization_id)
  end
$$;

-- Lote curto: pendentes e novas tentativas vencidas, mais reclamações abandonadas há 5 minutos. Cada item é revalidado; o que não pode
-- mais sair é cancelado com o motivo.
create function public.claim_email_notifications(p_secret text, p_limit integer default 20)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_item public.email_notification_outbox;
  v_block text;
  v_items jsonb := '[]'::jsonb;
begin
  if not private.email_secret_ok(p_secret) then return jsonb_build_object('code', 'ACCESS_DENIED'); end if;
  for v_item in
    select o.* from public.email_notification_outbox o
     where (o.status in ('pending', 'retry') and o.next_attempt_at <= now())
        or (o.status = 'processing' and o.claimed_at < now() - interval '5 minutes')
     order by o.next_attempt_at, o.id
     limit least(greatest(coalesce(p_limit, 20), 1), 50)
     for update skip locked
  loop
    v_block := private.email_recipient_block(v_item.organization_id, v_item.recipient_user_id, v_item.category);
    if v_block is not null then
      update public.email_notification_outbox set status = 'cancelled', last_error_code = v_block, updated_at = now() where id = v_item.id;
      continue;
    end if;
    update public.email_notification_outbox set status = 'processing', claimed_at = now(), updated_at = now() where id = v_item.id;
    v_items := v_items || jsonb_build_array(jsonb_build_object('id', v_item.id, 'category', v_item.category, 'transition', v_item.transition,
      'to', (select u.email from auth.users u where u.id = v_item.recipient_user_id),
      'organization', (select o.display_name from public.organizations o where o.id = v_item.organization_id))
      || coalesce(private.email_item_context(v_item), '{}'::jsonb));
  end loop;
  return jsonb_build_object('code', 'OK', 'items', v_items);
end $$;

-- Relato do envio. Só muda item em processamento: repetir o relato não altera o que já saiu ou falhou. Erro transitório agenda nova
-- tentativa com espera crescente (2, 4, 8, 16 min); na quinta tentativa vira falha. Código fora do formato vira DELIVERY_FAILED.
create function public.report_email_delivery(p_secret text, p_results jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_result jsonb;
  v_code text;
begin
  if not private.email_secret_ok(p_secret) then return jsonb_build_object('code', 'ACCESS_DENIED'); end if;
  for v_result in select value from jsonb_array_elements(coalesce(p_results, '[]'::jsonb)) loop
    continue when coalesce(v_result->>'id', '') !~ '^[0-9a-f-]{36}$';
    v_code := case when coalesce(v_result->>'error_code', '') ~ '^[A-Z_]{1,40}$' then v_result->>'error_code' else 'DELIVERY_FAILED' end;
    if v_result->>'outcome' = 'sent' then
      update public.email_notification_outbox set status = 'sent', sent_at = now(), attempt_count = attempt_count + 1, last_error_code = null,
        provider_message_ref = left(v_result->>'provider_ref', 200), updated_at = now()
       where id = (v_result->>'id')::uuid and status = 'processing';
    elsif v_result->>'outcome' = 'retry' then
      update public.email_notification_outbox set attempt_count = attempt_count + 1, last_error_code = v_code, updated_at = now(),
        status = case when attempt_count + 1 >= 5 then 'failed' else 'retry' end,
        next_attempt_at = now() + make_interval(mins => power(2, attempt_count + 1)::integer)
       where id = (v_result->>'id')::uuid and status = 'processing';
    else
      update public.email_notification_outbox set status = 'failed', attempt_count = attempt_count + 1, last_error_code = v_code, updated_at = now()
       where id = (v_result->>'id')::uuid and status = 'processing';
    end if;
  end loop;
  return jsonb_build_object('code', 'OK');
end $$;

-- Estado dos avisos de um alerta (e da ocorrência de afastamento ligada a ele) para quem lê o alerta: sem destinatário nem endereço.
create function public.get_email_deliveries(p_actor uuid, p_session uuid, p_organization uuid, p_alert uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  denied text := private.tracking_authorize(p_actor, p_session, p_organization, 'seal.read');
begin
  if denied is not null then return jsonb_build_object('code', denied); end if;
  if not exists (select 1 from public.seal_alerts a where a.id = p_alert and a.organization_id = p_organization) then
    return jsonb_build_object('code', 'NOT_FOUND');
  end if;
  return jsonb_build_object('code', 'FOUND', 'items', coalesce((
    select jsonb_agg(jsonb_build_object('category', o.category, 'transition', o.transition, 'status', o.status, 'updated_at', o.updated_at,
      'sent_at', o.sent_at, 'error_code', o.last_error_code) order by o.transition, o.created_at, o.id)
      from public.email_notification_outbox o
     where o.organization_id = p_organization
       and (o.occurrence_id = p_alert
            or o.occurrence_id in (select po.id from public.proximity_occurrences po where po.alert_id = p_alert and po.organization_id = p_organization))
  ), '[]'::jsonb));
end $$;

revoke all on function private.email_categories(), private.email_category_permission(text), private.email_category_enabled(uuid, text),
  private.email_recipient_block(uuid, uuid, text), private.email_member_authorize(uuid, uuid, uuid), private.email_categories_view(uuid),
  private.email_preferences_view(uuid, uuid), private.email_secret_ok(text), private.email_item_context(public.email_notification_outbox)
  from public, anon, authenticated;
revoke all on function public.get_notification_categories(uuid, uuid, uuid), public.set_notification_categories(uuid, uuid, uuid, uuid, text[], bigint),
  public.get_my_email_preferences(uuid, uuid, uuid), public.set_my_email_preferences(uuid, uuid, uuid, uuid, text[]),
  public.claim_email_notifications(text, integer), public.report_email_delivery(text, jsonb), public.get_email_deliveries(uuid, uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.get_notification_categories(uuid, uuid, uuid), public.set_notification_categories(uuid, uuid, uuid, uuid, text[], bigint),
  public.get_my_email_preferences(uuid, uuid, uuid), public.set_my_email_preferences(uuid, uuid, uuid, uuid, text[]),
  public.claim_email_notifications(text, integer), public.report_email_delivery(text, jsonb), public.get_email_deliveries(uuid, uuid, uuid, uuid)
  to service_role;
