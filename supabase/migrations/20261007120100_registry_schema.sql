-- Spec 007: clientes, unidades, geocercas, veículos e motoristas (Fase 3 do PRD). Toda tabela tem organization_id e RLS;
-- ninguém escreve direto (só as funções security definer das migrations seguintes). Nada é excluído, exceto a substituição
-- dos contatos do cliente dentro de update_customer, e o histórico é imutável para qualquer papel (RF-033, RF-037, RF-048).
-- CPF e CNH ficam em tabelas próprias, sem política de leitura e sem privilégio para anon e authenticated (RF-029 a RF-031).

-- 1. Limites e validadores únicos (um só lugar no banco; o TypeScript tem o par e um teste de contrato compara os dois).
create function private.geofence_limits() returns jsonb language sql immutable set search_path = '' as $$
  select jsonb_build_object('radius_min_m', 25, 'radius_max_m', 5000, 'vertices_min', 3, 'vertices_max', 100)
$$;

create function private.document_expiring_days() returns integer language sql stable set search_path = '' as $$
  select private.hydrostatic_expiring_days()
$$;

create function private.week_days_valid(p_days smallint[]) returns boolean language sql immutable set search_path = '' as $$
  select p_days is not null
     and cardinality(p_days) between 1 and 7
     and p_days <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[]
     and (select count(distinct d) from unnest(p_days) d) = cardinality(p_days)
$$;

-- CPF: 11 dígitos sem pontuação, com os dois dígitos verificadores.
create function private.validate_cpf(p_value text) returns boolean language plpgsql immutable set search_path = '' as $$
declare
  total integer;
  dv1 integer;
  dv2 integer;
  i integer;
begin
  if p_value is null or p_value !~ '^[0-9]{11}$' or p_value ~ '^(.)\1{10}$' then
    return false;
  end if;
  total := 0;
  for i in 1..9 loop total := total + substr(p_value, i, 1)::integer * (11 - i); end loop;
  dv1 := (total * 10) % 11 % 10;
  total := 0;
  for i in 1..10 loop total := total + substr(p_value, i, 1)::integer * (12 - i); end loop;
  dv2 := (total * 10) % 11 % 10;
  return dv1 = substr(p_value, 10, 1)::integer and dv2 = substr(p_value, 11, 1)::integer;
end $$;

-- CNPJ numérico e alfanumérico (Nota Técnica Conjunta 2025.001): o valor de cada caractere é o código ASCII menos 48,
-- os pesos são os do módulo 11 de sempre e os dois dígitos verificadores continuam numéricos. Normaliza maiúsculas e pontuação.
create function private.validate_cnpj(p_value text) returns boolean language plpgsql immutable set search_path = '' as $$
declare
  v text := upper(regexp_replace(coalesce(p_value, ''), '[./-]', '', 'g'));
  weights1 constant integer[] := array[5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  weights2 constant integer[] := array[6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  total integer;
  rest integer;
  dv1 integer;
  dv2 integer;
  i integer;
begin
  if v !~ '^[0-9A-Z]{12}[0-9]{2}$' or v ~ '^(.)\1{13}$' then
    return false;
  end if;
  total := 0;
  for i in 1..12 loop total := total + (ascii(substr(v, i, 1)) - 48) * weights1[i]; end loop;
  rest := total % 11;
  dv1 := case when rest < 2 then 0 else 11 - rest end;
  total := 0;
  for i in 1..12 loop total := total + (ascii(substr(v, i, 1)) - 48) * weights2[i]; end loop;
  total := total + dv1 * weights2[13];
  rest := total % 11;
  dv2 := case when rest < 2 then 0 else 11 - rest end;
  return dv1 = substr(v, 13, 1)::integer and dv2 = substr(v, 14, 1)::integer;
end $$;

-- CNH: 11 dígitos, dois dígitos verificadores (algoritmo do DENATRAN, com o ajuste de `dsc` do primeiro resto).
create function private.validate_cnh(p_value text) returns boolean language plpgsql immutable set search_path = '' as $$
declare
  total integer;
  dv1 integer;
  dv2 integer;
  dsc integer := 0;
  i integer;
begin
  if p_value is null or p_value !~ '^[0-9]{11}$' or p_value ~ '^(.)\1{10}$' then
    return false;
  end if;
  total := 0;
  for i in 1..9 loop total := total + substr(p_value, i, 1)::integer * (10 - i); end loop;
  dv1 := total % 11;
  if dv1 >= 10 then dv1 := 0; dsc := 2; end if;
  total := 0;
  for i in 1..9 loop total := total + substr(p_value, i, 1)::integer * i; end loop;
  dv2 := (total % 11) - dsc;
  if dv2 < 0 then dv2 := dv2 + 11; end if;
  if dv2 >= 10 then dv2 := 0; end if;
  return dv1 = substr(p_value, 10, 1)::integer and dv2 = substr(p_value, 11, 1)::integer;
end $$;

-- Placa: maiúsculas, sem hífen e sem espaços; padrões AAA9999 e AAA9A99. Devolve nulo quando inválida.
create function private.normalize_plate(p_value text) returns text language sql immutable set search_path = '' as $$
  select case when v ~ '^[A-Z]{3}[0-9]{4}$' or v ~ '^[A-Z]{3}[0-9][A-Z][0-9]{2}$' then v end
    from (select upper(regexp_replace(coalesce(p_value, ''), '[[:space:]-]', '', 'g')) as v) s
$$;

-- 2. Clientes (RF-001 a RF-004a). O tipo de pessoa é fixo; o documento completo vive em customer_documents.
create table public.customers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  person_type text not null,
  document_display text not null,
  legal_name text not null,
  trade_name text,
  segment text not null,
  segment_detail text,
  notes text,
  status text not null default 'active',
  inactivated_at timestamptz,
  inactivated_by uuid references auth.users(id),
  anonymized_at timestamptz,
  anonymized_by uuid references auth.users(id),
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  constraint customers_id_org_key unique (id, organization_id),
  constraint customers_person_type_check check (person_type in ('legal', 'individual')),
  constraint customers_document_display_check check (char_length(document_display) between 1 and 40),
  constraint customers_legal_name_check check (char_length(btrim(legal_name)) between 2 and 160),
  constraint customers_trade_name_check check (trade_name is null or char_length(trade_name) <= 160),
  constraint customers_segment_check check (segment in ('hospital', 'clinic', 'laboratory', 'industry', 'distributor', 'other')),
  constraint customers_segment_detail_check check (
    (segment = 'other' and segment_detail is not null and char_length(btrim(segment_detail)) between 1 and 60)
    or (segment <> 'other' and segment_detail is null)),
  constraint customers_notes_check check (notes is null or char_length(notes) <= 500),
  constraint customers_status_check check (status in ('active', 'inactive')),
  constraint customers_inactivation_check check (
    (status = 'active' and inactivated_at is null and inactivated_by is null)
    or (status = 'inactive' and inactivated_at is not null)),
  constraint customers_anonymization_check check (
    (anonymized_at is null and anonymized_by is null)
    or (anonymized_at is not null and anonymized_by is not null and person_type = 'individual' and status = 'inactive'))
);
create index customers_list_idx on public.customers (organization_id, status, lower(legal_name));
create index customers_legal_name_trgm_idx on public.customers using gin (lower(legal_name) extensions.gin_trgm_ops);
create index customers_trade_name_trgm_idx on public.customers using gin (lower(trade_name) extensions.gin_trgm_ops);

-- 3. Documento do cliente (acesso só por função): único por organização; nulo só quando anonimizado, na própria linha.
create table public.customer_documents (
  customer_id uuid primary key,
  organization_id uuid not null references public.organizations(id),
  kind text not null,
  document_key text,
  anonymized_at timestamptz,
  constraint customer_documents_customer_fk foreign key (customer_id, organization_id) references public.customers (id, organization_id),
  constraint customer_documents_kind_check check (kind in ('cnpj', 'cpf')),
  constraint customer_documents_key_check check (
    document_key is null
    or (kind = 'cnpj' and document_key ~ '^[0-9A-Z]{14}$')
    or (kind = 'cpf' and document_key ~ '^[0-9]{11}$')),
  constraint customer_documents_anonymized_check check ((document_key is null) = (anonymized_at is not null)),
  constraint customer_documents_org_key unique (organization_id, document_key)
);

-- 4. Contatos do cliente (RF-003): até 10, um principal. Única tabela de cadastro com remoção, só pela substituição.
create table public.customer_contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  customer_id uuid not null,
  name text not null,
  role text,
  phone text,
  email text,
  is_primary boolean not null default false,
  position smallint not null default 0,
  anonymized_at timestamptz,
  anonymized_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customer_contacts_customer_fk foreign key (customer_id, organization_id) references public.customers (id, organization_id),
  constraint customer_contacts_name_check check (char_length(btrim(name)) between 2 and 120),
  constraint customer_contacts_role_check check (role is null or char_length(role) <= 80),
  constraint customer_contacts_phone_check check (phone is null or phone ~ '^[0-9]{10,11}$'),
  constraint customer_contacts_email_check check (
    email is null or (email = lower(email) and char_length(email) <= 160 and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')),
  constraint customer_contacts_anonymization_check check ((anonymized_at is null) = (anonymized_by is null))
);
create unique index customer_contacts_primary_idx on public.customer_contacts (customer_id) where is_primary;
create index customer_contacts_customer_idx on public.customer_contacts (customer_id, position);

-- 5. Unidades (RF-005 a RF-007).
create table public.customer_sites (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  customer_id uuid not null,
  name text not null,
  postal_code text not null,
  street text not null,
  number text not null,
  complement text,
  district text,
  city text not null,
  state text not null,
  ibge_code text,
  latitude numeric(9,6),
  longitude numeric(9,6),
  receiving_contact_name text,
  receiving_contact_phone text,
  receiving_days smallint[],
  receiving_from time,
  receiving_to time,
  access_instructions text,
  status text not null default 'active',
  inactivated_at timestamptz,
  inactivated_by uuid references auth.users(id),
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  constraint customer_sites_customer_fk foreign key (customer_id, organization_id) references public.customers (id, organization_id),
  constraint customer_sites_id_org_key unique (id, organization_id),
  constraint customer_sites_name_check check (char_length(btrim(name)) between 2 and 120),
  constraint customer_sites_postal_code_check check (postal_code ~ '^[0-9]{8}$'),
  constraint customer_sites_street_check check (char_length(btrim(street)) between 1 and 120),
  constraint customer_sites_number_check check (char_length(btrim(number)) between 1 and 20),
  constraint customer_sites_complement_check check (complement is null or char_length(complement) <= 80),
  constraint customer_sites_district_check check (district is null or char_length(district) <= 80),
  constraint customer_sites_city_check check (char_length(btrim(city)) between 1 and 80),
  constraint customer_sites_state_check check (state = any (array[
    'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'])),
  constraint customer_sites_ibge_check check (ibge_code is null or ibge_code ~ '^[0-9]{7}$'),
  constraint customer_sites_coordinates_check check (
    (latitude is null and longitude is null)
    or (latitude is not null and longitude is not null and latitude between -90 and 90 and longitude between -180 and 180)),
  constraint customer_sites_receiving_phone_check check (receiving_contact_phone is null or receiving_contact_phone ~ '^[0-9]{10,11}$'),
  constraint customer_sites_receiving_name_check check (receiving_contact_name is null or char_length(receiving_contact_name) <= 120),
  constraint customer_sites_days_check check (receiving_days is null or private.week_days_valid(receiving_days)),
  constraint customer_sites_window_check check (
    (receiving_from is null and receiving_to is null)
    or (receiving_from is not null and receiving_to is not null and receiving_to > receiving_from and receiving_days is not null)),
  constraint customer_sites_access_check check (access_instructions is null or char_length(access_instructions) <= 500),
  constraint customer_sites_status_check check (status in ('active', 'inactive')),
  constraint customer_sites_inactivation_check check (
    (status = 'active' and inactivated_at is null and inactivated_by is null)
    or (status = 'inactive' and inactivated_at is not null))
);
create unique index customer_sites_name_idx on public.customer_sites (customer_id, lower(btrim(name)));
create index customer_sites_customer_idx on public.customer_sites (organization_id, customer_id, status);
create index customer_sites_name_trgm_idx on public.customer_sites using gin (lower(name) extensions.gin_trgm_ops);
create index customer_sites_city_trgm_idx on public.customer_sites using gin (lower(city) extensions.gin_trgm_ops);

-- 6. Geocercas (RF-013 a RF-018). A decisão exata de "ponto dentro" usa center e radius_m (círculo) ou area (polígono);
-- area é o polígono para o índice espacial (círculo: polígono circunscrito) e é calculada só nas funções do servidor.
create table public.geofences (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  site_id uuid not null,
  name text not null,
  shape text not null,
  center extensions.geography(Point, 4326),
  radius_m integer,
  vertices jsonb,
  area extensions.geography(Polygon, 4326) not null,
  status text not null default 'active',
  inactivated_at timestamptz,
  inactivated_by uuid references auth.users(id),
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  constraint geofences_site_fk foreign key (site_id, organization_id) references public.customer_sites (id, organization_id),
  constraint geofences_name_check check (char_length(btrim(name)) between 2 and 120),
  constraint geofences_shape_check check (shape in ('circle', 'polygon')),
  constraint geofences_circle_check check (
    shape <> 'circle'
    or (center is not null and vertices is null
        and radius_m between (private.geofence_limits()->>'radius_min_m')::integer and (private.geofence_limits()->>'radius_max_m')::integer)),
  constraint geofences_polygon_check check (
    shape <> 'polygon'
    or (center is null and radius_m is null and vertices is not null and jsonb_typeof(vertices) = 'array'
        and jsonb_array_length(vertices) between (private.geofence_limits()->>'vertices_min')::integer and (private.geofence_limits()->>'vertices_max')::integer)),
  constraint geofences_status_check check (status in ('active', 'inactive')),
  constraint geofences_inactivation_check check (
    (status = 'active' and inactivated_at is null and inactivated_by is null)
    or (status = 'inactive' and inactivated_at is not null))
);
create unique index geofences_name_idx on public.geofences (site_id, lower(btrim(name)));
create index geofences_site_idx on public.geofences (organization_id, site_id, status);
create index geofences_area_idx on public.geofences using gist (area);
create index geofences_name_trgm_idx on public.geofences using gin (lower(name) extensions.gin_trgm_ops);

-- 7. Veículos (RF-019 a RF-023). A situação do licenciamento é calculada, não é coluna.
create table public.vehicles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  plate text not null,
  vehicle_type text not null,
  vehicle_type_detail text,
  brand text,
  model text,
  manufacture_year smallint,
  capacity_cylinders integer not null,
  max_load_kg numeric(9,2),
  licensing_due_on date,
  status text not null default 'available',
  inactivated_at timestamptz,
  inactivated_by uuid references auth.users(id),
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  constraint vehicles_plate_check check (plate ~ '^[A-Z]{3}[0-9]{4}$' or plate ~ '^[A-Z]{3}[0-9][A-Z][0-9]{2}$'),
  constraint vehicles_type_check check (vehicle_type in ('truck', 'van', 'utility', 'other')),
  constraint vehicles_type_detail_check check (
    (vehicle_type = 'other' and vehicle_type_detail is not null and char_length(btrim(vehicle_type_detail)) between 1 and 60)
    or (vehicle_type <> 'other' and vehicle_type_detail is null)),
  constraint vehicles_brand_check check (brand is null or char_length(brand) <= 60),
  constraint vehicles_model_check check (model is null or char_length(model) <= 60),
  constraint vehicles_capacity_check check (capacity_cylinders between 1 and 9999),
  constraint vehicles_load_check check (max_load_kg is null or max_load_kg > 0),
  constraint vehicles_status_check check (status in ('available', 'maintenance', 'inactive')),
  constraint vehicles_inactivation_check check (
    (status <> 'inactive' and inactivated_at is null and inactivated_by is null)
    or (status = 'inactive' and inactivated_at is not null))
);
create unique index vehicles_plate_idx on public.vehicles (organization_id, plate);
create index vehicles_list_idx on public.vehicles (organization_id, status, licensing_due_on);

-- 8. Motoristas (RF-024 a RF-028). CPF e CNH só mascarados aqui; os valores vivem em driver_documents.
create table public.drivers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  full_name text not null,
  phone text,
  cpf_display text not null,
  cnh_display text not null,
  cnh_category text not null,
  cnh_valid_until date not null,
  linked_user_id uuid references auth.users(id),
  status text not null default 'active',
  inactivated_at timestamptz,
  inactivated_by uuid references auth.users(id),
  anonymized_at timestamptz,
  anonymized_by uuid references auth.users(id),
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  constraint drivers_id_org_key unique (id, organization_id),
  constraint drivers_name_check check (char_length(btrim(full_name)) between 2 and 160),
  constraint drivers_phone_check check (phone is null or phone ~ '^[0-9]{10,11}$'),
  constraint drivers_display_check check (char_length(cpf_display) between 1 and 40 and char_length(cnh_display) between 1 and 40),
  constraint drivers_category_check check (cnh_category in ('A', 'B', 'C', 'D', 'E', 'AB', 'AC', 'AD', 'AE')),
  constraint drivers_status_check check (status in ('active', 'inactive')),
  constraint drivers_inactivation_check check (
    (status = 'active' and inactivated_at is null and inactivated_by is null)
    or (status = 'inactive' and inactivated_at is not null)),
  constraint drivers_anonymization_check check (
    (anonymized_at is null and anonymized_by is null)
    or (anonymized_at is not null and anonymized_by is not null and status = 'inactive' and linked_user_id is null and phone is null))
);
create index drivers_list_idx on public.drivers (organization_id, status, lower(full_name));
create index drivers_name_trgm_idx on public.drivers using gin (lower(full_name) extensions.gin_trgm_ops);
create unique index drivers_linked_user_idx on public.drivers (organization_id, linked_user_id) where linked_user_id is not null;

create table public.driver_documents (
  driver_id uuid primary key,
  organization_id uuid not null references public.organizations(id),
  cpf text,
  cnh_number text,
  anonymized_at timestamptz,
  constraint driver_documents_driver_fk foreign key (driver_id, organization_id) references public.drivers (id, organization_id),
  constraint driver_documents_cpf_check check (cpf is null or cpf ~ '^[0-9]{11}$'),
  constraint driver_documents_cnh_check check (cnh_number is null or cnh_number ~ '^[0-9]{11}$'),
  constraint driver_documents_anonymized_check check (
    (cpf is null) = (anonymized_at is not null) and (cnh_number is null) = (anonymized_at is not null)),
  constraint driver_documents_cpf_key unique (organization_id, cpf),
  constraint driver_documents_cnh_key unique (organization_id, cnh_number)
);

-- 9. Histórico imutável das cinco áreas (RF-036, RF-037). A ordem vem de `sequence`, atribuída sob bloqueio da linha da entidade.
create table public.registry_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  entity_type text not null,
  entity_id uuid not null,
  sequence integer not null,
  event_type text not null,
  actor_user_id uuid not null references auth.users(id),
  actor_session_id uuid,
  occurred_at timestamptz not null default now(),
  justification text,
  data jsonb not null default '{}'::jsonb,
  constraint registry_events_sequence_key unique (entity_type, entity_id, sequence),
  constraint registry_events_sequence_check check (sequence >= 1),
  constraint registry_events_entity_check check (entity_type in ('customer', 'site', 'geofence', 'vehicle', 'driver')),
  constraint registry_events_type_check check (event_type in (
    'customer_created', 'customer_updated', 'customer_inactivated', 'customer_reactivated', 'contacts_changed', 'document_changed',
    'site_created', 'site_updated', 'site_inactivated', 'site_reactivated',
    'geofence_created', 'geofence_updated', 'geofence_inactivated', 'geofence_reactivated',
    'vehicle_created', 'vehicle_updated', 'vehicle_status_changed',
    'driver_created', 'driver_updated', 'driver_inactivated', 'driver_reactivated', 'driver_user_linked', 'driver_user_unlinked',
    'document_revealed', 'person_anonymized', 'contact_anonymized')),
  constraint registry_events_justification_check check (justification is null or char_length(justification) <= 500),
  constraint registry_events_data_check check (not (data ?| array['password', 'token', 'secret', 'refresh_token']))
);
create index registry_events_page_idx on public.registry_events (organization_id, entity_type, entity_id, sequence desc);
create index registry_events_type_idx on public.registry_events (entity_type, entity_id, event_type, sequence desc);

-- 10. Gatilhos: imutabilidade, exclusão proibida (exceto a substituição de contatos), tipo de pessoa fixo, ano do veículo
-- e proteção das tabelas de documentos.
create function private.refuse_registry_mutation() returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception using errcode = 'P0001', message = 'registry_record_immutable';
end $$;

create function private.refuse_registry_delete() returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception using errcode = 'P0001', message = 'registry_record_undeletable';
end $$;

-- Contato: só sai quando update_customer liga a variável de sessão local; contato anonimizado nunca sai.
create function private.guard_contact_delete() returns trigger language plpgsql set search_path = '' as $$
begin
  if coalesce(current_setting('app.registry_contacts_replace', true), 'off') = 'on' and old.anonymized_at is null then
    return old;
  end if;
  raise exception using errcode = 'P0001', message = 'registry_record_undeletable';
end $$;

create function private.guard_customer_person_type() returns trigger language plpgsql set search_path = '' as $$
begin
  if new.person_type is distinct from old.person_type then
    raise exception using errcode = 'P0001', message = 'customer_person_type_immutable';
  end if;
  return new;
end $$;

-- Documentos: a anonimização não se desfaz e só as funções de anonimização anulam o documento.
create function private.guard_customer_document() returns trigger language plpgsql set search_path = '' as $$
begin
  if old.anonymized_at is not null and new.anonymized_at is null then
    raise exception using errcode = 'P0001', message = 'registry_anonymization_irreversible';
  end if;
  if new.anonymized_at is not null and old.anonymized_at is null and new.document_key is null
     and coalesce(current_setting('app.registry_anonymizing', true), 'off') <> 'on' then
    raise exception using errcode = 'P0001', message = 'registry_anonymization_not_allowed';
  end if;
  return new;
end $$;

create function private.guard_driver_document() returns trigger language plpgsql set search_path = '' as $$
begin
  if old.anonymized_at is not null and new.anonymized_at is null then
    raise exception using errcode = 'P0001', message = 'registry_anonymization_irreversible';
  end if;
  if new.anonymized_at is not null and old.anonymized_at is null and new.cpf is null and new.cnh_number is null
     and coalesce(current_setting('app.registry_anonymizing', true), 'off') <> 'on' then
    raise exception using errcode = 'P0001', message = 'registry_anonymization_not_allowed';
  end if;
  return new;
end $$;

-- Ano de fabricação do veículo: de 1980 até o ano seguinte ao atual (fuso de São Paulo).
create function private.validate_vehicle_year() returns trigger language plpgsql set search_path = '' as $$
begin
  if new.manufacture_year is not null
     and (new.manufacture_year < 1980
          or new.manufacture_year > extract(year from (now() at time zone 'America/Sao_Paulo'))::integer + 1) then
    raise exception using errcode = '23514', message = 'vehicle_manufacture_year_invalid';
  end if;
  return new;
end $$;

create trigger registry_events_immutable before update or delete on public.registry_events
  for each row execute function private.refuse_registry_mutation();
create trigger registry_events_no_truncate before truncate on public.registry_events
  for each statement execute function private.refuse_registry_mutation();

create trigger customers_no_delete before delete on public.customers for each row execute function private.refuse_registry_delete();
create trigger customers_no_truncate before truncate on public.customers for each statement execute function private.refuse_registry_delete();
create trigger customer_sites_no_delete before delete on public.customer_sites for each row execute function private.refuse_registry_delete();
create trigger customer_sites_no_truncate before truncate on public.customer_sites for each statement execute function private.refuse_registry_delete();
create trigger geofences_no_delete before delete on public.geofences for each row execute function private.refuse_registry_delete();
create trigger geofences_no_truncate before truncate on public.geofences for each statement execute function private.refuse_registry_delete();
create trigger vehicles_no_delete before delete on public.vehicles for each row execute function private.refuse_registry_delete();
create trigger vehicles_no_truncate before truncate on public.vehicles for each statement execute function private.refuse_registry_delete();
create trigger drivers_no_delete before delete on public.drivers for each row execute function private.refuse_registry_delete();
create trigger drivers_no_truncate before truncate on public.drivers for each statement execute function private.refuse_registry_delete();
create trigger customer_documents_no_delete before delete on public.customer_documents for each row execute function private.refuse_registry_delete();
create trigger customer_documents_no_truncate before truncate on public.customer_documents for each statement execute function private.refuse_registry_delete();
create trigger driver_documents_no_delete before delete on public.driver_documents for each row execute function private.refuse_registry_delete();
create trigger driver_documents_no_truncate before truncate on public.driver_documents for each statement execute function private.refuse_registry_delete();
create trigger customer_contacts_guard_delete before delete on public.customer_contacts for each row execute function private.guard_contact_delete();
create trigger customer_contacts_no_truncate before truncate on public.customer_contacts for each statement execute function private.refuse_registry_delete();

create trigger customers_person_type_fixed before update on public.customers for each row execute function private.guard_customer_person_type();
create trigger customer_documents_guard before update on public.customer_documents for each row execute function private.guard_customer_document();
create trigger driver_documents_guard before update on public.driver_documents for each row execute function private.guard_driver_document();
create trigger vehicles_validate_year before insert or update on public.vehicles for each row execute function private.validate_vehicle_year();

-- 11. Histórico: grava o evento com sequência contínua por entidade, sob bloqueio da linha da própria entidade.
create function private.append_registry_event(
  p_entity_type text, p_entity uuid, p_organization uuid, p_event_type text, p_actor uuid, p_session uuid,
  p_justification text, p_data jsonb)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  next_sequence integer;
  locked boolean := false;
begin
  if p_entity_type = 'customer' then
    perform 1 from public.customers x where x.id = p_entity and x.organization_id = p_organization for update;
  elsif p_entity_type = 'site' then
    perform 1 from public.customer_sites x where x.id = p_entity and x.organization_id = p_organization for update;
  elsif p_entity_type = 'geofence' then
    perform 1 from public.geofences x where x.id = p_entity and x.organization_id = p_organization for update;
  elsif p_entity_type = 'vehicle' then
    perform 1 from public.vehicles x where x.id = p_entity and x.organization_id = p_organization for update;
  elsif p_entity_type = 'driver' then
    perform 1 from public.drivers x where x.id = p_entity and x.organization_id = p_organization for update;
  else
    raise exception using errcode = 'P0002', message = 'registry_entity_type_invalid';
  end if;
  locked := found;
  if not locked then
    raise exception using errcode = 'P0002', message = 'registry_entity_not_found';
  end if;
  select coalesce(max(e.sequence), 0) + 1 into next_sequence
    from public.registry_events e where e.entity_type = p_entity_type and e.entity_id = p_entity;
  insert into public.registry_events (organization_id, entity_type, entity_id, sequence, event_type, actor_user_id, actor_session_id,
                                      justification, data)
  values (p_organization, p_entity_type, p_entity, next_sequence, p_event_type, p_actor, p_session, p_justification,
          coalesce(p_data, '{}'::jsonb));
  return next_sequence;
end $$;

revoke all on function private.geofence_limits(), private.document_expiring_days(), private.week_days_valid(smallint[]),
  private.validate_cpf(text), private.validate_cnpj(text), private.validate_cnh(text), private.normalize_plate(text),
  private.refuse_registry_mutation(), private.refuse_registry_delete(), private.guard_contact_delete(),
  private.guard_customer_person_type(), private.guard_customer_document(), private.guard_driver_document(),
  private.validate_vehicle_year(),
  private.append_registry_event(text, uuid, uuid, text, uuid, uuid, text, jsonb)
  from public, anon, authenticated;

-- 12. RLS: leitura por membro ativo com a permissão da área; nenhuma escrita direta para anon e authenticated.
-- As tabelas de documentos têm RLS ligada e nenhuma política, e nenhum privilégio.
alter table public.customers enable row level security;
alter table public.customer_documents enable row level security;
alter table public.customer_contacts enable row level security;
alter table public.customer_sites enable row level security;
alter table public.geofences enable row level security;
alter table public.vehicles enable row level security;
alter table public.drivers enable row level security;
alter table public.driver_documents enable row level security;
alter table public.registry_events enable row level security;

create policy customers_read on public.customers for select to authenticated
  using (private.has_permission(organization_id, 'customer.read'));
create policy customer_contacts_read on public.customer_contacts for select to authenticated
  using (private.has_permission(organization_id, 'customer.read'));
create policy customer_sites_read on public.customer_sites for select to authenticated
  using (private.has_permission(organization_id, 'customer.read'));
create policy geofences_read on public.geofences for select to authenticated
  using (private.has_permission(organization_id, 'geofence.read'));
create policy vehicles_read on public.vehicles for select to authenticated
  using (private.has_permission(organization_id, 'vehicle.read'));
create policy drivers_read on public.drivers for select to authenticated
  using (private.has_permission(organization_id, 'driver.read'));
create policy registry_events_read on public.registry_events for select to authenticated
  using (private.has_permission(organization_id, case entity_type
    when 'customer' then 'customer.history' when 'site' then 'customer.history'
    when 'geofence' then 'geofence.history' when 'vehicle' then 'vehicle.history' else 'driver.history' end));

revoke all on public.customers, public.customer_documents, public.customer_contacts, public.customer_sites, public.geofences,
  public.vehicles, public.drivers, public.driver_documents, public.registry_events from anon, authenticated;
grant select on public.customers, public.customer_contacts, public.customer_sites, public.geofences, public.vehicles,
  public.drivers, public.registry_events to authenticated;
