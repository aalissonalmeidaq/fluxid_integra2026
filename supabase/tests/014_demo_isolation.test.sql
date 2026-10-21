begin;
select plan(24);

-- Spec 014 (RF-003, RF-012, MS-003; princípio III): os perfis de demonstração alcançam só o "Oxigênio Cariri". Dois tenants (a
-- demonstração do seed e o Tenant A) e o Master: o acesso permitido dentro e o bloqueado fora, por RLS e pelas RPCs. A negação por
-- permissão é auditada pela borda (manage-access, query-*), como para qualquer usuário; a suíte .live confere. Hermético: rollback.

create temporary table demo (role_code text, user_id uuid, session_id uuid);
insert into demo values
  ('tenant_admin', '0d140000-0000-4000-8000-000000000001', '61410000-0000-4000-8000-000000000001'),
  ('stock_operator', '0d140000-0000-4000-8000-000000000002', '61410000-0000-4000-8000-000000000002'),
  ('technical_operator', '0d140000-0000-4000-8000-000000000003', '61410000-0000-4000-8000-000000000003'),
  ('tenant_auditor', '0d140000-0000-4000-8000-000000000004', '61410000-0000-4000-8000-000000000004'),
  ('driver', '0d140000-0000-4000-8000-000000000005', '61410000-0000-4000-8000-000000000005');
grant select on demo to authenticated;
delete from public.user_sessions where user_id in (select user_id from demo) or user_id = '10000000-0000-0000-0000-000000000002';
select public.start_user_session(user_id, session_id, 'aal1') from demo;
select public.start_user_session('10000000-0000-0000-0000-000000000002', '61410000-0000-4000-8000-0000000000a2', 'aal1');

-- Um cilindro do Tenant A, para tentar alcançar de fora.
insert into public.cylinder_types (id, organization_id, gas, capacity_value, capacity_unit, classification) values
  ('d0141000-0000-4000-8000-00000000000a', '20000000-0000-0000-0000-00000000000a', 'Oxigênio', 10, 'l', 'medicinal');
insert into public.cylinders (id, organization_id, cylinder_type_id, serial_number) values
  ('d0141000-0000-4000-8000-0000000000c1', '20000000-0000-0000-0000-00000000000a', 'd0141000-0000-4000-8000-00000000000a', 'ISO-A-001');

create function pg_temp.act_as(p_user uuid, p_session uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated', 'session_id', p_session, 'aal', 'aal1')::text, true);
end $$;
grant execute on function pg_temp.act_as(uuid, uuid) to authenticated;
create function pg_temp.admin() returns uuid language sql as $$ select '0d140000-0000-4000-8000-000000000001'::uuid $$;
create function pg_temp.sess() returns uuid language sql as $$ select '61410000-0000-4000-8000-000000000001'::uuid $$;

-- Nenhum perfil de demonstração tem permissão global nem contexto de plataforma.
select is((select count(*)::int from demo d join public.memberships m on m.user_id = d.user_id
  join public.membership_roles mr on mr.membership_id = m.id join public.role_permissions rp on rp.role_id = mr.role_id
  join public.permissions p on p.id = rp.permission_id where p.scope = 'global'), 0, 'nenhuma permissão global nos perfis de demonstração');
select is((select count(*)::int from demo d join public.memberships m on m.user_id = d.user_id where m.organization_id <> '5478e9e3-155b-482f-b843-3513e0938dd6'),
  0, 'nenhum vínculo fora do Oxigênio Cariri');
select ok((select bool_and(not (public.global_actor_context(user_id, session_id)->>'can_manage_platform')::boolean
  and not (public.global_actor_context(user_id, session_id)->>'can_manage_master')::boolean) from demo), 'platform.manage e master negados aos 5');
select throws_ok($$select public.list_managed_organizations(pg_temp.admin(), pg_temp.sess())$$, '42501', null,
  'o administrador de demonstração não lista organizações da plataforma');

-- RLS: cada perfil vê só a própria organização e nenhum cilindro do Tenant A.
set local role authenticated;
select pg_temp.act_as(user_id, session_id) from demo where role_code = 'tenant_admin';
select is((select array_agg(id::text) from public.organizations), array['5478e9e3-155b-482f-b843-3513e0938dd6'], 'administrador: só o Oxigênio Cariri');
select is((select count(*)::int from public.cylinders where organization_id = '20000000-0000-0000-0000-00000000000a'), 0, 'administrador: nenhum cilindro do Tenant A');
select ok((select count(*) >= 1 from public.cylinders where organization_id = '5478e9e3-155b-482f-b843-3513e0938dd6'), 'administrador: lê o C262 do próprio tenant');
select is((select count(*)::int from public.memberships), 1, 'administrador: só o próprio vínculo pela tabela');
select pg_temp.act_as(user_id, session_id) from demo where role_code = 'stock_operator';
select is((select count(*)::int from public.cylinders where organization_id = '20000000-0000-0000-0000-00000000000a'), 0, 'estoquista: nenhum cilindro do Tenant A');
select is((select count(*)::int from public.organizations where id <> '5478e9e3-155b-482f-b843-3513e0938dd6'), 0, 'estoquista: nenhuma outra organização');
select pg_temp.act_as(user_id, session_id) from demo where role_code = 'technical_operator';
select is((select count(*)::int from public.cylinders where organization_id = '20000000-0000-0000-0000-00000000000a'), 0, 'técnico: nenhum cilindro do Tenant A');
select pg_temp.act_as(user_id, session_id) from demo where role_code = 'tenant_auditor';
select is((select count(*)::int from public.cylinders where organization_id = '20000000-0000-0000-0000-00000000000a'), 0, 'auditor: nenhum cilindro do Tenant A');
select is((select count(*)::int from public.audit_logs where organization_id is distinct from '5478e9e3-155b-482f-b843-3513e0938dd6'), 0,
  'auditor: nenhuma auditoria de fora');
select pg_temp.act_as(user_id, session_id) from demo where role_code = 'driver';
select is((select count(*)::int from public.cylinders), 0, 'motorista: nenhum cilindro');
select is((select count(*)::int from public.organizations where id <> '5478e9e3-155b-482f-b843-3513e0938dd6'), 0, 'motorista: nenhuma outra organização');
reset role;
select pg_temp.act_as('10000000-0000-0000-0000-000000000002', '61410000-0000-4000-8000-0000000000a2');
set local role authenticated;
select is((select count(*)::int from public.cylinders where organization_id = '5478e9e3-155b-482f-b843-3513e0938dd6'), 0, 'o Tenant A não vê o C262 da demonstração');
reset role;

-- RPCs: dentro, permitido; fora, negado.
select isnt(public.query_cylinders_list(pg_temp.admin(), pg_temp.sess(), '5478e9e3-155b-482f-b843-3513e0938dd6', 'C262', null, null, null, null, null, null, 20)->>'code',
  'ACCESS_DENIED', 'o administrador lista os cilindros do próprio tenant');
select is(public.query_cylinders_list(pg_temp.admin(), pg_temp.sess(), '20000000-0000-0000-0000-00000000000a', null, null, null, null, null, null, null, 20)->>'code',
  'ACCESS_DENIED', 'pedir a lista do Tenant A: acesso negado');
select is(public.inactivate_cylinder(pg_temp.admin(), pg_temp.sess(), '20000000-0000-0000-0000-00000000000a', 'd0141000-0000-4000-8000-0000000000c1', 'lost',
  'Tentativa de fora do tenant')->>'code', 'ACCESS_DENIED', 'alterar cilindro do Tenant A: acesso negado');
select is(public.inactivate_cylinder(pg_temp.admin(), pg_temp.sess(), '5478e9e3-155b-482f-b843-3513e0938dd6', 'd0141000-0000-4000-8000-0000000000c1', 'lost',
  'Tentativa pelo próprio tenant')->>'code', 'NOT_FOUND', 'o cilindro do Tenant A pelo tenant da demonstração: inexistente');

-- O administrador de demonstração não cria nem dá papel ou permissão global.
select is(public.save_tenant_role(pg_temp.admin(), pg_temp.sess(), '5478e9e3-155b-482f-b843-3513e0938dd6', null, 'Papel global', '',
  array(select code from public.permissions where scope = 'global' and active), null, 'Tentativa de criar papel com permissão global')->>'kind',
  'not_delegable', 'save_tenant_role com permissão global é recusado');
select is(public.change_tenant_role_assignment(pg_temp.admin(), pg_temp.sess(), '5478e9e3-155b-482f-b843-3513e0938dd6',
  '0d140000-0000-4000-8000-000000000105', (select id from public.roles where code = 'master_fluxid' and organization_id is null), true,
  'Tentativa de dar o papel Master')->>'kind', 'unavailable', 'dar o papel Master por change_tenant_role_assignment é recusado');
select is(public.change_tenant_role_assignment(pg_temp.admin(), pg_temp.sess(), '20000000-0000-0000-0000-00000000000a',
  '30000000-0000-0000-0000-00000000000a', '50000000-0000-0000-0000-000000000003', false, 'Tentativa sobre o Tenant A')->>'kind',
  'access_denied', 'mexer em papel do Tenant A é recusado');
select is((select count(*)::int from demo d join public.memberships m on m.user_id = d.user_id
  join public.membership_roles mr on mr.membership_id = m.id join public.roles r on r.id = mr.role_id where r.scope = 'global'), 0,
  'as tentativas não deixam papel global em nenhum perfil de demonstração');

select * from finish();
rollback;
