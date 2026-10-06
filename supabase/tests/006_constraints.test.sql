begin;
select plan(34);

-- Spec 006: restrições de integridade do data-model.md (RF-001, RF-002, RF-007 a RF-011, RF-019).
insert into public.cylinder_types (id, organization_id, gas, capacity_value, capacity_unit, classification) values
  ('71000000-0000-0000-0000-0000000000c1', '20000000-0000-0000-0000-00000000000a', 'Argônio', 10, 'l', 'industrial'),
  ('71000000-0000-0000-0000-0000000000c2', '20000000-0000-0000-0000-00000000000b', 'Argônio', 10, 'l', 'industrial');

-- Tipo de cilindro.
select throws_ok($$ insert into public.cylinder_types (organization_id, gas, capacity_value, capacity_unit, classification) values ('20000000-0000-0000-0000-00000000000a', 'X', 10, 'l', 'industrial') $$, '23514', null, 'gás com menos de 2 caracteres é recusado');
select throws_ok($$ insert into public.cylinder_types (organization_id, gas, capacity_value, capacity_unit, classification) values ('20000000-0000-0000-0000-00000000000a', 'Hélio', 0, 'l', 'industrial') $$, '23514', null, 'capacidade zero é recusada');
select throws_ok($$ insert into public.cylinder_types (organization_id, gas, capacity_value, capacity_unit, classification) values ('20000000-0000-0000-0000-00000000000a', 'Hélio', 10, 'gal', 'industrial') $$, '23514', null, 'unidade fora de l, m3 e kg é recusada');
select throws_ok($$ insert into public.cylinder_types (organization_id, gas, capacity_value, capacity_unit, classification) values ('20000000-0000-0000-0000-00000000000a', 'Hélio', 10, 'l', 'comum') $$, '23514', null, 'classificação fora de medicinal e industrial é recusada');
select throws_ok($$ insert into public.cylinder_types (organization_id, gas, capacity_value, capacity_unit, classification) values ('20000000-0000-0000-0000-00000000000a', 'ARGÔNIO', 10, 'l', 'industrial') $$, '23505', null, 'tipo repetido na organização (sem diferença de caixa) é recusado');
select lives_ok($$ insert into public.cylinder_types (organization_id, gas, capacity_value, capacity_unit, classification) values ('20000000-0000-0000-0000-00000000000a', 'Hélio', 7, 'm3', 'medicinal') $$, 'tipo novo é aceito');

-- Cilindro.
select lives_ok($$ insert into public.cylinders (id, organization_id, cylinder_type_id, serial_number, manufacturer, manufacture_year, working_pressure_bar)
  values ('72000000-0000-0000-0000-0000000000c1', '20000000-0000-0000-0000-00000000000a', '71000000-0000-0000-0000-0000000000c1', ' ab-123 ', 'Fábrica', 2020, 200) $$, 'cilindro válido é aceito');
select is((select serial_normalized from public.cylinders where id = '72000000-0000-0000-0000-0000000000c1'), 'AB-123', 'o número de série é normalizado (caixa e espaços nas pontas)');
select is((select status || '/' || stock_status || '/' || version from public.cylinders where id = '72000000-0000-0000-0000-0000000000c1'), 'active/out_of_stock/1', 'padrões: ativo, fora do estoque, versão 1');
select throws_ok($$ insert into public.cylinders (organization_id, cylinder_type_id, serial_number) values ('20000000-0000-0000-0000-00000000000a', '71000000-0000-0000-0000-0000000000c1', 'ab-123') $$, '23505', null, 'mesmo número de série (caixa diferente) na organização é recusado');
select lives_ok($$ insert into public.cylinders (organization_id, cylinder_type_id, serial_number) values ('20000000-0000-0000-0000-00000000000b', '71000000-0000-0000-0000-0000000000c2', 'AB-123') $$, 'o mesmo número de série em outra organização é aceito');
select throws_ok($$ insert into public.cylinders (organization_id, cylinder_type_id, serial_number) values ('20000000-0000-0000-0000-00000000000a', '71000000-0000-0000-0000-0000000000c1', '   ') $$, '23514', null, 'número de série vazio é recusado');
select throws_ok($$ insert into public.cylinders (organization_id, cylinder_type_id, serial_number) values ('20000000-0000-0000-0000-00000000000a', '71000000-0000-0000-0000-0000000000c1', repeat('9', 61)) $$, '23514', null, 'número de série acima de 60 caracteres é recusado');
select throws_ok($$ insert into public.cylinders (organization_id, cylinder_type_id, serial_number) values ('20000000-0000-0000-0000-00000000000a', '71000000-0000-0000-0000-0000000000c2', 'TIPO-OUTRO-TENANT') $$, '23503', null, 'tipo de outra organização é recusado');
select throws_ok($$ insert into public.cylinders (organization_id, cylinder_type_id, serial_number, manufacture_year) values ('20000000-0000-0000-0000-00000000000a', '71000000-0000-0000-0000-0000000000c1', 'ANO-1', 1899) $$, null, null, 'ano de fabricação antes de 1900 é recusado');
select throws_ok($$ insert into public.cylinders (organization_id, cylinder_type_id, serial_number, manufacture_year) values ('20000000-0000-0000-0000-00000000000a', '71000000-0000-0000-0000-0000000000c1', 'ANO-2', extract(year from now())::int + 1) $$, null, null, 'ano de fabricação futuro é recusado');
select throws_ok($$ insert into public.cylinders (organization_id, cylinder_type_id, serial_number, working_pressure_bar) values ('20000000-0000-0000-0000-00000000000a', '71000000-0000-0000-0000-0000000000c1', 'PRESS-1', 0) $$, '23514', null, 'pressão de trabalho zero é recusada');
select throws_ok($$ insert into public.cylinders (organization_id, cylinder_type_id, serial_number, notes) values ('20000000-0000-0000-0000-00000000000a', '71000000-0000-0000-0000-0000000000c1', 'OBS-1', repeat('x', 501)) $$, '23514', null, 'observações acima de 500 caracteres são recusadas');
select throws_ok($$ insert into public.cylinders (organization_id, cylinder_type_id, serial_number, status) values ('20000000-0000-0000-0000-00000000000a', '71000000-0000-0000-0000-0000000000c1', 'INAT-1', 'inactive') $$, '23514', null, 'inativo sem motivo é recusado');
select throws_ok($$ insert into public.cylinders (organization_id, cylinder_type_id, serial_number, status, inactivation_reason, stock_status) values ('20000000-0000-0000-0000-00000000000a', '71000000-0000-0000-0000-0000000000c1', 'INAT-2', 'inactive', 'lost', 'in_stock') $$, '23514', null, 'inativo em estoque é recusado');
select throws_ok($$ insert into public.cylinders (organization_id, cylinder_type_id, serial_number, status, inactivation_reason) values ('20000000-0000-0000-0000-00000000000a', '71000000-0000-0000-0000-0000000000c1', 'INAT-3', 'inactive', 'vendido') $$, '23514', null, 'motivo de inativação fora da lista é recusado');

-- Identificador.
select lives_ok($$ insert into public.cylinder_identifiers (id, organization_id, cylinder_id, kind, value) values ('73000000-0000-0000-0000-0000000000c1', '20000000-0000-0000-0000-00000000000a', '72000000-0000-0000-0000-0000000000c1', 'qr_code', ' qr-1 ') $$, 'identificador válido é aceito');
select is((select value_normalized from public.cylinder_identifiers where id = '73000000-0000-0000-0000-0000000000c1'), 'QR-1', 'o valor do identificador é normalizado');
select throws_ok($$ insert into public.cylinder_identifiers (organization_id, cylinder_id, kind, value) values ('20000000-0000-0000-0000-00000000000a', '72000000-0000-0000-0000-0000000000c1', 'barcode', 'X-1') $$, '23514', null, 'tipo de identificador fora dos quatro é recusado');
select throws_ok($$ insert into public.cylinder_identifiers (organization_id, cylinder_id, kind, value) values ('20000000-0000-0000-0000-00000000000a', '72000000-0000-0000-0000-0000000000c1', 'qr_code', E'QR\n2') $$, '23514', null, 'valor com quebra de linha é recusado');
select throws_ok($$ insert into public.cylinder_identifiers (organization_id, cylinder_id, kind, value) values ('20000000-0000-0000-0000-00000000000a', '72000000-0000-0000-0000-0000000000c1', 'qr_code', repeat('Q', 201)) $$, '23514', null, 'valor acima de 200 caracteres é recusado');
select throws_ok($$ insert into public.cylinder_identifiers (organization_id, cylinder_id, kind, value) values ('20000000-0000-0000-0000-00000000000a', '72000000-0000-0000-0000-0000000000c1', 'data_matrix', 'qr-1') $$, '23505', null, 'valor ativo repetido na organização (outro tipo) é recusado');
select lives_ok($$ insert into public.cylinder_identifiers (organization_id, cylinder_id, kind, value) values ('20000000-0000-0000-0000-00000000000b', (select id from public.cylinders where organization_id = '20000000-0000-0000-0000-00000000000b' and serial_number = 'AB-123'), 'qr_code', 'QR-1') $$, 'o mesmo valor em outra organização é aceito');
select throws_ok($$ update public.cylinder_identifiers set status = 'deactivated', deactivated_at = now(), deactivated_by = '10000000-0000-0000-0000-000000000002', deactivation_justification = 'ruim'
  where id = '73000000-0000-0000-0000-0000000000c1' $$, '23514', null, 'justificativa de desativação com menos de 5 caracteres é recusada');

-- Teste hidrostático.
select throws_ok($$ insert into public.cylinder_tests (organization_id, cylinder_id, performed_on, result, executor, next_due_on) values ('20000000-0000-0000-0000-00000000000a', '72000000-0000-0000-0000-0000000000c1', current_date - 1, 'passou', 'Lab', current_date + 100) $$, '23514', null, 'resultado fora de approved e rejected é recusado');
select throws_ok($$ insert into public.cylinder_tests (organization_id, cylinder_id, performed_on, result, executor) values ('20000000-0000-0000-0000-00000000000a', '72000000-0000-0000-0000-0000000000c1', current_date - 1, 'approved', 'Lab') $$, '23514', null, 'aprovado sem próxima data é recusado');
select throws_ok($$ insert into public.cylinder_tests (organization_id, cylinder_id, performed_on, result, executor, next_due_on) values ('20000000-0000-0000-0000-00000000000a', '72000000-0000-0000-0000-0000000000c1', current_date + 5, 'approved', 'Lab', current_date + 100) $$, null, null, 'data de realização futura é recusada');
select throws_ok($$ insert into public.cylinder_tests (organization_id, cylinder_id, performed_on, result, executor, next_due_on) values ('20000000-0000-0000-0000-00000000000a', '72000000-0000-0000-0000-0000000000c1', current_date - 1, 'approved', 'L', current_date + 100) $$, '23514', null, 'executor com menos de 2 caracteres é recusado');
select throws_ok($$ insert into public.cylinder_tests (organization_id, cylinder_id, performed_on, result, executor, next_due_on) values ('20000000-0000-0000-0000-00000000000a', '72000000-0000-0000-0000-0000000000c1', current_date - 1, 'approved', 'Lab', current_date - 1) $$, '23514', null, 'próxima data não posterior à realização é recusada');

select * from finish(); rollback;
