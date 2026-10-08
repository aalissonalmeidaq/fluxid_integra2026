-- Cache server-side da geocodificação do protótipo (Nominatim). Integração TEMPORÁRIA: a tabela e as funções saem junto com
-- o provedor público quando o protótipo for substituído (docs/geocodificacao-prototipo.md).
-- Isolamento entre tenants: toda linha tem organization_id e a leitura/escrita sempre filtra por ele; a chave é o hash SHA-256 do
-- endereço normalizado. A tabela fica em schema privado, com RLS ligada e sem política (nenhuma função de cliente a enxerga);
-- só o servidor (service_role) usa as duas funções abaixo. Retenção: definida por GEOCODING_CACHE_TTL_DAYS (1 a 90 dias, padrão 30); entradas vencidas nunca são devolvidas e são
-- apagadas a cada escrita da mesma organização.

create table private.geocode_cache (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  address_key text not null,
  location jsonb not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  primary key (organization_id, address_key),
  constraint geocode_cache_key_check check (address_key ~ '^[0-9a-f]{64}$'),
  constraint geocode_cache_location_check check (
    jsonb_typeof(location) = 'object' and location ? 'latitude' and location ? 'longitude' and location ? 'precision')
);
create index geocode_cache_expires_idx on private.geocode_cache (organization_id, expires_at);

alter table private.geocode_cache enable row level security;
revoke all on private.geocode_cache from public, anon, authenticated;

create function public.read_geocode_cache(p_organization uuid, p_key text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select c.location from private.geocode_cache c
   where c.organization_id = p_organization and c.address_key = p_key and c.expires_at > now()
$$;

create function public.write_geocode_cache(p_organization uuid, p_key text, p_location jsonb, p_ttl_days integer default 30) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_ttl_days is null or p_ttl_days not between 1 and 90 then
    raise exception using errcode = '22023', message = 'invalid_geocode_cache_ttl';
  end if;
  delete from private.geocode_cache where organization_id = p_organization and expires_at <= now();
  insert into private.geocode_cache (organization_id, address_key, location, expires_at)
  values (p_organization, p_key, p_location, now() + make_interval(days => p_ttl_days))
  on conflict (organization_id, address_key)
  do update set location = excluded.location, created_at = now(), expires_at = excluded.expires_at;
end $$;

revoke all on function public.read_geocode_cache(uuid, text), public.write_geocode_cache(uuid, text, jsonb, integer) from public, anon, authenticated;
grant execute on function public.read_geocode_cache(uuid, text), public.write_geocode_cache(uuid, text, jsonb, integer) to service_role;
