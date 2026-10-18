-- Spec 012, Fundação: esquema do lacre IoT (data-model.md). Toda tabela tem organization_id, RLS sem política para authenticated
-- (leitura e escrita só por RPC security definer), chaves estrangeiras compostas por organização e nenhuma exclusão física (RF-041).
-- A ingestão (seal_ingest, US1) repassa cada mensagem a um tratador em `private`; aqui nascem as versões vazias de todos eles, para
-- cada história substituir só o seu (research.md, item 1).

-- 1. Extensões da plataforma: agendamento, HTTP de saída e cofre de segredos (research.md, itens 6, 8 e 10).
do $$
begin
  create extension if not exists pg_net;
exception when others then
  raise notice 'pg_net indisponível (%): o envio de notificação fica com o reenvio da verificação automática.', sqlerrm;
end $$;
do $$
begin
  create extension if not exists supabase_vault;
exception when others then
  raise notice 'supabase_vault indisponível (%): a troca de rede Wi-Fi não funciona sem o cofre.', sqlerrm;
end $$;
do $$
begin
  create extension if not exists pg_cron;
exception when others then
  raise notice 'pg_cron indisponível (%): agende private.run_seal_watchdog() pela plataforma.', sqlerrm;
end $$;

-- 2. Limites numa fonte única, repetidos em src/domain/seals/seal-limits.ts.
create function private.seal_limits() returns jsonb language sql immutable set search_path = '' as $$
  select jsonb_build_object(
    'repeat_distance_m', 20,
    'report_interval_default_s', 60,
    'report_interval_min_s', 30,
    'report_interval_max_s', 900,
    'no_comm_grace_s', 30,
    'no_gps_intervals', 3,
    'geofence_tolerance_m', 50,
    'geofence_outside_streak', 2,
    'delivery_seal_position_max_age_s', 120,
    'command_confirm_timeout_s', 600,
    'command_not_delivered_s', 1800,
    'batch_max', 50,
    'auto_lock_after_s', 180,
    'wifi_list_max', 5,
    'low_battery_pct', 15,
    'weak_signal_dbm', -85,
    'device_requests_per_minute', 6,
    'auth_failures_max', 10,
    'auth_failures_window_s', 600,
    'auth_block_s', 900,
    'read_at_future_tolerance_s', 300,
    'justification_min', 5,
    'justification_max', 500,
    'protocols', jsonb_build_array(1))
$$;

-- Justificativa e observação: 5 a 500 caracteres depois de juntar os espaços (o mesmo critério da Spec 008).
create function private.seal_text_ok(p_text text) returns boolean language sql immutable set search_path = '' as $$
  select char_length(btrim(regexp_replace(coalesce(p_text, ''), '\s+', ' ', 'g'))) between 5 and 500
$$;

-- As geocercas ganham a chave composta para a violação apontar para a geocerca da mesma organização.
alter table public.geofences add constraint geofences_id_org_key unique (id, organization_id);

-- 3. Dispositivo (e o lacre ativo, nas colunas seal_code e activated_at).
create table public.seal_devices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  device_code text not null,
  label text not null,
  key_hash bytea not null,
  key_rotated_at timestamptz not null default now(),
  status text not null default 'active',
  firmware_version text,
  report_interval_s integer not null default 60,
  seal_code text,
  activated_at timestamptz,
  last_seen_at timestamptz,
  last_read_at timestamptz,
  last_position_id uuid,
  health text not null default 'never_seen',
  health_changed_at timestamptz,
  no_gps_since timestamptz,
  battery_pct smallint,
  signal_dbm smallint,
  seal_state text not null default 'unknown',
  lock_state text not null default 'none',
  lock_changed_at timestamptz,
  wifi_in_use jsonb,
  wifi_saved jsonb not null default '[]',
  wifi_available jsonb not null default '[]',
  watch_version_ack integer not null default 0,
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id),
  updated_at timestamptz not null default now(),
  constraint seal_devices_id_org_key unique (id, organization_id),
  constraint seal_devices_code_key unique (device_code),
  constraint seal_devices_seal_code_key unique (seal_code),
  constraint seal_devices_code_check check (device_code ~ '^DSP-[0-9A-Z]{8}$'),
  constraint seal_devices_seal_code_check check (seal_code is null or seal_code ~ '^LCR-[0-9A-Z]{8}$'),
  constraint seal_devices_label_check check (char_length(btrim(label)) between 2 and 60),
  constraint seal_devices_key_hash_check check (octet_length(key_hash) = 32),
  constraint seal_devices_status_check check (status in ('active', 'inactive')),
  constraint seal_devices_firmware_check check (firmware_version is null or char_length(firmware_version) <= 40),
  constraint seal_devices_interval_check check (report_interval_s between 30 and 900),
  constraint seal_devices_health_check check (health in ('ok', 'no_gps', 'low_battery', 'no_comm', 'off', 'never_seen')),
  constraint seal_devices_battery_check check (battery_pct is null or battery_pct between 0 and 100),
  constraint seal_devices_seal_state_check check (seal_state in ('closed', 'open', 'broken', 'unknown')),
  constraint seal_devices_lock_state_check check (lock_state in ('none', 'locked', 'unlocked', 'unconfirmed', 'locked_violation', 'locked_comm_loss')),
  constraint seal_devices_wifi_saved_check check (jsonb_typeof(wifi_saved) = 'array'),
  constraint seal_devices_wifi_available_check check (jsonb_typeof(wifi_available) = 'array')
);
create index seal_devices_org_health_idx on public.seal_devices (organization_id, health);
create index seal_devices_last_seen_idx on public.seal_devices (status, last_seen_at);

-- 4. Histórico imutável do dispositivo; é aqui que fica a justificativa das ações sensíveis (nunca na auditoria, RF-039).
create table public.seal_device_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  device_id uuid not null,
  event_type text not null,
  justification text,
  at timestamptz not null default now(),
  by_user uuid references auth.users(id),
  detail jsonb not null default '{}',
  constraint seal_device_events_device_fk foreign key (device_id, organization_id) references public.seal_devices (id, organization_id),
  constraint seal_device_events_type_check check (event_type in ('created', 'updated', 'deactivated', 'key_rotated', 'activated', 'shutdown', 'network_changed')),
  constraint seal_device_events_justification_check check (
    (justification is null or private.seal_text_ok(justification))
    and (event_type not in ('deactivated', 'key_rotated') or justification is not null))
);
create index seal_device_events_device_idx on public.seal_device_events (device_id, at desc);

-- 5. Vínculo lacre–cilindro: um para um por vez (RF-033).
create table public.seal_bindings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  device_id uuid not null,
  cylinder_id uuid not null,
  bound_at timestamptz not null default now(),
  bound_by uuid not null references auth.users(id),
  unbound_at timestamptz,
  unbound_by uuid references auth.users(id),
  unbind_reason text,
  unbind_justification text,
  constraint seal_bindings_id_org_key unique (id, organization_id),
  constraint seal_bindings_device_fk foreign key (device_id, organization_id) references public.seal_devices (id, organization_id),
  constraint seal_bindings_cylinder_fk foreign key (cylinder_id, organization_id) references public.cylinders (id, organization_id),
  constraint seal_bindings_reason_check check (unbind_reason is null or unbind_reason in ('manual', 'device_inactivated', 'cylinder_inactivated', 'replaced')),
  constraint seal_bindings_unbound_check check (
    (unbound_at is null and unbind_reason is null and unbound_by is null and unbind_justification is null)
    or (unbound_at is not null and unbind_reason is not null)),
  constraint seal_bindings_justification_check check (
    (unbind_justification is null or private.seal_text_ok(unbind_justification))
    and (unbind_reason is distinct from 'manual' or unbind_justification is not null))
);
create unique index seal_bindings_device_open_key on public.seal_bindings (device_id) where unbound_at is null;
create unique index seal_bindings_cylinder_open_key on public.seal_bindings (cylinder_id) where unbound_at is null;
create index seal_bindings_device_time_idx on public.seal_bindings (device_id, bound_at);

-- 6. Mensagens recebidas (deduplicação, RF-003) e posições (RF-008 a RF-010).
create table public.seal_messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  device_id uuid not null,
  message_id text not null,
  type text not null,
  read_at timestamptz not null,
  received_at timestamptz not null default now(),
  outcome text not null,
  refusal_code text,
  summary jsonb not null default '{}',
  constraint seal_messages_device_fk foreign key (device_id, organization_id) references public.seal_devices (id, organization_id),
  constraint seal_messages_device_message_key unique (device_id, message_id),
  constraint seal_messages_message_id_check check (char_length(message_id) between 1 and 64),
  constraint seal_messages_type_check check (type in ('position', 'event', 'alert', 'command_result', 'activation', 'shutdown', 'network_change', 'auto_lock')),
  constraint seal_messages_outcome_check check (outcome in ('stored', 'refused')),
  constraint seal_messages_refusal_check check ((outcome = 'refused') = (refusal_code is not null))
);

create table public.seal_positions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  device_id uuid not null,
  cylinder_id uuid,
  -- Adiável: o tratador grava a posição antes de a mensagem ser registrada, com o resultado do próprio tratador.
  message_id uuid references public.seal_messages(id) deferrable initially deferred,
  point extensions.geography(Point, 4326) not null,
  accuracy_m numeric(8,1),
  quality text not null,
  seal_state text not null default 'unknown',
  battery_pct smallint,
  signal_dbm smallint,
  read_at timestamptz not null,
  received_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  repeat_count integer not null default 1,
  constraint seal_positions_id_org_key unique (id, organization_id),
  constraint seal_positions_device_fk foreign key (device_id, organization_id) references public.seal_devices (id, organization_id),
  constraint seal_positions_cylinder_fk foreign key (cylinder_id, organization_id) references public.cylinders (id, organization_id),
  constraint seal_positions_quality_check check (quality in ('gps', 'last_known')),
  constraint seal_positions_seal_state_check check (seal_state in ('closed', 'open', 'broken', 'unknown')),
  constraint seal_positions_accuracy_check check (accuracy_m is null or accuracy_m between 0 and 100000),
  constraint seal_positions_battery_check check (battery_pct is null or battery_pct between 0 and 100),
  constraint seal_positions_repeat_check check (repeat_count >= 1)
);
create index seal_positions_device_read_idx on public.seal_positions (device_id, read_at desc);
create index seal_positions_cylinder_read_idx on public.seal_positions (cylinder_id, read_at desc) where cylinder_id is not null;
create index seal_positions_point_idx on public.seal_positions using gist (point);
alter table public.seal_devices add constraint seal_devices_last_position_fk
  foreign key (last_position_id, organization_id) references public.seal_positions (id, organization_id);

-- 7. Vigilância e violação de geocerca (RN-004, RF-018 a RF-022a).
create table public.seal_watches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  cylinder_id uuid not null,
  device_id uuid not null,
  site_id uuid not null,
  trip_item_id uuid,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  end_reason text,
  suspended_at timestamptz,
  version integer not null default 1,
  outside_streak smallint not null default 0,
  constraint seal_watches_id_org_key unique (id, organization_id),
  constraint seal_watches_cylinder_fk foreign key (cylinder_id, organization_id) references public.cylinders (id, organization_id),
  constraint seal_watches_device_fk foreign key (device_id, organization_id) references public.seal_devices (id, organization_id),
  constraint seal_watches_site_fk foreign key (site_id, organization_id) references public.customer_sites (id, organization_id),
  constraint seal_watches_item_fk foreign key (trip_item_id, organization_id) references public.trip_items (id, organization_id),
  constraint seal_watches_end_reason_check check (end_reason is null or end_reason in ('new_trip', 'stock_in', 'unbound', 'cylinder_inactivated')),
  constraint seal_watches_end_check check ((ended_at is null) = (end_reason is null)),
  constraint seal_watches_streak_check check (outside_streak >= 0)
);
create unique index seal_watches_cylinder_open_key on public.seal_watches (cylinder_id) where ended_at is null;
create index seal_watches_device_open_idx on public.seal_watches (device_id) where ended_at is null;

create table public.seal_violations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  watch_id uuid not null,
  cylinder_id uuid not null,
  device_id uuid not null,
  geofence_id uuid,
  first_outside_at timestamptz not null,
  first_position_id uuid,
  last_position_id uuid,
  distance_m numeric(10,1),
  status text not null default 'open',
  returned_at timestamptz,
  closed_at timestamptz,
  command_id uuid,
  constraint seal_violations_id_org_key unique (id, organization_id),
  constraint seal_violations_watch_fk foreign key (watch_id, organization_id) references public.seal_watches (id, organization_id),
  constraint seal_violations_cylinder_fk foreign key (cylinder_id, organization_id) references public.cylinders (id, organization_id),
  constraint seal_violations_device_fk foreign key (device_id, organization_id) references public.seal_devices (id, organization_id),
  constraint seal_violations_geofence_fk foreign key (geofence_id, organization_id) references public.geofences (id, organization_id),
  constraint seal_violations_first_position_fk foreign key (first_position_id, organization_id) references public.seal_positions (id, organization_id),
  constraint seal_violations_last_position_fk foreign key (last_position_id, organization_id) references public.seal_positions (id, organization_id),
  constraint seal_violations_status_check check (status in ('open', 'returned', 'closed'))
);
create unique index seal_violations_watch_open_key on public.seal_violations (watch_id) where status = 'open';

-- 8. Comandos do lacre: trava e rede (RF-026 a RF-029, RF-034a a RF-034f).
create table public.seal_commands (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  device_id uuid not null,
  cylinder_id uuid,
  kind text not null,
  origin text not null,
  status text not null default 'pending',
  trip_id uuid,
  trip_item_id uuid,
  violation_id uuid,
  requested_by uuid references auth.users(id),
  justification text,
  aal text,
  wifi_ssid text,
  wifi_open boolean,
  wifi_secret_id uuid,
  proof jsonb,
  created_at timestamptz not null default now(),
  delivered_at timestamptz,
  finished_at timestamptz,
  device_response jsonb,
  cancel_reason text,
  not_delivered_alert_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint seal_commands_id_org_key unique (id, organization_id),
  constraint seal_commands_device_fk foreign key (device_id, organization_id) references public.seal_devices (id, organization_id),
  constraint seal_commands_cylinder_fk foreign key (cylinder_id, organization_id) references public.cylinders (id, organization_id),
  constraint seal_commands_trip_fk foreign key (trip_id, organization_id) references public.trips (id, organization_id),
  constraint seal_commands_item_fk foreign key (trip_item_id, organization_id) references public.trip_items (id, organization_id),
  constraint seal_commands_violation_fk foreign key (violation_id, organization_id) references public.seal_violations (id, organization_id),
  constraint seal_commands_kind_check check (kind in ('lock', 'unlock', 'wifi_add', 'wifi_remove', 'wifi_reset')),
  constraint seal_commands_origin_check check (origin in (
    'trip_start', 'delivery', 'delivery_correction', 'trip_cancel', 'geofence_violation', 'manual', 'exceptional', 'admin_network')),
  constraint seal_commands_status_check check (status in ('pending', 'delivered', 'confirmed', 'failed', 'cancelled', 'expired')),
  constraint seal_commands_kind_origin_check check ((kind like 'wifi\_%') = (origin = 'admin_network')),
  constraint seal_commands_justification_check check (
    (justification is null or private.seal_text_ok(justification))
    and (origin not in ('manual', 'exceptional') or justification is not null)
    and (kind <> 'wifi_reset' or justification is not null)),
  constraint seal_commands_person_check check (origin not in ('manual', 'exceptional', 'admin_network') or requested_by is not null),
  constraint seal_commands_aal_check check ((aal is null or aal in ('aal1', 'aal2')) and (origin <> 'exceptional' or aal = 'aal2')),
  constraint seal_commands_wifi_check check (
    kind like 'wifi\_%' or (wifi_ssid is null and wifi_open is null and wifi_secret_id is null)),
  constraint seal_commands_ssid_check check (wifi_ssid is null or octet_length(wifi_ssid) between 1 and 32),
  constraint seal_commands_wifi_add_check check (kind <> 'wifi_add' or (wifi_ssid is not null and wifi_open is not null)),
  constraint seal_commands_wifi_remove_check check (kind <> 'wifi_remove' or wifi_ssid is not null),
  constraint seal_commands_finished_check check ((status in ('confirmed', 'failed', 'cancelled', 'expired')) = (finished_at is not null)),
  constraint seal_commands_delivered_check check (status not in ('delivered', 'confirmed', 'failed') or delivered_at is not null)
);
-- Uma trava de início e um destravamento de cancelamento por item de viagem (RF-023). A entrega usa o próprio registro de entrega,
-- que já é idempotente (Spec 008), e pode destravar de novo depois de uma correção.
create unique index seal_commands_trip_item_origin_key on public.seal_commands (trip_item_id, origin)
  where origin in ('trip_start', 'trip_cancel');
create index seal_commands_device_status_idx on public.seal_commands (device_id, status, created_at);
create index seal_commands_open_idx on public.seal_commands (status, created_at) where status in ('pending', 'delivered');
alter table public.seal_violations add constraint seal_violations_command_fk
  foreign key (command_id, organization_id) references public.seal_commands (id, organization_id);

create table public.seal_command_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  command_id uuid not null,
  from_status text,
  to_status text not null,
  at timestamptz not null default now(),
  by_kind text not null,
  by_user uuid references auth.users(id),
  detail jsonb not null default '{}',
  constraint seal_command_events_command_fk foreign key (command_id, organization_id) references public.seal_commands (id, organization_id),
  constraint seal_command_events_by_check check (by_kind in ('person', 'device', 'system')),
  constraint seal_command_events_person_check check (by_kind <> 'person' or by_user is not null)
);
create index seal_command_events_command_idx on public.seal_command_events (command_id, at);

-- 9. Alertas (RF-016, RF-035, RF-036).
create table public.seal_alerts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  device_id uuid not null,
  cylinder_id uuid,
  kind text not null,
  severity text not null,
  source text not null,
  status text not null default 'open',
  context jsonb not null default '{}',
  opened_at timestamptz not null default now(),
  recovered_at timestamptz,
  acknowledged_at timestamptz,
  acknowledged_by uuid references auth.users(id),
  closed_at timestamptz,
  closed_by uuid references auth.users(id),
  close_note text,
  requires_push boolean not null default false,
  updated_at timestamptz not null default now(),
  constraint seal_alerts_id_org_key unique (id, organization_id),
  constraint seal_alerts_device_fk foreign key (device_id, organization_id) references public.seal_devices (id, organization_id),
  constraint seal_alerts_cylinder_fk foreign key (cylinder_id, organization_id) references public.cylinders (id, organization_id),
  constraint seal_alerts_kind_check check (kind in (
    'possible_loss', 'no_comm', 'device_off', 'no_gps', 'low_battery', 'weak_signal', 'seal_open', 'seal_broken', 'geofence_violation',
    'comm_loss_lock', 'command_failed', 'command_expired', 'command_not_delivered', 'watch_suspended', 'rate_limited', 'wifi_change_failed')),
  constraint seal_alerts_severity_check check (severity in ('medium', 'high', 'critical')),
  constraint seal_alerts_source_check check (source in ('device', 'system')),
  constraint seal_alerts_status_check check (status in ('open', 'acknowledged', 'closed')),
  constraint seal_alerts_close_check check (
    (status <> 'closed' and closed_at is null and close_note is null)
    or (status = 'closed' and closed_at is not null and closed_by is not null and private.seal_text_ok(close_note)))
);
create unique index seal_alerts_open_key on public.seal_alerts (device_id, kind) where status <> 'closed';
create index seal_alerts_org_status_idx on public.seal_alerts (organization_id, status, opened_at desc);

-- 10. Notificações push do PWA (RF-036a a RF-036d).
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  user_id uuid not null references auth.users(id),
  endpoint text not null,
  p256dh text not null,
  auth_secret text not null,
  user_agent_label text,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoke_reason text,
  constraint push_subscriptions_id_org_key unique (id, organization_id),
  constraint push_subscriptions_endpoint_key unique (endpoint),
  constraint push_subscriptions_endpoint_check check (char_length(endpoint) between 10 and 1000),
  constraint push_subscriptions_keys_check check (char_length(p256dh) between 1 and 200 and char_length(auth_secret) between 1 and 100),
  constraint push_subscriptions_label_check check (user_agent_label is null or char_length(user_agent_label) <= 80),
  constraint push_subscriptions_reason_check check (revoke_reason is null or revoke_reason in ('user', 'permission_lost', 'gone')),
  constraint push_subscriptions_revoked_check check ((revoked_at is null) = (revoke_reason is null))
);
create index push_subscriptions_org_active_idx on public.push_subscriptions (organization_id) where revoked_at is null;

create table public.push_outbox (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  alert_id uuid not null,
  subscription_id uuid not null,
  kind text not null,
  status text not null default 'pending',
  attempts integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  constraint push_outbox_alert_fk foreign key (alert_id, organization_id) references public.seal_alerts (id, organization_id),
  constraint push_outbox_subscription_fk foreign key (subscription_id, organization_id) references public.push_subscriptions (id, organization_id),
  constraint push_outbox_once_key unique (alert_id, subscription_id, kind),
  constraint push_outbox_kind_check check (kind in ('opened', 'recovered')),
  constraint push_outbox_status_check check (status in ('pending', 'sent', 'failed', 'skipped')),
  constraint push_outbox_error_check check (last_error is null or char_length(last_error) <= 200)
);
create index push_outbox_pending_idx on public.push_outbox (created_at) where status = 'pending';

-- 11. Tabelas privadas: limites de envio, falhas de chave e idempotência dos comandos da tela.
create table private.seal_rate_windows (
  device_id uuid not null references public.seal_devices(id),
  window_start timestamptz not null,
  count integer not null default 0,
  primary key (device_id, window_start)
);
create table private.seal_auth_failures (
  source_hash bytea primary key,
  window_start timestamptz not null,
  count integer not null default 0,
  blocked_until timestamptz
);
create table private.seal_requests (
  organization_id uuid not null references public.organizations(id) on delete restrict,
  request_id uuid not null,
  operation text not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key (organization_id, request_id)
);

-- 12. A carga da viagem (Spec 008) ganha a referência à trava física, separada do bloqueio lógico (RF-030).
alter table public.trip_items add column seal_command_id uuid;
alter table public.trip_items add constraint trip_items_seal_command_fk
  foreign key (seal_command_id, organization_id) references public.seal_commands (id, organization_id);

-- 13. Nenhuma exclusão (RF-041) e históricos imutáveis. Os gatilhos são por comando: recusam mesmo sem linhas e para qualquer papel.
create function private.refuse_seal_delete() returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception using errcode = 'P0001', message = 'seal_record_undeletable';
end $$;
create function private.refuse_seal_mutation() returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception using errcode = 'P0001', message = 'seal_record_immutable';
end $$;

do $$
declare
  t text;
begin
  foreach t in array array['seal_devices', 'seal_device_events', 'seal_bindings', 'seal_messages', 'seal_positions', 'seal_commands',
    'seal_command_events', 'seal_watches', 'seal_violations', 'seal_alerts', 'push_subscriptions', 'push_outbox'] loop
    execute format('create trigger %I before delete on public.%I for each statement execute function private.refuse_seal_delete()', t || '_no_delete', t);
    execute format('create trigger %I before truncate on public.%I for each statement execute function private.refuse_seal_delete()', t || '_no_truncate', t);
  end loop;
  foreach t in array array['seal_device_events', 'seal_command_events', 'seal_messages'] loop
    execute format('create trigger %I before update on public.%I for each statement execute function private.refuse_seal_mutation()', t || '_immutable', t);
  end loop;
end $$;

-- 14. RLS ligada, nenhuma política e nenhum privilégio: o acesso é só por RPC (service_role).
alter table public.seal_devices enable row level security;
alter table public.seal_device_events enable row level security;
alter table public.seal_bindings enable row level security;
alter table public.seal_messages enable row level security;
alter table public.seal_positions enable row level security;
alter table public.seal_commands enable row level security;
alter table public.seal_command_events enable row level security;
alter table public.seal_watches enable row level security;
alter table public.seal_violations enable row level security;
alter table public.seal_alerts enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.push_outbox enable row level security;
alter table private.seal_rate_windows enable row level security;
alter table private.seal_auth_failures enable row level security;
alter table private.seal_requests enable row level security;
revoke all on public.seal_devices, public.seal_device_events, public.seal_bindings, public.seal_messages, public.seal_positions,
  public.seal_commands, public.seal_command_events, public.seal_watches, public.seal_violations, public.seal_alerts,
  public.push_subscriptions, public.push_outbox from anon, authenticated;
revoke all on private.seal_rate_windows, private.seal_auth_failures, private.seal_requests from anon, authenticated;

-- 15. Tratadores de mensagem do lacre (research.md, item 1). `seal_ingest` (US1) grava a mensagem e chama o tratador do tipo dela;
-- o tratador devolve nulo (aceita) ou um código de recusa do item. `p_stale` é verdadeiro para leitura mais antiga que a última
-- avaliada (item 5): ela entra no histórico, mas não decide saúde nem geocerca. Cada história substitui só os seus tratadores.
create function private.seal_handle_position(p_device uuid, p_message jsonb, p_message_row uuid, p_stale boolean)
returns text language plpgsql security definer set search_path = '' as $$ begin return null; end $$;
create function private.seal_handle_event(p_device uuid, p_message jsonb, p_message_row uuid, p_stale boolean)
returns text language plpgsql security definer set search_path = '' as $$ begin return null; end $$;
create function private.seal_handle_alert(p_device uuid, p_message jsonb, p_message_row uuid, p_stale boolean)
returns text language plpgsql security definer set search_path = '' as $$ begin return null; end $$;
create function private.seal_handle_command_result(p_device uuid, p_message jsonb, p_message_row uuid, p_stale boolean)
returns text language plpgsql security definer set search_path = '' as $$ begin return 'unknown_command'; end $$;
create function private.seal_handle_activation(p_device uuid, p_message jsonb, p_message_row uuid, p_stale boolean)
returns text language plpgsql security definer set search_path = '' as $$ begin return null; end $$;
create function private.seal_handle_shutdown(p_device uuid, p_message jsonb, p_message_row uuid, p_stale boolean)
returns text language plpgsql security definer set search_path = '' as $$ begin return null; end $$;
create function private.seal_handle_network_change(p_device uuid, p_message jsonb, p_message_row uuid, p_stale boolean)
returns text language plpgsql security definer set search_path = '' as $$ begin return null; end $$;
create function private.seal_handle_auto_lock(p_device uuid, p_message jsonb, p_message_row uuid, p_stale boolean)
returns text language plpgsql security definer set search_path = '' as $$ begin return null; end $$;

-- Depois de todas as mensagens de um envio: a resposta ao lacre (comando pendente e vigilância). Vazia até a US2 e a US4.
create function private.seal_after_batch(p_device uuid) returns void
language plpgsql security definer set search_path = '' as $$ begin return; end $$;
create function private.seal_build_response(p_device uuid, p_watch_version integer) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  return jsonb_build_object('command', null, 'watch', jsonb_build_object('active', false, 'version', 0));
end $$;

-- Aviso em tempo real sem dado (research.md, item 7). Sem efeito até a US1 ligar o Realtime.
create function private.seal_broadcast(p_organization uuid, p_kind text, p_device uuid, p_cylinder uuid) returns void
language plpgsql security definer set search_path = '' as $$ begin return; end $$;

revoke all on function private.seal_limits(), private.seal_text_ok(text), private.refuse_seal_delete(), private.refuse_seal_mutation(),
  private.seal_handle_position(uuid, jsonb, uuid, boolean), private.seal_handle_event(uuid, jsonb, uuid, boolean),
  private.seal_handle_alert(uuid, jsonb, uuid, boolean), private.seal_handle_command_result(uuid, jsonb, uuid, boolean),
  private.seal_handle_activation(uuid, jsonb, uuid, boolean), private.seal_handle_shutdown(uuid, jsonb, uuid, boolean),
  private.seal_handle_network_change(uuid, jsonb, uuid, boolean), private.seal_handle_auto_lock(uuid, jsonb, uuid, boolean),
  private.seal_after_batch(uuid), private.seal_build_response(uuid, integer), private.seal_broadcast(uuid, text, uuid, uuid)
  from public, anon, authenticated;
