-- Spec 015 (T045a, T045b; RF-016, RF-017): a entrega fecha o par do cilindro entregue — a partir dela vale a vigilância da geocerca de
-- destino da Spec 012, que este gatilho não altera — e, quando o item foi lido presencialmente (câmera, NFC ou digitação) com a coleta
-- ativa, registra uma presença pontual. A marcação `manual` não é leitura presencial. Uma correção para "não entregue" reabre o par.
-- `check_item` não participa: ela só roda no carregamento, antes de a coleta começar.

create function private.register_proximity_presence(p_delivery public.trip_deliveries, p_item public.trip_items, p_source text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_session uuid;
begin
  if p_source not in ('camera', 'nfc', 'typed') then return; end if;
  select s.id into v_session from public.tracking_sessions s
   where s.trip_id = p_item.trip_id and s.status = 'active' order by s.started_at desc limit 1;
  if v_session is null then return; end if;
  insert into public.proximity_presence_evidences (organization_id, tracking_session_id, trip_id, trip_item_id, cylinder_id, delivery_id, source,
    confirmed_by, observed_at)
  values (p_delivery.organization_id, v_session, p_item.trip_id, p_item.id, p_item.cylinder_id, p_delivery.id, p_source,
    p_delivery.recorded_by, p_delivery.delivered_at)
  on conflict (delivery_id, trip_item_id) do nothing;
end $$;

create function private.end_proximity_for_delivery(p_delivery public.trip_deliveries, p_item public.trip_items, p_delivered boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_delivered then
    update public.proximity_pairs set status = 'delivered', ended_at = p_delivery.delivered_at, updated_at = now()
     where trip_item_id = p_item.id and organization_id = p_delivery.organization_id and status = 'active';
  elsif p_delivery.supersedes_id is not null then
    update public.proximity_pairs p set status = 'active', ended_at = null, updated_at = now()
     where p.trip_item_id = p_item.id and p.organization_id = p_delivery.organization_id and p.status = 'delivered'
       and exists (select 1 from public.tracking_sessions s where s.id = p.tracking_session_id and s.status = 'active');
  end if;
end $$;

create function private.tracking_on_delivery() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_entry jsonb;
  v_item public.trip_items;
begin
  for v_entry in select value from jsonb_array_elements(new.results) loop
    select i.* into v_item from public.trip_items i where i.id = (v_entry->>'item_id')::uuid and i.organization_id = new.organization_id;
    if v_item.id is null then continue; end if;
    perform private.end_proximity_for_delivery(new, v_item, coalesce((v_entry->>'delivered')::boolean, false));
    if coalesce((v_entry->>'delivered')::boolean, false) then
      perform private.register_proximity_presence(new, v_item, coalesce(v_entry->>'source', 'manual'));
    end if;
  end loop;
  return null;
end $$;

create trigger trip_deliveries_tracking after insert on public.trip_deliveries for each row execute function private.tracking_on_delivery();

revoke all on function private.register_proximity_presence(public.trip_deliveries, public.trip_items, text),
  private.end_proximity_for_delivery(public.trip_deliveries, public.trip_items, boolean), private.tracking_on_delivery()
  from public, anon, authenticated;
