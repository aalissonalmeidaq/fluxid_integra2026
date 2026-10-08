-- Spec 007, mapa da Visão geral: pontos das unidades ativas com coordenadas, para quem pode ler clientes.
-- Devolve no máximo p_limit pontos (padrão 500, teto 1000) em ordem estável e o total, para a tela avisar quando houver mais.
-- Unidade de cliente inativo ou anonimizado e unidade sem coordenadas não entram.

create function public.list_site_points(p_actor uuid, p_session uuid, p_organization uuid, p_limit integer)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  denied text;
  v_limit integer := least(greatest(coalesce(p_limit, 500), 1), 1000);
  v_total bigint;
begin
  denied := private.cylinder_authorize(p_actor, p_session, p_organization, 'customer.read');
  if denied is not null then return jsonb_build_object('code', denied); end if;

  select count(*) into v_total
    from public.customer_sites s join public.customers c on c.id = s.customer_id
   where s.organization_id = p_organization and s.status = 'active' and c.status = 'active'
     and c.anonymized_at is null and s.latitude is not null and s.longitude is not null;

  return jsonb_build_object(
    'code', 'FOUND',
    'total', v_total,
    'items', coalesce((
      select jsonb_agg(page.item order by page.sort_name, page.id) from (
        select s.id, lower(s.name) as sort_name,
               jsonb_build_object(
                 'id', s.id, 'name', s.name, 'customer_id', c.id, 'customer_name', c.legal_name, 'city', s.city, 'state', s.state,
                 'latitude', s.latitude, 'longitude', s.longitude, 'confirmed', s.coordinates_confirmed_at is not null) as item
          from public.customer_sites s join public.customers c on c.id = s.customer_id
         where s.organization_id = p_organization and s.status = 'active' and c.status = 'active'
           and c.anonymized_at is null and s.latitude is not null and s.longitude is not null
         order by lower(s.name), s.id
         limit v_limit) page), '[]'::jsonb));
end $$;

revoke all on function public.list_site_points(uuid, uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.list_site_points(uuid, uuid, uuid, integer) to service_role;
