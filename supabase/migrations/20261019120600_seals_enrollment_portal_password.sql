-- Spec 013, US4: o Master consulta a senha padrão da rede de configuração dos lacres (RF-016, MS-006; research.md, item 9). A senha é
-- igual para toda a frota e fica no firmware (include/secrets.h, fora do git) e no Vault como `seal_portal_password`, gravada na
-- publicação por SQL documentado (docs/publicacao-em-nuvem.md), nunca por migration. Não existe função para trocá-la: muda só com um
-- firmware novo. Cada consulta exige justificativa e fica na auditoria da plataforma, nunca com a senha.

create function public.reveal_portal_password(p_actor uuid, p_session uuid, p_request uuid, p_justification text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  denied text := private.seal_platform_authorize(p_actor, p_session);
  replay jsonb;
  v_text text := private.seal_justification(p_justification);
  v_password text;
begin
  if denied is not null then return jsonb_build_object('code', denied); end if;
  -- A repetição do mesmo pedido não revela de novo: a idempotência guarda só que a consulta aconteceu, nunca a senha.
  replay := private.seal_replay(private.seal_platform_org(), p_request, 'reveal_portal_password');
  if replay is not null then return replay; end if;
  if not private.seal_text_ok(v_text) then return jsonb_build_object('code', 'JUSTIFICATION_REQUIRED'); end if;
  select s.decrypted_secret into v_password from vault.decrypted_secrets s where s.name = 'seal_portal_password' order by s.created_at desc limit 1;
  if v_password is null or v_password = '' then return jsonb_build_object('code', 'NOT_CONFIGURED'); end if;
  perform private.write_audit_event(null, p_actor, p_session, 'seal.portal_password_reveal', 'seal_portal_password', null, 'success', null, v_text, '{}');
  perform private.seal_remember(private.seal_platform_org(), p_request, 'reveal_portal_password', jsonb_build_object('code', 'REVEALED'));
  return jsonb_build_object('code', 'REVEALED', 'password', v_password);
end $$;

revoke all on function public.reveal_portal_password(uuid, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.reveal_portal_password(uuid, uuid, uuid, text) to service_role;
