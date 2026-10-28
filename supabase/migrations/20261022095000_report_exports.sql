-- Spec 015 (T076; US5, RF-027 a RF-031): job de exportação de relatório. Um por solicitante e pedido (idempotência); estados
-- queued → processing → ready → expired, ou processing → failed. O arquivo (caminho no bucket privado) só existe quando pronto; o
-- objeto incompleto nunca é exposto. Os filtros guardam só chaves canônicas e ids. RLS sem política: acesso só por RPC.
create table public.report_exports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  requested_by uuid not null references auth.users(id),
  request_id uuid not null,
  report_type text not null,
  filters jsonb not null,
  filter_hash text not null,
  snapshot_at timestamptz not null,
  status text not null default 'queued',
  row_count integer,
  storage_path text,
  failure_code text,
  requested_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  expires_at timestamptz,
  downloaded_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint report_exports_id_org_key unique (id, organization_id),
  constraint report_exports_request_key unique (organization_id, requested_by, request_id),
  constraint report_exports_type_check check (report_type in ('trips', 'telemetry_availability', 'proximity', 'alerts', 'deliveries', 'custody')),
  constraint report_exports_status_check check (status in ('queued', 'processing', 'ready', 'failed', 'expired')),
  constraint report_exports_filters_check check (jsonb_typeof(filters) = 'object'),
  constraint report_exports_rows_check check (row_count is null or row_count >= 0),
  constraint report_exports_failure_check check ((status = 'failed') = (failure_code is not null) and (failure_code is null or failure_code ~ '^[A-Z_]{1,40}$')),
  constraint report_exports_ready_check check (status not in ('ready', 'expired') or (storage_path is not null and completed_at is not null and expires_at is not null)),
  constraint report_exports_path_check check (storage_path is null or (char_length(storage_path) between 1 and 300 and storage_path !~ '\.\.'))
);
create index report_exports_pending_idx on public.report_exports (requested_at, id) where status in ('queued', 'processing');
create index report_exports_expiry_idx on public.report_exports (expires_at) where status = 'ready';
create index report_exports_requester_idx on public.report_exports (organization_id, requested_by, requested_at desc);

create trigger report_exports_no_delete before delete on public.report_exports for each statement execute function private.refuse_tracking_delete();
create trigger report_exports_no_truncate before truncate on public.report_exports for each statement execute function private.refuse_tracking_delete();

alter table public.report_exports enable row level security;
revoke all on public.report_exports from anon, authenticated;
