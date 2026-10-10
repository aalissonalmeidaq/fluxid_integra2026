begin;
select plan(16);

-- Spec 008, RF-024a: entrada no estoque e inativação (Spec 006) recusam cilindro com item de carga aberto (CYLINDER_IN_TRIP) e
-- voltam a aceitá-lo quando o item deixa de estar aberto. reactivate_cylinder não muda. Hermético: desfeito pelo rollback.

delete from public.user_sessions where user_id in (
  '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000003');
select public.start_user_session('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000800a2', 'aal1');

insert into public.customers (id, organization_id, person_type, document_display, legal_name, segment) values
  ('91000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', 'legal', '11222333000181', 'Hospital Alfa Ltda', 'hospital');
insert into public.customer_sites (id, organization_id, customer_id, name, postal_code, street, number, city, state) values
  ('92000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', '91000000-0000-0000-0000-00000000000a', 'Unidade A', '01001000', 'Praça da Sé', '1', 'São Paulo', 'SP');
insert into public.vehicles (id, organization_id, plate, vehicle_type, capacity_cylinders) values
  ('95000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', 'AAA1111', 'truck', 10);
insert into public.drivers (id, organization_id, full_name, cpf_display, cnh_display, cnh_category, cnh_valid_until) values
  ('96000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', 'Motorista A', 'x', 'x', 'D', current_date + 365);
insert into public.cylinder_types (id, organization_id, gas, capacity_value, capacity_unit, classification) values
  ('97000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', 'Oxigênio', 10, 'l', 'medicinal');
insert into public.cylinders (id, organization_id, cylinder_type_id, serial_number, stock_status) values
  ('98000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-00000000000a', '97000000-0000-0000-0000-00000000000a', 'INT-A-001', 'in_stock'),
  ('98000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-00000000000a', '97000000-0000-0000-0000-00000000000a', 'INT-A-002', 'out_of_stock'),
  ('98000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-00000000000a', '97000000-0000-0000-0000-00000000000a', 'INT-A-003', 'out_of_stock');
insert into public.cylinder_identifiers (organization_id, cylinder_id, kind, value) values
  ('20000000-0000-0000-0000-00000000000a', '98000000-0000-0000-0000-000000000001', 'qr_code', 'QR-INT-1'),
  ('20000000-0000-0000-0000-00000000000a', '98000000-0000-0000-0000-000000000002', 'qr_code', 'QR-INT-2'),
  ('20000000-0000-0000-0000-00000000000a', '98000000-0000-0000-0000-000000000003', 'qr_code', 'QR-INT-3');
insert into public.trips (id, organization_id, number, planned_date, vehicle_id, driver_id, created_by, status, started_at, started_by) values
  ('99000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-00000000000a', 7, current_date, '95000000-0000-0000-0000-00000000000a', '96000000-0000-0000-0000-00000000000a',
   '10000000-0000-0000-0000-000000000002', 'in_progress', now(), '10000000-0000-0000-0000-000000000002');
insert into public.trip_stops (id, organization_id, trip_id, site_id, position) values
  ('9a000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-00000000000a', '99000000-0000-0000-0000-000000000001', '92000000-0000-0000-0000-00000000000a', 1);
insert into public.trip_items (id, organization_id, trip_id, stop_id, cylinder_id, item_status, checked_at, created_by) values
  ('9b000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-00000000000a', '99000000-0000-0000-0000-000000000001', '9a000000-0000-0000-0000-000000000001', '98000000-0000-0000-0000-000000000001', 'checked', now(), '10000000-0000-0000-0000-000000000002'),
  ('9b000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-00000000000a', '99000000-0000-0000-0000-000000000001', '9a000000-0000-0000-0000-000000000001', '98000000-0000-0000-0000-000000000002', 'in_transit', now(), '10000000-0000-0000-0000-000000000002'),
  ('9b000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-00000000000a', '99000000-0000-0000-0000-000000000001', '9a000000-0000-0000-0000-000000000001', '98000000-0000-0000-0000-000000000003', 'delivered', now(), '10000000-0000-0000-0000-000000000002');

create function pg_temp.events_of(p_cyl uuid) returns integer language sql as $$
  select count(*)::int from public.cylinder_events where cylinder_id = p_cyl
$$;
create temp table before_counts as select pg_temp.events_of('98000000-0000-0000-0000-000000000001') as c1,
  pg_temp.events_of('98000000-0000-0000-0000-000000000002') as c2, (select count(*)::int from public.audit_logs) as audits;

-- Item em trânsito (cilindro fora do estoque): a entrada no estoque é recusada com a viagem.
select is((public.stock_in_cylinder('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000800a2', '20000000-0000-0000-0000-00000000000a', 'QR-INT-2', gen_random_uuid())) ->> 'code',
  'CYLINDER_IN_TRIP', 'entrada no estoque de cilindro em trânsito: CYLINDER_IN_TRIP');
select is((public.stock_in_cylinder('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000800a2', '20000000-0000-0000-0000-00000000000a', 'QR-INT-2', gen_random_uuid())) ->> 'trip_number',
  '7', 'a resposta traz o número da viagem');
select is((public.stock_in_cylinder('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000800a2', '20000000-0000-0000-0000-00000000000a', 'QR-INT-2', gen_random_uuid())) ->> 'trip_id',
  '99000000-0000-0000-0000-000000000001', 'a resposta traz o id da viagem');
-- Item apenas conferido (cilindro ainda em estoque): CYLINDER_IN_TRIP e não ALREADY_IN_STOCK.
select is((public.stock_in_cylinder('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000800a2', '20000000-0000-0000-0000-00000000000a', 'QR-INT-1', gen_random_uuid())) ->> 'code',
  'CYLINDER_IN_TRIP', 'cilindro reservado em estoque também é recusado como em viagem');

select is((public.inactivate_cylinder('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000800a2', '20000000-0000-0000-0000-00000000000a',
  '98000000-0000-0000-0000-000000000001', 'lost', 'Perdido durante o teste automatizado')) ->> 'code', 'CYLINDER_IN_TRIP', 'inativação de cilindro reservado: CYLINDER_IN_TRIP');
select is((public.inactivate_cylinder('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000800a2', '20000000-0000-0000-0000-00000000000a',
  '98000000-0000-0000-0000-000000000002', 'lost', 'Perdido durante o teste automatizado')) ->> 'trip_number', '7', 'inativação de cilindro em trânsito traz a viagem');

select is((select status from public.cylinders where id = '98000000-0000-0000-0000-000000000001'), 'active', 'nada mudou no cilindro reservado');
select is((select stock_status from public.cylinders where id = '98000000-0000-0000-0000-000000000002'), 'out_of_stock', 'nada mudou no cilindro em trânsito');
select is(pg_temp.events_of('98000000-0000-0000-0000-000000000001') + pg_temp.events_of('98000000-0000-0000-0000-000000000002'),
  (select c1 + c2 from before_counts), 'nenhum evento gravado nas recusas');
select is((select count(*)::int from public.audit_logs), (select audits from before_counts), 'nenhuma auditoria gravada nas recusas');

-- Item entregue não é aberto: a entrada no estoque é aceita.
select is((public.stock_in_cylinder('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000800a2', '20000000-0000-0000-0000-00000000000a', 'QR-INT-3', gen_random_uuid())) ->> 'code',
  'STOCKED', 'depois de entregue, o cilindro entra no estoque');

-- Item liberado, retirado ou devolvido deixa de reservar.
update public.trip_items set item_status = 'released' where id = '9b000000-0000-0000-0000-000000000001';
select is((public.inactivate_cylinder('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000800a2', '20000000-0000-0000-0000-00000000000a',
  '98000000-0000-0000-0000-000000000001', 'lost', 'Perdido durante o teste automatizado')) ->> 'code', 'OK', 'depois de liberado, a inativação é aceita');
update public.trip_items set item_status = 'returned' where id = '9b000000-0000-0000-0000-000000000002';
select is((public.inactivate_cylinder('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000800a2', '20000000-0000-0000-0000-00000000000a',
  '98000000-0000-0000-0000-000000000002', 'lost', 'Perdido durante o teste automatizado')) ->> 'code', 'OK', 'depois de devolvido, a inativação é aceita');

-- reactivate_cylinder não muda.
select is((public.reactivate_cylinder('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000800a2', '20000000-0000-0000-0000-00000000000a',
  '98000000-0000-0000-0000-000000000001', 'Encontrado no depósito')) ->> 'code', 'OK', 'reactivate_cylinder segue igual');
select is((select stock_status from public.cylinders where id = '98000000-0000-0000-0000-000000000001'), 'out_of_stock', 'a reativação devolve o cilindro fora do estoque');
select is((select count(*)::int from public.audit_logs where action = 'cylinder.stock_in' and target_id = '98000000-0000-0000-0000-000000000003'), 1, 'a entrada aceita foi auditada uma vez');

select * from finish();
rollback;
