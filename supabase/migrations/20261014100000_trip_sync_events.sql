-- Spec 010, Fundação: a trilha de sincronização das operações de campo que chegam pela fila do aparelho (RF-012, RF-023, CA-002, CA-003;
-- data-model.md §1.3). É um registro imutável do que o servidor fez com cada pedido vindo da fila: aplicado, repetido, em conflito,
-- descartado ou reenviado. Nunca guarda coordenada, nome de recebedor, caminho de anexo, foto, assinatura nem valor lido: o motivo é só um
-- código em maiúsculas. A decisão sobre um conflito (resolve_sync_conflict) entra na US2, na mesma trilha.

create table private.trip_sync_events (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations (id),
  request_id uuid not null,
  -- Só nas decisões sobre um conflito: o pedido original que foi recusado (a decisão tem o próprio request_id).
  source_request_id uuid,
  operation text not null,
  trip_id uuid not null references public.trips (id),
  outcome text not null,
  reason_code text,
  queued_at timestamptz,
  received_at timestamptz not null default now(),
  actor_id uuid not null,
  justification text,
  constraint trip_sync_events_operation_check check (operation in ('check_item', 'uncheck_item', 'arrive_stop', 'register_delivery', 'attachment', 'resolve_conflict')),
  constraint trip_sync_events_outcome_check check (outcome in ('applied', 'replayed', 'conflict', 'discarded', 'resubmitted')),
  constraint trip_sync_events_reason_check check (reason_code is null or reason_code ~ '^[A-Z][A-Z0-9_]{0,59}$'),
  constraint trip_sync_events_justification_check check (
    (outcome = 'discarded' and justification is not null and char_length(justification) between 5 and 500)
    or (outcome <> 'discarded' and justification is null))
);

-- Idempotência: o mesmo pedido com o mesmo resultado entra uma só vez.
create unique index trip_sync_events_request_idx on private.trip_sync_events (organization_id, request_id, outcome);
create index trip_sync_events_trip_idx on private.trip_sync_events (organization_id, trip_id, received_at);

create trigger trip_sync_events_immutable before update or delete on private.trip_sync_events
  for each row execute function private.refuse_trip_mutation();

alter table private.trip_sync_events enable row level security;
revoke all on private.trip_sync_events from public, anon, authenticated;

-- Registro de um resultado. Quem registra é o ator que acabou de executar (ou de decidir) a operação: precisa de `trip.operate`. A viagem tem de ser da organização informada, e o motivo e a justificativa seguem as regras da tabela.
create function public.record_trip_sync_event(
  p_actor uuid, p_session uuid, p_organization uuid, p_request uuid, p_operation text, p_trip uuid, p_outcome text, p_reason text,
  p_queued_at timestamptz, p_justification text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  denied text;
  v_justification text := nullif(btrim(regexp_replace(coalesce(p_justification, ''), '\s+', ' ', 'g')), '');
  v_errors jsonb := '[]'::jsonb;
  v_outcome text := p_outcome;
begin
  -- Quem registra é quem acabou de executar a operação de campo: conferir, chegar e entregar exigem `trip.operate`.
  denied := private.cylinder_authorize(p_actor, p_session, p_organization, 'trip.operate');
  if denied is not null then return jsonb_build_object('code', denied); end if;

  if p_operation is null or p_operation not in ('check_item', 'uncheck_item', 'arrive_stop', 'register_delivery', 'attachment', 'resolve_conflict') then
    v_errors := v_errors || private.field_error('operation', 'Operação inválida.');
  end if;
  if p_outcome is null or p_outcome not in ('applied', 'replayed', 'conflict', 'discarded', 'resubmitted') then
    v_errors := v_errors || private.field_error('outcome', 'Resultado inválido.');
  end if;
  if p_reason is not null and p_reason !~ '^[A-Z][A-Z0-9_]{0,59}$' then
    v_errors := v_errors || private.field_error('reason_code', 'O motivo é só um código em maiúsculas.');
  end if;
  if p_outcome = 'discarded' then
    if v_justification is null or char_length(v_justification) not between 5 and 500 then
      v_errors := v_errors || private.field_error('justification', 'Informe a justificativa, de 5 a 500 caracteres.');
    end if;
  elsif v_justification is not null then
    v_errors := v_errors || private.field_error('justification', 'A justificativa só vale no descarte.');
  end if;
  if jsonb_array_length(v_errors) > 0 then
    return jsonb_build_object('code', 'VALIDATION_FAILED', 'fields', v_errors);
  end if;

  perform 1 from public.trips t where t.id = p_trip and t.organization_id = p_organization;
  if not found then return jsonb_build_object('code', 'NOT_FOUND'); end if;

  -- Um "replayed" sem nenhum "applied" antes (a gravação do primeiro registro falhou e o pedido foi reenviado) entra como "applied": a trilha
  -- nunca fica sem o resultado que de fato aplicou a operação.
  if p_outcome = 'replayed' and not exists (
    select 1 from private.trip_sync_events e where e.organization_id = p_organization and e.request_id = p_request and e.outcome = 'applied') then
    v_outcome := 'applied';
  end if;

  insert into private.trip_sync_events (organization_id, request_id, operation, trip_id, outcome, reason_code, queued_at, actor_id, justification)
  values (p_organization, p_request, p_operation, p_trip, v_outcome, p_reason, p_queued_at, p_actor, v_justification)
  on conflict (organization_id, request_id, outcome) do nothing;
  return jsonb_build_object('code', 'RECORDED');
end $$;

-- Leitura da trilha de uma viagem, do mais recente ao mais antigo, para quem pode ver o histórico (trip.history). Sem dado sensível.
create function public.query_sync_events(
  p_actor uuid, p_session uuid, p_organization uuid, p_trip uuid, p_limit integer default 50, p_before bigint default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  denied text;
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 100);
  v_items jsonb;
  v_next bigint;
begin
  denied := private.cylinder_authorize(p_actor, p_session, p_organization, 'trip.history');
  if denied is not null then return jsonb_build_object('code', denied); end if;
  perform 1 from public.trips t where t.id = p_trip and t.organization_id = p_organization;
  if not found then return jsonb_build_object('code', 'NOT_FOUND'); end if;

  select coalesce(jsonb_agg(jsonb_build_object(
      'id', e.id, 'operation', e.operation, 'outcome', e.outcome, 'reason_code', e.reason_code, 'queued_at', e.queued_at,
      'received_at', e.received_at, 'actor', coalesce(pr.display_name, ''), 'justification', e.justification) order by e.id desc), '[]'::jsonb),
         min(e.id)
    into v_items, v_next
    from (select * from private.trip_sync_events x
           where x.organization_id = p_organization and x.trip_id = p_trip and (p_before is null or x.id < p_before)
           order by x.id desc limit v_limit) e
    left join public.profiles pr on pr.user_id = e.actor_id;
  return jsonb_build_object('code', 'OK', 'items', v_items, 'next', case when jsonb_array_length(v_items) = v_limit then v_next else null end);
end $$;

revoke all on function public.record_trip_sync_event(uuid, uuid, uuid, uuid, text, uuid, text, text, timestamptz, text) from public, anon, authenticated;
revoke all on function public.query_sync_events(uuid, uuid, uuid, uuid, integer, bigint) from public, anon, authenticated;
grant execute on function public.record_trip_sync_event(uuid, uuid, uuid, uuid, text, uuid, text, text, timestamptz, text) to service_role;
grant execute on function public.query_sync_events(uuid, uuid, uuid, uuid, integer, bigint) to service_role;

-- Decisão sobre uma operação de campo recusada pelo servidor (RF-013, CA-002): descartar (justificativa de 5 a 500 caracteres, depois de juntar os
-- espaços) ou reenviar (a operação segue pela fila com o mesmo pedido; esta função só registra a decisão e não a executa). Exige `trip.operate`, é
-- idempotente por `request_id` e grava a trilha, o evento da viagem e a auditoria. A justificativa vai à trilha e ao histórico da viagem, nunca à auditoria.
alter table public.trip_events drop constraint trip_events_type_check;
alter table public.trip_events add constraint trip_events_type_check check (event_type in (
  'trip_created', 'trip_updated', 'loading_started', 'loading_reverted', 'item_checked', 'item_unchecked', 'item_removed',
  'trip_started', 'stop_arrived', 'delivery_registered', 'delivery_corrected', 'unlock_registered', 'item_returned',
  'trip_completed', 'trip_cancelled', 'sync_conflict_discarded', 'sync_conflict_resubmitted'));

create function public.resolve_sync_conflict(
  p_actor uuid, p_session uuid, p_organization uuid, p_request uuid, p_trip uuid, p_source_request uuid, p_decision text, p_justification text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  denied text;
  replay jsonb;
  v_justification text := nullif(btrim(regexp_replace(coalesce(p_justification, ''), '\s+', ' ', 'g')), '');
  v_errors jsonb := '[]'::jsonb;
  v_outcome text;
  v_result jsonb;
begin
  denied := private.cylinder_authorize(p_actor, p_session, p_organization, 'trip.operate');
  if denied is not null then return jsonb_build_object('code', denied); end if;

  if p_decision is null or p_decision not in ('discard', 'resubmit') then
    v_errors := v_errors || private.field_error('decision', 'Decisão inválida.');
  elsif p_decision = 'discard' then
    if v_justification is null or char_length(v_justification) not between 5 and 500 then
      v_errors := v_errors || private.field_error('justification', 'Informe a justificativa, de 5 a 500 caracteres.');
    end if;
  elsif v_justification is not null then
    v_errors := v_errors || private.field_error('justification', 'A justificativa só vale no descarte.');
  end if;
  if jsonb_array_length(v_errors) > 0 then return jsonb_build_object('code', 'VALIDATION_FAILED', 'fields', v_errors); end if;

  replay := private.trip_replay(p_organization, p_request, 'resolve_sync_conflict', p_trip);
  if replay is not null then return replay; end if;
  perform 1 from public.trips t where t.id = p_trip and t.organization_id = p_organization for update;
  if not found then return jsonb_build_object('code', 'NOT_FOUND'); end if;
  -- O pedido original precisa ter sido recusado nesta viagem (e só uma vez, pela trilha).
  if not exists (select 1 from private.trip_sync_events e where e.organization_id = p_organization and e.trip_id = p_trip and e.request_id = p_source_request and e.outcome = 'conflict') then
    return jsonb_build_object('code', 'NOT_FOUND', 'entity', 'conflict');
  end if;
  -- Depois de descartado, nenhuma outra decisão vale; reenviar pode se repetir (a operação pode ser recusada outra vez).
  if exists (select 1 from private.trip_sync_events e where e.organization_id = p_organization and e.source_request_id = p_source_request and e.outcome = 'discarded') then
    return jsonb_build_object('code', 'ALREADY_RESOLVED');
  end if;

  v_outcome := case p_decision when 'discard' then 'discarded' else 'resubmitted' end;
  insert into private.trip_sync_events (organization_id, request_id, source_request_id, operation, trip_id, outcome, actor_id, justification)
  values (p_organization, p_request, p_source_request, 'resolve_conflict', p_trip, v_outcome, p_actor, v_justification);
  perform private.append_trip_event(p_trip, p_organization, case p_decision when 'discard' then 'sync_conflict_discarded' else 'sync_conflict_resubmitted' end, p_actor, p_session, v_justification,
    jsonb_build_object('source_request_id', p_source_request));
  perform private.write_audit_event(p_organization, p_actor, p_session, 'trip.sync_conflict_resolve', 'trip', p_trip::text, 'success', null, null,
    jsonb_build_object('trip_id', p_trip, 'decision', p_decision, 'source_request_id', p_source_request));
  v_result := jsonb_build_object('code', 'RESOLVED', 'decision', p_decision);
  return private.trip_remember(p_organization, p_request, 'resolve_sync_conflict', p_trip, v_result);
end $$;

revoke all on function public.resolve_sync_conflict(uuid, uuid, uuid, uuid, uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.resolve_sync_conflict(uuid, uuid, uuid, uuid, uuid, uuid, text, text) to service_role;
