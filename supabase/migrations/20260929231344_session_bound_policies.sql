-- Correção e endurecimento das políticas RLS da fundação:
-- 1. `authenticated` não podia executar os helpers privados usados pelas políticas, então nenhum usuário real leria dados.
-- 2. Os helpers passam a security definer com search_path fixo para não recursar nas próprias políticas.
-- 3. Todo acesso passa a exigir uma sessão de governança ativa (RF-004, RS-008, RS-012): revogação, expiração
--    e inatividade valem imediatamente para a Data API, sem esperar o vencimento do JWT.
-- O schema `private` não é exposto pela Data API; o EXECUTE concedido serve somente à avaliação das políticas.

create or replace function private.has_active_session() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.user_sessions s
     where s.user_id = (select auth.uid())
       and s.session_id = nullif((select auth.jwt() ->> 'session_id'), '')::uuid
       and s.status = 'active'
       and s.expires_at > now()
       and s.last_seen_at > now() - interval '30 minutes');
$$;

create or replace function private.is_active_member(requested_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select (select private.has_active_session())
     and exists (
       select 1 from public.memberships m
         join public.organizations o on o.id = m.organization_id
        where m.organization_id = requested_org
          and m.user_id = (select auth.uid())
          and m.status = 'active'
          and o.status = 'active');
$$;

create or replace function private.has_permission(requested_org uuid, requested_permission text) returns boolean
language sql stable security definer set search_path = '' as $$
  select (select private.has_active_session())
     and exists (
       select 1 from public.memberships m
         join public.organizations o on o.id = m.organization_id and o.status = 'active'
         join public.membership_roles mr on mr.membership_id = m.id
         join public.role_permissions rp on rp.role_id = mr.role_id
         join public.permissions p on p.id = rp.permission_id
        where m.organization_id = requested_org
          and m.user_id = (select auth.uid())
          and m.status = 'active'
          and p.code = requested_permission
          and p.active);
$$;

grant usage on schema private to authenticated;
revoke all on function private.has_active_session() from public, anon;
revoke all on function private.is_active_member(uuid) from public, anon;
revoke all on function private.has_permission(uuid, text) from public, anon;
grant execute on function private.has_active_session() to authenticated;
grant execute on function private.is_active_member(uuid) to authenticated;
grant execute on function private.has_permission(uuid, text) to authenticated;

drop policy profiles_self_select on public.profiles;
drop policy profiles_self_update on public.profiles;
drop policy memberships_own on public.memberships;
drop policy membership_roles_own on public.membership_roles;
drop policy sessions_own on public.user_sessions;
drop policy permissions_authenticated on public.permissions;
drop policy role_permissions_authenticated on public.role_permissions;

create policy profiles_self_select on public.profiles for select to authenticated
  using ((select auth.uid()) = user_id and (select private.has_active_session()));
create policy profiles_self_update on public.profiles for update to authenticated
  using ((select auth.uid()) = user_id and (select private.has_active_session()))
  with check ((select auth.uid()) = user_id and (select private.has_active_session()));
create policy memberships_own on public.memberships for select to authenticated
  using (user_id = (select auth.uid()) and (select private.has_active_session()));
create policy membership_roles_own on public.membership_roles for select to authenticated
  using ((select private.has_active_session())
         and exists (select 1 from public.memberships m
                      where m.id = membership_id and m.user_id = (select auth.uid())));
create policy sessions_own on public.user_sessions for select to authenticated
  using (user_id = (select auth.uid()) and (select private.has_active_session()));
create policy permissions_authenticated on public.permissions for select to authenticated
  using ((select private.has_active_session()));
create policy role_permissions_authenticated on public.role_permissions for select to authenticated
  using ((select private.has_active_session()));
