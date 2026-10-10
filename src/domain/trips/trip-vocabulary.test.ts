// @vitest-environment node
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CHECK_SOURCES, CUSTODY_STATUSES, CUSTODY_STATUS_LABELS, CYLINDER_TRIP_EVENT_LABELS, CYLINDER_TRIP_EVENT_TYPES, isFinalTrip, isOpenItem, ITEM_STATUS_LABELS,
  ITEM_STATUSES, LOCK_STATUS_LABELS, LOCK_STATUSES, OPEN_ITEM_STATUSES, STOP_STATUS_LABELS, STOP_STATUSES, TRIP_EVENT_LABELS, TRIP_EVENT_TYPES,
  TRIP_STATUS_LABELS, TRIP_STATUSES,
} from './trip-vocabulary';

// Contrato com o SQL (RF-008): as listas do TypeScript são exatamente as das restrições do banco.
const ROOT = path.resolve(import.meta.dirname, '../../..');
const MIGRATIONS = path.join(ROOT, 'supabase', 'migrations');
const read = (suffix: string): string => {
  const name = fs.readdirSync(MIGRATIONS).find((file) => file.endsWith(suffix));
  return fs.readFileSync(path.join(MIGRATIONS, name!), 'utf8');
};
const schema = read('_trips_schema.sql');
const listAfter = (pattern: RegExp): string[] => [...pattern.exec(schema)![1]!.matchAll(/'([a-z_]+)'/g)].map((match) => match[1] as string);

describe('vocabulário igual ao do banco', () => {
  it('situações da viagem, da parada e do item', () => {
    expect(listAfter(/trips_status_check check \(status in \(([^)]*)\)/)).toEqual([...TRIP_STATUSES]);
    expect(listAfter(/trip_stops_status_check check \(status in \(([^)]*)\)/)).toEqual([...STOP_STATUSES]);
    expect(listAfter(/trip_items_status_check check \(item_status in \(([^)]*)\)/)).toEqual([...ITEM_STATUSES]);
  });

  it('bloqueio, custódia e origem da conferência', () => {
    expect(listAfter(/trip_items_lock_check check \(lock_status in \(([^)]*)\)/)).toEqual([...LOCK_STATUSES]);
    expect(listAfter(/cylinders_custody_check check \(custody_status in \(([^)]*)\)/)).toEqual([...CUSTODY_STATUSES]);
    expect([...CHECK_SOURCES]).toEqual(['manual']);
    expect(schema).toContain("check_source is null or check_source = 'manual'");
  });

  it('tipos de evento da viagem e do cilindro', () => {
    expect(listAfter(/trip_events_type_check check \(event_type in \(([^)]*)\)/)).toEqual([...TRIP_EVENT_TYPES]);
    const cylinderTypes = listAfter(/cylinder_events_type_check check \(event_type in \(([^)]*)\)/);
    expect(cylinderTypes.slice(-CYLINDER_TRIP_EVENT_TYPES.length)).toEqual([...CYLINDER_TRIP_EVENT_TYPES]);
    expect(cylinderTypes).toHaveLength(17);
  });

  it('a coluna gerada is_open usa as situações que reservam o cilindro', () => {
    const generated = /is_open boolean generated always as \(item_status in \(([^)]*)\)\)/.exec(schema)![1]!;
    expect([...generated.matchAll(/'([a-z_]+)'/g)].map((match) => match[1])).toEqual([...OPEN_ITEM_STATUSES]);
  });
});

describe('rótulos em português', () => {
  it('cada valor tem rótulo', () => {
    for (const value of TRIP_STATUSES) expect(TRIP_STATUS_LABELS[value]).toBeTruthy();
    for (const value of STOP_STATUSES) expect(STOP_STATUS_LABELS[value]).toBeTruthy();
    for (const value of ITEM_STATUSES) expect(ITEM_STATUS_LABELS[value]).toBeTruthy();
    for (const value of LOCK_STATUSES) expect(LOCK_STATUS_LABELS[value]).toBeTruthy();
    for (const value of CUSTODY_STATUSES) expect(CUSTODY_STATUS_LABELS[value]).toBeTruthy();
    for (const value of TRIP_EVENT_TYPES) expect(TRIP_EVENT_LABELS[value]).toBeTruthy();
    for (const value of CYLINDER_TRIP_EVENT_TYPES) expect(CYLINDER_TRIP_EVENT_LABELS[value]).toBeTruthy();
  });

  it('o bloqueio e o trânsito aparecem como o produto os chama', () => {
    expect(LOCK_STATUS_LABELS.locked).toBe('Bloqueado (lógico)');
    expect(ITEM_STATUS_LABELS.in_transit).toBe('Em trânsito');
    expect(ITEM_STATUS_LABELS.not_delivered).toBe('Não entregue');
  });
});

describe('funções auxiliares', () => {
  it('item aberto é o que reserva o cilindro', () => {
    expect(ITEM_STATUSES.filter(isOpenItem)).toEqual(['planned', 'checked', 'in_transit', 'not_delivered']);
  });

  it('viagem concluída ou cancelada é final', () => {
    expect(TRIP_STATUSES.filter(isFinalTrip)).toEqual(['completed', 'cancelled']);
  });
});
