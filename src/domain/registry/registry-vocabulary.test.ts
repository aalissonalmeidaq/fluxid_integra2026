// @vitest-environment node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CNH_CATEGORIES, ENTITY_STATUSES, ENTITY_STATUS_LABELS, ENTITY_TYPES, EVENT_TYPES, EVENT_TYPE_LABELS, GEOFENCE_SHAPES, SEGMENTS,
  SEGMENT_LABELS, UFS, VEHICLE_STATUSES, VEHICLE_STATUS_LABELS, VEHICLE_TYPES, VEHICLE_TYPE_LABELS, DOCUMENT_KINDS, PERSON_TYPES,
  ANONYMIZATION_REASONS, ANONYMIZATION_REASON_LABELS, VALIDITY_LABELS,
} from './registry-vocabulary';

const schema = readFileSync(join(__dirname, '..', '..', '..', 'supabase', 'migrations', '20261007120100_registry_schema.sql'), 'utf8');

// Lê a lista `in ('a', 'b')` ou `= any (array['a', 'b'])` que vem logo depois de um trecho do SQL.
function sqlList(after: string): string[] {
  const start = schema.indexOf(after);
  expect(start, `trecho não encontrado no SQL: ${after}`).toBeGreaterThan(-1);
  const rest = schema.slice(start + after.length);
  const close = rest.indexOf('))');
  return [...rest.slice(0, close).matchAll(/'([^']+)'/g)].map((match) => match[1] as string);
}

describe('vocabulário igual ao do banco (data-model.md)', () => {
  it('tipos de pessoa', () => expect(sqlList('customers_person_type_check check (person_type in (')).toEqual([...PERSON_TYPES]));
  it('segmentos', () => expect(sqlList('customers_segment_check check (segment in (')).toEqual([...SEGMENTS]));
  it('situações cadastrais', () => expect(sqlList('customers_status_check check (status in (')).toEqual([...ENTITY_STATUSES]));
  it('tipos de documento', () => expect(sqlList('customer_documents_kind_check check (kind in (')).toEqual([...DOCUMENT_KINDS]));
  it('tipos de veículo', () => expect(sqlList('vehicles_type_check check (vehicle_type in (')).toEqual([...VEHICLE_TYPES]));
  it('situações do veículo', () => expect(sqlList('vehicles_status_check check (status in (')).toEqual([...VEHICLE_STATUSES]));
  it('categorias da CNH', () => expect(sqlList('drivers_category_check check (cnh_category in (')).toEqual([...CNH_CATEGORIES]));
  it('formas de geocerca', () => expect(sqlList('geofences_shape_check check (shape in (')).toEqual([...GEOFENCE_SHAPES]));
  it('tipos de entidade do histórico', () => expect(sqlList('registry_events_entity_check check (entity_type in (')).toEqual([...ENTITY_TYPES]));
  it('tipos de evento do histórico', () => expect(sqlList('registry_events_type_check check (event_type in (')).toEqual([...EVENT_TYPES]));
  it('as 27 UFs', () => {
    const lista = sqlList('customer_sites_state_check check (state = any (array[');
    expect(lista).toHaveLength(27);
    expect(lista).toEqual([...UFS]);
  });
});

describe('rótulos em português', () => {
  it('todo valor tem rótulo', () => {
    for (const valor of SEGMENTS) expect(SEGMENT_LABELS[valor]).toBeTruthy();
    for (const valor of ENTITY_STATUSES) expect(ENTITY_STATUS_LABELS[valor]).toBeTruthy();
    for (const valor of VEHICLE_TYPES) expect(VEHICLE_TYPE_LABELS[valor]).toBeTruthy();
    for (const valor of VEHICLE_STATUSES) expect(VEHICLE_STATUS_LABELS[valor]).toBeTruthy();
    for (const valor of EVENT_TYPES) expect(EVENT_TYPE_LABELS[valor]).toBeTruthy();
    for (const valor of ANONYMIZATION_REASONS) expect(ANONYMIZATION_REASON_LABELS[valor]).toBeTruthy();
    expect(Object.keys(VALIDITY_LABELS)).toEqual(['em_dia', 'a_vencer', 'vencido', 'sem_data']);
  });
});
