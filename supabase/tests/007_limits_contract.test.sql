begin;
select plan(6);

-- Spec 007: limites únicos no banco (RF-014, RF-015, RF-022). O mesmo contrato é conferido no TypeScript por
-- tests/contract/registry-limits.test.ts.
select is((private.geofence_limits()->>'radius_min_m')::int, 25, 'raio mínimo da geocerca é 25 m');
select is((private.geofence_limits()->>'radius_max_m')::int, 5000, 'raio máximo da geocerca é 5000 m');
select is((private.geofence_limits()->>'vertices_min')::int, 3, 'o polígono tem no mínimo 3 vértices');
select is((private.geofence_limits()->>'vertices_max')::int, 100, 'o polígono tem no máximo 100 vértices');
select is(private.document_expiring_days(), private.hydrostatic_expiring_days(),
  'o limite de "a vencer" de documentos é o mesmo do teste hidrostático (um só lugar)');
select is(private.document_expiring_days(), 30, 'o limite de "a vencer" é de 30 dias');

select * from finish();
rollback;
