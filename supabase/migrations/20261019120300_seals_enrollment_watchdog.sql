-- Spec 013, US2: o vigia também expira os pedidos pendentes sem chamada há 7 dias (RF-017; research.md, item 11). O resto do vigia da
-- Spec 012 não muda; ele já olha só as linhas ativas de seal_devices, então a linha devolvida ou retirada nunca vira "sem comunicação".

create function private.seal_watchdog_enrollments() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_expired integer;
begin
  update public.seal_enrollments set status = 'expired', updated_at = now()
   where status = 'pending' and last_seen_at < now() - make_interval(secs => (private.seal_enrollment_limits()->>'pending_expiry_s')::int);
  get diagnostics v_expired = row_count;
  return v_expired;
end $$;

create or replace function private.run_seal_watchdog() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_limits jsonb := private.seal_limits();
  v_device public.seal_devices;
  v_silent integer := 0;
  v_no_gps integer := 0;
begin
  for v_device in
    select d.* from public.seal_devices d
     where d.status = 'active' and d.last_seen_at is not null and d.health not in ('no_comm', 'off')
       and d.last_seen_at < now() - make_interval(secs => d.report_interval_s + (v_limits->>'no_comm_grace_s')::int)
     for update skip locked
  loop
    perform private.seal_set_health(v_device.id, 'no_comm');
    perform private.seal_open_silence_alert(v_device.id, 'no_comm');
    v_silent := v_silent + 1;
  end loop;

  for v_device in
    select d.* from public.seal_devices d
     where d.status = 'active' and d.health in ('ok', 'low_battery') and d.no_gps_since is not null
       and d.no_gps_since < now() - make_interval(secs => d.report_interval_s * (v_limits->>'no_gps_intervals')::int)
     for update skip locked
  loop
    perform private.seal_set_health(v_device.id, 'no_gps');
    perform private.open_seal_alert(v_device.id, 'no_gps', 'medium', 'system', jsonb_build_object('since', v_device.no_gps_since), false);
    v_no_gps := v_no_gps + 1;
  end loop;

  perform private.seal_watchdog_commands();
  perform private.seal_watchdog_watches();
  perform private.seal_watchdog_push();
  return jsonb_build_object('no_comm', v_silent, 'no_gps', v_no_gps, 'expired_enrollments', private.seal_watchdog_enrollments());
end $$;

revoke all on function private.seal_watchdog_enrollments(), private.run_seal_watchdog() from public, anon, authenticated;
