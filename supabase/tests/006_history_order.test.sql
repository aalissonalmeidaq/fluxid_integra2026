begin;
select plan(10);

-- Spec 006: a ordem do histórico é estável e contínua, também para eventos no mesmo instante (RF-025).
insert into public.cylinder_types (id, organization_id, gas, capacity_value, capacity_unit, classification) values
  ('71000000-0000-0000-0000-0000000000e1', '20000000-0000-0000-0000-00000000000a', 'CO2', 20, 'kg', 'industrial');
insert into public.cylinders (id, organization_id, cylinder_type_id, serial_number) values
  ('72000000-0000-0000-0000-0000000000e1', '20000000-0000-0000-0000-00000000000a', '71000000-0000-0000-0000-0000000000e1', 'ORD-001'),
  ('72000000-0000-0000-0000-0000000000e2', '20000000-0000-0000-0000-00000000000a', '71000000-0000-0000-0000-0000000000e1', 'ORD-002');

select is(private.append_cylinder_event('72000000-0000-0000-0000-0000000000e1', '20000000-0000-0000-0000-00000000000a', 'cylinder_created',
  '10000000-0000-0000-0000-000000000002', null, null, '{"a":1}'), 1, 'o primeiro evento recebe a sequência 1');
select is(private.append_cylinder_event('72000000-0000-0000-0000-0000000000e1', '20000000-0000-0000-0000-00000000000a', 'identifier_added',
  '10000000-0000-0000-0000-000000000002', null, null, '{}'), 2, 'o segundo recebe a 2, no mesmo instante da transação');
select is(private.append_cylinder_event('72000000-0000-0000-0000-0000000000e1', '20000000-0000-0000-0000-00000000000a', 'stock_in',
  '10000000-0000-0000-0000-000000000002', null, null, '{}'), 3, 'o terceiro recebe a 3');

-- A sequência é por cilindro.
select is(private.append_cylinder_event('72000000-0000-0000-0000-0000000000e2', '20000000-0000-0000-0000-00000000000a', 'cylinder_created',
  '10000000-0000-0000-0000-000000000002', null, null, '{}'), 1, 'outro cilindro recomeça na sequência 1');

-- Eventos da mesma transação têm o mesmo occurred_at, mas a ordem por sequência é única e contínua.
select is((select count(distinct occurred_at)::int from public.cylinder_events where cylinder_id = '72000000-0000-0000-0000-0000000000e1'), 1, 'os três eventos têm o mesmo instante');
select is((select array_agg(sequence order by sequence) from public.cylinder_events where cylinder_id = '72000000-0000-0000-0000-0000000000e1'), array[1,2,3], 'a sequência é contínua e sem lacunas');
select is((select array_agg(event_type order by sequence) from public.cylinder_events where cylinder_id = '72000000-0000-0000-0000-0000000000e1'),
  array['cylinder_created','identifier_added','stock_in'], 'a ordem de leitura reproduz a ordem de registro');

-- Referência a evento anterior e autoria.
select lives_ok($$ select private.append_cylinder_event('72000000-0000-0000-0000-0000000000e1', '20000000-0000-0000-0000-00000000000a', 'cylinder_updated',
  '10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000e0001', 'ajuste', '{}',
  (select id from public.cylinder_events where cylinder_id = '72000000-0000-0000-0000-0000000000e1' and sequence = 1)) $$, 'um evento pode referenciar o anterior');
select is((select justification from public.cylinder_events where cylinder_id = '72000000-0000-0000-0000-0000000000e1' and sequence = 4), 'ajuste', 'a justificativa é gravada');

-- Cilindro de outra organização ou inexistente: erro sem gravar nada.
select throws_ok($$ select private.append_cylinder_event('72000000-0000-0000-0000-0000000000e1', '20000000-0000-0000-0000-00000000000b', 'cylinder_updated',
  '10000000-0000-0000-0000-000000000003', null, null, '{}') $$, 'P0002', 'cylinder_not_found', 'organização diferente da do cilindro: não encontrado');

select * from finish(); rollback;
