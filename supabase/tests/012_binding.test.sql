begin;
-- A demonstração do seed (Spec 014, "Oxigênio Cariri") tem dados de exemplo próprios: fica fora das contagens globais.
select plan(24);

-- Spec 012, US5: cadastro do dispositivo, chave mostrada uma vez, troca de chave, desativação, vínculo e desvínculo (RF-031 a RF-034,
-- RF-039; princípio III). Desativar, gerar chave nova e desvincular exigem justificativa de 5 a 500, que fica no histórico do
-- dispositivo ou do vínculo e nunca na auditoria. Hermético: rollback.

delete from public.user_sessions where user_id in ('10000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000003');
select public.start_user_session('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000001206a2', 'aal1');

insert into public.cylinder_types (id, organization_id, gas, capacity_value, capacity_unit, classification) values
  ('a2470000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', 'Oxigênio', 10, 'l', 'medicinal'),
  ('a2470000-0000-0000-0000-00000000000b', '20000000-0000-0000-0000-00000000000b', 'Oxigênio', 10, 'l', 'medicinal');
insert into public.cylinders (id, organization_id, cylinder_type_id, serial_number) values
  ('a2480000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-00000000000a', 'a2470000-0000-0000-0000-00000000000a', 'BIND-A-1'),
  ('a2480000-0000-0000-0000-0000000000a2', '20000000-0000-0000-0000-00000000000a', 'a2470000-0000-0000-0000-00000000000a', 'BIND-A-2'),
  ('a2480000-0000-0000-0000-0000000000b1', '20000000-0000-0000-0000-00000000000b', 'a2470000-0000-0000-0000-00000000000b', 'BIND-B-1');

create function pg_temp.call(p_fn text, p_args text) returns jsonb language plpgsql as $$
declare r jsonb;
begin
  execute format('select public.%I(%L, %L, %L, gen_random_uuid()%s)', p_fn, '10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000001206a2',
    '20000000-0000-0000-0000-00000000000a', p_args) into r;
  return r;
end $$;

-- Cadastro: código gerado e chave uma única vez; o banco guarda só o hash.
create temp table novo as select pg_temp.call('create_device', ', ''Lacre do pátio'', 60') as r;
select is((select r->>'code' from novo), 'CREATED', 'o administrador cadastra o dispositivo');
select ok((select r->>'device_code' ~ '^DSP-[0-9A-Z]{8}$' and r->>'device_key' ~ '^fxk_[A-Za-z0-9_-]{43}$' from novo), 'código DSP- e chave fxk_ de 32 bytes');
select ok((select d.key_hash = extensions.digest((select r->>'device_key' from novo), 'sha256') from public.seal_devices d
  where d.id = (select (r->>'device_id')::uuid from novo)), 'o banco guarda só o SHA-256 da chave');
select ok(not exists (select 1 from private.seal_requests q where q.result::text like '%fxk_%'), 'a chave não fica no registro de pedidos (a repetição não a devolve)');
select is((select count(*)::int from public.audit_logs where action = 'seal.device_create' and metadata::text not like '%fxk_%' and organization_id is distinct from '5478e9e3-155b-482f-b843-3513e0938dd6'), 1, 'auditoria do cadastro sem a chave');
create temp table dev as select (r->>'device_id')::uuid as id, r->>'device_code' as code, r->>'device_key' as key from novo;

-- A chave funciona no endpoint; a troca invalida a antiga na hora e exige justificativa.
select is(public.seal_ingest((select code from dev), extensions.digest((select key from dev), 'sha256'), extensions.digest('ip', 'sha256'),
  jsonb_build_object('protocol', 1, 'messages', jsonb_build_array(jsonb_build_object('message_id', 'ATV-1', 'type', 'activation', 'read_at', now(), 'problem', null,
    'data', jsonb_build_object('latitude', -7.2, 'longitude', -39.3, 'quality', 'gps', 'accuracy_m', 5, 'battery_pct', 90, 'signal_dbm', -60, 'seal_state', 'closed', 'valve', 'open')))))->>'status',
  '200', 'a chave do cadastro autentica o lacre');
select is(pg_temp.call('rotate_device_key', format(', %L, %L', (select id from dev), 'oi'))->>'code', 'JUSTIFICATION_REQUIRED', 'gerar chave nova exige justificativa');
create temp table nova_chave as select pg_temp.call('rotate_device_key', format(', %L, %L', (select id from dev), 'Chave exposta na bancada.')) as r;
select is((select r->>'code' from nova_chave), 'ROTATED', 'gera a chave nova');
select is(public.seal_ingest((select code from dev), extensions.digest((select key from dev), 'sha256'), extensions.digest('ip2', 'sha256'),
  jsonb_build_object('protocol', 1, 'messages', jsonb_build_array(jsonb_build_object('message_id', 'X', 'type', 'event', 'read_at', now(), 'problem', null,
    'data', jsonb_build_object('code', 'boot')))))->>'status', '401', 'a chave antiga deixa de valer na hora');
select ok((select justification = 'Chave exposta na bancada.' from public.seal_device_events where device_id = (select id from dev) and event_type = 'key_rotated'),
  'a justificativa fica no histórico do dispositivo');

-- Lacres ativos sem cilindro.
select is((select x->>'device_code' from jsonb_array_elements(public.list_unbound_active_seals('10000000-0000-0000-0000-000000000002',
  '60000000-0000-0000-0000-0000001206a2', '20000000-0000-0000-0000-00000000000a')->'items') x), (select code from dev), 'o lacre ativado aparece entre os ativos sem cilindro');

-- Vínculo.
select is(pg_temp.call('bind_seal', format(', %L, %L', (select id from dev), 'a2480000-0000-0000-0000-0000000000a1'))->>'code', 'BOUND', 'vincula lacre ativo e cilindro ativo');
select is(pg_temp.call('bind_seal', format(', %L, %L', (select id from dev), 'a2480000-0000-0000-0000-0000000000a2'))->>'code', 'SEAL_ALREADY_BOUND', 'o lacre já tem cilindro');
create temp table outro as select (pg_temp.call('create_device', ', ''Outro lacre'', 60')->>'device_id')::uuid as id;
select is(pg_temp.call('bind_seal', format(', %L, %L', (select id from outro), 'a2480000-0000-0000-0000-0000000000a1'))->>'code', 'CYLINDER_ALREADY_BOUND', 'o cilindro já tem lacre');
select is(pg_temp.call('bind_seal', format(', %L, %L', (select id from outro), 'a2480000-0000-0000-0000-0000000000b1'))->>'code', 'NOT_FOUND', 'cilindro de outra organização: "não encontrado"');

-- Desvínculo: justificativa e bloqueio em viagem em andamento.
select is(pg_temp.call('unbind_seal', format(', %L, %L', (select id from dev), 'ok'))->>'code', 'JUSTIFICATION_REQUIRED', 'desvincular exige justificativa');
insert into public.vehicles (id, organization_id, plate, vehicle_type, capacity_cylinders) values ('a2450000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', 'LCR4D56', 'truck', 5);
insert into public.drivers (id, organization_id, full_name, cpf_display, cnh_display, cnh_category, cnh_valid_until) values
  ('a2460000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', 'Motorista', 'x', 'x', 'D', (now() at time zone 'America/Sao_Paulo')::date + 365);
insert into public.customers (id, organization_id, person_type, document_display, legal_name, segment) values
  ('a2410000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', 'legal', '11222333000181', 'Hospital Alfa Ltda', 'hospital');
insert into public.customer_sites (id, organization_id, customer_id, name, postal_code, street, number, city, state) values
  ('a2420000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', 'a2410000-0000-0000-0000-00000000000a', 'Unidade', '01001000', 'Praça da Sé', '1', 'São Paulo', 'SP');
insert into public.trips (id, organization_id, number, planned_date, vehicle_id, driver_id, status, started_at, started_by, created_by) values
  ('a2490000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', 970, (now() at time zone 'America/Sao_Paulo')::date,
   'a2450000-0000-0000-0000-00000000000a', 'a2460000-0000-0000-0000-00000000000a', 'in_progress', now(), '10000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002');
insert into public.trip_stops (id, organization_id, trip_id, site_id, position) values
  ('a24a0000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', 'a2490000-0000-0000-0000-00000000000a', 'a2420000-0000-0000-0000-00000000000a', 1);
insert into public.trip_items (organization_id, trip_id, stop_id, cylinder_id, item_status, lock_status, checked_at, created_by) values
  ('20000000-0000-0000-0000-00000000000a', 'a2490000-0000-0000-0000-00000000000a', 'a24a0000-0000-0000-0000-00000000000a', 'a2480000-0000-0000-0000-0000000000a1',
   'in_transit', 'locked', now(), '10000000-0000-0000-0000-000000000002');
select is(pg_temp.call('unbind_seal', format(', %L, %L', (select id from dev), 'Troca do lacre.'))->>'code', 'CYLINDER_IN_TRIP', 'não desvincula em viagem em andamento');
update public.trips set status = 'completed', completed_at = now(), completed_by = '10000000-0000-0000-0000-000000000002' where id = 'a2490000-0000-0000-0000-00000000000a';
select is(pg_temp.call('unbind_seal', format(', %L, %L', (select id from dev), 'Troca do lacre.'))->>'code', 'UNBOUND', 'com a viagem encerrada, desvincula');
select is((select unbind_reason || ':' || unbind_justification from public.seal_bindings where device_id = (select id from dev)), 'manual:Troca do lacre.',
  'o desvínculo guarda o motivo e a justificativa');

-- Inativação do cilindro encerra o vínculo; desativação do dispositivo também, e recusa os envios seguintes.
select pg_temp.call('bind_seal', format(', %L, %L', (select id from outro), 'a2480000-0000-0000-0000-0000000000a2'));
update public.cylinders set status = 'inactive', inactivation_reason = 'written_off', stock_status = 'out_of_stock' where id = 'a2480000-0000-0000-0000-0000000000a2';
select is((select unbind_reason from public.seal_bindings where device_id = (select id from outro)), 'cylinder_inactivated', 'inativar o cilindro encerra o vínculo');
select is(pg_temp.call('deactivate_device', format(', %L, %L', (select id from dev), 'x'))->>'code', 'JUSTIFICATION_REQUIRED', 'desativar exige justificativa');
select is(pg_temp.call('deactivate_device', format(', %L, %L', (select id from dev), 'Lacre danificado.'))->>'code', 'INACTIVATED', 'desativa');
select is((select status from public.seal_devices where id = (select id from dev)), 'inactive', 'o dispositivo fica inativo');
select ok((select bool_and(metadata::text not like '%Troca%' and metadata::text not like '%danificado%' and metadata::text not like '%exposta%')
  from public.audit_logs where action like 'seal.%'), 'nenhuma justificativa em texto aberto na auditoria');

select * from finish();
rollback;
