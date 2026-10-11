-- Spec 008: viagens, paradas, carga e entrega. Esquema da Fundação (data-model.md; research.md, decisões 2 a 4).
-- Toda tabela tem organization_id e chaves estrangeiras compostas por organização. RLS ligada SEM política para
-- authenticated e sem privilégio: toda leitura e escrita passam por RPC security definer (como na Spec 007). Nada é excluído
-- (RF-033); eventos, entregas e desbloqueios são imutáveis para qualquer papel.

-- 1. Limites de uma viagem, repetidos no TypeScript (src/domain/trips/trip-limits.ts); tests/contract/trips-limits.test.ts reprova divergência.
create function private.trip_limits() returns jsonb language sql immutable set search_path = '' as $$
  select jsonb_build_object('max_stops', 30, 'max_cylinders_per_stop', 200, 'max_notes', 500)
$$;

-- 2. Veículo ganha a chave composta usada pelas viagens.
alter table public.vehicles add constraint vehicles_id_org_key unique (id, organization_id);

-- 3. Viagens.
create table public.trips (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  number integer not null,
  planned_date date not null,
  vehicle_id uuid not null,
  driver_id uuid not null,
  status text not null default 'planned',
  notes text,
  cancel_reason text,
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id),
  started_at timestamptz,
  started_by uuid references auth.users(id),
  completed_at timestamptz,
  completed_by uuid references auth.users(id),
  cancelled_at timestamptz,
  cancelled_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  constraint trips_id_org_key unique (id, organization_id),
  constraint trips_number_key unique (organization_id, number),
  constraint trips_vehicle_fk foreign key (vehicle_id, organization_id) references public.vehicles (id, organization_id),
  constraint trips_driver_fk foreign key (driver_id, organization_id) references public.drivers (id, organization_id),
  constraint trips_number_check check (number >= 1),
  constraint trips_status_check check (status in ('planned', 'loading', 'in_progress', 'completed', 'cancelled')),
  constraint trips_notes_check check (notes is null or char_length(notes) <= 500),
  constraint trips_cancel_reason_check check (
    (status = 'cancelled' and cancel_reason is not null and char_length(btrim(cancel_reason)) between 1 and 500)
    or (status <> 'cancelled' and cancel_reason is null)),
  constraint trips_status_columns_check check (
    case status
      when 'planned' then started_at is null and completed_at is null and cancelled_at is null
      when 'loading' then started_at is null and completed_at is null and cancelled_at is null
      when 'in_progress' then started_at is not null and started_by is not null and completed_at is null and cancelled_at is null
      when 'completed' then started_at is not null and completed_at is not null and completed_by is not null and cancelled_at is null
      else cancelled_at is not null and cancelled_by is not null and completed_at is null
    end)
);
create unique index trips_vehicle_open_idx on public.trips (vehicle_id) where status in ('loading', 'in_progress');
create unique index trips_driver_open_idx on public.trips (driver_id) where status in ('loading', 'in_progress');
create index trips_list_idx on public.trips (organization_id, status, planned_date desc);
create index trips_number_idx on public.trips (organization_id, number desc);
create index trips_vehicle_idx on public.trips (organization_id, vehicle_id);
create index trips_driver_idx on public.trips (organization_id, driver_id);

-- 4. Paradas. `removed` é a parada tirada do planejamento numa edição (nada é excluído); ela perde a posição.
create table public.trip_stops (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  trip_id uuid not null,
  site_id uuid not null,
  position smallint,
  status text not null default 'pending',
  arrived_at timestamptz,
  arrived_by uuid references auth.users(id),
  out_of_order boolean not null default false,
  closed_at timestamptz,
  closed_by uuid references auth.users(id),
  constraint trip_stops_id_org_key unique (id, organization_id),
  constraint trip_stops_id_trip_key unique (id, trip_id),
  constraint trip_stops_trip_fk foreign key (trip_id, organization_id) references public.trips (id, organization_id),
  constraint trip_stops_site_fk foreign key (site_id, organization_id) references public.customer_sites (id, organization_id),
  constraint trip_stops_position_key unique (trip_id, position) deferrable initially deferred,
  constraint trip_stops_status_check check (status in ('pending', 'on_site', 'delivered', 'with_divergence', 'removed')),
  constraint trip_stops_position_check check (
    (status = 'removed' and position is null) or (status <> 'removed' and position between 1 and 30)),
  constraint trip_stops_columns_check check (
    case status
      when 'pending' then arrived_at is null and closed_at is null
      when 'on_site' then arrived_at is not null and closed_at is null
      when 'removed' then arrived_at is null and closed_at is null
      else arrived_at is not null and closed_at is not null
    end)
);
create index trip_stops_trip_idx on public.trip_stops (trip_id, position);
create index trip_stops_site_idx on public.trip_stops (organization_id, site_id);

-- 5. Itens de carga: um cilindro previsto numa parada. `is_open` é o que reserva o cilindro (índice único parcial).
create table public.trip_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  trip_id uuid not null,
  stop_id uuid not null,
  cylinder_id uuid not null,
  item_status text not null default 'planned',
  is_open boolean generated always as (item_status in ('planned', 'checked', 'in_transit', 'not_delivered')) stored,
  lock_status text not null default 'none',
  checked_at timestamptz,
  checked_by uuid references auth.users(id),
  check_source text,
  divergence_reason text,
  created_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id),
  updated_at timestamptz not null default now(),
  constraint trip_items_id_org_key unique (id, organization_id),
  constraint trip_items_trip_fk foreign key (trip_id, organization_id) references public.trips (id, organization_id),
  constraint trip_items_stop_fk foreign key (stop_id, organization_id) references public.trip_stops (id, organization_id),
  constraint trip_items_stop_trip_fk foreign key (stop_id, trip_id) references public.trip_stops (id, trip_id),
  constraint trip_items_cylinder_fk foreign key (cylinder_id, organization_id) references public.cylinders (id, organization_id),
  constraint trip_items_trip_cylinder_key unique (trip_id, cylinder_id),
  constraint trip_items_status_check check (item_status in ('planned', 'checked', 'in_transit', 'delivered', 'not_delivered', 'removed', 'released', 'returned')),
  constraint trip_items_lock_check check (lock_status in ('none', 'locked', 'unlocked')),
  constraint trip_items_lock_status_check check (
    lock_status = 'none' or item_status in ('in_transit', 'not_delivered', 'delivered', 'returned')),
  constraint trip_items_checked_check check (
    (item_status = 'planned' and checked_at is null) or item_status in ('removed', 'released') or checked_at is not null),
  constraint trip_items_source_check check (check_source is null or check_source = 'manual'),
  constraint trip_items_reason_check check (
    (divergence_reason is null or char_length(btrim(divergence_reason)) between 1 and 500)
    and (item_status not in ('not_delivered', 'removed') or divergence_reason is not null))
);
create unique index trip_items_open_cylinder_idx on public.trip_items (cylinder_id) where is_open;
create index trip_items_trip_stop_idx on public.trip_items (trip_id, stop_id);
create index trip_items_cylinder_idx on public.trip_items (cylinder_id, created_at desc);

-- 6. Entregas: um registro por parada; a correção é um novo registro que aponta o anterior. O nome do recebedor é dado pessoal.
create table public.trip_deliveries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  stop_id uuid not null,
  request_id uuid not null,
  delivered_at timestamptz not null,
  recipient_name text not null,
  recipient_role text,
  latitude numeric(9,6),
  longitude numeric(9,6),
  at_site_address boolean not null default false,
  outside_geofence boolean,
  results jsonb not null,
  supersedes_id uuid references public.trip_deliveries(id),
  recorded_by uuid not null references auth.users(id),
  recorded_at timestamptz not null default now(),
  constraint trip_deliveries_stop_fk foreign key (stop_id, organization_id) references public.trip_stops (id, organization_id),
  constraint trip_deliveries_recipient_check check (char_length(btrim(recipient_name)) between 2 and 120),
  constraint trip_deliveries_role_check check (recipient_role is null or char_length(recipient_role) <= 80),
  constraint trip_deliveries_position_check check (
    (latitude is null and longitude is null)
    or (latitude is not null and longitude is not null and latitude between -90 and 90 and longitude between -180 and 180)),
  constraint trip_deliveries_results_check check (jsonb_typeof(results) = 'array')
);
create unique index trip_deliveries_original_idx on public.trip_deliveries (stop_id) where supersedes_id is null;
create unique index trip_deliveries_superseded_idx on public.trip_deliveries (supersedes_id) where supersedes_id is not null;
create index trip_deliveries_stop_idx on public.trip_deliveries (stop_id, recorded_at);

-- 7. Desbloqueios: cada item é desbloqueado uma vez.
create table public.trip_unlocks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  item_id uuid not null,
  request_id uuid not null,
  exceptional boolean not null default false,
  justification text,
  aal text not null,
  actor_user_id uuid not null references auth.users(id),
  actor_session_id uuid,
  occurred_at timestamptz not null default now(),
  constraint trip_unlocks_item_fk foreign key (item_id, organization_id) references public.trip_items (id, organization_id),
  constraint trip_unlocks_item_key unique (item_id),
  constraint trip_unlocks_aal_check check (aal in ('aal1', 'aal2')),
  constraint trip_unlocks_justification_check check (
    (justification is null or char_length(justification) <= 500)
    and (not exceptional or (justification is not null and char_length(btrim(justification)) between 5 and 500))),
  constraint trip_unlocks_exceptional_aal_check check (not exceptional or aal = 'aal2')
);

-- 8. Histórico imutável da viagem, no molde de registry_events.
create table public.trip_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  trip_id uuid not null,
  sequence integer not null,
  event_type text not null,
  actor_user_id uuid not null references auth.users(id),
  actor_session_id uuid,
  occurred_at timestamptz not null default now(),
  justification text,
  data jsonb not null default '{}'::jsonb,
  constraint trip_events_trip_fk foreign key (trip_id, organization_id) references public.trips (id, organization_id),
  constraint trip_events_sequence_key unique (trip_id, sequence),
  constraint trip_events_sequence_check check (sequence >= 1),
  constraint trip_events_type_check check (event_type in (
    'trip_created', 'trip_updated', 'loading_started', 'loading_reverted', 'item_checked', 'item_unchecked', 'item_removed',
    'trip_started', 'stop_arrived', 'delivery_registered', 'delivery_corrected', 'unlock_registered', 'item_returned',
    'trip_completed', 'trip_cancelled')),
  constraint trip_events_justification_check check (justification is null or char_length(justification) <= 500),
  constraint trip_events_data_check check (not (data ?| array['password', 'token', 'secret', 'refresh_token']))
);
create index trip_events_page_idx on public.trip_events (trip_id, sequence desc);
create index trip_events_type_idx on public.trip_events (trip_id, event_type, sequence desc);

-- 9. Tabelas privadas: contador sequencial por organização e pedidos já atendidos (idempotência).
create table private.trip_counters (
  organization_id uuid primary key references public.organizations(id) on delete restrict,
  last_number integer not null default 0
);
create table private.trip_requests (
  organization_id uuid not null references public.organizations(id) on delete restrict,
  request_id uuid not null,
  operation text not null,
  trip_id uuid,
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key (organization_id, request_id)
);

-- 10. Gatilhos: imutabilidade e exclusão proibida.
create function private.refuse_trip_mutation() returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception using errcode = 'P0001', message = 'trip_record_immutable';
end $$;

create function private.refuse_trip_delete() returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception using errcode = 'P0001', message = 'trip_record_undeletable';
end $$;

create trigger trip_events_immutable before update or delete on public.trip_events for each row execute function private.refuse_trip_mutation();
create trigger trip_events_no_truncate before truncate on public.trip_events for each statement execute function private.refuse_trip_mutation();
create trigger trip_deliveries_immutable before update or delete on public.trip_deliveries for each row execute function private.refuse_trip_mutation();
create trigger trip_deliveries_no_truncate before truncate on public.trip_deliveries for each statement execute function private.refuse_trip_mutation();
create trigger trip_unlocks_immutable before update or delete on public.trip_unlocks for each row execute function private.refuse_trip_mutation();
create trigger trip_unlocks_no_truncate before truncate on public.trip_unlocks for each statement execute function private.refuse_trip_mutation();

create trigger trips_no_delete before delete on public.trips for each row execute function private.refuse_trip_delete();
create trigger trips_no_truncate before truncate on public.trips for each statement execute function private.refuse_trip_delete();
create trigger trip_stops_no_delete before delete on public.trip_stops for each row execute function private.refuse_trip_delete();
create trigger trip_stops_no_truncate before truncate on public.trip_stops for each statement execute function private.refuse_trip_delete();
create trigger trip_items_no_delete before delete on public.trip_items for each row execute function private.refuse_trip_delete();
create trigger trip_items_no_truncate before truncate on public.trip_items for each statement execute function private.refuse_trip_delete();

revoke all on function private.trip_limits(), private.refuse_trip_mutation(), private.refuse_trip_delete() from public, anon, authenticated;

-- 11. RLS ligada, nenhuma política e nenhum privilégio: o acesso é só por RPC (service_role).
alter table public.trips enable row level security;
alter table public.trip_stops enable row level security;
alter table public.trip_items enable row level security;
alter table public.trip_deliveries enable row level security;
alter table public.trip_unlocks enable row level security;
alter table public.trip_events enable row level security;
alter table private.trip_counters enable row level security;
alter table private.trip_requests enable row level security;
revoke all on public.trips, public.trip_stops, public.trip_items, public.trip_deliveries, public.trip_unlocks, public.trip_events
  from anon, authenticated;
revoke all on private.trip_counters, private.trip_requests from anon, authenticated;

-- 12. Custódia do cilindro (Spec 006): onde ele está, sem consultar viagens (research.md, decisão 4).
alter table public.cylinders
  add column custody_status text not null default 'in_organization',
  add column custody_site_id uuid,
  add constraint cylinders_custody_check check (custody_status in ('in_organization', 'in_transit', 'at_customer')),
  add constraint cylinders_custody_site_check check (
    (custody_status = 'at_customer' and custody_site_id is not null) or (custody_status <> 'at_customer' and custody_site_id is null)),
  add constraint cylinders_custody_site_fk foreign key (custody_site_id, organization_id) references public.customer_sites (id, organization_id);
create index cylinders_custody_idx on public.cylinders (organization_id, custody_status);

alter table public.cylinder_events drop constraint cylinder_events_type_check;
alter table public.cylinder_events add constraint cylinder_events_type_check check (event_type in (
  'cylinder_created', 'cylinder_updated', 'cylinder_inactivated', 'cylinder_reactivated',
  'identifier_added', 'identifier_deactivated', 'identifier_transferred_out', 'identifier_transferred_in',
  'stock_in', 'stock_out_inactivation', 'hydrostatic_test_registered', 'hydrostatic_test_rectified',
  'trip_reserved', 'trip_released', 'trip_departed', 'trip_delivered', 'trip_returned'));
