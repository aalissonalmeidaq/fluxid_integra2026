begin;
select plan(56);

-- Spec 007, US4: veículos (RF-019 a RF-023, RF-038, CA-009). Hermético: desfeito pelo rollback. Placas e dados fictícios.

delete from public.user_sessions where user_id in (
  '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000003');
insert into public.membership_roles (membership_id, role_id, assigned_by)
  select '30000000-0000-0000-0000-00000000000b', r.id, '10000000-0000-0000-0000-000000000001'
    from public.roles r where r.organization_id = '20000000-0000-0000-0000-00000000000b' and r.code = 'tenant_admin';
insert into auth.users (id, aud, role, email) values
  ('10000000-0000-0000-0000-0000000007c1', 'authenticated', 'authenticated', 'v-driver@example.invalid'),
  ('10000000-0000-0000-0000-0000000007d1', 'authenticated', 'authenticated', 'v-auditor@example.invalid');
insert into public.profiles (user_id, display_name) values ('10000000-0000-0000-0000-0000000007c1', 'Motorista'), ('10000000-0000-0000-0000-0000000007d1', 'Auditor');
insert into public.memberships (id, organization_id, user_id, status, activated_at) values
  ('30000000-0000-0000-0000-0000000007c1', '20000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-0000000007c1', 'active', now()),
  ('30000000-0000-0000-0000-0000000007d1', '20000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-0000000007d1', 'active', now());
insert into public.membership_roles (membership_id, role_id, assigned_by)
  select m.id, r.id, '10000000-0000-0000-0000-000000000001'
    from (values ('30000000-0000-0000-0000-0000000007c1'::uuid, 'driver'), ('30000000-0000-0000-0000-0000000007d1', 'tenant_auditor')) m(id, code)
    join public.roles r on r.code = m.code and r.organization_id = '20000000-0000-0000-0000-00000000000a';
select public.start_user_session('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000700a2', 'aal1');
select public.start_user_session('10000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-0000000700b3', 'aal1');
select public.start_user_session('10000000-0000-0000-0000-0000000007c1', '60000000-0000-0000-0000-0000000700c1', 'aal1');
select public.start_user_session('10000000-0000-0000-0000-0000000007d1', '60000000-0000-0000-0000-0000000700d1', 'aal1');

create temp table r (k text primary key, v jsonb);
grant all on r to public;

create function pg_temp.create_a(p_plate text, p_type text default 'truck', p_detail text default null, p_year integer default 2020, p_capacity integer default 30,
  p_due date default null, p_brand text default 'Marca X') returns jsonb language sql as $$
  select public.create_vehicle('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000700a2', '20000000-0000-0000-0000-00000000000a',
    p_plate, p_type, p_detail, p_brand, 'Modelo Y', p_year, p_capacity, 5000.5, p_due)
$$;
create function pg_temp.status_a(p_vehicle uuid, p_version bigint, p_status text, p_justification text default null) returns jsonb language sql as $$
  select public.change_vehicle_status('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000700a2', '20000000-0000-0000-0000-00000000000a', p_vehicle, p_version, p_status, p_justification)
$$;
create function pg_temp.update_a(p_vehicle uuid, p_version bigint, p_plate text, p_capacity integer default 30, p_justification text default null) returns jsonb language sql as $$
  select public.update_vehicle('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000700a2', '20000000-0000-0000-0000-00000000000a',
    p_vehicle, p_version, p_plate, 'truck', null, 'Marca X', 'Modelo Y', 2020, p_capacity, 5000.5, null, p_justification)
$$;
create function pg_temp.list_a(p_search text default null, p_status text default null, p_type text default null, p_lic text default null) returns jsonb language sql as $$
  select public.list_vehicles('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000700a2', '20000000-0000-0000-0000-00000000000a',
    p_search, p_status, p_type, p_lic, null, null, null)
$$;

-- ---------- criação e placa
insert into r values
  ('old', pg_temp.create_a('abc-1234')), ('merc', pg_temp.create_a('ABC1D23', 'van', null, 2023, 12, (now() at time zone 'America/Sao_Paulo')::date + 31)),
  ('bad1', pg_temp.create_a('AB12345')), ('bad2', pg_temp.create_a('ABCD123')), ('dup', pg_temp.create_a('ABC1234'));
select is((select v->>'code' from r where k = 'old'), 'CREATED', 'placa antiga com hífen e minúsculas é aceita');
select is((select plate from public.vehicles where id = (select (v->>'vehicle_id')::uuid from r where k = 'old')), 'ABC1234', 'a placa é guardada normalizada');
select is((select v->>'code' from r where k = 'merc'), 'CREATED', 'placa Mercosul é aceita');
select is((select status from public.vehicles where id = (select (v->>'vehicle_id')::uuid from r where k = 'merc')), 'available', 'nasce disponível');
select is((select v->>'code' from r where k = 'bad1'), 'VALIDATION_FAILED', 'AB12345 é recusada');
select ok((select v::text like '%"plate"%' from r where k = 'bad2'), 'ABCD123 é recusada apontando a placa');
select is((select v->>'code' from r where k = 'dup'), 'PLATE_CONFLICT', 'placa repetida na organização é recusada');
select is((select v->>'plate' from r where k = 'dup'), 'ABC1234', 'o conflito indica a placa do veículo existente');
select is((select v->>'code' from (select public.create_vehicle('10000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-0000000700b3', '20000000-0000-0000-0000-00000000000b',
  'ABC1234', 'truck', null, null, null, null, 10, null, null) v) s), 'CREATED', 'a mesma placa em outra organização é aceita');
select is((select v->>'code' from (select pg_temp.create_a('DDD1111', 'truck', null, 1979) v) s), 'VALIDATION_FAILED', 'ano de fabricação 1979 é recusado');
select is((select v->>'code' from (select pg_temp.create_a('DDD1112', 'truck', null, extract(year from now())::int + 1) v) s), 'CREATED', 'o ano seguinte ao atual é aceito');
select is((select v->>'code' from (select pg_temp.create_a('DDD1113', 'truck', null, extract(year from now())::int + 2) v) s), 'VALIDATION_FAILED', 'dois anos à frente é recusado');
select is((select v->>'code' from (select pg_temp.create_a('DDD1114', 'truck', null, 2020, 0) v) s), 'VALIDATION_FAILED', 'capacidade 0 é recusada');
select is((select v->>'code' from (select pg_temp.create_a('DDD1115', 'truck', null, 2020, 9999) v) s), 'CREATED', 'capacidade 9999 é aceita');
select is((select v->>'code' from (select pg_temp.create_a('DDD1116', 'truck', null, 2020, 10000) v) s), 'VALIDATION_FAILED', 'capacidade 10000 é recusada');
select is((select v->>'code' from (select pg_temp.create_a('DDD1117', 'other') v) s), 'VALIDATION_FAILED', 'tipo "outro" exige o detalhe');
select is((select v->>'code' from (select pg_temp.create_a('DDD1118', 'other', 'Moto de entrega') v) s), 'CREATED', 'tipo "outro" com detalhe é aceito');
select is((select v->>'code' from (select public.create_vehicle('10000000-0000-0000-0000-0000000007c1', '60000000-0000-0000-0000-0000000700c1', '20000000-0000-0000-0000-00000000000a',
  'EEE1111', 'truck', null, null, null, null, 10, null, null) v) s), 'ACCESS_DENIED', 'o motorista não cadastra veículo');
select is((select v->>'code' from (select public.create_vehicle('10000000-0000-0000-0000-0000000007d1', '60000000-0000-0000-0000-0000000700d1', '20000000-0000-0000-0000-00000000000a',
  'EEE1112', 'truck', null, null, null, null, 10, null, null) v) s), 'ACCESS_DENIED', 'o auditor não cadastra veículo');

-- ---------- evento e auditoria
select is((select event_type from public.registry_events where entity_type = 'vehicle' and entity_id = (select (v->>'vehicle_id')::uuid from r where k = 'old') and sequence = 1), 'vehicle_created', 'evento vehicle_created');
select ok(exists (select 1 from public.audit_logs where action = 'vehicle.create' and target_id = (select v->>'vehicle_id' from r where k = 'old')), 'auditoria vehicle.create gravada');

-- ---------- licenciamento calculado (31, 30, 0 e -1 dia)
create function pg_temp.lic(p_days integer) returns text language sql as $$
  select i->>'licensing_status' from jsonb_array_elements(pg_temp.list_a(null, 'all')->'items') i
   where i->>'plate' = (select plate from public.vehicles where licensing_due_on = (now() at time zone 'America/Sao_Paulo')::date + p_days limit 1)
$$;
update public.vehicles set licensing_due_on = (now() at time zone 'America/Sao_Paulo')::date + 31 where plate = 'ABC1234' and organization_id = '20000000-0000-0000-0000-00000000000a';
select is(pg_temp.lic(31), 'em_dia', '31 dias: em dia');
update public.vehicles set licensing_due_on = (now() at time zone 'America/Sao_Paulo')::date + 30 where plate = 'ABC1234' and organization_id = '20000000-0000-0000-0000-00000000000a';
select is(pg_temp.lic(30), 'a_vencer', '30 dias: a vencer');
update public.vehicles set licensing_due_on = (now() at time zone 'America/Sao_Paulo')::date where plate = 'ABC1234' and organization_id = '20000000-0000-0000-0000-00000000000a';
select is(pg_temp.lic(0), 'a_vencer', 'no dia do vencimento: ainda a vencer');
update public.vehicles set licensing_due_on = (now() at time zone 'America/Sao_Paulo')::date - 1 where plate = 'ABC1234' and organization_id = '20000000-0000-0000-0000-00000000000a';
select is(pg_temp.lic(-1), 'vencido', 'um dia depois: vencido');
update public.vehicles set licensing_due_on = null where plate = 'ABC1234' and organization_id = '20000000-0000-0000-0000-00000000000a';
select is((select i->>'licensing_status' from jsonb_array_elements(pg_temp.list_a('ABC1234')->'items') i), 'sem_data', 'sem data de vencimento');

-- ---------- edição
insert into r values ('upd', pg_temp.update_a((select (v->>'vehicle_id')::uuid from r where k = 'old'), 1, 'ABC1234', 40));
select is((select v->>'code' from r where k = 'upd'), 'UPDATED', 'veículo é editado');
select is((select (v->>'version')::int from r where k = 'upd'), 2, 'a versão sobe');
select is((select v->>'code' from (select pg_temp.update_a((select (v->>'vehicle_id')::uuid from r where k = 'old'), 1, 'ABC1234', 41) v) s), 'VERSION_CONFLICT', 'versão antiga é recusada');
select is((select v->>'code' from (select pg_temp.update_a((select (v->>'vehicle_id')::uuid from r where k = 'old'), 2, 'ZZZ9999', 40) v) s), 'JUSTIFICATION_REQUIRED', 'corrigir a placa exige justificativa');
select is((select v->>'code' from (select pg_temp.update_a((select (v->>'vehicle_id')::uuid from r where k = 'old'), 2, 'ABC1D23', 40, 'Placa digitada errada') v) s), 'PLATE_CONFLICT', 'corrigir para placa já usada é recusado');
insert into r values ('fix', pg_temp.update_a((select (v->>'vehicle_id')::uuid from r where k = 'old'), 2, 'zzz-9999', 40, 'Placa digitada errada'));
select is((select v->>'code' from r where k = 'fix'), 'UPDATED', 'a correção da placa é aceita com justificativa');
select is((select e.data->'changes'->0->>'old' || '>' || (e.data->'changes'->0->>'new') from public.registry_events e
            where e.event_type = 'vehicle_updated' and e.entity_id = (select (v->>'vehicle_id')::uuid from r where k = 'old') and e.sequence = 3), 'ABC1234>ZZZ9999', 'o evento traz a placa antiga e a nova');

-- ---------- situação operacional
insert into r values ('maint', pg_temp.status_a((select (v->>'vehicle_id')::uuid from r where k = 'merc'), 1, 'maintenance'));
select is((select v->>'code' from r where k = 'maint'), 'STATUS_CHANGED', 'muda para manutenção sem justificativa');
select is((select e.data->>'from' || '>' || (e.data->>'to') from public.registry_events e where e.event_type = 'vehicle_status_changed' and e.entity_id = (select (v->>'vehicle_id')::uuid from r where k = 'merc')), 'available>maintenance', 'o evento registra de e para');
select is((select v->>'code' from (select pg_temp.update_a((select (v->>'vehicle_id')::uuid from r where k = 'merc'), 2, 'ABC1D23', 12) v) s), 'UPDATED', 'veículo em manutenção é editável');
select is((select v->>'code' from (select pg_temp.status_a((select (v->>'vehicle_id')::uuid from r where k = 'merc'), 3, 'inactive') v) s), 'JUSTIFICATION_REQUIRED', 'ir para inativo exige justificativa');
insert into r values ('inact', pg_temp.status_a((select (v->>'vehicle_id')::uuid from r where k = 'merc'), 3, 'inactive', 'Veículo vendido'));
select is((select v->>'code' from r where k = 'inact'), 'STATUS_CHANGED', 'inativa com justificativa');
select is((select v->>'code' from (select pg_temp.update_a((select (v->>'vehicle_id')::uuid from r where k = 'merc'), 4, 'ABC1D23', 12) v) s), 'INACTIVE_RECORD', 'veículo inativo não é editado');
select is((select v->>'code' from (select pg_temp.status_a((select (v->>'vehicle_id')::uuid from r where k = 'merc'), 4, 'maintenance', 'Voltou') v) s), 'VALIDATION_FAILED', 'de inativo só se vai para disponível');
select is((select v->>'code' from (select pg_temp.status_a((select (v->>'vehicle_id')::uuid from r where k = 'merc'), 4, 'available') v) s), 'JUSTIFICATION_REQUIRED', 'sair de inativo exige justificativa');
select is((select v->>'code' from (select pg_temp.status_a((select (v->>'vehicle_id')::uuid from r where k = 'merc'), 3, 'available', 'Voltou') v) s), 'VERSION_CONFLICT', 'a mudança de situação confere a versão');
select is((select v->>'code' from (select pg_temp.status_a((select (v->>'vehicle_id')::uuid from r where k = 'merc'), 4, 'available', 'Voltou à frota') v) s), 'STATUS_CHANGED', 'reativa para disponível com justificativa');

-- ---------- lista e filtros
select is((select (pg_temp.list_a()->>'total')::int from (select 1) x), (select count(*)::int from public.vehicles where organization_id = '20000000-0000-0000-0000-00000000000a' and status <> 'inactive'), 'o padrão traz os não inativos');
select is((select (pg_temp.list_a('zzz9')->>'total')::int), 1, 'busca pela placa sem hífen');
select is((select (pg_temp.list_a('zzz-9')->>'total')::int), 1, 'busca pela placa com hífen');
select is((select (pg_temp.list_a('marca x', 'all', 'other')->>'total')::int), 1, 'filtro de tipo e busca por marca');
select is((select (pg_temp.list_a(null, 'maintenance')->>'total')::int), 0, 'filtro de situação operacional');
select is((select (pg_temp.list_a(null, 'all', null, 'vencido')->>'total')::int), 0, 'filtro por licenciamento vencido');
select is((select (pg_temp.list_a(null, 'all', null, 'sem_data')->>'total')::int), (select count(*)::int from public.vehicles where organization_id = '20000000-0000-0000-0000-00000000000a' and licensing_due_on is null), 'filtro por licenciamento sem data');

-- ---------- isolamento e detalhe
select is((select public.get_vehicle('10000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-0000000700b3', '20000000-0000-0000-0000-00000000000b', (select (v->>'vehicle_id')::uuid from r where k = 'old'))->>'code'), 'NOT_FOUND', 'o Tenant B não vê o veículo do A');
select is((select (public.list_vehicles('10000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-0000000700b3', '20000000-0000-0000-0000-00000000000b', null, 'all', null, null, null, null, null)->>'total')::int), 1, 'o Tenant B lista só o veículo dele');
select is((select public.get_vehicle('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000700a2', '20000000-0000-0000-0000-00000000000a', (select (v->>'vehicle_id')::uuid from r where k = 'old'))->'vehicle'->>'plate'), 'ZZZ9999', 'get_vehicle devolve a placa atual');
select is((select public.list_vehicles('10000000-0000-0000-0000-0000000007d1', '60000000-0000-0000-0000-0000000700d1', '20000000-0000-0000-0000-00000000000a', null, null, null, null, null, null, null)->>'code'), 'LISTED', 'o auditor lê veículos');
select is((select public.list_vehicles('10000000-0000-0000-0000-0000000007c1', '60000000-0000-0000-0000-0000000700c1', '20000000-0000-0000-0000-00000000000a', null, null, null, null, null, null, null)->>'code'), 'ACCESS_DENIED', 'o motorista não lê veículos');
select is((select public.change_vehicle_status('10000000-0000-0000-0000-0000000007d1', '60000000-0000-0000-0000-0000000700d1', '20000000-0000-0000-0000-00000000000a', (select (v->>'vehicle_id')::uuid from r where k = 'old'), 1, 'maintenance', null)->>'code'), 'ACCESS_DENIED', 'o auditor não muda a situação');

select * from finish();
rollback;
