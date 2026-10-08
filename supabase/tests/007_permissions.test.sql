begin;
select plan(16);

-- Spec 007: 20 permissões novas e o mapeamento dos papéis padrão (RF-049, contracts/permissoes-e-papeis.md).

create function pg_temp.codes(p_role text) returns text[] language sql stable as $$
  select coalesce(array_agg(p.code order by p.code), '{}')
    from public.roles r
    join public.role_permissions rp on rp.role_id = r.id
    join public.permissions p on p.id = rp.permission_id
   where r.organization_id = '20000000-0000-0000-0000-00000000000a' and r.code = p_role
     and p.code ~ '^(customer|geofence|vehicle|driver)\.'
$$;

select is((select count(*)::int from public.permissions where code ~ '^(customer|geofence|vehicle|driver)\.'), 20,
  'existem 20 permissões da Fase 3');
select is((select count(*)::int from public.permissions
            where code ~ '^(customer|geofence|vehicle|driver)\.' and scope = 'tenant' and delegability = 'tenant_delegable' and active), 20,
  'todas são de escopo tenant, delegáveis e ativas');
select is((select array_agg(code order by code) from public.permissions where critical and code ~ '^(customer|geofence|vehicle|driver)\.'),
  array['customer.anonymize', 'driver.anonymize'], 'só as duas permissões de anonimização são críticas');

select is(array_length(pg_temp.codes('tenant_admin'), 1), 20, 'o administrador do tenant tem as 20');
select is(pg_temp.codes('stock_operator'),
  array['customer.read', 'driver.read', 'geofence.read', 'vehicle.read'], 'operador de estoque: só leitura das quatro áreas');
select is(pg_temp.codes('technical_operator'), array['customer.read', 'vehicle.read'], 'operador técnico: clientes e veículos');
select is(pg_temp.codes('tenant_auditor'),
  array['customer.history', 'customer.read', 'driver.history', 'driver.read', 'geofence.history', 'geofence.read',
        'vehicle.history', 'vehicle.read'], 'auditor: leitura e histórico das quatro áreas');
select ok(not exists (select 1 from unnest(pg_temp.codes('tenant_auditor')) c where c ~ '\.(document|anonymize)$'),
  'o auditor não tem permissões de documento nem de anonimização');
select is(pg_temp.codes('driver'), '{}'::text[], 'o papel motorista não recebe nenhuma permissão da Fase 3');
select ok(not exists (select 1 from unnest(pg_temp.codes('stock_operator') || pg_temp.codes('technical_operator')) c
                       where c ~ '\.(write|deactivate|history|document|anonymize)$'),
  'operadores não escrevem, inativam, veem histórico, documentos nem anonimizam');

select is((select count(*)::int from public.role_permissions rp
            join public.roles r on r.id = rp.role_id and r.code = 'master_fluxid' and r.organization_id is null
            join public.permissions p on p.id = rp.permission_id
           where p.code ~ '^(customer|geofence|vehicle|driver)\.'), 20, 'o papel master tem as 20 permissões');

-- Nenhum papel perdeu permissão de cilindros.
select is((select count(*)::int from public.role_permissions rp join public.roles r on r.id = rp.role_id
            join public.permissions p on p.id = rp.permission_id
           where r.organization_id = '20000000-0000-0000-0000-00000000000a' and r.code = 'tenant_admin' and p.code like 'cylinder.%'), 7,
  'o administrador manteve as 7 permissões de cilindros');
select ok(exists (select 1 from public.role_permissions rp join public.roles r on r.id = rp.role_id
                   join public.permissions p on p.id = rp.permission_id
                  where r.organization_id = '20000000-0000-0000-0000-00000000000a' and r.code = 'tenant_admin' and p.code = 'tenant.manage'),
  'o administrador manteve tenant.manage');

-- Idempotência: reaplicar o bootstrap não duplica nem remove concessões.
create temp table before_counts as select count(*) as n from public.role_permissions;
select private.bootstrap_tenant_roles('20000000-0000-0000-0000-00000000000a');
select is((select count(*) from public.role_permissions), (select n from before_counts), 'bootstrap_tenant_roles é idempotente');

-- Organização nova recebe o mapeamento padrão.
insert into public.organizations (id, kind, legal_name, display_name, status)
  values ('20000000-0000-0000-0000-0000000007aa', 'tenant', 'Tenant Novo 007 Ltda', 'Tenant Novo 007', 'active');
select private.bootstrap_tenant_roles('20000000-0000-0000-0000-0000000007aa');
select is((select count(*)::int from public.role_permissions rp join public.roles r on r.id = rp.role_id
            join public.permissions p on p.id = rp.permission_id
           where r.organization_id = '20000000-0000-0000-0000-0000000007aa' and r.code = 'tenant_admin'
             and p.code ~ '^(customer|geofence|vehicle|driver)\.'), 20, 'organização nova: administrador com as 20');
select is((select count(*)::int from public.role_permissions rp join public.roles r on r.id = rp.role_id
            join public.permissions p on p.id = rp.permission_id
           where r.organization_id = '20000000-0000-0000-0000-0000000007aa' and r.code = 'stock_operator'
             and p.code ~ '^(customer|geofence|vehicle|driver)\.'), 4, 'organização nova: operador de estoque com as 4');

select * from finish();
rollback;
