begin;
select plan(16);

-- Spec 012, US3: destravamento na entrega comprovada dentro da geocerca (RF-024, MS-004; Clarifications 17/10). A entrega é gravada como
-- a register_delivery da Spec 008 faz (primeiro os itens, depois o registro). Vale a posição do lacre com GPS dos 2 minutos anteriores;
-- sem ela, a do celular com origem "gps"; digitada não comprova. Fora, sem prova ou sem geocerca: nada, e o motivo fica gravado.

insert into public.customers (id, organization_id, person_type, document_display, legal_name, segment) values
  ('a2010000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', 'legal', '11222333000181', 'Hospital Alfa Ltda', 'hospital');
insert into public.customer_sites (id, organization_id, customer_id, name, postal_code, street, number, city, state) values
  ('a2020000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-00000000000a', 'a2010000-0000-0000-0000-00000000000a', 'Unidade com cerca', '01001000', 'Praça da Sé', '1', 'São Paulo', 'SP'),
  ('a2020000-0000-0000-0000-0000000000a2', '20000000-0000-0000-0000-00000000000a', 'a2010000-0000-0000-0000-00000000000a', 'Unidade sem cerca', '01001000', 'Praça da Sé', '2', 'São Paulo', 'SP');
insert into public.geofences (organization_id, site_id, name, shape, center, radius_m, area) values
  ('20000000-0000-0000-0000-00000000000a', 'a2020000-0000-0000-0000-0000000000a1', 'Pátio', 'circle',
   extensions.st_setsrid(extensions.st_makepoint(-39.3, -7.2), 4326)::extensions.geography, 100,
   extensions.st_buffer(extensions.st_setsrid(extensions.st_makepoint(-39.3, -7.2), 4326)::extensions.geography, 100));
insert into public.vehicles (id, organization_id, plate, vehicle_type, capacity_cylinders) values
  ('a2050000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', 'LCR2B34', 'truck', 20);
insert into public.drivers (id, organization_id, full_name, cpf_display, cnh_display, cnh_category, cnh_valid_until) values
  ('a2060000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', 'Motorista A', 'x', 'x', 'D', (now() at time zone 'America/Sao_Paulo')::date + 365);
insert into public.cylinder_types (id, organization_id, gas, capacity_value, capacity_unit, classification) values
  ('a2070000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', 'Oxigênio', 10, 'l', 'medicinal');
insert into public.cylinders (id, organization_id, cylinder_type_id, serial_number)
  select ('a2080000-0000-0000-0000-00000000000' || i)::uuid, '20000000-0000-0000-0000-00000000000a', 'a2070000-0000-0000-0000-00000000000a', 'DLV-' || i
    from generate_series(1, 7) i;
insert into public.seal_devices (id, organization_id, device_code, label, key_hash, created_by, lock_state)
  select ('a2000000-0000-0000-0000-00000000000' || i)::uuid, '20000000-0000-0000-0000-00000000000a', 'DSP-DLVA000' || i, 'Lacre ' || i,
    extensions.digest('k-' || i, 'sha256'), '10000000-0000-0000-0000-000000000002', case when i = 2 then 'unconfirmed' else 'locked' end
    from generate_series(1, 7) i;
insert into public.seal_bindings (organization_id, device_id, cylinder_id, bound_by, bound_at)
  select '20000000-0000-0000-0000-00000000000a', ('a2000000-0000-0000-0000-00000000000' || i)::uuid, ('a2080000-0000-0000-0000-00000000000' || i)::uuid,
    '10000000-0000-0000-0000-000000000002', now() - interval '1 day' from generate_series(1, 7) i;
insert into public.trips (id, organization_id, number, planned_date, vehicle_id, driver_id, status, started_at, started_by, created_by) values
  ('a2090000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', 950, (now() at time zone 'America/Sao_Paulo')::date,
   'a2050000-0000-0000-0000-00000000000a', 'a2060000-0000-0000-0000-00000000000a', 'in_progress', now() - interval '2 hours', '10000000-0000-0000-0000-000000000002',
   '10000000-0000-0000-0000-000000000002');
-- Paradas: 1 (com cerca), 2 (sem cerca), 3 (com cerca, posição digitada).
insert into public.trip_stops (id, organization_id, trip_id, site_id, position, status, arrived_at, arrived_by) values
  ('a20a0000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-00000000000a', 'a2090000-0000-0000-0000-00000000000a', 'a2020000-0000-0000-0000-0000000000a1', 1, 'on_site', now(), '10000000-0000-0000-0000-000000000002'),
  ('a20a0000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-00000000000a', 'a2090000-0000-0000-0000-00000000000a', 'a2020000-0000-0000-0000-0000000000a2', 2, 'on_site', now(), '10000000-0000-0000-0000-000000000002'),
  ('a20a0000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-00000000000a', 'a2090000-0000-0000-0000-00000000000a', 'a2020000-0000-0000-0000-0000000000a1', 3, 'on_site', now(), '10000000-0000-0000-0000-000000000002');
insert into public.trip_items (id, organization_id, trip_id, stop_id, cylinder_id, item_status, lock_status, checked_at, created_by)
  select ('a20b0000-0000-0000-0000-00000000000' || i)::uuid, '20000000-0000-0000-0000-00000000000a', 'a2090000-0000-0000-0000-00000000000a',
    case when i in (1, 2, 3, 4) then 'a20a0000-0000-0000-0000-000000000001' when i = 5 then 'a20a0000-0000-0000-0000-000000000002' else 'a20a0000-0000-0000-0000-000000000003' end::uuid,
    ('a2080000-0000-0000-0000-00000000000' || i)::uuid, 'in_transit', 'locked', now() - interval '2 hours', '10000000-0000-0000-0000-000000000002'
    from generate_series(1, 7) i;
-- Lacre 2 tem uma trava de início ainda pendente (nunca confirmada).
insert into public.seal_commands (organization_id, device_id, cylinder_id, kind, origin, trip_id, trip_item_id) values
  ('20000000-0000-0000-0000-00000000000a', 'a2000000-0000-0000-0000-000000000002', 'a2080000-0000-0000-0000-000000000002', 'lock', 'trip_start',
   'a2090000-0000-0000-0000-00000000000a', 'a20b0000-0000-0000-0000-000000000002');

-- Posições do lacre: 1 dentro (há 1 min), 3 fora (há 1 min, a ~550 m), 5 dentro da unidade sem cerca, 6 antiga (há 10 min).
create function pg_temp.seal_pos(p_device text, p_lat numeric, p_ago interval) returns void language sql as $$
  insert into public.seal_positions (organization_id, device_id, point, quality, read_at, last_seen_at)
  values ('20000000-0000-0000-0000-00000000000a', p_device::uuid, extensions.st_setsrid(extensions.st_makepoint(-39.3, p_lat), 4326)::extensions.geography,
    'gps', now() - p_ago, now() - p_ago)
$$;
select pg_temp.seal_pos('a2000000-0000-0000-0000-000000000001', -7.2002, '1 minute');
select pg_temp.seal_pos('a2000000-0000-0000-0000-000000000003', -7.205, '1 minute');
select pg_temp.seal_pos('a2000000-0000-0000-0000-000000000005', -7.2, '1 minute');
select pg_temp.seal_pos('a2000000-0000-0000-0000-000000000006', -7.2, '10 minutes');

-- Entrega como a register_delivery: itens primeiro, depois o registro.
create function pg_temp.deliver(p_stop text, p_items int[], p_not int[], p_lat numeric, p_source text, p_supersedes uuid default null) returns uuid language plpgsql as $$
declare v uuid;
begin
  update public.trip_items set item_status = 'delivered' where id = any (select ('a20b0000-0000-0000-0000-00000000000' || i)::uuid from unnest(p_items) i);
  update public.trip_items set item_status = 'not_delivered', divergence_reason = 'Cliente recusou.' where id = any (select ('a20b0000-0000-0000-0000-00000000000' || i)::uuid from unnest(p_not) i);
  insert into public.trip_deliveries (organization_id, stop_id, request_id, delivered_at, recipient_name, latitude, longitude, results, recorded_by,
    position_source, position_read_at, supersedes_id, correction_reason)
  values ('20000000-0000-0000-0000-00000000000a', p_stop::uuid, gen_random_uuid(), now(), 'Recebedor Fictício', p_lat, -39.3,
    (select coalesce(jsonb_agg(jsonb_build_object('item_id', ('a20b0000-0000-0000-0000-00000000000' || i)::uuid, 'delivered', true)), '[]') from unnest(p_items) i)
      || (select coalesce(jsonb_agg(jsonb_build_object('item_id', ('a20b0000-0000-0000-0000-00000000000' || i)::uuid, 'delivered', false, 'reason', 'Cliente recusou.')), '[]') from unnest(p_not) i),
    '10000000-0000-0000-0000-000000000002', p_source, case when p_source = 'gps' then now() else null end, p_supersedes,
    case when p_supersedes is null then null else 'Correção da entrega.' end)
  returning id into v;
  return v;
end $$;
create function pg_temp.unlock_of(p_item int) returns text language sql as $$
  select string_agg(origin || ':' || status || ':' || coalesce(proof->>'method', '-'), ',') from public.seal_commands
   where trip_item_id = ('a20b0000-0000-0000-0000-00000000000' || p_item)::uuid and kind = 'unlock'
$$;
create function pg_temp.note(p_item int) returns text language sql as $$
  select seal_unlock_note from public.trip_items where id = ('a20b0000-0000-0000-0000-00000000000' || p_item)::uuid
$$;

create temp table d1 as select pg_temp.deliver('a20a0000-0000-0000-0000-000000000001', array[1, 2, 3], array[4], -7.2001, 'gps') as id;

select is(pg_temp.unlock_of(1), 'delivery:pending:seal', 'lacre com GPS dentro da cerca nos 2 min anteriores: destravar, prova do lacre');
select is(pg_temp.unlock_of(2), 'delivery:pending:phone', 'sem posição recente do lacre: vale a do celular por GPS dentro da cerca');
select is((select status || ':' || cancel_reason from public.seal_commands where trip_item_id = 'a20b0000-0000-0000-0000-000000000002' and kind = 'lock'),
  'cancelled:superseded', 'a trava de início ainda pendente é cancelada com o motivo');
select ok((select proof ? 'previous_lock_state' and proof->>'previous_lock_state' = 'unconfirmed' from public.seal_commands
  where trip_item_id = 'a20b0000-0000-0000-0000-000000000002' and kind = 'unlock'), 'o destravamento registra que a trava anterior não tinha confirmação');
select is(pg_temp.unlock_of(3), null, 'a posição do lacre fora da cerca não destrava, mesmo com o celular dentro');
select is(pg_temp.note(3), 'outside_geofence', 'e o motivo fica gravado para a tela');
select is(pg_temp.unlock_of(4), null, 'cilindro não entregue: nenhum destravamento');
select is((select string_agg(lock_status, ',' order by id) from public.trip_items where id in ('a20b0000-0000-0000-0000-000000000001', 'a20b0000-0000-0000-0000-000000000002')),
  'unlocked,unlocked', 'o desbloqueio lógico da Spec 008 é registrado junto');
select is((select count(*)::int from public.trip_unlocks where item_id in ('a20b0000-0000-0000-0000-000000000001', 'a20b0000-0000-0000-0000-000000000002')), 2,
  'com o registro de desbloqueio');
select ok((select bool_and(proof::text !~ '-7\.|-39\.') from public.seal_commands where kind = 'unlock'), 'a prova não guarda coordenada');

-- Unidade sem geocerca ativa e posição digitada.
select pg_temp.deliver('a20a0000-0000-0000-0000-000000000002', array[5], array[]::int[], -7.2, 'gps');
select is(pg_temp.unlock_of(5), null, 'unidade sem geocerca: nenhum destravamento');
select is(pg_temp.note(5), 'no_geofence', 'motivo: unidade sem geocerca ativa');
select pg_temp.deliver('a20a0000-0000-0000-0000-000000000003', array[6, 7], array[]::int[], -7.2, 'typed');
select is(pg_temp.note(6) || ':' || pg_temp.note(7), 'no_proof:no_proof', 'posição digitada e posição do lacre antiga não comprovam');

-- Correção da entrega: o cilindro destravado passa a "não entregue" e ganha um comando de travar.
select pg_temp.deliver('a20a0000-0000-0000-0000-000000000001', array[2, 3], array[1, 4], -7.2001, 'gps', (select id from d1));
select is((select origin || ':' || status from public.seal_commands where trip_item_id = 'a20b0000-0000-0000-0000-000000000001' and kind = 'lock'),
  'delivery_correction:pending', 'correção para "não entregue" depois do destravamento: travar com origem "correção da entrega"');

-- Cilindro devolvido ao estoque (cancelamento): destravar com origem "cancelamento da viagem".
update public.trip_items set item_status = 'returned' where id = 'a20b0000-0000-0000-0000-000000000004';
select is((select origin from public.seal_commands where trip_item_id = 'a20b0000-0000-0000-0000-000000000004' and kind = 'unlock'), 'trip_cancel',
  'cilindro devolvido ao estoque: destravar com origem "cancelamento da viagem"');
update public.trip_items set item_status = 'not_delivered', divergence_reason = 'x' where id = 'a20b0000-0000-0000-0000-000000000004';
update public.trip_items set item_status = 'returned' where id = 'a20b0000-0000-0000-0000-000000000004';
select is((select count(*)::int from public.seal_commands where trip_item_id = 'a20b0000-0000-0000-0000-000000000004' and origin = 'trip_cancel'), 1,
  'sem duplicar');

select * from finish();
rollback;
