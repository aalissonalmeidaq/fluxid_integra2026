-- Spec 004: consulta somente leitura das próprias permissões, para o menu de navegação decidir o que mostrar.
-- Não cria tabela, coluna nem política. Não grava auditoria (RF-023). A decisão de acesso de cada tela continua nas funções existentes.

-- Códigos distintos e ordenados das permissões ativas, de papéis ativos, do vínculo ativo da pessoa em uma organização ativa.
-- Mesmo critério de private.actor_has_permission, sem filtrar pelo escopo do código: audit.read tem escopo tenant, mas o papel
-- global o concede na organização proprietária e isso autoriza a auditoria da plataforma.
create function private.actor_permission_codes(p_actor uuid, p_organization uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(c.code order by c.code), '[]'::jsonb)
  from (
    select distinct p.code
    from public.memberships m
    join public.organizations o on o.id = m.organization_id and o.status = 'active'
    join public.membership_roles mr on mr.membership_id = m.id
    join public.roles r on r.id = mr.role_id and r.active
    join public.role_permissions rp on rp.role_id = r.id
    join public.permissions p on p.id = rp.permission_id and p.active
    where m.user_id = p_actor and m.organization_id = p_organization and m.status = 'active'
  ) c
$$;

revoke all on function private.actor_permission_codes(uuid, uuid) from public, anon, authenticated;

create function public.get_actor_permissions(p_actor uuid, p_session uuid, p_organization uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  owner_id uuid;
begin
  -- Sessão vigente pelo mesmo critério de public.tenant_actor_authorized: ativa, não expirada, atividade em até 30 minutos.
  if not exists (
    select 1 from public.user_sessions s
    where s.user_id = p_actor and s.session_id = p_session and s.status = 'active'
      and s.expires_at > now() and s.last_seen_at > now() - interval '30 minutes'
  ) then
    return jsonb_build_object('kind', 'access_denied');
  end if;

  select o.id into owner_id from public.organizations o where o.kind = 'owner' and o.status = 'active' limit 1;

  return jsonb_build_object(
    'kind', 'listed',
    'tenant', case when p_organization is null then '[]'::jsonb else private.actor_permission_codes(p_actor, p_organization) end,
    'global', case when owner_id is null then '[]'::jsonb else private.actor_permission_codes(p_actor, owner_id) end
  );
end $$;

revoke all on function public.get_actor_permissions(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.get_actor_permissions(uuid, uuid, uuid) to service_role;
