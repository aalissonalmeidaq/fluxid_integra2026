begin;
select plan(40);

-- Spec 015 (T035, sessão e ingestão; RF-007a a RF-007h, RF-036, CS-014): só o motorista vinculado à viagem em andamento abre a sessão e
-- envia posições; lotes de 1 a 100, idempotentes pela chave do cliente, com o horário original preservado; posição atrasada é
-- retrospectiva; posição observada depois do fim é recusada; concluir a viagem encerra a sessão. Dois tenants. Hermético: rollback.

delete from public.user_sessions where user_id in ('10000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000003',
  '10000000-0000-0000-0000-000000000004');
insert into public.membership_roles (membership_id, role_id, assigned_by)
  select '30000000-0000-0000-0000-00000000000b', r.id, '10000000-0000-0000-0000-000000000001'
    from public.roles r where r.organization_id = '20000000-0000-0000-0000-00000000000b' and r.code = 'tenant_admin'
  on conflict do nothing;
select public.start_user_session('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000001520a2', 'aal1');
select public.start_user_session('10000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-0000001520b3', 'aal1');
-- O usuário 4 é o motorista da viagem do Tenant A.
select public.start_user_session('10000000-0000-0000-0000-000000000004', '60000000-0000-0000-0000-0000001520a4', 'aal1');

insert into public.vehicles (id, organization_id, plate, vehicle_type, capacity_cylinders) values
  ('c1520000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-00000000000a', 'ING1A11', 'truck', 5),
  ('c1520000-0000-0000-0000-0000000000a2', '20000000-0000-0000-0000-00000000000a', 'ING1A22', 'truck', 5),
  ('c1520000-0000-0000-0000-0000000000b1', '20000000-0000-0000-0000-00000000000b', 'ING1B11', 'truck', 5);
insert into public.drivers (id, organization_id, full_name, cpf_display, cnh_display, cnh_category, cnh_valid_until, linked_user_id) values
  ('c1530000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-00000000000a', 'Motorista Quatro', 'x', 'x', 'D',
   (now() at time zone 'America/Sao_Paulo')::date + 365, '10000000-0000-0000-0000-000000000004'),
  ('c1530000-0000-0000-0000-0000000000b1', '20000000-0000-0000-0000-00000000000b', 'Motorista B', 'x', 'x', 'D',
   (now() at time zone 'America/Sao_Paulo')::date + 365, '10000000-0000-0000-0000-000000000003');
insert into public.trips (id, organization_id, number, planned_date, vehicle_id, driver_id, status, started_at, started_by, created_by) values
  ('c1560000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-00000000000a', 9171, (now() at time zone 'America/Sao_Paulo')::date,
   'c1520000-0000-0000-0000-0000000000a1', 'c1530000-0000-0000-0000-0000000000a1', 'in_progress', now() - interval '1 hour',
   '10000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002'),
  ('c1560000-0000-0000-0000-0000000000b1', '20000000-0000-0000-0000-00000000000b', 9172, (now() at time zone 'America/Sao_Paulo')::date,
   'c1520000-0000-0000-0000-0000000000b1', 'c1530000-0000-0000-0000-0000000000b1', 'in_progress', now() - interval '1 hour',
   '10000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000003');
insert into public.trips (id, organization_id, number, planned_date, vehicle_id, driver_id, status, created_by) values
  ('c1560000-0000-0000-0000-0000000000a2', '20000000-0000-0000-0000-00000000000a', 9173, (now() at time zone 'America/Sao_Paulo')::date,
   'c1520000-0000-0000-0000-0000000000a2', 'c1530000-0000-0000-0000-0000000000a1', 'planned', '10000000-0000-0000-0000-000000000002');

create function pg_temp.start(p_user text, p_session text, p_org text, p_trip uuid, p_installation uuid, p_request uuid) returns jsonb language sql as $$
  select public.start_tracking_session(('10000000-0000-0000-0000-00000000000' || p_user)::uuid, ('60000000-0000-0000-0000-0000001520' || p_session)::uuid,
    ('20000000-0000-0000-0000-00000000000' || p_org)::uuid, p_request, p_trip, p_installation, 'android_native', 'full', false)
$$;
create function pg_temp.ingest(p_user text, p_session text, p_org text, p_tracking uuid, p_installation uuid, p_positions jsonb) returns jsonb language sql as $$
  select public.ingest_driver_positions(('10000000-0000-0000-0000-00000000000' || p_user)::uuid, ('60000000-0000-0000-0000-0000001520' || p_session)::uuid,
    ('20000000-0000-0000-0000-00000000000' || p_org)::uuid, gen_random_uuid(), p_tracking, p_installation, p_positions)
$$;
create function pg_temp.pos(p_id text, p_seq integer, p_seconds_ago integer, p_lat numeric default -7.23, p_accuracy numeric default 12) returns jsonb language sql as $$
  select jsonb_build_object('client_position_id', p_id, 'sequence_no', p_seq, 'observed_at', now() - make_interval(secs => p_seconds_ago),
    'latitude', p_lat, 'longitude', -39.31, 'accuracy_m', p_accuracy)
$$;

-- 1. Fronteira.
select ok(not has_function_privilege('authenticated', 'public.ingest_driver_positions(uuid, uuid, uuid, uuid, uuid, uuid, jsonb)', 'execute'),
  'authenticated não envia posições direto');
select ok(has_function_privilege('service_role', 'public.start_tracking_session(uuid, uuid, uuid, uuid, uuid, uuid, text, text, boolean)', 'execute'),
  'service_role abre sessão');

-- 1b. Situação do motorista na viagem, sem exigir tracking.read e sem auditar negação.
select is(public.get_driver_tracking_status('10000000-0000-0000-0000-000000000004', '60000000-0000-0000-0000-0000001520a4',
  '20000000-0000-0000-0000-00000000000a', 'c1560000-0000-0000-0000-0000000000a1')->>'is_driver', 'true', 'o motorista da viagem é reconhecido');
select is(public.get_driver_tracking_status('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000001520a2',
  '20000000-0000-0000-0000-00000000000a', 'c1560000-0000-0000-0000-0000000000a1')->>'is_driver', 'false', 'outra pessoa não é a motorista');
select is(public.get_driver_tracking_status('10000000-0000-0000-0000-000000000004', '60000000-0000-0000-0000-0000001520a4',
  '20000000-0000-0000-0000-00000000000a', 'c1560000-0000-0000-0000-0000000000b1')->>'code', 'NOT_FOUND', 'viagem de outro tenant: inexistente');

-- 2. Abrir a sessão: só o motorista da viagem em andamento.
select is(pg_temp.start('2', 'a2', 'a', 'c1560000-0000-0000-0000-0000000000a1', 'c15b0000-0000-0000-0000-0000000000a1', gen_random_uuid())->>'code',
  'ACCESS_DENIED', 'quem não é o motorista da viagem não abre sessão');
select is(pg_temp.start('4', 'a4', 'a', 'c1560000-0000-0000-0000-0000000000b1', 'c15b0000-0000-0000-0000-0000000000a1', gen_random_uuid())->>'code',
  'NOT_FOUND', 'viagem de outro tenant: inexistente');
select is(pg_temp.start('4', 'a4', 'a', 'c1560000-0000-0000-0000-0000000000a2', 'c15b0000-0000-0000-0000-0000000000a1', gen_random_uuid())->>'code',
  'TRIP_STATE_INVALID', 'viagem que não está em andamento não abre sessão');
create temporary table s1 as select pg_temp.start('4', 'a4', 'a', 'c1560000-0000-0000-0000-0000000000a1', 'c15b0000-0000-0000-0000-0000000000a1',
  'c15c0000-0000-0000-0000-000000000001') as r;
select is((select r->>'code' from s1), 'STARTED', 'o motorista abre a sessão');
select ok((select abs(extract(epoch from ((r->'session'->>'collect_until')::timestamptz - now())) - 8 * 3600) < 5 from s1), 'coleta até 8 h depois');
select is((select (r->'session'->>'interval_s')::int from s1), 60, 'intervalo preferencial de 60 s');
select is((select (r->'rule'->>'distance_m')::numeric from s1), 100::numeric, 'a sessão devolve a regra vigente');
select is(pg_temp.start('4', 'a4', 'a', 'c1560000-0000-0000-0000-0000000000a1', 'c15b0000-0000-0000-0000-0000000000a1',
  'c15c0000-0000-0000-0000-000000000001')->'session'->>'id', (select r->'session'->>'id' from s1), 'repetir o pedido devolve a mesma sessão');
select is((select count(*)::int from public.audit_logs where action = 'tracking.session_start' and target_id = (select r->'session'->>'id' from s1)),
  1, 'abertura auditada uma vez');
create temporary table sid as select (r->'session'->>'id')::uuid as id from s1;

select is(public.get_driver_tracking_status('10000000-0000-0000-0000-000000000004', '60000000-0000-0000-0000-0000001520a4',
  '20000000-0000-0000-0000-00000000000a', 'c1560000-0000-0000-0000-0000000000a1')->'session'->>'id', (select r->'session'->>'id' from s1),
  'a situação traz a sessão ativa do motorista');

-- 3. Capacidade reduzida informada pelo aparelho.
select is(public.report_tracking_capability('10000000-0000-0000-0000-000000000004', '60000000-0000-0000-0000-0000001520a4',
  '20000000-0000-0000-0000-00000000000a', gen_random_uuid(), (select id from sid), 'foreground_only', true)->>'code', 'UPDATED', 'capacidade atualizada');
select is((select capability || ':' || notifications_denied from public.tracking_sessions where id = (select id from sid)), 'foreground_only:true',
  'capacidade e notificação recusada gravadas');

-- 3b. Sem confirmação online há mais de 8 horas, o acompanhamento mostra a coleta pausada (RF-007g).
update public.tracking_sessions set last_online_confirmed_at = now() - interval '9 hours' where id = (select id from sid);
select is((select r->'trip'->'session'->>'status' from (select public.get_trip_tracking('10000000-0000-0000-0000-000000000002',
  '60000000-0000-0000-0000-0000001520a2', '20000000-0000-0000-0000-00000000000a', 'c1560000-0000-0000-0000-0000000000a1') as r) x),
  'paused_auth_expired', 'coleta pausada aparece para o gestor');

-- 4. Ingestão idempotente e ordenada.
create temporary table b1 as select pg_temp.ingest('4', 'a4', 'a', (select id from sid), 'c15b0000-0000-0000-0000-0000000000a1',
  jsonb_build_array(pg_temp.pos('c15d0000-0000-0000-0000-000000000001', 1, 70), pg_temp.pos('c15d0000-0000-0000-0000-000000000002', 2, 10))) as r;
select is((select r->>'code' from b1), 'INGESTED', 'lote aceito');
select is((select jsonb_agg(x->>'status') from b1, jsonb_array_elements(r->'results') x), '["stored", "stored"]'::jsonb, 'um resultado por item, na ordem');
select is((select jsonb_agg(x->>'status') from jsonb_array_elements(pg_temp.ingest('4', 'a4', 'a', (select id from sid), 'c15b0000-0000-0000-0000-0000000000a1',
  jsonb_build_array(pg_temp.pos('c15d0000-0000-0000-0000-000000000001', 1, 70), pg_temp.pos('c15d0000-0000-0000-0000-000000000002', 2, 10)))->'results') x),
  '["duplicate", "duplicate"]'::jsonb, 'repetir o lote não duplica');
select is((select count(*)::int from public.mobile_positions where tracking_session_id = (select id from sid)), 2, 'só duas posições gravadas');
select ok((select abs(extract(epoch from (observed_at - (now() - interval '70 seconds')))) < 2 from public.mobile_positions
  where client_position_id = 'c15d0000-0000-0000-0000-000000000001'), 'o horário original é preservado');
select ok((select last_online_confirmed_at >= now() - interval '5 seconds' from public.tracking_sessions where id = (select id from sid)),
  'a ingestão confirma a conexão online');

-- 5. Retrospectiva, futuro, coordenada inválida e limites do lote.
select is((select (x->>'retrospective')::boolean from jsonb_array_elements(pg_temp.ingest('4', 'a4', 'a', (select id from sid), 'c15b0000-0000-0000-0000-0000000000a1',
  jsonb_build_array(pg_temp.pos('c15d0000-0000-0000-0000-000000000003', 3, 600)))->'results') x), true, 'posição recebida 10 min depois é retrospectiva');
select is((select sync_kind from public.mobile_positions where client_position_id = 'c15d0000-0000-0000-0000-000000000003'), 'retrospective', 'gravada como retrospectiva');
select is((select x->>'code' from jsonb_array_elements(pg_temp.ingest('4', 'a4', 'a', (select id from sid), 'c15b0000-0000-0000-0000-0000000000a1',
  jsonb_build_array(pg_temp.pos('c15d0000-0000-0000-0000-000000000004', 4, -600)))->'results') x), 'POSITION_TOO_FUTURE', 'posição no futuro recusada');
select is((select x->>'status' from jsonb_array_elements(pg_temp.ingest('4', 'a4', 'a', (select id from sid), 'c15b0000-0000-0000-0000-0000000000a1',
  jsonb_build_array(pg_temp.pos('c15d0000-0000-0000-0000-000000000005', 5, 5, 95)))->'results') x), 'rejected', 'latitude inválida recusada');
select is(pg_temp.ingest('4', 'a4', 'a', (select id from sid), 'c15b0000-0000-0000-0000-0000000000a1',
  (select jsonb_agg(pg_temp.pos(gen_random_uuid()::text, 100 + g, 5)) from generate_series(1, 101) g))->>'code', 'BATCH_TOO_LARGE', 'mais de 100 itens: recusado');
select is(pg_temp.ingest('4', 'a4', 'a', (select id from sid), 'c15b0000-0000-0000-0000-0000000000a1', '[]'::jsonb)->>'code', 'VALIDATION_FAILED', 'lote vazio recusado');

-- 6. Contexto: outra instalação, outra pessoa, outro tenant.
select is(pg_temp.ingest('4', 'a4', 'a', (select id from sid), 'c15b0000-0000-0000-0000-0000000000ff',
  jsonb_build_array(pg_temp.pos('c15d0000-0000-0000-0000-000000000006', 6, 5)))->>'code', 'CONTEXT_MISMATCH', 'outra instalação não usa a sessão');
select is(pg_temp.ingest('2', 'a2', 'a', (select id from sid), 'c15b0000-0000-0000-0000-0000000000a1',
  jsonb_build_array(pg_temp.pos('c15d0000-0000-0000-0000-000000000007', 7, 5)))->>'code', 'ACCESS_DENIED', 'outra pessoa não envia pela sessão do motorista');
select is(pg_temp.ingest('3', 'b3', 'b', (select id from sid), 'c15b0000-0000-0000-0000-0000000000a1',
  jsonb_build_array(pg_temp.pos('c15d0000-0000-0000-0000-000000000008', 8, 5)))->>'code', 'NOT_FOUND', 'sessão do A pelo B: inexistente');

-- 7. Fim da sessão: posição observada depois é recusada; antes, entra como retrospectiva.
select is(public.end_tracking_session('10000000-0000-0000-0000-000000000004', '60000000-0000-0000-0000-0000001520a4',
  '20000000-0000-0000-0000-00000000000a', 'c15c0000-0000-0000-0000-0000000000e1', (select id from sid), 'completed')->>'code', 'ENDED', 'motorista encerra a sessão');
select is(public.end_tracking_session('10000000-0000-0000-0000-000000000004', '60000000-0000-0000-0000-0000001520a4',
  '20000000-0000-0000-0000-00000000000a', 'c15c0000-0000-0000-0000-0000000000e1', (select id from sid), 'completed')->>'code', 'ENDED', 'encerrar de novo é idempotente');
update public.tracking_sessions set ended_at = now() - interval '2 minutes' where id = (select id from sid);
select is((select x->>'code' from jsonb_array_elements(pg_temp.ingest('4', 'a4', 'a', (select id from sid), 'c15b0000-0000-0000-0000-0000000000a1',
  jsonb_build_array(pg_temp.pos('c15d0000-0000-0000-0000-000000000009', 9, 30)))->'results') x), 'SESSION_ENDED', 'observada depois do fim: recusada');
select is((select x->>'status' from jsonb_array_elements(pg_temp.ingest('4', 'a4', 'a', (select id from sid), 'c15b0000-0000-0000-0000-0000000000a1',
  jsonb_build_array(pg_temp.pos('c15d0000-0000-0000-0000-00000000000a', 10, 300)))->'results') x), 'stored', 'observada antes do fim: aceita');

-- 8. Concluir a viagem encerra as sessões ativas, sem apagar nada.
select is(pg_temp.start('4', 'a4', 'a', 'c1560000-0000-0000-0000-0000000000a1', 'c15b0000-0000-0000-0000-0000000000a2', gen_random_uuid())->>'code',
  'STARTED', 'outra instalação abre nova sessão');
update public.trips set status = 'completed', completed_at = now(), completed_by = '10000000-0000-0000-0000-000000000002'
 where id = 'c1560000-0000-0000-0000-0000000000a1';
select is((select count(*)::int from public.tracking_sessions where trip_id = 'c1560000-0000-0000-0000-0000000000a1' and status = 'active'), 0,
  'concluir a viagem encerra as sessões');
select is((select count(*)::int from public.mobile_positions where trip_id = 'c1560000-0000-0000-0000-0000000000a1'), 4, 'as posições ficam');

select * from finish();
rollback;
