-- Spec 015 (RF-034; validação humana de 27/10/2026): retirar a liberação de uma categoria passa a desligar também a escolha de quem
-- tinha optado. Antes, a tela mostrava a opção desmarcada, mas o banco a guardava ligada, e uma nova liberação voltava a enviar sem a
-- pessoa escolher outra vez. A auditoria registra quantas escolhas foram desligadas (só a contagem, sem identificar ninguém).
create or replace function public.set_notification_categories(p_actor uuid, p_session uuid, p_organization uuid, p_request uuid, p_categories text[], p_version bigint)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  denied text := private.tracking_authorize(p_actor, p_session, p_organization, 'notification_category.manage');
  replay jsonb;
  v_current bigint;
  v_enabled text[] := coalesce(p_categories, '{}');
  v_result jsonb;
  v_turned_off integer;
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
  -- E desliga a escolha de quem tinha optado: liberar de novo não volta a enviar sem a pessoa escolher outra vez.
  update public.email_notification_preferences set enabled = false, updated_at = now()
   where organization_id = p_organization and enabled and not (category = any(v_enabled));
  get diagnostics v_turned_off = row_count;

  perform private.tracking_audit(p_organization, p_actor, p_session, 'notification.categories_update', 'organization', p_organization::text,
    'success', null, null, jsonb_build_object('enabled', to_jsonb(v_enabled), 'version', v_current + 1,
      'preferences_turned_off', v_turned_off));
  v_result := jsonb_build_object('code', 'UPDATED') || private.email_categories_view(p_organization);
  return private.seal_remember(p_organization, p_request, 'set_notification_categories', v_result);
end $$;
