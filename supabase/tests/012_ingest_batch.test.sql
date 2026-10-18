begin;
select plan(7);

-- Spec 012, US1: lote de leituras guardadas pelo lacre sem rede (RF-004, RF-010; casos de borda). Resultado por item; a leitura mais
-- antiga não substitui a mais nova; a última posição do cilindro é a de maior horário de leitura.

insert into public.seal_devices (id, organization_id, device_code, label, key_hash, created_by) values
  ('a1330000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-00000000000a', 'DSP-BATCHA01', 'Lacre A1', extensions.digest('chave-b1', 'sha256'), '10000000-0000-0000-0000-000000000002');

create function pg_temp.pos(p_id text, p_ago interval, p_dlat numeric) returns jsonb language sql as $$
  select jsonb_build_object('message_id', p_id, 'type', 'position', 'read_at', now() - p_ago, 'problem', null,
    'data', jsonb_build_object('latitude', -7.2 + p_dlat, 'longitude', -39.3, 'quality', 'gps', 'accuracy_m', 5, 'battery_pct', 80, 'signal_dbm', -60, 'seal_state', 'closed'))
$$;
create function pg_temp.send(p_msgs jsonb) returns jsonb language sql as $$
  select public.seal_ingest('DSP-BATCHA01', extensions.digest('chave-b1', 'sha256'), extensions.digest('ip-1', 'sha256'),
    jsonb_build_object('protocol', 1, 'watch_version', 0, 'messages', p_msgs))
$$;

-- Lote fora de ordem, com uma repetida e uma inválida.
select pg_temp.send(jsonb_build_array(pg_temp.pos('B-0', '30 minutes', 0)));
create temp table r as select pg_temp.send(jsonb_build_array(
  pg_temp.pos('B-3', '10 minutes', 0.003),
  pg_temp.pos('B-1', '20 minutes', 0.001),
  pg_temp.pos('B-0', '30 minutes', 0),
  jsonb_build_object('message_id', 'B-X', 'type', 'position', 'read_at', now(), 'problem', 'invalid_field', 'data', '{}'::jsonb),
  pg_temp.pos('B-2', '15 minutes', 0.002))) as body;

select is((select jsonb_agg(x->>'status' order by x->>'message_id') from r, jsonb_array_elements(body->'body'->'results') x),
  '["duplicate", "stored", "stored", "stored", "refused"]'::jsonb, 'resultado individual por item (gravada, repetida, recusada)');
select is((select x->>'reason' from r, jsonb_array_elements(body->'body'->'results') x where x->>'message_id' = 'B-X'), 'invalid_field',
  'o item inválido é recusado com o motivo, sem derrubar o lote');
select is((select count(*)::int from public.seal_positions where device_id = 'a1330000-0000-0000-0000-0000000000a1'), 4, 'quatro pontos distintos gravados');
select is((select p.read_at from public.seal_devices d join public.seal_positions p on p.id = d.last_position_id
  where d.id = 'a1330000-0000-0000-0000-0000000000a1'), now() - interval '10 minutes', 'a última posição é a de maior horário de leitura');

-- Leitura atrasada que chega depois: entra no histórico sem tomar o lugar da mais nova.
select pg_temp.send(jsonb_build_array(pg_temp.pos('B-LATE', '25 minutes', 0.0005)));
select is((select p.read_at from public.seal_devices d join public.seal_positions p on p.id = d.last_position_id
  where d.id = 'a1330000-0000-0000-0000-0000000000a1'), now() - interval '10 minutes', 'a leitura atrasada não substitui a mais nova');
select is((select count(*)::int from public.seal_positions where device_id = 'a1330000-0000-0000-0000-0000000000a1'), 5, 'mas entra no histórico');

-- Mais de 50 leituras: o corpo inteiro é recusado (a borda já recusa; o banco repete a regra).
select is(pg_temp.send((select jsonb_agg(pg_temp.pos('L-' || i, make_interval(secs => i), 0)) from generate_series(1, 51) i))->>'status', '400',
  'lote com 51 leituras é recusado inteiro');

select * from finish();
rollback;
