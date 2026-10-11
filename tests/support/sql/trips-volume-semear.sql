-- Massa de volume da Spec 008 (RNF-001): no Tenant F, 10 mil viagens, 50 mil paradas e 200 mil itens de carga, mais 3 eventos por viagem.
-- Exige a massa de cadastros da Spec 007 (registry-volume-semear.sql: 50 mil unidades, 5 mil veículos VOL0001 a VOL5000 e 5 mil motoristas)
-- já carregada. Cria 20 mil cilindros próprios (TRV-000001 a TRV-020000). Todos os dados são fictícios.
-- Somente para ambiente local de teste. A massa entra por inserção privilegiada, nunca pelas funções do aplicativo.
-- Um único bloco DO: `supabase db query --file` executa um comando por vez.
do $$
declare
  org constant uuid := '20000000-0000-0000-0000-00000000000f';
  actor constant uuid := '10000000-0000-0000-0000-000000000002';
begin
  insert into public.cylinder_types (id, organization_id, gas, capacity_value, capacity_unit, classification)
  values ('71000000-0000-0000-0000-0000000f0008', org, 'Volume Viagens', 10, 'l', 'industrial')
  on conflict (id) do nothing;

  -- Cilindros próprios da massa de viagens: ativos, com teste em dia, em estoque.
  insert into public.cylinders (id, organization_id, cylinder_type_id, serial_number, stock_status, hydro_last_result, hydro_next_due_on)
  select ('72000000-0000-0000-0000-' || lpad(to_hex(800000 + n), 12, '0'))::uuid, org, '71000000-0000-0000-0000-0000000f0008',
         'TRV-' || lpad(n::text, 6, '0'), 'in_stock', 'approved', current_date + 300
    from generate_series(1, 20000) n;

  -- Veículos e motoristas numerados pela ordem da massa de cadastros.
  create temporary table trv_vehicles on commit drop as
    select row_number() over (order by plate) as n, id from public.vehicles where organization_id = org and plate like 'VOL%';
  create temporary table trv_drivers on commit drop as
    select row_number() over (order by full_name) as n, id from public.drivers where organization_id = org and full_name like 'Motorista Volume %';
  create temporary table trv_sites on commit drop as
    select row_number() over (order by name) as n, id from public.customer_sites where organization_id = org and name like 'Unidade Volume %';

  -- Viagens: as 4 mil primeiras ocupam um veículo e um motorista próprios (planejada, carregando ou em andamento); o restante é
  -- planejado, concluído ou cancelado e pode repetir veículo e motorista.
  insert into public.trips (id, organization_id, number, planned_date, vehicle_id, driver_id, status, notes, cancel_reason, created_at, created_by,
                            started_at, started_by, completed_at, completed_by, cancelled_at, cancelled_by)
  select ('99000000-0000-0000-0000-' || lpad(to_hex(n), 12, '0'))::uuid, org, n, current_date - (n % 90) + 30,
         (select id from trv_vehicles where trv_vehicles.n = 1 + (g.n - 1) % 5000), (select id from trv_drivers where trv_drivers.n = 1 + (g.n - 1) % 5000),
         g.status, null, case when g.status = 'cancelled' then 'Cancelada na massa de volume' end,
         now() - (n || ' minutes')::interval, actor,
         case when g.status in ('in_progress', 'completed') then now() - (n || ' minutes')::interval end,
         case when g.status in ('in_progress', 'completed') then actor end,
         case when g.status = 'completed' then now() - (n || ' minutes')::interval end, case when g.status = 'completed' then actor end,
         case when g.status = 'cancelled' then now() - (n || ' minutes')::interval end, case when g.status = 'cancelled' then actor end
    from (select n, case when n <= 4000 then (array['planned', 'loading', 'in_progress'])[1 + n % 3]
                         else (array['planned', 'completed', 'completed', 'cancelled'])[1 + n % 4] end as status
            from generate_series(1, 10000) n) g;

  -- Paradas: 5 por viagem, nas unidades da massa de cadastros.
  insert into public.trip_stops (id, organization_id, trip_id, site_id, position, status, arrived_at, closed_at)
  select ('9a000000-0000-0000-0000-' || lpad(to_hex(s), 12, '0'))::uuid, org, ('99000000-0000-0000-0000-' || lpad(to_hex(1 + (s - 1) / 5), 12, '0'))::uuid,
         (select id from trv_sites where trv_sites.n = 1 + (s * 7) % 50000), 1 + (s - 1) % 5,
         case when t.status = 'completed' then 'delivered' else 'pending' end,
         case when t.status = 'completed' then now() - interval '1 hour' end, case when t.status = 'completed' then now() - interval '30 minutes' end
    from generate_series(1, 50000) s
    join public.trips t on t.id = ('99000000-0000-0000-0000-' || lpad(to_hex(1 + (s - 1) / 5), 12, '0'))::uuid;

  -- Itens: 4 por parada. Os 20 mil primeiros são abertos (planejados), cada um com um cilindro diferente; os demais já estão entregues
  -- (não reservam o cilindro) e reaproveitam os cilindros em passo coprimo, sem repetir cilindro na mesma viagem.
  insert into public.trip_items (id, organization_id, trip_id, stop_id, cylinder_id, item_status, lock_status, checked_at, checked_by, created_by)
  select ('9b000000-0000-0000-0000-' || lpad(to_hex(i), 12, '0'))::uuid, org, st.trip_id, st.id,
         ('72000000-0000-0000-0000-' || lpad(to_hex(800000 + 1 + (i * 7) % 20000), 12, '0'))::uuid,
         case when i <= 20000 then 'planned' else 'delivered' end, 'none',
         case when i <= 20000 then null else now() - interval '1 hour' end, case when i <= 20000 then null else actor end, actor
    from generate_series(1, 200000) i
    join public.trip_stops st on st.id = ('9a000000-0000-0000-0000-' || lpad(to_hex(1 + (i - 1) / 4), 12, '0'))::uuid;

  -- Histórico: criação, início e conclusão por viagem.
  insert into public.trip_events (organization_id, trip_id, sequence, event_type, actor_user_id, occurred_at)
  select org, t.id, e.seq, e.kind, actor, t.created_at + (e.seq || ' minutes')::interval
    from public.trips t
    cross join (values (1, 'trip_created'), (2, 'loading_started'), (3, 'trip_started')) as e(seq, kind)
   where t.organization_id = org;

  analyze public.trips;
  analyze public.trip_stops;
  analyze public.trip_items;
  analyze public.trip_events;
end $$;
