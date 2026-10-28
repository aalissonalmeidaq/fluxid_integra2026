-- Spec 015 (T024; RF-041, contrato "Invalidação em tempo real"): o banco manda um AVISO sem dado no canal privado
-- `tracking:<organização>`; a tela recebe o aviso e refaz a consulta autorizada. O aviso leva só o tipo e a viagem — nunca ponto,
-- endereço ou nome. Sem ele, a tela consulta a cada 30 s. O schema interno do Realtime não é alterado.

create function private.tracking_broadcast(p_organization uuid, p_kind text, p_trip uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform realtime.send(jsonb_build_object('kind', p_kind, 'trip_id', p_trip), 'tracking', 'tracking:' || p_organization::text, true);
exception when others then
  -- O aviso é uma conveniência: nunca derruba a gravação da posição.
  raise notice 'aviso em tempo real não enviado: %', sqlerrm;
end $$;

create function private.tracking_on_mobile_position() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform private.tracking_broadcast(new.organization_id, 'position', new.trip_id);
  return null;
end $$;

create function private.tracking_on_session() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status or new.capability is distinct from old.capability
     or new.notifications_denied is distinct from old.notifications_denied then
    perform private.tracking_broadcast(new.organization_id, 'session', new.trip_id);
  end if;
  return null;
end $$;

-- Posição nova do lacre de um cilindro numa viagem em andamento também avisa o acompanhamento dessa viagem.
create function private.tracking_on_seal_position() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_trip uuid;
begin
  if new.cylinder_id is null then return null; end if;
  select ti.trip_id into v_trip
    from public.trip_items ti join public.trips t on t.id = ti.trip_id
   where ti.cylinder_id = new.cylinder_id and ti.organization_id = new.organization_id and ti.is_open and t.status = 'in_progress'
   limit 1;
  if v_trip is not null then perform private.tracking_broadcast(new.organization_id, 'position', v_trip); end if;
  return null;
end $$;

create trigger mobile_positions_broadcast after insert on public.mobile_positions
  for each row execute function private.tracking_on_mobile_position();
create trigger tracking_sessions_broadcast after insert or update on public.tracking_sessions
  for each row execute function private.tracking_on_session();
create trigger seal_positions_tracking_broadcast after insert on public.seal_positions
  for each row execute function private.tracking_on_seal_position();

revoke all on function private.tracking_broadcast(uuid, text, uuid), private.tracking_on_mobile_position(), private.tracking_on_session(),
  private.tracking_on_seal_position() from public, anon, authenticated;

-- Quem pode ouvir o canal: a pessoa da sessão do token, com `tracking.read` na organização do tópico. Exposta a `authenticated` só
-- para a política de `realtime.messages`; devolve apenas verdadeiro ou falso sobre a própria pessoa.
create function public.tracking_topic_allowed(p_topic text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare
  v_org uuid;
  v_session uuid;
begin
  if p_topic is null or p_topic !~ '^tracking:[0-9a-f-]{36}$' then return false; end if;
  v_org := substr(p_topic, 10)::uuid;
  v_session := nullif(auth.jwt()->>'session_id', '')::uuid;
  if auth.uid() is null or v_session is null then return false; end if;
  return private.actor_has_permission(auth.uid(), v_session, v_org, 'tracking.read');
exception when others then
  return false;
end $$;

revoke all on function public.tracking_topic_allowed(text) from public, anon;
grant execute on function public.tracking_topic_allowed(text) to authenticated;

create policy tracking_topic_read on realtime.messages for select to authenticated
  using (realtime.topic() like 'tracking:%' and public.tracking_topic_allowed(realtime.topic()));
