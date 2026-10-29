-- Spec 015 (T043, parte: posições móveis; RF-007d, RF-013): evidência de localização do celular, presa à sessão, à viagem, ao motorista e
-- à instalação de origem. `observed_at` é o instante do sensor; `received_at` é do servidor e nunca o substitui. Append-only.

create table public.mobile_positions (
  id uuid primary key default gen_random_uuid(),
  client_position_id uuid not null,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  tracking_session_id uuid not null,
  trip_id uuid not null,
  driver_user_id uuid not null references auth.users(id),
  device_installation_id uuid not null,
  sequence_no bigint not null,
  point extensions.geography(Point, 4326) not null,
  accuracy_m numeric(8,1),
  observed_at timestamptz not null,
  received_at timestamptz not null default now(),
  sync_kind text not null,
  validity text not null default 'pending',
  invalid_reason text,
  created_at timestamptz not null default now(),
  constraint mobile_positions_id_org_key unique (id, organization_id),
  constraint mobile_positions_client_key unique (organization_id, client_position_id),
  constraint mobile_positions_sequence_key unique (tracking_session_id, sequence_no),
  constraint mobile_positions_session_fk foreign key (tracking_session_id, organization_id) references public.tracking_sessions (id, organization_id),
  constraint mobile_positions_session_trip_fk foreign key (tracking_session_id, trip_id) references public.tracking_sessions (id, trip_id),
  constraint mobile_positions_trip_fk foreign key (trip_id, organization_id) references public.trips (id, organization_id),
  constraint mobile_positions_sequence_check check (sequence_no >= 0),
  constraint mobile_positions_accuracy_check check (accuracy_m is null or accuracy_m between 0 and 100000),
  constraint mobile_positions_sync_check check (sync_kind in ('live', 'retrospective')),
  constraint mobile_positions_validity_check check (validity in ('pending', 'valid', 'stale', 'imprecise', 'future', 'context_invalid')),
  constraint mobile_positions_reason_check check (invalid_reason is null or char_length(invalid_reason) <= 60)
);
create index mobile_positions_trip_time_idx on public.mobile_positions (organization_id, trip_id, observed_at desc, id desc);
create index mobile_positions_session_time_idx on public.mobile_positions (tracking_session_id, observed_at, id);
create index mobile_positions_point_idx on public.mobile_positions using gist (point);

create trigger mobile_positions_no_delete before delete on public.mobile_positions for each statement execute function private.refuse_tracking_delete();
create trigger mobile_positions_no_truncate before truncate on public.mobile_positions for each statement execute function private.refuse_tracking_delete();
create trigger mobile_positions_immutable before update on public.mobile_positions for each statement execute function private.refuse_tracking_mutation();

alter table public.mobile_positions enable row level security;
revoke all on public.mobile_positions from anon, authenticated;
