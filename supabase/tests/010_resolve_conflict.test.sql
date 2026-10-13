begin;
select plan(36);

-- Spec 010, T032 (RED): `resolve_sync_conflict` registra a decisão sobre uma operação de campo recusada pelo servidor (RF-013, CA-002, CA-003): descartar
-- (justificativa de 5 a 500 caracteres) ou reenviar (a operação segue pela fila com o mesmo pedido). Exige trip.operate, é idempotente por request_id, grava a
-- trilha, o evento da viagem e a auditoria sem justificativa em texto aberto, e o Tenant B nunca decide nada do Tenant A. Hermético: desfeito pelo rollback.

delete from public.user_sessions where user_id in (
  '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000003');
insert into public.membership_roles (membership_id, role_id, assigned_by)
  select '30000000-0000-0000-0000-00000000000b', r.id, '10000000-0000-0000-0000-000000000001' from public.roles r where r.organization_id = '20000000-0000-0000-0000-00000000000b' and r.code = 'tenant_admin'
  on conflict do nothing;
select public.start_user_session('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000001003a2', 'aal1');
select public.start_user_session('10000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-0000001003b3', 'aal1');

insert into auth.users (id, aud, role, email) values ('10000000-0000-0000-0000-0000001003d1', 'authenticated', 'authenticated', 'res-auditor@example.invalid');
insert into public.profiles (user_id, display_name) values ('10000000-0000-0000-0000-0000001003d1', 'Auditor Conflito');
insert into public.memberships (id, organization_id, user_id, status, activated_at) values
  ('30000000-0000-0000-0000-0000001003d1', '20000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-0000001003d1', 'active', now());
insert into public.membership_roles (membership_id, role_id, assigned_by)
  select '30000000-0000-0000-0000-0000001003d1', r.id, '10000000-0000-0000-0000-000000000001' from public.roles r where r.organization_id = '20000000-0000-0000-0000-00000000000a' and r.code = 'tenant_auditor';
select public.start_user_session('10000000-0000-0000-0000-0000001003d1', '60000000-0000-0000-0000-0000001003d1', 'aal1');

insert into public.customers (id, organization_id, person_type, document_display, legal_name, segment) values
  ('91000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', 'legal', '11222333000181', 'Hospital Alfa Ltda', 'hospital');
insert into public.customer_sites (id, organization_id, customer_id, name, postal_code, street, number, city, state)
  select ('92000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid, '20000000-0000-0000-0000-00000000000a', '91000000-0000-0000-0000-00000000000a', 'Unidade ' || n, '01001000', 'Praça da Sé', n::text, 'São Paulo', 'SP' from generate_series(1, 2) n;
insert into public.vehicles (id, organization_id, plate, vehicle_type, capacity_cylinders)
  select ('95000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid, '20000000-0000-0000-0000-00000000000a', 'RES100' || n, 'truck', 20 from generate_series(1, 2) n;
insert into public.drivers (id, organization_id, full_name, cpf_display, cnh_display, cnh_category, cnh_valid_until)
  select ('96000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid, '20000000-0000-0000-0000-00000000000a', 'Motorista ' || n, 'x' || n, 'y' || n, 'D', (now() at time zone 'America/Sao_Paulo')::date + 365 from generate_series(1, 2) n;
insert into public.cylinder_types (id, organization_id, gas, capacity_value, capacity_unit, classification) values
  ('97000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', 'Oxigênio', 10, 'l', 'medicinal');
insert into public.cylinders (id, organization_id, cylinder_type_id, serial_number, stock_status, hydro_last_result, hydro_next_due_on)
  select ('98000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid, '20000000-0000-0000-0000-00000000000a', '97000000-0000-0000-0000-00000000000a', 'RES-' || lpad(n::text, 3, '0'), 'in_stock', 'approved', (now() at time zone 'America/Sao_Paulo')::date + 200
    from generate_series(1, 2) n;

create function pg_temp.plan(p_unit integer, p_cyl integer) returns uuid language plpgsql as $$
begin
  return (public.create_trip('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000001003a2', '20000000-0000-0000-0000-00000000000a', gen_random_uuid(),
    (now() at time zone 'America/Sao_Paulo')::date, ('95000000-0000-0000-0000-' || lpad(p_unit::text, 12, '0'))::uuid, ('96000000-0000-0000-0000-' || lpad(p_unit::text, 12, '0'))::uuid, null,
    jsonb_build_array(jsonb_build_object('site_id', '92000000-0000-0000-0000-000000000001', 'cylinder_ids', jsonb_build_array(('98000000-0000-0000-0000-' || lpad(p_cyl::text, 12, '0'))::uuid)))) ->> 'trip_id')::uuid;
end $$;
create temp table t as select pg_temp.plan(1, 1) as trip, pg_temp.plan(2, 2) as other;

-- Duas operações de campo recusadas (conflitos) na viagem 1 e uma na viagem 2.
create temp table src as select gen_random_uuid() as discard_req, gen_random_uuid() as resubmit_req, gen_random_uuid() as other_req, gen_random_uuid() as noconflict_req;
select public.record_trip_sync_event('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000001003a2', '20000000-0000-0000-0000-00000000000a', (select discard_req from src), 'arrive_stop', (select trip from t), 'conflict', 'TRIP_CLOSED', now());
select public.record_trip_sync_event('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000001003a2', '20000000-0000-0000-0000-00000000000a', (select resubmit_req from src), 'check_item', (select trip from t), 'conflict', 'INVALID_TRANSITION', now());
select public.record_trip_sync_event('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000001003a2', '20000000-0000-0000-0000-00000000000a', (select other_req from src), 'check_item', (select other from t), 'conflict', 'INVALID_TRANSITION', now());

create function pg_temp.resolve(p_req uuid, p_source uuid, p_decision text, p_justification text, p_trip uuid default null, p_user uuid default '10000000-0000-0000-0000-000000000002',
  p_session uuid default '60000000-0000-0000-0000-0000001003a2', p_org uuid default '20000000-0000-0000-0000-00000000000a') returns jsonb language sql as $$
  select public.resolve_sync_conflict(p_user, p_session, p_org, p_req, coalesce(p_trip, (select trip from t)), p_source, p_decision, p_justification)
$$;
create temp table dec as select gen_random_uuid() as d1, gen_random_uuid() as d2, gen_random_uuid() as d3, gen_random_uuid() as d4, gen_random_uuid() as d5;

-- Descartar.
select is(pg_temp.resolve((select d1 from dec), (select discard_req from src), 'discard', 'Viagem cancelada pelo gestor') ->> 'code', 'RESOLVED', 'descartar com justificativa resolve');
select is((select count(*)::int from private.trip_sync_events where outcome = 'discarded' and operation = 'resolve_conflict'), 1, 'uma linha "discarded" na trilha');
select is((select source_request_id from private.trip_sync_events where outcome = 'discarded'), (select discard_req from src), 'a trilha aponta o pedido original');
select is((select justification from private.trip_sync_events where outcome = 'discarded'), 'Viagem cancelada pelo gestor', 'a trilha guarda a justificativa do descarte');
select is((select count(*)::int from public.trip_events where trip_id = (select trip from t) and event_type = 'sync_conflict_discarded'), 1, 'evento da viagem registrado');
select is((select justification from public.trip_events where event_type = 'sync_conflict_discarded'), 'Viagem cancelada pelo gestor', 'o evento guarda a justificativa (histórico da viagem)');
select is((select count(*)::int from public.audit_logs where action = 'trip.sync_conflict_resolve'), 1, 'auditoria registrada');
select is((select position('cancelada' in metadata::text) from public.audit_logs where action = 'trip.sync_conflict_resolve'), 0, 'a auditoria não guarda a justificativa em texto aberto');
select is((select metadata ->> 'decision' from public.audit_logs where action = 'trip.sync_conflict_resolve'), 'discard', 'a auditoria guarda a decisão');

-- Idempotência.
select is((pg_temp.resolve((select d1 from dec), (select discard_req from src), 'discard', 'Viagem cancelada pelo gestor') ->> 'replayed')::boolean, true, 'o mesmo pedido devolve o resultado gravado');
select is((select count(*)::int from public.trip_events where event_type = 'sync_conflict_discarded'), 1, 'a repetição não duplica o evento');
select is((select count(*)::int from public.audit_logs where action = 'trip.sync_conflict_resolve'), 1, 'a repetição não duplica a auditoria');
select is((select count(*)::int from private.trip_sync_events where outcome = 'discarded'), 1, 'a repetição não duplica a trilha');

-- Já descartado: nenhuma outra decisão vale.
select is(pg_temp.resolve((select d2 from dec), (select discard_req from src), 'discard', 'Outra tentativa de descarte') ->> 'code', 'ALREADY_RESOLVED', 'descartar duas vezes é recusado');
select is(pg_temp.resolve((select d3 from dec), (select discard_req from src), 'resubmit', null) ->> 'code', 'ALREADY_RESOLVED', 'reenviar um conflito já descartado é recusado');

-- Reenviar.
select is(pg_temp.resolve((select d4 from dec), (select resubmit_req from src), 'resubmit', null) ->> 'code', 'RESOLVED', 'reenviar resolve, sem justificativa');
select is((select count(*)::int from private.trip_sync_events where outcome = 'resubmitted' and source_request_id = (select resubmit_req from src)), 1, 'trilha "resubmitted"');
select is((select count(*)::int from public.trip_events where event_type = 'sync_conflict_resubmitted'), 1, 'evento da viagem "resubmitted"');
select is((select operation from private.trip_sync_events where outcome = 'resubmitted'), 'resolve_conflict', 'a operação registrada é a decisão');
select is(pg_temp.resolve(gen_random_uuid(), (select resubmit_req from src), 'resubmit', null) ->> 'code', 'RESOLVED', 'reenviar de novo (novo pedido) é permitido: a operação pode recusar outra vez');

-- Validações.
select is(pg_temp.resolve(gen_random_uuid(), (select other_req from src), 'discard', null, (select other from t)) ->> 'code', 'VALIDATION_FAILED', 'o descarte exige justificativa');
select is(pg_temp.resolve(gen_random_uuid(), (select other_req from src), 'discard', '   abc   ', (select other from t)) ->> 'code', 'VALIDATION_FAILED', 'justificativa de menos de 5 caracteres (depois de juntar os espaços)');
select is(pg_temp.resolve(gen_random_uuid(), (select other_req from src), 'discard', repeat('x', 501), (select other from t)) ->> 'code', 'VALIDATION_FAILED', 'justificativa de mais de 500 caracteres');
select is(pg_temp.resolve(gen_random_uuid(), (select other_req from src), 'resubmit', 'não cabe aqui', (select other from t)) ->> 'code', 'VALIDATION_FAILED', 'a justificativa só vale no descarte');
select is(pg_temp.resolve(gen_random_uuid(), (select other_req from src), 'apagar', null, (select other from t)) ->> 'code', 'VALIDATION_FAILED', 'decisão fora da lista');
select is(pg_temp.resolve(gen_random_uuid(), (select noconflict_req from src), 'discard', 'Sem conflito registrado', (select trip from t)) ->> 'code', 'NOT_FOUND', 'sem conflito registrado para esse pedido');
select is(pg_temp.resolve(gen_random_uuid(), (select other_req from src), 'discard', 'Conflito de outra viagem', (select trip from t)) ->> 'code', 'NOT_FOUND', 'o conflito é de outra viagem');
select is(pg_temp.resolve(gen_random_uuid(), (select other_req from src), 'discard', 'Viagem inexistente', gen_random_uuid()) ->> 'code', 'NOT_FOUND', 'viagem inexistente');

-- Permissões e tenants.
select is(pg_temp.resolve(gen_random_uuid(), (select other_req from src), 'discard', 'Sem permissão para decidir', (select other from t), '10000000-0000-0000-0000-0000001003d1', '60000000-0000-0000-0000-0000001003d1') ->> 'code', 'ACCESS_DENIED',
  'o auditor (só vê) não decide');
select is(pg_temp.resolve(gen_random_uuid(), (select other_req from src), 'discard', 'Sessão inexistente', (select other from t), '10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000001003ff') ->> 'code', 'AUTH_REQUIRED', 'sem sessão ativa');
select is(pg_temp.resolve(gen_random_uuid(), (select other_req from src), 'discard', 'Outro tenant tentando', (select other from t), '10000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-0000001003b3', '20000000-0000-0000-0000-00000000000b') ->> 'code', 'NOT_FOUND',
  'o Tenant B recebe "não encontrado" para a viagem do Tenant A');
select is(pg_temp.resolve(gen_random_uuid(), (select other_req from src), 'discard', 'Outro tenant na organização A', (select other from t), '10000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-0000001003b3') ->> 'code', 'ACCESS_DENIED',
  'o Tenant B não age na organização A');
select is((select count(*)::int from private.trip_sync_events where outcome = 'discarded'), 1, 'nenhuma decisão a mais depois de todas as recusas');

-- Grants e assinatura.
select is(has_function_privilege('authenticated', 'public.resolve_sync_conflict(uuid, uuid, uuid, uuid, uuid, uuid, text, text)', 'execute'), false, 'o cliente não executa direto');
select is(has_function_privilege('service_role', 'public.resolve_sync_conflict(uuid, uuid, uuid, uuid, uuid, uuid, text, text)', 'execute')
  and (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'resolve_sync_conflict') = 1, true, 'só a service_role executa e há uma só assinatura');
select is((select count(*)::int from pg_constraint where conname = 'trip_events_type_check' and pg_get_constraintdef(oid) like '%sync_conflict_discarded%' and pg_get_constraintdef(oid) like '%trip_cancelled%'), 1,
  'a restrição de tipos de evento tem os novos e os antigos');

select * from finish();
rollback;
