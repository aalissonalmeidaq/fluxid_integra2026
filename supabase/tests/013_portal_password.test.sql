begin;
select plan(9);

-- Spec 013, US4 (T057; RF-016, MS-006; História 4; research.md, item 9): o Master consulta a senha padrão da rede de configuração, com
-- justificativa e auditoria; ninguém mais a vê, e o sistema não a troca. A senha de teste é gravada no Vault dentro desta transação.
-- Hermético: rollback.

delete from public.user_sessions where user_id in ('10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002');
select public.start_user_session('10000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000139001', 'aal2');
select public.start_user_session('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000001390a2', 'aal1');

create function pg_temp.reveal(p_req text, p_note text, p_actor text default '10000000-0000-0000-0000-000000000001',
  p_session text default '60000000-0000-0000-0000-000000139001') returns jsonb language sql as $$
  select public.reveal_portal_password(p_actor::uuid, p_session::uuid, p_req::uuid, p_note)
$$;

delete from vault.secrets where name = 'seal_portal_password';
select is(pg_temp.reveal('a13d1000-0000-0000-0000-000000000001', 'Instalação no depósito')->>'code', 'NOT_CONFIGURED',
  'sem o segredo no Vault: NOT_CONFIGURED');

select vault.create_secret('senha-portal-de-teste', 'seal_portal_password', 'Spec 013: senha da rede de configuração (teste)');
select is(pg_temp.reveal('a13d1000-0000-0000-0000-000000000002', 'abc')->>'code', 'JUSTIFICATION_REQUIRED', 'revelar exige justificativa de 5 a 500');
select is(pg_temp.reveal('a13d1000-0000-0000-0000-000000000003', 'Instalação no depósito'),
  '{"code": "REVEALED", "password": "senha-portal-de-teste"}'::jsonb, 'o Master vê a senha padrão');
select is((select count(*)::int from public.audit_logs where action = 'seal.portal_password_reveal' and organization_id is null
  and actor_user_id = '10000000-0000-0000-0000-000000000001' and justification = 'Instalação no depósito'), 1,
  'cada consulta fica na auditoria da plataforma, com o motivo');
select ok(not exists (select 1 from public.audit_logs where action = 'seal.portal_password_reveal'
  and (metadata::text like '%senha-portal-de-teste%' or coalesce(justification, '') like '%senha-portal-de-teste%')), 'a auditoria nunca guarda a senha');
select is(pg_temp.reveal('a13d1000-0000-0000-0000-000000000003', 'Instalação no depósito')->>'replayed', 'true',
  'o mesmo request_id não gera outra consulta');
select is((select count(*)::int from public.audit_logs where action = 'seal.portal_password_reveal'), 1, 'e não duplica a auditoria');
select is(pg_temp.reveal('a13d1000-0000-0000-0000-000000000004', 'Tentativa sem permissão', '10000000-0000-0000-0000-000000000002',
  '60000000-0000-0000-0000-0000001390a2')->>'code', 'ACCESS_DENIED', 'quem não é Master não vê a senha');
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname ~ '(set|change|update|rotate)_portal_password'), 0, 'não existe função para trocar a senha');

select * from finish();
rollback;
