-- Retenção e anonimização efetivas (RN-013, AUD-008, AUD-009): auditoria por 5 anos, convites terminais por 90 dias e perfis
-- inativos anonimizados após 2 anos, sempre suspensos por retenção legal documentada. A auditoria continua imutável para
-- a aplicação: somente a rotina de retenção, para eventos com mais de 5 anos e sem retenção legal, pode descartá-la.

-- 1. Retenções legais: escopo global, por organização ou por pessoa. Tabela privada, sem acesso da aplicação.
create table private.retention_holds (
  id uuid primary key default gen_random_uuid(),
  scope text not null,
  organization_id uuid references public.organizations (id) on delete restrict,
  user_id uuid references auth.users (id) on delete restrict,
  reason text not null,
  created_by uuid references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  released_at timestamptz,
  released_by uuid references auth.users (id) on delete restrict,
  constraint retention_holds_scope_check check (
    (scope = 'global' and organization_id is null and user_id is null)
    or (scope = 'organization' and organization_id is not null and user_id is null)
    or (scope = 'user' and user_id is not null and organization_id is null)),
  constraint retention_holds_reason_check check (char_length(btrim(reason)) between 10 and 500)
);
create index retention_holds_active_idx on private.retention_holds (scope, organization_id, user_id) where released_at is null;
create index retention_holds_created_by_idx on private.retention_holds (created_by);
create index retention_holds_released_by_idx on private.retention_holds (released_by);
create index retention_holds_user_idx on private.retention_holds (user_id);
create index retention_holds_org_idx on private.retention_holds (organization_id);

-- Objetos do Storage não podem ser removidos por SQL sem deixar o arquivo órfão: a rotina enfileira e uma função servidor
-- remove pelo Storage API.
create table private.storage_cleanup_queue (
  path text primary key,
  bucket text not null default 'avatars',
  enqueued_at timestamptz not null default now()
);

create function private.retention_held(p_organization uuid, p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from private.retention_holds h
     where h.released_at is null
       and (h.scope = 'global'
            or (h.scope = 'organization' and h.organization_id is not distinct from p_organization and p_organization is not null)
            or (h.scope = 'user' and h.user_id is not distinct from p_user and p_user is not null)));
$$;

-- 2. Auditoria: imutável para a aplicação; a exclusão só vale dentro da rotina de retenção e para mais de 5 anos.
create or replace function private.prevent_audit_mutation()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op = 'DELETE'
     and coalesce(current_setting('app.audit_retention_purge', true), '') = 'on'
     and old.occurred_at < clock_timestamp() - interval '5 years' then
    return old;
  end if;
  raise exception 'audit_immutable';
end $$;

create function public.purge_expired_audit_logs()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  cutoff timestamptz := clock_timestamp() - interval '5 years';
  purged integer;
  held integer;
begin
  perform set_config('app.audit_retention_purge', 'on', true);
  with candidates as (
    select id, organization_id, actor_user_id from public.audit_logs where occurred_at < cutoff order by occurred_at limit 10000
  ), deletable as (
    select id from candidates where not private.retention_held(organization_id, actor_user_id)
  ), removed as (
    delete from public.audit_logs a using deletable d where a.id = d.id returning 1
  )
  select count(*) into purged from removed;
  perform set_config('app.audit_retention_purge', 'off', true);

  select count(*) into held from public.audit_logs where occurred_at < cutoff;
  perform private.write_audit_event(null, null, null, 'audit.retention.purge', 'audit', 'logs', 'success', null, null,
    jsonb_build_object('purged', purged, 'held', held));
  return jsonb_build_object('purged', purged, 'held', held);
end $$;

-- 3. Convites terminais (aceito, revogado ou vencido) são eliminados 90 dias depois; a auditoria correspondente fica.
create function public.purge_terminal_invitations()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare purged integer;
begin
  with removed as (
    delete from public.invitations i
     where coalesce(
             i.accepted_at,
             i.revoked_at,
             case when i.status = 'expired' or (i.status in ('pending_delivery', 'sent', 'delivery_failed') and i.expires_at < clock_timestamp())
                  then i.expires_at end
           ) < clock_timestamp() - interval '90 days'
     returning 1)
  select count(*) into purged from removed;
  perform private.write_audit_event(null, null, null, 'invitation.retention.purge', 'invitation', 'terminal', 'success', null, null,
    jsonb_build_object('purged', purged));
  return jsonb_build_object('purged', purged);
end $$;

-- 4. Perfis sem vínculo ativo e sem atividade há mais de 2 anos são anonimizados de forma irreversível; o usuário
--    permanece como referência mínima para vínculos e auditoria, mas não pode mais entrar.
create function public.anonymize_inactive_profiles()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  candidate record;
  anonymized integer := 0;
begin
  for candidate in
    select p.user_id, p.avatar_path
      from public.profiles p
     where p.anonymized_at is null
       and not exists (select 1 from public.memberships m where m.user_id = p.user_id and m.status = 'active')
       and greatest(
             p.updated_at,
             coalesce((select max(greatest(m.updated_at, coalesce(m.inactivated_at, '-infinity'::timestamptz), coalesce(m.blocked_at, '-infinity'::timestamptz)))
                         from public.memberships m where m.user_id = p.user_id), '-infinity'::timestamptz),
             coalesce((select max(s.last_seen_at) from public.user_sessions s where s.user_id = p.user_id), '-infinity'::timestamptz),
             coalesce((select u.last_sign_in_at from auth.users u where u.id = p.user_id), '-infinity'::timestamptz)
           ) < clock_timestamp() - interval '2 years'
       and not private.retention_held(null, p.user_id)
     order by p.user_id
     limit 1000
  loop
    if candidate.avatar_path is not null then
      insert into private.storage_cleanup_queue (path) values (candidate.avatar_path) on conflict do nothing;
    end if;
    update public.profiles set display_name = 'Usuário anonimizado', avatar_path = null, anonymized_at = now(), updated_at = now()
     where user_id = candidate.user_id;
    update auth.users
       set email = 'anonimizado-' || candidate.user_id::text || '@anonimizado.invalid',
           phone = null, raw_user_meta_data = '{}'::jsonb, encrypted_password = '', banned_until = 'infinity'
     where id = candidate.user_id;
    delete from auth.identities where user_id = candidate.user_id;
    delete from auth.sessions where user_id = candidate.user_id;
    perform private.write_audit_event(null, null, null, 'profile.retention.anonymize', 'profile', candidate.user_id::text, 'success', null, null, '{}');
    anonymized := anonymized + 1;
  end loop;
  return jsonb_build_object('anonymized', anonymized);
end $$;

-- 5. Retenção legal: registrar e liberar, sempre auditado e somente pela fronteira servidor.
create function public.place_retention_hold(p_scope text, p_organization uuid, p_user uuid, p_reason text, p_actor uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare created private.retention_holds;
begin
  if char_length(btrim(coalesce(p_reason, ''))) not between 10 and 500
     or p_scope not in ('global', 'organization', 'user')
     or (p_scope = 'global' and (p_organization is not null or p_user is not null))
     or (p_scope = 'organization' and (p_organization is null or p_user is not null or not exists (select 1 from public.organizations where id = p_organization)))
     or (p_scope = 'user' and (p_user is null or p_organization is not null or not exists (select 1 from auth.users where id = p_user))) then
    return jsonb_build_object('kind', 'invalid');
  end if;
  insert into private.retention_holds (scope, organization_id, user_id, reason, created_by)
  values (p_scope, p_organization, p_user, btrim(p_reason), p_actor) returning * into created;
  perform private.write_audit_event(p_organization, p_actor, null, 'retention.hold.place', 'retention_hold', created.id::text, 'success', null, btrim(p_reason),
    jsonb_build_object('scope', p_scope));
  return jsonb_build_object('kind', 'placed', 'hold_id', created.id);
end $$;

create function public.release_retention_hold(p_hold uuid, p_actor uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare released private.retention_holds;
begin
  update private.retention_holds set released_at = now(), released_by = p_actor
   where id = p_hold and released_at is null returning * into released;
  if released.id is null then return jsonb_build_object('kind', 'unavailable'); end if;
  perform private.write_audit_event(released.organization_id, p_actor, null, 'retention.hold.release', 'retention_hold', released.id::text, 'success', null, null,
    jsonb_build_object('scope', released.scope));
  return jsonb_build_object('kind', 'released');
end $$;

-- 6. Rotina única, agendada diariamente quando o pg_cron está disponível; do contrário a plataforma deve agendá-la.
create function public.run_identity_retention()
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  return jsonb_build_object(
    'audit', public.purge_expired_audit_logs(),
    'invitations', public.purge_terminal_invitations(),
    'profiles', public.anonymize_inactive_profiles());
end $$;

revoke all on table private.retention_holds, private.storage_cleanup_queue from public, anon, authenticated;
revoke all on function
  private.retention_held(uuid, uuid),
  public.purge_expired_audit_logs(), public.purge_terminal_invitations(), public.anonymize_inactive_profiles(),
  public.place_retention_hold(text, uuid, uuid, text, uuid), public.release_retention_hold(uuid, uuid),
  public.run_identity_retention()
from public, anon, authenticated;
grant execute on function
  public.purge_expired_audit_logs(), public.purge_terminal_invitations(), public.anonymize_inactive_profiles(),
  public.place_retention_hold(text, uuid, uuid, text, uuid), public.release_retention_hold(uuid, uuid),
  public.run_identity_retention()
to service_role;

do $$
begin
  create extension if not exists pg_cron;
  perform cron.schedule('fluxid-identity-retention', '17 3 * * *', 'select public.run_identity_retention()');
exception when others then
  raise notice 'pg_cron indisponível (%): agende public.run_identity_retention() pela plataforma.', sqlerrm;
end $$;
