begin;
select plan(30);

-- Spec 013, US2: aprovação, recusa e leitura da fila pelo Master (contracts/operacoes-plataforma.md; RF-011, RF-012, RF-014, RN-006,
-- MS-006; constituição, princípio III). Dois tenants (A e B) e o Master do seed. Hermético: rollback.

delete from public.user_sessions where user_id in ('10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002');
select public.start_user_session('10000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000131001', 'aal2');
select public.start_user_session('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000001310a2', 'aal1');

insert into public.seal_enrollments (id, device_code, key_hash, calls, signal_dbm, wifi_ssid, firmware_version) values
  ('a1340000-0000-0000-0000-000000000001', 'DSP-APR13001', extensions.digest('k1', 'sha256'), 3, -58, 'Rede-Ficticia', '3.0.0'),
  ('a1340000-0000-0000-0000-000000000002', 'DSP-APR13002', extensions.digest('k2', 'sha256'), 1, -80, 'Rede-Ficticia', '3.0.0'),
  ('a1340000-0000-0000-0000-000000000003', 'DSP-APR13003', extensions.digest('k3', 'sha256'), 1, -70, 'Rede-Ficticia', '3.0.0');
update public.seal_enrollments set conflict_at = now(), conflict_key_hash = extensions.digest('outro', 'sha256'), conflict_calls = 2
 where id = 'a1340000-0000-0000-0000-000000000003';

create function pg_temp.m(p_fn text, p_args text) returns jsonb language plpgsql as $$
declare r jsonb;
begin
  execute format('select public.%I(%L, %L%s)', p_fn, '10000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000131001', p_args) into r;
  return r;
end $$;
create function pg_temp.at(p_id uuid) returns text language sql as $$ select updated_at::text from public.seal_enrollments where id = p_id $$;
create function pg_temp.approve(p_req text, p_id uuid, p_org uuid, p_note text default 'Lacre conferido na bancada', p_at text default null) returns jsonb language sql as $$
  select pg_temp.m('approve_enrollment', format(', %L, %L, %L, %L, %L', p_req, p_id, p_org, p_note, coalesce(p_at, pg_temp.at(p_id))))
$$;

-- Leitura da fila
select is(pg_temp.m('list_enrollments', ', ''pending'', null, 0, 100')->>'code', 'LISTED', 'o Master lista os pedidos');
select is((select count(*)::int from jsonb_array_elements(pg_temp.m('list_enrollments', ', ''pending'', null, 0, 100')->'items') x
  where x->>'device_code' like 'DSP-APR13%'), 3, 'os três pedidos pendentes aparecem');
select is((select x->>'conflict' from jsonb_array_elements(pg_temp.m('list_enrollments', ', ''pending'', true, 0, 100')->'items') x
  where x->>'device_code' = 'DSP-APR13003'), 'true', 'o filtro de conflito traz o pedido em conflito');
select is((select count(*)::int from jsonb_array_elements(pg_temp.m('list_enrollments', ', ''pending'', true, 0, 100')->'items') x
  where x->>'device_code' in ('DSP-APR13001', 'DSP-APR13002')), 0, 'e só ele');
select ok((select x ? 'signal_dbm' and x ? 'wifi_ssid' and x ? 'firmware_version' and x ? 'calls' and x ? 'first_seen_at' and x ? 'last_seen_at'
  and not x ? 'key_hash' and not x ? 'source_hash' and not x ? 'conflict_key_hash'
  from jsonb_array_elements(pg_temp.m('list_enrollments', ', ''pending'', null, 0, 100')->'items') x where x->>'device_code' = 'DSP-APR13001'),
  'cada pedido traz sinal, rede, firmware e chamadas, nunca a chave nem o endereço');
select ok(pg_temp.m('list_enrollments', ', null, null, 0, 100')->'counts' ? 'pending', 'a lista traz a contagem por situação');
select ok(pg_temp.m('list_enrollments', ', null, null, 0, 100') ? 'rate_limited_last_24h', 'e os pedidos descartados pelo limite');
select is(pg_temp.m('list_enrollments', ', null, null, 0, 101')->>'code', 'VALIDATION_FAILED', 'página de no máximo 100');
insert into public.organizations (id, kind, legal_name, display_name, status) values
  ('a1340000-0000-0000-0000-0000000000c1', 'tenant', 'Tenant Suspenso Sintético', 'Tenant Suspenso', 'suspended');
select ok((select bool_and(x->>'name' <> 'Tenant Suspenso' and x->>'name' <> 'FluxID') and bool_or(x->>'name' = 'Tenant A')
  from jsonb_array_elements(pg_temp.m('list_tenants_for_seals', '')->'items') x), 'só os tenants ativos para o seletor, sem a plataforma');

-- Aprovar
select is(pg_temp.approve('a1341000-0000-0000-0000-000000000001', 'a1340000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-00000000000a', 'abc')->>'code',
  'JUSTIFICATION_REQUIRED', 'aprovar exige justificativa de 5 a 500');
select is(pg_temp.approve('a1341000-0000-0000-0000-000000000002', 'a1340000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-00000000000a',
  'Lacre conferido na bancada', '2000-01-01 00:00:00+00')->>'code', 'STALE', 'expected_updated_at diferente: STALE');
select is(pg_temp.approve('a1341000-0000-0000-0000-000000000003', 'a1340000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-00000000000a')->>'code',
  'ENROLLMENT_CONFLICT', 'pedido com conflito não pode ser aprovado');
select is(pg_temp.approve('a1341000-0000-0000-0000-000000000004', 'a1340000-0000-0000-0000-000000000002', 'a1340000-0000-0000-0000-0000000000c1')->>'code',
  'TENANT_INACTIVE', 'tenant que não está ativo: TENANT_INACTIVE');
select is(pg_temp.approve('a1341000-0000-0000-0000-000000000005', 'a1340000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001')->>'code',
  'NOT_FOUND', 'a organização da plataforma não é um tenant');

select is(pg_temp.approve('a1341000-0000-0000-0000-000000000006', 'a1340000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-00000000000a')->>'code',
  'APPROVED', 'o Master aprova para o Tenant A');
select ok((select e.status = 'approved' and e.organization_id = '20000000-0000-0000-0000-00000000000a' and e.last_organization_id = e.organization_id
  and e.decided_by = '10000000-0000-0000-0000-000000000001' and e.decision_note = 'Lacre conferido na bancada'
  from public.seal_enrollments e where e.id = 'a1340000-0000-0000-0000-000000000001'), 'o pedido fica aprovado, com o tenant, a decisão e o último tenant');
select ok((select d.status = 'active' and d.device_code = 'DSP-APR13001' and d.key_hash = extensions.digest('k1', 'sha256')
  and d.enrollment_id = 'a1340000-0000-0000-0000-000000000001' and d.approved_by = '10000000-0000-0000-0000-000000000001' and d.approved_at is not null
  and not exists (select 1 from public.seal_bindings b where b.device_id = d.id)
  from public.seal_devices d join public.seal_enrollments e on e.device_id = d.id where e.id = 'a1340000-0000-0000-0000-000000000001'
    and d.organization_id = '20000000-0000-0000-0000-00000000000a'),
  'nasce uma linha nova e ativa em seal_devices no Tenant A, com a mesma chave e sem cilindro');
select is(pg_temp.approve('a1341000-0000-0000-0000-000000000006', 'a1340000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-00000000000a')->>'replayed',
  'true', 'o mesmo request_id não aprova de novo');
select is((select count(*)::int from public.seal_devices where device_code = 'DSP-APR13001'), 1, 'e não cria outra linha');
select is(pg_temp.approve('a1341000-0000-0000-0000-000000000007', 'a1340000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-00000000000a')->>'code',
  'INVALID_STATE', 'pedido já aprovado: INVALID_STATE');
select is((select count(*)::int from public.audit_logs where action = 'seal.enrollment_approve' and target_id = 'a1340000-0000-0000-0000-000000000001'
  and (organization_id is null or organization_id = '20000000-0000-0000-0000-00000000000a') and justification = 'Lacre conferido na bancada'
  and metadata->>'device_code' = 'DSP-APR13001' and not metadata ? 'key_hash'), 2,
  'aprovação auditada na plataforma e no tenant de destino, com a justificativa e sem a chave');

-- Recusar
select is(pg_temp.m('refuse_enrollment', format(', %L, %L, %L, %L', 'a1341000-0000-0000-0000-000000000008', 'a1340000-0000-0000-0000-000000000002', 'abc',
  pg_temp.at('a1340000-0000-0000-0000-000000000002')))->>'code', 'JUSTIFICATION_REQUIRED', 'recusar exige justificativa');
select is(pg_temp.m('refuse_enrollment', format(', %L, %L, %L, %L', 'a1341000-0000-0000-0000-000000000009', 'a1340000-0000-0000-0000-000000000002',
  'Lacre desconhecido', '2000-01-01 00:00:00+00'))->>'code', 'STALE', 'recusar com o pedido alterado: STALE');
select is(pg_temp.m('refuse_enrollment', format(', %L, %L, %L, %L', 'a1341000-0000-0000-0000-000000000010', 'a1340000-0000-0000-0000-000000000002',
  'Lacre desconhecido', pg_temp.at('a1340000-0000-0000-0000-000000000002')))->>'code', 'REFUSED', 'o Master recusa');
select is((select status || '/' || decision_note from public.seal_enrollments where id = 'a1340000-0000-0000-0000-000000000002'), 'refused/Lacre desconhecido',
  'recusado com a justificativa');
select is((select count(*)::int from public.audit_logs where action = 'seal.enrollment_refuse' and organization_id is null
  and target_id = 'a1340000-0000-0000-0000-000000000002' and justification = 'Lacre desconhecido'), 1, 'recusa auditada na plataforma');
select is(pg_temp.m('refuse_enrollment', format(', %L, %L, %L, %L', 'a1341000-0000-0000-0000-000000000011', 'a1340000-0000-0000-0000-000000000001',
  'Lacre desconhecido', pg_temp.at('a1340000-0000-0000-0000-000000000001')))->>'code', 'INVALID_STATE', 'só pedido aguardando pode ser recusado');

-- Recusado pode ser reconsiderado e aprovado.
select is(pg_temp.approve('a1341000-0000-0000-0000-000000000012', 'a1340000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-00000000000b',
  'Reconsiderado após conferir a nota')->>'code', 'APPROVED', 'recusado → aprovado (o Master reconsidera)');

-- Quem não é Master não lê nem aprova.
select is(public.list_enrollments('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000001310a2', null, null, 0, 100)->>'code',
  'ACCESS_DENIED', 'admin de tenant não lista os pedidos');
select is(public.approve_enrollment('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000001310a2', 'a1341000-0000-0000-0000-000000000013',
  'a1340000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-00000000000a', 'Tentativa sem permissão', now())->>'code',
  'ACCESS_DENIED', 'admin de tenant não aprova');

select * from finish();
rollback;
