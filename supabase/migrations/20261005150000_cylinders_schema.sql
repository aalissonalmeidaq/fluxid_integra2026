-- Spec 006: cilindros, identificadores, testes hidrostáticos e histórico. Primeiro dado de domínio do FluxID.
-- Toda tabela tem organization_id e RLS de leitura; ninguém escreve direto (só as funções security definer das migrations
-- seguintes). Nada é excluído e eventos e testes são imutáveis para qualquer papel (RF-005, RF-024, RF-038).

create extension if not exists pg_trgm with schema extensions;

-- 1. Catálogo de tipos de cilindro (RF-003).
create table public.cylinder_types (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  gas text not null,
  capacity_value numeric(10,2) not null,
  capacity_unit text not null,
  classification text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  constraint cylinder_types_gas_check check (char_length(btrim(gas)) between 2 and 80),
  constraint cylinder_types_capacity_check check (capacity_value > 0),
  constraint cylinder_types_unit_check check (capacity_unit in ('l', 'm3', 'kg')),
  constraint cylinder_types_classification_check check (classification in ('medicinal', 'industrial')),
  constraint cylinder_types_id_org_key unique (id, organization_id)
);
create unique index cylinder_types_identity_idx
  on public.cylinder_types (organization_id, lower(btrim(gas)), capacity_value, capacity_unit, classification);

-- 2. O casco individual (RF-001, RF-002, RF-004, RF-006, RF-018).
create table public.cylinders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  cylinder_type_id uuid not null,
  serial_number text not null,
  serial_normalized text generated always as (upper(btrim(serial_number))) stored,
  manufacturer text,
  manufacture_year smallint,
  working_pressure_bar numeric(7,2),
  notes text,
  status text not null default 'active',
  inactivation_reason text,
  stock_status text not null default 'out_of_stock',
  hydro_last_result text,
  hydro_next_due_on date,
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  constraint cylinders_type_fk foreign key (cylinder_type_id, organization_id) references public.cylinder_types (id, organization_id),
  constraint cylinders_id_org_key unique (id, organization_id),
  constraint cylinders_serial_check check (char_length(btrim(serial_number)) between 1 and 60),
  constraint cylinders_manufacturer_check check (manufacturer is null or char_length(manufacturer) <= 120),
  constraint cylinders_pressure_check check (working_pressure_bar is null or working_pressure_bar > 0),
  constraint cylinders_notes_check check (notes is null or char_length(notes) <= 500),
  constraint cylinders_status_check check (status in ('active', 'inactive')),
  constraint cylinders_reason_check check (
    (status = 'active' and inactivation_reason is null)
    or (status = 'inactive' and inactivation_reason is not null and inactivation_reason in ('written_off', 'lost', 'condemned', 'other'))),
  constraint cylinders_stock_check check (stock_status in ('in_stock', 'out_of_stock')),
  constraint cylinders_inactive_out_of_stock_check check (status = 'active' or stock_status = 'out_of_stock'),
  constraint cylinders_hydro_result_check check (hydro_last_result is null or hydro_last_result in ('approved', 'rejected'))
);
create unique index cylinders_serial_idx on public.cylinders (organization_id, serial_normalized);
create index cylinders_serial_trgm_idx on public.cylinders using gin (serial_normalized extensions.gin_trgm_ops);
create index cylinders_state_idx on public.cylinders (organization_id, status, stock_status);
create index cylinders_hydro_idx on public.cylinders (organization_id, hydro_next_due_on);
create index cylinders_type_idx on public.cylinders (organization_id, cylinder_type_id);

-- 3. Identificadores (RF-007 a RF-012): um valor ativo pertence a um só cilindro por organização.
create table public.cylinder_identifiers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  cylinder_id uuid not null,
  kind text not null,
  value text not null,
  value_normalized text generated always as (upper(btrim(value))) stored,
  status text not null default 'active',
  deactivated_at timestamptz,
  deactivated_by uuid references auth.users(id),
  deactivation_justification text,
  transferred_to_identifier_id uuid references public.cylinder_identifiers(id),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  constraint cylinder_identifiers_cylinder_fk foreign key (cylinder_id, organization_id) references public.cylinders (id, organization_id),
  constraint cylinder_identifiers_kind_check check (kind in ('qr_code', 'data_matrix', 'nfc_tag', 'hull_number')),
  constraint cylinder_identifiers_value_check check (char_length(btrim(value)) between 1 and 200 and value !~ '[\r\n]'),
  constraint cylinder_identifiers_status_check check (status in ('active', 'deactivated')),
  constraint cylinder_identifiers_deactivation_check check (
    (status = 'active' and deactivated_at is null and deactivated_by is null and deactivation_justification is null)
    or (status = 'deactivated' and deactivated_at is not null and deactivated_by is not null
        and char_length(btrim(deactivation_justification)) between 5 and 500))
);
create unique index cylinder_identifiers_active_value_idx
  on public.cylinder_identifiers (organization_id, value_normalized) where status = 'active';
create index cylinder_identifiers_value_idx on public.cylinder_identifiers (organization_id, value_normalized);
create index cylinder_identifiers_cylinder_idx on public.cylinder_identifiers (cylinder_id, status);

-- 4. Testes hidrostáticos (RF-019, RF-022): somente inserção; a correção é uma retificação que referencia o original.
create table public.cylinder_tests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  cylinder_id uuid not null,
  performed_on date not null,
  result text not null,
  report_number text,
  executor text not null,
  next_due_on date,
  notes text,
  rectifies_test_id uuid references public.cylinder_tests(id),
  rectification_justification text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  constraint cylinder_tests_cylinder_fk foreign key (cylinder_id, organization_id) references public.cylinders (id, organization_id),
  constraint cylinder_tests_result_check check (result in ('approved', 'rejected')),
  constraint cylinder_tests_report_check check (report_number is null or char_length(report_number) <= 60),
  constraint cylinder_tests_executor_check check (char_length(btrim(executor)) between 2 and 120),
  constraint cylinder_tests_notes_check check (notes is null or char_length(notes) <= 500),
  constraint cylinder_tests_due_required_check check (result <> 'approved' or next_due_on is not null),
  constraint cylinder_tests_due_after_check check (next_due_on is null or next_due_on > performed_on),
  constraint cylinder_tests_rectification_check check (
    rectifies_test_id is null or char_length(btrim(rectification_justification)) between 5 and 500)
);
create unique index cylinder_tests_rectified_once_idx on public.cylinder_tests (rectifies_test_id) where rectifies_test_id is not null;
create index cylinder_tests_cylinder_idx on public.cylinder_tests (cylinder_id, performed_on desc, created_at desc);

-- 5. Histórico imutável (RF-023 a RF-026). A ordem vem de `sequence`, atribuída sob bloqueio da linha do cilindro.
create table public.cylinder_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  cylinder_id uuid not null,
  sequence integer not null,
  event_type text not null,
  actor_user_id uuid not null references auth.users(id),
  actor_session_id uuid,
  occurred_at timestamptz not null default now(),
  justification text,
  data jsonb not null default '{}'::jsonb,
  references_event_id uuid references public.cylinder_events(id),
  constraint cylinder_events_cylinder_fk foreign key (cylinder_id, organization_id) references public.cylinders (id, organization_id),
  constraint cylinder_events_sequence_key unique (cylinder_id, sequence),
  constraint cylinder_events_sequence_check check (sequence >= 1),
  constraint cylinder_events_type_check check (event_type in (
    'cylinder_created', 'cylinder_updated', 'cylinder_inactivated', 'cylinder_reactivated',
    'identifier_added', 'identifier_deactivated', 'identifier_transferred_out', 'identifier_transferred_in',
    'stock_in', 'stock_out_inactivation', 'hydrostatic_test_registered', 'hydrostatic_test_rectified')),
  constraint cylinder_events_justification_check check (justification is null or char_length(justification) <= 500),
  constraint cylinder_events_data_check check (not (data ?| array['password', 'token', 'secret', 'refresh_token']))
);
create index cylinder_events_page_idx on public.cylinder_events (cylinder_id, sequence desc);
create index cylinder_events_type_idx on public.cylinder_events (cylinder_id, event_type, sequence desc);

-- 6. Gatilhos: imutabilidade, exclusão proibida e validações que dependem da data de hoje.
create function private.refuse_cylinder_mutation() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception using errcode = 'P0001', message = 'cylinder_record_immutable';
end $$;

create function private.refuse_cylinder_delete() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception using errcode = 'P0001', message = 'cylinder_record_undeletable';
end $$;

create trigger cylinder_events_immutable before update or delete on public.cylinder_events
  for each row execute function private.refuse_cylinder_mutation();
create trigger cylinder_events_no_truncate before truncate on public.cylinder_events
  for each statement execute function private.refuse_cylinder_mutation();
create trigger cylinder_tests_immutable before update or delete on public.cylinder_tests
  for each row execute function private.refuse_cylinder_mutation();
create trigger cylinder_tests_no_truncate before truncate on public.cylinder_tests
  for each statement execute function private.refuse_cylinder_mutation();
create trigger cylinders_no_delete before delete on public.cylinders
  for each row execute function private.refuse_cylinder_delete();
create trigger cylinders_no_truncate before truncate on public.cylinders
  for each statement execute function private.refuse_cylinder_delete();
create trigger cylinder_types_no_delete before delete on public.cylinder_types
  for each row execute function private.refuse_cylinder_delete();
create trigger cylinder_types_no_truncate before truncate on public.cylinder_types
  for each statement execute function private.refuse_cylinder_delete();
create trigger cylinder_identifiers_no_delete before delete on public.cylinder_identifiers
  for each row execute function private.refuse_cylinder_delete();
create trigger cylinder_identifiers_no_truncate before truncate on public.cylinder_identifiers
  for each statement execute function private.refuse_cylinder_delete();

-- Identificador: só desativa uma vez (active -> deactivated) e só registra a transferência uma vez.
create function private.guard_cylinder_identifier_update() returns trigger
language plpgsql set search_path = '' as $$
declare
  -- value_normalized é coluna gerada: dentro do gatilho BEFORE ela ainda não foi calculada em NEW.
  deactivation_cols constant text[] := array['status', 'deactivated_at', 'deactivated_by', 'deactivation_justification', 'value_normalized'];
  transfer_cols constant text[] := array['transferred_to_identifier_id', 'value_normalized'];
begin
  if old.status = 'active' and new.status = 'deactivated'
     and (to_jsonb(new) - deactivation_cols) = (to_jsonb(old) - deactivation_cols) then
    return new;
  end if;
  if old.status = 'deactivated' and new.status = 'deactivated'
     and old.transferred_to_identifier_id is null and new.transferred_to_identifier_id is not null
     and (to_jsonb(new) - transfer_cols) = (to_jsonb(old) - transfer_cols) then
    return new;
  end if;
  raise exception using errcode = 'P0001', message = 'identifier_update_not_allowed';
end $$;
create trigger cylinder_identifiers_guard before update on public.cylinder_identifiers
  for each row execute function private.guard_cylinder_identifier_update();

-- Ano de fabricação até o ano corrente.
create function private.validate_cylinder_year() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.manufacture_year is not null
     and (new.manufacture_year < 1900 or new.manufacture_year > extract(year from (now() at time zone 'America/Sao_Paulo'))::int) then
    raise exception using errcode = '23514', message = 'cylinder_manufacture_year_invalid';
  end if;
  return new;
end $$;
create trigger cylinders_validate_year before insert or update on public.cylinders
  for each row execute function private.validate_cylinder_year();

-- Teste: realização não futura e próxima data a no máximo 10 anos; retificação só no mesmo cilindro.
create function private.validate_cylinder_test() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.performed_on > (now() at time zone 'America/Sao_Paulo')::date then
    raise exception using errcode = '23514', message = 'cylinder_test_in_future';
  end if;
  if new.next_due_on is not null and new.next_due_on > new.performed_on + interval '10 years' then
    raise exception using errcode = '23514', message = 'cylinder_test_due_too_far';
  end if;
  if new.rectifies_test_id is not null and not exists (
    select 1 from public.cylinder_tests t
     where t.id = new.rectifies_test_id and t.cylinder_id = new.cylinder_id and t.organization_id = new.organization_id) then
    raise exception using errcode = '23503', message = 'cylinder_test_rectification_target_invalid';
  end if;
  return new;
end $$;
create trigger cylinder_tests_validate before insert on public.cylinder_tests
  for each row execute function private.validate_cylinder_test();

revoke all on function private.refuse_cylinder_mutation(), private.refuse_cylinder_delete(), private.guard_cylinder_identifier_update(),
  private.validate_cylinder_year(), private.validate_cylinder_test() from public, anon, authenticated;

-- 7. RLS: leitura por membro ativo com a permissão; nenhuma escrita direta para anon e authenticated.
alter table public.cylinder_types enable row level security;
alter table public.cylinders enable row level security;
alter table public.cylinder_identifiers enable row level security;
alter table public.cylinder_tests enable row level security;
alter table public.cylinder_events enable row level security;

create policy cylinder_types_read on public.cylinder_types for select to authenticated
  using (private.has_permission(organization_id, 'cylinder.read'));
create policy cylinders_read on public.cylinders for select to authenticated
  using (private.has_permission(organization_id, 'cylinder.read'));
create policy cylinder_identifiers_read on public.cylinder_identifiers for select to authenticated
  using (private.has_permission(organization_id, 'cylinder.read'));
create policy cylinder_tests_read on public.cylinder_tests for select to authenticated
  using (private.has_permission(organization_id, 'cylinder.read'));
create policy cylinder_events_read on public.cylinder_events for select to authenticated
  using (private.has_permission(organization_id, 'cylinder.history'));

revoke all on public.cylinder_types, public.cylinders, public.cylinder_identifiers, public.cylinder_tests, public.cylinder_events
  from anon, authenticated;
grant select on public.cylinder_types, public.cylinders, public.cylinder_identifiers, public.cylinder_tests, public.cylinder_events
  to authenticated;
