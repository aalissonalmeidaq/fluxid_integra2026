begin;
select plan(11);

-- Spec 013, US2: resolução do conflito de chave pelo Master (replace_enrollment_key; RF-008, RF-010, RF-014). Aceitar a chave do
-- aparelho novo (o lacre reinstalado) ou manter a atual. Não vale para lacre em operação. Hermético: rollback.

delete from public.user_sessions where user_id = '10000000-0000-0000-0000-000000000001';
select public.start_user_session('10000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000132001', 'aal2');

insert into public.seal_enrollments (id, device_code, key_hash, conflict_at, conflict_key_hash, conflict_calls) values
  ('a1350000-0000-0000-0000-000000000001', 'DSP-CNF13001', extensions.digest('fxk_antiga', 'sha256'), now(), extensions.digest('fxk_nova', 'sha256'), 3),
  ('a1350000-0000-0000-0000-000000000002', 'DSP-CNF13002', extensions.digest('fxk_certa', 'sha256'), now(), extensions.digest('fxk_intrusa', 'sha256'), 1),
  ('a1350000-0000-0000-0000-000000000003', 'DSP-CNF13003', extensions.digest('fxk_sem', 'sha256'), null, null, 0);

create function pg_temp.replace(p_req text, p_id uuid, p_keep boolean, p_note text default 'Lacre reinstalado na bancada') returns jsonb language sql as $$
  select public.replace_enrollment_key('10000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000132001', p_req::uuid, p_id, p_keep, p_note,
    (select updated_at from public.seal_enrollments where id = p_id))
$$;
create function pg_temp.call(p_code text, p_key text) returns jsonb language sql as $$
  delete from private.seal_enroll_rate_windows;
  select public.seal_ingest(p_code, extensions.digest(p_key, 'sha256'), extensions.digest('ip-cnf', 'sha256'), jsonb_build_object('protocol', 1,
    'messages', jsonb_build_array(jsonb_build_object('message_id', 'b-' || p_key, 'type', 'event', 'read_at', now(), 'problem', null,
      'data', jsonb_build_object('code', 'boot', 'detail', null)))))
$$;

select is(pg_temp.replace('a1351000-0000-0000-0000-000000000001', 'a1350000-0000-0000-0000-000000000001', false, 'abc')->>'code', 'JUSTIFICATION_REQUIRED',
  'resolver o conflito exige justificativa');
select is(pg_temp.replace('a1351000-0000-0000-0000-000000000002', 'a1350000-0000-0000-0000-000000000001', false)->>'code', 'KEY_REPLACED',
  'aceitar a chave do aparelho novo');
select ok((select key_hash = extensions.digest('fxk_nova', 'sha256') and conflict_at is null and conflict_key_hash is null and status = 'pending'
  from public.seal_enrollments where id = 'a1350000-0000-0000-0000-000000000001'), 'a chave passa a ser a nova, a marca some e o pedido volta a aguardar');
select is(pg_temp.call('DSP-CNF13001', 'fxk_nova')->>'status', '202', 'o lacre com a chave nova passa a receber 202');
select is(pg_temp.call('DSP-CNF13001', 'fxk_antiga')->>'status', '401', 'o da chave antiga recebe 401');

select is(pg_temp.replace('a1351000-0000-0000-0000-000000000003', 'a1350000-0000-0000-0000-000000000002', true, 'Aparelho estranho na rede')->>'code',
  'CONFLICT_CLEARED', 'manter a chave atual');
select ok((select key_hash = extensions.digest('fxk_certa', 'sha256') and conflict_at is null from public.seal_enrollments
  where id = 'a1350000-0000-0000-0000-000000000002'), 'mantém a chave e só limpa a marca');

select is(pg_temp.replace('a1351000-0000-0000-0000-000000000004', 'a1350000-0000-0000-0000-000000000003', false)->>'code', 'INVALID_STATE',
  'sem conflito não há o que resolver');

insert into public.seal_devices (id, organization_id, device_code, label, key_hash, created_by) values
  ('a1350000-0000-0000-0000-0000000000a4', '20000000-0000-0000-0000-00000000000a', 'DSP-CNF13004', 'Lacre em operação', extensions.digest('fxk_op', 'sha256'),
   '10000000-0000-0000-0000-000000000001');
insert into public.seal_enrollments (id, device_code, key_hash, status, organization_id, device_id, conflict_at, conflict_key_hash, conflict_calls) values
  ('a1350000-0000-0000-0000-000000000004', 'DSP-CNF13004', extensions.digest('fxk_op', 'sha256'), 'approved', '20000000-0000-0000-0000-00000000000a',
   'a1350000-0000-0000-0000-0000000000a4', now(), extensions.digest('fxk_reinstalado', 'sha256'), 1);
select is(pg_temp.replace('a1351000-0000-0000-0000-000000000005', 'a1350000-0000-0000-0000-000000000004', false)->>'code', 'INVALID_STATE',
  'lacre em operação: retirar antes de trocar a chave');

select is((select count(*)::int from public.audit_logs where action = 'seal.enrollment_key_replace' and organization_id is null
  and target_id in ('a1350000-0000-0000-0000-000000000001', 'a1350000-0000-0000-0000-000000000002')), 2, 'cada resolução auditada na plataforma');
select ok(not exists (select 1 from public.audit_logs where action = 'seal.enrollment_key_replace'
  and (metadata::text like '%' || encode(extensions.digest('fxk_nova', 'sha256'), 'hex') || '%' or metadata ? 'key_hash')),
  'a auditoria não guarda nenhuma das chaves');

select * from finish();
rollback;
