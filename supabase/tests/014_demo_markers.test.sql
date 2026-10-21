begin;
select plan(25);

-- Spec 014 (RN-004; data-model.md): o banco reconhece o tenant e as contas de demonstração por duas tabelas privadas, sem acesso do
-- cliente. Hermético: começa sem marcas (o seed da demonstração pode já tê-las gravado) e termina em rollback.

delete from private.demo_accounts;
delete from private.demo_tenant;
insert into public.organizations (id, kind, legal_name, display_name, status)
  values ('5478e9e3-155b-482f-b843-3513e0938dd6', 'tenant', 'Oxigenio Cariri', 'Oxigênio Cariri', 'inactive')
  on conflict (id) do nothing;

select has_table('private', 'demo_tenant', 'private.demo_tenant existe');
select has_table('private', 'demo_accounts', 'private.demo_accounts existe');

-- Um só tenant de demonstração, e só organização do tipo tenant.
select lives_ok($$insert into private.demo_tenant (organization_id) values ('5478e9e3-155b-482f-b843-3513e0938dd6')$$,
  'o Oxigênio Cariri é marcado como tenant da demonstração');
select throws_ok($$insert into private.demo_tenant (organization_id) values ('20000000-0000-0000-0000-00000000000b')$$,
  '23505', null, 'uma segunda linha é recusada');
delete from private.demo_tenant;
select throws_ok($$insert into private.demo_tenant (organization_id) values ('20000000-0000-0000-0000-000000000001')$$,
  '23514', 'demo_tenant_not_tenant', 'a organização proprietária não pode ser a demonstração');
insert into private.demo_tenant (organization_id) values ('5478e9e3-155b-482f-b843-3513e0938dd6');

-- Contas: e-mail único e em minúsculas, papel só dos 5 de tenant, sem chave estrangeira para auth.users.
select lives_ok($$insert into private.demo_accounts (user_id, email, published_password, role_code)
  values ('0d140000-0000-4000-8000-0000000000f1', 'tenant_admin@demo.fluxid.invalid', 'FluxID-Demo-01!', 'tenant_admin')$$,
  'a conta é gravada antes do usuário existir no Auth');
select throws_ok($$insert into private.demo_accounts (user_id, email, published_password, role_code)
  values ('0d140000-0000-4000-8000-0000000000f2', 'tenant_admin@demo.fluxid.invalid', 'FluxID-Demo-02!', 'stock_operator')$$,
  '23505', null, 'e-mail repetido é recusado');
select throws_ok($$insert into private.demo_accounts (user_id, email, published_password, role_code)
  values ('0d140000-0000-4000-8000-0000000000f3', 'Driver@demo.fluxid.invalid', 'FluxID-Demo-05!', 'driver')$$,
  '23514', null, 'e-mail com maiúsculas é recusado');
select throws_ok($$insert into private.demo_accounts (user_id, email, published_password, role_code)
  values ('0d140000-0000-4000-8000-0000000000f4', 'master@demo.fluxid.invalid', 'FluxID-Demo-06!', 'master_fluxid')$$,
  '23514', null, 'papel global é recusado');
select throws_ok($$insert into private.demo_accounts (user_id, email, published_password, role_code)
  values ('0d140000-0000-4000-8000-0000000000f5', 'logistics@demo.fluxid.invalid', 'FluxID-Demo-07!', 'logistics_manager')$$,
  '23514', null, 'papel de tenant fora dos 5 da demonstração é recusado');
select is((select count(*)::int from information_schema.table_constraints
  where table_schema = 'private' and table_name = 'demo_accounts' and constraint_type = 'FOREIGN KEY'), 0,
  'private.demo_accounts não tem chave estrangeira');

-- As três funções respondem certo e falso para o Tenant A.
select ok(private.is_demo_tenant('5478e9e3-155b-482f-b843-3513e0938dd6'), 'is_demo_tenant: o Oxigênio Cariri é');
select ok(not private.is_demo_tenant('20000000-0000-0000-0000-00000000000a'), 'is_demo_tenant: o Tenant A não é');
select ok(private.is_demo_account('0d140000-0000-4000-8000-0000000000f1'), 'is_demo_account: a conta marcada é');
select ok(not private.is_demo_account('10000000-0000-0000-0000-000000000002'), 'is_demo_account: o administrador do Tenant A não é');
select ok(private.is_demo_email('  TENANT_ADMIN@demo.fluxid.invalid '), 'is_demo_email ignora caixa e espaços');
select ok(not private.is_demo_email('admin-a@example.invalid'), 'is_demo_email: o e-mail do Tenant A não é');

-- O cliente não lê as marcas nem consulta o e-mail; só o servidor (service_role) consulta.
select ok(not has_table_privilege('anon', 'private.demo_tenant', 'select') and not has_table_privilege('authenticated', 'private.demo_tenant', 'select'),
  'anon e authenticated não leem private.demo_tenant');
select ok(not has_table_privilege('anon', 'private.demo_accounts', 'select') and not has_table_privilege('authenticated', 'private.demo_accounts', 'select'),
  'anon e authenticated não leem private.demo_accounts');
select ok(not has_function_privilege('authenticated', 'public.is_demo_email(text)', 'execute')
  and not has_function_privilege('anon', 'public.is_demo_email(text)', 'execute'), 'o cliente não consulta se um e-mail é de demonstração');
select ok(has_function_privilege('service_role', 'public.is_demo_email(text)', 'execute'), 'a função de recuperação de senha consulta');
select ok(public.is_demo_email('driver@demo.fluxid.invalid') = false and public.is_demo_email('tenant_admin@demo.fluxid.invalid'),
  'public.is_demo_email repete a resposta da função privada');

-- A conta compartilhada aceita mais de três sessões simultâneas, mas conserva o timebox comum.
insert into auth.users (id, aud, role, email)
  values ('0d140000-0000-4000-8000-0000000000f6', 'authenticated', 'authenticated', 'unlimited@demo.fluxid.invalid');
insert into private.demo_accounts (user_id, email, published_password, role_code)
  values ('0d140000-0000-4000-8000-0000000000f6', 'unlimited@demo.fluxid.invalid', 'FluxID-Demo-08!', 'tenant_admin');
select public.start_user_session('0d140000-0000-4000-8000-0000000000f6', '0d140001-0000-4000-8000-000000000001', 'aal1');
select public.start_user_session('0d140000-0000-4000-8000-0000000000f6', '0d140001-0000-4000-8000-000000000002', 'aal1');
select public.start_user_session('0d140000-0000-4000-8000-0000000000f6', '0d140001-0000-4000-8000-000000000003', 'aal1');
select is(public.start_user_session('0d140000-0000-4000-8000-0000000000f6', '0d140001-0000-4000-8000-000000000004', 'aal1')->>'status',
  'started', 'a quarta sessão simultânea da conta demo é aceita');
select is((select count(*)::int from public.user_sessions where user_id = '0d140000-0000-4000-8000-0000000000f6' and status = 'active' and kind = 'interactive'),
  4, 'as quatro sessões demo permanecem ativas');
select ok((select bool_and(expires_at <= started_at + interval '8 hours') from public.user_sessions
  where user_id = '0d140000-0000-4000-8000-0000000000f6' and status = 'active' and kind = 'interactive'),
  'a exceção não remove o timebox das sessões demo');

select * from finish();
rollback;
