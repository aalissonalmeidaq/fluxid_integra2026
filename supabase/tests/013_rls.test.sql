begin;
select plan(14);

-- Spec 013: RLS com dois tenants e o Master (princípio III, RN-005, MS-004). seal_enrollments é da plataforma: RLS ligada, nenhuma
-- política e nenhum privilégio para anon e authenticated. As políticas da Spec 012 não mudam: com duas linhas do mesmo device_code,
-- uma inativa no A e outra ativa no B, cada tenant lê só a sua pelas RPCs. Hermético: rollback.

delete from public.user_sessions where user_id in ('10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002',
  '10000000-0000-0000-0000-000000000003');
insert into public.membership_roles (membership_id, role_id, assigned_by)
  select '30000000-0000-0000-0000-00000000000b', r.id, '10000000-0000-0000-0000-000000000001'
    from public.roles r where r.organization_id = '20000000-0000-0000-0000-00000000000b' and r.code = 'tenant_admin'
  on conflict do nothing;
select public.start_user_session('10000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000130001', 'aal2');
select public.start_user_session('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000001300a2', 'aal1');
select public.start_user_session('10000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-0000001300b3', 'aal1');

create function public.tap_act_as(uid uuid, sid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated', 'session_id', sid, 'aal', 'aal2')::text, true);
end;
$$;
grant execute on function public.tap_act_as(uuid, uuid) to authenticated, anon;

insert into public.seal_devices (id, organization_id, device_code, label, key_hash, created_by, status, inactive_reason) values
  ('a1320000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-00000000000a', 'DSP-RLS13001', 'Lacre antigo do A', extensions.digest('k', 'sha256'),
   '10000000-0000-0000-0000-000000000002', 'inactive', 'returned');
insert into public.seal_devices (id, organization_id, device_code, label, key_hash, created_by) values
  ('a1320000-0000-0000-0000-0000000000b1', '20000000-0000-0000-0000-00000000000b', 'DSP-RLS13001', 'Lacre novo do B', extensions.digest('k', 'sha256'),
   '10000000-0000-0000-0000-000000000003');
insert into public.seal_enrollments (device_code, key_hash, status, organization_id, device_id, last_organization_id) values
  ('DSP-RLS13001', extensions.digest('k', 'sha256'), 'approved', '20000000-0000-0000-0000-00000000000b', 'a1320000-0000-0000-0000-0000000000b1',
   '20000000-0000-0000-0000-00000000000b');

select ok((select bool_and(relrowsecurity) from pg_class where oid in (to_regclass('public.seal_enrollments'), to_regclass('private.seal_enroll_rate_windows'))),
  'RLS ligada em seal_enrollments e em private.seal_enroll_rate_windows');
select is((select count(*)::int from pg_policies where (schemaname = 'public' and tablename = 'seal_enrollments')
  or (schemaname = 'private' and tablename = 'seal_enroll_rate_windows')), 0, 'nenhuma política nas tabelas novas');

-- Pelas RPCs da Spec 012, cada tenant lê só a sua linha do mesmo código.
select is((select jsonb_agg(x->>'device_id') from jsonb_array_elements(public.list_seals('10000000-0000-0000-0000-000000000003',
  '60000000-0000-0000-0000-0000001300b3', '20000000-0000-0000-0000-00000000000b')->'items') x),
  '["a1320000-0000-0000-0000-0000000000b1"]'::jsonb, 'B lista só a linha ativa dele');
select ok(not exists (select 1 from jsonb_array_elements(public.list_seals('10000000-0000-0000-0000-000000000002',
  '60000000-0000-0000-0000-0000001300a2', '20000000-0000-0000-0000-00000000000a')->'items') x where x->>'device_id' = 'a1320000-0000-0000-0000-0000000000b1'),
  'A não vê a linha do B com o mesmo código');
select is(public.get_seal('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000001300a2', '20000000-0000-0000-0000-00000000000a',
  'a1320000-0000-0000-0000-0000000000b1')->>'code', 'NOT_FOUND', 'A pelo id da linha do B: não encontrado');
select is(public.get_seal('10000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-0000001300b3', '20000000-0000-0000-0000-00000000000b',
  'a1320000-0000-0000-0000-0000000000a1')->>'code', 'NOT_FOUND', 'B pelo id da linha antiga do A: não encontrado');
select is(public.get_seal('10000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-0000001300b3', '20000000-0000-0000-0000-00000000000a',
  'a1320000-0000-0000-0000-0000000000a1')->>'code', 'ACCESS_DENIED', 'B pedindo a organização do A: acesso negado');

-- Nenhum acesso direto a seal_enrollments, nem para o Master.
set local role authenticated;
select public.tap_act_as('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000001300a2');
select throws_ok($$ select count(*) from public.seal_enrollments $$, '42501', null, 'admin do A não lê seal_enrollments direto');
select throws_ok($$ insert into public.seal_enrollments (device_code, key_hash) values ('DSP-RLS13002', extensions.digest('x', 'sha256')) $$,
  '42501', null, 'admin do A não insere em seal_enrollments');
select public.tap_act_as('10000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-0000001300b3');
select throws_ok($$ update public.seal_enrollments set status = 'pending' $$, '42501', null, 'admin do B não altera seal_enrollments');
select public.tap_act_as('10000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000130001');
select throws_ok($$ select count(*) from public.seal_enrollments $$, '42501', null, 'nem o Master lê seal_enrollments direto (só por RPC)');
select throws_ok($$ select count(*) from private.seal_enroll_rate_windows $$, '42501', null, 'ninguém lê a tabela privada de limites');
reset role;
set local role anon;
select throws_ok($$ select count(*) from public.seal_enrollments $$, '42501', null, 'anon não lê seal_enrollments');
reset role;

select is((select count(*)::int from public.seal_devices where device_code = 'DSP-RLS13001'), 2,
  'as duas destinações continuam em linhas separadas, cada uma no seu tenant');

select * from finish();
rollback;
