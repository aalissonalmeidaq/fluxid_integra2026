-- Spec 012, US3: destravamento na entrega comprovada dentro da geocerca da unidade (RF-024, MS-004; research.md, item 11; Clarifications
-- 17/10). A register_delivery da Spec 008 grava os itens e depois o registro da entrega; o gatilho fica no registro, que já enxerga os
-- itens atualizados. Prova: a posição do lacre com GPS lida nos 2 minutos anteriores; sem ela, a do celular com origem "gps"; digitada
-- ou "no endereço da unidade" não comprovam. Sem destravamento automático, o motivo fica no item para a tela explicar (RF-024).

alter table public.trip_items add column seal_unlock_note text;
alter table public.trip_items add constraint trip_items_seal_unlock_note_check
  check (seal_unlock_note is null or seal_unlock_note in ('outside_geofence', 'no_proof', 'no_geofence'));

-- Vigilância da geocerca do cliente começa na entrega (US4); aqui ainda não faz nada.
create function private.seal_start_watch(p_item public.trip_items, p_site uuid) returns void
language plpgsql security definer set search_path = '' as $$ begin return; end $$;
create function private.seal_end_watch(p_cylinder uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$ begin return; end $$;

-- Desbloqueio lógico da Spec 008 registrado junto com o destravamento físico pedido (História 3, cenário 1).
create function private.seal_logical_unlock(p_item public.trip_items, p_actor uuid, p_request uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_item.lock_status <> 'locked' or exists (select 1 from public.trip_unlocks u where u.item_id = p_item.id) then return; end if;
  update public.trip_items set lock_status = 'unlocked', updated_at = now() where id = p_item.id;
  insert into public.trip_unlocks (organization_id, item_id, request_id, exceptional, aal, actor_user_id)
  values (p_item.organization_id, p_item.id, p_request, false, 'aal1', p_actor);
  perform private.append_trip_event(p_item.trip_id, p_item.organization_id, 'unlock_registered', p_actor, null, null,
    jsonb_build_object('item_id', p_item.id, 'exceptional', false, 'item_status', 'delivered', 'by', 'seal_delivery'));
end $$;

create function private.seal_on_delivery_recorded(p_delivery public.trip_deliveries) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_limits jsonb := private.seal_limits();
  v_stop public.trip_stops;
  v_entry jsonb;
  v_item public.trip_items;
  v_device public.seal_devices;
  v_position public.seal_positions;
  v_method text;
  v_lat numeric;
  v_lng numeric;
  v_read timestamptz;
  v_inside boolean;
  v_previous boolean;
  v_command uuid;
begin
  select s.* into v_stop from public.trip_stops s where s.id = p_delivery.stop_id;
  for v_entry in select value from jsonb_array_elements(p_delivery.results) loop
    select i.* into v_item from public.trip_items i where i.id = (v_entry->>'item_id')::uuid and i.organization_id = p_delivery.organization_id;
    if v_item.id is null then continue; end if;
    select d.* into v_device from public.seal_bindings b join public.seal_devices d on d.id = b.device_id
     where b.cylinder_id = v_item.cylinder_id and b.unbound_at is null and d.status = 'active';
    if v_device.id is null then continue; end if;

    if (v_entry->>'delivered')::boolean then
      -- Já destravado, ou já com um destravamento da entrega em curso: nada a destravar, mas a vigilância começa do mesmo jeito.
      if v_device.lock_state = 'unlocked' or exists (select 1 from public.seal_commands c where c.trip_item_id = v_item.id and c.kind = 'unlock'
           and c.origin = 'delivery' and c.status in ('pending', 'delivered', 'confirmed')) then
        update public.trip_items set seal_unlock_note = null where id = v_item.id;
        perform private.seal_start_watch(v_item, v_stop.site_id);
        continue;
      end if;
      v_method := null;
      select p.* into v_position from public.seal_positions p
       where p.device_id = v_device.id and p.quality = 'gps' and p.read_at <= p_delivery.delivered_at
         and p.last_seen_at >= p_delivery.delivered_at - make_interval(secs => (v_limits->>'delivery_seal_position_max_age_s')::int)
       order by p.read_at desc limit 1;
      if v_position.id is not null then
        v_method := 'seal';
        v_lat := extensions.st_y(v_position.point::extensions.geometry);
        v_lng := extensions.st_x(v_position.point::extensions.geometry);
        v_read := greatest(v_position.read_at, least(v_position.last_seen_at, p_delivery.delivered_at));
      elsif p_delivery.position_source = 'gps' and p_delivery.latitude is not null then
        v_method := 'phone';
        v_lat := p_delivery.latitude;
        v_lng := p_delivery.longitude;
        v_read := coalesce(p_delivery.position_read_at, p_delivery.delivered_at);
      end if;

      v_inside := case when v_method is null then null else private.point_inside_site_geofence(v_stop.site_id, v_lat, v_lng) end;
      if v_method is not null and v_inside is true then
        v_command := private.issue_seal_command(v_device.id, 'unlock', 'delivery', null, null, null, v_item.trip_id, v_item.id, null,
          jsonb_build_object('proof', jsonb_build_object('method', v_method, 'read_at', v_read, 'delivery_id', p_delivery.id,
            'previous_lock_state', v_device.lock_state)));
        update public.trip_items set seal_unlock_note = null where id = v_item.id;
        perform private.seal_logical_unlock(v_item, p_delivery.recorded_by, p_delivery.request_id);
      else
        update public.trip_items set seal_unlock_note = case
          when not exists (select 1 from public.geofences g where g.site_id = v_stop.site_id and g.status = 'active') then 'no_geofence'
          when v_method is null then 'no_proof'
          else 'outside_geofence' end
         where id = v_item.id;
      end if;
      perform private.seal_start_watch(v_item, v_stop.site_id);
    else
      -- Correção para "não entregue" depois de um destravamento da entrega: o lacre volta a travar (História 3, cenário 7).
      v_previous := p_delivery.supersedes_id is not null and exists (select 1 from public.seal_commands c where c.trip_item_id = v_item.id
        and c.kind = 'unlock' and c.origin = 'delivery' and c.status in ('pending', 'delivered', 'confirmed'));
      if v_previous then
        perform private.issue_seal_command(v_device.id, 'lock', 'delivery_correction', null, null, null, v_item.trip_id, v_item.id, null);
        perform private.seal_end_watch(v_item.cylinder_id, 'new_trip');
      end if;
    end if;
  end loop;
end $$;

create function private.seal_delivery_trigger() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform private.seal_on_delivery_recorded(new);
  return null;
end $$;
create trigger trip_deliveries_seal_unlock after insert on public.trip_deliveries
  for each row execute function private.seal_delivery_trigger();

-- Cilindro devolvido ao estoque (cancelamento ou retorno): destravar, uma vez por item (RF-023 e casos de borda).
create or replace function private.seal_trip_item_trigger() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_device uuid;
begin
  if old.item_status = 'checked' and new.item_status = 'in_transit'
     and exists (select 1 from public.trips t where t.id = new.trip_id and t.status = 'in_progress') then
    perform private.seal_on_item_departed(new);
  elsif new.item_status = 'returned' and old.item_status is distinct from 'returned'
     and not exists (select 1 from public.seal_commands c where c.trip_item_id = new.id and c.origin = 'trip_cancel') then
    select d.id into v_device from public.seal_bindings b join public.seal_devices d on d.id = b.device_id
     where b.cylinder_id = new.cylinder_id and b.unbound_at is null and d.status = 'active' and d.lock_state <> 'unlocked';
    if v_device is not null then
      perform private.issue_seal_command(v_device, 'unlock', 'trip_cancel', null, null, null, new.trip_id, new.id, null);
    end if;
  end if;
  return null;
end $$;

-- A leitura da viagem passa a trazer o motivo de não ter destravado.
create or replace function public.trip_seal_view(p_actor uuid, p_session uuid, p_organization uuid, p_trip uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  denied text;
begin
  denied := private.cylinder_authorize(p_actor, p_session, p_organization, 'seal.read');
  if denied is not null then return jsonb_build_object('code', denied); end if;
  if not exists (select 1 from public.trips t where t.id = p_trip and t.organization_id = p_organization) then
    return jsonb_build_object('code', 'NOT_FOUND');
  end if;
  return jsonb_build_object('code', 'FOUND', 'items', coalesce((
    select jsonb_agg(jsonb_build_object('item_id', i.id, 'cylinder_id', i.cylinder_id, 'serial_number', c.serial_number,
        'seal_command_id', i.seal_command_id, 'unlock_note', i.seal_unlock_note,
        'seal', case when b.device_id is null then null else private.seal_device_summary(b.device_id) end) order by c.serial_number)
      from public.trip_items i
      join public.cylinders c on c.id = i.cylinder_id
      left join public.seal_bindings b on b.cylinder_id = i.cylinder_id and b.unbound_at is null
     where i.trip_id = p_trip and i.organization_id = p_organization and i.item_status <> 'removed'), '[]'::jsonb));
end $$;

revoke all on function private.seal_start_watch(public.trip_items, uuid), private.seal_end_watch(uuid, text),
  private.seal_logical_unlock(public.trip_items, uuid, uuid), private.seal_on_delivery_recorded(public.trip_deliveries),
  private.seal_delivery_trigger() from public, anon, authenticated;
