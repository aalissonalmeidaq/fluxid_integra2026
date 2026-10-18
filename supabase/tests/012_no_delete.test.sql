begin;
select plan(27);

-- Spec 012: nenhum dado do lacre é excluído fisicamente (RF-041). Os gatilhos são por comando, então recusam mesmo sem linhas,
-- para qualquer papel (inclusive service_role). Os históricos e as mensagens recebidas também não aceitam update.

-- delete como service_role; truncate com cascade como dono do banco (o cascade alcança tabelas privadas que o service_role não
-- vê), para provar que o próprio gatilho recusa, e não só a chave estrangeira.
select throws_ok($$ set local role service_role; delete from public.seal_devices $$, 'P0001', 'seal_record_undeletable', 'seal_devices não aceita delete');
select throws_ok($$ truncate public.seal_devices cascade $$, 'P0001', 'seal_record_undeletable', 'seal_devices não aceita truncate');
select throws_ok($$ set local role service_role; delete from public.seal_device_events $$, 'P0001', 'seal_record_undeletable', 'seal_device_events não aceita delete');
select throws_ok($$ truncate public.seal_device_events cascade $$, 'P0001', 'seal_record_undeletable', 'seal_device_events não aceita truncate');
select throws_ok($$ set local role service_role; delete from public.seal_bindings $$, 'P0001', 'seal_record_undeletable', 'seal_bindings não aceita delete');
select throws_ok($$ truncate public.seal_bindings cascade $$, 'P0001', 'seal_record_undeletable', 'seal_bindings não aceita truncate');
select throws_ok($$ set local role service_role; delete from public.seal_messages $$, 'P0001', 'seal_record_undeletable', 'seal_messages não aceita delete');
select throws_ok($$ truncate public.seal_messages cascade $$, 'P0001', 'seal_record_undeletable', 'seal_messages não aceita truncate');
select throws_ok($$ set local role service_role; delete from public.seal_positions $$, 'P0001', 'seal_record_undeletable', 'seal_positions não aceita delete');
select throws_ok($$ truncate public.seal_positions cascade $$, 'P0001', 'seal_record_undeletable', 'seal_positions não aceita truncate');
select throws_ok($$ set local role service_role; delete from public.seal_commands $$, 'P0001', 'seal_record_undeletable', 'seal_commands não aceita delete');
select throws_ok($$ truncate public.seal_commands cascade $$, 'P0001', 'seal_record_undeletable', 'seal_commands não aceita truncate');
select throws_ok($$ set local role service_role; delete from public.seal_command_events $$, 'P0001', 'seal_record_undeletable', 'seal_command_events não aceita delete');
select throws_ok($$ truncate public.seal_command_events cascade $$, 'P0001', 'seal_record_undeletable', 'seal_command_events não aceita truncate');
select throws_ok($$ set local role service_role; delete from public.seal_watches $$, 'P0001', 'seal_record_undeletable', 'seal_watches não aceita delete');
select throws_ok($$ truncate public.seal_watches cascade $$, 'P0001', 'seal_record_undeletable', 'seal_watches não aceita truncate');
select throws_ok($$ set local role service_role; delete from public.seal_violations $$, 'P0001', 'seal_record_undeletable', 'seal_violations não aceita delete');
select throws_ok($$ truncate public.seal_violations cascade $$, 'P0001', 'seal_record_undeletable', 'seal_violations não aceita truncate');
select throws_ok($$ set local role service_role; delete from public.seal_alerts $$, 'P0001', 'seal_record_undeletable', 'seal_alerts não aceita delete');
select throws_ok($$ truncate public.seal_alerts cascade $$, 'P0001', 'seal_record_undeletable', 'seal_alerts não aceita truncate');
select throws_ok($$ set local role service_role; delete from public.push_subscriptions $$, 'P0001', 'seal_record_undeletable', 'push_subscriptions não aceita delete');
select throws_ok($$ truncate public.push_subscriptions cascade $$, 'P0001', 'seal_record_undeletable', 'push_subscriptions não aceita truncate');
select throws_ok($$ set local role service_role; delete from public.push_outbox $$, 'P0001', 'seal_record_undeletable', 'push_outbox não aceita delete');
select throws_ok($$ truncate public.push_outbox cascade $$, 'P0001', 'seal_record_undeletable', 'push_outbox não aceita truncate');

select throws_ok($$ update public.seal_command_events set detail = '{}' $$, 'P0001', 'seal_record_immutable', 'histórico de comandos é imutável');
select throws_ok($$ update public.seal_device_events set detail = '{}' $$, 'P0001', 'seal_record_immutable', 'histórico do dispositivo é imutável');
select throws_ok($$ update public.seal_messages set summary = '{}' $$, 'P0001', 'seal_record_immutable', 'mensagem recebida é imutável');
select * from finish();
rollback;
