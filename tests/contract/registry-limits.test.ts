// @vitest-environment node
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { GEOFENCE_LIMITS } from '../../src/domain/registry/geofence-limits';
import { EXPIRING_DAYS } from '../../src/domain/shared/validity-status';
import { CNH_CATEGORIES, SEGMENTS, UFS, VEHICLE_TYPES } from '../../src/domain/registry/registry-vocabulary';

// Spec 007 (RF-014, RF-015, RF-022): os limites e vocabulários do TypeScript e do SQL são os mesmos.
const ROOT = path.resolve(import.meta.dirname, '../..');
const MIGRATIONS = path.join(ROOT, 'supabase', 'migrations');
const all = fs.readdirSync(MIGRATIONS).map((name) => ({ name, text: fs.readFileSync(path.join(MIGRATIONS, name), 'utf8') }));
const schema = all.find((file) => file.name.endsWith('_registry_schema.sql'))!.text;

describe('limites únicos', () => {
  it('os limites da geocerca no TypeScript são os de private.geofence_limits()', () => {
    const match = /jsonb_build_object\('radius_min_m', (\d+), 'radius_max_m', (\d+), 'vertices_min', (\d+), 'vertices_max', (\d+)\)/.exec(schema);
    expect(match).not.toBeNull();
    expect({ radiusMinM: Number(match![1]), radiusMaxM: Number(match![2]), verticesMin: Number(match![3]), verticesMax: Number(match![4]) }).toEqual(GEOFENCE_LIMITS);
  });

  it('o limite de "a vencer" é o mesmo do SQL, e o do documento vem dele', () => {
    const hydro = all.find((file) => file.name.endsWith('_cylinders_hydro_helpers.sql'))!.text;
    const days = /hydrostatic_expiring_days\(\) returns integer[\s\S]*?select (\d+)/.exec(hydro);
    expect(Number(days?.[1])).toBe(EXPIRING_DAYS);
    expect(schema).toMatch(/document_expiring_days\(\) returns integer language sql stable set search_path = '' as \$\$\s*select private\.hydrostatic_expiring_days\(\)/);
  });

  it('o raio e os vértices do SQL entram nas restrições da tabela, sem número repetido à mão', () => {
    expect(schema).toMatch(/radius_m between \(private\.geofence_limits\(\)->>'radius_min_m'\)::integer and \(private\.geofence_limits\(\)->>'radius_max_m'\)::integer/);
    expect(schema).toMatch(/jsonb_array_length\(vertices\) between \(private\.geofence_limits\(\)->>'vertices_min'\)::integer and \(private\.geofence_limits\(\)->>'vertices_max'\)::integer/);
  });
});

describe('vocabulários', () => {
  const listOf = (text: string): string[] => [...text.matchAll(/'([A-Za-z]+)'/g)].map((match) => match[1] as string);

  it('segmentos, tipos de veículo e categorias de CNH iguais às restrições do banco', () => {
    expect(listOf(/customers_segment_check check \(segment in \(([^)]*)\)/.exec(schema)![1]!)).toEqual([...SEGMENTS]);
    expect(listOf(/vehicles_type_check check \(vehicle_type in \(([^)]*)\)/.exec(schema)![1]!)).toEqual([...VEHICLE_TYPES]);
    expect(listOf(/drivers_category_check check \(cnh_category in \(([^)]*)\)/.exec(schema)![1]!)).toEqual([...CNH_CATEGORIES]);
  });

  it('as 27 UFs do TypeScript são as do banco', () => {
    const block = /customer_sites_state_check check \(state = any \(array\[([\s\S]*?)\]\)\)/.exec(schema)![1]!;
    expect(listOf(block)).toEqual([...UFS].sort((a, b) => listOf(block).indexOf(a) - listOf(block).indexOf(b)));
    expect(UFS).toHaveLength(27);
  });
});
