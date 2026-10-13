-- Spec 010, US3 e US4: fotos e assinatura da entrega (RF-018 a RF-023; data-model.md §1.1, §1.2 e §1.5). Cada anexo é imutável, fica em bucket privado e só é
-- gravado pela função servidor `trip-attachments`. A foto é lida por quem tem `trip.read` e a assinatura só por quem tem `trip.recipient` (a mesma proteção do
-- nome do recebedor). Nada aqui é excluído fisicamente. Evento e auditoria dizem só QUANTAS fotos e se há assinatura: nunca caminho, nome do arquivo ou conteúdo.

-- 1. A chave composta (entrega, organização) garante que o anexo é da mesma organização da entrega.
alter table public.trip_deliveries add constraint trip_deliveries_id_org_uk unique (id, organization_id);

create table public.trip_delivery_attachments (
  id uuid primary key,
  organization_id uuid not null references public.organizations (id) on delete restrict,
  delivery_id uuid not null,
  trip_id uuid not null references public.trips (id),
  stop_id uuid not null references public.trip_stops (id),
  kind text not null,
  position smallint not null,
  storage_path text not null,
  content_type text not null,
  size_bytes integer not null,
  sha256 text not null,
  captured_at timestamptz not null,
  added_later boolean not null default false,
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  constraint trip_delivery_attachments_delivery_fk foreign key (delivery_id, organization_id) references public.trip_deliveries (id, organization_id),
  constraint trip_delivery_attachments_kind_check check (kind in ('photo', 'signature')),
  constraint trip_delivery_attachments_position_check check ((kind = 'photo' and position between 1 and 3) or (kind = 'signature' and position = 0)),
  constraint trip_delivery_attachments_type_check check ((kind = 'photo' and content_type = 'image/jpeg') or (kind = 'signature' and content_type = 'image/png')),
  constraint trip_delivery_attachments_size_check check (size_bytes between 1 and 2097152),
  constraint trip_delivery_attachments_sha_check check (sha256 ~ '^[0-9a-f]{64}$'),
  constraint trip_delivery_attachments_path_check check (storage_path = organization_id::text || '/' || trip_id::text || '/' || delivery_id::text || '/' || id::text
    || case when kind = 'photo' then '.jpg' else '.png' end)
);
-- No máximo 3 fotos (posições 1 a 3) e 1 assinatura (posição 0) por entrega.
create unique index trip_delivery_attachments_slot_idx on public.trip_delivery_attachments (delivery_id, kind, position);
create index trip_delivery_attachments_trip_idx on public.trip_delivery_attachments (organization_id, trip_id);

create trigger trip_delivery_attachments_immutable before update or delete on public.trip_delivery_attachments for each row execute function private.refuse_trip_mutation();
create trigger trip_delivery_attachments_no_truncate before truncate on public.trip_delivery_attachments for each statement execute function private.refuse_trip_mutation();

alter table public.trip_delivery_attachments enable row level security;
revoke all on public.trip_delivery_attachments from anon, authenticated;
grant select on public.trip_delivery_attachments to authenticated;
-- Foto: trip.read. Assinatura: trip.recipient. Sem política de escrita: só a função servidor (service_role) grava.
create policy trip_delivery_attachments_read on public.trip_delivery_attachments for select to authenticated
  using ((select private.has_active_session())
    and private.has_permission(organization_id, case when kind = 'signature' then 'trip.recipient' else 'trip.read' end));

-- 2. Bucket privado de 2 MB, só JPEG e PNG; leitura espelha a da tabela e nenhuma escrita de cliente.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('trip-evidence', 'trip-evidence', false, 2097152, array['image/jpeg', 'image/png'])
on conflict (id) do update
  set public = false, file_size_limit = 2097152, allowed_mime_types = array['image/jpeg', 'image/png'];

create policy trip_evidence_read on storage.objects for select to authenticated
  using (
    bucket_id = 'trip-evidence'
    and (select private.has_active_session())
    and nullif((storage.foldername(name))[1], '') is not null
    and private.has_permission((storage.foldername(name))[1]::uuid, case when name ~ '\.png$' then 'trip.recipient' else 'trip.read' end));

-- 3. Tipos de evento de viagem: o conjunto completo, mais `evidence_attached`.
alter table public.trip_events drop constraint trip_events_type_check;
alter table public.trip_events add constraint trip_events_type_check check (event_type in (
  'trip_created', 'trip_updated', 'loading_started', 'loading_reverted', 'item_checked', 'item_unchecked', 'item_removed',
  'trip_started', 'stop_arrived', 'delivery_registered', 'delivery_corrected', 'unlock_registered', 'item_returned',
  'trip_completed', 'trip_cancelled', 'sync_conflict_discarded', 'sync_conflict_resubmitted', 'evidence_attached'));

-- 4. Gravação do anexo. Duas fases, para o objeto só ir ao bucket depois de tudo validado e a linha só existir depois de o objeto estar lá:
--    p_confirm = false: valida e devolve o caminho canônico (nada é gravado) - p_confirm = true: grava a linha, o evento e a auditoria.
--    Idempotente por `p_id`: mesmo id e mesmo sha256 devolve REPLAYED - mesmo id com outro sha256 é ATTACHMENT_CONFLICT.
create function public.attach_trip_evidence(
  p_actor uuid, p_session uuid, p_organization uuid, p_delivery uuid, p_id uuid, p_kind text, p_position integer, p_content_type text,
  p_size integer, p_sha256 text, p_captured_at timestamptz, p_added_later boolean, p_confirm boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  denied text;
  v_errors jsonb := '[]'::jsonb;
  d public.trip_deliveries;
  s public.trip_stops;
  t public.trips;
  v_existing public.trip_delivery_attachments;
  v_path text;
  v_max integer;
  v_expected text;
  v_photos integer;
  v_signature boolean;
begin
  denied := private.cylinder_authorize(p_actor, p_session, p_organization, 'trip.operate');
  if denied is not null then return jsonb_build_object('code', denied); end if;

  if p_id is null then v_errors := v_errors || private.field_error('attachment_id', 'Identificador do anexo obrigatório.'); end if;
  if p_kind is null or p_kind not in ('photo', 'signature') then
    v_errors := v_errors || private.field_error('kind', 'Tipo de anexo inválido.');
  else
    if p_kind = 'photo' and (p_position is null or p_position not between 1 and 3) then v_errors := v_errors || private.field_error('position', 'A foto ocupa uma posição de 1 a 3.'); end if;
    if p_kind = 'signature' and p_position is distinct from 0 then v_errors := v_errors || private.field_error('position', 'A assinatura ocupa a posição 0.'); end if;
    v_expected := case when p_kind = 'photo' then 'image/jpeg' else 'image/png' end;
    if p_content_type is distinct from v_expected then v_errors := v_errors || private.field_error('file', 'Tipo de arquivo não aceito.'); end if;
    v_max := case when p_kind = 'photo' then 1572864 else 204800 end;
    if p_size is null or p_size not between 1 and v_max then v_errors := v_errors || private.field_error('file', 'Tamanho do arquivo fora do limite.'); end if;
  end if;
  if p_sha256 is null or p_sha256 !~ '^[0-9a-f]{64}$' then v_errors := v_errors || private.field_error('sha256', 'Resumo do arquivo inválido.'); end if;
  if p_captured_at is null or p_captured_at > now() + interval '5 minutes' then v_errors := v_errors || private.field_error('captured_at', 'Hora da captura inválida.'); end if;
  if jsonb_array_length(v_errors) > 0 then return jsonb_build_object('code', 'VALIDATION_FAILED', 'fields', v_errors); end if;

  select x.* into d from public.trip_deliveries x where x.id = p_delivery and x.organization_id = p_organization;
  if not found then return jsonb_build_object('code', 'DELIVERY_NOT_FOUND'); end if;
  select x.* into s from public.trip_stops x where x.id = d.stop_id;
  select x.* into t from public.trips x where x.id = s.trip_id;

  -- Repetição: o mesmo anexo (o mesmo id), de qualquer fase, nunca duplica.
  select x.* into v_existing from public.trip_delivery_attachments x where x.id = p_id;
  if found then
    if v_existing.organization_id <> p_organization or v_existing.delivery_id <> p_delivery or v_existing.sha256 <> p_sha256 then
      return jsonb_build_object('code', 'ATTACHMENT_CONFLICT');
    end if;
    return jsonb_build_object('code', 'REPLAYED', 'id', v_existing.id, 'kind', v_existing.kind, 'position', v_existing.position);
  end if;

  -- Janela: viagem em andamento, ou concluída há até 7 dias. Cancelada nunca.
  if not (t.status = 'in_progress' or (t.status = 'completed' and t.completed_at is not null and t.completed_at > now() - interval '7 days')) then
    return jsonb_build_object('code', 'ATTACHMENT_WINDOW_CLOSED');
  end if;

  -- Limite: 3 fotos e 1 assinatura por entrega, e cada posição só uma vez.
  if exists (select 1 from public.trip_delivery_attachments x where x.delivery_id = p_delivery and x.kind = p_kind and x.position = p_position) then
    return jsonb_build_object('code', 'ATTACHMENT_LIMIT');
  end if;
  select count(*) filter (where x.kind = 'photo'), coalesce(bool_or(x.kind = 'signature'), false) into v_photos, v_signature
    from public.trip_delivery_attachments x where x.delivery_id = p_delivery;
  if (p_kind = 'photo' and v_photos >= 3) or (p_kind = 'signature' and v_signature) then return jsonb_build_object('code', 'ATTACHMENT_LIMIT'); end if;

  v_path := p_organization::text || '/' || t.id::text || '/' || p_delivery::text || '/' || p_id::text || case when p_kind = 'photo' then '.jpg' else '.png' end;
  if not p_confirm then
    return jsonb_build_object('code', 'READY', 'storage_path', v_path);
  end if;

  insert into public.trip_delivery_attachments (id, organization_id, delivery_id, trip_id, stop_id, kind, position, storage_path, content_type, size_bytes, sha256, captured_at, added_later, created_by)
  values (p_id, p_organization, p_delivery, t.id, s.id, p_kind, p_position, v_path, p_content_type, p_size, p_sha256, p_captured_at, coalesce(p_added_later, false), p_actor);
  select count(*) filter (where x.kind = 'photo'), coalesce(bool_or(x.kind = 'signature'), false) into v_photos, v_signature
    from public.trip_delivery_attachments x where x.delivery_id = p_delivery;
  perform private.append_trip_event(t.id, p_organization, 'evidence_attached', p_actor, p_session, null,
    jsonb_build_object('photo_count', v_photos, 'has_signature', v_signature, 'added_later', coalesce(p_added_later, false)));
  perform private.write_audit_event(p_organization, p_actor, p_session, 'trip.evidence_attach', 'trip', t.id::text, 'success', null, null,
    jsonb_build_object('trip_id', t.id, 'photo_count', v_photos, 'has_signature', v_signature));
  return jsonb_build_object('code', 'ATTACHED', 'id', p_id, 'kind', p_kind, 'position', p_position);
end $$;

-- 5. Leitura de um anexo: confere a permissão do tipo e devolve o caminho. Anexo de outra organização, sem permissão ou inexistente: NOT_FOUND (igual).
--    Quem lê o caminho é só a borda, para assinar a URL de 60 segundos, ele nunca volta ao cliente.
create function public.query_attachment_target(p_actor uuid, p_session uuid, p_organization uuid, p_attachment uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  a public.trip_delivery_attachments;
  v_permission text;
begin
  if private.cylinder_authorize(p_actor, p_session, p_organization, 'trip.read') is not null then return jsonb_build_object('code', 'NOT_FOUND'); end if;
  select x.* into a from public.trip_delivery_attachments x where x.id = p_attachment and x.organization_id = p_organization;
  if not found then return jsonb_build_object('code', 'NOT_FOUND'); end if;
  v_permission := case when a.kind = 'signature' then 'trip.recipient' else 'trip.read' end;
  if not private.actor_has_permission(p_actor, p_session, p_organization, v_permission) then return jsonb_build_object('code', 'NOT_FOUND'); end if;
  return jsonb_build_object('code', 'OK', 'storage_path', a.storage_path, 'kind', a.kind);
end $$;

-- 6. Anexos de uma viagem, por entrega: contagem de fotos e se há assinatura (a quem tem trip.read) e a lista (id, tipo, posição, hora) só dos tipos que a
--    pessoa pode ver. Nunca o caminho. O detalhe da viagem junta esta resposta às entregas.
create function public.query_trip_attachments(p_actor uuid, p_session uuid, p_organization uuid, p_trip uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  denied text;
  v_recipient boolean;
begin
  denied := private.cylinder_authorize(p_actor, p_session, p_organization, 'trip.read');
  if denied is not null then return jsonb_build_object('code', denied); end if;
  perform 1 from public.trips t where t.id = p_trip and t.organization_id = p_organization;
  if not found then return jsonb_build_object('code', 'NOT_FOUND'); end if;
  v_recipient := private.actor_has_permission(p_actor, p_session, p_organization, 'trip.recipient');
  return jsonb_build_object('code', 'OK', 'deliveries', coalesce((
    select jsonb_agg(jsonb_build_object(
      'delivery_id', g.delivery_id, 'photo_count', g.photos, 'has_signature', g.signatures > 0,
      'attachments', (select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'kind', x.kind, 'position', x.position, 'captured_at', x.captured_at, 'added_later', x.added_later)
                                                  order by x.kind, x.position), '[]'::jsonb)
                        from public.trip_delivery_attachments x where x.delivery_id = g.delivery_id and (x.kind = 'photo' or v_recipient))))
    from (select a.delivery_id, count(*) filter (where a.kind = 'photo') as photos, count(*) filter (where a.kind = 'signature') as signatures
            from public.trip_delivery_attachments a where a.organization_id = p_organization and a.trip_id = p_trip group by a.delivery_id) g), '[]'::jsonb));
end $$;

revoke all on function public.attach_trip_evidence(uuid, uuid, uuid, uuid, uuid, text, integer, text, integer, text, timestamptz, boolean, boolean) from public, anon, authenticated;
revoke all on function public.query_attachment_target(uuid, uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.query_trip_attachments(uuid, uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.attach_trip_evidence(uuid, uuid, uuid, uuid, uuid, text, integer, text, integer, text, timestamptz, boolean, boolean) to service_role;
grant execute on function public.query_attachment_target(uuid, uuid, uuid, uuid) to service_role;
grant execute on function public.query_trip_attachments(uuid, uuid, uuid, uuid) to service_role;

-- 7. O filtro do histórico por tipo de evento passa a conhecer os tipos novos (decisões sobre registros da fila e anexos). Só muda a lista aceita.
create or replace function public.trip_history(
  p_actor uuid, p_session uuid, p_organization uuid, p_trip uuid, p_event_type text, p_from date, p_to date, p_order text, p_cursor text, p_limit integer)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  denied text;
  v_order text := coalesce(p_order, 'desc');
  v_limit integer := least(greatest(coalesce(p_limit, 25), 1), 100);
  v_cursor record;
  v_rows jsonb;
  v_count integer;
  v_items jsonb;
  v_next text := null;
  v_last jsonb;
begin
  denied := private.cylinder_authorize(p_actor, p_session, p_organization, 'trip.history');
  if denied is not null then return jsonb_build_object('code', denied); end if;
  if v_order not in ('asc', 'desc') then
    return jsonb_build_object('code', 'VALIDATION_FAILED', 'fields', private.field_error('order', 'Ordem desconhecida.'));
  end if;
  if p_event_type is not null and p_event_type not in (
    'trip_created', 'trip_updated', 'loading_started', 'loading_reverted', 'item_checked', 'item_unchecked', 'item_removed', 'trip_started', 'stop_arrived',
    'delivery_registered', 'delivery_corrected', 'unlock_registered', 'item_returned', 'trip_completed', 'trip_cancelled',
    'sync_conflict_discarded', 'sync_conflict_resubmitted', 'evidence_attached') then
    return jsonb_build_object('code', 'VALIDATION_FAILED', 'fields', private.field_error('event_type', 'Tipo de evento desconhecido.'));
  end if;
  select * into v_cursor from private.cursor_decode(p_cursor);
  if not v_cursor.valid then
    return jsonb_build_object('code', 'VALIDATION_FAILED', 'fields', private.field_error('cursor', 'Página inválida.'));
  end if;
  if not exists (select 1 from public.trips t where t.id = p_trip and t.organization_id = p_organization) then return jsonb_build_object('code', 'NOT_FOUND'); end if;

  -- A chave de ordenação é a sequência da viagem em texto de largura fixa; o desempate é o id.
  select jsonb_agg(jsonb_build_object('k', f.k, 'i', f.id, 'item', jsonb_build_object(
      'id', f.id, 'sequence', f.sequence, 'event_type', f.event_type, 'occurred_at', f.occurred_at, 'justification', f.justification, 'data', f.data,
      'actor_name', (select p.display_name from public.profiles p where p.user_id = f.actor_user_id))) order by case when v_order = 'asc' then f.sequence end asc, case when v_order = 'desc' then f.sequence end desc) into v_rows
    from (select e.*, lpad(e.sequence::text, 10, '0') as k from public.trip_events e
           where e.trip_id = p_trip and e.organization_id = p_organization
             and (p_event_type is null or e.event_type = p_event_type)
             and (p_from is null or (e.occurred_at at time zone 'America/Sao_Paulo')::date >= p_from)
             and (p_to is null or (e.occurred_at at time zone 'America/Sao_Paulo')::date <= p_to)
             and (p_cursor is null or case when v_order = 'asc' then (lpad(e.sequence::text, 10, '0'), e.id) > (v_cursor.sort_key, v_cursor.row_id)
                                           else (lpad(e.sequence::text, 10, '0'), e.id) < (v_cursor.sort_key, v_cursor.row_id) end)
           order by case when v_order = 'asc' then e.sequence end asc, case when v_order = 'desc' then e.sequence end desc limit v_limit + 1) f;
  v_rows := coalesce(v_rows, '[]'::jsonb);
  v_count := jsonb_array_length(v_rows);
  select coalesce(jsonb_agg(e.value -> 'item' order by e.ord), '[]'::jsonb) into v_items from jsonb_array_elements(v_rows) with ordinality as e(value, ord) where e.ord <= v_limit;
  if v_count > v_limit then
    v_last := v_rows -> (v_limit - 1);
    v_next := private.cursor_encode(v_last ->> 'k', (v_last ->> 'i')::uuid);
  end if;
  return jsonb_build_object('code', 'LISTED', 'events', v_items, 'next', v_next);
end $$;
