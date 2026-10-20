begin;
select plan(33);

-- Spec 013, US2: o pedido de aprovação pelo mesmo seal_ingest (contracts/pedido-de-aprovacao.md; RF-008 a RF-010, RN-003, RN-006,
-- MS-004). Nada do lacre sem aprovação vira dado de tenant. Hermético: rollback.

-- Cada chamada começa com as janelas de limite limpas: aqui se confere a resposta, e os limites ficam em 013_enrollment_rate_limit.
create function pg_temp.call(p_code text, p_key text, p_messages jsonb, p_ip text default 'ip-ingest') returns jsonb language sql as $$
  delete from private.seal_enroll_rate_windows;
  delete from private.seal_rate_windows;
  select public.seal_ingest(p_code, extensions.digest(p_key, 'sha256'), extensions.digest(p_ip, 'sha256'),
    jsonb_build_object('protocol', 1, 'firmware_version', '3.0.0', 'watch_version', 0, 'messages', p_messages))
$$;
-- As mensagens do lacre que aguarda: boot e a rede em uso (corpo de enrollment-pending-request.json, já validado pela borda).
create function pg_temp.waiting(p_id text, p_ssid text default 'Rede-Deposito-Ficticia', p_rssi int default -58) returns jsonb language sql as $$
  select jsonb_build_array(
    jsonb_build_object('message_id', p_id || '-boot', 'type', 'event', 'read_at', now(), 'problem', null,
      'data', jsonb_build_object('code', 'boot', 'detail', null)),
    jsonb_build_object('message_id', p_id || '-net', 'type', 'network_change', 'read_at', now(), 'problem', null,
      'data', jsonb_build_object('wifi', jsonb_build_object('ssid', p_ssid, 'kind', 'default', 'rssi', p_rssi), 'saved', jsonb_build_array(p_ssid))))
$$;
create function pg_temp.forgotten(p_id text, p_detail text) returns jsonb language sql as $$
  select jsonb_build_array(jsonb_build_object('message_id', p_id, 'type', 'event', 'read_at', now(), 'problem', null,
    'data', jsonb_build_object('code', 'networks_forgotten', 'detail', p_detail)))
$$;
create function pg_temp.position(p_id text) returns jsonb language sql as $$
  select jsonb_build_array(jsonb_build_object('message_id', p_id, 'type', 'position', 'read_at', now() - interval '1 minute', 'problem', null,
    'data', jsonb_build_object('latitude', -7.2, 'longitude', -39.3, 'quality', 'gps', 'accuracy_m', 6, 'battery_pct', 90, 'signal_dbm', -60, 'seal_state', 'closed')))
$$;
create function pg_temp.tenant_rows() returns bigint language sql as $$
  select (select count(*) from public.seal_messages) + (select count(*) from public.seal_positions) + (select count(*) from public.seal_alerts)
    + (select count(*) from public.seal_device_events) + (select count(*) from public.seal_commands)
$$;
create temp table before as select pg_temp.tenant_rows() as n;

-- Código desconhecido: cria o pedido e responde "aguardando aprovação".
select is(pg_temp.call('DSP-ING13001', 'fxk_lacre-1', pg_temp.waiting('m1')),
  '{"status": 202, "body": {"status": "pending_approval", "report_interval_s": 60}}'::jsonb, 'código desconhecido: 202 pending_approval');
select is((select status || '/' || calls from public.seal_enrollments where device_code = 'DSP-ING13001'), 'pending/1', 'o pedido nasce pending, com 1 chamada');
select ok((select key_hash = extensions.digest('fxk_lacre-1', 'sha256') and source_hash = extensions.digest('ip-ingest', 'sha256')
  from public.seal_enrollments where device_code = 'DSP-ING13001'), 'guarda só o SHA-256 da chave e o resumo do endereço');
select is((select signal_dbm::int || '/' || wifi_ssid || '/' || firmware_version from public.seal_enrollments where device_code = 'DSP-ING13001'),
  '-58/Rede-Deposito-Ficticia/3.0.0', 'sinal (wifi.rssi), rede (wifi.ssid) e firmware (envelope) vão para o pedido');
select ok((select first_seen_at is not null and last_seen_at >= first_seen_at from public.seal_enrollments where device_code = 'DSP-ING13001'),
  'primeira e última chamada registradas');

-- Pendente com a mesma chave: só atualiza a última chamada, o sinal e a rede.
select is(pg_temp.call('DSP-ING13001', 'fxk_lacre-1', pg_temp.waiting('m2', 'Rede-Outra-Ficticia', -70))->>'status', '202', 'pendente com a chave do pedido: 202');
select is((select calls || '/' || signal_dbm::int || '/' || wifi_ssid from public.seal_enrollments where device_code = 'DSP-ING13001'),
  '2/-70/Rede-Outra-Ficticia', 'a segunda chamada atualiza chamadas, sinal e rede');

-- Pendente com outra chave: 401 sem motivo e marca de conflito, sem mexer no pedido.
select is(pg_temp.call('DSP-ING13001', 'fxk_outro-aparelho', pg_temp.waiting('m3')),
  '{"status": 401, "body": {"error": "unauthorized"}}'::jsonb, 'pendente com outra chave: 401 sem motivo');
select ok((select conflict_at is not null and conflict_key_hash = extensions.digest('fxk_outro-aparelho', 'sha256') and conflict_calls = 1
  and key_hash = extensions.digest('fxk_lacre-1', 'sha256') from public.seal_enrollments where device_code = 'DSP-ING13001'),
  'conflito marcado com a chave do outro aparelho; a chave do pedido não muda');
select is(pg_temp.call('DSP-ING13001', 'fxk_lacre-1', pg_temp.waiting('m4'))->>'status', '202', 'o lacre conhecido não é afetado pelo conflito');

-- Lacre pendente que manda posição: nada entra em tenant (RN-003).
select is(pg_temp.call('DSP-ING13001', 'fxk_lacre-1', pg_temp.position('p1'))->>'status', '202', 'posição de pendente: 202');
select is(pg_temp.tenant_rows(), (select n from before), 'nenhuma mensagem, posição, alerta, evento ou comando gravado em tenant');

-- Recusado: 403, só atualiza a última chamada, sem reabrir.
update public.seal_enrollments set status = 'refused', decision_note = 'Lacre desconhecido', last_seen_at = now() - interval '2 hours'
 where device_code = 'DSP-ING13001';
select is(pg_temp.call('DSP-ING13001', 'fxk_lacre-1', pg_temp.waiting('m5')),
  '{"status": 403, "body": {"status": "refused"}}'::jsonb, 'recusado: 403 refused');
select ok((select status = 'refused' and last_seen_at > now() - interval '1 minute' from public.seal_enrollments where device_code = 'DSP-ING13001'),
  'recusado continua recusado; só a última chamada muda');

-- Expirado: volta a pending e responde 202.
update public.seal_enrollments set status = 'expired', decision_note = null where device_code = 'DSP-ING13001';
select is(pg_temp.call('DSP-ING13001', 'fxk_lacre-1', pg_temp.waiting('m6'))->>'status', '202', 'expirado que chama: 202');
select is((select status from public.seal_enrollments where device_code = 'DSP-ING13001'), 'pending', 'expirado volta a pending');

-- Devolvido: 202 com forget_networks all até o networks_forgotten.
update public.seal_enrollments set status = 'returned', decision_note = 'Devolvido pelo tenant', forget_networks = 'all',
  forget_networks_requested_at = now(), last_organization_id = '20000000-0000-0000-0000-00000000000a'
 where device_code = 'DSP-ING13001';
select is(pg_temp.call('DSP-ING13001', 'fxk_lacre-1', pg_temp.waiting('m7')),
  '{"status": 202, "body": {"status": "pending_approval", "report_interval_s": 60, "forget_networks": "all"}}'::jsonb,
  'devolvido: 202 com forget_networks all');
select is(pg_temp.call('DSP-ING13001', 'fxk_lacre-1', pg_temp.waiting('m8') || pg_temp.forgotten('f1', 'all')),
  '{"status": 202, "body": {"status": "pending_approval", "report_interval_s": 60}}'::jsonb,
  'com networks_forgotten na mesma chamada, a resposta já sai sem a marca');
select ok((select forget_networks is null and forget_networks_requested_at is null and last_organization_id is null and status = 'returned'
  from public.seal_enrollments where device_code = 'DSP-ING13001'), 'networks_forgotten all limpa a marca e o último tenant');

-- Retirado com extras: a confirmação limpa a marca e mantém o último tenant.
update public.seal_enrollments set status = 'pending', decision_note = null, forget_networks = 'extras', forget_networks_requested_at = now(),
  last_organization_id = '20000000-0000-0000-0000-00000000000a' where device_code = 'DSP-ING13001';
select is(pg_temp.call('DSP-ING13001', 'fxk_lacre-1', pg_temp.waiting('m9'))->'body'->>'forget_networks', 'extras', 'retirado: 202 com forget_networks extras');
select is(pg_temp.call('DSP-ING13001', 'fxk_lacre-1', pg_temp.forgotten('f2', 'extras'))->'body'->>'forget_networks', null, 'confirmação de extras');
select is((select last_organization_id::text from public.seal_enrollments where device_code = 'DSP-ING13001'), '20000000-0000-0000-0000-00000000000a',
  'extras mantém o último tenant (a rede principal continua no lacre)');

-- networks_forgotten sem pedido aberto não tem efeito.
select is(pg_temp.call('DSP-ING13001', 'fxk_lacre-1', pg_temp.forgotten('f3', 'all'))->>'status', '202', 'networks_forgotten sem pedido: 202');
select is((select last_organization_id::text from public.seal_enrollments where device_code = 'DSP-ING13001'), '20000000-0000-0000-0000-00000000000a',
  'sem pedido de esquecimento, o evento não anula o último tenant');
select is(pg_temp.tenant_rows(), (select n from before), 'depois de tudo isso, ainda nada em tenant');

-- Aprovado com a chave certa: segue como na Spec 012.
insert into public.seal_devices (id, organization_id, device_code, label, key_hash, created_by, approved_at, approved_by) values
  ('a1330000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-00000000000a', 'DSP-ING13002', 'Lacre aprovado', extensions.digest('fxk_lacre-2', 'sha256'),
   '10000000-0000-0000-0000-000000000001', now(), '10000000-0000-0000-0000-000000000001');
insert into public.seal_enrollments (device_code, key_hash, status, organization_id, device_id, last_organization_id) values
  ('DSP-ING13002', extensions.digest('fxk_lacre-2', 'sha256'), 'approved', '20000000-0000-0000-0000-00000000000a', 'a1330000-0000-0000-0000-0000000000a1',
   '20000000-0000-0000-0000-00000000000a');
select is(pg_temp.call('DSP-ING13002', 'fxk_lacre-2', pg_temp.position('p2'))->>'status', '200', 'aprovado com a chave do pedido: 200');
select is((select count(*)::int from public.seal_positions where device_id = 'a1330000-0000-0000-0000-0000000000a1'
  and organization_id = '20000000-0000-0000-0000-00000000000a'), 1, 'a posição do aprovado fica no tenant de destino');
select is(pg_temp.call('DSP-ING13002', 'fxk_lacre-2', pg_temp.forgotten('f4', 'extras'))->'body'->'results'->0->>'status', 'stored',
  'aprovado também manda networks_forgotten, gravado como stored');

-- Aprovado com outra chave: 401 e conflito, sem afetar o lacre conhecido.
select is(pg_temp.call('DSP-ING13002', 'fxk_reinstalado', pg_temp.waiting('m10')),
  '{"status": 401, "body": {"error": "unauthorized"}}'::jsonb, 'aprovado com outra chave: 401');
select ok((select conflict_key_hash = extensions.digest('fxk_reinstalado', 'sha256') from public.seal_enrollments where device_code = 'DSP-ING13002'),
  'conflito marcado no pedido aprovado');
select is((select key_hash from public.seal_devices where id = 'a1330000-0000-0000-0000-0000000000a1'), extensions.digest('fxk_lacre-2', 'sha256'),
  'a chave do lacre em operação não muda');

-- Lacre da Spec 012, sem pedido, continua com a chave do cadastro manual.
insert into public.seal_devices (organization_id, device_code, label, key_hash, created_by) values
  ('20000000-0000-0000-0000-00000000000b', 'DSP-ING13003', 'Lacre manual', extensions.digest('fxk_manual', 'sha256'), '10000000-0000-0000-0000-000000000003');
select is(pg_temp.call('DSP-ING13003', 'fxk_manual', pg_temp.position('p3'))->>'status', '200', 'lacre da Spec 012 sem pedido: 200');
select is((select count(*)::int from public.seal_enrollments where device_code = 'DSP-ING13003'), 0, 'e não vira pedido');

select * from finish();
rollback;
