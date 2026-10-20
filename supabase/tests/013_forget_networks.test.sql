begin;
select plan(12);

-- Spec 013, US2: as redes de um tenant não seguem para outro (RN-006; request_forget_networks; NETWORKS_NOT_CLEARED). Um lacre
-- pendente com a rede principal do Tenant A só vai para o Tenant B depois de confirmar o esquecimento de todas as redes. Hermético: rollback.

delete from public.user_sessions where user_id = '10000000-0000-0000-0000-000000000001';
select public.start_user_session('10000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000134001', 'aal2');

insert into public.seal_enrollments (id, device_code, key_hash, last_organization_id) values
  ('a1370000-0000-0000-0000-000000000001', 'DSP-FGT13001', extensions.digest('fxk_f1', 'sha256'), '20000000-0000-0000-0000-00000000000a'),
  ('a1370000-0000-0000-0000-000000000002', 'DSP-FGT13002', extensions.digest('fxk_f2', 'sha256'), null);

create function pg_temp.m(p_fn text, p_args text) returns jsonb language plpgsql as $$
declare r jsonb;
begin
  execute format('select public.%I(%L, %L%s)', p_fn, '10000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000134001', p_args) into r;
  return r;
end $$;
create function pg_temp.at(p_id uuid) returns text language sql as $$ select updated_at::text from public.seal_enrollments where id = p_id $$;
create function pg_temp.forget(p_req text, p_id uuid, p_note text default 'Lacre vai para outro tenant') returns jsonb language sql as $$
  select pg_temp.m('request_forget_networks', format(', %L, %L, %L, %L', p_req, p_id, p_note, pg_temp.at(p_id)))
$$;
create function pg_temp.approve(p_req text, p_id uuid, p_org uuid) returns jsonb language sql as $$
  select pg_temp.m('approve_enrollment', format(', %L, %L, %L, %L, %L', p_req, p_id, p_org, 'Destinação conferida', pg_temp.at(p_id)))
$$;
create function pg_temp.call(p_code text, p_key text, p_detail text default null) returns jsonb language sql as $$
  delete from private.seal_enroll_rate_windows;
  select public.seal_ingest(p_code, extensions.digest(p_key, 'sha256'), extensions.digest('ip-fgt', 'sha256'), jsonb_build_object('protocol', 1,
    'messages', jsonb_build_array(jsonb_build_object('message_id', 'e-' || coalesce(p_detail, 'boot') || '-' || p_key, 'type', 'event', 'read_at', now(),
      'problem', null, 'data', jsonb_build_object('code', case when p_detail is null then 'boot' else 'networks_forgotten' end, 'detail', p_detail)))))
$$;

select is(pg_temp.approve('a1371000-0000-0000-0000-000000000001', 'a1370000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-00000000000b')->>'code',
  'NETWORKS_NOT_CLEARED', 'pendente com redes do Tenant A não pode ir para o Tenant B');
select is(pg_temp.forget('a1371000-0000-0000-0000-000000000002', 'a1370000-0000-0000-0000-000000000001', 'abc')->>'code', 'JUSTIFICATION_REQUIRED',
  'pedir o esquecimento exige justificativa');
select is(pg_temp.forget('a1371000-0000-0000-0000-000000000003', 'a1370000-0000-0000-0000-000000000002')->>'code', 'INVALID_STATE',
  'sem último tenant não há rede a esquecer');
select is(pg_temp.forget('a1371000-0000-0000-0000-000000000004', 'a1370000-0000-0000-0000-000000000001')->>'code', 'FORGET_REQUESTED',
  'o Master pede o esquecimento de todas as redes');
select ok((select forget_networks = 'all' and forget_networks_requested_at is not null from public.seal_enrollments
  where id = 'a1370000-0000-0000-0000-000000000001'), 'forget_networks all marcado');
select is((select count(*)::int from public.audit_logs where action = 'seal.networks_forget_request' and organization_id is null
  and target_id = 'a1370000-0000-0000-0000-000000000001' and justification = 'Lacre vai para outro tenant'
  and metadata->>'last_organization_id' = '20000000-0000-0000-0000-00000000000a'), 1, 'pedido auditado na plataforma com o último tenant');

select is(pg_temp.call('DSP-FGT13001', 'fxk_f1')->'body'->>'forget_networks', 'all', 'o lacre recebe a marca no próximo 202');
select is(pg_temp.approve('a1371000-0000-0000-0000-000000000005', 'a1370000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-00000000000b')->>'code',
  'NETWORKS_NOT_CLEARED', 'antes da confirmação, o Tenant B continua bloqueado');
select is(pg_temp.call('DSP-FGT13001', 'fxk_f1', 'all')->'body'->>'forget_networks', null, 'o lacre confirma com networks_forgotten all');
select is(pg_temp.approve('a1371000-0000-0000-0000-000000000006', 'a1370000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-00000000000b')->>'code',
  'APPROVED', 'depois da confirmação, o lacre vai para o Tenant B');

-- Para o mesmo tenant não há trava; a aprovação limpa um pedido de esquecimento ainda aberto.
insert into public.seal_enrollments (id, device_code, key_hash, last_organization_id, forget_networks, forget_networks_requested_at) values
  ('a1370000-0000-0000-0000-000000000003', 'DSP-FGT13003', extensions.digest('fxk_f3', 'sha256'), '20000000-0000-0000-0000-00000000000a', 'extras', now());
select is(pg_temp.approve('a1371000-0000-0000-0000-000000000007', 'a1370000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-00000000000a')->>'code',
  'APPROVED', 'de volta ao mesmo tenant, sem trava');
select ok((select forget_networks is null and forget_networks_requested_at is null from public.seal_enrollments
  where id = 'a1370000-0000-0000-0000-000000000003'), 'a aprovação limpa o pedido de esquecimento ainda aberto');

select * from finish();
rollback;
