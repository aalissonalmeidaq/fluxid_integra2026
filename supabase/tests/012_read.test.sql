begin;
select plan(14);

-- Spec 012, US1: leituras do lacre e canal de tempo real com dois tenants (RF-011, RF-037, CA-001, MS-007). Tenant A: admin 2;
-- Tenant B: admin 3. O permitido e o bloqueado são conferidos lado a lado. Hermético: rollback.

delete from public.user_sessions where user_id in ('10000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000003');
insert into public.membership_roles (membership_id, role_id, assigned_by)
  select '30000000-0000-0000-0000-00000000000b', r.id, '10000000-0000-0000-0000-000000000001'
    from public.roles r where r.organization_id = '20000000-0000-0000-0000-00000000000b' and r.code = 'tenant_admin'
  on conflict do nothing;
select public.start_user_session('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000001201a2', 'aal1');
select public.start_user_session('10000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-0000001201b3', 'aal1');

insert into public.cylinder_types (id, organization_id, gas, capacity_value, capacity_unit, classification) values
  ('a1470000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', 'Oxigênio', 10, 'l', 'medicinal'),
  ('a1470000-0000-0000-0000-00000000000b', '20000000-0000-0000-0000-00000000000b', 'Oxigênio', 10, 'l', 'medicinal');
insert into public.cylinders (id, organization_id, cylinder_type_id, serial_number) values
  ('a1480000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-00000000000a', 'a1470000-0000-0000-0000-00000000000a', 'READ-A-001'),
  ('a1480000-0000-0000-0000-0000000000a2', '20000000-0000-0000-0000-00000000000a', 'a1470000-0000-0000-0000-00000000000a', 'READ-A-002'),
  ('a1480000-0000-0000-0000-0000000000b1', '20000000-0000-0000-0000-00000000000b', 'a1470000-0000-0000-0000-00000000000b', 'READ-B-001');
insert into public.seal_devices (id, organization_id, device_code, label, key_hash, created_by) values
  ('a1400000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-00000000000a', 'DSP-READA001', 'Lacre A', extensions.digest('k-a', 'sha256'), '10000000-0000-0000-0000-000000000002'),
  ('a1400000-0000-0000-0000-0000000000b1', '20000000-0000-0000-0000-00000000000b', 'DSP-READB001', 'Lacre B', extensions.digest('k-b', 'sha256'), '10000000-0000-0000-0000-000000000003');
insert into public.seal_bindings (organization_id, device_id, cylinder_id, bound_by, bound_at) values
  ('20000000-0000-0000-0000-00000000000a', 'a1400000-0000-0000-0000-0000000000a1', 'a1480000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-000000000002', now() - interval '1 day'),
  ('20000000-0000-0000-0000-00000000000b', 'a1400000-0000-0000-0000-0000000000b1', 'a1480000-0000-0000-0000-0000000000b1', '10000000-0000-0000-0000-000000000003', now() - interval '1 day');
select public.seal_ingest('DSP-READA001', extensions.digest('k-a', 'sha256'), extensions.digest('ip', 'sha256'), jsonb_build_object('protocol', 1, 'messages',
  jsonb_build_array(jsonb_build_object('message_id', 'R-1', 'type', 'position', 'read_at', now() - interval '2 minutes', 'problem', null,
    'data', jsonb_build_object('latitude', -7.209194, 'longitude', -39.306367, 'quality', 'gps', 'accuracy_m', 6, 'battery_pct', 90, 'signal_dbm', -60, 'seal_state', 'closed')))));

create function pg_temp.a(p_fn text, p_args text default '') returns jsonb language plpgsql as $$
declare r jsonb;
begin
  execute format('select public.%I(%L, %L, %L%s)', p_fn, '10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000001201a2',
    '20000000-0000-0000-0000-00000000000a', p_args) into r;
  return r;
end $$;
create function pg_temp.b(p_fn text, p_org text, p_args text default '') returns jsonb language plpgsql as $$
declare r jsonb;
begin
  execute format('select public.%I(%L, %L, %L%s)', p_fn, '10000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-0000001201b3', p_org, p_args) into r;
  return r;
end $$;

-- Permitido no próprio tenant.
select is((select jsonb_agg(x->>'device_code') from jsonb_array_elements(pg_temp.a('list_seals')->'items') x), '["DSP-READA001"]'::jsonb,
  'A lista só os próprios lacres');
select is(pg_temp.a('cylinder_seal_view', ', ''a1480000-0000-0000-0000-0000000000a1''')->'seal'->'position'->>'latitude', '-7.209194',
  'A vê a última posição do próprio cilindro');
select is(pg_temp.a('cylinder_seal_view', ', ''a1480000-0000-0000-0000-0000000000a2''')->'seal', 'null'::jsonb, 'cilindro sem lacre: seal nulo');
select is(pg_temp.a('get_seal', ', ''a1400000-0000-0000-0000-0000000000a1''')->'seal'->>'health', 'ok', 'A abre o detalhe do próprio dispositivo (saúde já calculada pela US6)');
select is(jsonb_array_length(pg_temp.a('list_positions', ', ''a1480000-0000-0000-0000-0000000000a1''')->'items'), 1, 'A lê o histórico de posições do próprio cilindro');

-- Bloqueado: o Tenant B não vê nada do A, nem com o identificador.
select is((select jsonb_agg(x->>'device_code') from jsonb_array_elements(pg_temp.b('list_seals', '20000000-0000-0000-0000-00000000000b')->'items') x),
  '["DSP-READB001"]'::jsonb, 'B não vê o lacre do A na lista');
select is(pg_temp.b('cylinder_seal_view', '20000000-0000-0000-0000-00000000000b', ', ''a1480000-0000-0000-0000-0000000000a1''')->>'code', 'NOT_FOUND',
  'cilindro do A pedido por B: "não encontrado"');
select is(pg_temp.b('get_seal', '20000000-0000-0000-0000-00000000000b', ', ''a1400000-0000-0000-0000-0000000000a1''')->>'code', 'NOT_FOUND',
  'dispositivo do A pedido por B: "não encontrado"');
select is(pg_temp.b('list_positions', '20000000-0000-0000-0000-00000000000b', ', ''a1480000-0000-0000-0000-0000000000a1''')->>'code', 'NOT_FOUND',
  'posições do cilindro do A pedidas por B: "não encontrado"');
select is(pg_temp.b('list_seals', '20000000-0000-0000-0000-00000000000a')->>'code', 'ACCESS_DENIED', 'B pedindo a organização do A: acesso negado');

-- Canal de tempo real: só quem tem seal.read na organização do tópico.
create function pg_temp.as_user(uid uuid, sid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated', 'session_id', sid, 'aal', 'aal1')::text, true);
end $$;
select pg_temp.as_user('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000001201a2');
select ok(public.seal_topic_allowed('seals:20000000-0000-0000-0000-00000000000a'), 'A ouve o canal do próprio tenant');
select ok(not public.seal_topic_allowed('seals:20000000-0000-0000-0000-00000000000b'), 'A não ouve o canal do B');
select pg_temp.as_user('10000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-0000001201b3');
select ok(not public.seal_topic_allowed('seals:20000000-0000-0000-0000-00000000000a'), 'B não ouve o canal do A');
select ok(exists (select 1 from pg_policies where schemaname = 'realtime' and tablename = 'messages' and policyname = 'seal_topic_read'
  and cmd = 'SELECT'), 'a política de leitura do canal existe em realtime.messages');

select * from finish();
rollback;
