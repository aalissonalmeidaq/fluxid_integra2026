-- Spec 012, US2: trava no início da viagem (RF-023, RN-008, MS-003; research.md, item 11). Gatilhos `after` nas tabelas da Spec 008,
-- sem reescrever as RPCs dela. A `start_trip` muda a viagem e depois os itens; por isso o gatilho fica no item, quando ele sai
-- (conferido → em trânsito). A viagem não espera a confirmação; a trava ainda pendente é cancelada quando a viagem termina.

-- Um `lock` por item que saiu, se o cilindro tem lacre ativo vinculado; nunca dois para o mesmo item (índice único por item e origem).
create function private.seal_on_item_departed(p_item public.trip_items) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_device uuid;
  v_command uuid;
begin
  if p_item.seal_command_id is not null
     or exists (select 1 from public.seal_commands c where c.trip_item_id = p_item.id and c.origin = 'trip_start') then
    return;
  end if;
  select d.id into v_device from public.seal_bindings b join public.seal_devices d on d.id = b.device_id
   where b.cylinder_id = p_item.cylinder_id and b.unbound_at is null and d.status = 'active';
  if v_device is null then return; end if;
  v_command := private.issue_seal_command(v_device, 'lock', 'trip_start', null, null, null, p_item.trip_id, p_item.id, null);
  update public.trip_items set seal_command_id = v_command where id = p_item.id;
end $$;

create function private.seal_trip_item_trigger() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.item_status = 'checked' and new.item_status = 'in_transit'
     and exists (select 1 from public.trips t where t.id = new.trip_id and t.status = 'in_progress') then
    perform private.seal_on_item_departed(new);
  end if;
  return null;
end $$;
create trigger trip_items_seal_departure after update of item_status on public.trip_items
  for each row execute function private.seal_trip_item_trigger();

-- Viagem concluída ou cancelada: a trava de início que nem chegou ao lacre deixa de valer (RF-028, motivo encerrado).
create function private.seal_trip_status_trigger() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_command public.seal_commands;
begin
  if new.status in ('completed', 'cancelled') and old.status is distinct from new.status then
    for v_command in
      select c.* from public.seal_commands c where c.trip_id = new.id and c.origin = 'trip_start' and c.status = 'pending' for update
    loop
      perform private.seal_command_event(v_command, 'cancelled', 'system', null, jsonb_build_object('reason', 'trip_closed'));
      update public.seal_commands set status = 'cancelled', cancel_reason = 'trip_closed', finished_at = now(), updated_at = now() where id = v_command.id;
      perform private.seal_broadcast(v_command.organization_id, 'command', v_command.device_id, v_command.cylinder_id);
    end loop;
  end if;
  return null;
end $$;
create trigger trips_seal_status after update of status on public.trips
  for each row execute function private.seal_trip_status_trigger();

revoke all on function private.seal_on_item_departed(public.trip_items), private.seal_trip_item_trigger(), private.seal_trip_status_trigger()
  from public, anon, authenticated;
