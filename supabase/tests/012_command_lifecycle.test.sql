begin;
select plan(22);

-- Spec 012, US2: ciclo de vida dos comandos do lacre (RF-025 a RF-029, CA-002; Clarifications 17/10). Só `executed` muda a trava;
-- erro, expiração e trava não entregue em 30 min deixam "não confirmada". A resposta leva no máximo um comando, o entregue volta até
-- a confirmação, e um comando novo cancela o anterior. Hermético: rollback.

delete from public.user_sessions where user_id = '10000000-0000-0000-0000-000000000002';
select public.start_user_session('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000001204a2', 'aal1');

insert into public.cylinder_types (id, organization_id, gas, capacity_value, capacity_unit, classification) values
  ('a1870000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', 'Oxigênio', 10, 'l', 'medicinal');
insert into public.cylinders (id, organization_id, cylinder_type_id, serial_number) values
  ('a1880000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-00000000000a', 'a1870000-0000-0000-0000-00000000000a', 'CMD-A-001');
insert into public.seal_devices (id, organization_id, device_code, label, key_hash, created_by) values
  ('a1800000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-00000000000a', 'DSP-CMDA0001', 'Lacre A', extensions.digest('k-a', 'sha256'), '10000000-0000-0000-0000-000000000002'),
  ('a1800000-0000-0000-0000-0000000000a2', '20000000-0000-0000-0000-00000000000a', 'DSP-CMDA0002', 'Lacre A2', extensions.digest('k-a2', 'sha256'), '10000000-0000-0000-0000-000000000002');
insert into public.seal_bindings (organization_id, device_id, cylinder_id, bound_by) values
  ('20000000-0000-0000-0000-00000000000a', 'a1800000-0000-0000-0000-0000000000a1', 'a1880000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-000000000002');

create function pg_temp.send(p_code text, p_key text, p_msgs jsonb) returns jsonb language sql as $$
  update private.seal_rate_windows set count = 0;
  select public.seal_ingest(p_code, extensions.digest(p_key, 'sha256'), extensions.digest('ip', 'sha256'), jsonb_build_object('protocol', 1, 'messages', p_msgs))
$$;
create function pg_temp.pos() returns jsonb language sql as $$
  select jsonb_build_object('message_id', gen_random_uuid()::text, 'type', 'position', 'read_at', now(), 'problem', null,
    'data', jsonb_build_object('latitude', -7.2, 'longitude', -39.3, 'quality', 'gps', 'accuracy_m', 5, 'battery_pct', 80, 'signal_dbm', -60, 'seal_state', 'closed'))
$$;
create function pg_temp.result(p_command uuid, p_result text, p_reason text default null) returns jsonb language sql as $$
  select jsonb_build_object('message_id', gen_random_uuid()::text, 'type', 'command_result', 'read_at', now(), 'problem', null,
    'data', jsonb_build_object('command_id', p_command, 'result', p_result, 'reason', p_reason))
$$;
create function pg_temp.lock_state() returns text language sql as $$ select lock_state from public.seal_devices where id = 'a1800000-0000-0000-0000-0000000000a1' $$;
create function pg_temp.req(p_fn text, p_just text) returns jsonb language plpgsql as $$
declare r jsonb;
begin
  execute format('select public.%I(%L, %L, %L, gen_random_uuid(), %L, %L)', p_fn, '10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000001204a2',
    '20000000-0000-0000-0000-00000000000a', 'a1880000-0000-0000-0000-0000000000a1', p_just) into r;
  return r;
end $$;

-- Pedido manual de travar: justificativa obrigatória e auditoria.
select is(pg_temp.req('request_lock', 'ok')->>'code', 'JUSTIFICATION_REQUIRED', 'travar sem justificativa de 5 a 500 é recusado');
create temp table c1 as select (pg_temp.req('request_lock', 'Cilindro parado no pátio.')->>'command_id')::uuid as id;
select is((select status || ':' || origin from public.seal_commands where id = (select id from c1)), 'pending:manual', 'o pedido manual cria um comando pendente');
select is((select count(*)::int from public.audit_logs where action = 'seal.command_manual' and metadata::text not like '%pátio%'), 1, 'auditoria sem a justificativa');

-- Entrega ao lacre na resposta; o entregue volta até a confirmação, com o mesmo id.
create temp table r1 as select pg_temp.send('DSP-CMDA0001', 'k-a', jsonb_build_array(pg_temp.pos())) as r;
select is((select r->'body'->'command'->>'id' from r1)::uuid, (select id from c1), 'a resposta leva o comando pendente');
select is((select r->'body'->'command'->>'kind' from r1), 'lock', 'com o tipo');
select is((select status from public.seal_commands where id = (select id from c1)), 'delivered', 'o comando passa a "entregue ao lacre"');
select is((pg_temp.send('DSP-CMDA0001', 'k-a', jsonb_build_array(pg_temp.pos()))->'body'->'command'->>'id')::uuid, (select id from c1),
  'sem confirmação, o mesmo comando volta na próxima resposta');
select is(pg_temp.lock_state(), 'none', 'entregue não é executado: a trava não muda (RN-001)');

-- Confirmação "executado" muda a trava; repetida é idempotente.
select pg_temp.send('DSP-CMDA0001', 'k-a', jsonb_build_array(pg_temp.result((select id from c1), 'executed')));
select is(pg_temp.lock_state(), 'locked', '"executado" muda a trava para travada');
select is((select status from public.seal_commands where id = (select id from c1)), 'confirmed', 'e o comando para confirmado');
select is(pg_temp.send('DSP-CMDA0001', 'k-a', jsonb_build_array(pg_temp.result((select id from c1), 'executed')))->'body'->'results'->0->>'status', 'stored',
  'a confirmação repetida é aceita sem efeito');
select is((pg_temp.send('DSP-CMDA0001', 'k-a', jsonb_build_array(pg_temp.pos()))->'body'->'command'), 'null'::jsonb, 'confirmado não volta mais');

-- Confirmação de comando desconhecido ou de outro lacre.
select is(pg_temp.send('DSP-CMDA0001', 'k-a', jsonb_build_array(pg_temp.result(gen_random_uuid(), 'executed')))->'body'->'results'->0->>'reason',
  'unknown_command', 'comando desconhecido é recusado');
select is(pg_temp.send('DSP-CMDA0002', 'k-a2', jsonb_build_array(pg_temp.result((select id from c1), 'executed')))->'body'->'results'->0->>'reason',
  'command_of_other_device', 'confirmação de comando de outro lacre é recusada');

-- Erro do lacre: "não confirmada" e alerta.
create temp table c2 as select (pg_temp.req('request_lock', 'Travar de novo para conferência.')->>'command_id')::uuid as id;
select pg_temp.send('DSP-CMDA0001', 'k-a', jsonb_build_array(pg_temp.pos()));
select pg_temp.send('DSP-CMDA0001', 'k-a', jsonb_build_array(pg_temp.result((select id from c2), 'error', 'actuator')));
select is(pg_temp.lock_state(), 'unconfirmed', '"erro" deixa a trava "não confirmada"');
select is((select count(*)::int from public.seal_alerts where device_id = 'a1800000-0000-0000-0000-0000000000a1' and kind = 'command_failed'), 1, 'e abre alerta de comando com erro');

-- Comando novo cancela o pendente; a confirmação do cancelado é registrada sem mudar a trava.
create temp table c3 as select (pg_temp.req('request_lock', 'Primeiro pedido de trava.')->>'command_id')::uuid as id;
update public.user_sessions set aal = 'aal2' where session_id = '60000000-0000-0000-0000-0000001204a2';
create temp table c4 as select (pg_temp.req('request_unlock', 'Liberar para o cliente usar.')->>'command_id')::uuid as id;
select is((select status || ':' || coalesce(cancel_reason, '') from public.seal_commands where id = (select id from c3)), 'cancelled:superseded',
  'o comando novo cancela o anterior ainda pendente, com o motivo');
select pg_temp.send('DSP-CMDA0001', 'k-a', jsonb_build_array(pg_temp.result((select id from c3), 'executed')));
select is(pg_temp.lock_state(), 'unconfirmed', 'a confirmação de um comando cancelado não muda a trava');
select ok(exists (select 1 from public.seal_command_events where command_id = (select id from c3) and detail ? 'late_result'), 'mas fica registrada');

-- Prazos: entregue sem confirmação em 10 min expira; trava não entregue em 30 min não expira, fica "não confirmada" e abre alerta.
select pg_temp.send('DSP-CMDA0001', 'k-a', jsonb_build_array(pg_temp.pos()));
update public.seal_commands set delivered_at = now() - interval '11 minutes' where id = (select id from c4);
select private.run_seal_watchdog();
select is((select status from public.seal_commands where id = (select id from c4)), 'expired', 'entregue e não confirmado em 10 min: expirado');
create temp table c5 as select (pg_temp.req('request_lock', 'Trava enquanto o lacre está sem rede.')->>'command_id')::uuid as id;
update public.seal_commands set created_at = now() - interval '31 minutes' where id = (select id from c5);
update public.seal_devices set lock_state = 'unlocked' where id = 'a1800000-0000-0000-0000-0000000000a1';
select private.run_seal_watchdog();
select is((select status from public.seal_commands where id = (select id from c5)) || ':' || pg_temp.lock_state(), 'pending:unconfirmed',
  'trava não entregue em 30 min: continua pendente e a trava fica "não confirmada"');
select private.run_seal_watchdog();
select is((select count(*)::int from public.seal_alerts where device_id = 'a1800000-0000-0000-0000-0000000000a1' and kind = 'command_not_delivered'), 1,
  'um único alerta de comando não entregue');

select * from finish();
rollback;
