-- Consulta de auditoria por escopo (tenant e global), paginada por (occurred_at, id), com permissão atual do ator.
-- Corrige também a autorização por papel: papel inativado deixava de ser considerado só no domínio, mas as funções
-- de banco e as políticas RLS continuavam a honrá-lo (RN-012). AUD-003, AUD-004, AUD-007, ISO-006.

-- 1. Origem técnica minimizada do evento: qual fronteira o produziu, sem endereço, agente de usuário nem dado pessoal.
alter table public.audit_logs
  add column origin text not null default 'database',
  add constraint audit_logs_origin_check check (origin ~ '^[a-z0-9_.:-]{1,64}$');

-- 2. Papel inativado não concede permissão: RLS e funções de gestão passam a exigir `roles.active`.
create or replace function private.has_permission(requested_org uuid, requested_permission text) returns boolean
language sql stable security definer set search_path = '' as $$
  select (select private.has_active_session())
     and exists (
       select 1 from public.memberships m
         join public.organizations o on o.id = m.organization_id and o.status = 'active'
         join public.membership_roles mr on mr.membership_id = m.id
         join public.roles r on r.id = mr.role_id and r.active
         join public.role_permissions rp on rp.role_id = r.id
         join public.permissions p on p.id = rp.permission_id
        where m.organization_id = requested_org
          and m.user_id = (select auth.uid())
          and m.status = 'active'
          and p.code = requested_permission
          and p.active);
$$;

create or replace function public.tenant_actor_authorized(p_actor uuid, p_session uuid, p_organization uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(
    select 1 from public.user_sessions s
    join public.memberships m on m.user_id = s.user_id and m.organization_id = p_organization and m.status = 'active'
    join public.organizations o on o.id = m.organization_id and o.status = 'active'
    join public.membership_roles mr on mr.membership_id = m.id
    join public.roles r on r.id = mr.role_id and r.active
    join public.role_permissions rp on rp.role_id = r.id
    join public.permissions p on p.id = rp.permission_id and p.code = 'tenant.manage' and p.active
    where s.user_id = p_actor and s.session_id = p_session and s.status = 'active' and s.expires_at > now()
      and s.last_seen_at > now() - interval '30 minutes'
  )
$$;

-- 3. Autorização de um ator governado por sessão (as fronteiras servidor não têm auth.uid()): sessão vigente, vínculo
--    ativo, organização ativa, papel ativo e permissão ativa, avaliados no momento da chamada.
create function private.actor_has_permission(p_actor uuid, p_session uuid, p_organization uuid, p_permission text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(
    select 1 from public.user_sessions s
    join public.memberships m on m.user_id = s.user_id and m.organization_id = p_organization and m.status = 'active'
    join public.organizations o on o.id = m.organization_id and o.status = 'active'
    join public.membership_roles mr on mr.membership_id = m.id
    join public.roles r on r.id = mr.role_id and r.active
    join public.role_permissions rp on rp.role_id = r.id
    join public.permissions p on p.id = rp.permission_id and p.code = p_permission and p.active
    where s.user_id = p_actor and s.session_id = p_session and s.status = 'active' and s.expires_at > now()
      and s.last_seen_at > now() - interval '30 minutes'
  )
$$;

revoke all on function private.actor_has_permission(uuid, uuid, uuid, text) from public, anon, authenticated;

-- 4. Consulta. Escopo `tenant`: `audit.read` no tenant solicitado. Escopo `global`: `audit.read` na organização
--    proprietária (Master e Administrador FluxID); a própria consulta global é auditada (ISO-006).
create function public.query_audit_events(
  p_actor uuid, p_session uuid, p_scope text, p_organization uuid,
  p_from timestamptz, p_to timestamptz, p_action text, p_result text, p_actor_filter uuid, p_target_type text,
  p_before_at timestamptz, p_before_id bigint, p_limit integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  effective_limit integer := least(greatest(coalesce(p_limit, 50), 1), 100);
  authorized boolean;
  fetched jsonb;
  has_more boolean;
  page jsonb;
  last_event jsonb;
begin
  if p_scope not in ('tenant', 'global')
     or (p_scope = 'tenant' and p_organization is null)
     or (p_result is not null and p_result not in ('success', 'denied', 'failed'))
     or (p_action is not null and p_action !~ '^[a-z0-9_.]{1,64}$')
     or (p_target_type is not null and p_target_type !~ '^[a-z0-9_]{1,40}$')
     or ((p_before_at is null) <> (p_before_id is null))
     or (p_from is not null and p_to is not null and p_from > p_to) then
    return jsonb_build_object('kind', 'invalid');
  end if;

  if p_scope = 'tenant' then
    authorized := private.actor_has_permission(p_actor, p_session, p_organization, 'audit.read');
  else
    authorized := exists (
      select 1 from public.organizations o
       where o.kind = 'owner' and private.actor_has_permission(p_actor, p_session, o.id, 'audit.read'));
  end if;
  if not authorized then
    return jsonb_build_object('kind', 'access_denied');
  end if;

  if p_scope = 'global' then
    perform private.write_audit_event(null, p_actor, p_session, 'audit.query.global', 'audit', 'events', 'success', null, null,
      jsonb_build_object('scope', 'global'));
  end if;

  select coalesce(jsonb_agg(to_jsonb(r) order by r.occurred_at desc, r.id desc), '[]'::jsonb) into fetched
  from (
    select a.id, a.organization_id, a.actor_user_id, pr.display_name as actor_name, a.action, a.target_type, a.target_id,
           a.result, a.reason_code, a.justification, a.origin, a.occurred_at,
           (select coalesce(jsonb_object_agg(m.key, m.value), '{}'::jsonb)
              from jsonb_each(a.metadata) m
             where m.key in ('permissions', 'version', 'status', 'role_id', 'reason', 'scope')) as metadata
      from public.audit_logs a
      left join public.profiles pr on pr.user_id = a.actor_user_id
     where (p_scope = 'global' or a.organization_id = p_organization)
       and (p_from is null or a.occurred_at >= p_from)
       and (p_to is null or a.occurred_at <= p_to)
       and (p_action is null or a.action = p_action)
       and (p_result is null or a.result = p_result)
       and (p_actor_filter is null or a.actor_user_id = p_actor_filter)
       and (p_target_type is null or a.target_type = p_target_type)
       and (p_before_at is null or (a.occurred_at, a.id) < (p_before_at, p_before_id))
     order by a.occurred_at desc, a.id desc
     limit effective_limit + 1
  ) r;

  has_more := jsonb_array_length(fetched) > effective_limit;
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', e->'id', 'organization_id', e->'organization_id',
      'actor', jsonb_build_object('id', e->'actor_user_id', 'display_name', e->'actor_name'),
      'action', e->'action', 'target_type', e->'target_type', 'target_id', e->'target_id',
      'result', e->'result', 'reason_code', e->'reason_code', 'justification', e->'justification',
      'origin', e->'origin', 'occurred_at', e->'occurred_at', 'metadata', e->'metadata') order by t.n), '[]'::jsonb)
    into page
    from jsonb_array_elements(fetched) with ordinality as t(e, n)
   where t.n <= effective_limit;

  last_event := case when has_more then page->(effective_limit - 1) else null end;
  return jsonb_build_object(
    'kind', 'listed',
    'events', page,
    'next', case when has_more then jsonb_build_object('occurred_at', last_event->'occurred_at', 'id', last_event->'id') else null end);
end $$;

revoke all on function public.query_audit_events(uuid, uuid, text, uuid, timestamptz, timestamptz, text, text, uuid, text, timestamptz, bigint, integer)
  from public, anon, authenticated;
grant execute on function public.query_audit_events(uuid, uuid, text, uuid, timestamptz, timestamptz, text, text, uuid, text, timestamptz, bigint, integer)
  to service_role;
