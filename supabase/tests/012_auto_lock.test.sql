begin;
select plan(5);

-- Spec 012, US4: trava pelo próprio lacre fora da geocerca, sem comunicação (RF-022a, RN-011, MS-011). Ao voltar, o lacre informa a
-- trava e manda as leituras guardadas: o FluxID registra "travada por perda de comunicação", abre alerta alto e processa as leituras pela
-- regra de violação, sem criar outro comando de travar. Hermético: rollback.

insert into public.customers (id, organization_id, person_type, document_display, legal_name, segment) values
  ('a2310000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', 'legal', '11222333000181', 'Hospital Alfa Ltda', 'hospital');
insert into public.customer_sites (id, organization_id, customer_id, name, postal_code, street, number, city, state) values
  ('a2320000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-00000000000a', 'a2310000-0000-0000-0000-00000000000a', 'Unidade', '01001000', 'Praça da Sé', '1', 'São Paulo', 'SP');
insert into public.geofences (organization_id, site_id, name, shape, center, radius_m, area) values
  ('20000000-0000-0000-0000-00000000000a', 'a2320000-0000-0000-0000-0000000000a1', 'Pátio', 'circle',
   extensions.st_setsrid(extensions.st_makepoint(-39.3, -7.2), 4326)::extensions.geography, 100,
   extensions.st_buffer(extensions.st_setsrid(extensions.st_makepoint(-39.3, -7.2), 4326)::extensions.geography, 100));
insert into public.cylinder_types (id, organization_id, gas, capacity_value, capacity_unit, classification) values
  ('a2370000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', 'Oxigênio', 10, 'l', 'medicinal');
insert into public.cylinders (id, organization_id, cylinder_type_id, serial_number) values
  ('a2380000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-00000000000a', 'a2370000-0000-0000-0000-00000000000a', 'AUTO-1');
insert into public.seal_devices (id, organization_id, device_code, label, key_hash, created_by, lock_state) values
  ('a2300000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-00000000000a', 'DSP-AUTOA001', 'Lacre', extensions.digest('k', 'sha256'), '10000000-0000-0000-0000-000000000002', 'unlocked');
insert into public.seal_bindings (organization_id, device_id, cylinder_id, bound_by) values
  ('20000000-0000-0000-0000-00000000000a', 'a2300000-0000-0000-0000-000000000001', 'a2380000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002');
insert into public.seal_watches (organization_id, cylinder_id, device_id, site_id) values
  ('20000000-0000-0000-0000-00000000000a', 'a2380000-0000-0000-0000-000000000001', 'a2300000-0000-0000-0000-000000000001', 'a2320000-0000-0000-0000-0000000000a1');

-- O lacre volta com as leituras guardadas (duas fora da cerca) e o aviso da trava que ele fez sozinho.
create temp table r as select public.seal_ingest('DSP-AUTOA001', extensions.digest('k', 'sha256'), extensions.digest('ip', 'sha256'), jsonb_build_object('protocol', 1, 'messages',
  jsonb_build_array(
    jsonb_build_object('message_id', 'A-1', 'type', 'position', 'read_at', now() - interval '5 minutes', 'problem', null,
      'data', jsonb_build_object('latitude', -7.203, 'longitude', -39.3, 'quality', 'gps', 'accuracy_m', 5, 'battery_pct', 80, 'signal_dbm', -60, 'seal_state', 'closed')),
    jsonb_build_object('message_id', 'A-2', 'type', 'position', 'read_at', now() - interval '4 minutes', 'problem', null,
      'data', jsonb_build_object('latitude', -7.204, 'longitude', -39.3, 'quality', 'gps', 'accuracy_m', 5, 'battery_pct', 80, 'signal_dbm', -60, 'seal_state', 'closed')),
    jsonb_build_object('message_id', 'A-3', 'type', 'auto_lock', 'read_at', now() - interval '1 minute', 'problem', null,
      'data', jsonb_build_object('latitude', -7.204, 'longitude', -39.3, 'quality', 'gps', 'accuracy_m', 5, 'battery_pct', 80, 'signal_dbm', -60,
        'seal_state', 'closed', 'locked_at', now() - interval '1 minute'))))) as body;

select is((select lock_state from public.seal_devices where id = 'a2300000-0000-0000-0000-000000000001'), 'locked_comm_loss', 'travada por perda de comunicação');
select is((select severity || ':' || requires_push from public.seal_alerts where device_id = 'a2300000-0000-0000-0000-000000000001' and kind = 'comm_loss_lock'),
  'high:true', 'alerta alto, com notificação');
select is((select count(*)::int from public.seal_violations where device_id = 'a2300000-0000-0000-0000-000000000001'), 1, 'as leituras guardadas passam pela regra de violação');
select is((select count(*)::int from public.seal_commands where device_id = 'a2300000-0000-0000-0000-000000000001' and kind = 'lock'), 0,
  'o lacre já travado não recebe outro comando de travar');
select is((select body->'body'->'command' from r), 'null'::jsonb, 'a resposta não leva comando');

select * from finish();
rollback;
