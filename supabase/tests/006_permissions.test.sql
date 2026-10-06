begin;
select plan(17);

-- Spec 006: permissões e papéis padrão de cilindros (RF-039, premissa 8).
create function pg_temp.codes(p_role uuid) returns text[] language sql as $$
  select coalesce(array(select p.code from public.role_permissions rp join public.permissions p on p.id = rp.permission_id
    where rp.role_id = p_role and p.code like 'cylinder.%' order by p.code), '{}')
$$;
create function pg_temp.role_of(p_org uuid, p_code text) returns uuid language sql as $$
  select id from public.roles where organization_id = p_org and code = p_code
$$;

select is((select count(*)::int from public.permissions where code like 'cylinder.%'), 7, 'existem 7 permissões de cilindros');
select is((select count(*)::int from public.permissions where code like 'cylinder.%' and scope = 'tenant' and delegability = 'tenant_delegable' and not critical and active), 7, 'todas de escopo tenant, delegáveis, não críticas e ativas');

select is(pg_temp.codes(pg_temp.role_of('20000000-0000-0000-0000-00000000000a', 'tenant_admin')),
  array['cylinder.deactivate','cylinder.history','cylinder.identifier','cylinder.read','cylinder.stock_in','cylinder.test','cylinder.write'],
  'administrador do tenant tem as 7 permissões');
select is(pg_temp.codes(pg_temp.role_of('20000000-0000-0000-0000-00000000000a', 'stock_operator')),
  array['cylinder.history','cylinder.read','cylinder.stock_in','cylinder.write'], 'operador de estoque: ver, cadastrar, entrada e histórico');
select is(pg_temp.codes(pg_temp.role_of('20000000-0000-0000-0000-00000000000a', 'technical_operator')),
  array['cylinder.history','cylinder.identifier','cylinder.read','cylinder.test'], 'operador técnico: ver, identificadores, teste e histórico');
select is(pg_temp.codes(pg_temp.role_of('20000000-0000-0000-0000-00000000000a', 'tenant_auditor')),
  array['cylinder.history','cylinder.read'], 'auditor: ver e histórico');
select is(pg_temp.codes(pg_temp.role_of('20000000-0000-0000-0000-00000000000a', 'driver')), '{}'::text[], 'motorista não recebe permissão de cilindro');
select ok((select r.system and r.active and r.scope = 'tenant' from public.roles r where r.id = pg_temp.role_of('20000000-0000-0000-0000-00000000000a', 'tenant_auditor')), 'tenant_auditor é papel de sistema ativo do tenant');
select is(pg_temp.codes(pg_temp.role_of('20000000-0000-0000-0000-00000000000b', 'tenant_auditor')), array['cylinder.history','cylinder.read'], 'o Tenant B recebe o mesmo auditor');

select is((select count(*)::int from public.roles r join public.role_permissions rp on rp.role_id = r.id join public.permissions p on p.id = rp.permission_id
  where r.code = 'admin_fluxid' and p.code like 'cylinder.%'), 0, 'o Administrador FluxID não recebe permissão de cilindros');
select is((select count(*)::int from public.roles r join public.role_permissions rp on rp.role_id = r.id join public.permissions p on p.id = rp.permission_id
  where r.code = 'master_fluxid' and p.code like 'cylinder.%'), 7, 'o Master mantém todas as permissões ativas (regra da Spec 002)');

-- Nenhum papel existente perde permissão.
select is((select array_agg(p.code order by p.code) from public.role_permissions rp join public.permissions p on p.id = rp.permission_id
  where rp.role_id = pg_temp.role_of('20000000-0000-0000-0000-00000000000a', 'tenant_admin') and p.code in ('tenant.manage','audit.read')),
  array['audit.read','tenant.manage'], 'o administrador do tenant mantém tenant.manage e audit.read');

-- Tenant criado depois recebe os papéis completos.
insert into public.organizations (id, kind, legal_name, display_name, status) values
  ('20000000-0000-0000-0000-0000000006e1', 'tenant', 'Tenant Novo Sintético', 'Tenant Novo', 'active');
select private.bootstrap_tenant_roles('20000000-0000-0000-0000-0000000006e1');
select is(pg_temp.codes(pg_temp.role_of('20000000-0000-0000-0000-0000000006e1', 'tenant_admin')),
  array['cylinder.deactivate','cylinder.history','cylinder.identifier','cylinder.read','cylinder.stock_in','cylinder.test','cylinder.write'], 'tenant novo: administrador completo');
select is(pg_temp.codes(pg_temp.role_of('20000000-0000-0000-0000-0000000006e1', 'stock_operator')),
  array['cylinder.history','cylinder.read','cylinder.stock_in','cylinder.write'], 'tenant novo: operador de estoque');
select is(pg_temp.codes(pg_temp.role_of('20000000-0000-0000-0000-0000000006e1', 'tenant_auditor')),
  array['cylinder.history','cylinder.read'], 'tenant novo: auditor');

-- Idempotente: rodar de novo não duplica nem falha.
select lives_ok($$ select private.bootstrap_tenant_roles('20000000-0000-0000-0000-0000000006e1') $$, 'o bootstrap é idempotente');
select is((select count(*)::int from public.roles where organization_id = '20000000-0000-0000-0000-0000000006e1'), 5, 'o tenant novo tem 5 papéis de sistema');

select * from finish(); rollback;
