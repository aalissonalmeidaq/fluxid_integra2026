-- Spec 012, US1: tempo real (RNF-001; research.md, item 7). O banco manda um AVISO sem dado, por Realtime Broadcast, no canal privado
-- `seals:<organização>`; a tela recebe o aviso e busca os dados pelas funções de consulta, como sempre. O aviso sai quando nasce uma
-- posição ou muda saúde, trava, comando ou alerta, nunca a cada "visto por último". Nenhuma coordenada vai no aviso.

create or replace function private.seal_broadcast(p_organization uuid, p_kind text, p_device uuid, p_cylinder uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform realtime.send(
    jsonb_build_object('kind', p_kind, 'device_id', p_device, 'cylinder_id', p_cylinder),
    'seal', 'seals:' || p_organization::text, true);
exception when others then
  -- O aviso é uma conveniência: sem ele a tela consulta a cada 30 s. Nunca derruba a gravação do lacre.
  raise notice 'aviso em tempo real não enviado: %', sqlerrm;
end $$;

-- Quem pode ouvir o canal: a pessoa da sessão do token, com `seal.read` na organização do tópico (contracts/permissoes-e-papeis.md).
-- Exposta a `authenticated` só para a política de `realtime.messages`; devolve apenas verdadeiro ou falso sobre a própria pessoa.
create function public.seal_topic_allowed(p_topic text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare
  v_org uuid;
  v_session uuid;
begin
  if p_topic is null or p_topic !~ '^seals:[0-9a-f-]{36}$' then return false; end if;
  v_org := substr(p_topic, 7)::uuid;
  v_session := nullif(auth.jwt()->>'session_id', '')::uuid;
  if auth.uid() is null or v_session is null then return false; end if;
  return private.actor_has_permission(auth.uid(), v_session, v_org, 'seal.read');
exception when others then
  return false;
end $$;

revoke all on function public.seal_topic_allowed(text) from public, anon;
grant execute on function public.seal_topic_allowed(text) to authenticated;

create policy seal_topic_read on realtime.messages for select to authenticated
  using (realtime.topic() like 'seals:%' and public.seal_topic_allowed(realtime.topic()));
