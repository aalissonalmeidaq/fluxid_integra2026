begin;
select plan(28);

-- Spec 007, US1: create_site e update_site (RF-005 a RF-007, RF-011, RF-031). Hermético: desfeito pelo rollback.
-- A unidade não depende do serviço de CEP: todos os campos de endereço são aceitos por digitação.

delete from public.user_sessions where user_id in (
  '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000003');
insert into public.membership_roles (membership_id, role_id, assigned_by)
  select '30000000-0000-0000-0000-00000000000b', r.id, '10000000-0000-0000-0000-000000000001'
    from public.roles r where r.organization_id = '20000000-0000-0000-0000-00000000000b' and r.code = 'tenant_admin';
insert into auth.users (id, aud, role, email) values ('10000000-0000-0000-0000-0000000007c1', 'authenticated', 'authenticated', 'reg-driver@example.invalid');
insert into public.profiles (user_id, display_name) values ('10000000-0000-0000-0000-0000000007c1', 'Motorista Cadastros');
insert into public.memberships (id, organization_id, user_id, status, activated_at) values
  ('30000000-0000-0000-0000-0000000007c1', '20000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-0000000007c1', 'active', now());
insert into public.membership_roles (membership_id, role_id, assigned_by)
  select '30000000-0000-0000-0000-0000000007c1', r.id, '10000000-0000-0000-0000-000000000001'
    from public.roles r where r.organization_id = '20000000-0000-0000-0000-00000000000a' and r.code = 'driver';
select public.start_user_session('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000700a2', 'aal1');
select public.start_user_session('10000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-0000000700b3', 'aal1');
select public.start_user_session('10000000-0000-0000-0000-0000000007c1', '60000000-0000-0000-0000-0000000700c1', 'aal1');

create temp table r (k text primary key, v jsonb);
grant all on r to public;

-- Dois clientes do Tenant A (um jurídico e um pessoa física) e um do Tenant B.
insert into r values
  ('cli', public.create_customer('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000700a2', '20000000-0000-0000-0000-00000000000a',
     'legal', '11222333000181', 'Hospital Alfa Ltda', null, 'hospital', null, null, '[]'::jsonb)),
  ('clipf', public.create_customer('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000700a2', '20000000-0000-0000-0000-00000000000a',
     'individual', '52998224725', 'Ana Lima', null, 'hospital', null, null, '[]'::jsonb)),
  ('clib', public.create_customer('10000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-0000000700b3', '20000000-0000-0000-0000-00000000000b',
     'legal', '11222333000262', 'Hospital Beta Ltda', null, 'hospital', null, null, '[]'::jsonb));

create function pg_temp.site_as_a(p_customer uuid, p_name text, p_postal text default '01001-000'::text, p_state text default 'SP', p_lat numeric default null, p_lng numeric default null,
  p_days smallint[] default null, p_from time default null, p_to time default null, p_access text default null, p_contact_name text default null)
returns jsonb language sql as $$
  select public.create_site('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000700a2', '20000000-0000-0000-0000-00000000000a',
    p_customer, p_name, regexp_replace(p_postal, '[^0-9]', '', 'g'), 'Praça da Sé', '100', null, 'Sé', 'São Paulo', p_state, '3550308', p_lat, p_lng,
    p_contact_name, null, p_days, p_from, p_to, p_access)
$$;

insert into r values
  ('s1', pg_temp.site_as_a((select (v->>'customer_id')::uuid from r where k = 'cli'), 'Unidade Central', p_lat => -23.55052, p_lng => -46.633308,
        p_days => array[1,2,3]::smallint[], p_from => '08:00', p_to => '17:00', p_contact_name => 'Responsável Recebimento')),
  ('spf', pg_temp.site_as_a((select (v->>'customer_id')::uuid from r where k = 'clipf'), 'Casa da Ana', p_access => 'Portão azul, tocar duas vezes'));

-- ---------- create_site
select is((select v->>'code' from r where k = 's1'), 'CREATED', 'unidade é criada com todos os campos digitados');
select is((select (v->>'version')::int from r where k = 's1'), 1, 'versão inicial 1');
select is((select receiving_days from public.customer_sites where id = (select (v->>'site_id')::uuid from r where k = 's1')), array[1,2,3]::smallint[], 'os dias de recebimento foram gravados');
select is((select receiving_from::text || '-' || receiving_to::text from public.customer_sites where id = (select (v->>'site_id')::uuid from r where k = 's1')), '08:00:00-17:00:00', 'a janela de recebimento foi gravada');
select is((select count(*)::int from public.registry_events where entity_type = 'site' and entity_id = (select (v->>'site_id')::uuid from r where k = 's1') and event_type = 'site_created'), 1, 'evento site_created');
select ok(exists (select 1 from public.audit_logs where action = 'site.create' and target_id = (select v->>'site_id' from r where k = 's1')), 'auditoria site.create gravada');
select is((select v->>'code' from r where k = 'spf'), 'CREATED', 'unidade de cliente pessoa física também é criada');
select ok(not exists (select 1 from public.registry_events e where e.entity_type = 'site' and e.data::text ~ '(Casa da Ana|Portão azul|Responsável Recebimento)'),
  'nenhum nome de unidade de pessoa física, instrução de acesso ou responsável nos eventos');

select is((select v->>'code' from (select pg_temp.site_as_a((select (v->>'customer_id')::uuid from r where k = 'cli'), '  UNIDADE central ') v) s), 'NAME_CONFLICT',
  'nome repetido no mesmo cliente (sem diferenciar caixa e espaços) é recusado');
select is((select v->>'code' from (select pg_temp.site_as_a((select (v->>'customer_id')::uuid from r where k = 'clipf'), 'Unidade Central') v) s), 'CREATED',
  'o mesmo nome em outro cliente é aceito');

-- ---------- validações
select ok((select v::text like '%postal_code%' from (select pg_temp.site_as_a((select (v->>'customer_id')::uuid from r where k = 'cli'), 'Unidade CEP', p_postal => '0100100') v) s), 'CEP com 7 dígitos é recusado');
select ok((select v::text like '%"state"%' from (select pg_temp.site_as_a((select (v->>'customer_id')::uuid from r where k = 'cli'), 'Unidade UF', p_state => 'XX') v) s), 'UF inválida é recusada');
select ok((select v::text like '%longitude%' from (select pg_temp.site_as_a((select (v->>'customer_id')::uuid from r where k = 'cli'), 'Unidade Lat', p_lat => -23.5) v) s), 'latitude sem longitude é recusada');
select ok((select v::text like '%latitude%' from (select pg_temp.site_as_a((select (v->>'customer_id')::uuid from r where k = 'cli'), 'Unidade Lat2', p_lat => 91, p_lng => 0) v) s), 'latitude fora do intervalo é recusada');
select ok((select v::text like '%receiving_days%' from (select pg_temp.site_as_a((select (v->>'customer_id')::uuid from r where k = 'cli'), 'Unidade Dia', p_days => array[7]::smallint[]) v) s), 'dia da semana fora de 0 a 6 é recusado');
select ok((select v::text like '%receiving_to%' from (select pg_temp.site_as_a((select (v->>'customer_id')::uuid from r where k = 'cli'), 'Unidade Hora', p_days => array[1]::smallint[], p_from => '10:00', p_to => '09:00') v) s), 'horário final antes do inicial é recusado');
select ok((select v::text like '%receiving_days%' from (select pg_temp.site_as_a((select (v->>'customer_id')::uuid from r where k = 'cli'), 'Unidade Janela', p_from => '08:00', p_to => '17:00') v) s), 'horário sem nenhum dia marcado é recusado');
select ok((select v::text like '%access_instructions%' from (select pg_temp.site_as_a((select (v->>'customer_id')::uuid from r where k = 'cli'), 'Unidade Acesso', p_access => repeat('x', 501)) v) s), 'instruções com mais de 500 caracteres são recusadas');

-- ---------- pai inativo, outro tenant e permissão
update public.customers set status = 'inactive', inactivated_at = now(), inactivated_by = '10000000-0000-0000-0000-000000000002'
 where id = (select (v->>'customer_id')::uuid from r where k = 'clipf');
select is((select v->>'code' from (select pg_temp.site_as_a((select (v->>'customer_id')::uuid from r where k = 'clipf'), 'Unidade Nova') v) s), 'PARENT_INACTIVE', 'não cria unidade sob cliente inativo');
select is((select public.create_site('10000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-0000000700b3', '20000000-0000-0000-0000-00000000000b',
  (select (v->>'customer_id')::uuid from r where k = 'cli'), 'Invasão', '01001000', 'Rua', '1', null, null, 'São Paulo', 'SP', null, null, null, null, null, null, null, null, null)->>'code'),
  'NOT_FOUND', 'o Tenant B não cria unidade em cliente do Tenant A');
select is((select public.create_site('10000000-0000-0000-0000-0000000007c1', '60000000-0000-0000-0000-0000000700c1', '20000000-0000-0000-0000-00000000000a',
  (select (v->>'customer_id')::uuid from r where k = 'cli'), 'Sem Permissão', '01001000', 'Rua', '1', null, null, 'São Paulo', 'SP', null, null, null, null, null, null, null, null, null)->>'code'),
  'ACCESS_DENIED', 'motorista sem permissão não cria unidade');

-- ---------- update_site
create function pg_temp.upd_site(p_site uuid, p_version bigint, p_name text, p_city text default 'São Paulo', p_contact text default null,
  p_actor uuid default '10000000-0000-0000-0000-000000000002', p_session uuid default '60000000-0000-0000-0000-0000000700a2', p_org uuid default '20000000-0000-0000-0000-00000000000a')
returns jsonb language sql as $$
  select public.update_site(p_actor, p_session, p_org, p_site, p_version, p_name, '01001000', 'Praça da Sé', '100', null, 'Sé', p_city, 'SP', '3550308',
    null, null, p_contact, null, null, null, null, null)
$$;
insert into r values ('u1', pg_temp.upd_site((select (v->>'site_id')::uuid from r where k = 's1'), 1, 'Unidade Central', 'Santos', 'Outro Responsável'));
select is((select v->>'code' from r where k = 'u1'), 'UPDATED', 'a unidade é editada');
select is((select (v->>'version')::int from r where k = 'u1'), 2, 'a versão sobe na edição');
select ok((select e.data->'changes'->0->>'old' = 'São Paulo' and e.data::text !~ 'Outro Responsável' from public.registry_events e
            where e.entity_type = 'site' and e.event_type = 'site_updated' and e.entity_id = (select (v->>'site_id')::uuid from r where k = 's1')),
  'o evento mostra a cidade antiga e a nova, mas só cita o nome do campo do responsável (dado pessoal)');
select is((select v->>'code' from (select pg_temp.upd_site((select (v->>'site_id')::uuid from r where k = 's1'), 1, 'Unidade Central') v) s), 'VERSION_CONFLICT', 'gravação sobre versão antiga é recusada');
update public.customer_sites set status = 'inactive', inactivated_at = now(), inactivated_by = '10000000-0000-0000-0000-000000000002'
 where id = (select (v->>'site_id')::uuid from r where k = 'spf');
select is((select v->>'code' from (select pg_temp.upd_site((select (v->>'site_id')::uuid from r where k = 'spf'), 1, 'Casa da Ana') v) s), 'INACTIVE_RECORD', 'unidade inativa não é editada');
insert into r values ('s2', pg_temp.site_as_a((select (v->>'customer_id')::uuid from r where k = 'cli'), 'Unidade Norte'));
select is((select v->>'code' from (select pg_temp.upd_site((select (v->>'site_id')::uuid from r where k = 's2'), 1, '  unidade CENTRAL ') v) s), 'NAME_CONFLICT', 'renomear para um nome já usado no cliente é recusado');
select is((select v->>'code' from (select pg_temp.upd_site((select (v->>'site_id')::uuid from r where k = 's1'), 2, 'unidade CENTRAL ',
  p_actor => '10000000-0000-0000-0000-000000000003', p_session => '60000000-0000-0000-0000-0000000700b3', p_org => '20000000-0000-0000-0000-00000000000b') v) s),
  'NOT_FOUND', 'o Tenant B não edita unidade do Tenant A');

select * from finish();
rollback;
