import { describe, expect, it, vi } from 'vitest';
import type { TrackingTransport } from './tracking-ports';
import { TrackingHistoryService } from './tracking-history-service';

// Spec 015 (T060; US3): o serviço do histórico pede uma página por vez com cursor, traduz cada tipo de fato e devolve estado de tela.
const ORG = 'org-a';
const ID = 'e1560000-0000-4000-8000-0000000000a1';
const NOW = new Date('2026-10-22T15:00:00Z');
const RULE = { id: null, version: 0, distance_m: 100, max_age_s: 120, max_accuracy_m: 50, valid_from: null };
const QUERY = { subject: 'trip' as const, subjectId: ID, from: '2026-10-22T08:00:00Z', to: '2026-10-22T18:00:00Z' };
const transport = (status: number, body: unknown) => ({ call: vi.fn(async () => ({ status, body })) }) satisfies TrackingTransport;
const service = (t: TrackingTransport, online = true) => new TrackingHistoryService(t, () => online, { now: () => NOW });

const ITEMS = [
  { id: 'm1', kind: 'position', origin: 'mobile', subject_id: ID, subject_label: 'Celular do motorista', latitude: -7.23, longitude: -39.31, accuracy_m: 12,
    observed_at: '2026-10-22T14:00:00+00:00', received_at: '2026-10-22T14:00:02+00:00', occurred_at: '2026-10-22T14:00:00+00:00', sync_kind: 'retrospective' },
  { id: 'c1', kind: 'comparison', subject_id: 'dev1', cylinder_id: 'cyl', result: 'outside', reason: 'beyond_limit', distance_m: 222.4, retrospective: false,
    rule_version: 1, occurred_at: '2026-10-22T14:00:00+00:00' },
  { id: 'o1', kind: 'occurrence', subject_id: 'dev1', cylinder_id: 'cyl', trip_id: ID, status: 'open', detection_kind: 'live', alert_id: 'a1', occurred_at: '2026-10-22T14:02:00+00:00' },
  { id: 'a1', kind: 'alert', subject_id: 'dev1', cylinder_id: 'cyl', alert_kind: 'proximity_separation', severity: 'high', status: 'open', occurred_at: '2026-10-22T14:02:00+00:00' },
  { id: 'e1', kind: 'event', subject_id: ID, trip_id: ID, event_type: 'trip_started', occurred_at: '2026-10-22T13:00:00+00:00' },
  { id: 'p1', kind: 'presence', subject_id: 'cyl', cylinder_id: 'cyl', source: 'nfc', occurred_at: '2026-10-22T14:30:00+00:00' },
];

describe('serviço do histórico', () => {
  it('pede a página com assunto, período e cursor', async () => {
    const t = transport(200, { code: 'LISTED', generated_at: '2026-10-22T15:00:00Z', rule: RULE, items: [], next_cursor: null });
    await service(t).page(ORG, QUERY, { at: '2026-10-22T14:00:00Z', id: 'm1' });
    expect(t.call).toHaveBeenCalledWith('query-tracking', { operation: 'query_tracking_history', organization_id: ORG, subject: 'trip', subject_id: ID,
      from: QUERY.from, to: QUERY.to, cursor_at: '2026-10-22T14:00:00Z', cursor_id: 'm1', limit: 200 });
  });

  it('traduz cada tipo de fato, com origem e retrospectividade da posição', async () => {
    const outcome = await service(transport(200, { code: 'LISTED', generated_at: '2026-10-22T15:00:00Z', rule: RULE, items: ITEMS,
      next_cursor: { at: '2026-10-22T14:30:00+00:00', id: 'p1' } })).page(ORG, QUERY, null);
    if (outcome.kind !== 'success') throw new Error(outcome.kind);
    expect(outcome.value.items.map((i) => i.kind)).toEqual(['position', 'comparison', 'occurrence', 'alert', 'event', 'presence']);
    expect(outcome.value.items[0]).toMatchObject({ kind: 'position', position: { origin: 'mobile', retrospective: true, subjectId: ID }, label: 'Celular do motorista' });
    expect(outcome.value.items[1]).toMatchObject({ kind: 'comparison', result: 'outside', distanceM: 222.4 });
    expect(outcome.value.nextCursor).toEqual({ at: '2026-10-22T14:30:00+00:00', id: 'p1' });
    expect(outcome.value.rule.maxAgeS).toBe(120);
  });

  it('tipo desconhecido é ignorado; item malformado torna a resposta indisponível', async () => {
    const unknown = await service(transport(200, { code: 'LISTED', generated_at: 'x', rule: RULE, items: [{ id: 'z', kind: 'novidade', occurred_at: '2026-10-22T14:00:00Z' }], next_cursor: null })).page(ORG, QUERY, null);
    expect(unknown.kind === 'success' && unknown.value.items).toEqual([]);
    expect((await service(transport(200, { code: 'LISTED', generated_at: 'x', rule: RULE, items: [{ kind: 'position' }], next_cursor: null })).page(ORG, QUERY, null)).kind).toBe('unavailable');
  });

  it.each([[404, { code: 'NOT_FOUND' }, 'not_found'], [403, { code: 'ACCESS_DENIED' }, 'access_denied'], [400, { code: 'VALIDATION_FAILED' }, 'invalid']] as const)(
    'HTTP %i vira %s', async (status, body, kind) => {
      expect((await service(transport(status, body)).page(ORG, QUERY, null)).kind).toBe(kind);
    });

  it('sem conexão, nem chama o servidor', async () => {
    const t = transport(200, {});
    expect((await service(t, false).page(ORG, QUERY, null)).kind).toBe('offline');
    expect(t.call).not.toHaveBeenCalled();
  });
});
