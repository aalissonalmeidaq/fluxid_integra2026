-- Spec 013, US3: o tenant devolve o lacre à plataforma e vê só os lacres destinados a ele (RF-013a, RF-015, RN-006; research.md,
-- item 8; contracts/operacoes-plataforma.md). A devolução usa o mesmo auxiliar da retirada (vínculo, comandos, vigilância e alertas)
-- e põe o pedido de volta na fila do Master como "devolvido", pedindo ao lacre o esquecimento de todas as redes do tenant.

create function public.return_device(p_actor uuid, p_session uuid, p_organization uuid, p_request uuid, p_device uuid, p_justification text)
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

-- O resumo do dispositivo ganha a aprovação, o "pronto para vincular", a origem, o motivo da inativação e se o cilindro está em viagem
-- (para a tela explicar por que não dá para devolver).
create or replace function private.seal_device_summary(p_device uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'device_id', d.id, 'device_code', d.device_code, 'label', d.label, 'status', d.status, 'health', d.health,
    'lock_state', d.lock_state, 'seal_state', d.seal_state, 'battery_pct', d.battery_pct, 'signal_dbm', d.signal_dbm,
    'last_seen_at', d.last_seen_at, 'report_interval_s', d.report_interval_s,
    'approved_at', d.approved_at, 'inactive_reason', d.inactive_reason,
    'origin', case when d.approved_by is null then 'manual' else 'enrollment' end,
    'ready_to_bind', d.status = 'active' and not exists (select 1 from public.seal_bindings b where b.device_id = d.id and b.unbound_at is null),
    'in_trip', private.seal_device_in_trip(d.id),
    'position', (select jsonb_build_object(
        'latitude', round(extensions.st_y(p.point::extensions.geometry)::numeric, 6), 'longitude', round(extensions.st_x(p.point::extensions.geometry)::numeric, 6),
        'accuracy_m', p.accuracy_m, 'quality', p.quality, 'read_at', p.read_at, 'last_seen_at', p.last_seen_at)
      from public.seal_positions p where p.id = d.last_position_id),
    'pending_command', (select jsonb_build_object('id', c.id, 'kind', c.kind, 'status', c.status, 'origin', c.origin, 'created_at', c.created_at)
      from public.seal_commands c where c.device_id = d.id and c.status in ('pending', 'delivered') and c.kind in ('lock', 'unlock')
      order by c.created_at desc limit 1),
    'watch', (select jsonb_build_object('site_id', w.site_id, 'site_name', s.name, 'started_at', w.started_at, 'suspended', w.suspended_at is not null)
      from public.seal_watches w join public.customer_sites s on s.id = w.site_id where w.device_id = d.id and w.ended_at is null limit 1),
    'violation', (select jsonb_build_object('id', v.id, 'status', v.status, 'first_outside_at', v.first_outside_at, 'distance_m', v.distance_m, 'returned_at', v.returned_at)
      from public.seal_violations v where v.device_id = d.id and v.status in ('open', 'returned') order by v.first_outside_at desc limit 1))
  from public.seal_devices d where d.id = p_device
$$;

-- A lista do tenant mostra por padrão só as linhas ativas; as de destinações anteriores, com o filtro de histórico.
drop function public.list_seals(uuid, uuid, uuid, text, text, boolean, integer, integer);
create function public.list_seals(p_actor uuid, p_session uuid, p_organization uuid, p_health text default null, p_lock text default null,
  p_unbound boolean default null, p_offset integer default 0, p_limit integer default 50, p_history boolean default false)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  denied text;
  v_items jsonb;
  v_total integer;
begin
  denied := private.cylinder_authorize(p_actor, p_session, p_organization, 'seal.read');
  if denied is not null then return jsonb_build_object('code', denied); end if;
  with filtered as (
    select d.id, d.label, b.cylinder_id, c.serial_number, c.custody_status
      from public.seal_devices d
      left join public.seal_bindings b on b.device_id = d.id and b.unbound_at is null
      left join public.cylinders c on c.id = b.cylinder_id
     where d.organization_id = p_organization
       and (coalesce(p_history, false) or d.status = 'active')
       and (p_health is null or d.health = p_health)
       and (p_lock is null or d.lock_state = p_lock)
       and (p_unbound is null or (b.id is null) = p_unbound)
  )
  select (select count(*) from filtered),
         coalesce((select jsonb_agg(private.seal_device_summary(f.id) || jsonb_build_object(
             'cylinder', case when f.cylinder_id is null then null else jsonb_build_object('id', f.cylinder_id, 'serial_number', f.serial_number, 'custody_status', f.custody_status) end)
           order by f.label, f.id)
           from (select * from filtered order by label, id offset greatest(p_offset, 0) limit least(greatest(p_limit, 1), 200)) f), '[]'::jsonb)
    into v_total, v_items;
  return jsonb_build_object('code', 'LISTED', 'items', v_items, 'total', v_total);
end $$;

-- "Vincular lacre": o lacre aprovado pelo Master entra na lista mesmo antes da primeira ativação (História 3, cenário 4).
create or replace function public.list_unbound_active_seals(p_actor uuid, p_session uuid, p_organization uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  denied text;
begin
  denied := private.cylinder_authorize(p_actor, p_session, p_organization, 'seal.read');
  if denied is not null then return jsonb_build_object('code', denied); end if;
  return jsonb_build_object('code', 'LISTED', 'items', coalesce((
    select jsonb_agg(private.seal_device_summary(d.id) || jsonb_build_object('activated_at', d.activated_at)
        order by coalesce(d.activated_at, d.approved_at) desc)
      from public.seal_devices d
     where d.organization_id = p_organization and d.status = 'active' and (d.activated_at is not null or d.approved_at is not null)
       and not exists (select 1 from public.seal_bindings b where b.device_id = d.id and b.unbound_at is null)), '[]'::jsonb));
end $$;

revoke all on function public.return_device(uuid, uuid, uuid, uuid, uuid, text),
  public.list_seals(uuid, uuid, uuid, text, text, boolean, integer, integer, boolean) from public, anon, authenticated;
grant execute on function public.return_device(uuid, uuid, uuid, uuid, uuid, text),
  public.list_seals(uuid, uuid, uuid, text, text, boolean, integer, integer, boolean) to service_role;
