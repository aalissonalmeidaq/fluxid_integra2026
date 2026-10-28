-- Spec 015 (T042; RF-007a a RF-007g): sessão de coleta do celular do motorista numa viagem. É o limite que impede posições de outra
-- viagem, motorista ou instalação de formarem pares. A capacidade (completa, só com a tela visível, negada, indisponível) e o instante
-- em que mudou alimentam o estado degradado mostrado ao motorista e ao gestor.

create function private.refuse_tracking_delete() returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception using errcode = 'P0001', message = 'tracking_record_undeletable';
end $$;
create function private.refuse_tracking_mutation() returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception using errcode = 'P0001', message = 'tracking_record_immutable';
end $$;

create table public.tracking_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  trip_id uuid not null,
  driver_user_id uuid not null references auth.users(id),
  device_installation_id uuid not null,
  status text not null default 'active',
  platform text not null,
  capability text not null,
  capability_changed_at timestamptz not null default now(),
  notifications_denied boolean not null default false,
  started_at timestamptz not null default now(),
  last_online_confirmed_at timestamptz not null default now(),
  ended_at timestamptz,
  end_reason text,
  request_id uuid not null,
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tracking_sessions_id_org_key unique (id, organization_id),
  constraint tracking_sessions_id_trip_key unique (id, trip_id),
  constraint tracking_sessions_request_key unique (organization_id, request_id),
  constraint tracking_sessions_trip_fk foreign key (trip_id, organization_id) references public.trips (id, organization_id),
  constraint tracking_sessions_status_check check (status in ('active', 'completed', 'cancelled', 'paused_auth_expired')),
  constraint tracking_sessions_platform_check check (platform in ('android_native', 'web_visible')),
  constraint tracking_sessions_capability_check check (capability in ('full', 'foreground_only', 'denied', 'unavailable')),
  constraint tracking_sessions_end_check check (
    (status in ('completed', 'cancelled') and ended_at is not null and end_reason = status)
    or (status in ('active', 'paused_auth_expired') and ended_at is null and end_reason is null))
);
create unique index tracking_sessions_active_key on public.tracking_sessions (trip_id, device_installation_id) where status = 'active';
create index tracking_sessions_org_trip_idx on public.tracking_sessions (organization_id, trip_id, started_at desc);

create trigger tracking_sessions_no_delete before delete on public.tracking_sessions for each statement execute function private.refuse_tracking_delete();
create trigger tracking_sessions_no_truncate before truncate on public.tracking_sessions for each statement execute function private.refuse_tracking_delete();

alter table public.tracking_sessions enable row level security;
revoke all on public.tracking_sessions from anon, authenticated;
