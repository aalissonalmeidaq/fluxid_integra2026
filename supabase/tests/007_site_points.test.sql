begin;
select plan(9);

-- Spec 007, mapa da Visão geral: list_site_points só devolve unidades ativas com coordenadas da própria organização.

delete from public.user_sessions where user_id in (
  '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000003');
insert into public.membership_roles (membership_id, role_id, assigned_by)
  select '30000000-0000-0000-0000-00000000000b', r.id, '10000000-0000-0000-0000-000000000001'
    from public.roles r where r.organization_id = '20000000-0000-0000-0000-00000000000b' and r.code = 'tenant_admin';
select public.start_user_session('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000700a2', 'aal1');
select public.start_user_session('10000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-0000000700b3', 'aal1');

-- O banco local pode ter cadastros de teste manual: as contagens são relativas à base e as listas filtram os clientes desta suíte.
create temp table base as select count(*)::int as n from public.customer_sites s join public.customers c on c.id = s.customer_id where s.organization_id = '20000000-0000-0000-0000-00000000000a' and s.status = 'active' and c.status = 'active' and c.anonymized_at is null and s.latitude is not null;
grant all on base to public;
create temp table r (k text primary key, v jsonb);
grant all on r to public;

insert into r values
  ('ca', public.create_customer('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000700a2', '20000000-0000-0000-0000-00000000000a',
     'legal', '11222333000181', 'Hospital Alfa Ltda', null, 'hospital', null, null, '[]'::jsonb)),
  ('cb', public.create_customer('10000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-0000000700b3', '20000000-0000-0000-0000-00000000000b',
     'legal', '11222333000262', 'Hospital Beta Ltda', null, 'hospital', null, null, '[]'::jsonb));

create function pg_temp.mk(p_user uuid, p_session uuid, p_org uuid, p_customer uuid, p_name text, p_lat numeric, p_lng numeric)
returns jsonb language sql as $$
  select public.create_site(p_user, p_session, p_org, p_customer, p_name, '01001000', 'Praça da Sé', '100', null, 'Sé', 'São Paulo', 'SP', '3550308', p_lat, p_lng,
    null, null, null, null, null, null)
$$;

insert into r values
  ('a1', pg_temp.mk('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000700a2', '20000000-0000-0000-0000-00000000000a', (select (v->>'customer_id')::uuid from r where k = 'ca'), 'A Com Ponto', -23.55, -46.63)),
  ('a2', pg_temp.mk('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000700a2', '20000000-0000-0000-0000-00000000000a', (select (v->>'customer_id')::uuid from r where k = 'ca'), 'A Sem Ponto', null, null)),
  ('a3', pg_temp.mk('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000700a2', '20000000-0000-0000-0000-00000000000a', (select (v->>'customer_id')::uuid from r where k = 'ca'), 'A Segunda', -23.56, -46.64)),
  ('b1', pg_temp.mk('10000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-0000000700b3', '20000000-0000-0000-0000-00000000000b', (select (v->>'customer_id')::uuid from r where k = 'cb'), 'B Com Ponto', -22.9, -43.2));

create function pg_temp.points_a(p_limit integer default null) returns jsonb language sql as $$
  select public.list_site_points('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000700a2', '20000000-0000-0000-0000-00000000000a', p_limit)
$$;

select is((pg_temp.points_a())->>'code', 'FOUND', 'o administrador do Tenant A consulta os pontos');
select is(((pg_temp.points_a())->>'total')::int, (select n + 2 from base), 'só as unidades ativas com coordenadas contam');
select is((select jsonb_agg(i->>'name') from jsonb_array_elements(pg_temp.points_a()->'items') i where i->>'customer_name' = 'Hospital Alfa Ltda'), '["A Com Ponto", "A Segunda"]'::jsonb, 'ordem estável por nome e sem a unidade sem ponto');
select ok(not exists (select 1 from jsonb_array_elements(pg_temp.points_a()->'items') i where i->>'name' like 'B %'), 'nenhuma unidade do Tenant B aparece para o A');
select is(jsonb_array_length(public.list_site_points('10000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-0000000700b3', '20000000-0000-0000-0000-00000000000b', 10)->'items'), 1, 'o Tenant B vê só a dele');
select is(jsonb_array_length(pg_temp.points_a(1)->'items'), 1, 'o limite corta a página');
select is(((pg_temp.points_a(1))->>'total')::int, (select n + 2 from base), 'e o total continua completo');
select is(public.list_site_points('10000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-0000000700b3', '20000000-0000-0000-0000-00000000000a', 10)->>'code', 'ACCESS_DENIED', 'o administrador do B não lê os pontos do A');

-- Cliente inativo sai do mapa.
update public.customers set status = 'inactive', inactivated_at = now(), inactivated_by = '10000000-0000-0000-0000-000000000002' where id = (select (v->>'customer_id')::uuid from r where k = 'ca');
select is(((pg_temp.points_a())->>'total')::int, (select n from base), 'cliente inativo não aparece no mapa');

select * from finish();
rollback;

