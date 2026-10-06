begin;
select plan(13);

-- HermÃ©tico: sÃ³ as sessÃµes desta suÃ­te (desfeito pelo rollback).
delete from public.user_sessions where user_id in (
  '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000003');
select public.start_user_session('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000e0a0a', 'aal1');
select public.start_user_session('10000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-0000000e0b0b', 'aal1');

-- Papel personalizado com permissÃ£o em cada tenant.
insert into public.roles (id, organization_id, code, name, scope, system) values
  ('50000000-0000-0000-0000-0000000000f1', '20000000-0000-0000-0000-00000000000a', 'rls_a', 'Papel RLS A', 'tenant', false),
  ('50000000-0000-0000-0000-0000000000f2', '20000000-0000-0000-0000-00000000000b', 'rls_b', 'Papel RLS B', 'tenant', false);
insert into public.role_permissions (role_id, permission_id)
  select r.id, p.id from public.roles r cross join public.permissions p
   where r.id in ('50000000-0000-0000-0000-0000000000f1', '50000000-0000-0000-0000-0000000000f2') and p.code = 'audit.read';

create function public.tap_act_as(uid uuid, sid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated', 'session_id', sid, 'aal', 'aal1')::text, true);
end;
$$;
grant execute on function public.tap_act_as(uuid, uuid) to authenticated, anon;

set local role authenticated;
select public.tap_act_as('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000e0a0a');

-- Tenant A: permitido no prÃ³prio tenant, bloqueado no Tenant B.
select is((select count(*)::int from public.role_permissions where role_id = '50000000-0000-0000-0000-0000000000f1'), 1, 'A lÃª as permissÃµes do prÃ³prio papel personalizado');
select is((select count(*)::int from public.role_permissions where role_id = '50000000-0000-0000-0000-000000000003'), 9, 'A lÃª as permissÃµes do papel administrativo do prÃ³prio tenant');
select is((select count(*)::int from public.role_permissions where role_id = '50000000-0000-0000-0000-0000000000f2'), 0, 'A nÃ£o lÃª permissÃµes de papÃ©is do Tenant B');
select is((select count(*)::int from public.roles where id = '50000000-0000-0000-0000-0000000000f2'), 0, 'A nÃ£o lÃª papÃ©is do Tenant B');
select ok((select count(*)::int from public.role_permissions rp join public.roles r on r.id = rp.role_id where r.organization_id = '20000000-0000-0000-0000-00000000000b') = 0, 'nenhuma permissÃ£o de papel do Tenant B Ã© visÃ­vel a A');

-- Escrita direta: sem grants de mutaÃ§Ã£o nas tabelas de RBAC, nem no prÃ³prio tenant.
select throws_ok($$ insert into public.role_permissions (role_id, permission_id) select '50000000-0000-0000-0000-0000000000f1', id from public.permissions where code = 'profile.read' $$, '42501', null, 'A nÃ£o concede permissÃ£o por escrita direta');
select throws_ok($$ delete from public.role_permissions where role_id = '50000000-0000-0000-0000-0000000000f1' $$, '42501', null, 'A nÃ£o remove permissÃ£o por escrita direta');
select throws_ok($$ insert into public.membership_roles (membership_id, role_id, assigned_by) values ('30000000-0000-0000-0000-00000000000a', '50000000-0000-0000-0000-0000000000f1', '10000000-0000-0000-0000-000000000002') $$, '42501', null, 'A nÃ£o atribui papel por escrita direta');
select throws_ok($$ update public.roles set name = 'InvasÃ£o' where id = '50000000-0000-0000-0000-0000000000f2' $$, '42501', null, 'A nÃ£o altera papÃ©is por escrita direta');

-- Tenant B: o mesmo isolamento no sentido inverso.
select public.tap_act_as('10000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-0000000e0b0b');
select is((select count(*)::int from public.role_permissions where role_id = '50000000-0000-0000-0000-0000000000f2'), 1, 'B lÃª as permissÃµes do prÃ³prio papel personalizado');
select is((select count(*)::int from public.role_permissions where role_id = '50000000-0000-0000-0000-0000000000f1'), 0, 'B nÃ£o lÃª permissÃµes de papÃ©is do Tenant A');
select is((select count(*)::int from public.role_permissions where role_id = '50000000-0000-0000-0000-000000000003'), 0, 'B nÃ£o lÃª permissÃµes do papel administrativo do Tenant A');

-- SessÃ£o revogada perde a leitura imediatamente.
reset role;
select public.end_user_session('10000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-0000000e0b0b', 'user_revoked');
set local role authenticated;
select public.tap_act_as('10000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-0000000e0b0b');
select is((select count(*)::int from public.role_permissions), 0, 'sessÃ£o revogada nÃ£o lÃª permissÃµes');

reset role;
select * from finish();
rollback;
