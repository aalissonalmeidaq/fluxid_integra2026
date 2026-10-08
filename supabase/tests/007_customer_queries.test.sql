begin;
select plan(37);

-- Spec 007, US2: list_customers, get_customer, list_sites e get_site (RF-003, RF-040, RF-052). Hermético: desfeito pelo rollback.
-- Todos os documentos, nomes e e-mails são fictícios.

delete from public.user_sessions where user_id in (
  '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000003');
insert into public.membership_roles (membership_id, role_id, assigned_by)
  select '30000000-0000-0000-0000-00000000000b', r.id, '10000000-0000-0000-0000-000000000001'
    from public.roles r where r.organization_id = '20000000-0000-0000-0000-00000000000b' and r.code = 'tenant_admin';

-- Motorista (sem permissão da Fase 3) e auditor do Tenant A.
insert into auth.users (id, aud, role, email) values
  ('10000000-0000-0000-0000-0000000007c1', 'authenticated', 'authenticated', 'q-driver@example.invalid'),
  ('10000000-0000-0000-0000-0000000007d1', 'authenticated', 'authenticated', 'q-auditor@example.invalid');
insert into public.profiles (user_id, display_name) values
  ('10000000-0000-0000-0000-0000000007c1', 'Motorista'), ('10000000-0000-0000-0000-0000000007d1', 'Auditor');
insert into public.memberships (id, organization_id, user_id, status, activated_at) values
  ('30000000-0000-0000-0000-0000000007c1', '20000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-0000000007c1', 'active', now()),
  ('30000000-0000-0000-0000-0000000007d1', '20000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-0000000007d1', 'active', now());
insert into public.membership_roles (membership_id, role_id, assigned_by)
  select '30000000-0000-0000-0000-0000000007c1', r.id, '10000000-0000-0000-0000-000000000001' from public.roles r
   where r.organization_id = '20000000-0000-0000-0000-00000000000a' and r.code = 'driver';
insert into public.membership_roles (membership_id, role_id, assigned_by)
  select '30000000-0000-0000-0000-0000000007d1', r.id, '10000000-0000-0000-0000-000000000001' from public.roles r
   where r.organization_id = '20000000-0000-0000-0000-00000000000a' and r.code = 'tenant_auditor';
select public.start_user_session('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000700a2', 'aal1');
select public.start_user_session('10000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-0000000700b3', 'aal1');
select public.start_user_session('10000000-0000-0000-0000-0000000007c1', '60000000-0000-0000-0000-0000000700c1', 'aal1');
select public.start_user_session('10000000-0000-0000-0000-0000000007d1', '60000000-0000-0000-0000-0000000700d1', 'aal1');

-- Massa: 30 clientes jurídicos ativos em A (Cliente 001..030, uma unidade cada, em São Paulo ou Campinas), 1 inativo, 1 pessoa física
-- com CPF, e 2 do Tenant B (um com o mesmo CNPJ de Cliente 001).
insert into public.customers (id, organization_id, person_type, document_display, legal_name, trade_name, segment)
select ('81000000-0000-0000-0000-0000000007' || lpad(n::text, 2, '0'))::uuid, '20000000-0000-0000-0000-00000000000a', 'legal',
       '1122233300' || lpad(n::text, 4, '0'), 'Cliente ' || lpad(n::text, 3, '0'), case when n = 7 then 'Fantasia Sete' end,
       case when n % 2 = 0 then 'hospital' else 'clinic' end
  from generate_series(1, 30) n;
insert into public.customer_documents (customer_id, organization_id, kind, document_key)
select c.id, c.organization_id, 'cnpj', c.document_display from public.customers c where c.organization_id = '20000000-0000-0000-0000-00000000000a';
insert into public.customers (id, organization_id, person_type, document_display, legal_name, segment, status, inactivated_at, inactivated_by) values
  ('81000000-0000-0000-0000-0000000007e1', '20000000-0000-0000-0000-00000000000a', 'legal', '55666777000188', 'Cliente Inativo', 'industry', 'inactive', now(), '10000000-0000-0000-0000-000000000002');
insert into public.customers (id, organization_id, person_type, document_display, legal_name, segment, segment_detail) values
  ('81000000-0000-0000-0000-0000000007f1', '20000000-0000-0000-0000-00000000000a', 'individual', '***.***.***-25', 'Ana Lima', 'other', 'Consultório'),
  ('81000000-0000-0000-0000-0000000007b1', '20000000-0000-0000-0000-00000000000b', 'legal', '11222333000001', 'Cliente do Tenant B', 'hospital', null);
insert into public.customer_documents (customer_id, organization_id, kind, document_key) values
  ('81000000-0000-0000-0000-0000000007f1', '20000000-0000-0000-0000-00000000000a', 'cpf', '52998224725'),
  ('81000000-0000-0000-0000-0000000007b1', '20000000-0000-0000-0000-00000000000b', 'cnpj', '11222333000001');
insert into public.customer_sites (id, organization_id, customer_id, name, postal_code, street, number, city, state)
select ('82000000-0000-0000-0000-0000000007' || lpad(n::text, 2, '0'))::uuid, '20000000-0000-0000-0000-00000000000a', ('81000000-0000-0000-0000-0000000007' || lpad(n::text, 2, '0'))::uuid,
       'Unidade ' || lpad(n::text, 3, '0'), '01001000', 'Praça da Sé', '1', case when n % 2 = 0 then 'São Paulo' else 'Campinas' end, case when n % 2 = 0 then 'SP' else 'MG' end
  from generate_series(1, 30) n;
insert into public.customer_sites (id, organization_id, customer_id, name, postal_code, street, number, city, state) values
  ('82000000-0000-0000-0000-0000000007b1', '20000000-0000-0000-0000-00000000000b', '81000000-0000-0000-0000-0000000007b1', 'Unidade do B', '01001000', 'Praça da Sé', '1', 'Curitiba', 'PR');
insert into public.geofences (id, organization_id, site_id, name, shape, center, radius_m, area) values
  ('84000000-0000-0000-0000-0000000007a1', '20000000-0000-0000-0000-00000000000a', '82000000-0000-0000-0000-000000000702', 'Geocerca da 002', 'circle',
   extensions.st_point(-46.633, -23.55)::extensions.geography, 200, extensions.st_buffer(extensions.st_point(-46.633, -23.55)::extensions.geography, 210)::extensions.geography);
insert into public.customer_contacts (id, organization_id, customer_id, name, role, phone, email, is_primary, position) values
  ('83000000-0000-0000-0000-0000000007a1', '20000000-0000-0000-0000-00000000000a', '81000000-0000-0000-0000-000000000701', 'Maria Souza', 'Compras', '11912345678', 'maria@exemplo.invalid', true, 0);

create temp table r (k text primary key, v jsonb);
grant all on r to public;

-- Atalhos: A = administrador do Tenant A, B = administrador do Tenant B, D = motorista, U = auditor.
create function pg_temp.list_a(p_search text default null, p_status text default null, p_segment text default null, p_state text default null,
  p_geofence boolean default null, p_sort text default null, p_cursor text default null, p_limit integer default null)
returns jsonb language sql as $$
  select public.list_customers('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000700a2', '20000000-0000-0000-0000-00000000000a',
    p_search, p_status, p_segment, p_state, p_geofence, p_sort, p_cursor, p_limit)
$$;

-- ---------- lista: padrão, total, paginação por cursor
insert into r values ('default', pg_temp.list_a());
select is((select v->>'code' from r where k = 'default'), 'LISTED', 'a lista responde LISTED');
select is((select (v->>'total')::int from r where k = 'default'), 31, 'o padrão traz só os ativos (30 jurídicos e a pessoa física), sem o inativo');
select is((select jsonb_array_length(v->'items') from r where k = 'default'), 25, 'a primeira página tem 25 itens');
select ok((select v->>'next' is not null from r where k = 'default'), 'há próxima página');
insert into r values ('page2', pg_temp.list_a(null, null, null, null, null, null, (select v->>'next' from r where k = 'default')));
select is((select jsonb_array_length(v->'items') from r where k = 'page2'), 6, 'a segunda página traz o resto');
select ok((select v->>'next' is null from r where k = 'page2'), 'a última página não tem cursor');
select is((select v->'items'->0->>'legal_name' from r where k = 'default'), 'Ana Lima', 'ordem pelo nome, sem diferenciar caixa');
select is((select count(distinct i->>'id')::int from r, jsonb_array_elements(v->'items') i where k in ('default', 'page2')), 31, 'as duas páginas não repetem nem perdem itens');
select is((select v->'items'->0->>'legal_name' from (select pg_temp.list_a(null, null, null, null, null, 'name_desc') v) s), 'Cliente 030', 'ordenação decrescente');
select is((select v->>'code' from (select pg_temp.list_a(null, null, null, null, null, null, 'não-é-cursor') v) s), 'VALIDATION_FAILED', 'cursor inválido é recusado');
select is((select jsonb_array_length(v->'items') from (select pg_temp.list_a(null, null, null, null, null, null, null, 1000) v) s), 31, 'o limite máximo é 100 (todos cabem)');

-- ---------- filtros e busca
select is((select (v->>'total')::int from (select pg_temp.list_a(null, 'inactive') v) s), 1, 'filtro de situação: inativos');
select is((select (v->>'total')::int from (select pg_temp.list_a(null, 'all') v) s), 32, 'filtro de situação: todos');
select is((select (v->>'total')::int from (select pg_temp.list_a(null, null, 'hospital') v) s), 15, 'filtro de segmento');
select is((select (v->>'total')::int from (select pg_temp.list_a(null, null, null, 'MG') v) s), 15, 'filtro de UF das unidades');
select is((select (v->>'total')::int from (select pg_temp.list_a(null, null, null, null, true) v) s), 1, 'filtro "tem geocerca"');
select is((select (v->>'total')::int from (select pg_temp.list_a(null, null, null, null, false) v) s), 30, 'filtro "sem geocerca"');
select is((select (v->>'total')::int from (select pg_temp.list_a('CLIENTE 01') v) s), 10, 'busca por trecho do nome, sem diferenciar caixa');
select is((select (v->>'total')::int from (select pg_temp.list_a('fantasia') v) s), 1, 'busca por nome fantasia');
select is((select (v->>'total')::int from (select pg_temp.list_a('campinas') v) s), 15, 'busca por cidade da unidade');
select is((select (v->>'total')::int from (select pg_temp.list_a('unidade 007') v) s), 1, 'busca por nome da unidade');
select is((select (v->>'total')::int from (select pg_temp.list_a('112223330001') v) s), 0, 'documento só por igualdade do valor completo: trecho não encontra');
select is((select v->'items'->0->>'legal_name' from (select pg_temp.list_a('529.982.247-25') v) s), 'Ana Lima', 'o CPF completo digitado encontra a pessoa física');
select is((select (v->>'total')::int from (select pg_temp.list_a('50%') v) s), 0, 'curinga do LIKE é tratado como texto');

-- ---------- itens de lista sem dado pessoal completo
select ok((select (v->'items')::text !~ '(52998224725|maria@exemplo|11912345678)' from r where k in ('default')), 'a lista não traz CPF, telefone nem e-mail completos');
select is((select i->>'document_display' from r, jsonb_array_elements(v->'items') i where k = 'default' and i->>'legal_name' = 'Ana Lima'), '***.***.***-25', 'CPF mascarado');
select is((select i->>'document_display' from r, jsonb_array_elements(v->'items') i where k = 'default' and i->>'legal_name' = 'Cliente 001'), '11222333000001', 'CNPJ completo');

-- ---------- get_customer e unidades
insert into r values ('get', public.get_customer('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000700a2', '20000000-0000-0000-0000-00000000000a', '81000000-0000-0000-0000-000000000701'));
select is((select v->>'code' from r where k = 'get'), 'FOUND', 'get_customer encontra o cliente');
select is((select jsonb_array_length(v->'sites') from r where k = 'get'), 1, 'o detalhe traz as unidades');
select is((select v->'contacts'->0->>'phone' from r where k = 'get'), '11912345678', 'quem edita recebe o telefone do contato');
select is((select v->>'code' from (select public.get_customer('10000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-0000000700b3', '20000000-0000-0000-0000-00000000000b', '81000000-0000-0000-0000-000000000701') v) s),
  'NOT_FOUND', 'o Tenant B não enxerga o cliente do A (igual ao inexistente)');
select is((select v->>'code' from (select public.get_customer('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000700a2', '20000000-0000-0000-0000-00000000000a', '81000000-0000-0000-0000-0000000000ff') v) s),
  'NOT_FOUND', 'cliente inexistente também é NOT_FOUND');
select is((select (v->>'total')::int from (select public.list_sites('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000700a2', '20000000-0000-0000-0000-00000000000a',
  '81000000-0000-0000-0000-000000000702', null, null, null, null) v) s), 1, 'list_sites filtra pelo cliente');
select is((select v->'items'->0->>'has_geofence' from (select public.list_sites('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000700a2', '20000000-0000-0000-0000-00000000000a',
  '81000000-0000-0000-0000-000000000702', null, null, null, null) v) s), 'true', 'a unidade informa se tem geocerca ativa');
select is((select jsonb_array_length(v->'geofences') from (select public.get_site('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000700a2', '20000000-0000-0000-0000-00000000000a',
  '82000000-0000-0000-0000-000000000702') v) s), 1, 'get_site traz as geocercas da unidade');

-- ---------- permissões
select is((select v->>'code' from (select public.list_customers('10000000-0000-0000-0000-0000000007c1', '60000000-0000-0000-0000-0000000700c1', '20000000-0000-0000-0000-00000000000a',
  null, null, null, null, null, null, null, null) v) s), 'ACCESS_DENIED', 'o motorista não lê clientes');
select is((select v->>'code' from (select public.list_customers('10000000-0000-0000-0000-0000000007d1', '60000000-0000-0000-0000-0000000700d1', '20000000-0000-0000-0000-00000000000a',
  null, null, null, null, null, null, null, null) v) s), 'LISTED', 'o auditor lê clientes');

select * from finish();
rollback;
