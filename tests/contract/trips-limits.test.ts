// @vitest-environment node
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { TRIP_LIMITS } from '../../src/domain/trips/trip-limits';

// Spec 008 (RF-002, RF-003): os limites do TypeScript são os de private.trip_limits() e das restrições das tabelas.
const ROOT = path.resolve(import.meta.dirname, '../..');
const MIGRATIONS = path.join(ROOT, 'supabase', 'migrations');
const schema = fs.readFileSync(path.join(MIGRATIONS, fs.readdirSync(MIGRATIONS).find((name) => name.endsWith('_trips_schema.sql'))!), 'utf8');

describe('limites únicos da viagem', () => {
  it('private.trip_limits() devolve os limites do TypeScript', () => {
    const match = /jsonb_build_object\('max_stops', (\d+), 'max_cylinders_per_stop', (\d+), 'max_notes', (\d+)\)/.exec(schema);
    expect(match).not.toBeNull();
    expect({ maxStops: Number(match![1]), maxCylindersPerStop: Number(match![2]), maxNotes: Number(match![3]) }).toEqual({
      maxStops: TRIP_LIMITS.maxStops, maxCylindersPerStop: TRIP_LIMITS.maxCylindersPerStop, maxNotes: TRIP_LIMITS.maxNotes,
    });
  });

  it('as restrições das tabelas usam os mesmos números', () => {
    expect(schema).toContain(`char_length(notes) <= ${TRIP_LIMITS.maxNotes}`);
    expect(schema).toContain(`position between 1 and ${TRIP_LIMITS.maxStops}`);
    expect(schema).toContain(`char_length(btrim(recipient_name)) between ${TRIP_LIMITS.recipientNameMin} and ${TRIP_LIMITS.recipientNameMax}`);
    expect(schema).toContain(`char_length(recipient_role) <= ${TRIP_LIMITS.recipientRoleMax}`);
    expect(schema).toContain(`char_length(btrim(justification)) between ${TRIP_LIMITS.justificationMin} and ${TRIP_LIMITS.justificationMax}`);
  });
});
