begin;
select plan(9);

-- Spec 012, US1: limites do endpoint do lacre (RF-006). Até 6 pedidos por dispositivo por minuto; 10 chaves erradas do mesmo
-- endereço em 10 minutos bloqueiam aquele endereço por 15 minutos, sem revelar se o dispositivo existe; nada se perde. Hermético.

insert into public.seal_devices (id, organization_id, device_code, label, key_hash, created_by) values
  ('a1310000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-00000000000a', 'DSP-RATEA001', 'Lacre A1', extensions.digest('chave-r1', 'sha256'), '10000000-0000-0000-0000-000000000002'),
  ('a1310000-0000-0000-0000-0000000000a2', '20000000-0000-0000-0000-00000000000a', 'DSP-RATEA002', 'Lacre A2', extensions.digest('chave-r2', 'sha256'), '10000000-0000-0000-0000-000000000002');

create function pg_temp.send(p_code text, p_key text, p_source text, p_id text) returns jsonb language sql as $$
  select public.seal_ingest(p_code, extensions.digest(p_key, 'sha256'), extensions.digest(p_source, 'sha256'),
    jsonb_build_object('protocol', 1, 'watch_version', 0, 'messages', jsonb_build_array(jsonb_build_object(
      'message_id', p_id, 'type', 'position', 'read_at', now() - interval '5 seconds', 'problem', null,
      'data', jsonb_build_object('latitude', -7.2, 'longitude', -39.3, 'quality', 'gps', 'accuracy_m', 5, 'battery_pct', 80, 'signal_dbm', -60, 'seal_state', 'closed')))))
$$;

select is((select count(*)::int from generate_series(1, 6) i where (pg_temp.send('DSP-RATEA001', 'chave-r1', 'ip-1', 'M-' || i)->>'status') = '200'), 6,
  'até 6 pedidos no mesmo minuto são aceitos');
create temp table setimo as select pg_temp.send('DSP-RATEA001', 'chave-r1', 'ip-1', 'M-7') as r;
select is((select r->>'status' from setimo), '429', 'o 7º pedido no minuto é recusado');
select ok((select (r->>'retry_after')::int between 1 and 60 from setimo), 'a recusa informa em quantos segundos tentar de novo');
select pg_temp.send('DSP-RATEA001', 'chave-r1', 'ip-1', 'M-8');
select is((select count(*)::int from public.seal_alerts where device_id = 'a1310000-0000-0000-0000-0000000000a1' and kind = 'rate_limited'), 1,
  'um único alerta de envio acima do limite');
select is((select count(*)::int from public.seal_messages where device_id = 'a1310000-0000-0000-0000-0000000000a1' and message_id = 'M-7'), 0,
  'a mensagem recusada pelo limite não foi gravada');

-- No minuto seguinte, o reenvio da mesma mensagem é aceito (nada se perde).
update private.seal_rate_windows set window_start = window_start - interval '1 minute' where device_id = 'a1310000-0000-0000-0000-0000000000a1';
select is(pg_temp.send('DSP-RATEA001', 'chave-r1', 'ip-1', 'M-7')->'body'->'results'->0->>'status', 'stored', 'o reenvio depois do limite é gravado');

-- Chaves erradas do mesmo endereço.
select pg_temp.send('DSP-RATEA002', 'errada', 'ip-ataque', 'X-' || i) from generate_series(1, 9) i;
select is(pg_temp.send('DSP-RATEA002', 'errada', 'ip-ataque', 'X-10')->>'status', '401', 'a 10ª chave errada ainda é "não autorizado"');
select is(pg_temp.send('DSP-RATEA002', 'chave-r2', 'ip-ataque', 'OK-1')->>'status', '429', 'depois de 10 erros, o endereço fica bloqueado até para a chave certa');
select is(pg_temp.send('DSP-RATEA002', 'chave-r2', 'ip-outro', 'OK-2')->>'status', '200', 'outro endereço continua funcionando');

select * from finish();
rollback;
