begin;
select plan(17);

-- Spec 012, US6: saúde do lacre e verificação automática (RF-013 a RF-017, RN-002, CA-007; Clarifications 17/10). O relógio é
-- simulado recuando os horários do dispositivo. Possível extravio, com notificação, só em viagem ou sob vigilância; no estoque, alerta
-- médio sem notificação. Nenhum estado de saúde muda o cilindro. Hermético: rollback.

insert into public.cylinder_types (id, organization_id, gas, capacity_value, capacity_unit, classification) values
  ('a1570000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', 'Oxigênio', 10, 'l', 'medicinal');
insert into public.cylinders (id, organization_id, cylinder_type_id, serial_number) values
  ('a1580000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-00000000000a', 'a1570000-0000-0000-0000-00000000000a', 'WD-ESTOQUE'),
  ('a1580000-0000-0000-0000-0000000000a2', '20000000-0000-0000-0000-00000000000a', 'a1570000-0000-0000-0000-00000000000a', 'WD-CLIENTE');
insert into public.customers (id, organization_id, person_type, document_display, legal_name, segment) values
  ('a1510000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', 'legal', '11222333000181', 'Hospital Alfa Ltda', 'hospital');
insert into public.customer_sites (id, organization_id, customer_id, name, postal_code, street, number, city, state) values
  ('a1520000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', 'a1510000-0000-0000-0000-00000000000a', 'Unidade A', '01001000', 'Praça da Sé', '1', 'São Paulo', 'SP');
insert into public.seal_devices (id, organization_id, device_code, label, key_hash, created_by) values
  ('a1500000-0000-0000-0000-0000000000e1', '20000000-0000-0000-0000-00000000000a', 'DSP-WDESTOQ1', 'Lacre no estoque', extensions.digest('k-e', 'sha256'), '10000000-0000-0000-0000-000000000002'),
  ('a1500000-0000-0000-0000-0000000000c1', '20000000-0000-0000-0000-00000000000a', 'DSP-WDCLIEN1', 'Lacre no cliente', extensions.digest('k-c', 'sha256'), '10000000-0000-0000-0000-000000000002'),
  ('a1500000-0000-0000-0000-0000000000d1', '20000000-0000-0000-0000-00000000000a', 'DSP-WDDESLG1', 'Lacre desligado', extensions.digest('k-d', 'sha256'), '10000000-0000-0000-0000-000000000002'),
  ('a1500000-0000-0000-0000-0000000000f1', '20000000-0000-0000-0000-00000000000a', 'DSP-WDSEMGP1', 'Lacre sem GPS', extensions.digest('k-g', 'sha256'), '10000000-0000-0000-0000-000000000002');
insert into public.seal_bindings (organization_id, device_id, cylinder_id, bound_by, bound_at) values
  ('20000000-0000-0000-0000-00000000000a', 'a1500000-0000-0000-0000-0000000000e1', 'a1580000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-000000000002', now() - interval '1 day'),
  ('20000000-0000-0000-0000-00000000000a', 'a1500000-0000-0000-0000-0000000000c1', 'a1580000-0000-0000-0000-0000000000a2', '10000000-0000-0000-0000-000000000002', now() - interval '1 day');
insert into public.geofences (organization_id, site_id, name, shape, center, radius_m, area) values
  ('20000000-0000-0000-0000-00000000000a', 'a1520000-0000-0000-0000-00000000000a', 'Pátio', 'circle',
   extensions.st_setsrid(extensions.st_makepoint(-39.3, -7.2), 4326)::extensions.geography, 100,
   extensions.st_buffer(extensions.st_setsrid(extensions.st_makepoint(-39.3, -7.2), 4326)::extensions.geography, 100));
-- O cilindro do lacre "no cliente" está sob vigilância de geocerca.
insert into public.seal_watches (organization_id, cylinder_id, device_id, site_id) values
  ('20000000-0000-0000-0000-00000000000a', 'a1580000-0000-0000-0000-0000000000a2', 'a1500000-0000-0000-0000-0000000000c1', 'a1520000-0000-0000-0000-00000000000a');

create function pg_temp.send(p_code text, p_key text, p_type text, p_quality text default 'gps', p_battery int default 80) returns jsonb language sql as $$
  update private.seal_rate_windows set count = 0;
  select public.seal_ingest(p_code, extensions.digest(p_key, 'sha256'), extensions.digest('ip', 'sha256'), jsonb_build_object('protocol', 1, 'messages',
    jsonb_build_array(jsonb_build_object('message_id', gen_random_uuid()::text, 'type', p_type, 'read_at', now(), 'problem', null,
      'data', jsonb_build_object('latitude', -7.2, 'longitude', -39.3, 'quality', p_quality, 'accuracy_m', 5, 'battery_pct', p_battery,
        'signal_dbm', -60, 'seal_state', 'closed', 'valve', 'open')))))
$$;
create function pg_temp.age(p_device uuid, p_seconds int) returns void language sql as $$
  update public.seal_devices set last_seen_at = last_seen_at - make_interval(secs => p_seconds), last_read_at = last_read_at - make_interval(secs => p_seconds),
    no_gps_since = no_gps_since - make_interval(secs => p_seconds) where id = p_device;
$$;
create function pg_temp.health(p_device uuid) returns text language sql as $$ select health from public.seal_devices where id = p_device $$;
create function pg_temp.alert(p_device uuid, p_kind text) returns text language sql as $$
  select severity || ':' || requires_push::text || ':' || status from public.seal_alerts where device_id = p_device and kind = p_kind
$$;

select pg_temp.send('DSP-WDESTOQ1', 'k-e', 'position');
select pg_temp.send('DSP-WDCLIEN1', 'k-c', 'position');
select pg_temp.send('DSP-WDSEMGP1', 'k-g', 'position');
select is(pg_temp.health('a1500000-0000-0000-0000-0000000000e1'), 'ok', 'o primeiro contato com GPS deixa a saúde em "funcionando"');

-- Sem comunicação: intervalo (60 s) + 30 s de folga.
select pg_temp.age('a1500000-0000-0000-0000-0000000000e1', 80);
select private.run_seal_watchdog();
select is(pg_temp.health('a1500000-0000-0000-0000-0000000000e1'), 'ok', 'antes de 90 s sem contato, nada muda');
select pg_temp.age('a1500000-0000-0000-0000-0000000000e1', 15);
select pg_temp.age('a1500000-0000-0000-0000-0000000000c1', 95);
select private.run_seal_watchdog();
select is(pg_temp.health('a1500000-0000-0000-0000-0000000000e1'), 'no_comm', 'depois de 90 s: "sem comunicação"');
select is(pg_temp.alert('a1500000-0000-0000-0000-0000000000e1', 'no_comm'), 'medium:false:open', 'no estoque: alerta médio, sem notificação');
select is(pg_temp.alert('a1500000-0000-0000-0000-0000000000e1', 'possible_loss'), null, 'no estoque: nenhum alerta de possível extravio');
select is(pg_temp.alert('a1500000-0000-0000-0000-0000000000c1', 'possible_loss'), 'high:true:open', 'sob vigilância: possível extravio, alto e com notificação');
select ok((select context ? 'last_position_id' and context ? 'site_id' from public.seal_alerts
  where device_id = 'a1500000-0000-0000-0000-0000000000c1' and kind = 'possible_loss'), 'o alerta traz a última posição e a unidade');

-- Rodar de novo não duplica nada.
select private.run_seal_watchdog();
select is((select count(*)::int from public.seal_alerts where device_id in ('a1500000-0000-0000-0000-0000000000e1', 'a1500000-0000-0000-0000-0000000000c1')), 2,
  'rodar a verificação duas vezes não duplica alertas');

-- Desligamento avisado: "desligado" na hora.
select pg_temp.send('DSP-WDDESLG1', 'k-d', 'shutdown');
select is(pg_temp.health('a1500000-0000-0000-0000-0000000000d1'), 'off', 'o aviso de desligamento muda a saúde na hora');
select is(pg_temp.alert('a1500000-0000-0000-0000-0000000000d1', 'device_off'), 'medium:false:open', 'lacre sem viagem nem vigilância: alerta médio de desligado');

-- Sem GPS por mais de três intervalos.
select pg_temp.send('DSP-WDSEMGP1', 'k-g', 'position', 'last_known');
select pg_temp.age('a1500000-0000-0000-0000-0000000000f1', 170);
select pg_temp.send('DSP-WDSEMGP1', 'k-g', 'position', 'last_known');
select private.run_seal_watchdog();
select is(pg_temp.health('a1500000-0000-0000-0000-0000000000f1'), 'ok', 'menos de 3 intervalos sem GPS: ainda "funcionando"');
select pg_temp.age('a1500000-0000-0000-0000-0000000000f1', 20);
select pg_temp.send('DSP-WDSEMGP1', 'k-g', 'position', 'last_known');
select private.run_seal_watchdog();
select is(pg_temp.health('a1500000-0000-0000-0000-0000000000f1'), 'no_gps', 'mais de 3 intervalos só sem GPS: "sem GPS"');
select is(pg_temp.alert('a1500000-0000-0000-0000-0000000000f1', 'no_gps'), 'medium:false:open', 'alerta médio de sem GPS');

-- Bateria baixa.
select pg_temp.send('DSP-WDESTOQ1', 'k-e', 'position', 'gps', 14);
select is(pg_temp.health('a1500000-0000-0000-0000-0000000000e1'), 'low_battery', 'bateria abaixo de 15%: "bateria baixa"');

-- Volta: posição com GPS e bateria normal devolve "funcionando"; o alerta registra a volta e continua aberto.
select pg_temp.send('DSP-WDCLIEN1', 'k-c', 'position');
select is(pg_temp.health('a1500000-0000-0000-0000-0000000000c1'), 'ok', 'voltou a comunicar com GPS: "funcionando"');
select ok((select recovered_at is not null and status = 'open' from public.seal_alerts where device_id = 'a1500000-0000-0000-0000-0000000000c1' and kind = 'possible_loss'),
  'o alerta registra a volta e continua aberto até o gestor encerrar');

-- Nenhum estado de saúde muda o cilindro (RN-002).
select is((select count(*)::int from public.cylinders where id in ('a1580000-0000-0000-0000-0000000000a1', 'a1580000-0000-0000-0000-0000000000a2')
  and status = 'active' and custody_status = 'in_organization'), 2, 'a situação dos cilindros não mudou');

select * from finish();
rollback;
