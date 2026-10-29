-- Spec 015 (T041; RF-009, RF-009a): regra de proximidade versionada por empresa. Alterar a regra fecha a versão aberta e cria outra
-- (T041b); comparações apontam para a versão usada e nunca são recalculadas. Sem regra gravada, vale o padrão de 100 m, 2 min e 50 m.

create table public.proximity_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  version integer not null,
  distance_threshold_m numeric(6,1) not null,
  max_age_seconds smallint not null,
  max_accuracy_m numeric(6,1) not null,
  valid_from timestamptz not null default now(),
  valid_until timestamptz,
  justification text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  constraint proximity_rules_id_org_key unique (id, organization_id),
  constraint proximity_rules_version_key unique (organization_id, version),
  constraint proximity_rules_version_check check (version >= 1),
  constraint proximity_rules_distance_check check (distance_threshold_m between 50 and 500),
  constraint proximity_rules_age_check check (max_age_seconds between 60 and 300),
  constraint proximity_rules_accuracy_check check (max_accuracy_m between 20 and 100),
  constraint proximity_rules_validity_check check (valid_until is null or valid_until > valid_from),
  constraint proximity_rules_justification_check check (justification is null or char_length(btrim(justification)) between 10 and 500)
);
create unique index proximity_rules_open_key on public.proximity_rules (organization_id) where valid_until is null;
create index proximity_rules_org_from_idx on public.proximity_rules (organization_id, valid_from desc);

alter table public.proximity_rules enable row level security;
revoke all on public.proximity_rules from anon, authenticated;

-- Regra vigente da empresa, ou o padrão (versão 0) quando nenhuma foi gravada.
create function private.tracking_rule(p_organization uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select jsonb_build_object('id', r.id, 'version', r.version, 'distance_m', r.distance_threshold_m, 'max_age_s', r.max_age_seconds,
       'max_accuracy_m', r.max_accuracy_m, 'valid_from', r.valid_from)
       from public.proximity_rules r where r.organization_id = p_organization and r.valid_until is null),
    jsonb_build_object('id', null, 'version', 0, 'distance_m', 100, 'max_age_s', 120, 'max_accuracy_m', 50, 'valid_from', null))
$$;
revoke all on function private.tracking_rule(uuid) from public, anon, authenticated;
