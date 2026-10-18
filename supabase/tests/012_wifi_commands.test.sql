begin;
select plan(20);

-- Spec 012, US7: redes Wi-Fi do lacre configuradas pelo sistema (RF-034a a RF-034f, CA-008, CA-009). A senha vai para o Vault e só sai na
-- resposta ao próprio lacre; some do FluxID quando o comando termina de qualquer jeito. Lista de até 5 redes; voltar à padrão exige
-- justificativa; com viagem ou vigilância, a troca pede confirmação do risco. Hermético: rollback.

delete from public.user_sessions where user_id = '10000000-0000-0000-0000-000000000002';
select public.start_user_session('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000001207a2', 'aal1');

insert into public.cylinder_types (id, organization_id, gas, capacity_value, capacity_unit, classification) values
  ('a2570000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', 'Oxigênio', 10, 'l', 'medicinal');
insert into public.cylinders (id, organization_id, cylinder_type_id, serial_number) values
  ('a2580000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-00000000000a', 'a2570000-0000-0000-0000-00000000000a', 'WIFI-A-1');
insert into public.customers (id, organization_id, person_type, document_display, legal_name, segment) values
  ('a2510000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', 'legal', '11222333000181', 'Hospital Alfa Ltda', 'hospital');
insert into public.customer_sites (id, organization_id, customer_id, name, postal_code, street, number, city, state) values
  ('a2520000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', 'a2510000-0000-0000-0000-00000000000a', 'Unidade', '01001000', 'Praça da Sé', '1', 'São Paulo', 'SP');
insert into public.seal_devices (id, organization_id, device_code, label, key_hash, created_by) values
  ('a2500000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-00000000000a', 'DSP-WIFIA001', 'Lacre A', extensions.digest('k', 'sha256'), '10000000-0000-0000-0000-000000000002');

create function pg_temp.call(p_fn text, p_args text) returns jsonb language plpgsql as $$
declare r jsonb;
begin
  execute format('select public.%I(%L, %L, %L, gen_random_uuid(), %L%s)', p_fn, '10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000001207a2',
    '20000000-0000-0000-0000-00000000000a', 'a2500000-0000-0000-0000-0000000000a1', p_args) into r;
  return r;
end $$;
create function pg_temp.send(p_msgs jsonb default '[]') returns jsonb language sql as $$
  update private.seal_rate_windows set count = 0;
  select public.seal_ingest('DSP-WIFIA001', extensions.digest('k', 'sha256'), extensions.digest('ip', 'sha256'), jsonb_build_object('protocol', 1, 'messages',
    jsonb_build_array(jsonb_build_object('message_id', gen_random_uuid()::text, 'type', 'event', 'read_at', clock_timestamp(), 'problem', null, 'data', '{"code": "boot"}'::jsonb)) || p_msgs))
$$;
create function pg_temp.result(p_command uuid, p_result text, p_reason text default null) returns jsonb language sql as $$
  select jsonb_build_array(jsonb_build_object('message_id', gen_random_uuid()::text, 'type', 'command_result', 'read_at', clock_timestamp(), 'problem', null,
    'data', jsonb_build_object('command_id', p_command, 'result', p_result, 'reason', p_reason)))
$$;
create function pg_temp.secrets() returns int language sql as $$
  select count(*)::int from vault.secrets s join public.seal_commands c on c.wifi_secret_id = s.id where c.device_id = 'a2500000-0000-0000-0000-0000000000a1'
$$;

-- Adicionar: senha só no Vault; o comando guarda a referência.
select is(pg_temp.call('wifi_add', ', ''Rede-Deposito'', ''curta'', false, false')->>'code', 'VALIDATION_FAILED', 'senha com menos de 8 caracteres é recusada');
select is(pg_temp.call('wifi_add', format(', %L, %L, false, false', repeat('r', 33), 'senha-ficticia-123'))->>'code', 'VALIDATION_FAILED', 'nome com mais de 32 bytes é recusado');
create temp table c1 as select (pg_temp.call('wifi_add', ', ''Rede-Deposito'', ''senha-ficticia-123'', false, false')->>'command_id')::uuid as id;
select ok((select wifi_secret_id is not null and wifi_ssid = 'Rede-Deposito' from public.seal_commands where id = (select id from c1)), 'o comando guarda só a referência da senha no Vault');
select is(pg_temp.secrets(), 1, 'a senha está no Vault');
select ok((select bool_and(metadata::text not like '%senha-ficticia%' and metadata::text like '%Rede-Deposito%') from public.audit_logs where action = 'seal.wifi_add' and target_id = 'a2500000-0000-0000-0000-0000000000a1'),
  'a auditoria registra o nome da rede e nunca a senha');

-- Entrega ao lacre: a senha só aparece na resposta ao próprio lacre.
create temp table r1 as select pg_temp.send() as r;
select is((select r->'body'->'command'->>'kind' || ':' || (r->'body'->'command'->>'ssid') || ':' || (r->'body'->'command'->>'password') from r1),
  'wifi_add:Rede-Deposito:senha-ficticia-123', 'o lacre recebe a rede e a senha na resposta');

-- Confirmação: a rede entra na lista e a senha some.
select pg_temp.send(pg_temp.result((select id from c1), 'executed'));
select is((select wifi_saved from public.seal_devices where id = 'a2500000-0000-0000-0000-0000000000a1'), '["Rede-Deposito"]'::jsonb, 'confirmada, a rede aparece na lista');
select is(pg_temp.secrets(), 0, 'e a senha é apagada do FluxID');
select is((select wifi_secret_id from public.seal_commands where id = (select id from c1)), null::uuid, 'o comando não guarda mais a referência');

-- Falha do lacre: com o motivo, alerta médio e a senha apagada.
create temp table c2 as select (pg_temp.call('wifi_add', ', ''Rede-Cliente'', ''senha-errada-123'', false, false')->>'command_id')::uuid as id;
select pg_temp.send();
select pg_temp.send(pg_temp.result((select id from c2), 'error', 'wifi_auth'));
select is((select status from public.seal_commands where id = (select id from c2)) || ':' || pg_temp.secrets(), 'failed:0', 'erro: comando com erro e senha apagada');
select is((select severity || ':' || (context->>'reason') from public.seal_alerts where device_id = 'a2500000-0000-0000-0000-0000000000a1' and kind = 'wifi_change_failed'),
  'medium:wifi_auth', 'alerta médio com o motivo');
select is((select wifi_saved from public.seal_devices where id = 'a2500000-0000-0000-0000-0000000000a1'), '["Rede-Deposito"]'::jsonb, 'a rede com falha não entra na lista');

-- Novo pedido para a mesma rede cancela o anterior (e apaga a senha dele); expiração também apaga.
create temp table c3 as select (pg_temp.call('wifi_add', ', ''Rede-Caminhao'', ''senha-ficticia-111'', false, false')->>'command_id')::uuid as id;
create temp table c4 as select (pg_temp.call('wifi_add', ', ''Rede-Caminhao'', ''senha-ficticia-222'', false, false')->>'command_id')::uuid as id;
select is((select status from public.seal_commands where id = (select id from c3)) || ':' || pg_temp.secrets(), 'cancelled:1', 'o pedido novo cancela o anterior e só uma senha fica');
update public.seal_commands set created_at = now() - interval '31 minutes' where id = (select id from c4);
select private.run_seal_watchdog();
select is((select status from public.seal_commands where id = (select id from c4)) || ':' || pg_temp.secrets(), 'expired:0', 'não entregue em 30 min: expira e a senha some');

-- Remover e voltar à padrão.
select is(pg_temp.call('wifi_remove', ', ''Rede-Inexistente'', false')->>'code', 'WIFI_NOT_IN_LIST', 'remover rede que não está na lista é recusado');
select is(pg_temp.call('wifi_reset', ', ''ok'', false')->>'code', 'JUSTIFICATION_REQUIRED', 'voltar à padrão exige justificativa');

-- Limite de 5 redes.
update public.seal_devices set wifi_saved = '["R1", "R2", "R3", "R4", "R5"]' where id = 'a2500000-0000-0000-0000-0000000000a1';
select is(pg_temp.call('wifi_add', ', ''R6'', ''senha-ficticia-666'', false, false')->>'code', 'WIFI_LIST_FULL', 'a sexta rede é recusada');
select is(pg_temp.call('wifi_add', ', ''R5'', ''senha-ficticia-555'', false, false')->>'code', 'REQUESTED', 'a mesma rede da lista pode receber senha nova');

-- Com vigilância (ou viagem), a troca exige confirmar o risco.
insert into public.seal_bindings (organization_id, device_id, cylinder_id, bound_by) values
  ('20000000-0000-0000-0000-00000000000a', 'a2500000-0000-0000-0000-0000000000a1', 'a2580000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-000000000002');
insert into public.seal_watches (organization_id, cylinder_id, device_id, site_id) values
  ('20000000-0000-0000-0000-00000000000a', 'a2580000-0000-0000-0000-0000000000a1', 'a2500000-0000-0000-0000-0000000000a1', 'a2520000-0000-0000-0000-00000000000a');
select is(pg_temp.call('wifi_remove', ', ''R1'', false')->>'code', 'WIFI_RISK_NOT_CONFIRMED', 'sob vigilância, sem confirmar o risco: recusado');
select is(pg_temp.call('wifi_remove', ', ''R1'', true')->>'code', 'REQUESTED', 'confirmando o risco: pedido');

select * from finish();
rollback;
