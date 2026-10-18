begin;
select plan(13);

-- Spec 012, US6: alertas do lacre e lista única (RF-016, RF-035, RF-036). Os do próprio lacre abrem só na mudança e não duplicam;
-- lacre aberto ou rompido estando travado é crítico; reconhecer e encerrar exigem permissão, e encerrar exige observação e audita.

delete from public.user_sessions where user_id in ('10000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000003');
select public.start_user_session('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000001202a2', 'aal1');
select public.start_user_session('10000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-0000001202b3', 'aal1');

insert into public.seal_devices (id, organization_id, device_code, label, key_hash, created_by) values
  ('a1600000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-00000000000a', 'DSP-ALRTA001', 'Lacre A', extensions.digest('k-a', 'sha256'), '10000000-0000-0000-0000-000000000002');

create function pg_temp.send(p_type text, p_data jsonb) returns jsonb language sql as $$
  update private.seal_rate_windows set count = 0;
  select public.seal_ingest('DSP-ALRTA001', extensions.digest('k-a', 'sha256'), extensions.digest('ip', 'sha256'), jsonb_build_object('protocol', 1, 'messages',
    jsonb_build_array(jsonb_build_object('message_id', gen_random_uuid()::text, 'type', p_type, 'read_at', now(), 'problem', null, 'data', p_data))))
$$;
create function pg_temp.pos(p_battery int, p_signal int, p_state text default 'closed') returns jsonb language sql as $$
  select jsonb_build_object('latitude', -7.2, 'longitude', -39.3, 'quality', 'gps', 'accuracy_m', 5, 'battery_pct', p_battery, 'signal_dbm', p_signal, 'seal_state', p_state)
$$;
create function pg_temp.count(p_kind text) returns int language sql as $$
  select count(*)::int from public.seal_alerts where device_id = 'a1600000-0000-0000-0000-0000000000a1' and kind = p_kind
$$;

-- Bateria e sinal: na mudança, não a cada leitura.
select pg_temp.send('position', pg_temp.pos(14, -60));
select pg_temp.send('position', pg_temp.pos(13, -60));
select is(pg_temp.count('low_battery'), 1, 'bateria abaixo de 15%: um único alerta, mesmo com várias leituras');
select pg_temp.send('position', pg_temp.pos(80, -90));
select pg_temp.send('position', pg_temp.pos(80, -91));
select is(pg_temp.count('weak_signal'), 1, 'sinal abaixo de -85 dBm: um único alerta');

-- Alerta enviado pelo próprio lacre, repetido.
select pg_temp.send('alert', jsonb_build_object('code', 'seal_open', 'value', null));
select pg_temp.send('alert', jsonb_build_object('code', 'seal_open', 'value', null));
select is(pg_temp.count('seal_open'), 1, 'o alerta do lacre que chega de novo não duplica');
select is((select severity || ':' || source from public.seal_alerts where device_id = 'a1600000-0000-0000-0000-0000000000a1' and kind = 'seal_open'), 'high:device',
  'lacre aberto com a trava solta: severidade alta, origem no lacre');
update public.seal_devices set lock_state = 'locked' where id = 'a1600000-0000-0000-0000-0000000000a1';
select pg_temp.send('alert', jsonb_build_object('code', 'seal_broken', 'value', null));
select is((select severity from public.seal_alerts where device_id = 'a1600000-0000-0000-0000-0000000000a1' and kind = 'seal_broken'), 'critical',
  'lacre rompido estando travado: crítico');

-- Lista única, isolada por organização.
select is(jsonb_array_length(public.list_alerts('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000001202a2',
  '20000000-0000-0000-0000-00000000000a', null, null, null, 0, 50)->'items'), 4, 'a lista do A traz os 4 alertas');
select is(public.list_alerts('10000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-0000001202b3',
  '20000000-0000-0000-0000-00000000000a', null, null, null, 0, 50)->>'code', 'ACCESS_DENIED', 'o B não lista os alertas do A');
select is(public.get_alert('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000001202a2', '20000000-0000-0000-0000-00000000000a',
  (select id from public.seal_alerts where kind = 'seal_broken' and device_id = 'a1600000-0000-0000-0000-0000000000a1'))->'alert'->>'kind', 'seal_broken',
  'detalhe do alerta com o tipo');

-- Reconhecer e encerrar.
create temp table alvo as select id from public.seal_alerts where kind = 'seal_open' and device_id = 'a1600000-0000-0000-0000-0000000000a1';
select is(public.acknowledge_alert('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000001202a2', '20000000-0000-0000-0000-00000000000a',
  gen_random_uuid(), (select id from alvo))->>'code', 'ACKNOWLEDGED', 'reconhecer');
select is(public.close_alert('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000001202a2', '20000000-0000-0000-0000-00000000000a',
  gen_random_uuid(), (select id from alvo), 'ok')->>'code', 'NOTE_REQUIRED', 'encerrar sem observação de 5 a 500 caracteres é recusado');
select is(public.close_alert('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000001202a2', '20000000-0000-0000-0000-00000000000a',
  'a1690000-0000-0000-0000-000000000001', (select id from alvo), 'Lacre conferido no depósito.')->>'code', 'CLOSED', 'encerrar com observação');
select is(public.close_alert('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000001202a2', '20000000-0000-0000-0000-00000000000a',
  'a1690000-0000-0000-0000-000000000001', (select id from alvo), 'Lacre conferido no depósito.')->>'replayed', 'true', 'a repetição do mesmo pedido não duplica');
select ok((select count(*) = 1 and bool_and(metadata::text not like '%conferido%') from public.audit_logs where action = 'seal.alert_close'
  and organization_id = '20000000-0000-0000-0000-00000000000a'), 'o encerramento gera uma auditoria, sem a observação em texto aberto');

select * from finish();
rollback;
