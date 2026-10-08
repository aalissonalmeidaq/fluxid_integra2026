begin;
select plan(16);

-- Spec 007: imutabilidade do histórico e proibição de exclusão, para qualquer papel (RF-033, CA-002, CA-003).
-- Única exceção: os contatos do cliente só saem pela substituição feita em update_customer (variável de sessão local).

insert into public.customers (id, organization_id, person_type, document_display, legal_name, segment) values
  ('81000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-00000000000a', 'legal', '11222333000181', 'Hospital Alfa Ltda', 'hospital');
insert into public.customer_documents (customer_id, organization_id, kind, document_key) values
  ('81000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-00000000000a', 'cnpj', '11222333000181');
insert into public.customer_contacts (id, organization_id, customer_id, name, position) values
  ('83000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-00000000000a', '81000000-0000-0000-0000-000000000001', 'Contato Comum', 0);
insert into public.customer_contacts (id, organization_id, customer_id, name, position, anonymized_at, anonymized_by) values
  ('83000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-00000000000a', '81000000-0000-0000-0000-000000000001', 'Contato anonimizado', 1,
   now(), '10000000-0000-0000-0000-000000000002');
insert into public.customer_sites (id, organization_id, customer_id, name, postal_code, street, number, city, state) values
  ('82000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-00000000000a', '81000000-0000-0000-0000-000000000001',
   'Unidade Central', '01001000', 'Praça da Sé', '100', 'São Paulo', 'SP');
insert into public.geofences (id, organization_id, site_id, name, shape, center, radius_m, area) values
  ('84000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-00000000000a', '82000000-0000-0000-0000-000000000001',
   'Entrada', 'circle', extensions.st_point(-46.633, -23.55)::extensions.geography, 200,
   extensions.st_buffer(extensions.st_point(-46.633, -23.55)::extensions.geography, 210)::extensions.geography);
insert into public.vehicles (id, organization_id, plate, vehicle_type, capacity_cylinders) values
  ('85000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-00000000000a', 'ABC1234', 'truck', 40);
insert into public.drivers (id, organization_id, full_name, cpf_display, cnh_display, cnh_category, cnh_valid_until) values
  ('86000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-00000000000a', 'Motorista Teste', '***.***.***-25', '********900', 'D', current_date + 365);
insert into public.driver_documents (driver_id, organization_id, cpf, cnh_number) values
  ('86000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-00000000000a', '52998224725', '12345678900');
insert into public.registry_events (id, organization_id, entity_type, entity_id, sequence, event_type, actor_user_id) values
  ('87000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-00000000000a', 'customer', '81000000-0000-0000-0000-000000000001', 1,
   'customer_created', '10000000-0000-0000-0000-000000000002');

-- Histórico: nenhum papel altera ou exclui, nem o dono do banco nem o service_role.
select throws_ok($$update public.registry_events set justification = 'x' where id = '87000000-0000-0000-0000-000000000001'$$,
  'P0001', 'registry_record_immutable', 'update em registry_events é recusado');
select throws_ok($$delete from public.registry_events where id = '87000000-0000-0000-0000-000000000001'$$,
  'P0001', 'registry_record_immutable', 'delete em registry_events é recusado');
select throws_ok($$truncate public.registry_events$$, 'P0001', 'registry_record_immutable', 'truncate em registry_events é recusado');

set local role service_role;
select throws_ok($$update public.registry_events set justification = 'x' where id = '87000000-0000-0000-0000-000000000001'$$,
  'P0001', 'registry_record_immutable', 'update em registry_events é recusado ao service_role');
select throws_ok($$delete from public.registry_events where id = '87000000-0000-0000-0000-000000000001'$$,
  'P0001', 'registry_record_immutable', 'delete em registry_events é recusado ao service_role');
reset role;

-- Cadastro: nada é excluído.
select throws_ok($$delete from public.customers where id = '81000000-0000-0000-0000-000000000001'$$, 'P0001', 'registry_record_undeletable', 'delete em customers é recusado');
select throws_ok($$delete from public.customer_sites where id = '82000000-0000-0000-0000-000000000001'$$, 'P0001', 'registry_record_undeletable', 'delete em customer_sites é recusado');
select throws_ok($$delete from public.geofences where id = '84000000-0000-0000-0000-000000000001'$$, 'P0001', 'registry_record_undeletable', 'delete em geofences é recusado');
select throws_ok($$delete from public.vehicles where id = '85000000-0000-0000-0000-000000000001'$$, 'P0001', 'registry_record_undeletable', 'delete em vehicles é recusado');
select throws_ok($$delete from public.drivers where id = '86000000-0000-0000-0000-000000000001'$$, 'P0001', 'registry_record_undeletable', 'delete em drivers é recusado');
select throws_ok($$delete from public.customer_documents where customer_id = '81000000-0000-0000-0000-000000000001'$$, 'P0001', 'registry_record_undeletable', 'delete em customer_documents é recusado');
select throws_ok($$delete from public.driver_documents where driver_id = '86000000-0000-0000-0000-000000000001'$$, 'P0001', 'registry_record_undeletable', 'delete em driver_documents é recusado');
select throws_ok($$truncate public.customers cascade$$, 'P0001', 'registry_record_undeletable', 'truncate em customers é recusado');

-- Contatos: delete direto é recusado; só vale dentro da substituição, e nunca para contato anonimizado.
select throws_ok($$delete from public.customer_contacts where id = '83000000-0000-0000-0000-000000000001'$$, 'P0001', 'registry_record_undeletable', 'delete direto de contato é recusado');
select lives_ok($$select set_config('app.registry_contacts_replace', 'on', true);
                  delete from public.customer_contacts where id = '83000000-0000-0000-0000-000000000001'$$,
  'delete de contato é aceito dentro da substituição feita por update_customer');
select throws_ok($$select set_config('app.registry_contacts_replace', 'on', true);
                   delete from public.customer_contacts where id = '83000000-0000-0000-0000-000000000002'$$,
  'P0001', 'registry_record_undeletable', 'contato anonimizado nunca é removido, nem dentro da substituição');

select * from finish();
rollback;
