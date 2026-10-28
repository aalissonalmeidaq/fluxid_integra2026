-- Spec 015 (T043; RF-010 a RF-018, RF-023): pares de acompanhamento, comparações append-only, ocorrências de afastamento e presença
-- pontual. FKs compostas impedem misturar empresas, sessões, viagens, itens, cilindros e lacres. RLS ligada, sem política nem
-- privilégio para o cliente: o acesso é só por RPC.

-- Um par por sessão, item da carga e lacre: a unidade que acumula a sequência de comparações.
create table public.proximity_pairs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  tracking_session_id uuid not null,
  trip_id uuid not null,
  trip_item_id uuid not null,
  cylinder_id uuid not null,
  device_id uuid not null,
  status text not null default 'active',
  outside_streak smallint not null default 0,
  confirmed_occurrence_id uuid,
  started_at timestamptz not null,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint proximity_pairs_id_org_key unique (id, organization_id),
  constraint proximity_pairs_key unique (tracking_session_id, trip_item_id, device_id),
  constraint proximity_pairs_session_fk foreign key (tracking_session_id, trip_id) references public.tracking_sessions (id, trip_id),
  constraint proximity_pairs_session_org_fk foreign key (tracking_session_id, organization_id) references public.tracking_sessions (id, organization_id),
  constraint proximity_pairs_item_fk foreign key (trip_item_id, organization_id) references public.trip_items (id, organization_id),
  constraint proximity_pairs_cylinder_fk foreign key (cylinder_id, organization_id) references public.cylinders (id, organization_id),
  constraint proximity_pairs_device_fk foreign key (device_id, organization_id) references public.seal_devices (id, organization_id),
  constraint proximity_pairs_status_check check (status in ('active', 'delivered', 'session_ended')),
  constraint proximity_pairs_streak_check check (outside_streak >= 0),
  constraint proximity_pairs_end_check check ((status = 'active' and ended_at is null) or (status <> 'active' and ended_at is not null))
);
create index proximity_pairs_session_idx on public.proximity_pairs (tracking_session_id, status);
create index proximity_pairs_item_idx on public.proximity_pairs (organization_id, trip_item_id);

-- Comparação celular × lacre com cópia imutável dos limites aplicados. Uma por par e posição do celular (idempotência).
create table public.proximity_comparisons (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  pair_id uuid not null,
  rule_id uuid not null,
  rule_version integer not null,
  mobile_position_id uuid not null,
  seal_position_id uuid,
  evaluated_at timestamptz not null default now(),
  distance_m numeric(10,2),
  distance_threshold_m numeric(6,1) not null,
  max_age_seconds smallint not null,
  max_accuracy_m numeric(6,1) not null,
  result text not null,
  reason text not null,
  sequence_ordinal integer not null,
  retrospective boolean not null,
  created_at timestamptz not null default now(),
  constraint proximity_comparisons_id_org_key unique (id, organization_id),
  constraint proximity_comparisons_key unique (pair_id, mobile_position_id),
  constraint proximity_comparisons_ordinal_key unique (pair_id, sequence_ordinal),
  constraint proximity_comparisons_pair_fk foreign key (pair_id, organization_id) references public.proximity_pairs (id, organization_id),
  constraint proximity_comparisons_rule_fk foreign key (rule_id, organization_id) references public.proximity_rules (id, organization_id),
  constraint proximity_comparisons_mobile_fk foreign key (mobile_position_id, organization_id) references public.mobile_positions (id, organization_id),
  constraint proximity_comparisons_seal_fk foreign key (seal_position_id, organization_id) references public.seal_positions (id, organization_id),
  constraint proximity_comparisons_result_check check (result in ('inside', 'outside', 'inconclusive')),
  constraint proximity_comparisons_reason_check check (reason in ('within_limit', 'beyond_limit', 'mobile_missing', 'seal_missing', 'stale', 'imprecise', 'future', 'context_invalid')),
  constraint proximity_comparisons_coherence_check check (
    (result = 'inside' and reason = 'within_limit' and distance_m is not null)
    or (result = 'outside' and reason = 'beyond_limit' and distance_m is not null)
    or (result = 'inconclusive' and reason not in ('within_limit', 'beyond_limit') and distance_m is null))
);
create index proximity_comparisons_pair_time_idx on public.proximity_comparisons (organization_id, pair_id, evaluated_at, id);

-- Ocorrência de afastamento: três comparações válidas consecutivas fora. Com a viagem ativa, liga-se a um alerta; encerrada, é só histórico.
create table public.proximity_occurrences (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  pair_id uuid not null,
  trip_id uuid not null,
  trip_item_id uuid not null,
  cylinder_id uuid not null,
  device_id uuid not null,
  alert_id uuid,
  status text not null,
  detection_kind text not null,
  first_comparison_id uuid not null,
  confirming_comparison_id uuid not null,
  opened_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  acknowledged_by uuid references auth.users(id),
  closed_at timestamptz,
  closed_by uuid references auth.users(id),
  close_note text,
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint proximity_occurrences_id_org_key unique (id, organization_id),
  constraint proximity_occurrences_pair_fk foreign key (pair_id, organization_id) references public.proximity_pairs (id, organization_id),
  constraint proximity_occurrences_trip_fk foreign key (trip_id, organization_id) references public.trips (id, organization_id),
  constraint proximity_occurrences_item_fk foreign key (trip_item_id, organization_id) references public.trip_items (id, organization_id),
  constraint proximity_occurrences_alert_fk foreign key (alert_id, organization_id) references public.seal_alerts (id, organization_id),
  constraint proximity_occurrences_first_fk foreign key (first_comparison_id, organization_id) references public.proximity_comparisons (id, organization_id),
  constraint proximity_occurrences_confirming_fk foreign key (confirming_comparison_id, organization_id) references public.proximity_comparisons (id, organization_id),
  constraint proximity_occurrences_status_check check (status in ('open', 'acknowledged', 'closed', 'historical_only')),
  constraint proximity_occurrences_detection_check check (detection_kind in ('live', 'retrospective')),
  constraint proximity_occurrences_alert_check check (status <> 'historical_only' or alert_id is null),
  constraint proximity_occurrences_ack_check check ((acknowledged_at is null) = (acknowledged_by is null)),
  constraint proximity_occurrences_close_check check (
    (status <> 'closed' and closed_at is null and closed_by is null and close_note is null)
    or (status = 'closed' and closed_at is not null and closed_by is not null and char_length(btrim(close_note)) between 5 and 500))
);
create unique index proximity_occurrences_open_key on public.proximity_occurrences (pair_id) where status in ('open', 'acknowledged');
create index proximity_occurrences_trip_idx on public.proximity_occurrences (organization_id, trip_id, opened_at desc);

alter table public.proximity_pairs add constraint proximity_pairs_occurrence_fk
  foreign key (confirmed_occurrence_id, organization_id) references public.proximity_occurrences (id, organization_id);

-- Presença pontual: leitura presencial do cilindro na entrega (câmera, NFC ou digitação). Não é posição nem prova de proximidade contínua.
create table public.proximity_presence_evidences (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  tracking_session_id uuid not null,
  trip_id uuid not null,
  trip_item_id uuid not null,
  cylinder_id uuid not null,
  delivery_id uuid not null,
  source text not null,
  kind text not null default 'in_person_reading',
  confirmed_by uuid not null references auth.users(id),
  observed_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint proximity_presence_id_org_key unique (id, organization_id),
  constraint proximity_presence_key unique (delivery_id, trip_item_id),
  constraint proximity_presence_session_fk foreign key (tracking_session_id, trip_id) references public.tracking_sessions (id, trip_id),
  constraint proximity_presence_session_org_fk foreign key (tracking_session_id, organization_id) references public.tracking_sessions (id, organization_id),
  constraint proximity_presence_item_fk foreign key (trip_item_id, organization_id) references public.trip_items (id, organization_id),
  constraint proximity_presence_cylinder_fk foreign key (cylinder_id, organization_id) references public.cylinders (id, organization_id),
  constraint proximity_presence_delivery_fk foreign key (delivery_id, organization_id) references public.trip_deliveries (id, organization_id),
  constraint proximity_presence_source_check check (source in ('camera', 'nfc', 'typed')),
  constraint proximity_presence_kind_check check (kind = 'in_person_reading')
);
create index proximity_presence_trip_idx on public.proximity_presence_evidences (organization_id, trip_id, observed_at);

-- Nada é apagado; comparações e presenças não mudam depois de gravadas.
do $$
declare
  t text;
begin
  foreach t in array array['proximity_pairs', 'proximity_comparisons', 'proximity_occurrences', 'proximity_presence_evidences'] loop
    execute format('create trigger %I before delete on public.%I for each statement execute function private.refuse_tracking_delete()', t || '_no_delete', t);
    execute format('create trigger %I before truncate on public.%I for each statement execute function private.refuse_tracking_delete()', t || '_no_truncate', t);
  end loop;
  foreach t in array array['proximity_comparisons', 'proximity_presence_evidences'] loop
    execute format('create trigger %I before update on public.%I for each statement execute function private.refuse_tracking_mutation()', t || '_immutable', t);
  end loop;
end $$;

alter table public.proximity_pairs enable row level security;
alter table public.proximity_comparisons enable row level security;
alter table public.proximity_occurrences enable row level security;
alter table public.proximity_presence_evidences enable row level security;
revoke all on public.proximity_pairs, public.proximity_comparisons, public.proximity_occurrences, public.proximity_presence_evidences from anon, authenticated;
