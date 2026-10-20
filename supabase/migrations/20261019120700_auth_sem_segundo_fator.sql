-- Spec 013 (decisão da pessoa responsável em 19/10/2026): o acesso passa a ser só com e-mail e senha para todos os perfis. O segundo
-- fator (TOTP) continua disponível no perfil, como opção, e nenhuma ação o exige mais: o login dos perfis globais deixa de pedir o
-- segundo fator e as ações que exigiam sessão aal2 (anonimização, desbloqueio excepcional da viagem e do lacre) passam a exigir só a
-- sessão ativa. A justificativa e a auditoria de cada ação continuam iguais. Para voltar a exigir, basta reverter esta migration e a
-- constante SECOND_FACTOR_REQUIRED (supabase/functions/_shared/auth-policy.ts e src/domain/identity/auth-policy.ts).

-- Login: nenhum perfil é obrigado a passar pelo segundo fator.
create or replace function public.login_eligibility(p_user_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'eligible', exists (
      select 1 from public.memberships m
        join public.organizations o on o.id = m.organization_id
       where m.user_id = p_user_id and m.status = 'active' and o.status = 'active'),
    'requires_mfa', false);
$$;

-- As ações que exigiam o segundo fator passam a exigir só a sessão ativa do próprio usuário. O nome fica para não reescrever quem chama.
create or replace function private.session_has_aal2(p_actor uuid, p_session uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.user_sessions s where s.user_id = p_actor and s.session_id = p_session and s.status = 'active')
$$;

-- O desbloqueio excepcional registra o nível real da sessão (aal1 ou aal2), em vez de exigir aal2.
alter table public.trip_unlocks drop constraint trip_unlocks_exceptional_aal_check;
alter table public.seal_commands drop constraint seal_commands_aal_check;
alter table public.seal_commands add constraint seal_commands_aal_check check (aal is null or aal in ('aal1', 'aal2'));

create or replace function private.seal_manual_command(p_actor uuid, p_session uuid, p_organization uuid, p_request uuid, p_cylinder uuid, p_justification text, p_kind text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  denied text;
  replay jsonb;
  v_justification text := nullif(btrim(regexp_replace(coalesce(p_justification, ''), '\s+', ' ', 'g')), '');
  v_device public.seal_devices;
  v_command uuid;
  v_exceptional boolean := p_kind = 'unlock';
  v_aal text;
begin
  denied := private.cylinder_authorize(p_actor, p_session, p_organization, 'seal.operate');
  if denied is not null then return jsonb_build_object('code', denied); end if;
  replay := private.seal_replay(p_organization, p_request, 'request_' || p_kind);
  if replay is not null then return replay; end if;
  if not exists (select 1 from public.cylinders c where c.id = p_cylinder and c.organization_id = p_organization) then
    return jsonb_build_object('code', 'NOT_FOUND');
  end if;
  if not private.seal_text_ok(v_justification) then return jsonb_build_object('code', 'JUSTIFICATION_REQUIRED'); end if;
  if v_exceptional and not private.session_has_aal2(p_actor, p_session) then return jsonb_build_object('code', 'MFA_REQUIRED'); end if;
  select coalesce(s.aal, 'aal1') into v_aal from public.user_sessions s where s.user_id = p_actor and s.session_id = p_session;
  select d.* into v_device from public.seal_bindings b join public.seal_devices d on d.id = b.device_id
   where b.cylinder_id = p_cylinder and b.unbound_at is null and b.organization_id = p_organization;
  if v_device.id is null then return jsonb_build_object('code', 'NO_BINDING'); end if;
  if v_device.status <> 'active' then return jsonb_build_object('code', 'SEAL_INACTIVE'); end if;

  v_command := private.issue_seal_command(v_device.id, p_kind, case when v_exceptional then 'exceptional' else 'manual' end, p_actor, v_justification,
    case when v_exceptional then v_aal else null end, null, null, null);
  perform private.write_audit_event(p_organization, p_actor, p_session, case when v_exceptional then 'seal.unlock_exceptional' else 'seal.command_manual' end,
    'seal_command', v_command::text, 'success', null, null,
    jsonb_build_object('command_id', v_command, 'kind', p_kind, 'device_id', v_device.id, 'cylinder_id', p_cylinder));
  return private.seal_remember(p_organization, p_request, 'request_' || p_kind, jsonb_build_object('code', 'REQUESTED', 'command_id', v_command));
end $$;
