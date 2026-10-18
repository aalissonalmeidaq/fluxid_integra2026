begin;
select plan(17);

-- Spec 012: RLS das tabelas do lacre com dois tenants (RF-037, CA-001). As tabelas não têm política nem privilégio para
-- authenticated: toda leitura passa por RPC (as asserções de cada RPC ficam nos testes de cada história). Hermético: rollback.

delete from public.user_sessions where user_id in ('10000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000003');
select public.start_user_session('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000001200a2', 'aal1');

create function public.tap_act_as(uid uuid, sid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated', 'session_id', sid, 'aal', 'aal1')::text, true);
end;
$$;
grant execute on function public.tap_act_as(uuid, uuid) to authenticated, anon;

select ok((select bool_and(relrowsecurity) from pg_class where oid in (
  to_regclass('public.seal_devices'), to_regclass('public.seal_device_events'), to_regclass('public.seal_bindings'),
  to_regclass('public.seal_messages'), to_regclass('public.seal_positions'), to_regclass('public.seal_commands'),
  to_regclass('public.seal_command_events'), to_regclass('public.seal_watches'), to_regclass('public.seal_violations'),
  to_regclass('public.seal_alerts'), to_regclass('public.push_subscriptions'), to_regclass('public.push_outbox'),
  to_regclass('private.seal_rate_windows'), to_regclass('private.seal_auth_failures'), to_regclass('private.seal_requests')))
  and (select count(*) from pg_class where oid in (
  to_regclass('public.seal_devices'), to_regclass('public.seal_device_events'), to_regclass('public.seal_bindings'),
  to_regclass('public.seal_messages'), to_regclass('public.seal_positions'), to_regclass('public.seal_commands'),
  to_regclass('public.seal_command_events'), to_regclass('public.seal_watches'), to_regclass('public.seal_violations'),
  to_regclass('public.seal_alerts'), to_regclass('public.push_subscriptions'), to_regclass('public.push_outbox'),
  to_regclass('private.seal_rate_windows'), to_regclass('private.seal_auth_failures'), to_regclass('private.seal_requests'))) = 15,
  'RLS ligada nas 12 tabelas públicas e nas 3 privadas do lacre');
select is((select count(*)::int from pg_policies where (schemaname = 'public' and tablename in (
  'seal_devices', 'seal_device_events', 'seal_bindings', 'seal_messages', 'seal_positions', 'seal_commands', 'seal_command_events',
  'seal_watches', 'seal_violations', 'seal_alerts', 'push_subscriptions', 'push_outbox'))
  or (schemaname = 'private' and tablename in ('seal_rate_windows', 'seal_auth_failures', 'seal_requests'))), 0,
  'nenhuma política para authenticated nas tabelas do lacre');

-- Tenant A autenticado: nenhum acesso direto, nem ao que é seu.
set local role authenticated;
select public.tap_act_as('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000001200a2');
select throws_ok($$ select count(*) from public.seal_devices $$, '42501', null, 'não lê seal_devices direto');
select throws_ok($$ select count(*) from public.seal_device_events $$, '42501', null, 'não lê seal_device_events direto');
select throws_ok($$ select count(*) from public.seal_bindings $$, '42501', null, 'não lê seal_bindings direto');
select throws_ok($$ select count(*) from public.seal_messages $$, '42501', null, 'não lê seal_messages direto');
select throws_ok($$ select count(*) from public.seal_positions $$, '42501', null, 'não lê seal_positions direto (coordenadas)');
select throws_ok($$ select count(*) from public.seal_commands $$, '42501', null, 'não lê seal_commands direto');
select throws_ok($$ select count(*) from public.seal_command_events $$, '42501', null, 'não lê seal_command_events direto');
select throws_ok($$ select count(*) from public.seal_watches $$, '42501', null, 'não lê seal_watches direto');
select throws_ok($$ select count(*) from public.seal_violations $$, '42501', null, 'não lê seal_violations direto');
select throws_ok($$ select count(*) from public.seal_alerts $$, '42501', null, 'não lê seal_alerts direto');
select throws_ok($$ select count(*) from public.push_subscriptions $$, '42501', null, 'não lê push_subscriptions direto');
select throws_ok($$ select count(*) from public.push_outbox $$, '42501', null, 'não lê push_outbox direto');
select throws_ok($$ select count(*) from private.seal_rate_windows $$, '42501', null, 'não lê a janela de limite privada');
select throws_ok($$ select count(*) from private.seal_auth_failures $$, '42501', null, 'não lê as falhas de chave privadas');
select throws_ok($$ select count(*) from private.seal_requests $$, '42501', null, 'não lê os pedidos privados');
reset role;

select * from finish();
rollback;
