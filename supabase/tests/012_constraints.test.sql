begin;
select plan(44);

-- Spec 012: restrições do data-model.md, citadas literalmente. Hermético: desfeito pelo rollback.

insert into public.cylinder_types (id, organization_id, gas, capacity_value, capacity_unit, classification) values
  ('a1270000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', 'Oxigênio', 10, 'l', 'medicinal'),
  ('a1270000-0000-0000-0000-00000000000b', '20000000-0000-0000-0000-00000000000b', 'Oxigênio', 10, 'l', 'medicinal');
insert into public.cylinders (id, organization_id, cylinder_type_id, serial_number) values
  ('a1280000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-00000000000a', 'a1270000-0000-0000-0000-00000000000a', 'SEAL-A-001'),
  ('a1280000-0000-0000-0000-0000000000a2', '20000000-0000-0000-0000-00000000000a', 'a1270000-0000-0000-0000-00000000000a', 'SEAL-A-002'),
  ('a1280000-0000-0000-0000-0000000000b1', '20000000-0000-0000-0000-00000000000b', 'a1270000-0000-0000-0000-00000000000b', 'SEAL-B-001');
insert into public.customers (id, organization_id, person_type, document_display, legal_name, segment) values
  ('a1210000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', 'legal', '11222333000181', 'Hospital Alfa Ltda', 'hospital');
insert into public.customer_sites (id, organization_id, customer_id, name, postal_code, street, number, city, state) values
  ('a1220000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', 'a1210000-0000-0000-0000-00000000000a', 'Unidade A', '01001000', 'Praça da Sé', '1', 'São Paulo', 'SP');

insert into public.seal_devices (id, organization_id, device_code, label, key_hash, created_by) values
  ('a1200000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-00000000000a', 'DSP-7KQ2M9XT', 'Lacre A1', extensions.digest('k1', 'sha256'), '10000000-0000-0000-0000-000000000002'),
  ('a1200000-0000-0000-0000-0000000000a2', '20000000-0000-0000-0000-00000000000a', 'DSP-8HJ3N4PW', 'Lacre A2', extensions.digest('k2', 'sha256'), '10000000-0000-0000-0000-000000000002'),
  ('a1200000-0000-0000-0000-0000000000b1', '20000000-0000-0000-0000-00000000000b', 'DSP-9ABCDEFG', 'Lacre B1', extensions.digest('k3', 'sha256'), '10000000-0000-0000-0000-000000000003');

-- seal_devices
select throws_ok($$ insert into public.seal_devices (organization_id, device_code, label, key_hash, created_by) values
  ('20000000-0000-0000-0000-00000000000a', 'XYZ-123', 'Lacre', extensions.digest('x', 'sha256'), '10000000-0000-0000-0000-000000000002') $$,
  '23514', null, 'device_code fora do formato DSP- + 8 caracteres é recusado');
select throws_ok($$ insert into public.seal_devices (organization_id, device_code, label, key_hash, created_by) values
  ('20000000-0000-0000-0000-00000000000b', 'DSP-7KQ2M9XT', 'Lacre', extensions.digest('x', 'sha256'), '10000000-0000-0000-0000-000000000003') $$,
  '23505', null, 'device_code é único no FluxID inteiro, mesmo em outra organização');
select throws_ok($$ insert into public.seal_devices (organization_id, device_code, label, key_hash, created_by) values
  ('20000000-0000-0000-0000-00000000000a', 'DSP-AAAAAAAA', 'L', extensions.digest('x', 'sha256'), '10000000-0000-0000-0000-000000000002') $$,
  '23514', null, 'label tem de 2 a 60 caracteres');
select throws_ok($$ insert into public.seal_devices (organization_id, device_code, label, key_hash, created_by) values
  ('20000000-0000-0000-0000-00000000000a', 'DSP-AAAAAAAB', 'Lacre', '\x00'::bytea, '10000000-0000-0000-0000-000000000002') $$,
  '23514', null, 'key_hash é um SHA-256 (32 bytes)');
select throws_ok($$ update public.seal_devices set status = 'broken' where id = 'a1200000-0000-0000-0000-0000000000a1' $$,
  '23514', null, 'status ∈ active, inactive');
select throws_ok($$ update public.seal_devices set report_interval_s = 20 where id = 'a1200000-0000-0000-0000-0000000000a1' $$,
  '23514', null, 'report_interval_s de 30 a 900');
select is((select report_interval_s from public.seal_devices where id = 'a1200000-0000-0000-0000-0000000000a1'), 60, 'report_interval_s padrão 60');
select is((select health || '/' || lock_state || '/' || seal_state from public.seal_devices where id = 'a1200000-0000-0000-0000-0000000000a1'),
  'never_seen/none/unknown', 'padrões: saúde never_seen, trava none, lacre unknown');
select throws_ok($$ update public.seal_devices set health = 'dead' where id = 'a1200000-0000-0000-0000-0000000000a1' $$,
  '23514', null, 'health ∈ ok, no_gps, low_battery, no_comm, off, never_seen');
select throws_ok($$ update public.seal_devices set seal_state = 'cut' where id = 'a1200000-0000-0000-0000-0000000000a1' $$,
  '23514', null, 'seal_state ∈ closed, open, broken, unknown');
select throws_ok($$ update public.seal_devices set lock_state = 'jammed' where id = 'a1200000-0000-0000-0000-0000000000a1' $$,
  '23514', null, 'lock_state ∈ none, locked, unlocked, unconfirmed, locked_violation, locked_comm_loss');
select throws_ok($$ update public.seal_devices set battery_pct = 101 where id = 'a1200000-0000-0000-0000-0000000000a1' $$,
  '23514', null, 'battery_pct de 0 a 100');
update public.seal_devices set seal_code = 'LCR-JKFL6VBR' where id = 'a1200000-0000-0000-0000-0000000000a1';
select throws_ok($$ update public.seal_devices set seal_code = 'LCR-JKFL6VBR' where id = 'a1200000-0000-0000-0000-0000000000b1' $$,
  '23505', null, 'seal_code é único');

-- seal_device_events
select throws_ok($$ insert into public.seal_device_events (organization_id, device_id, event_type, by_user) values
  ('20000000-0000-0000-0000-00000000000a', 'a1200000-0000-0000-0000-0000000000a1', 'exploded', '10000000-0000-0000-0000-000000000002') $$,
  '23514', null, 'event_type na lista do data-model');
select throws_ok($$ insert into public.seal_device_events (organization_id, device_id, event_type, by_user) values
  ('20000000-0000-0000-0000-00000000000a', 'a1200000-0000-0000-0000-0000000000a1', 'deactivated', '10000000-0000-0000-0000-000000000002') $$,
  '23514', null, 'deactivated exige justificativa de 5 a 500');
select throws_ok($$ insert into public.seal_device_events (organization_id, device_id, event_type, justification, by_user) values
  ('20000000-0000-0000-0000-00000000000a', 'a1200000-0000-0000-0000-0000000000a1', 'key_rotated', 'oi', '10000000-0000-0000-0000-000000000002') $$,
  '23514', null, 'key_rotated exige justificativa de 5 a 500');

-- seal_bindings
insert into public.seal_bindings (organization_id, device_id, cylinder_id, bound_by) values
  ('20000000-0000-0000-0000-00000000000a', 'a1200000-0000-0000-0000-0000000000a1', 'a1280000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-000000000002');
select throws_ok($$ insert into public.seal_bindings (organization_id, device_id, cylinder_id, bound_by) values
  ('20000000-0000-0000-0000-00000000000a', 'a1200000-0000-0000-0000-0000000000a1', 'a1280000-0000-0000-0000-0000000000a2', '10000000-0000-0000-0000-000000000002') $$,
  '23505', null, 'um lacre tem no máximo um cilindro por vez');
select throws_ok($$ insert into public.seal_bindings (organization_id, device_id, cylinder_id, bound_by) values
  ('20000000-0000-0000-0000-00000000000a', 'a1200000-0000-0000-0000-0000000000a2', 'a1280000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-000000000002') $$,
  '23505', null, 'um cilindro tem no máximo um lacre por vez');
select throws_ok($$ insert into public.seal_bindings (organization_id, device_id, cylinder_id, bound_by) values
  ('20000000-0000-0000-0000-00000000000a', 'a1200000-0000-0000-0000-0000000000a2', 'a1280000-0000-0000-0000-0000000000b1', '10000000-0000-0000-0000-000000000002') $$,
  '23503', null, 'o vínculo não aponta para cilindro de outra organização');
select throws_ok($$ update public.seal_bindings set unbound_at = now(), unbound_by = '10000000-0000-0000-0000-000000000002', unbind_reason = 'lost'
  where device_id = 'a1200000-0000-0000-0000-0000000000a1' $$, '23514', null, 'unbind_reason ∈ manual, device_inactivated, cylinder_inactivated, replaced');
select throws_ok($$ update public.seal_bindings set unbound_at = now(), unbound_by = '10000000-0000-0000-0000-000000000002', unbind_reason = 'manual'
  where device_id = 'a1200000-0000-0000-0000-0000000000a1' $$, '23514', null, 'desvínculo manual exige justificativa de 5 a 500');

-- seal_messages e seal_positions
insert into public.seal_messages (organization_id, device_id, message_id, type, read_at, outcome) values
  ('20000000-0000-0000-0000-00000000000a', 'a1200000-0000-0000-0000-0000000000a1', 'M-1', 'position', now(), 'stored');
select throws_ok($$ insert into public.seal_messages (organization_id, device_id, message_id, type, read_at, outcome) values
  ('20000000-0000-0000-0000-00000000000a', 'a1200000-0000-0000-0000-0000000000a1', 'M-1', 'position', now(), 'stored') $$,
  '23505', null, 'unique (device_id, message_id)');
select throws_ok($$ insert into public.seal_messages (organization_id, device_id, message_id, type, read_at, outcome) values
  ('20000000-0000-0000-0000-00000000000a', 'a1200000-0000-0000-0000-0000000000a1', repeat('x', 65), 'position', now(), 'stored') $$,
  '23514', null, 'message_id até 64 caracteres');
select throws_ok($$ insert into public.seal_messages (organization_id, device_id, message_id, type, read_at, outcome) values
  ('20000000-0000-0000-0000-00000000000a', 'a1200000-0000-0000-0000-0000000000a1', 'M-2', 'telemetry', now(), 'stored') $$,
  '23514', null, 'type ∈ position, event, alert, command_result, activation, shutdown, network_change, auto_lock');
select throws_ok($$ insert into public.seal_positions (organization_id, device_id, point, quality, seal_state, read_at) values
  ('20000000-0000-0000-0000-00000000000a', 'a1200000-0000-0000-0000-0000000000a1',
   extensions.st_setsrid(extensions.st_makepoint(-39.3, -7.2), 4326)::extensions.geography, 'wifi', 'closed', now()) $$,
  '23514', null, 'quality ∈ gps, last_known');

-- seal_commands
select throws_ok($$ insert into public.seal_commands (organization_id, device_id, kind, origin) values
  ('20000000-0000-0000-0000-00000000000a', 'a1200000-0000-0000-0000-0000000000a1', 'reboot', 'manual') $$,
  '23514', null, 'kind ∈ lock, unlock, wifi_add, wifi_remove, wifi_reset');
select throws_ok($$ insert into public.seal_commands (organization_id, device_id, kind, origin) values
  ('20000000-0000-0000-0000-00000000000a', 'a1200000-0000-0000-0000-0000000000a1', 'lock', 'whim') $$,
  '23514', null, 'origin na lista do data-model');
select throws_ok($$ insert into public.seal_commands (organization_id, device_id, kind, origin, status) values
  ('20000000-0000-0000-0000-00000000000a', 'a1200000-0000-0000-0000-0000000000a1', 'lock', 'trip_start', 'done') $$,
  '23514', null, 'status ∈ pending, delivered, confirmed, failed, cancelled, expired');
select throws_ok($$ insert into public.seal_commands (organization_id, device_id, kind, origin, requested_by) values
  ('20000000-0000-0000-0000-00000000000a', 'a1200000-0000-0000-0000-0000000000a1', 'lock', 'manual', '10000000-0000-0000-0000-000000000002') $$,
  '23514', null, 'manual exige justificativa de 5 a 500');
select throws_ok($$ insert into public.seal_commands (organization_id, device_id, kind, origin, requested_by, justification, aal) values
  ('20000000-0000-0000-0000-00000000000a', 'a1200000-0000-0000-0000-0000000000a1', 'unlock', 'exceptional', '10000000-0000-0000-0000-000000000002', 'Cliente pediu', 'aal1') $$,
  '23514', null, 'exceptional exige aal2');
select throws_ok($$ insert into public.seal_commands (organization_id, device_id, kind, origin, requested_by) values
  ('20000000-0000-0000-0000-00000000000a', 'a1200000-0000-0000-0000-0000000000a1', 'wifi_reset', 'admin_network', '10000000-0000-0000-0000-000000000002') $$,
  '23514', null, 'wifi_reset exige justificativa de 5 a 500');
select throws_ok($$ insert into public.seal_commands (organization_id, device_id, kind, origin, wifi_ssid) values
  ('20000000-0000-0000-0000-00000000000a', 'a1200000-0000-0000-0000-0000000000a1', 'lock', 'trip_start', 'Rede') $$,
  '23514', null, 'wifi_ssid só nos comandos de rede');
select throws_ok($$ insert into public.seal_commands (organization_id, device_id, kind, origin, requested_by, wifi_ssid) values
  ('20000000-0000-0000-0000-00000000000a', 'a1200000-0000-0000-0000-0000000000a1', 'wifi_add', 'admin_network', '10000000-0000-0000-0000-000000000002', repeat('r', 33)) $$,
  '23514', null, 'wifi_ssid até 32 bytes');
select ok(exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'seal_commands_trip_item_origin_key'
  and indexdef ilike '%unique%' and indexdef ilike '%trip_start%'), 'índice único parcial (trip_item_id, origin) nas origens de viagem');

-- seal_watches, seal_violations
insert into public.seal_watches (id, organization_id, cylinder_id, device_id, site_id) values
  ('a1290000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', 'a1280000-0000-0000-0000-0000000000a1', 'a1200000-0000-0000-0000-0000000000a1', 'a1220000-0000-0000-0000-00000000000a');
select throws_ok($$ insert into public.seal_watches (organization_id, cylinder_id, device_id, site_id) values
  ('20000000-0000-0000-0000-00000000000a', 'a1280000-0000-0000-0000-0000000000a1', 'a1200000-0000-0000-0000-0000000000a1', 'a1220000-0000-0000-0000-00000000000a') $$,
  '23505', null, 'uma vigilância aberta por cilindro');
select throws_ok($$ update public.seal_watches set ended_at = now(), end_reason = 'bored' where id = 'a1290000-0000-0000-0000-00000000000a' $$,
  '23514', null, 'end_reason ∈ new_trip, stock_in, unbound, cylinder_inactivated');
select throws_ok($$ insert into public.seal_violations (organization_id, watch_id, cylinder_id, device_id, first_outside_at, status) values
  ('20000000-0000-0000-0000-00000000000a', 'a1290000-0000-0000-0000-00000000000a', 'a1280000-0000-0000-0000-0000000000a1', 'a1200000-0000-0000-0000-0000000000a1', now(), 'ignored') $$,
  '23514', null, 'violation status ∈ open, returned, closed');

-- seal_alerts
insert into public.seal_alerts (organization_id, device_id, kind, severity, source) values
  ('20000000-0000-0000-0000-00000000000a', 'a1200000-0000-0000-0000-0000000000a1', 'no_comm', 'medium', 'system');
select throws_ok($$ insert into public.seal_alerts (organization_id, device_id, kind, severity, source) values
  ('20000000-0000-0000-0000-00000000000a', 'a1200000-0000-0000-0000-0000000000a1', 'no_comm', 'medium', 'system') $$,
  '23505', null, 'um alerta aberto por dispositivo e tipo');
select throws_ok($$ insert into public.seal_alerts (organization_id, device_id, kind, severity, source) values
  ('20000000-0000-0000-0000-00000000000a', 'a1200000-0000-0000-0000-0000000000a1', 'bad_mood', 'medium', 'system') $$,
  '23514', null, 'kind na lista de 16 tipos');
select throws_ok($$ insert into public.seal_alerts (organization_id, device_id, kind, severity, source) values
  ('20000000-0000-0000-0000-00000000000a', 'a1200000-0000-0000-0000-0000000000a1', 'no_gps', 'low', 'system') $$,
  '23514', null, 'severity ∈ medium, high, critical');
select throws_ok($$ update public.seal_alerts set status = 'closed', closed_at = now(), closed_by = '10000000-0000-0000-0000-000000000002'
  where kind = 'no_comm' $$, '23514', null, 'encerrar exige close_note de 5 a 500');

-- push
insert into public.push_subscriptions (organization_id, user_id, endpoint, p256dh, auth_secret) values
  ('20000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-000000000002', 'https://push.example.invalid/1', 'p', 'a');
select throws_ok($$ insert into public.push_subscriptions (organization_id, user_id, endpoint, p256dh, auth_secret) values
  ('20000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-000000000002', 'https://push.example.invalid/1', 'p', 'a') $$,
  '23505', null, 'endpoint único');
select throws_ok($$ update public.push_subscriptions set revoked_at = now(), revoke_reason = 'tired' $$,
  '23514', null, 'revoke_reason ∈ user, permission_lost, gone');

-- Extensão da Spec 008
select ok(exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'trip_items'
  and column_name = 'seal_command_id' and is_nullable = 'YES' and column_default is null), 'trip_items.seal_command_id existe e é nulo por padrão');

select * from finish();
rollback;
