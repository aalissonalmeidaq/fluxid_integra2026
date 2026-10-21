begin;
select plan(18);

-- Spec 012, US1: cada posição é guardada uma vez, na organização certa (RF-003, RF-005, RF-008, RF-009, RN-009, CA-003, MS-001,
-- MS-002). Posição a até 20 m da última guardada, com a mesma qualidade e o mesmo estado do lacre, só atualiza "visto por último".

insert into public.cylinder_types (id, organization_id, gas, capacity_value, capacity_unit, classification) values
  ('a1370000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', 'Oxigênio', 10, 'l', 'medicinal');
insert into public.cylinders (id, organization_id, cylinder_type_id, serial_number) values
  ('a1380000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-00000000000a', 'a1370000-0000-0000-0000-00000000000a', 'DEDUP-A-001');
insert into public.seal_devices (id, organization_id, device_code, label, key_hash, created_by) values
  ('a1320000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-00000000000a', 'DSP-DEDUPA01', 'Lacre vinculado', extensions.digest('chave-d1', 'sha256'), '10000000-0000-0000-0000-000000000002'),
  ('a1320000-0000-0000-0000-0000000000a2', '20000000-0000-0000-0000-00000000000a', 'DSP-DEDUPA02', 'Lacre sem vínculo', extensions.digest('chave-d2', 'sha256'), '10000000-0000-0000-0000-000000000002');
insert into public.seal_bindings (organization_id, device_id, cylinder_id, bound_by, bound_at) values
  ('20000000-0000-0000-0000-00000000000a', 'a1320000-0000-0000-0000-0000000000a1', 'a1380000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-000000000002', now() - interval '2 days');

-- Uma leitura de posição; deslocamento em graus de latitude (0,0001 ≈ 11 m; 0,0003 ≈ 33 m).
create function pg_temp.pos(p_id text, p_ago interval, p_dlat numeric default 0, p_quality text default 'gps', p_state text default 'closed', p_battery int default 80)
returns jsonb language sql as $$
  select jsonb_build_object('message_id', p_id, 'type', 'position', 'read_at', now() - p_ago, 'problem', null,
    'data', jsonb_build_object('latitude', -7.2 + p_dlat, 'longitude', -39.3, 'quality', p_quality, 'accuracy_m', 5,
      'battery_pct', p_battery, 'signal_dbm', -60, 'seal_state', p_state))
$$;
-- O limite de envios por minuto tem teste próprio (012_rate_limit); aqui a janela é zerada a cada envio.
create function pg_temp.send(p_code text, p_key text, p_msgs jsonb) returns jsonb language sql as $$
  update private.seal_rate_windows set count = 0;
  select public.seal_ingest(p_code, extensions.digest(p_key, 'sha256'), extensions.digest('ip-1', 'sha256'),
    jsonb_build_object('protocol', 1, 'watch_version', 0, 'messages', p_msgs))
$$;
create function pg_temp.points() returns int language sql as $$
  select count(*)::int from public.seal_positions where device_id = 'a1320000-0000-0000-0000-0000000000a1'
$$;

create temporary table broadcast_calls (kind text, device_id uuid, cylinder_id uuid);
create or replace function private.seal_broadcast(p_organization uuid, p_kind text, p_device uuid, p_cylinder uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  insert into pg_temp.broadcast_calls (kind, device_id, cylinder_id) values (p_kind, p_device, p_cylinder);
end $$;

select pg_temp.send('DSP-DEDUPA01', 'chave-d1', jsonb_build_array(pg_temp.pos('P-1', '60 minutes')));
select is(pg_temp.points(), 1, 'a primeira posição é gravada');
select is((select count(*)::int from pg_temp.broadcast_calls where kind = 'position'), 1,
  'a primeira posição envia aviso em tempo real');
select ok((select p.cylinder_id = 'a1380000-0000-0000-0000-0000000000a1' and p.organization_id = '20000000-0000-0000-0000-00000000000a'
  and p.quality = 'gps' and p.seal_state = 'closed' and p.battery_pct = 80 and p.signal_dbm = -60 and p.read_at = now() - interval '60 minutes'
  and p.received_at is not null from public.seal_positions p where p.device_id = 'a1320000-0000-0000-0000-0000000000a1'),
  'guarda cilindro do vínculo, organização do cadastro, qualidade, estado, bateria, sinal e horários');

-- Mesma mensagem de novo: "já recebida".
select is(pg_temp.send('DSP-DEDUPA01', 'chave-d1', jsonb_build_array(pg_temp.pos('P-1', '60 minutes')))->'body'->'results'->0->>'status',
  'duplicate', 'a mesma mensagem responde "já recebida"');
select is(pg_temp.points(), 1, 'e não cria nada');
select ok((pg_temp.send('DSP-DEDUPA01', 'chave-d1', jsonb_build_array(pg_temp.pos('P-1', '60 minutes')))->'body') ? 'command',
  'a resposta repetida também traz o comando pendente (ou nulo)');

-- A 11 m, mesma qualidade e estado: só "visto por último".
select pg_temp.send('DSP-DEDUPA01', 'chave-d1', jsonb_build_array(pg_temp.pos('P-2', '59 minutes', 0.0001, 'gps', 'closed', 79)));
select is(pg_temp.points(), 1, 'a até 20 m, nenhuma posição nova');
select ok((select last_seen_at = now() - interval '59 minutes' and battery_pct = 80 and signal_dbm = -60 and repeat_count = 1
  from public.seal_positions where device_id = 'a1320000-0000-0000-0000-0000000000a1'),
  'posição repetida atualiza somente o horário; os demais dados do ponto permanecem como foram gravados');
select is((select count(*)::int from pg_temp.broadcast_calls where kind = 'position'), 2,
  'posição repetida também envia aviso para a tela mostrar a confirmação mais recente');

-- Acima de 20 m, mudança de qualidade e de estado criam ponto novo.
select pg_temp.send('DSP-DEDUPA01', 'chave-d1', jsonb_build_array(pg_temp.pos('P-3', '58 minutes', 0.0003)));
select is(pg_temp.points(), 2, 'a mais de 20 m, posição nova');
select pg_temp.send('DSP-DEDUPA01', 'chave-d1', jsonb_build_array(pg_temp.pos('P-4', '57 minutes', 0.0003, 'last_known')));
select is(pg_temp.points(), 3, 'mudou a qualidade (perdeu o GPS): posição nova');
select pg_temp.send('DSP-DEDUPA01', 'chave-d1', jsonb_build_array(pg_temp.pos('P-5', '56 minutes', 0.0003, 'last_known', 'open')));
select is(pg_temp.points(), 4, 'mudou o estado do lacre: posição nova');

-- Oscilação perto do limite: compara com a última GUARDADA (base em 0,0003), não com a última recebida.
select pg_temp.send('DSP-DEDUPA01', 'chave-d1', jsonb_build_array(pg_temp.pos('P-6', '55 minutes', 0.00045, 'last_known', 'open')));
select pg_temp.send('DSP-DEDUPA01', 'chave-d1', jsonb_build_array(pg_temp.pos('P-7', '54 minutes', 0.00060, 'last_known', 'open')));
select is(pg_temp.points(), 5, 'deriva de 17 m + 17 m: a segunda passa de 20 m da guardada e cria ponto');

-- Lacre parado o dia inteiro, uma leitura por minuto (MS-002): um único ponto.
select pg_temp.send('DSP-DEDUPA01', 'chave-d1', (select jsonb_agg(pg_temp.pos('DIA-' || g || '-' || i, make_interval(mins => 50) - make_interval(secs => g * 50 + i), 0.0010))
  from generate_series(0, 49) i)) from generate_series(0, 28) g;
select is((select count(*)::int from public.seal_positions where device_id = 'a1320000-0000-0000-0000-0000000000a1'
  and extensions.st_dwithin(point, extensions.st_setsrid(extensions.st_makepoint(-39.3, -7.199), 4326)::extensions.geography, 1)), 1,
  'mais de 1.400 leituras paradas geram uma única posição');

-- Lacre ativo sem vínculo: a mensagem fica só no dispositivo.
select pg_temp.send('DSP-DEDUPA02', 'chave-d2', jsonb_build_array(pg_temp.pos('S-1', '1 minute')));
select is((select cylinder_id from public.seal_positions where device_id = 'a1320000-0000-0000-0000-0000000000a2'), null::uuid,
  'lacre sem vínculo: a posição fica sem cilindro');
select is((select count(*)::int from public.seal_messages where device_id = 'a1320000-0000-0000-0000-0000000000a2'), 1, 'e a mensagem fica no dispositivo');

-- Horário no futuro além da tolerância.
select is(pg_temp.send('DSP-DEDUPA01', 'chave-d1', jsonb_build_array(pg_temp.pos('F-1', '-10 minutes')))->'body'->'results'->0,
  '{"message_id": "F-1", "status": "refused", "reason": "read_at_in_future"}'::jsonb, 'leitura mais de 5 min no futuro é recusada');
select is((select outcome || ':' || refusal_code from public.seal_messages where message_id = 'F-1'), 'refused:read_at_in_future',
  'e a recusa fica registrada');

select * from finish();
rollback;
