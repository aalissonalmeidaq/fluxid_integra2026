begin;
select plan(13);

-- Spec 012: catálogo de permissões e papéis padrão do lacre (RF-038; contracts/permissoes-e-papeis.md). As asserções por RPC
-- entram nos testes de cada história.

select is((select count(*)::int from public.permissions where code in ('seal.read', 'seal.operate', 'seal.admin')
  and scope = 'tenant' and delegability = 'tenant_delegable'), 3, 'seal.read, seal.operate e seal.admin existem no escopo do tenant');
select is((select string_agg(code, ',' order by code) from public.permissions where code like 'seal.%' and critical), 'seal.admin',
  'só seal.admin é crítica');

create function pg_temp.seal_perms(p_org uuid, p_role text) returns text language sql as $$
  select coalesce(string_agg(p.code, ',' order by p.code), '')
    from public.roles r join public.role_permissions rp on rp.role_id = r.id join public.permissions p on p.id = rp.permission_id
   where r.organization_id = p_org and r.code = p_role and p.code like 'seal.%'
$$;

select is(pg_temp.seal_perms('20000000-0000-0000-0000-00000000000a', 'tenant_admin'), 'seal.admin,seal.operate,seal.read', 'administrador do tenant: todas');
select is(pg_temp.seal_perms('20000000-0000-0000-0000-00000000000a', 'logistics_manager'), 'seal.operate,seal.read', 'gestor logístico: ver e operar');
select is(pg_temp.seal_perms('20000000-0000-0000-0000-00000000000a', 'stock_operator'), 'seal.operate,seal.read', 'operador de estoque: ver e operar');
select is(pg_temp.seal_perms('20000000-0000-0000-0000-00000000000a', 'tenant_auditor'), 'seal.read', 'auditor: só ver');
select is(pg_temp.seal_perms('20000000-0000-0000-0000-00000000000a', 'technical_operator') || pg_temp.seal_perms('20000000-0000-0000-0000-00000000000a', 'driver'),
  '', 'operador técnico e motorista: nenhuma');
select is(pg_temp.seal_perms('20000000-0000-0000-0000-00000000000b', 'tenant_admin'), 'seal.admin,seal.operate,seal.read', 'organizações existentes recebem o mapeamento');

-- Nenhum papel perdeu permissão das specs anteriores: o gestor logístico continua com as 12 da Spec 008.
select is((select count(*)::int from public.roles r join public.role_permissions rp on rp.role_id = r.id join public.permissions p on p.id = rp.permission_id
  where r.organization_id = '20000000-0000-0000-0000-00000000000a' and r.code = 'logistics_manager' and p.code not like 'seal.%'), 12,
  'gestor logístico mantém as permissões da Spec 008');

-- Destravamento excepcional (US3; RF-025, RN-005): pela tela, sempre com segundo fator e justificativa; auditoria sem a justificativa.
delete from public.user_sessions where user_id = '10000000-0000-0000-0000-000000000002';
select public.start_user_session('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000001205a2', 'aal1');
insert into public.cylinder_types (id, organization_id, gas, capacity_value, capacity_unit, classification) values
  ('a2170000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', 'Oxigênio', 10, 'l', 'medicinal');
insert into public.cylinders (id, organization_id, cylinder_type_id, serial_number) values
  ('a2180000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-00000000000a', 'a2170000-0000-0000-0000-00000000000a', 'EXC-A-001');
insert into public.seal_devices (id, organization_id, device_code, label, key_hash, created_by, lock_state) values
  ('a2100000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-00000000000a', 'DSP-EXCA0001', 'Lacre A', extensions.digest('k', 'sha256'), '10000000-0000-0000-0000-000000000002', 'locked_violation');
insert into public.seal_bindings (organization_id, device_id, cylinder_id, bound_by) values
  ('20000000-0000-0000-0000-00000000000a', 'a2100000-0000-0000-0000-0000000000a1', 'a2180000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-000000000002');

select is(public.request_unlock('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000001205a2', '20000000-0000-0000-0000-00000000000a',
  gen_random_uuid(), 'a2180000-0000-0000-0000-0000000000a1', 'Cliente conferiu o cilindro.')->>'code', 'MFA_REQUIRED', 'destravar sem segundo fator: MFA_REQUIRED');
update public.user_sessions set aal = 'aal2' where session_id = '60000000-0000-0000-0000-0000001205a2';
select is(public.request_unlock('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000001205a2', '20000000-0000-0000-0000-00000000000a',
  gen_random_uuid(), 'a2180000-0000-0000-0000-0000000000a1', 'Cliente conferiu o cilindro.')->>'code', 'REQUESTED', 'com segundo fator e justificativa: pedido');
select is((select origin || ':' || aal from public.seal_commands where device_id = 'a2100000-0000-0000-0000-0000000000a1' and kind = 'unlock'), 'exceptional:aal2',
  'origem excepcional, com o nível da sessão');
select ok((select count(*) = 1 and bool_and(metadata::text not like '%conferiu%' and metadata::text !~ '-7\.|-39\.') from public.audit_logs
  where action = 'seal.unlock_exceptional'), 'auditoria do destravamento excepcional sem justificativa nem coordenada');

select * from finish();
rollback;
