-- Spec 015 (T079; US5, RF-027 a RF-031): ciclo do job de exportação. Solicitar, processar (claim), concluir, falhar, consultar e
-- autorizar o download revalidam, a cada passo, sessão, `report.export`, a permissão de leitura do tipo e que a pessoa é a solicitante:
-- perder qualquer uma bloqueia o passo (no processamento, o job falha sem arquivo). O arquivo só fica disponível pronto e não vencido.
-- Auditoria de solicitação, conclusão e obtenção sem linhas, coordenadas, caminho ou URL.

create function private.report_export_view(e public.report_exports) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id', e.id, 'report_type', e.report_type, 'label', private.report_label(e.report_type),
    'status', case when e.status = 'ready' and e.expires_at <= now() then 'expired' else e.status end,
    'row_count', e.row_count, 'failure_code', e.failure_code, 'requested_at', e.requested_at, 'completed_at', e.completed_at, 'expires_at', e.expires_at,
    'filters', e.filters, 'snapshot_at', e.snapshot_at)
$$;

-- Carrega o job da própria pessoa e revalida exportação e leitura do tipo. Devolve o código de recusa, ou nulo.
create function private.report_export_access(p_actor uuid, p_session uuid, p_organization uuid, p_export uuid, out denied text, out job public.report_exports)
language plpgsql security definer set search_path = '' as $$
begin
  denied := private.tracking_authorize(p_actor, p_session, p_organization, 'report.export');
  if denied is not null then return; end if;
  select e.* into job from public.report_exports e where e.id = p_export and e.organization_id = p_organization and e.requested_by = p_actor for update;
  if job.id is null then denied := 'NOT_FOUND'; return; end if;
  denied := private.tracking_authorize(p_actor, p_session, p_organization, private.report_permission(job.report_type));
end $$;

create function public.request_report_export(p_actor uuid, p_session uuid, p_organization uuid, p_request uuid, p_type text, p_filters jsonb,
  p_snapshot_at timestamptz default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  denied text;
  invalid text;
  v_job public.report_exports;
begin
  if private.report_permission(p_type) is null then return jsonb_build_object('code', 'INVALID_FILTER'); end if;
  denied := private.tracking_authorize(p_actor, p_session, p_organization, 'report.export');
  if denied is null then denied := private.tracking_authorize(p_actor, p_session, p_organization, private.report_permission(p_type)); end if;
  if denied is not null then return jsonb_build_object('code', denied); end if;
  select e.* into v_job from public.report_exports e where e.organization_id = p_organization and e.requested_by = p_actor and e.request_id = p_request;
  if found then return jsonb_build_object('code', 'REQUESTED', 'export', private.report_export_view(v_job), 'replayed', true); end if;
  invalid := private.report_validate(p_type, p_filters);
  if invalid is not null then return jsonb_build_object('code', invalid); end if;

  insert into public.report_exports (organization_id, requested_by, request_id, report_type, filters, filter_hash, snapshot_at)
  values (p_organization, p_actor, p_request, p_type, p_filters, md5(p_filters::text), least(coalesce(p_snapshot_at, now()), now()))
  returning * into v_job;
  perform private.tracking_audit(p_organization, p_actor, p_session, 'report.export_request', 'report_export', v_job.id::text, 'success', null, null,
    jsonb_build_object('report_type', p_type, 'filter_hash', v_job.filter_hash, 'from', p_filters->>'from', 'to', p_filters->>'to'));
  return jsonb_build_object('code', 'REQUESTED', 'export', private.report_export_view(v_job));
end $$;

-- Processamento: revalida e entrega à Edge Function as linhas do recorte e o contexto do arquivo. Sem autorização, o job falha sem arquivo.
create function public.claim_report_export(p_actor uuid, p_session uuid, p_organization uuid, p_export uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_access record;
  v_job public.report_exports;
begin
  select * into v_access from private.report_export_access(p_actor, p_session, p_organization, p_export);
  v_job := v_access.job;
  if v_access.denied is not null then
    if v_job.id is not null and v_job.status in ('queued', 'processing') then
      update public.report_exports set status = 'failed', failure_code = v_access.denied, updated_at = now() where id = v_job.id;
    end if;
    return jsonb_build_object('code', v_access.denied);
  end if;
  if v_job.status <> 'queued' then return jsonb_build_object('code', 'ALREADY_CLAIMED', 'export', private.report_export_view(v_job)); end if;
  update public.report_exports set status = 'processing', started_at = now(), updated_at = now() where id = v_job.id returning * into v_job;
  return jsonb_build_object('code', 'CLAIMED', 'export', private.report_export_view(v_job), 'columns', private.report_columns(v_job.report_type),
    'rows', coalesce((select jsonb_agg(r.row_values order by r.occurred_at, r.id)
                        from private.report_rows(p_organization, v_job.report_type, v_job.filters, v_job.snapshot_at) r), '[]'::jsonb),
    'context', jsonb_build_object('organization', (select o.display_name from public.organizations o where o.id = p_organization),
      'report_type', private.report_label(v_job.report_type), 'generated_at', now(), 'criteria', private.report_criteria_text(v_job.filters)));
end $$;

create function public.complete_report_export(p_actor uuid, p_session uuid, p_organization uuid, p_export uuid, p_storage_path text, p_row_count integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_access record;
  v_job public.report_exports;
begin
  select * into v_access from private.report_export_access(p_actor, p_session, p_organization, p_export);
  if v_access.denied is not null then return jsonb_build_object('code', v_access.denied); end if;
  v_job := v_access.job;
  if v_job.status <> 'processing' then return jsonb_build_object('code', 'INVALID_TRANSITION', 'from', v_job.status); end if;
  if p_storage_path is null or char_length(p_storage_path) not between 1 and 300 or p_storage_path ~ '\.\.' or p_row_count is null or p_row_count < 0 then
    return jsonb_build_object('code', 'VALIDATION_FAILED');
  end if;
  update public.report_exports set status = 'ready', storage_path = p_storage_path, row_count = p_row_count, completed_at = now(),
         expires_at = now() + interval '24 hours', updated_at = now()
   where id = v_job.id returning * into v_job;
  perform private.tracking_audit(p_organization, p_actor, p_session, 'report.export_complete', 'report_export', v_job.id::text, 'success', null, null,
    jsonb_build_object('report_type', v_job.report_type, 'row_count', p_row_count));
  return jsonb_build_object('code', 'READY', 'export', private.report_export_view(v_job));
end $$;

create function public.fail_report_export(p_actor uuid, p_session uuid, p_organization uuid, p_export uuid, p_code text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_access record;
  v_job public.report_exports;
begin
  select * into v_access from private.report_export_access(p_actor, p_session, p_organization, p_export);
  if v_access.denied is not null then return jsonb_build_object('code', v_access.denied); end if;
  v_job := v_access.job;
  if v_job.status not in ('queued', 'processing') then return jsonb_build_object('code', 'INVALID_TRANSITION', 'from', v_job.status); end if;
  update public.report_exports set status = 'failed', failure_code = case when p_code ~ '^[A-Z_]{1,40}$' then p_code else 'EXPORT_FAILED' end, updated_at = now()
   where id = v_job.id returning * into v_job;
  perform private.tracking_audit(p_organization, p_actor, p_session, 'report.export_complete', 'report_export', v_job.id::text, 'failed', v_job.failure_code, null,
    jsonb_build_object('report_type', v_job.report_type));
  return jsonb_build_object('code', 'FAILED', 'export', private.report_export_view(v_job));
end $$;

create function public.get_report_export(p_actor uuid, p_session uuid, p_organization uuid, p_export uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_access record;
begin
  select * into v_access from private.report_export_access(p_actor, p_session, p_organization, p_export);
  if v_access.denied is not null then return jsonb_build_object('code', v_access.denied); end if;
  return jsonb_build_object('code', 'FOUND', 'export', private.report_export_view(v_access.job));
end $$;

create function public.authorize_report_download(p_actor uuid, p_session uuid, p_organization uuid, p_request uuid, p_export uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_access record;
  v_job public.report_exports;
begin
  select * into v_access from private.report_export_access(p_actor, p_session, p_organization, p_export);
  if v_access.denied is not null then return jsonb_build_object('code', v_access.denied); end if;
  v_job := v_access.job;
  if v_job.status = 'ready' and v_job.expires_at <= now() then
    update public.report_exports set status = 'expired', updated_at = now() where id = v_job.id;
    return jsonb_build_object('code', 'EXPORT_EXPIRED');
  end if;
  if v_job.status = 'expired' then return jsonb_build_object('code', 'EXPORT_EXPIRED'); end if;
  if v_job.status <> 'ready' then return jsonb_build_object('code', 'INVALID_TRANSITION', 'from', v_job.status); end if;
  update public.report_exports set downloaded_at = now(), updated_at = now() where id = v_job.id;
  perform private.tracking_audit(p_organization, p_actor, p_session, 'report.export_download', 'report_export', v_job.id::text, 'success', null, null,
    jsonb_build_object('report_type', v_job.report_type, 'row_count', v_job.row_count));
  return jsonb_build_object('code', 'AUTHORIZED', 'storage_path', v_job.storage_path, 'expires_at', v_job.expires_at);
end $$;

revoke all on function private.report_export_view(public.report_exports), private.report_export_access(uuid, uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.request_report_export(uuid, uuid, uuid, uuid, text, jsonb, timestamptz), public.claim_report_export(uuid, uuid, uuid, uuid),
  public.complete_report_export(uuid, uuid, uuid, uuid, text, integer), public.fail_report_export(uuid, uuid, uuid, uuid, text),
  public.get_report_export(uuid, uuid, uuid, uuid), public.authorize_report_download(uuid, uuid, uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.request_report_export(uuid, uuid, uuid, uuid, text, jsonb, timestamptz), public.claim_report_export(uuid, uuid, uuid, uuid),
  public.complete_report_export(uuid, uuid, uuid, uuid, text, integer), public.fail_report_export(uuid, uuid, uuid, uuid, text),
  public.get_report_export(uuid, uuid, uuid, uuid), public.authorize_report_download(uuid, uuid, uuid, uuid, uuid) to service_role;
