begin;
select plan(9);

-- Massa sintética isolada na transação.
insert into auth.users (id, aud, role, email) values
  ('10000000-0000-0000-0000-0000000000a1', 'authenticated', 'authenticated', 'idem-1@example.invalid'),
  ('10000000-0000-0000-0000-0000000000a2', 'authenticated', 'authenticated', 'idem-2@example.invalid');

insert into public.organizations (id, kind, legal_name, display_name, status) values
  ('20000000-0000-0000-0000-0000000000a1', 'tenant', 'Org Idempotência 1', 'Org Idem 1', 'active'),
  ('20000000-0000-0000-0000-0000000000a2', 'tenant', 'Org Idempotência 2', 'Org Idem 2', 'active');

insert into public.memberships (organization_id, user_id, status, activated_at) values
  ('20000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-0000000000a1', 'active', now()),
  ('20000000-0000-0000-0000-0000000000a2', '10000000-0000-0000-0000-0000000000a2', 'active', now());

create temp table idem_results (label text primary key, result jsonb);

-- 1. Primeira chamada cria a reserva.
insert into idem_results
select 'first', public.process_sync_command(
  '20000000-0000-0000-0000-0000000000a1', 'chave-idempotente-1', '10000000-0000-0000-0000-0000000000a1',
  'harness.synthetic', repeat('a', 64));
select is((select result->>'status' from idem_results where label = 'first'), 'created', 'primeira chamada cria a reserva');

-- 2. Repetição devolve o mesmo resultado estável.
insert into idem_results
select 'replay', public.process_sync_command(
  '20000000-0000-0000-0000-0000000000a1', 'chave-idempotente-1', '10000000-0000-0000-0000-0000000000a1',
  'harness.synthetic', repeat('a', 64));
select is((select result->>'status' from idem_results where label = 'replay'), 'replayed', 'repetição é replay');
select is(
  (select result->'result' from idem_results where label = 'replay'),
  (select result->'result' from idem_results where label = 'first'),
  'replay devolve o mesmo resultado');

-- 3. Um único registro no ledger após a repetição.
select is(
  (select count(*)::int from private.idempotency_ledger where idempotency_key = 'chave-idempotente-1'),
  1, 'a repetição não duplica a mutação lógica');

-- 4. Hash divergente para a mesma chave é conflito.
select throws_ok(
  $$ select public.process_sync_command(
       '20000000-0000-0000-0000-0000000000a1', 'chave-idempotente-1', '10000000-0000-0000-0000-0000000000a1',
       'harness.synthetic', repeat('b', 64)) $$,
  'P0001', 'idempotency_payload_conflict', 'payload divergente é rejeitado');

-- 5. Ator sem vínculo ativo no tenant é negado.
select throws_ok(
  $$ select public.process_sync_command(
       '20000000-0000-0000-0000-0000000000a2', 'chave-idempotente-2', '10000000-0000-0000-0000-0000000000a1',
       'harness.synthetic', repeat('a', 64)) $$,
  '42501', 'tenant_actor_mismatch', 'ator de outro tenant é negado');

-- 6. Mesma chave em outro tenant é operação independente.
select is(
  (select public.process_sync_command(
     '20000000-0000-0000-0000-0000000000a2', 'chave-idempotente-1', '10000000-0000-0000-0000-0000000000a2',
     'harness.synthetic', repeat('a', 64))->>'status'),
  'created', 'a mesma chave em outro tenant é independente');

-- 7. Entrada inválida é rejeitada.
select throws_ok(
  $$ select public.process_sync_command(
       '20000000-0000-0000-0000-0000000000a1', 'curta', '10000000-0000-0000-0000-0000000000a1',
       'harness.synthetic', repeat('a', 64)) $$,
  '22023', 'invalid_sync_command', 'chave curta é rejeitada');

-- 8. Execução exclusiva do service_role.
select ok(
  not has_function_privilege('authenticated', 'public.process_sync_command(uuid,text,uuid,text,text)', 'execute')
  and has_function_privilege('service_role', 'public.process_sync_command(uuid,text,uuid,text,text)', 'execute'),
  'somente service_role executa a RPC');

select * from finish();
rollback;
