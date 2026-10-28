import { describe, expect, it, vi } from 'vitest';
import type { TrackingTransport } from './tracking-ports';
import { ManageTrackingGateway } from './tracking-gateway';

// Spec 015 (US2): a porta do servidor sobre `manage-tracking` traduz o contrato (snake_case, códigos) para a coordenação da coleta.
const transport = (status: number, body: unknown) => ({ call: vi.fn(async () => ({ status, body })) }) satisfies TrackingTransport;
const ORG = 'org-a';

describe('ManageTrackingGateway', () => {
  it('abre a sessão e devolve a janela de coleta', async () => {
    const t = transport(200, { code: 'STARTED', session: { id: 's1', status: 'active', collect_until: '2026-10-22T20:00:00Z', interval_s: 60 } });
    const result = await new ManageTrackingGateway(t).startSession({ organizationId: ORG, tripId: 't1', deviceInstallationId: 'i1',
      platform: 'web_visible', capability: 'foreground_only', notificationsDenied: false, requestId: 'r1' });
    expect(t.call).toHaveBeenCalledWith('manage-tracking', { operation: 'start_tracking_session', organization_id: ORG, request_id: 'r1', trip_id: 't1',
      device_installation_id: 'i1', platform: 'web_visible', capability: 'foreground_only', notifications_denied: false });
    expect(result).toEqual({ ok: true, value: { trackingSessionId: 's1', status: 'active', collectUntil: '2026-10-22T20:00:00Z', intervalSeconds: 60 } });
  });

  it('envia o lote com os nomes do contrato e lê o resultado de cada item', async () => {
    const t = transport(200, { code: 'INGESTED', server_time: '2026-10-22T12:00:00Z', results: [
      { client_position_id: 'p1', status: 'stored', retrospective: true }, { client_position_id: 'p2', status: 'rejected', retrospective: false, code: 'SESSION_ENDED' }] });
    const owner = { userId: 'u', organizationId: ORG, endpointId: 'cloud', tripId: 't1', trackingSessionId: 's1' };
    const result = await new ManageTrackingGateway(t).ingest({ organizationId: ORG, trackingSessionId: 's1', deviceInstallationId: 'i1', positions: [
      { clientPositionId: 'p1', sequenceNo: 1, owner, observedAt: '2026-10-22T11:59:00Z', latitude: -7.23, longitude: -39.31, accuracyM: 12 }] });
    expect(t.call).toHaveBeenCalledWith('manage-tracking', expect.objectContaining({ operation: 'ingest_driver_positions', tracking_session_id: 's1',
      positions: [{ client_position_id: 'p1', sequence_no: 1, observed_at: '2026-10-22T11:59:00Z', latitude: -7.23, longitude: -39.31, accuracy_m: 12 }] }));
    expect(JSON.stringify((t.call.mock.calls[0] as unknown[])[1])).not.toContain('owner');
    expect(result).toEqual({ ok: true, value: { serverTime: '2026-10-22T12:00:00Z', results: [
      { clientPositionId: 'p1', status: 'stored', retrospective: true }, { clientPositionId: 'p2', status: 'rejected', retrospective: false, code: 'SESSION_ENDED' }] } });
  });

  it.each([[401, { code: 'AUTH_REQUIRED' }, 'AUTH_REQUIRED'], [403, { code: 'ACCESS_DENIED' }, 'ACCESS_DENIED'], [404, { code: 'NOT_FOUND' }, 'NOT_FOUND'],
    [409, { code: 'SESSION_ENDED' }, 'CONFLICT'], [500, {}, 'UNAVAILABLE']] as const)('HTTP %i vira %s', async (status, body, error) => {
    expect(await new ManageTrackingGateway(transport(status, body)).endSession({ organizationId: ORG, trackingSessionId: 's1', reason: 'completed', requestId: 'r' }))
      .toEqual({ ok: false, error });
  });

  it('falha de rede é indisponível', async () => {
    const t: TrackingTransport = { call: vi.fn(async () => { throw new Error('rede'); }) };
    expect(await new ManageTrackingGateway(t).reportCapability({ organizationId: ORG, trackingSessionId: 's1', capability: 'denied', notificationsDenied: false, requestId: 'r' }))
      .toEqual({ ok: false, error: 'UNAVAILABLE' });
  });
});
