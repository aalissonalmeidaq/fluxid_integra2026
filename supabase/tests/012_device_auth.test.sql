begin;
select plan(9);

-- Spec 012, US1: autenticação do dispositivo no endpoint do lacre (RF-002, CA-006). A borda calcula o SHA-256 da chave e chama
-- seal_ingest; toda falha devolve o mesmo resultado, sem revelar o motivo, e nada é gravado. Hermético: rollback.

insert into public.seal_devices (id, organization_id, device_code, label, key_hash, created_by) values
  ('a1300000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-00000000000a', 'DSP-AUTHA001', 'Lacre A1', extensions.digest('chave-a1', 'sha256'), '10000000-0000-0000-0000-000000000002'),
  ('a1300000-0000-0000-0000-0000000000a2', '20000000-0000-0000-0000-00000000000a', 'DSP-AUTHA002', 'Lacre A2', extensions.digest('chave-a2', 'sha256'), '10000000-0000-0000-0000-000000000002'),
  ('a1300000-0000-0000-0000-0000000000a3', '20000000-0000-0000-0000-00000000000a', 'DSP-AUTHA003', 'Lacre inativo', extensions.digest('chave-a3', 'sha256'), '10000000-0000-0000-0000-000000000002');
update public.seal_devices set status = 'inactive' where id = 'a1300000-0000-0000-0000-0000000000a3';

create function pg_temp.body(p_id text) returns jsonb language sql as $$
  select jsonb_build_object('protocol', 1, 'watch_version', 0, 'messages', jsonb_build_array(jsonb_build_object(
    'message_id', p_id, 'type', 'position', 'read_at', now() - interval '10 seconds', 'problem', null,
    'data', jsonb_build_object('latitude', -7.2, 'longitude', -39.3, 'quality', 'gps', 'accuracy_m', 5, 'battery_pct', 80, 'signal_dbm', -60, 'seal_state', 'closed'))))
$$;
create function pg_temp.send(p_code text, p_key bytea, p_source text, p_id text) returns jsonb language sql as $$
  select public.seal_ingest(p_code, p_key, extensions.digest(p_source, 'sha256'), pg_temp.body(p_id))
$$;

select is((pg_temp.send('DSP-AUTHA001', extensions.digest('chave-a1', 'sha256'), 'ip-1', 'M-OK')->>'status')::int, 200, 'chave certa: aceita');

create temp table respostas as
  select 'sem chave' as caso, pg_temp.send('DSP-AUTHA001', null, 'ip-2', 'M-1') as r
  union all select 'chave errada', pg_temp.send('DSP-AUTHA001', extensions.digest('outra', 'sha256'), 'ip-3', 'M-2')
  union all select 'chave de outro dispositivo', pg_temp.send('DSP-AUTHA001', extensions.digest('chave-a2', 'sha256'), 'ip-4', 'M-3')
  union all select 'dispositivo inativo', pg_temp.send('DSP-AUTHA003', extensions.digest('chave-a3', 'sha256'), 'ip-5', 'M-4')
  union all select 'dispositivo inexistente', pg_temp.send('DSP-NAOEXISTE', extensions.digest('chave-a1', 'sha256'), 'ip-6', 'M-5');

select is((select r->>'status' from respostas where caso = 'sem chave'), '401', 'sem chave: recusado');
select is((select r->>'status' from respostas where caso = 'chave errada'), '401', 'chave errada: recusado');
select is((select r->>'status' from respostas where caso = 'chave de outro dispositivo'), '401', 'chave de outro dispositivo: recusado');
select is((select r->>'status' from respostas where caso = 'dispositivo inativo'), '401', 'dispositivo inativo: recusado');
select is((select r->>'status' from respostas where caso = 'dispositivo inexistente'), '401', 'dispositivo inexistente: recusado');
select is((select count(distinct r)::int from respostas), 1, 'todas as recusas têm exatamente a mesma resposta, sem o motivo');
select is((select count(*)::int from public.seal_messages where device_id in (
  'a1300000-0000-0000-0000-0000000000a1', 'a1300000-0000-0000-0000-0000000000a2', 'a1300000-0000-0000-0000-0000000000a3')), 1,
  'nada é gravado nas recusas');
select is((select count(*)::int from public.seal_devices d where d::text like '%chave-a%'), 0, 'nenhuma coluna guarda a chave em texto');

select * from finish();
rollback;
