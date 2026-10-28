import { describe, expect, it, vi } from 'vitest';
import type { TrackingTransport } from './tracking-ports';
import { ProximityOccurrenceService } from './proximity-occurrence-service';

// Spec 015 (T064; US4, RF-022): o serviço da ocorrência consulta com as evidências e reconhece/encerra com versão e identificador de
// pedido. Conflito, nota ausente, transição inválida e negação viram estado de tela; uma falha de rede numa escrita é "resultado
// desconhecido" e a repetição usa o mesmo pedido (o servidor não duplica). O histórico original nunca é alterado pelo cliente.
const ORG = 'org-a';
const OCC = 'f1560000-0000-4000-8000-0000000000a1';
const DETAIL = {
  code: 'FOUND',
  occurrence: { id: OCC, status: 'open', detection_kind: 'live', version: 1, opened_at: '2026-10-22T14:02:00Z', acknowledged_at: null, closed_at: null,
    close_note: null, trip_id: 't1', cylinder_id: 'c1', device_id: 'd1', alert_id: 'a1', trip_number: 9201, serial_number: 'OCC-A-1',
    device_label: 'Lacre O1', alert_status: 'open', acknowledged_by_name: null, closed_by_name: null },
  evidences: [
    { id: 'e1', observed_at: '2026-10-22T14:00:00Z', result: 'outside', reason: 'beyond_limit', distance_m: 231.5, rule_version: 1, distance_threshold_m: 100, retrospective: false },
    { id: 'e2', observed_at: '2026-10-22T14:01:00Z', result: 'outside', reason: 'beyond_limit', distance_m: 240.2, rule_version: 1, distance_threshold_m: 100, retrospective: false },
  ],
};
const transport = (status: number, body: unknown) => ({ call: vi.fn(async () => ({ status, body })) }) satisfies TrackingTransport;

describe('serviço da ocorrência', () => {
  it('consulta a ocorrência com as evidências', async () => {
    const t = transport(200, DETAIL);
    const outcome = await new ProximityOccurrenceService(t).get(ORG, OCC);
    expect(t.call).toHaveBeenCalledWith('query-tracking', { operation: 'get_proximity_occurrence', organization_id: ORG, occurrence_id: OCC });
    expect(outcome).toMatchObject({ kind: 'success', value: { id: OCC, status: 'open', version: 1, tripNumber: 9201, serialNumber: 'OCC-A-1',
      evidences: [{ distanceM: 231.5, thresholdM: 100 }, { distanceM: 240.2 }] } });
  });

  it('reconhece com versão e pedido', async () => {
    const t = transport(200, { code: 'ACKNOWLEDGED', version: 2 });
    expect(await new ProximityOccurrenceService(t).acknowledge(ORG, OCC, 1, 'req-1')).toEqual({ kind: 'success', value: { version: 2 } });
    expect(t.call).toHaveBeenCalledWith('manage-tracking', { operation: 'acknowledge_proximity_occurrence', organization_id: ORG, request_id: 'req-1',
      occurrence_id: OCC, version: 1 });
  });

  it('encerra com a nota sem espaços sobrando', async () => {
    const t = transport(200, { code: 'CLOSED', version: 3 });
    await new ProximityOccurrenceService(t).close(ORG, OCC, 2, '  Carga conferida no posto.  ', 'req-2');
    expect(t.call).toHaveBeenCalledWith('manage-tracking', expect.objectContaining({ note: 'Carga conferida no posto.', version: 2 }));
  });

  it('nota curta é recusada antes de enviar', async () => {
    const t = transport(200, {});
    expect(await new ProximityOccurrenceService(t).close(ORG, OCC, 2, 'ok', 'r')).toEqual({ kind: 'note_required' });
    expect(t.call).not.toHaveBeenCalled();
  });

  it.each([
    [409, { code: 'VERSION_CONFLICT' }, 'version_conflict'], [409, { code: 'INVALID_TRANSITION' }, 'invalid_transition'],
    [400, { code: 'NOTE_REQUIRED' }, 'note_required'], [403, { code: 'ACCESS_DENIED' }, 'access_denied'], [401, {}, 'session_expired'],
    [404, { code: 'NOT_FOUND' }, 'not_found'], [500, {}, 'unknown'],
  ] as const)('HTTP %i (%o) vira %s', async (status, body, kind) => {
    expect((await new ProximityOccurrenceService(transport(status, body)).acknowledge(ORG, OCC, 1, 'r')).kind).toBe(kind);
  });

  it('falha de rede numa escrita é resultado desconhecido; sem conexão nem envia', async () => {
    const failing: TrackingTransport = { call: vi.fn(async () => { throw new Error('rede'); }) };
    expect((await new ProximityOccurrenceService(failing).acknowledge(ORG, OCC, 1, 'r')).kind).toBe('unknown');
    const t = transport(200, {});
    expect((await new ProximityOccurrenceService(t, () => false).close(ORG, OCC, 1, 'Carga conferida.', 'r')).kind).toBe('offline');
    expect(t.call).not.toHaveBeenCalled();
  });
});
