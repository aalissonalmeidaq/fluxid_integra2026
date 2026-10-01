-- Listagem de vínculos e papéis atribuíveis do tenant, restrita ao ator autorizado no próprio tenant.
create function public.list_tenant_members(p_actor uuid, p_session uuid, p_organization uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.tenant_actor_authorized(p_actor, p_session, p_organization) then
    return jsonb_build_object('kind', 'access_denied');
  end if;
  return jsonb_build_object(
    'kind', 'listed',
    'members', coalesce((
      select jsonb_agg(jsonb_build_object('id', x.id, 'display_name', x.display_name, 'email', x.email, 'status', x.status, 'version', x.version) order by x.created_at, x.id)
      from (
        select m.id, coalesce(p.display_name, '') as display_name, u.email::text as email, m.status, m.version, m.created_at
        from public.memberships m
        join auth.users u on u.id = m.user_id
        left join public.profiles p on p.user_id = m.user_id
        where m.organization_id = p_organization
        order by m.created_at, m.id
        limit 100
      ) x), '[]'::jsonb),
    'roles', coalesce((
      select jsonb_agg(jsonb_build_object('id', r.id, 'name', r.name) order by r.name, r.id)
      from public.roles r
      where r.organization_id = p_organization and r.scope = 'tenant' and r.active), '[]'::jsonb));
end $$;

revoke all on function public.list_tenant_members(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.list_tenant_members(uuid, uuid, uuid) to service_role;
