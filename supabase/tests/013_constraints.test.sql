begin;
select plan(36);

-- Spec 013: restrições do data-model.md, citadas literalmente. Hermético: desfeito pelo rollback.

insert into public.seal_devices (id, organization_id, device_code, label, key_hash, created_by) values
  ('a1300000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-00000000000a', 'DSP-ENRA0001', 'Lacre A1', extensions.digest('k-a1', 'sha256'), '10000000-0000-0000-0000-000000000002');

insert into public.seal_enrollments (id, device_code, key_hash) values
  ('a1310000-0000-0000-0000-000000000001', 'DSP-ENRP0001', extensions.digest('k-p1', 'sha256'));

-- seal_enrollments
select is((select status || '/' || calls || '/' || conflict_calls from public.seal_enrollments where id = 'a1310000-0000-0000-0000-000000000001'),
  'pending/0/0', 'padrões: situação pending, 0 chamadas, 0 chamadas em conflito');
select throws_ok($$ insert into public.seal_enrollments (device_code, key_hash) values ('XYZ-123', extensions.digest('x', 'sha256')) $$,
  '23514', null, 'device_code: ^DSP-[0-9A-Z]{8}$');
select throws_ok($$ insert into public.seal_enrollments (device_code, key_hash) values ('DSP-ENRP0001', extensions.digest('y', 'sha256')) $$,
  '23505', null, 'device_code: único');
select throws_ok($$ insert into public.seal_enrollments (device_code, key_hash) values ('DSP-ENRP0002', '\x00'::bytea) $$,
  '23514', null, 'key_hash é um SHA-256 (32 bytes)');
select throws_ok($$ update public.seal_enrollments set status = 'blocked' where id = 'a1310000-0000-0000-0000-000000000001' $$,
  '23514', null, 'status: pending, approved, refused, expired, returned');
select throws_ok($$ update public.seal_enrollments set signal_dbm = 1 where id = 'a1310000-0000-0000-0000-000000000001' $$,
  '23514', null, 'signal_dbm: -127 a 0 (acima)');
select throws_ok($$ update public.seal_enrollments set signal_dbm = -128 where id = 'a1310000-0000-0000-0000-000000000001' $$,
  '23514', null, 'signal_dbm: -127 a 0 (abaixo)');
select lives_ok($$ update public.seal_enrollments set signal_dbm = -127, wifi_ssid = 'Rede Ação Ç 12345678901234567', firmware_version = '3.0.0'
  where id = 'a1310000-0000-0000-0000-000000000001' $$, 'sinal, rede com acentos dentro de 32 bytes e firmware aceitos');
select throws_ok($$ update public.seal_enrollments set wifi_ssid = repeat('ç', 17) where id = 'a1310000-0000-0000-0000-000000000001' $$,
  '23514', null, 'wifi_ssid: até 32 bytes (17 "ç" são 34 bytes)');
select throws_ok($$ update public.seal_enrollments set firmware_version = repeat('9', 33) where id = 'a1310000-0000-0000-0000-000000000001' $$,
  '23514', null, 'firmware_version: até 32');
select throws_ok($$ update public.seal_enrollments set calls = -1 where id = 'a1310000-0000-0000-0000-000000000001' $$,
  '23514', null, 'calls não é negativo');

-- decision_note e as exigências por situação
select throws_ok($$ update public.seal_enrollments set decision_note = 'abc' where id = 'a1310000-0000-0000-0000-000000000001' $$,
  '23514', null, 'decision_note: 5 a 500 (curta)');
select throws_ok($$ update public.seal_enrollments set decision_note = repeat('a', 501) where id = 'a1310000-0000-0000-0000-000000000001' $$,
  '23514', null, 'decision_note: 5 a 500 (longa)');
select throws_ok($$ update public.seal_enrollments set status = 'approved' where id = 'a1310000-0000-0000-0000-000000000001' $$,
  '23514', null, 'approved exige organization_id e device_id');
select throws_ok($$ update public.seal_enrollments set status = 'approved', organization_id = '20000000-0000-0000-0000-00000000000a'
  where id = 'a1310000-0000-0000-0000-000000000001' $$, '23514', null, 'approved exige também device_id');
select lives_ok($$ update public.seal_enrollments set status = 'approved', organization_id = '20000000-0000-0000-0000-00000000000a',
  device_id = 'a1300000-0000-0000-0000-0000000000a1' where id = 'a1310000-0000-0000-0000-000000000001' $$,
  'approved com organization_id e device_id é aceito');
select throws_ok($$ update public.seal_enrollments set status = 'pending' where id = 'a1310000-0000-0000-0000-000000000001' $$,
  '23514', null, 'organization_id e device_id nulos fora de approved');
update public.seal_enrollments set status = 'pending', organization_id = null, device_id = null where id = 'a1310000-0000-0000-0000-000000000001';
select throws_ok($$ update public.seal_enrollments set status = 'refused' where id = 'a1310000-0000-0000-0000-000000000001' $$,
  '23514', null, 'refused exige decision_note');
select throws_ok($$ update public.seal_enrollments set status = 'returned' where id = 'a1310000-0000-0000-0000-000000000001' $$,
  '23514', null, 'returned exige decision_note');
select lives_ok($$ update public.seal_enrollments set status = 'refused', decision_note = 'Lacre desconhecido na bancada'
  where id = 'a1310000-0000-0000-0000-000000000001' $$, 'refused com decision_note é aceito');

-- Marcas de conflito e de esquecimento das redes
select throws_ok($$ update public.seal_enrollments set conflict_at = now() where id = 'a1310000-0000-0000-0000-000000000001' $$,
  '23514', null, 'conflict_at e conflict_key_hash são nulos juntos (só a data)');
select throws_ok($$ update public.seal_enrollments set conflict_key_hash = extensions.digest('z', 'sha256') where id = 'a1310000-0000-0000-0000-000000000001' $$,
  '23514', null, 'conflict_at e conflict_key_hash são nulos juntos (só a chave)');
select lives_ok($$ update public.seal_enrollments set conflict_at = now(), conflict_key_hash = extensions.digest('z', 'sha256'), conflict_calls = 1
  where id = 'a1310000-0000-0000-0000-000000000001' $$, 'conflito com data e chave é aceito');
select throws_ok($$ update public.seal_enrollments set forget_networks = 'some' where id = 'a1310000-0000-0000-0000-000000000001' $$,
  '23514', null, 'forget_networks: all, extras ou nulo');
select throws_ok($$ update public.seal_enrollments set forget_networks = 'all' where id = 'a1310000-0000-0000-0000-000000000001' $$,
  '23514', null, 'forget_networks e forget_networks_requested_at são nulos juntos');
select lives_ok($$ update public.seal_enrollments set forget_networks = 'extras', forget_networks_requested_at = now(),
  last_organization_id = '20000000-0000-0000-0000-00000000000a' where id = 'a1310000-0000-0000-0000-000000000001' $$,
  'forget_networks com a data e last_organization_id são aceitos');
select throws_ok($$ update public.seal_enrollments set last_organization_id = '20000000-0000-0000-0000-0000000000ff' where id = 'a1310000-0000-0000-0000-000000000001' $$,
  '23503', null, 'last_organization_id referencia organizations');

-- Sem exclusão
select throws_ok($$ delete from public.seal_enrollments $$, 'P0001', 'seal_record_undeletable', 'seal_enrollments não aceita delete');
select throws_ok($$ truncate public.seal_enrollments cascade $$, 'P0001', 'seal_record_undeletable', 'seal_enrollments não aceita truncate');

-- seal_devices: colunas novas e unicidade só entre linhas ativas
select throws_ok($$ update public.seal_devices set inactive_reason = 'lost' where id = 'a1300000-0000-0000-0000-0000000000a1' $$,
  '23514', null, 'inactive_reason: returned, withdrawn ou manual');
select throws_ok($$ update public.seal_devices set inactive_reason = 'returned' where id = 'a1300000-0000-0000-0000-0000000000a1' $$,
  '23514', null, 'inactive_reason só em linha inativa');
select throws_ok($$ insert into public.seal_devices (organization_id, device_code, label, key_hash, created_by) values
  ('20000000-0000-0000-0000-00000000000b', 'DSP-ENRA0001', 'Lacre B1', extensions.digest('k-a1', 'sha256'), '10000000-0000-0000-0000-000000000003') $$,
  '23505', null, 'dois device_code iguais ativos são recusados, mesmo em outra organização');
update public.seal_devices set status = 'inactive', inactive_reason = 'returned' where id = 'a1300000-0000-0000-0000-0000000000a1';
select lives_ok($$ insert into public.seal_devices (id, organization_id, device_code, label, key_hash, created_by, enrollment_id, approved_at, approved_by) values
  ('a1300000-0000-0000-0000-0000000000b1', '20000000-0000-0000-0000-00000000000b', 'DSP-ENRA0001', 'Lacre B1', extensions.digest('k-a1', 'sha256'),
   '10000000-0000-0000-0000-000000000003', 'a1310000-0000-0000-0000-000000000001', now(), '10000000-0000-0000-0000-000000000001') $$,
  'o mesmo device_code é aceito numa linha ativa nova se a anterior estiver inativa');
select throws_ok($$ insert into public.seal_devices (organization_id, device_code, label, key_hash, created_by) values
  ('20000000-0000-0000-0000-00000000000a', 'DSP-ENRA0001', 'Lacre A2', extensions.digest('k-a1', 'sha256'), '10000000-0000-0000-0000-000000000002') $$,
  '23505', null, 'no máximo uma linha ativa por device_code');
update public.seal_devices set status = 'inactive' where id = 'a1300000-0000-0000-0000-0000000000b1';
select is((select inactive_reason from public.seal_devices where id = 'a1300000-0000-0000-0000-0000000000b1'), 'manual',
  'desativação sem motivo (Spec 012) fica com inactive_reason manual');

-- Tabela privada de limites dos pedidos
select has_table('private', 'seal_enroll_rate_windows', 'private.seal_enroll_rate_windows existe');

select * from finish();
rollback;
