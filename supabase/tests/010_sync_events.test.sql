begin;
select plan(36);

-- Spec 010, T014 (RED): a trilha de sincronização das operações de campo vindas da fila (RF-012, RF-023, CA-002, CA-003). O registro é
-- imutável, não guarda dado sensível, é idempotente por (organização, pedido, resultado) e só aparece a quem tem `trip.history` na
-- organização da viagem. Dois tenants: o Tenant B nunca grava nem lê a trilha do Tenant A. Hermético: desfeito pelo rollback.

delete from public.user_sessions where user_id in (
  '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000003');
insert into public.membership_roles (membership_id, role_id, assigned_by)
  select '30000000-0000-0000-0000-00000000000b', r.id, '10000000-0000-0000-0000-000000000001'
    from public.roles r where r.organization_id = '20000000-0000-0000-0000-00000000000b' and r.code = 'tenant_admin';
select public.start_user_session('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000001000a2', 'aal1');
select public.start_user_session('10000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-0000001000b3', 'aal1');

insert into public.customers (id, organization_id, person_type, document_display, legal_name, segment) values
  ('91000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', 'legal', '11222333000181', 'Hospital Alfa Ltda', 'hospital');
insert into public.customer_sites (id, organization_id, customer_id, name, postal_code, street, number, city, state) values
  ('92000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', '91000000-0000-0000-0000-00000000000a', 'Unidade A', '01001000', 'Praça da Sé', '1', 'São Paulo', 'SP');
insert into public.vehicles (id, organization_id, plate, vehicle_type, capacity_cylinders) values
  ('95000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', 'AAA1111', 'truck', 10);
insert into public.drivers (id, organization_id, full_name, cpf_display, cnh_display, cnh_category, cnh_valid_until) values
  ('96000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', 'Motorista A', 'x', 'x', 'D', (now() at time zone 'America/Sao_Paulo')::date + 365);
insert into public.cylinder_types (id, organization_id, gas, capacity_value, capacity_unit, classification) values
  ('97000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', 'Oxigênio', 10, 'l', 'medicinal');
insert into public.cylinders (id, organization_id, cylinder_type_id, serial_number, stock_status, hydro_last_result, hydro_next_due_on) values
  ('98000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-00000000000a', '97000000-0000-0000-0000-00000000000a', 'SYN-001', 'in_stock', 'approved', (now() at time zone 'America/Sao_Paulo')::date + 200);

create temp table made as select public.create_trip('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000001000a2', '20000000-0000-0000-0000-00000000000a', gen_random_uuid(),
  (now() at time zone 'America/Sao_Paulo')::date, '95000000-0000-0000-0000-00000000000a', '96000000-0000-0000-0000-00000000000a', null,
  jsonb_build_array(jsonb_build_object('site_id', '92000000-0000-0000-0000-00000000000a', 'cylinder_ids', jsonb_build_array('98000000-0000-0000-0000-000000000001')))) as r;
create temp table ids as select (r ->> 'trip_id')::uuid as trip, gen_random_uuid() as req1, gen_random_uuid() as req2, gen_random_uuid() as req3 from made;

create function pg_temp.rec(p_actor uuid, p_session uuid, p_org uuid, p_req uuid, p_op text, p_trip uuid, p_outcome text, p_reason text, p_justification text default null)
returns jsonb language sql as $$
  select public.record_trip_sync_event(p_actor, p_session, p_org, p_req, p_op, p_trip, p_outcome, p_reason, timestamptz '2026-10-12 12:00:00+00', p_justification)
$$;

-- Gravação.
select is(pg_temp.rec('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000001000a2', '20000000-0000-0000-0000-00000000000a',
  (select req1 from ids), 'check_item', (select trip from ids), 'applied', null) ->> 'code', 'RECORDED', 'registra o resultado "applied"');
select is((select count(*)::int from private.trip_sync_events), 1, 'uma linha gravada');
select is((select received_at is not null and queued_at = timestamptz '2026-10-12 12:00:00+00' from private.trip_sync_events), true, 'guarda a hora do aparelho e a de recebimento');
select is((select operation from private.trip_sync_events), 'check_item', 'guarda a operação');
select is((select actor_id from private.trip_sync_events), '10000000-0000-0000-0000-000000000002'::uuid, 'guarda o ator');

-- Idempotência por (organização, pedido, resultado).
select is(pg_temp.rec('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000001000a2', '20000000-0000-0000-0000-00000000000a',
  (select req1 from ids), 'check_item', (select trip from ids), 'applied', null) ->> 'code', 'RECORDED', 'repetir o mesmo pedido e resultado responde igual');
select is((select count(*)::int from private.trip_sync_events), 1, 'a repetição não duplica a linha');
select is(pg_temp.rec('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000001000a2', '20000000-0000-0000-0000-00000000000a',
  (select req1 from ids), 'check_item', (select trip from ids), 'replayed', null) ->> 'code', 'RECORDED', 'o mesmo pedido com outro resultado entra');
select is((select count(*)::int from private.trip_sync_events), 2, 'agora são duas linhas (applied e replayed)');

-- Um "replayed" sem "applied" anterior entra como "applied" (a trilha nunca perde o resultado que aplicou a operação).
create temp table lost as select gen_random_uuid() as req;
select is(pg_temp.rec('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000001000a2', '20000000-0000-0000-0000-00000000000a',
  (select req from lost), 'uncheck_item', (select trip from ids), 'replayed', null) ->> 'code', 'RECORDED', 'replayed sem applied anterior é aceito');
select is((select outcome from private.trip_sync_events where request_id = (select req from lost)), 'applied', 'e entra como "applied"');
select is((select count(*)::int from private.trip_sync_events where request_id = (select req from lost)), 1, 'uma só linha para esse pedido');

-- Resultado de conflito com motivo sanitizado e decisão com justificativa.
select is(pg_temp.rec('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000001000a2', '20000000-0000-0000-0000-00000000000a',
  (select req2 from ids), 'arrive_stop', (select trip from ids), 'conflict', 'TRIP_CANCELLED') ->> 'code', 'RECORDED', 'registra conflito com o código do motivo');
select is(pg_temp.rec('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000001000a2', '20000000-0000-0000-0000-00000000000a',
  (select req3 from ids), 'resolve_conflict', (select trip from ids), 'discarded', 'TRIP_CANCELLED', 'Viagem cancelada pelo gestor') ->> 'code', 'RECORDED', 'registra o descarte com a justificativa');
select is((select justification from private.trip_sync_events where outcome = 'discarded'), 'Viagem cancelada pelo gestor', 'a justificativa só aparece em "discarded"');
select is((select count(*)::int from private.trip_sync_events where justification is not null), 1, 'nenhuma outra linha traz justificativa');

-- Validações.
select is(pg_temp.rec('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000001000a2', '20000000-0000-0000-0000-00000000000a',
  gen_random_uuid(), 'check_item', (select trip from ids), 'inventado', null) ->> 'code', 'VALIDATION_FAILED', 'resultado fora da lista é recusado');
select is(pg_temp.rec('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000001000a2', '20000000-0000-0000-0000-00000000000a',
  gen_random_uuid(), 'cancel_trip', (select trip from ids), 'applied', null) ->> 'code', 'VALIDATION_FAILED', 'operação que não é da fila é recusada');
select is(pg_temp.rec('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000001000a2', '20000000-0000-0000-0000-00000000000a',
  gen_random_uuid(), 'check_item', (select trip from ids), 'conflict', 'texto livre com coordenada -23.55') ->> 'code', 'VALIDATION_FAILED', 'o motivo só aceita código em maiúsculas (nenhum dado sensível)');
select is(pg_temp.rec('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000001000a2', '20000000-0000-0000-0000-00000000000a',
  gen_random_uuid(), 'check_item', (select trip from ids), 'applied', null, 'justificativa fora de lugar') ->> 'code', 'VALIDATION_FAILED', 'justificativa só vale em "discarded"');
select is(pg_temp.rec('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000001000a2', '20000000-0000-0000-0000-00000000000a',
  gen_random_uuid(), 'resolve_conflict', (select trip from ids), 'discarded', 'TRIP_CANCELLED', 'abc') ->> 'code', 'VALIDATION_FAILED', 'o descarte exige justificativa de 5 a 500 caracteres');

-- Dois tenants.
select is(pg_temp.rec('10000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-0000001000b3', '20000000-0000-0000-0000-00000000000b',
  gen_random_uuid(), 'check_item', (select trip from ids), 'applied', null) ->> 'code', 'NOT_FOUND', 'o Tenant B não registra evento para a viagem do Tenant A (organização diferente da viagem)');
select is(pg_temp.rec('10000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-0000001000b3', '20000000-0000-0000-0000-00000000000a',
  gen_random_uuid(), 'check_item', (select trip from ids), 'applied', null) ->> 'code', 'ACCESS_DENIED', 'o Tenant B não age na organização A');
select is(pg_temp.rec('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000001000ff', '20000000-0000-0000-0000-00000000000a',
  gen_random_uuid(), 'check_item', (select trip from ids), 'applied', null) ->> 'code', 'AUTH_REQUIRED', 'sem sessão ativa, nada é registrado');
select is((select count(*)::int from private.trip_sync_events), 5, 'nenhuma linha extra depois das recusas');

-- Leitura.
select is(public.query_sync_events('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000001000a2', '20000000-0000-0000-0000-00000000000a', (select trip from ids), 50, null) ->> 'code', 'OK',
  'quem tem trip.history lê a trilha');
select is(jsonb_array_length(public.query_sync_events('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000001000a2', '20000000-0000-0000-0000-00000000000a', (select trip from ids), 50, null) -> 'items'), 5,
  'a trilha traz as cinco linhas');
select is(public.query_sync_events('10000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-0000001000b3', '20000000-0000-0000-0000-00000000000b', (select trip from ids), 50, null) ->> 'code', 'NOT_FOUND',
  'o Tenant B não lê a trilha da viagem do Tenant A');
select is(public.query_sync_events('10000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-0000001000b3', '20000000-0000-0000-0000-00000000000a', (select trip from ids), 50, null) ->> 'code', 'ACCESS_DENIED',
  'o Tenant B não age na organização A para ler');

-- Imutabilidade.
select throws_ok($$update private.trip_sync_events set outcome = 'applied' where outcome = 'conflict'$$, 'P0001', 'trip_record_immutable', 'a trilha é imutável (update)');
select throws_ok($$delete from private.trip_sync_events$$, 'P0001', 'trip_record_immutable', 'a trilha é imutável (delete)');

-- Sem dado sensível por construção, grants e assinaturas.
select is((select count(*)::int from information_schema.columns where table_schema = 'private' and table_name = 'trip_sync_events'
  and column_name ~* '(latitude|longitude|recipient|name|path|value|signature|photo)'), 0, 'a tabela não tem coluna de posição, recebedor, caminho, valor lido, foto nem assinatura');
select is(has_table_privilege('authenticated', 'private.trip_sync_events', 'select'), false, 'o cliente não lê a tabela diretamente');
select is(has_function_privilege('authenticated', 'public.record_trip_sync_event(uuid, uuid, uuid, uuid, text, uuid, text, text, timestamptz, text)', 'execute'), false, 'record_trip_sync_event não é do cliente');
select is(has_function_privilege('service_role', 'public.record_trip_sync_event(uuid, uuid, uuid, uuid, text, uuid, text, text, timestamptz, text)', 'execute')
  and has_function_privilege('service_role', 'public.query_sync_events(uuid, uuid, uuid, uuid, integer, bigint)', 'execute'), true, 'só a service_role executa as duas funções');
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname in ('record_trip_sync_event', 'query_sync_events')), 2, 'uma só assinatura de cada função');

select * from finish();
rollback;
