begin;
select plan(4);

-- Spec 008: limites de uma viagem expostos pelo banco (RF-002, RF-003). tests/contract/trips-limits.test.ts compara estes valores
-- com src/domain/trips/trip-limits.ts.

select is((private.trip_limits() ->> 'max_stops')::int, 30, 'máximo de 30 paradas por viagem');
select is((private.trip_limits() ->> 'max_cylinders_per_stop')::int, 200, 'máximo de 200 cilindros por parada');
select is((private.trip_limits() ->> 'max_notes')::int, 500, 'observações até 500 caracteres');
select is((select count(*)::int from jsonb_object_keys(private.trip_limits())), 3, 'o contrato de limites tem exatamente três chaves');

select * from finish();
rollback;
