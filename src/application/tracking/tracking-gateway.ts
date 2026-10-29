// Porta do servidor da coleta (Spec 015, US2) sobre a Edge Function `manage-tracking`: traduz o contrato (snake_case e códigos) para a
// coordenação da coleta. O dono do item da fila não sai do aparelho: o servidor decide o contexto pela sessão e pelo token.
import type { TrackingError } from '@/domain/tracking/tracking-types';
import type { GatewayResult, IngestItemResult, TrackingGateway, TrackingSessionGrant, TrackingTransport } from './tracking-ports';

type Raw = Record<string, unknown>;
const isObject = (value: unknown): value is Raw => typeof value === 'object' && value !== null && !Array.isArray(value);

function errorOf(status: number, body: unknown): TrackingError {
  const code = isObject(body) && typeof body.code === 'string' ? body.code : '';
  if (status === 401 || code === 'AUTH_REQUIRED') return 'AUTH_REQUIRED';
  if (code === 'ACCESS_DENIED') return 'ACCESS_DENIED';
  if (code === 'NOT_FOUND') return 'NOT_FOUND';
  if (status === 400) return 'VALIDATION_FAILED';
  if (status === 409) return 'CONFLICT';
  return 'UNAVAILABLE';
}

function toGrant(raw: unknown): TrackingSessionGrant | null {
  if (!isObject(raw) || typeof raw.id !== 'string' || typeof raw.collect_until !== 'string' || typeof raw.status !== 'string') return null;
  return { trackingSessionId: raw.id, status: raw.status as TrackingSessionGrant['status'], collectUntil: raw.collect_until,
    intervalSeconds: typeof raw.interval_s === 'number' ? raw.interval_s : 60 };
}

export class ManageTrackingGateway implements TrackingGateway {
  constructor(private readonly transport: TrackingTransport) {}

  private async run<T>(body: Raw, pick: (payload: Raw) => T | null): Promise<GatewayResult<T>> {
    try {
      const response = await this.transport.call('manage-tracking', body);
      if (response.status >= 200 && response.status < 300 && isObject(response.body)) {
        const value = pick(response.body);
        return value === null ? { ok: false, error: 'UNAVAILABLE' } : { ok: true, value };
      }
      return { ok: false, error: errorOf(response.status, response.body) };
    } catch {
      return { ok: false, error: 'UNAVAILABLE' };
    }
  }

  startSession(input: Parameters<TrackingGateway['startSession']>[0]) {
    return this.run({
      operation: 'start_tracking_session', organization_id: input.organizationId, request_id: input.requestId, trip_id: input.tripId,
      device_installation_id: input.deviceInstallationId, platform: input.platform, capability: input.capability,
      notifications_denied: input.notificationsDenied,
    }, (p) => (p.code === 'STARTED' ? toGrant(p.session) : null));
  }

  ingest(input: Parameters<TrackingGateway['ingest']>[0]) {
    return this.run({
      operation: 'ingest_driver_positions', organization_id: input.organizationId, request_id: crypto.randomUUID(),
      tracking_session_id: input.trackingSessionId, device_installation_id: input.deviceInstallationId,
      positions: input.positions.map((p) => ({ client_position_id: p.clientPositionId, sequence_no: p.sequenceNo, observed_at: p.observedAt,
        latitude: p.latitude, longitude: p.longitude, accuracy_m: p.accuracyM })),
    }, (p) => {
      if (p.code !== 'INGESTED' || typeof p.server_time !== 'string' || !Array.isArray(p.results)) return null;
      const results: IngestItemResult[] = [];
      for (const item of p.results) {
        if (!isObject(item) || typeof item.client_position_id !== 'string' || typeof item.status !== 'string') return null;
        results.push({ clientPositionId: item.client_position_id, status: item.status as IngestItemResult['status'], retrospective: item.retrospective === true,
          ...(typeof item.code === 'string' ? { code: item.code } : {}) });
      }
      return { serverTime: p.server_time, results };
    });
  }

  endSession(input: Parameters<TrackingGateway['endSession']>[0]) {
    return this.run({ operation: 'end_tracking_session', organization_id: input.organizationId, request_id: input.requestId,
      tracking_session_id: input.trackingSessionId, reason: input.reason }, (p) => (p.code === 'ENDED' ? toGrant(p.session) : null));
  }

  async reportCapability(input: Parameters<TrackingGateway['reportCapability']>[0]): Promise<GatewayResult<null>> {
    const result = await this.run({ operation: 'report_tracking_capability', organization_id: input.organizationId, request_id: input.requestId,
      tracking_session_id: input.trackingSessionId, capability: input.capability, notifications_denied: input.notificationsDenied },
    (p) => (p.code === 'UPDATED' ? true : null));
    return result.ok ? { ok: true, value: null } : result;
  }
}
