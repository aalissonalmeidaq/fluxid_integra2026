begin;
select plan(24);

-- Spec 015 (T035, parte do schema; RF-007d, RF-009, RF-036): regra de proximidade, sessões de coleta e posições móveis. RLS ligada sem
-- política nem privilégio para o cliente, chaves idempotentes, FKs compostas que impedem misturar tenants, viagens e sessões, e
-- posições append-only. A ingestão (T044) tem testes próprios. Hermético: rollback.

-- Fixtures: uma viagem em andamento no Tenant A e outra no Tenant B, cada uma com motorista vinculado a um usuário.
insert into public.vehicles (id, organization_id, plate, vehicle_type, capacity_cylinders) values
  ('a1550000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', 'TRK1A23', 'truck', 5),
  ('a1550000-0000-0000-0000-00000000000b', '20000000-0000-0000-0000-00000000000b', 'TRK1B23', 'truck', 5);
insert into public.drivers (id, organization_id, full_name, cpf_display, cnh_display, cnh_category, cnh_valid_until, linked_user_id) values
  ('a1560000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', 'Motorista A', 'x', 'x', 'D',
   (now() at time zone 'America/Sao_Paulo')::date + 365, '10000000-0000-0000-0000-000000000004'),
  ('a1560000-0000-0000-0000-00000000000b', '20000000-0000-0000-0000-00000000000b', 'Motorista B', 'x', 'x', 'D',
   (now() at time zone 'America/Sao_Paulo')::date + 365, '10000000-0000-0000-0000-000000000003');
insert into public.trips (id, organization_id, number, planned_date, vehicle_id, driver_id, status, started_at, started_by, created_by) values
  ('a1590000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', 9151, (now() at time zone 'America/Sao_Paulo')::date,
   'a1550000-0000-0000-0000-00000000000a', 'a1560000-0000-0000-0000-00000000000a', 'in_progress', now(), '10000000-0000-0000-0000-000000000002',
   '10000000-0000-0000-0000-000000000002'),
  ('a1590000-0000-0000-0000-00000000000b', '20000000-0000-0000-0000-00000000000b', 9152, (now() at time zone 'America/Sao_Paulo')::date,
   'a1550000-0000-0000-0000-00000000000b', 'a1560000-0000-0000-0000-00000000000b', 'in_progress', now(), '10000000-0000-0000-0000-000000000003',
   '10000000-0000-0000-0000-000000000003');

-- 1. As três tabelas: RLS ligada, nenhuma política, nenhum privilégio para o cliente.
select is((select count(*)::int from pg_class where relrowsecurity and oid in (to_regclass('public.proximity_rules'),
  to_regclass('public.tracking_sessions'), to_regclass('public.mobile_positions'))), 3, 'RLS ligada nas três tabelas');
select is((select count(*)::int from pg_policies where schemaname = 'public' and tablename in ('proximity_rules', 'tracking_sessions', 'mobile_positions')),
  0, 'nenhuma política: o acesso é só por RPC');
select ok(not has_table_privilege('authenticated', 'public.mobile_positions', 'select'), 'authenticated não lê posições móveis');
select ok(not has_table_privilege('authenticated', 'public.tracking_sessions', 'insert'), 'authenticated não cria sessão');
select ok(not has_table_privilege('anon', 'public.proximity_rules', 'select'), 'anon não lê a regra');

-- 2. Regra: faixas e uma única versão aberta por empresa.
insert into public.proximity_rules (organization_id, version, distance_threshold_m, max_age_seconds, max_accuracy_m) values
  ('20000000-0000-0000-0000-00000000000a', 1, 100, 120, 50);
select throws_ok($$insert into public.proximity_rules (organization_id, version, distance_threshold_m, max_age_seconds, max_accuracy_m)
  values ('20000000-0000-0000-0000-00000000000b', 1, 49, 120, 50)$$, '23514', null, 'distância abaixo de 50 m recusada');
select throws_ok($$insert into public.proximity_rules (organization_id, version, distance_threshold_m, max_age_seconds, max_accuracy_m)
  values ('20000000-0000-0000-0000-00000000000b', 1, 100, 301, 50)$$, '23514', null, 'idade acima de 300 s recusada');
select throws_ok($$insert into public.proximity_rules (organization_id, version, distance_threshold_m, max_age_seconds, max_accuracy_m)
  values ('20000000-0000-0000-0000-00000000000b', 1, 100, 120, 101)$$, '23514', null, 'precisão acima de 100 m recusada');
select throws_ok($$insert into public.proximity_rules (organization_id, version, distance_threshold_m, max_age_seconds, max_accuracy_m)
  values ('20000000-0000-0000-0000-00000000000a', 2, 200, 120, 50)$$, '23505', null, 'só uma versão aberta por empresa');
select is((private.tracking_rule('20000000-0000-0000-0000-00000000000b')->>'distance_m')::numeric, 100::numeric,
  'empresa sem regra gravada usa o padrão de 100 m');
select is(private.tracking_rule('20000000-0000-0000-0000-00000000000b')->>'version', '0', 'o padrão tem versão 0');

-- 3. Sessões: uma ativa por viagem e instalação, viagem do mesmo tenant.
insert into public.tracking_sessions (id, organization_id, trip_id, driver_user_id, device_installation_id, platform, capability, request_id) values
  ('a15a0000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', 'a1590000-0000-0000-0000-00000000000a',
   '10000000-0000-0000-0000-000000000004', 'a15b0000-0000-0000-0000-00000000000a', 'android_native', 'full', gen_random_uuid());
select throws_ok($$insert into public.tracking_sessions (organization_id, trip_id, driver_user_id, device_installation_id, platform, capability, request_id)
  values ('20000000-0000-0000-0000-00000000000a', 'a1590000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-000000000004',
  'a15b0000-0000-0000-0000-00000000000a', 'web_visible', 'foreground_only', gen_random_uuid())$$, '23505', null,
  'uma sessão ativa por viagem e instalação');
select throws_ok($$insert into public.tracking_sessions (organization_id, trip_id, driver_user_id, device_installation_id, platform, capability, request_id)
  values ('20000000-0000-0000-0000-00000000000a', 'a1590000-0000-0000-0000-00000000000b', '10000000-0000-0000-0000-000000000004',
  gen_random_uuid(), 'web_visible', 'full', gen_random_uuid())$$, '23503', null, 'sessão não aponta para viagem de outro tenant');
select throws_ok($$insert into public.tracking_sessions (organization_id, trip_id, driver_user_id, device_installation_id, platform, capability, request_id)
  values ('20000000-0000-0000-0000-00000000000a', 'a1590000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-000000000004',
  gen_random_uuid(), 'ios_native', 'full', gen_random_uuid())$$, '23514', null, 'plataforma fora do vocabulário');
select throws_ok($$update public.tracking_sessions set status = 'completed' where id = 'a15a0000-0000-0000-0000-00000000000a'$$,
  '23514', null, 'sessão encerrada exige ended_at e motivo');

-- 4. Posições: idempotência pela chave do cliente, sequência por sessão, contexto coerente e append-only.
insert into public.mobile_positions (organization_id, client_position_id, tracking_session_id, trip_id, driver_user_id, device_installation_id,
  sequence_no, point, accuracy_m, observed_at, sync_kind, validity) values
  ('20000000-0000-0000-0000-00000000000a', 'a15c0000-0000-0000-0000-000000000001', 'a15a0000-0000-0000-0000-00000000000a',
   'a1590000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-000000000004', 'a15b0000-0000-0000-0000-00000000000a', 1,
   extensions.st_setsrid(extensions.st_makepoint(-39.313, -7.229), 4326)::extensions.geography, 18.4, now() - interval '1 minute', 'live', 'valid');
select throws_ok($$insert into public.mobile_positions (organization_id, client_position_id, tracking_session_id, trip_id, driver_user_id,
  device_installation_id, sequence_no, point, accuracy_m, observed_at, sync_kind, validity) values ('20000000-0000-0000-0000-00000000000a',
  'a15c0000-0000-0000-0000-000000000001', 'a15a0000-0000-0000-0000-00000000000a', 'a1590000-0000-0000-0000-00000000000a',
  '10000000-0000-0000-0000-000000000004', 'a15b0000-0000-0000-0000-00000000000a', 2,
  extensions.st_setsrid(extensions.st_makepoint(-39.3, -7.2), 4326)::extensions.geography, 10, now(), 'live', 'valid')$$,
  '23505', null, 'client_position_id repetido não duplica');
select throws_ok($$insert into public.mobile_positions (organization_id, client_position_id, tracking_session_id, trip_id, driver_user_id,
  device_installation_id, sequence_no, point, accuracy_m, observed_at, sync_kind, validity) values ('20000000-0000-0000-0000-00000000000a',
  gen_random_uuid(), 'a15a0000-0000-0000-0000-00000000000a', 'a1590000-0000-0000-0000-00000000000a',
  '10000000-0000-0000-0000-000000000004', 'a15b0000-0000-0000-0000-00000000000a', 1,
  extensions.st_setsrid(extensions.st_makepoint(-39.3, -7.2), 4326)::extensions.geography, 10, now(), 'live', 'valid')$$,
  '23505', null, 'sequência repetida na sessão recusada');
select throws_ok($$insert into public.mobile_positions (organization_id, client_position_id, tracking_session_id, trip_id, driver_user_id,
  device_installation_id, sequence_no, point, accuracy_m, observed_at, sync_kind, validity) values ('20000000-0000-0000-0000-00000000000a',
  gen_random_uuid(), 'a15a0000-0000-0000-0000-00000000000a', 'a1590000-0000-0000-0000-00000000000b',
  '10000000-0000-0000-0000-000000000004', 'a15b0000-0000-0000-0000-00000000000a', 3,
  extensions.st_setsrid(extensions.st_makepoint(-39.3, -7.2), 4326)::extensions.geography, 10, now(), 'live', 'valid')$$,
  '23503', null, 'posição não mistura a sessão com outra viagem');
select throws_ok($$insert into public.mobile_positions (organization_id, client_position_id, tracking_session_id, trip_id, driver_user_id,
  device_installation_id, sequence_no, point, accuracy_m, observed_at, sync_kind, validity) values ('20000000-0000-0000-0000-00000000000b',
  gen_random_uuid(), 'a15a0000-0000-0000-0000-00000000000a', 'a1590000-0000-0000-0000-00000000000a',
  '10000000-0000-0000-0000-000000000004', 'a15b0000-0000-0000-0000-00000000000a', 4,
  extensions.st_setsrid(extensions.st_makepoint(-39.3, -7.2), 4326)::extensions.geography, 10, now(), 'live', 'valid')$$,
  '23503', null, 'posição não usa sessão de outro tenant');
select throws_ok($$insert into public.mobile_positions (organization_id, client_position_id, tracking_session_id, trip_id, driver_user_id,
  device_installation_id, sequence_no, point, accuracy_m, observed_at, sync_kind, validity) values ('20000000-0000-0000-0000-00000000000a',
  gen_random_uuid(), 'a15a0000-0000-0000-0000-00000000000a', 'a1590000-0000-0000-0000-00000000000a',
  '10000000-0000-0000-0000-000000000004', 'a15b0000-0000-0000-0000-00000000000a', 5,
  extensions.st_setsrid(extensions.st_makepoint(-39.3, -7.2), 4326)::extensions.geography, 10, now(), 'live', 'excellent')$$,
  '23514', null, 'validade fora do vocabulário');
select throws_ok($$update public.mobile_positions set accuracy_m = 1$$, 'P0001', 'tracking_record_immutable', 'posição não é alterada');
select throws_ok($$delete from public.mobile_positions$$, 'P0001', 'tracking_record_undeletable', 'posição não é apagada');
select throws_ok($$delete from public.tracking_sessions$$, 'P0001', 'tracking_record_undeletable', 'sessão não é apagada');
select is((select received_at >= observed_at from public.mobile_positions where client_position_id = 'a15c0000-0000-0000-0000-000000000001'),
  true, 'received_at é do servidor e não substitui observed_at');

select * from finish();
rollback;
