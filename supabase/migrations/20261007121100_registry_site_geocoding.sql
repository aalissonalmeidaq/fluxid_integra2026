-- Spec 007, RF-065 a RF-069: geocodificação do endereço da unidade com confirmação humana.
-- A unidade passa a guardar a origem das coordenadas (manual ou geocodificada), quem confirmou e quando, e o marcador da
-- primeira entrega (a reconfirmação do motorista pertence à Fase 4). As RPCs ganham o parâmetro opcional p_coordinates_source.

alter table public.customer_sites
  add column coordinates_source text,
  add column coordinates_confirmed_at timestamptz,
  add column coordinates_confirmed_by uuid references auth.users(id),
  add column first_delivery_confirmed boolean not null default false;

-- Unidades que já tinham coordenadas foram digitadas pela pessoa.
update public.customer_sites set coordinates_source = 'manual' where latitude is not null;

alter table public.customer_sites
  add constraint customer_sites_coordinates_source_check check (coordinates_source is null or coordinates_source in ('manual', 'geocoded')),
  add constraint customer_sites_coordinates_confirmation_check check (
    (coordinates_confirmed_at is null and coordinates_confirmed_by is null)
    or (coordinates_source = 'geocoded' and coordinates_confirmed_at is not null and coordinates_confirmed_by is not null));

-- Sem coordenadas não há origem nem confirmação (também cobre a anonimização, que remove as coordenadas).
create function private.guard_site_coordinates() returns trigger language plpgsql set search_path = '' as $$
begin
  if new.latitude is null then
    new.coordinates_source := null;
    new.coordinates_confirmed_at := null;
    new.coordinates_confirmed_by := null;
  end if;
  return new;
end $$;
create trigger customer_sites_coordinates_guard before insert or update on public.customer_sites
  for each row execute function private.guard_site_coordinates();
revoke all on function private.guard_site_coordinates() from public, anon, authenticated;

drop function public.create_site(uuid, uuid, uuid, uuid, text, text, text, text, text, text, text, text, text, numeric, numeric, text, text, smallint[], time, time, text);
drop function public.update_site(uuid, uuid, uuid, uuid, bigint, text, text, text, text, text, text, text, text, text, numeric, numeric, text, text, smallint[], time, time, text);

create or replace function private.site_json(s public.customer_sites, c public.customers) returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', s.id, 'customer_id', s.customer_id, 'customer_name', c.legal_name, 'customer_status', c.status, 'name', s.name, 'postal_code', s.postal_code,
    'street', s.street, 'number', s.number, 'complement', s.complement, 'district', s.district, 'city', s.city, 'state', s.state,
    'ibge_code', s.ibge_code, 'latitude', s.latitude, 'longitude', s.longitude, 'receiving_contact_name', s.receiving_contact_name,
    'receiving_contact_phone', s.receiving_contact_phone, 'receiving_days', coalesce(to_jsonb(s.receiving_days), '[]'::jsonb),
    'receiving_from', s.receiving_from, 'receiving_to', s.receiving_to, 'access_instructions', s.access_instructions, 'status', s.status,
    'version', s.version, 'anonymized_at', c.anonymized_at,
    'coordinates_source', s.coordinates_source, 'coordinates_confirmed_at', s.coordinates_confirmed_at,
    'first_delivery_confirmed', s.first_delivery_confirmed)
$$;

create function public.create_site(
  p_actor uuid, p_session uuid, p_organization uuid, p_customer uuid, p_name text, p_postal_code text, p_street text, p_number text,
  p_complement text, p_district text, p_city text, p_state text, p_ibge_code text, p_latitude numeric, p_longitude numeric,
  p_receiving_contact_name text, p_receiving_contact_phone text, p_receiving_days smallint[], p_receiving_from time, p_receiving_to time,
  p_access_instructions text, p_coordinates_source text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  denied text;
  errors jsonb;
  v_cust public.customers;
  v_name text := btrim(coalesce(p_name, ''));
  v_site uuid;
  v_source text := nullif(btrim(coalesce(p_coordinates_source, '')), '');
  v_final_source text;
begin
  denied := private.cylinder_authorize(p_actor, p_session, p_organization, 'customer.write');
  if denied is not null then return jsonb_build_object('code', denied); end if;
  -- Trava o cliente em modo compartilhado: uma inativação em cascata concorrente espera esta criação (e conta a unidade nova) ou é esperada
  -- por ela (e então a unidade é recusada), de modo que nunca sobra unidade ativa sob cliente inativo.
  select c.* into v_cust from public.customers c where c.id = p_customer and c.organization_id = p_organization for share;
  if not found then return jsonb_build_object('code', 'NOT_FOUND'); end if;
  if v_cust.anonymized_at is not null then return jsonb_build_object('code', 'ANONYMIZED_RECORD'); end if;
  if v_cust.status <> 'active' then return jsonb_build_object('code', 'PARENT_INACTIVE'); end if;

  errors := private.validate_site_fields(v_name, p_postal_code, btrim(coalesce(p_street, '')), btrim(coalesce(p_number, '')),
    nullif(btrim(coalesce(p_complement, '')), ''), nullif(btrim(coalesce(p_district, '')), ''), btrim(coalesce(p_city, '')), p_state, p_ibge_code,
    p_latitude, p_longitude, nullif(btrim(coalesce(p_receiving_contact_name, '')), ''), p_receiving_contact_phone, p_receiving_days,
    p_receiving_from, p_receiving_to, nullif(btrim(coalesce(p_access_instructions, '')), ''));
  if v_source is not null and v_source not in ('manual', 'geocoded') then
    errors := errors || private.field_error('coordinates_source', 'Origem das coordenadas inválida.');
  elsif v_source = 'geocoded' and p_latitude is null then
    errors := errors || private.field_error('coordinates_source', 'Coordenadas geocodificadas exigem latitude e longitude.');
  end if;
  if jsonb_array_length(errors) > 0 then
    return jsonb_build_object('code', 'VALIDATION_FAILED', 'fields', errors);
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_customer::text || ':site-name:' || lower(v_name), 0));
  if exists (select 1 from public.customer_sites s where s.customer_id = p_customer and lower(btrim(s.name)) = lower(v_name)) then
    return jsonb_build_object('code', 'NAME_CONFLICT');
  end if;

  v_final_source := case when p_latitude is null then null when v_source = 'geocoded' then 'geocoded' else 'manual' end;
  insert into public.customer_sites (organization_id, customer_id, name, postal_code, street, number, complement, district, city, state, ibge_code,
    latitude, longitude, receiving_contact_name, receiving_contact_phone, receiving_days, receiving_from, receiving_to, access_instructions, created_by,
    coordinates_source, coordinates_confirmed_at, coordinates_confirmed_by)
  values (p_organization, p_customer, v_name, p_postal_code, btrim(p_street), btrim(p_number), nullif(btrim(coalesce(p_complement, '')), ''),
    nullif(btrim(coalesce(p_district, '')), ''), btrim(p_city), p_state, p_ibge_code, p_latitude, p_longitude,
    nullif(btrim(coalesce(p_receiving_contact_name, '')), ''), p_receiving_contact_phone, p_receiving_days, p_receiving_from, p_receiving_to,
    nullif(btrim(coalesce(p_access_instructions, '')), ''), p_actor,
    v_final_source, case when v_final_source = 'geocoded' then now() end, case when v_final_source = 'geocoded' then p_actor end)
  returning id into v_site;

  -- O nome da unidade de pessoa física é dado pessoal e não entra no evento; o de pessoa jurídica também fica só no cadastro.
  perform private.append_registry_event('site', v_site, p_organization, 'site_created', p_actor, p_session, null,
    jsonb_build_object('customer_id', p_customer, 'state', p_state, 'coordinates_source', v_final_source, 'coordinates_confirmed', v_final_source = 'geocoded'));
  perform private.write_audit_event(p_organization, p_actor, p_session, 'site.create', 'site', v_site::text, 'success', null, null,
    jsonb_build_object('site_id', v_site, 'customer_id', p_customer, 'coordinates_source', v_final_source, 'coordinates_confirmed', v_final_source = 'geocoded'));
  return jsonb_build_object('code', 'CREATED', 'site_id', v_site, 'version', 1);
end $$;

create function public.update_site(
  p_actor uuid, p_session uuid, p_organization uuid, p_site uuid, p_expected_version bigint, p_name text, p_postal_code text, p_street text,
  p_number text, p_complement text, p_district text, p_city text, p_state text, p_ibge_code text, p_latitude numeric, p_longitude numeric,
  p_receiving_contact_name text, p_receiving_contact_phone text, p_receiving_days smallint[], p_receiving_from time, p_receiving_to time,
  p_access_instructions text, p_coordinates_source text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  denied text;
  errors jsonb;
  v_site public.customer_sites;
  v_person text;
  v_name text := btrim(coalesce(p_name, ''));
  v_street text := btrim(coalesce(p_street, ''));
  v_number text := btrim(coalesce(p_number, ''));
  v_complement text := nullif(btrim(coalesce(p_complement, '')), '');
  v_district text := nullif(btrim(coalesce(p_district, '')), '');
  v_city text := btrim(coalesce(p_city, ''));
  v_contact_name text := nullif(btrim(coalesce(p_receiving_contact_name, '')), '');
  v_access text := nullif(btrim(coalesce(p_access_instructions, '')), '');
  changes jsonb := '[]'::jsonb;
  sensitive jsonb := '[]'::jsonb;
  v_new_version bigint;
  v_source text := nullif(btrim(coalesce(p_coordinates_source, '')), '');
  v_final_source text;
  v_confirmed_at timestamptz;
  v_confirmed_by uuid;
  v_coords_changed boolean;
  v_address_changed boolean;
begin
  denied := private.cylinder_authorize(p_actor, p_session, p_organization, 'customer.write');
  if denied is not null then return jsonb_build_object('code', denied); end if;
  select s.* into v_site from public.customer_sites s where s.id = p_site and s.organization_id = p_organization for update;
  if not found then return jsonb_build_object('code', 'NOT_FOUND'); end if;
  if exists (select 1 from public.customers c where c.id = v_site.customer_id and c.anonymized_at is not null) then return jsonb_build_object('code', 'ANONYMIZED_RECORD'); end if;
  if v_site.version <> p_expected_version then return jsonb_build_object('code', 'VERSION_CONFLICT'); end if;
  if v_site.status <> 'active' then return jsonb_build_object('code', 'INACTIVE_RECORD'); end if;

  errors := private.validate_site_fields(v_name, p_postal_code, v_street, v_number, v_complement, v_district, v_city, p_state, p_ibge_code,
    p_latitude, p_longitude, v_contact_name, p_receiving_contact_phone, p_receiving_days, p_receiving_from, p_receiving_to, v_access);
  if v_source is not null and v_source not in ('manual', 'geocoded') then
    errors := errors || private.field_error('coordinates_source', 'Origem das coordenadas inválida.');
  elsif v_source = 'geocoded' and p_latitude is null then
    errors := errors || private.field_error('coordinates_source', 'Coordenadas geocodificadas exigem latitude e longitude.');
  end if;
  if jsonb_array_length(errors) > 0 then
    return jsonb_build_object('code', 'VALIDATION_FAILED', 'fields', errors);
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_site.customer_id::text || ':site-name:' || lower(v_name), 0));
  if exists (select 1 from public.customer_sites s where s.customer_id = v_site.customer_id and s.id <> p_site and lower(btrim(s.name)) = lower(v_name)) then
    return jsonb_build_object('code', 'NAME_CONFLICT');
  end if;

  -- Em unidade de cliente pessoa física todo campo é pessoal (o evento só cita o nome do campo); em cliente jurídico, só o
  -- responsável pelo recebimento e seu telefone são pessoais.
  select c.person_type into v_person from public.customers c where c.id = v_site.customer_id;
  declare
    pair record;
    personal boolean;
  begin
    for pair in
      select * from (values
        ('name', v_site.name, v_name, false), ('postal_code', v_site.postal_code, p_postal_code, false), ('street', v_site.street, v_street, false),
        ('number', v_site.number, v_number, false), ('complement', v_site.complement, v_complement, false), ('district', v_site.district, v_district, false),
        ('city', v_site.city, v_city, false), ('state', v_site.state, p_state, false), ('ibge_code', v_site.ibge_code, p_ibge_code, false),
        ('latitude', v_site.latitude::text, p_latitude::text, false), ('longitude', v_site.longitude::text, p_longitude::text, false),
        ('receiving_contact_name', v_site.receiving_contact_name, v_contact_name, true),
        ('receiving_contact_phone', v_site.receiving_contact_phone, p_receiving_contact_phone, true),
        ('receiving_days', v_site.receiving_days::text, p_receiving_days::text, false),
        ('receiving_from', v_site.receiving_from::text, p_receiving_from::text, false), ('receiving_to', v_site.receiving_to::text, p_receiving_to::text, false),
        ('access_instructions', v_site.access_instructions, v_access, false)
      ) as t(field, old_value, new_value, always_personal)
      where t.old_value is distinct from t.new_value
    loop
      personal := pair.always_personal or v_person = 'individual';
      if personal then sensitive := sensitive || to_jsonb(pair.field::text);
      else changes := changes || jsonb_build_array(jsonb_build_object('field', pair.field, 'old', pair.old_value, 'new', pair.new_value)); end if;
    end loop;
  end;

  -- Origem e confirmação das coordenadas (RF-066): confirmar grava quem e quando; mudar as coordenadas à mão torna a origem manual;
  -- mudar o endereço sem nova confirmação descarta a confirmação anterior.
  v_coords_changed := (v_site.latitude, v_site.longitude) is distinct from (p_latitude, p_longitude);
  v_address_changed := (v_site.postal_code, v_site.street, v_site.number, v_site.district, v_site.city, v_site.state)
    is distinct from (p_postal_code, v_street, v_number, v_district, v_city, p_state);
  v_final_source := v_site.coordinates_source;
  v_confirmed_at := v_site.coordinates_confirmed_at;
  v_confirmed_by := v_site.coordinates_confirmed_by;
  if p_latitude is null then
    v_final_source := null; v_confirmed_at := null; v_confirmed_by := null;
  elsif v_source = 'geocoded' and (v_coords_changed or v_address_changed or v_confirmed_at is null) then
    v_final_source := 'geocoded'; v_confirmed_at := now(); v_confirmed_by := p_actor;
  elsif v_coords_changed then
    v_final_source := 'manual'; v_confirmed_at := null; v_confirmed_by := null;
  elsif v_address_changed then
    v_confirmed_at := null; v_confirmed_by := null;
  end if;

  update public.customer_sites
     set name = v_name, postal_code = p_postal_code, street = v_street, number = v_number, complement = v_complement, district = v_district,
         city = v_city, state = p_state, ibge_code = p_ibge_code, latitude = p_latitude, longitude = p_longitude,
         receiving_contact_name = v_contact_name, receiving_contact_phone = p_receiving_contact_phone, receiving_days = p_receiving_days,
         receiving_from = p_receiving_from, receiving_to = p_receiving_to, access_instructions = v_access,
         coordinates_source = v_final_source, coordinates_confirmed_at = v_confirmed_at, coordinates_confirmed_by = v_confirmed_by,
         version = version + 1, updated_at = now()
   where id = p_site
   returning version into v_new_version;

  perform private.append_registry_event('site', p_site, p_organization, 'site_updated', p_actor, p_session, null,
    jsonb_build_object('changes', changes, 'changed_sensitive', sensitive, 'coordinates_source', v_final_source, 'coordinates_confirmed', v_confirmed_at is not null));
  perform private.write_audit_event(p_organization, p_actor, p_session, 'site.update', 'site', p_site::text, 'success', null, null,
    jsonb_build_object('site_id', p_site, 'customer_id', v_site.customer_id, 'coordinates_source', v_final_source, 'coordinates_confirmed', v_confirmed_at is not null));
  return jsonb_build_object('code', 'UPDATED', 'version', v_new_version);
end $$;

revoke all on function public.create_site(uuid, uuid, uuid, uuid, text, text, text, text, text, text, text, text, text, numeric, numeric, text, text, smallint[], time, time, text, text), public.update_site(uuid, uuid, uuid, uuid, bigint, text, text, text, text, text, text, text, text, text, numeric, numeric, text, text, smallint[], time, time, text, text) from public, anon, authenticated;
grant execute on function public.create_site(uuid, uuid, uuid, uuid, text, text, text, text, text, text, text, text, text, numeric, numeric, text, text, smallint[], time, time, text, text), public.update_site(uuid, uuid, uuid, uuid, bigint, text, text, text, text, text, text, text, text, text, numeric, numeric, text, text, smallint[], time, time, text, text) to service_role;
