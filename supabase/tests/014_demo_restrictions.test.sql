begin;
select plan(19);

-- Spec 014 (RF-016; research.md, itens 4 e 5): no tenant da demonstração, convites e "Devolver à plataforma" respondem
-- DEMO_RESTRICTED, com a negação auditada; a senha de uma conta de demonstração só aceita a senha publicada. Nada disso muda para o
-- Tenant A e o Tenant B. Hermético: rollback.

delete from public.user_sessions where user_id in ('0d140000-0000-4000-8000-000000000001', '10000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000002');
select public.start_user_session('0d140000-0000-4000-8000-000000000001', '61420000-0000-4000-8000-000000000001', 'aal1');
select public.start_user_session('10000000-0000-0000-0000-000000000001', '61420000-0000-4000-8000-0000000000f1', 'aal1');
select public.start_user_session('10000000-0000-0000-0000-000000000002', '61420000-0000-4000-8000-0000000000a2', 'aal1');

create function pg_temp.demo_admin_invite(p_email text) returns jsonb language sql as $$
  select public.reserve_tenant_invitation('0d140000-0000-4000-8000-000000000001', '61420000-0000-4000-8000-000000000001',
    '5478e9e3-155b-482f-b843-3513e0938dd6', p_email,
    (select id from public.roles where organization_id = '5478e9e3-155b-482f-b843-3513e0938dd6' and code = 'stock_operator'),
    'Convite feito por um visitante da demonstração', false) $$;

-- (a) Convites.
select is(pg_temp.demo_admin_invite('alguem@empresa.com.br')->>'kind', 'demo_restricted', 'convite no tenant da demonstração: demo_restricted');
select is((select count(*)::int from public.invitations where organization_id = '5478e9e3-155b-482f-b843-3513e0938dd6'), 0, 'nenhum convite é reservado');
select is((select count(*)::int from public.audit_logs where action = 'invitation.reserve' and result = 'denied' and reason_code = 'demo_restricted'
  and organization_id = '5478e9e3-155b-482f-b843-3513e0938dd6' and actor_user_id = '0d140000-0000-4000-8000-000000000001'), 1, 'a negação do convite fica auditada');
select is(public.reserve_tenant_invitation('10000000-0000-0000-0000-000000000002', '61420000-0000-4000-8000-0000000000a2',
  '20000000-0000-0000-0000-00000000000a', 'convidado-014@example.invalid', '50000000-0000-0000-0000-000000000005',
  'Convite normal do Tenant A', false)->>'kind', 'reserved', 'o Tenant A continua convidando');
select throws_ok($$select public.invite_first_tenant_admin('10000000-0000-0000-0000-000000000001', '61420000-0000-4000-8000-0000000000f1',
  '5478e9e3-155b-482f-b843-3513e0938dd6', 'primeiro-admin@empresa.com.br', 'Primeiro administrador da demonstração')$$,
  '42501', 'DEMO_RESTRICTED', 'o Master não convida o primeiro administrador no tenant da demonstração');
select lives_ok($$select public.invite_first_tenant_admin('10000000-0000-0000-0000-000000000001', '61420000-0000-4000-8000-0000000000f1',
  '20000000-0000-0000-0000-00000000000b', 'primeiro-admin-b@example.invalid', 'Primeiro administrador do Tenant B')$$, 'o Master continua convidando no Tenant B');

-- (d) Devolver o lacre de bancada à plataforma.
insert into public.seal_devices (id, organization_id, device_code, label, key_hash, created_by, approved_at, approved_by) values
  ('d0142000-0000-4000-8000-0000000000d1', '5478e9e3-155b-482f-b843-3513e0938dd6', 'DSP-DEMO1401', 'Lacre de bancada',
   extensions.digest('fxk_d', 'sha256'), '10000000-0000-0000-0000-000000000001', now(), '10000000-0000-0000-0000-000000000001');
select is(public.return_device('0d140000-0000-4000-8000-000000000001', '61420000-0000-4000-8000-000000000001', '5478e9e3-155b-482f-b843-3513e0938dd6',
  'd0142000-0000-4000-8000-000000000001', 'd0142000-0000-4000-8000-0000000000d1', 'Visitante tentando devolver')->>'code', 'DEMO_RESTRICTED',
  'devolver o lacre no tenant da demonstração: DEMO_RESTRICTED');
select ok((select status = 'active' from public.seal_devices where id = 'd0142000-0000-4000-8000-0000000000d1'), 'o lacre continua ativo no tenant');
select is((select count(*)::int from public.audit_logs where action = 'seal.device_return' and result = 'denied' and reason_code = 'demo_restricted'
  and organization_id = '5478e9e3-155b-482f-b843-3513e0938dd6'), 1, 'a negação da devolução fica auditada');
select is(public.return_device('0d140000-0000-4000-8000-000000000001', '61420000-0000-4000-8000-000000000001', '20000000-0000-0000-0000-00000000000a',
  'd0142000-0000-4000-8000-000000000002', 'd0142000-0000-4000-8000-0000000000d1', 'Pedido pelo Tenant A')->>'code', 'ACCESS_DENIED',
  'a restrição não abre caminho para outro tenant');

-- (b) Senha: só a publicada. A recusa aborta a escrita do Auth, então não grava audit_logs.
create temporary table auditoria_antes as select count(*) as total from public.audit_logs;
select throws_ok($$update auth.users set encrypted_password = extensions.crypt('Outra-Senha-123!', extensions.gen_salt('bf'))
  where id = '0d140000-0000-4000-8000-000000000001'$$, '42501', 'demo_password_locked', 'outra senha para conta de demonstração é recusada');
select is((select count(*) from public.audit_logs) - (select total from auditoria_antes), 0::bigint, 'a recusa da troca de senha não grava audit_logs');
select lives_ok($$update auth.users set encrypted_password = extensions.crypt('FluxID-Demo-01!', extensions.gen_salt('bf'))
  where id = '0d140000-0000-4000-8000-000000000001'$$, 'a senha publicada é aceita (o script grava sempre a publicada)');
select lives_ok($$update auth.users set last_sign_in_at = now() where id = '0d140000-0000-4000-8000-000000000001'$$,
  'atualizar outras colunas da conta de demonstração continua permitido');
-- A senha publicada mudou no manifesto (a fase markers grava antes do Auth): o gatilho passa a aceitar só a nova.
update private.demo_accounts set published_password = 'FluxID-Demo-91!' where user_id = '0d140000-0000-4000-8000-000000000001';
select throws_ok($$update auth.users set encrypted_password = extensions.crypt('FluxID-Demo-01!', extensions.gen_salt('bf'))
  where id = '0d140000-0000-4000-8000-000000000001'$$, '42501', 'demo_password_locked', 'a senha publicada antiga passa a ser recusada');
select lives_ok($$update auth.users set encrypted_password = extensions.crypt('FluxID-Demo-91!', extensions.gen_salt('bf'))
  where id = '0d140000-0000-4000-8000-000000000001'$$, 'e a nova é aceita');
select lives_ok($$update auth.users set encrypted_password = extensions.crypt('Nova-Senha-Forte-123!', extensions.gen_salt('bf'))
  where id = '10000000-0000-0000-0000-000000000002'$$, 'o Tenant A troca a senha normalmente');

select has_trigger('auth', 'users', 'demo_password_guard', 'o gatilho demo_password_guard existe em auth.users');
select ok(not has_function_privilege('authenticated', 'private.demo_password_guard()', 'execute'), 'o cliente não executa a função do gatilho');

select * from finish();
rollback;
