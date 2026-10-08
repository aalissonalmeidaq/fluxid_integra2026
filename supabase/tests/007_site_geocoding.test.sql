begin;
select plan(22);

-- Spec 007, US1: origem e confirmação das coordenadas da unidade (RF-066, RF-068, RF-069). Hermético: desfeito pelo rollback.

delete from public.user_sessions where user_id in (
  '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000003');
insert into public.membership_roles (membership_id, role_id, assigned_by)
  select '30000000-0000-0000-0000-00000000000b', r.id, '10000000-0000-0000-0000-000000000001'
    from public.roles r where r.organization_id = '20000000-0000-0000-0000-00000000000b' and r.code = 'tenant_admin';
select public.start_user_session('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000700a2', 'aal1');
select public.start_user_session('10000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-0000000700b3', 'aal1');

create temp table r (k text primary key, v jsonb);
grant all on r to public;

insert into r values
  ('cli', public.create_customer('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000700a2', '20000000-0000-0000-0000-00000000000a',
     'legal', '11222333000181', 'Hospital Alfa Ltda', null, 'hospital', null, null, '[]'::jsonb)),
  ('clipf', public.create_customer('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000700a2', '20000000-0000-0000-0000-00000000000a',
     'individual', '52998224725', 'Ana Lima', null, 'hospital', null, null, '[]'::jsonb));

create function pg_temp.mk(p_customer uuid, p_name text, p_lat numeric, p_lng numeric, p_source text default null)
returns jsonb language sql as $$
  select public.create_site('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000700a2', '20000000-0000-0000-0000-00000000000a',
    p_customer, p_name, '01001000', 'Praça da Sé', '100', null, 'Sé', 'São Paulo', 'SP', '3550308', p_lat, p_lng,
    null, null, null, null, null, null, p_source)
$$;

-- Atualiza com os mesmos campos, mudando só o que o teste pede.
create function pg_temp.upd(p_site uuid, p_version bigint, p_lat numeric, p_lng numeric, p_source text default null, p_street text default 'Praça da Sé')
returns jsonb language sql as $$
  select public.update_site('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000700a2', '20000000-0000-0000-0000-00000000000a',
    p_site, p_version, 'Unidade Central', '01001000', p_street, '100', null, 'Sé', 'São Paulo', 'SP', '3550308', p_lat, p_lng,
    null, null, null, null, null, null, p_source)
$$;

create function pg_temp.site(p_key text) returns public.customer_sites language sql as $$
  select s.* from public.customer_sites s where s.id = (select (v->>'site_id')::uuid from r where k = p_key)
$$;

insert into r values
  ('geo', pg_temp.mk((select (v->>'customer_id')::uuid from r where k = 'cli'), 'Unidade Central', -23.55052, -46.633308, 'geocoded')),
  ('man', pg_temp.mk((select (v->>'customer_id')::uuid from r where k = 'cli'), 'Unidade Manual', -23.5, -46.6)),
  ('nul', pg_temp.mk((select (v->>'customer_id')::uuid from r where k = 'cli'), 'Unidade Sem Ponto', null, null)),
  ('pf', pg_temp.mk((select (v->>'customer_id')::uuid from r where k = 'clipf'), 'Casa da Ana', -23.5, -46.6, 'geocoded'));

-- ---------- criação
select is((select v->>'code' from r where k = 'geo'), 'CREATED', 'unidade geocodificada é criada');
select is((pg_temp.site('geo')).coordinates_source, 'geocoded', 'origem geocodificada gravada');
select ok((pg_temp.site('geo')).coordinates_confirmed_at is not null and (pg_temp.site('geo')).coordinates_confirmed_by = '10000000-0000-0000-0000-000000000002',
  'quem confirmou e quando foram gravados');
select is((pg_temp.site('man')).coordinates_source, 'manual', 'coordenadas digitadas têm origem manual');
select ok((pg_temp.site('man')).coordinates_confirmed_at is null, 'coordenadas manuais não têm confirmação');
select ok((pg_temp.site('nul')).coordinates_source is null, 'sem coordenadas não há origem');
select is((pg_temp.site('geo')).first_delivery_confirmed, false, 'a primeira entrega começa não confirmada');
select is((select v->>'code' from (select pg_temp.mk((select (v->>'customer_id')::uuid from r where k = 'cli'), 'Sem Ponto Geo', null, null, 'geocoded') v) s), 'VALIDATION_FAILED',
  'origem geocodificada sem coordenadas é recusada');
select is((select v->>'code' from (select pg_temp.mk((select (v->>'customer_id')::uuid from r where k = 'cli'), 'Origem Ruim', -23.5, -46.6, 'satelite') v) s), 'VALIDATION_FAILED',
  'origem desconhecida é recusada');
select ok(exists (select 1 from public.registry_events where entity_type = 'site' and entity_id = (pg_temp.site('geo')).id and event_type = 'site_created'
  and data->>'coordinates_source' = 'geocoded' and (data->>'coordinates_confirmed')::boolean), 'o evento registra origem e confirmação');
select ok(exists (select 1 from public.audit_logs where action = 'site.create' and target_id = (pg_temp.site('geo')).id::text
  and metadata->>'coordinates_source' = 'geocoded'), 'a auditoria registra origem e confirmação');

-- ---------- edição
-- Mudar o endereço sem nova confirmação descarta a confirmação.
select is((select v->>'code' from (select pg_temp.upd((pg_temp.site('geo')).id, 1, -23.55052, -46.633308, null, 'Rua Nova') v) s), 'UPDATED', 'endereço editado');
select ok((pg_temp.site('geo')).coordinates_confirmed_at is null and (pg_temp.site('geo')).coordinates_source = 'geocoded', 'endereço alterado descarta a confirmação');
-- Nova confirmação restabelece.
select is((select v->>'code' from (select pg_temp.upd((pg_temp.site('geo')).id, 2, -23.56, -46.64, 'geocoded', 'Rua Nova') v) s), 'UPDATED', 'nova busca confirmada');
select ok((pg_temp.site('geo')).coordinates_confirmed_at is not null, 'nova confirmação gravada');
-- Editar coordenadas à mão passa a origem para manual.
select is((select v->>'code' from (select pg_temp.upd((pg_temp.site('geo')).id, 3, -23.57, -46.65, null, 'Rua Nova') v) s), 'UPDATED', 'coordenadas editadas à mão');
select ok((pg_temp.site('geo')).coordinates_source = 'manual' and (pg_temp.site('geo')).coordinates_confirmed_at is null, 'a origem vira manual e a confirmação é limpa');
-- Remover as coordenadas limpa origem e confirmação.
select is((select v->>'code' from (select pg_temp.upd((pg_temp.site('geo')).id, 4, null, null, null, 'Rua Nova') v) s), 'UPDATED', 'coordenadas removidas');
select ok((pg_temp.site('geo')).coordinates_source is null, 'sem coordenadas não há origem');
-- Confirmação repetida sem mudança não renova o instante.
select pg_temp.upd((pg_temp.site('man')).id, 1, -23.58, -46.66, 'geocoded');
create temp table stamp as select coordinates_confirmed_at as at from public.customer_sites where id = (pg_temp.site('man')).id;
select pg_temp.upd((pg_temp.site('man')).id, 2, -23.58, -46.66, 'geocoded');
select is((select coordinates_confirmed_at from public.customer_sites where id = (pg_temp.site('man')).id), (select at from stamp), 'reenviar a mesma confirmação não muda o instante');

-- ---------- isolamento e leitura
select is((select count(*)::int from public.customer_sites s where s.organization_id = '20000000-0000-0000-0000-00000000000b'), 0, 'o Tenant B não tem nenhuma unidade do Tenant A');
select ok((select (public.get_site('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000700a2', '20000000-0000-0000-0000-00000000000a',
  (pg_temp.site('man')).id)->'site') ? 'coordinates_source'), 'a leitura devolve a origem das coordenadas');

select * from finish();
rollback;
