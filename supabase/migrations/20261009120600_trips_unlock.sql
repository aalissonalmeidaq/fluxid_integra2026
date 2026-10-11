-- Spec 008, US4: o desbloqueio como ato independente da entrega (RF-018 a RF-020, CA-005; research.md, decisão 11).
-- O bloqueio é lógico (Clarifications): registra a reserva do cilindro, não o acionamento da trava, que é da Fase 6. `register_unlock`
-- só mexe em `lock_status` e grava `trip_unlocks`; a situação da entrega e a do cilindro não mudam. Não existe operação de refazer o
-- bloqueio: um novo bloqueio é uma nova viagem. O texto da justificativa fica no evento da viagem e em `trip_unlocks`, nunca na auditoria.

-- O bloqueio só avança: sem bloqueio → bloqueado (no início da viagem) → desbloqueado. Nenhum outro caminho vale, nem por `update` direto.
create function private.guard_trip_item_lock() returns trigger language plpgsql set search_path = '' as $$
begin
  if new.lock_status is distinct from old.lock_status
     and not ((old.lock_status = 'none' and new.lock_status = 'locked') or (old.lock_status = 'locked' and new.lock_status = 'unlocked')) then
    raise exception using errcode = 'P0001', message = 'trip_lock_irreversible';
  end if;
  return new;
end $$;
create trigger trip_items_lock_guard before update on public.trip_items for each row execute function private.guard_trip_item_lock();
revoke all on function private.guard_trip_item_lock() from public, anon, authenticated;

create function public.register_unlock(
  p_actor uuid, p_session uuid, p_organization uuid, p_request uuid, p_trip uuid, p_item uuid, p_justification text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  denied text;
  replay jsonb;
  v_trip public.trips;
  v_item public.trip_items;
  v_justification text := nullif(btrim(coalesce(p_justification, '')), '');
  v_exceptional boolean;
  v_aal text;
  v_result jsonb;
begin
  denied := private.cylinder_authorize(p_actor, p_session, p_organization, 'trip.unlock');
  if denied is not null then return jsonb_build_object('code', denied); end if;
  replay := private.trip_replay(p_organization, p_request, 'register_unlock', p_trip);
  if replay is not null then return replay; end if;
  select t.* into v_trip from public.trips t where t.id = p_trip and t.organization_id = p_organization for update;
  if not found then return jsonb_build_object('code', 'NOT_FOUND'); end if;
  -- Antes de a viagem sair não há nada bloqueado.
  if v_trip.status in ('planned', 'loading') then return jsonb_build_object('code', 'INVALID_TRANSITION', 'from', v_trip.status, 'to', 'unlocked'); end if;
  select i.* into v_item from public.trip_items i where i.id = p_item and i.trip_id = p_trip and i.organization_id = p_organization for update;
  if not found then return jsonb_build_object('code', 'NOT_FOUND', 'entity', 'item'); end if;
  if v_item.lock_status <> 'locked' then return jsonb_build_object('code', 'INVALID_TRANSITION', 'from', v_item.lock_status, 'to', 'unlocked'); end if;

  -- Normal: item entregue. Excepcional: item que ainda não foi entregue (em trânsito, não entregue ou devolvido ao estoque).
  v_exceptional := v_item.item_status <> 'delivered';
  if v_exceptional then
    denied := private.cylinder_authorize(p_actor, p_session, p_organization, 'trip.exception');
    if denied is not null then return jsonb_build_object('code', denied); end if;
    if not private.session_has_aal2(p_actor, p_session) then return jsonb_build_object('code', 'MFA_REQUIRED'); end if;
    if v_justification is null or char_length(v_justification) not between 5 and 500 then return jsonb_build_object('code', 'JUSTIFICATION_REQUIRED'); end if;
  elsif v_justification is not null and char_length(v_justification) > 500 then
    return jsonb_build_object('code', 'JUSTIFICATION_REQUIRED');
  end if;
  select s.aal into v_aal from public.user_sessions s where s.user_id = p_actor and s.session_id = p_session;

  update public.trip_items set lock_status = 'unlocked', updated_at = now() where id = p_item;
  insert into public.trip_unlocks (organization_id, item_id, request_id, exceptional, justification, aal, actor_user_id, actor_session_id)
  values (p_organization, p_item, p_request, v_exceptional, v_justification, coalesce(v_aal, 'aal1'), p_actor, p_session);
  perform private.append_trip_event(p_trip, p_organization, 'unlock_registered', p_actor, p_session, v_justification,
    jsonb_build_object('item_id', p_item, 'exceptional', v_exceptional, 'item_status', v_item.item_status));
  perform private.write_audit_event(p_organization, p_actor, p_session, 'trip.unlock', 'trip', p_trip::text, 'success', null, null,
    jsonb_build_object('trip_id', p_trip, 'item_id', p_item, 'exceptional', v_exceptional, 'aal', coalesce(v_aal, 'aal1')));
  v_result := jsonb_build_object('code', 'UNLOCKED', 'exceptional', v_exceptional);
  return private.trip_remember(p_organization, p_request, 'register_unlock', p_trip, v_result);
end $$;

revoke all on function public.register_unlock(uuid, uuid, uuid, uuid, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.register_unlock(uuid, uuid, uuid, uuid, uuid, uuid, text) to service_role;
