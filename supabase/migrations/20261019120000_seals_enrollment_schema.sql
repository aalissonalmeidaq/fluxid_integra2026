-- Spec 013, Fundação: fila de pedidos de aprovação da plataforma, uma linha de dispositivo por destinação e limites dos pedidos
-- (data-model.md; research.md, itens 5, 6 e 11; princípio III). Nada é excluído: a destinação nova cria outra linha em seal_devices, e o
-- histórico de cada uma fica no tenant em que foi gerado (RN-005).

-- 1. Limites dos pedidos. Têm o mesmo valor de SEAL_ENROLLMENT_LIMITS (src/domain/seals/seal-limits.ts) e do firmware
-- (firmware/include/config.h); tests/contract/seals-limits.test.ts reprova divergência. Tempos em segundos.
create function private.seal_enrollment_limits() returns jsonb language sql immutable set search_path = '' as $$
  select jsonb_build_object(
    'new_requests_per_source_per_hour', 20,
    'pending_requests_per_minute', 6,
    'pending_expiry_s', 604800,
    'refused_retry_s', 3600,
    'portal_open_s', 900,
    'portal_closed_s', 300,
    'portal_button_hold_s', 5
  )
$$;

-- 2. Pedido de aprovação: um por código de lacre, sem tenant até a destinação.
create table public.seal_enrollments (
  id uuid primary key default gen_random_uuid(),
  device_code text not null,
  key_hash bytea not null,
  status text not null default 'pending',
  conflict_at timestamptz,
  conflict_key_hash bytea,
  conflict_calls integer not null default 0,
  forget_networks text,
  forget_networks_requested_at timestamptz,
  last_organization_id uuid references public.organizations(id) on delete restrict,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  calls integer not null default 0,
  signal_dbm smallint,
  wifi_ssid text,
  firmware_version text,
  source_hash bytea,
  organization_id uuid references public.organizations(id) on delete restrict,
  device_id uuid references public.seal_devices(id) on delete restrict,
  decided_by uuid references auth.users(id),
  decided_at timestamptz,
  decision_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint seal_enrollments_code_key unique (device_code),
  constraint seal_enrollments_code_check check (device_code ~ '^DSP-[0-9A-Z]{8}$'),
  constraint seal_enrollments_key_hash_check check (octet_length(key_hash) = 32),
  constraint seal_enrollments_status_check check (status in ('pending', 'approved', 'refused', 'expired', 'returned')),
  constraint seal_enrollments_conflict_check check ((conflict_at is null) = (conflict_key_hash is null)
    and (conflict_key_hash is null or octet_length(conflict_key_hash) = 32)),
  constraint seal_enrollments_conflict_calls_check check (conflict_calls >= 0),
  constraint seal_enrollments_forget_check check ((forget_networks is null or forget_networks in ('all', 'extras'))
    and (forget_networks is null) = (forget_networks_requested_at is null)),
  constraint seal_enrollments_calls_check check (calls >= 0),
  constraint seal_enrollments_signal_check check (signal_dbm is null or signal_dbm between -127 and 0),
  constraint seal_enrollments_ssid_check check (wifi_ssid is null or octet_length(wifi_ssid) between 1 and 32),
  constraint seal_enrollments_firmware_check check (firmware_version is null or char_length(firmware_version) <= 32),
  constraint seal_enrollments_source_check check (source_hash is null or octet_length(source_hash) = 32),
  constraint seal_enrollments_note_check check (decision_note is null or private.seal_text_ok(decision_note)),
  constraint seal_enrollments_destination_check check (
    (status = 'approved') = (organization_id is not null) and (status = 'approved') = (device_id is not null)),
  constraint seal_enrollments_decision_check check (status not in ('refused', 'returned') or decision_note is not null)
);
create index seal_enrollments_status_idx on public.seal_enrollments (status, last_seen_at desc);
create index seal_enrollments_org_idx on public.seal_enrollments (organization_id) where organization_id is not null;

-- 3. Uma linha de dispositivo por destinação (research.md, item 5): o código é único só entre as linhas ativas.
alter table public.seal_devices
  add column enrollment_id uuid references public.seal_enrollments(id) on delete restrict,
  add column approved_at timestamptz,
  add column approved_by uuid references auth.users(id),
  add column inactive_reason text,
  add constraint seal_devices_inactive_reason_check check (inactive_reason is null or inactive_reason in ('returned', 'withdrawn', 'manual')),
  add constraint seal_devices_inactive_reason_status_check check (inactive_reason is null or status = 'inactive');
alter table public.seal_devices drop constraint seal_devices_code_key;
create unique index seal_devices_code_active_key on public.seal_devices (device_code) where status = 'active';
create index seal_devices_code_idx on public.seal_devices (device_code);

-- A desativação da Spec 012 (deactivate_device) não informa o motivo: ela fica como 'manual'.
create function private.seal_default_inactive_reason() returns trigger language plpgsql set search_path = '' as $$
begin
  if new.status = 'inactive' and new.inactive_reason is null then new.inactive_reason := 'manual'; end if;
  return new;
end $$;
create trigger seal_devices_default_inactive_reason before update of status on public.seal_devices
  for each row when (new.status = 'inactive' and old.status = 'active') execute function private.seal_default_inactive_reason();

-- O histórico do dispositivo ganha os fatos da destinação e do esquecimento das redes.
alter table public.seal_device_events drop constraint seal_device_events_type_check;
alter table public.seal_device_events add constraint seal_device_events_type_check check (event_type in ('created', 'updated', 'deactivated',
  'key_rotated', 'activated', 'shutdown', 'network_changed', 'approved', 'withdrawn', 'returned', 'networks_forgotten'));

-- 4. Limites dos pedidos sem dispositivo (research.md, item 11). A private.seal_rate_windows da Spec 012 é indexada por device_id,
-- com chave estrangeira para seal_devices; aqui o balde é 'enroll:' + resumo do endereço ou 'pending:' + id do pedido.
create table private.seal_enroll_rate_windows (
  bucket text not null,
  window_start timestamptz not null,
  count integer not null default 0,
  primary key (bucket, window_start),
  constraint seal_enroll_rate_windows_bucket_check check (bucket ~ '^(enroll|pending):')
);

-- 5. Nenhuma exclusão (como as tabelas da Spec 012) e acesso só por RPC.
create trigger seal_enrollments_no_delete before delete on public.seal_enrollments for each statement execute function private.refuse_seal_delete();
create trigger seal_enrollments_no_truncate before truncate on public.seal_enrollments for each statement execute function private.refuse_seal_delete();

alter table public.seal_enrollments enable row level security;
alter table private.seal_enroll_rate_windows enable row level security;
revoke all on public.seal_enrollments from anon, authenticated;
revoke all on private.seal_enroll_rate_windows from anon, authenticated;
revoke all on function private.seal_enrollment_limits(), private.seal_default_inactive_reason() from public, anon, authenticated;
