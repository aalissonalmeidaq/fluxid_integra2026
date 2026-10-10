begin;
select plan(12);

-- Spec 008: custódia do cilindro e tipos novos de evento (RF-024). As restrições antigas da Spec 006 continuam valendo.
-- Hermético: desfeito pelo rollback.

insert into public.customers (id, organization_id, person_type, document_display, legal_name, segment) values
  ('91000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', 'legal', '11222333000181', 'Hospital Alfa Ltda', 'hospital'),
  ('91000000-0000-0000-0000-00000000000b', '20000000-0000-0000-0000-00000000000b', 'legal', '11222333000181', 'Hospital Beta Ltda', 'hospital');
insert into public.customer_sites (id, organization_id, customer_id, name, postal_code, street, number, city, state) values
  ('92000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', '91000000-0000-0000-0000-00000000000a', 'Unidade A', '01001000', 'Praça da Sé', '1', 'São Paulo', 'SP'),
  ('92000000-0000-0000-0000-00000000000b', '20000000-0000-0000-0000-00000000000b', '91000000-0000-0000-0000-00000000000b', 'Unidade B', '01001000', 'Praça da Sé', '1', 'São Paulo', 'SP');
insert into public.cylinder_types (id, organization_id, gas, capacity_value, capacity_unit, classification) values
  ('97000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', 'Oxigênio', 10, 'l', 'medicinal');
insert into public.cylinders (id, organization_id, cylinder_type_id, serial_number) values
  ('98000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-00000000000a', '97000000-0000-0000-0000-00000000000a', 'CUS-A-001');

select is((select custody_status from public.cylinders where id = '98000000-0000-0000-0000-000000000001'), 'in_organization', 'custódia padrão: na organização');
select is((select custody_site_id from public.cylinders where id = '98000000-0000-0000-0000-000000000001'), null, 'custódia padrão: sem unidade');
select lives_ok($$ update public.cylinders set custody_status = 'in_transit' where id = '98000000-0000-0000-0000-000000000001' $$, 'em trânsito é aceito sem unidade');
select throws_ok($$ update public.cylinders set custody_status = 'at_customer' where id = '98000000-0000-0000-0000-000000000001' $$, '23514', null, 'no cliente exige a unidade');
select throws_ok($$ update public.cylinders set custody_status = 'in_transit', custody_site_id = '92000000-0000-0000-0000-00000000000a' where id = '98000000-0000-0000-0000-000000000001' $$,
  '23514', null, 'unidade só existe no cliente');
select throws_ok($$ update public.cylinders set custody_status = 'lost' where id = '98000000-0000-0000-0000-000000000001' $$, '23514', null, 'custódia fora da lista é recusada');
select throws_ok($$ update public.cylinders set custody_status = 'at_customer', custody_site_id = '92000000-0000-0000-0000-00000000000b' where id = '98000000-0000-0000-0000-000000000001' $$,
  '23503', null, 'unidade de outra organização é recusada');
select lives_ok($$ update public.cylinders set custody_status = 'at_customer', custody_site_id = '92000000-0000-0000-0000-00000000000a' where id = '98000000-0000-0000-0000-000000000001' $$, 'no cliente com a unidade é aceito');

select lives_ok($$ insert into public.cylinder_events (organization_id, cylinder_id, sequence, event_type, actor_user_id) values
  ('20000000-0000-0000-0000-00000000000a', '98000000-0000-0000-0000-000000000001', 1, 'trip_reserved', '10000000-0000-0000-0000-000000000002'),
  ('20000000-0000-0000-0000-00000000000a', '98000000-0000-0000-0000-000000000001', 2, 'trip_released', '10000000-0000-0000-0000-000000000002'),
  ('20000000-0000-0000-0000-00000000000a', '98000000-0000-0000-0000-000000000001', 3, 'trip_departed', '10000000-0000-0000-0000-000000000002'),
  ('20000000-0000-0000-0000-00000000000a', '98000000-0000-0000-0000-000000000001', 4, 'trip_delivered', '10000000-0000-0000-0000-000000000002'),
  ('20000000-0000-0000-0000-00000000000a', '98000000-0000-0000-0000-000000000001', 5, 'trip_returned', '10000000-0000-0000-0000-000000000002'),
  ('20000000-0000-0000-0000-00000000000a', '98000000-0000-0000-0000-000000000001', 6, 'stock_in', '10000000-0000-0000-0000-000000000002') $$,
  'os cinco tipos novos e um tipo antigo de evento são aceitos');
select throws_ok($$ insert into public.cylinder_events (organization_id, cylinder_id, sequence, event_type, actor_user_id) values
  ('20000000-0000-0000-0000-00000000000a', '98000000-0000-0000-0000-000000000001', 7, 'trip_lost', '10000000-0000-0000-0000-000000000002') $$,
  '23514', null, 'tipo de evento desconhecido continua recusado');
select throws_ok($$ update public.cylinders set status = 'inactive', inactivation_reason = 'lost', stock_status = 'in_stock' where id = '98000000-0000-0000-0000-000000000001' $$,
  '23514', null, 'a restrição antiga (inativo é sempre fora do estoque) continua valendo');
select is((select count(*)::int from pg_constraint where conname = 'cylinders_inactive_out_of_stock_check'), 1, 'cylinders_inactive_out_of_stock_check segue existindo');

select * from finish();
rollback;
