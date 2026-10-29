begin;
select plan(20);

-- Spec 015 (T055; US3, RF-019 a RF-021, RF-036, CS-005): histórico cronológico por viagem ou cilindro. Exige `tracking.read`; período
-- obrigatório e limitado; ordem determinística por (instante, id) com cursor estável; posições, comparações, ocorrência, alertas, eventos
-- e presença no mesmo fio; registro de outra empresa é inexistente por id e nunca aparece. Hermético: rollback.

delete from public.user_sessions where user_id in ('10000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000003',
  '10000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000005');
insert into public.membership_roles (membership_id, role_id, assigned_by)
  select '30000000-0000-0000-0000-00000000000b', r.id, '10000000-0000-0000-0000-000000000001'
    from public.roles r where r.organization_id = '20000000-0000-0000-0000-00000000000b' and r.code = 'tenant_admin'
  on conflict do nothing;
select public.start_user_session('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000001550a2', 'aal1');
select public.start_user_session('10000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-0000001550b3', 'aal1');
select public.start_user_session('10000000-0000-0000-0000-000000000004', '60000000-0000-0000-0000-0000001550a4', 'aal1');
select public.start_user_session('10000000-0000-0000-0000-000000000005', '60000000-0000-0000-0000-0000001550a5', 'aal1');

insert into public.cylinder_types (id, organization_id, gas, capacity_value, capacity_unit, classification) values
  ('e1500000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', 'Oxigênio', 10, 'l', 'medicinal'),
  ('e1500000-0000-0000-0000-00000000000b', '20000000-0000-0000-0000-00000000000b', 'Oxigênio', 10, 'l', 'medicinal');
insert into public.cylinders (id, organization_id, cylinder_type_id, serial_number, custody_status) values
  ('e1510000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-00000000000a', 'e1500000-0000-0000-0000-00000000000a', 'HIS-A-1', 'in_transit'),
  ('e1510000-0000-0000-0000-0000000000b1', '20000000-0000-0000-0000-00000000000b', 'e1500000-0000-0000-0000-00000000000b', 'HIS-B-1', 'in_organization');
insert into public.vehicles (id, organization_id, plate, vehicle_type, capacity_cylinders) values
  ('e1520000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-00000000000a', 'HIS1A11', 'truck', 5);
insert into public.drivers (id, organization_id, full_name, cpf_display, cnh_display, cnh_category, cnh_valid_until, linked_user_id) values
  ('e1530000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-00000000000a', 'Motorista Quatro', 'x', 'x', 'D',
   (now() at time zone 'America/Sao_Paulo')::date + 365, '10000000-0000-0000-0000-000000000004');
insert into public.customers (id, organization_id, person_type, document_display, legal_name, segment) values
  ('e1540000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-00000000000a', 'legal', '11222333000181', 'Hospital Alfa Ltda', 'hospital');
insert into public.customer_sites (id, organization_id, customer_id, name, postal_code, street, number, city, state) values
  ('e1550000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-00000000000a', 'e1540000-0000-0000-0000-0000000000a1', 'Unidade', '01001000',
   'Praça da Sé', '1', 'São Paulo', 'SP');
insert into public.trips (id, organization_id, number, planned_date, vehicle_id, driver_id, status, started_at, started_by, created_by) values
  ('e1560000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-00000000000a', 9191, (now() at time zone 'America/Sao_Paulo')::date,
   'e1520000-0000-0000-0000-0000000000a1', 'e1530000-0000-0000-0000-0000000000a1', 'in_progress', now() - interval '2 hours',
   '10000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002');
insert into public.trip_stops (id, organization_id, trip_id, site_id, position) values
  ('e1570000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-00000000000a', 'e1560000-0000-0000-0000-0000000000a1', 'e1550000-0000-0000-0000-0000000000a1', 1);
insert into public.trip_items (id, organization_id, trip_id, stop_id, cylinder_id, item_status, lock_status, checked_at, created_by) values
  ('e1580000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-00000000000a', 'e1560000-0000-0000-0000-0000000000a1', 'e1570000-0000-0000-0000-0000000000a1',
   'e1510000-0000-0000-0000-0000000000a1', 'in_transit', 'locked', now(), '10000000-0000-0000-0000-000000000002');
insert into public.trip_events (organization_id, trip_id, sequence, event_type, actor_user_id, occurred_at) values
  ('20000000-0000-0000-0000-00000000000a', 'e1560000-0000-0000-0000-0000000000a1', 1, 'trip_started', '10000000-0000-0000-0000-000000000002', now() - interval '2 hours');
insert into public.seal_devices (id, organization_id, device_code, label, key_hash, created_by, lock_state) values
  ('e1590000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-00000000000a', 'DSP-HIS15001', 'Lacre H', extensions.digest('kh', 'sha256'),
   '10000000-0000-0000-0000-000000000002', 'locked');
insert into public.seal_bindings (organization_id, device_id, cylinder_id, bound_by, bound_at) values
  ('20000000-0000-0000-0000-00000000000a', 'e1590000-0000-0000-0000-0000000000a1', 'e1510000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-000000000002', now() - interval '3 hours');

-- Três ciclos lacre longe + celular: a terceira comparação fora abre a ocorrência e o alerta.
create function pg_temp.seal(p_seconds_ago integer) returns void language sql as $$
  insert into public.seal_positions (organization_id, device_id, cylinder_id, point, accuracy_m, quality, read_at, last_seen_at)
  values ('20000000-0000-0000-0000-00000000000a', 'e1590000-0000-0000-0000-0000000000a1', 'e1510000-0000-0000-0000-0000000000a1',
    extensions.st_setsrid(extensions.st_makepoint(-39.31, -7.228), 4326)::extensions.geography, 8, 'gps',
    now() - make_interval(secs => p_seconds_ago), now() - make_interval(secs => p_seconds_ago))
$$;
create temporary table s as select (public.start_tracking_session('10000000-0000-0000-0000-000000000004', '60000000-0000-0000-0000-0000001550a4',
  '20000000-0000-0000-0000-00000000000a', gen_random_uuid(), 'e1560000-0000-0000-0000-0000000000a1', 'e15b0000-0000-0000-0000-0000000000a1',
  'android_native', 'full', false)->'session'->>'id')::uuid as sid;
create function pg_temp.mobile(p_seq integer, p_seconds_ago integer) returns void language sql as $$
  select public.ingest_driver_positions('10000000-0000-0000-0000-000000000004', '60000000-0000-0000-0000-0000001550a4', '20000000-0000-0000-0000-00000000000a',
    gen_random_uuid(), (select sid from s), 'e15b0000-0000-0000-0000-0000000000a1',
    jsonb_build_array(jsonb_build_object('client_position_id', gen_random_uuid(), 'sequence_no', p_seq,
      'observed_at', now() - make_interval(secs => p_seconds_ago), 'latitude', -7.23, 'longitude', -39.31, 'accuracy_m', 10)));
  select null::void;
$$;
select pg_temp.seal(1810); select pg_temp.mobile(1, 1800);
select pg_temp.seal(1750); select pg_temp.mobile(2, 1740);
select pg_temp.seal(1690); select pg_temp.mobile(3, 1680);
-- Uma posição antiga fora do período consultado.
select pg_temp.seal(5000);

create function pg_temp.history(p_user text, p_session text, p_org text, p_subject text, p_id uuid, p_extra text default '') returns jsonb language plpgsql as $$
declare v jsonb;
begin
  execute format('select public.query_tracking_history(%L, %L, %L, %L, %L, now() - interval ''1 hour'', now()%s)',
    '10000000-0000-0000-0000-00000000000' || p_user, '60000000-0000-0000-0000-0000001550' || p_session, '20000000-0000-0000-0000-00000000000' || p_org,
    p_subject, p_id, p_extra) into v;
  return v;
end $$;
create function pg_temp.kinds(p jsonb) returns jsonb language sql as $$ select coalesce(jsonb_agg(i->>'kind' order by o), '[]') from jsonb_array_elements(p->'items') with ordinality x(i, o) $$;

-- 1. Fronteira e validação.
select ok(not has_function_privilege('authenticated', 'public.query_tracking_history(uuid, uuid, uuid, text, uuid, timestamptz, timestamptz, timestamptz, uuid, integer)', 'execute'),
  'authenticated não consulta o histórico direto');
select is(pg_temp.history('5', 'a5', 'a', 'trip', 'e1560000-0000-0000-0000-0000000000a1')->>'code', 'ACCESS_DENIED', 'sem tracking.read: negado');
select is(pg_temp.history('2', 'a2', 'a', 'van', 'e1560000-0000-0000-0000-0000000000a1')->>'code', 'VALIDATION_FAILED', 'assunto fora do vocabulário');
select is(public.query_tracking_history('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000001550a2', '20000000-0000-0000-0000-00000000000a',
  'trip', 'e1560000-0000-0000-0000-0000000000a1', now(), now() - interval '1 hour')->>'code', 'VALIDATION_FAILED', 'período invertido recusado');
select is(public.query_tracking_history('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000001550a2', '20000000-0000-0000-0000-00000000000a',
  'trip', 'e1560000-0000-0000-0000-0000000000a1', now() - interval '32 days', now())->>'code', 'VALIDATION_FAILED', 'período acima de 31 dias recusado');

-- 2. Viagem: fio cronológico completo do período.
create temporary table h as select pg_temp.history('2', 'a2', 'a', 'trip', 'e1560000-0000-0000-0000-0000000000a1') as r;
select is((select r->>'code' from h), 'LISTED', 'admin A consulta a viagem');
select ok((select bool_and(prev <= cur) from (select lag(i->>'occurred_at') over (order by o) as prev, i->>'occurred_at' as cur
  from h, jsonb_array_elements(r->'items') with ordinality x(i, o)) z where prev is not null), 'em ordem cronológica');
select is((select count(*)::int from h, jsonb_array_elements(r->'items') i where i->>'kind' = 'position' and i->>'origin' = 'mobile'), 3, 'três posições do celular');
select is((select count(*)::int from h, jsonb_array_elements(r->'items') i where i->>'kind' = 'position' and i->>'origin' = 'seal'), 3,
  'as posições do lacre do período, não a antiga');
select is((select count(*)::int from h, jsonb_array_elements(r->'items') i where i->>'kind' = 'comparison' and i->>'result' = 'outside'), 3, 'três comparações fora');
select is((select count(*)::int from h, jsonb_array_elements(r->'items') i where i->>'kind' = 'occurrence'), 1, 'a ocorrência confirmada');
select is((select count(*)::int from h, jsonb_array_elements(r->'items') i where i->>'kind' = 'alert'), 1, 'o alerta do lacre');
select is((select count(*)::int from h, jsonb_array_elements(r->'items') i where i->>'kind' = 'event'), 0, 'o início da viagem ficou antes do período');
select is((select i->>'subject_label' from h, jsonb_array_elements(r->'items') i where i->>'kind' = 'position' and i->>'origin' = 'seal' limit 1),
  'Lacre H · HIS-A-1', 'cada item diz de qual origem veio');

-- 3. Cursor estável: páginas de 4 reconstroem o mesmo fio, sem repetir.
create temporary table p1 as select pg_temp.history('2', 'a2', 'a', 'trip', 'e1560000-0000-0000-0000-0000000000a1', ', p_limit => 4') as r;
create temporary table p2 as select pg_temp.history('2', 'a2', 'a', 'trip', 'e1560000-0000-0000-0000-0000000000a1',
  format(', p_cursor_at => %L, p_cursor_id => %L, p_limit => 4', (select r->'next_cursor'->>'at' from p1), (select r->'next_cursor'->>'id' from p1))) as r;
select is((select jsonb_array_length(r->'items') from p1), 4, 'primeira página com 4');
select is((select jsonb_agg(i->>'id' order by o) from (select i, o from p1, jsonb_array_elements(r->'items') with ordinality x(i, o)
  union all select i, 4 + o from p2, jsonb_array_elements(r->'items') with ordinality x(i, o)) u),
  (select jsonb_agg(i->>'id' order by o) from h, jsonb_array_elements(r->'items') with ordinality x(i, o) where o <= 8), 'a segunda continua de onde parou');

-- 4. Cilindro: o lacre dele e a ocorrência; nada de outra empresa.
select is((select count(*)::int from jsonb_array_elements(pg_temp.history('2', 'a2', 'a', 'cylinder', 'e1510000-0000-0000-0000-0000000000a1')->'items') i
  where i->>'kind' = 'occurrence'), 1, 'o histórico do cilindro traz a ocorrência');
select is(pg_temp.history('2', 'a2', 'a', 'cylinder', 'e1510000-0000-0000-0000-0000000000b1')->>'code', 'NOT_FOUND', 'cilindro do B pelo A: inexistente');
select is(pg_temp.history('3', 'b3', 'b', 'trip', 'e1560000-0000-0000-0000-0000000000a1')->>'code', 'NOT_FOUND', 'viagem do A pelo B: inexistente');
select is((select count(*)::int from h, jsonb_array_elements(r->'items') i where i ? 'address'), 0, 'nenhum endereço no histórico');

select * from finish();
rollback;
