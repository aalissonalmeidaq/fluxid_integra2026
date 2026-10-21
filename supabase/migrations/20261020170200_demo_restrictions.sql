-- Spec 014 (RF-016; research.md, itens 4 e 5): restrições do tenant e das contas de demonstração, no servidor.
--   (a) convites no tenant da demonstração: DEMO_RESTRICTED, com a negação auditada;
--   (b) troca de senha de conta de demonstração: o gatilho em auth.users só aceita a senha publicada;
--   (d) "Devolver à plataforma" no tenant da demonstração: DEMO_RESTRICTED, com a negação auditada.
-- A recuperação de senha (c) fica na função password-recovery, que pergunta `public.is_demo_email`.
-- As três funções abaixo são as das Specs 002 e 013 com uma verificação a mais, logo depois da autorização: quem não tem acesso ao
-- tenant continua recebendo a mesma resposta de antes, e nada é revelado sobre a demonstração.

-- (a) Convite feito pelo administrador do tenant.
create or replace function public.reserve_tenant_invitation(p_actor uuid,p_session uuid,p_organization uuid,p_email text,p_role uuid,p_justification text,p_resend boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare normalized text:=lower(btrim(p_email)); previous public.invitations; created public.invitations;
begin
  if not public.tenant_actor_authorized(p_actor,p_session,p_organization) then return jsonb_build_object('kind','access_denied'); end if;
  if private.is_demo_tenant(p_organization) then
    perform private.write_audit_event(p_organization,p_actor,p_session,'invitation.reserve','invitation',null,'denied','demo_restricted',null,'{}');
    return jsonb_build_object('kind','demo_restricted');
  end if;
  if char_length(normalized)>254 or normalized !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or char_length(btrim(p_justification)) not between 10 and 500 then return jsonb_build_object('kind','invalid'); end if;
  if not exists(select 1 from public.roles r where r.id=p_role and r.organization_id=p_organization and r.scope='tenant' and r.active) then return jsonb_build_object('kind','invalid'); end if;
  perform pg_advisory_xact_lock(hashtextextended(p_organization::text||':'||normalized,0));
  select * into previous from public.invitations i where i.organization_id=p_organization and i.email_normalized=normalized order by i.created_at desc limit 1 for update;
  if previous.id is not null and previous.status in ('pending_delivery','sent') and not p_resend then return jsonb_build_object('kind','conflict'); end if;
  if previous.id is not null and p_resend and previous.created_at>now()-interval '5 minutes' then return jsonb_build_object('kind','delivery_pending'); end if;
  update public.invitations set status='revoked',revoked_at=now() where organization_id=p_organization and email_normalized=normalized and status in ('pending_delivery','sent');
  insert into public.invitations(organization_id,email_normalized,intended_role_id,created_by,expires_at) values(p_organization,normalized,p_role,p_actor,now()+interval '72 hours') returning * into created;
  perform private.write_audit_event(p_organization,p_actor,p_session,'invitation.reserve','invitation',created.id::text,'success',null,p_justification,'{}');
  return jsonb_build_object('kind','reserved','id',created.id,'expires_at',created.expires_at);
end $$;

-- (a) Primeiro administrador, pelo Master. A função devolve o id do convite, então a recusa é uma exceção com DEMO_RESTRICTED; a
-- borda (manage-organizations) traduz em 403 e audita a negação, porque a exceção desfaz qualquer escrita desta transação.
create or replace function public.invite_first_tenant_admin(p_actor uuid,p_session uuid,p_organization uuid,p_email text,p_justification text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare ctx jsonb; role_id uuid; invitation_id uuid;
begin
  ctx:=public.global_actor_context(p_actor,p_session);
  if not coalesce((ctx->>'session_active')::boolean,false) or not coalesce((ctx->>'can_manage_platform')::boolean,false) then raise exception using errcode='42501',message='access_denied'; end if;
  if private.is_demo_tenant(p_organization) then raise exception using errcode='42501',message='DEMO_RESTRICTED'; end if;
  select r.id into role_id from public.roles r where r.organization_id=p_organization and r.code='tenant_admin' and r.active;
  if role_id is null then raise exception using errcode='22023',message='invalid_tenant'; end if;
  update public.invitations set status='revoked',revoked_at=now() where organization_id=p_organization and email_normalized=lower(btrim(p_email)) and status in ('pending_delivery','sent');
  insert into public.invitations(organization_id,email_normalized,intended_role_id,created_by) values(p_organization,lower(btrim(p_email)),role_id,p_actor) returning id into invitation_id;
  perform private.write_audit_event(p_organization,p_actor,p_session,'organization.first_admin.invite','invitation',invitation_id::text,'success',null,p_justification,'{}');
  return invitation_id;
end; $$;

-- (d) Devolver o lacre à plataforma (Spec 013).
create or replace function public.return_device(p_actor uuid, p_session uuid, p_organization uuid, p_request uuid, p_device uuid, p_justification text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  denied text;
  replay jsonb;
  v_text text := private.seal_justification(p_justification);
  v_device public.seal_devices;
  v_enrollment uuid;
  v_meta jsonb;
begin
  denied := private.cylinder_authorize(p_actor, p_session, p_organization, 'seal.admin');
  if denied is not null then return jsonb_build_object('code', denied); end if;
  if private.is_demo_tenant(p_organization) then
    perform private.write_audit_event(p_organization, p_actor, p_session, 'seal.device_return', 'seal_device', p_device::text, 'denied', 'demo_restricted', null,
      jsonb_build_object('device_id', p_device));
    return jsonb_build_object('code', 'DEMO_RESTRICTED');
  end if;
  replay := private.seal_replay(p_organization, p_request, 'return_device');
  if replay is not null then return replay; end if;
  select d.* into v_device from public.seal_devices d where d.id = p_device and d.organization_id = p_organization and d.status = 'active' for update;
  if v_device.id is null then return jsonb_build_object('code', 'NOT_FOUND'); end if;
  if not private.seal_text_ok(v_text) then return jsonb_build_object('code', 'JUSTIFICATION_REQUIRED'); end if;
  if private.seal_device_in_trip(p_device) then return jsonb_build_object('code', 'CYLINDER_IN_TRIP'); end if;

  -- Lacre ativo sem pedido (cadastro manual feito depois da compatibilidade): ganha o pedido agora, para entrar na fila do Master.
  select e.id into v_enrollment from public.seal_enrollments e where e.device_code = v_device.device_code for update;
  if v_enrollment is null then
    insert into public.seal_enrollments (device_code, key_hash, status, organization_id, device_id, last_organization_id, first_seen_at, last_seen_at)
    values (v_device.device_code, v_device.key_hash, 'approved', p_organization, p_device, p_organization, v_device.created_at,
      coalesce(v_device.last_seen_at, v_device.created_at))
    returning id into v_enrollment;
    update public.seal_devices set enrollment_id = v_enrollment, approved_at = coalesce(approved_at, created_at) where id = p_device;
  end if;

  perform private.seal_deactivate_line(p_device, 'returned', p_actor, v_text);
  update public.seal_enrollments set status = 'returned', organization_id = null, device_id = null, last_organization_id = p_organization,
    forget_networks = 'all', forget_networks_requested_at = now(), decided_by = p_actor, decided_at = now(), decision_note = v_text, updated_at = now()
   where id = v_enrollment;
  v_meta := jsonb_build_object('device_code', v_device.device_code, 'device_id', p_device, 'organization_id', p_organization);
  perform private.write_audit_event(p_organization, p_actor, p_session, 'seal.device_return', 'seal_enrollment', v_enrollment::text, 'success', null, v_text, v_meta);
  perform private.write_audit_event(null, p_actor, p_session, 'seal.device_return', 'seal_enrollment', v_enrollment::text, 'success', null, v_text, v_meta);
  return private.seal_remember(p_organization, p_request, 'return_device', jsonb_build_object('code', 'RETURNED'));
end $$;

-- (b) Senha das contas de demonstração: só a publicada. O app troca a senha direto no Auth (updateUser), sem passar por função
-- nossa; o gatilho vale para qualquer caminho. A recusa aborta a escrita do Auth (fica o log do próprio Auth, não audit_logs).
create function private.demo_password_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_published text;
begin
  select a.published_password into v_published from private.demo_accounts a where a.user_id = new.id;
  if v_published is null then return new; end if;
  if new.encrypted_password is null or new.encrypted_password = ''
     or extensions.crypt(v_published, new.encrypted_password) <> new.encrypted_password then
    raise exception using errcode = '42501', message = 'demo_password_locked';
  end if;
  return new;
end $$;

create trigger demo_password_guard before update of encrypted_password on auth.users
  for each row when (new.encrypted_password is distinct from old.encrypted_password)
  execute function private.demo_password_guard();

revoke all on function private.demo_password_guard() from public, anon, authenticated;
revoke all on function public.reserve_tenant_invitation(uuid,uuid,uuid,text,uuid,text,boolean), public.invite_first_tenant_admin(uuid,uuid,uuid,text,text),
  public.return_device(uuid, uuid, uuid, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.reserve_tenant_invitation(uuid,uuid,uuid,text,uuid,text,boolean), public.invite_first_tenant_admin(uuid,uuid,uuid,text,text),
  public.return_device(uuid, uuid, uuid, uuid, uuid, text) to service_role;
