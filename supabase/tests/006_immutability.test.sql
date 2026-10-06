begin;
select plan(21);

-- Spec 006: nada é excluído e histórico e testes são imutáveis para qualquer papel (RF-005, RF-024, CA-003, CA-004).
insert into public.cylinder_types (id, organization_id, gas, capacity_value, capacity_unit, classification) values
  ('71000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-00000000000a', 'Nitrogênio', 40, 'l', 'industrial');
insert into public.cylinders (id, organization_id, cylinder_type_id, serial_number) values
  ('72000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-00000000000a', '71000000-0000-0000-0000-0000000000a1', 'IMUT-001');
insert into public.cylinder_identifiers (id, organization_id, cylinder_id, kind, value) values
  ('73000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-00000000000a', '72000000-0000-0000-0000-0000000000a1', 'nfc_tag', 'NFC-IMUT-1');
insert into public.cylinder_tests (id, organization_id, cylinder_id, performed_on, result, executor, next_due_on) values
  ('74000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-00000000000a', '72000000-0000-0000-0000-0000000000a1', current_date - 5, 'approved', 'Laboratório', current_date + 300);
insert into public.cylinder_events (id, organization_id, cylinder_id, sequence, event_type, actor_user_id) values
  ('75000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-00000000000a', '72000000-0000-0000-0000-0000000000a1', 1, 'cylinder_created', '10000000-0000-0000-0000-000000000002');

-- Eventos: nenhum papel altera, exclui ou esvazia, nem o service_role e nem o dono das tabelas.
set local role service_role;
select throws_ok($$ update public.cylinder_events set justification = 'x' $$, 'P0001', 'cylinder_record_immutable', 'service_role não altera evento');
select throws_ok($$ delete from public.cylinder_events $$, 'P0001', 'cylinder_record_immutable', 'service_role não exclui evento');
select throws_ok($$ truncate public.cylinder_events $$, null, null, 'service_role não esvazia eventos');
reset role;
select throws_ok($$ update public.cylinder_events set justification = 'x' $$, 'P0001', 'cylinder_record_immutable', 'o dono não altera evento');
select throws_ok($$ delete from public.cylinder_events $$, 'P0001', 'cylinder_record_immutable', 'o dono não exclui evento');
select throws_ok($$ truncate public.cylinder_events $$, 'P0001', 'cylinder_record_immutable', 'o dono não esvazia eventos');

-- Testes hidrostáticos: somente inserção.
set local role service_role;
select throws_ok($$ update public.cylinder_tests set executor = 'Outro' $$, 'P0001', 'cylinder_record_immutable', 'service_role não altera teste');
select throws_ok($$ delete from public.cylinder_tests $$, 'P0001', 'cylinder_record_immutable', 'service_role não exclui teste');
reset role;
select throws_ok($$ truncate public.cylinder_tests $$, 'P0001', 'cylinder_record_immutable', 'o dono não esvazia testes');

-- Cilindros, tipos e identificadores não se excluem nem se esvaziam.
set local role service_role;
select throws_ok($$ delete from public.cylinders $$, 'P0001', 'cylinder_record_undeletable', 'service_role não exclui cilindro');
select throws_ok($$ delete from public.cylinder_types $$, 'P0001', 'cylinder_record_undeletable', 'service_role não exclui tipo');
select throws_ok($$ delete from public.cylinder_identifiers $$, 'P0001', 'cylinder_record_undeletable', 'service_role não exclui identificador');
reset role;
select throws_ok($$ truncate public.cylinders cascade $$, 'P0001', 'cylinder_record_undeletable', 'o dono não esvazia cilindros');

-- Identificador: só a transição active -> deactivated, uma vez.
select throws_ok($$ update public.cylinder_identifiers set value = 'OUTRO' where id = '73000000-0000-0000-0000-0000000000a1' $$, 'P0001', 'identifier_update_not_allowed', 'não troca o valor de um identificador');
select throws_ok($$ update public.cylinder_identifiers set cylinder_id = '72000000-0000-0000-0000-0000000000a1', status = 'deactivated' where id = '73000000-0000-0000-0000-0000000000a1' $$, null, null, 'desativar sem os campos de desativação é recusado');
select lives_ok($$ update public.cylinder_identifiers set status = 'deactivated', deactivated_at = now(),
  deactivated_by = '10000000-0000-0000-0000-000000000002', deactivation_justification = 'Etiqueta danificada'
  where id = '73000000-0000-0000-0000-0000000000a1' $$, 'desativa o identificador com justificativa');
select throws_ok($$ update public.cylinder_identifiers set status = 'active', deactivated_at = null, deactivated_by = null, deactivation_justification = null
  where id = '73000000-0000-0000-0000-0000000000a1' $$, 'P0001', 'identifier_update_not_allowed', 'identificador desativado não volta a ativo');

-- Unicidade da sequência por cilindro.
select throws_ok($$ insert into public.cylinder_events (organization_id, cylinder_id, sequence, event_type, actor_user_id)
  values ('20000000-0000-0000-0000-00000000000a', '72000000-0000-0000-0000-0000000000a1', 1, 'cylinder_updated', '10000000-0000-0000-0000-000000000002') $$, '23505', null, 'sequência repetida no mesmo cilindro é recusada');
select lives_ok($$ insert into public.cylinder_events (organization_id, cylinder_id, sequence, event_type, actor_user_id)
  values ('20000000-0000-0000-0000-00000000000a', '72000000-0000-0000-0000-0000000000a1', 2, 'cylinder_updated', '10000000-0000-0000-0000-000000000002') $$, 'a próxima sequência é aceita');
select throws_ok($$ insert into public.cylinder_events (organization_id, cylinder_id, sequence, event_type, actor_user_id)
  values ('20000000-0000-0000-0000-00000000000a', '72000000-0000-0000-0000-0000000000a1', 3, 'cylinder_apagado', '10000000-0000-0000-0000-000000000002') $$, '23514', null, 'tipo de evento desconhecido é recusado');
select throws_ok($$ insert into public.cylinder_events (organization_id, cylinder_id, sequence, event_type, actor_user_id)
  values ('20000000-0000-0000-0000-00000000000b', '72000000-0000-0000-0000-0000000000a1', 3, 'cylinder_updated', '10000000-0000-0000-0000-000000000003') $$, '23503', null, 'evento com organização diferente da do cilindro é recusado');

select * from finish(); rollback;
