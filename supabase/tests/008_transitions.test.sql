begin;
select plan(42);

-- Spec 008 (data-model.md, "Transições"; CA-003): cada operação de transição só vale a partir do estado de origem; qualquer outra é recusada
-- com INVALID_TRANSITION (ou TRIP_CLOSED nas duas finais), inclusive por chamada direta à RPC, e nada muda. Esta tabela percorre as operações
-- das histórias já criadas; as das histórias seguintes entram na lista conforme são criadas. Hermético: desfeito pelo rollback.

delete from public.user_sessions where user_id in (
  '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000003');
select public.start_user_session('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000800a2', 'aal1');

insert into public.customers (id, organization_id, person_type, document_display, legal_name, segment) values
  ('91000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', 'legal', '11222333000181', 'Hospital Alfa Ltda', 'hospital');
insert into public.customer_sites (id, organization_id, customer_id, name, postal_code, street, number, city, state) values
  ('92000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-00000000000a', '91000000-0000-0000-0000-00000000000a', 'Unidade 1', '01001000', 'Praça da Sé', '1', 'São Paulo', 'SP');
insert into public.vehicles (id, organization_id, plate, vehicle_type, capacity_cylinders)
  select ('95000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid, '20000000-0000-0000-0000-00000000000a', 'TRN' || (1000 + n), 'truck', 10 from generate_series(1, 5) n;
insert into public.drivers (id, organization_id, full_name, cpf_display, cnh_display, cnh_category, cnh_valid_until)
  select ('96000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid, '20000000-0000-0000-0000-00000000000a', 'Motorista ' || n, 'x' || n, 'y' || n, 'D', current_date + 365 from generate_series(1, 5) n;
insert into public.cylinder_types (id, organization_id, gas, capacity_value, capacity_unit, classification) values
  ('97000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', 'Oxigênio', 10, 'l', 'medicinal');
insert into public.cylinders (id, organization_id, cylinder_type_id, serial_number, stock_status, hydro_last_result, hydro_next_due_on)
  select ('98000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid, '20000000-0000-0000-0000-00000000000a', '97000000-0000-0000-0000-00000000000a', 'TRN-' || n, 'in_stock', 'approved', current_date + 200 from generate_series(1, 5) n;

-- Uma viagem em cada situação, com um item planejado (nas finais, o item já estava fora de jogo e o cilindro é outro).
insert into public.trips (id, organization_id, number, planned_date, vehicle_id, driver_id, created_by, status, started_at, started_by, completed_at, completed_by, cancelled_at, cancelled_by, cancel_reason) values
  ('99000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-00000000000a', 1, current_date, '95000000-0000-0000-0000-000000000001', '96000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', 'planned', null, null, null, null, null, null, null),
  ('99000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-00000000000a', 2, current_date, '95000000-0000-0000-0000-000000000002', '96000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', 'loading', null, null, null, null, null, null, null),
  ('99000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-00000000000a', 3, current_date, '95000000-0000-0000-0000-000000000003', '96000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000002', 'in_progress', now(), '10000000-0000-0000-0000-000000000002', null, null, null, null, null),
  ('99000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-00000000000a', 4, current_date, '95000000-0000-0000-0000-000000000004', '96000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000002', 'completed', now(), '10000000-0000-0000-0000-000000000002', now(), '10000000-0000-0000-0000-000000000002', null, null, null),
  ('99000000-0000-0000-0000-000000000005', '20000000-0000-0000-0000-00000000000a', 5, current_date, '95000000-0000-0000-0000-000000000005', '96000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000002', 'cancelled', null, null, null, null, now(), '10000000-0000-0000-0000-000000000002', 'Cancelada para o teste');
insert into public.trip_stops (id, organization_id, trip_id, site_id, position, status, arrived_at, closed_at)
  select ('9a000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid, '20000000-0000-0000-0000-00000000000a', ('99000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid,
         '92000000-0000-0000-0000-000000000001', 1, case when n = 4 then 'delivered' else 'pending' end, case when n = 4 then now() end, case when n = 4 then now() end from generate_series(1, 5) n;
insert into public.trip_items (id, organization_id, trip_id, stop_id, cylinder_id, item_status, checked_at, created_by)
  select ('9b000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid, '20000000-0000-0000-0000-00000000000a', ('99000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid,
         ('9a000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid, ('98000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid,
         case n when 3 then 'in_transit' when 4 then 'delivered' when 5 then 'released' else 'planned' end, case when n in (3, 4) then now() end, '10000000-0000-0000-0000-000000000002'
    from generate_series(1, 5) n;

create function pg_temp.trip_id(n integer) returns uuid language sql as $$ select ('99000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid $$;
-- Chama a operação pelo nome, como administrador do A (que tem todas as permissões de viagem).
create function pg_temp.op(p_name text, p_n integer) returns jsonb language plpgsql as $$
declare
  u constant uuid := '10000000-0000-0000-0000-000000000002';
  s constant uuid := '60000000-0000-0000-0000-0000000800a2';
  o constant uuid := '20000000-0000-0000-0000-00000000000a';
  t uuid := pg_temp.trip_id(p_n);
  i uuid := ('9b000000-0000-0000-0000-' || lpad(p_n::text, 12, '0'))::uuid;
  v bigint := (select version from public.trips where id = t);
begin
  return case p_name
    when 'start_loading' then public.start_loading(u, s, o, gen_random_uuid(), t, v)
    when 'revert_loading' then public.revert_loading(u, s, o, gen_random_uuid(), t, v)
    when 'check_item' then public.check_item(u, s, o, gen_random_uuid(), t, i)
    when 'uncheck_item' then public.uncheck_item(u, s, o, gen_random_uuid(), t, i)
    when 'remove_item' then public.remove_item(u, s, o, gen_random_uuid(), t, i, 'Justificativa de teste')
    when 'start_trip' then public.start_trip(u, s, o, gen_random_uuid(), t, v)
  end;
end $$;
create function pg_temp.snapshot() returns text language sql as $$
  select string_agg(t.id::text || t.status || t.version, ',' order by t.id) || '|' || (select string_agg(i.id::text || i.item_status, ',' order by i.id) from public.trip_items i) from public.trips t
$$;
create temp table before_state as select pg_temp.snapshot() as s;

-- Origem válida de cada operação (as demais combinações devem ser recusadas). Viagens: 1 planned, 2 loading, 3 in_progress, 4 completed, 5 cancelled.
-- Operações de item no carregamento: o item da viagem 2 está "planned", então conferir e retirar valem; desfazer conferência não (nada conferido).
select is(pg_temp.op(o, n) ->> 'code', e, o || ' na viagem ' || n || ' (' || s || ')')
  from (values
    ('start_loading', 2, 'loading', 'INVALID_TRANSITION'), ('start_loading', 3, 'in_progress', 'INVALID_TRANSITION'), ('start_loading', 4, 'completed', 'TRIP_CLOSED'), ('start_loading', 5, 'cancelled', 'TRIP_CLOSED'),
    ('revert_loading', 1, 'planned', 'INVALID_TRANSITION'), ('revert_loading', 3, 'in_progress', 'INVALID_TRANSITION'), ('revert_loading', 4, 'completed', 'TRIP_CLOSED'), ('revert_loading', 5, 'cancelled', 'TRIP_CLOSED'),
    ('check_item', 1, 'planned', 'INVALID_TRANSITION'), ('check_item', 3, 'in_progress', 'INVALID_TRANSITION'), ('check_item', 4, 'completed', 'TRIP_CLOSED'), ('check_item', 5, 'cancelled', 'TRIP_CLOSED'),
    ('uncheck_item', 1, 'planned', 'INVALID_TRANSITION'), ('uncheck_item', 2, 'loading, item não conferido', 'INVALID_TRANSITION'), ('uncheck_item', 3, 'in_progress', 'INVALID_TRANSITION'),
    ('uncheck_item', 4, 'completed', 'TRIP_CLOSED'), ('uncheck_item', 5, 'cancelled', 'TRIP_CLOSED'),
    ('remove_item', 1, 'planned', 'INVALID_TRANSITION'), ('remove_item', 3, 'in_progress', 'INVALID_TRANSITION'), ('remove_item', 4, 'completed', 'TRIP_CLOSED'), ('remove_item', 5, 'cancelled', 'TRIP_CLOSED'),
    ('start_trip', 1, 'planned', 'INVALID_TRANSITION'), ('start_trip', 3, 'in_progress', 'INVALID_TRANSITION'), ('start_trip', 4, 'completed', 'TRIP_CLOSED'), ('start_trip', 5, 'cancelled', 'TRIP_CLOSED')
  ) as v(o, n, s, e);

-- Nada mudou depois de 25 recusas.
select is(pg_temp.snapshot(), (select s from before_state), 'nenhuma recusa alterou viagem ou item');

-- A resposta de INVALID_TRANSITION traz de onde e para onde.
select is(pg_temp.op('start_loading', 3) ->> 'from', 'in_progress', 'start_loading em andamento: from');
select is(pg_temp.op('start_loading', 3) ->> 'to', 'loading', 'start_loading em andamento: to');
select is(pg_temp.op('start_trip', 1) ->> 'to', 'in_progress', 'start_trip planejada: to');
select is(pg_temp.op('check_item', 4) ->> 'code', 'TRIP_CLOSED', 'viagem concluída é final');

-- Origem válida: cada uma funciona uma vez e a seguinte, da nova origem, é recusada.
select is(pg_temp.op('start_loading', 1) ->> 'code', 'LOADING', 'start_loading em planejada: LOADING');
select is((select status from public.trips where id = pg_temp.trip_id(1)), 'loading', 'status loading');
select is(pg_temp.op('check_item', 2) ->> 'code', 'CHECKED', 'check_item em carregando');
select is(pg_temp.op('revert_loading', 2) ->> 'code', 'INVALID_TRANSITION', 'revert_loading com item conferido');
select is(pg_temp.op('uncheck_item', 2) ->> 'code', 'UNCHECKED', 'uncheck_item do conferido');
select is(pg_temp.op('revert_loading', 2) ->> 'code', 'REVERTED', 'revert_loading sem nada conferido');
select is((select status from public.trips where id = pg_temp.trip_id(2)), 'planned', 'volta a planejada');
select is(pg_temp.op('remove_item', 1) ->> 'code', 'REMOVED', 'remove_item em carregando');
select is(pg_temp.op('start_trip', 1) ->> 'code', 'VALIDATION_FAILED', 'iniciar sem nenhum cilindro conferido para levar');

-- O bloqueio nunca volta e o item entregue/liberado não é tocado por estas operações.
select is((select item_status from public.trip_items where id = '9b000000-0000-0000-0000-000000000004'), 'delivered', 'item entregue intacto');
select is((select item_status from public.trip_items where id = '9b000000-0000-0000-0000-000000000005'), 'released', 'item liberado intacto');
select is((select count(*)::int from public.trip_items where lock_status <> 'none'), 0, 'nenhum bloqueio nasceu fora do início da viagem');

select * from finish();
rollback;
