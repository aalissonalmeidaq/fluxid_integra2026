begin;
select plan(26);

-- Hermético: ignora sessões residuais de outras suítes no mesmo banco (desfeito pelo rollback).
delete from public.user_sessions where user_id in (
  '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000003');

-- Massa do seed: Tenant A (admin-a, tenant_admin com audit.read), Tenant B (admin-b, sem papéis), FluxID owner (master).
-- Cada usuário recebe uma sessão de governança ativa; as políticas vinculam o acesso a essa sessão.
select public.start_user_session('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-00000000a0a0', 'aal1');
select public.start_user_session('10000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-00000000b0b0', 'aal1');
select public.start_user_session('10000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-00000000c0c0', 'aal1');

insert into public.audit_logs (organization_id, action, target_type, result) values
  ('20000000-0000-0000-0000-00000000000a', 'auth.login', 'session', 'success'),
  ('20000000-0000-0000-0000-00000000000b', 'auth.login', 'session', 'success');

create function public.tap_act_as(uid uuid, sid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated', 'session_id', sid, 'aal', 'aal1')::text, true);
end;
$$;
grant execute on function public.tap_act_as(uuid, uuid) to authenticated, anon;

set local role authenticated;
select public.tap_act_as('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-00000000a0a0');

-- Tenant A: acesso permitido ao próprio contexto.
select is((select count(*)::int from public.organizations where id = '20000000-0000-0000-0000-00000000000a'), 1, 'A vê a organização A');
select is((select count(*)::int from public.memberships where user_id = '10000000-0000-0000-0000-000000000002'), 1, 'A vê o próprio vínculo');
select is((select count(*)::int from public.audit_logs where organization_id = '20000000-0000-0000-0000-00000000000a' and action = 'auth.login' and target_type = 'session'), 1, 'A com audit.read vê a auditoria de A');
select is((select count(*)::int from public.roles where organization_id = '20000000-0000-0000-0000-00000000000a' and system), 7 - 1, 'A vê os papéis preestabelecidos do próprio tenant');
select is((select count(*)::int from public.user_sessions), 1, 'A vê somente as próprias sessões');

-- Tenant A: acesso cruzado bloqueado.
select is((select count(*)::int from public.organizations where id = '20000000-0000-0000-0000-00000000000b'), 0, 'A não vê a organização B');
select is((select count(*)::int from public.memberships where organization_id = '20000000-0000-0000-0000-00000000000b'), 0, 'A não vê vínculos de B');
select is((select count(*)::int from public.audit_logs where organization_id = '20000000-0000-0000-0000-00000000000b'), 0, 'A não vê a auditoria de B');
select is((select count(*)::int from public.profiles where user_id = '10000000-0000-0000-0000-000000000003'), 0, 'A não vê o perfil de B');
select is((select count(*)::int from public.user_sessions where user_id = '10000000-0000-0000-0000-000000000003'), 0, 'A não vê sessões de B');

-- Escrita: sem grants de mutação em tabelas de identidade; perfil apenas do titular.
select throws_ok($$ update public.organizations set display_name = 'Adulterada' $$, '42501', null, 'A não altera organizações');
select throws_ok($$ delete from public.memberships $$, '42501', null, 'A não exclui vínculos');
select throws_ok($$ insert into public.audit_logs (action, target_type, result) values ('x', 'y', 'success') $$, '42501', null, 'A não escreve auditoria');
update public.profiles set display_name = 'Admin A Editado';
select is((select display_name from public.profiles where user_id = '10000000-0000-0000-0000-000000000002'), 'Admin A Editado', 'A altera o próprio perfil');
update public.profiles set display_name = 'Invasão' where user_id = '10000000-0000-0000-0000-000000000003';
reset role;
select is((select display_name from public.profiles where user_id = '10000000-0000-0000-0000-000000000003'), 'Administrador B', 'A não altera o perfil de B');
set local role authenticated;

-- Tenant B: o mesmo isolamento no sentido inverso e sem permissão de auditoria.
select public.tap_act_as('10000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-00000000b0b0');
select is((select count(*)::int from public.organizations where id = '20000000-0000-0000-0000-00000000000b'), 1, 'B vê a organização B');
select is((select count(*)::int from public.organizations where id = '20000000-0000-0000-0000-00000000000a'), 0, 'B não vê a organização A');
select is((select count(*)::int from public.audit_logs), 0, 'B sem audit.read não vê auditoria');

-- Master FluxID: enxerga a organização proprietária e não recebe tenants por acidente.
select public.tap_act_as('10000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-00000000c0c0');
select is((select count(*)::int from public.organizations where kind = 'owner'), 1, 'Master vê a organização proprietária');

-- Sessão: token sem sessão registrada, com sessão de outro usuário, encerrada ou inativa perde o acesso.
select public.tap_act_as('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000000f0');
select is((select count(*)::int from public.organizations), 0, 'sessão inexistente não acessa dados');
select public.tap_act_as('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-00000000b0b0');
select is((select count(*)::int from public.organizations), 0, 'sessão de outro usuário não acessa dados');

reset role;
select public.end_user_session('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-00000000a0a0', 'user_revoked');
set local role authenticated;
select public.tap_act_as('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-00000000a0a0');
select is((select count(*)::int from public.organizations), 0, 'sessão revogada perde o acesso imediatamente');
select is((select count(*)::int from public.profiles), 0, 'sessão revogada perde acesso ao perfil');

reset role;
update public.user_sessions set last_seen_at = now() - interval '31 minutes'
  where session_id = '60000000-0000-0000-0000-00000000b0b0';
set local role authenticated;
select public.tap_act_as('10000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-00000000b0b0');
select is((select count(*)::int from public.organizations), 0, 'sessão inativa por mais de 30 minutos perde o acesso');

-- anon não acessa nada.
reset role;
set local role anon;
select throws_ok($$ select * from public.organizations $$, '42501', null, 'anon não lê organizações');
select throws_ok($$ select * from public.audit_logs $$, '42501', null, 'anon não lê auditoria');

reset role;
select * from finish();
rollback;
