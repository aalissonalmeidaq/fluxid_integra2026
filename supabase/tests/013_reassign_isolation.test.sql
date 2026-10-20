begin;
select plan(9);

-- Spec 013, US2: o histórico fica no tenant em que foi gerado (RN-002, RN-005, MS-004). Aprovar para o A, gerar posição, retirar
-- esquecendo as redes, confirmar e aprovar para o B: o B não vê nada do A, e o A continua vendo o próprio histórico. Hermético: rollback.

delete from public.user_sessions where user_id in ('10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002',
  '10000000-0000-0000-0000-000000000003');
insert into public.membership_roles (membership_id, role_id, assigned_by)
  select '30000000-0000-0000-0000-00000000000b', r.id, '10000000-0000-0000-0000-000000000001'
    from public.roles r where r.organization_id = '20000000-0000-0000-0000-00000000000b' and r.code = 'tenant_admin'
  on conflict do nothing;
select public.start_user_session('10000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000136001', 'aal2');
select public.start_user_session('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000001360a2', 'aal1');
select public.start_user_session('10000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-0000001360b3', 'aal1');

create function pg_temp.call(p_messages jsonb) returns jsonb language sql as $$
  delete from private.seal_enroll_rate_windows;
  delete from private.seal_rate_windows;
  select public.seal_ingest('DSP-ISO13001', extensions.digest('fxk_iso', 'sha256'), extensions.digest('ip-iso', 'sha256'),
    jsonb_build_object('protocol', 1, 'messages', p_messages))
$$;
create function pg_temp.position(p_id text) returns jsonb language sql as $$
  select jsonb_build_array(jsonb_build_object('message_id', p_id, 'type', 'position', 'read_at', now() - interval '1 minute', 'problem', null,
    'data', jsonb_build_object('latitude', -7.2, 'longitude', -39.3, 'quality', 'gps', 'accuracy_m', 6, 'battery_pct', 90, 'signal_dbm', -60, 'seal_state', 'closed')))
$$;
create function pg_temp.enrollment() returns public.seal_enrollments language sql as $$ select * from public.seal_enrollments where device_code = 'DSP-ISO13001' $$;
create function pg_temp.master(p_fn text, p_args text) returns jsonb language plpgsql as $$
declare r jsonb;
begin
  execute format('select public.%I(%L, %L%s)', p_fn, '10000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000136001', p_args) into r;
  return r;
end $$;

select pg_temp.call(jsonb_build_array(jsonb_build_object('message_id', 'boot-1', 'type', 'event', 'read_at', now(), 'problem', null,
  'data', jsonb_build_object('code', 'boot', 'detail', null))));
select pg_temp.master('approve_enrollment', format(', %L, %L, %L, %L, %L', 'a13a1000-0000-0000-0000-000000000001', (pg_temp.enrollment()).id,
  '20000000-0000-0000-0000-00000000000a', 'Destinação ao A', (pg_temp.enrollment()).updated_at));
create temp table line_a as select (pg_temp.enrollment()).device_id as id;
select is(pg_temp.call(pg_temp.position('iso-a1'))->>'status', '200', 'aprovado para o A, o lacre envia posição');

select pg_temp.master('withdraw_device', format(', %L, %L, %L, %L, %L', 'a13a1000-0000-0000-0000-000000000002', (pg_temp.enrollment()).id, 'all',
  'Lacre vai para o Tenant B', (pg_temp.enrollment()).updated_at));
select is(pg_temp.call(jsonb_build_array(jsonb_build_object('message_id', 'forgot-1', 'type', 'event', 'read_at', now(), 'problem', null,
  'data', jsonb_build_object('code', 'networks_forgotten', 'detail', 'all'))))->>'status', '202', 'retirado, confirma o esquecimento das redes');
select is(pg_temp.master('approve_enrollment', format(', %L, %L, %L, %L, %L', 'a13a1000-0000-0000-0000-000000000003', (pg_temp.enrollment()).id,
  '20000000-0000-0000-0000-00000000000b', 'Destinação ao B', (pg_temp.enrollment()).updated_at))->>'code', 'APPROVED', 'aprovado para o B');
create temp table line_b as select (pg_temp.enrollment()).device_id as id;
select isnt((select id from line_b), (select id from line_a), 'a destinação ao B é outra linha de seal_devices');
select is(pg_temp.call(pg_temp.position('iso-b1'))->>'status', '200', 'o lacre envia posição já no B');

select is((select count(*)::int from public.seal_positions where device_id = (select id from line_b) and organization_id = '20000000-0000-0000-0000-00000000000b'), 1,
  'a posição nova fica só na linha do B');
select is((select count(*)::int from public.seal_positions where device_id = (select id from line_a) and organization_id = '20000000-0000-0000-0000-00000000000a'), 1,
  'a posição antiga continua na linha do A');
select ok(not exists (select 1 from jsonb_array_elements(public.list_seals('10000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-0000001360b3',
  '20000000-0000-0000-0000-00000000000b')->'items') x where x->>'device_id' = (select id from line_a)::text), 'o B não vê a linha antiga do A');
select is(public.get_seal('10000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-0000001360b3', '20000000-0000-0000-0000-00000000000b',
  (select id from line_a))->>'code', 'NOT_FOUND', 'nem pelo id');

select * from finish();
rollback;
