// Serviço do lacre (Spec 012) sobre as Edge Functions `query-seals` e `manage-seals`. Esqueleto da Fundação: o mapeamento dos códigos
// do servidor para estados de tela (contracts/operacoes-servidor.md) e o executor `run`, que cada história usa para montar suas operações
// tipadas. O serviço nunca guarda resposta em armazenamento local e, sem conexão, nem chama o servidor: comandos de lacre nunca entram na
// fila offline da Spec 010 (RF-043).
import {
  all, toAlertDetail, toAlertView, toPositionRow, toSealDetail, toSealGeofenceView, toSealListItem, toSealSummary, toTripSealRow,
  type AlertDetail, type AlertView, type PositionRow, type SealDetail, type SealGeofenceView, type SealListItem, type SealSummary, type TripSealRow,
} from './seal-views';

export type SealFunction = 'query-seals' | 'manage-seals';
export type Raw = Record<string, unknown>;

export interface SealTransport {
  call(fn: SealFunction, body: Raw): Promise<{ status: number; body: unknown }>;
}

export type SealFailureKind =
  | 'offline' | 'unavailable' | 'unknown' | 'session_expired' | 'access_denied' | 'mfa_required' | 'not_found' | 'invalid'
  | 'justification_required' | 'note_required' | 'version_conflict' | 'seal_already_bound' | 'cylinder_already_bound' | 'seal_inactive'
  | 'no_binding' | 'cylinder_in_trip' | 'wifi_list_full' | 'wifi_not_in_list' | 'wifi_risk_not_confirmed' | 'alert_closed' | 'request_reused';

export interface SealFailure {
  kind: SealFailureKind;
  // Erros de validação do servidor por campo (nomes do contrato, em snake_case).
  fields?: Record<string, string>;
}

export type SealOutcome<T> = { kind: 'success'; value: T } | SealFailure;

const FAILURES: Record<string, SealFailureKind> = {
  AUTH_REQUIRED: 'session_expired', ACCESS_DENIED: 'access_denied', MFA_REQUIRED: 'mfa_required', NOT_FOUND: 'not_found',
  VALIDATION_FAILED: 'invalid', JUSTIFICATION_REQUIRED: 'justification_required', NOTE_REQUIRED: 'note_required', VERSION_CONFLICT: 'version_conflict',
  SEAL_ALREADY_BOUND: 'seal_already_bound', CYLINDER_ALREADY_BOUND: 'cylinder_already_bound', SEAL_INACTIVE: 'seal_inactive',
  NO_BINDING: 'no_binding', CYLINDER_IN_TRIP: 'cylinder_in_trip', WIFI_LIST_FULL: 'wifi_list_full', WIFI_NOT_IN_LIST: 'wifi_not_in_list',
  WIFI_RISK_NOT_CONFIRMED: 'wifi_risk_not_confirmed', ALERT_CLOSED: 'alert_closed', REQUEST_REUSED: 'request_reused',
};

export const isObject = (value: unknown): value is Raw => typeof value === 'object' && value !== null && !Array.isArray(value);

// Identificador de um envio: um por tentativa, o mesmo na repetição do mesmo envio; o servidor não duplica nada.
export const newRequestId = (): string => crypto.randomUUID();

export class SealService {
  constructor(
    protected readonly transport: SealTransport,
    protected readonly isOnline: () => boolean = () => true,
  ) {}

  protected failureOf(response: { status: number; body: unknown }, write: boolean): SealFailure {
    if (response.status === 401) return { kind: 'session_expired' };
    const body = isObject(response.body) ? response.body : {};
    const kind = typeof body.code === 'string' ? FAILURES[body.code] : undefined;
    if (!kind || response.status >= 500) return { kind: write ? 'unknown' : 'unavailable' };
    const failure: SealFailure = { kind };
    if (Array.isArray(body.fields)) {
      const fields: Record<string, string> = {};
      for (const entry of body.fields) {
        if (isObject(entry) && typeof entry.field === 'string' && typeof entry.message === 'string') fields[entry.field] = entry.message;
      }
      failure.fields = fields;
    }
    return failure;
  }

  // Executa uma chamada e converte a resposta em sucesso tipado (por `pick`) ou em estado de tela. Resposta 2xx que o `pick` não
  // reconhece é falha desconhecida (escrita) ou indisponível (leitura), nunca sucesso.
  protected async run<T>(fn: SealFunction, write: boolean, body: Raw, pick: (payload: Raw) => T | null): Promise<SealOutcome<T>> {
    if (!this.isOnline()) return { kind: 'offline' };
    try {
      const response = await this.transport.call(fn, body);
      if (response.status >= 200 && response.status < 300 && isObject(response.body)) {
        const value = pick(response.body);
        if (value !== null) return { kind: 'success', value };
        return { kind: write ? 'unknown' : 'unavailable' };
      }
      return this.failureOf(response, write);
    } catch {
      // Falha de rede depois de enviar: numa escrita o resultado é desconhecido (a repetição com o mesmo request_id não duplica).
      return { kind: write ? 'unknown' : 'unavailable' };
    }
  }

  // Leituras (US1). `organizationId` é a organização ativa; o servidor confere a permissão e o isolamento.
  cylinderSeal(organizationId: string, cylinderId: string): Promise<SealOutcome<SealSummary | null>> {
    return this.run('query-seals', false, { operation: 'cylinder_seal_view', organization_id: organizationId, cylinder_id: cylinderId }, (p) => {
      if (p.code !== 'FOUND') return null;
      if (p.seal === null) return { value: null };
      const seal = toSealSummary(p.seal);
      return seal ? { value: seal } : null;
    }).then((outcome) => (outcome.kind === 'success' ? { kind: 'success', value: outcome.value.value } : outcome));
  }

  tripSeals(organizationId: string, tripId: string): Promise<SealOutcome<TripSealRow[]>> {
    return this.run('query-seals', false, { operation: 'trip_seal_view', organization_id: organizationId, trip_id: tripId },
      (p) => (p.code === 'FOUND' ? all(p.items, toTripSealRow) : null));
  }

  listSeals(organizationId: string, filters: { health?: string; lockState?: string; unbound?: boolean; history?: boolean; offset?: number; limit?: number } = {}):
    Promise<SealOutcome<{ items: SealListItem[]; total: number }>> {
    return this.run('query-seals', false, {
      operation: 'list_seals', organization_id: organizationId, health: filters.health ?? null, lock_state: filters.lockState ?? null,
      ...(filters.unbound === undefined ? {} : { unbound: filters.unbound }), ...(filters.history ? { history: true } : {}),
      offset: filters.offset ?? 0, limit: filters.limit ?? 50,
    }, (p) => {
      const items = p.code === 'LISTED' ? all(p.items, toSealListItem) : null;
      return items && typeof p.total === 'number' ? { items, total: p.total } : null;
    });
  }

  // Geocercas para conferir no mapa se o lacre está onde deveria.
  sealGeofences(organizationId: string, deviceId: string): Promise<SealOutcome<SealGeofenceView>> {
    return this.run('query-seals', false, { operation: 'seal_geofence_view', organization_id: organizationId, device_id: deviceId },
      (p) => (p.code === 'FOUND' ? toSealGeofenceView(p) : null));
  }

  getSeal(organizationId: string, deviceId: string): Promise<SealOutcome<SealDetail>> {
    return this.run('query-seals', false, { operation: 'get_seal', organization_id: organizationId, device_id: deviceId },
      (p) => (p.code === 'FOUND' ? toSealDetail(p.seal) : null));
  }

  listPositions(organizationId: string, target: { cylinderId: string } | { deviceId: string }, limit = 100): Promise<SealOutcome<PositionRow[]>> {
    const ref = 'cylinderId' in target ? { cylinder_id: target.cylinderId } : { device_id: target.deviceId };
    return this.run('query-seals', false, { operation: 'list_positions', organization_id: organizationId, ...ref, limit },
      (p) => (p.code === 'LISTED' ? all(p.items, toPositionRow) : null));
  }

  // Alertas (US6).
  listAlerts(organizationId: string, filters: { status?: string; severity?: string; kind?: string; offset?: number; limit?: number } = {}):
    Promise<SealOutcome<{ items: AlertView[]; total: number }>> {
    return this.run('query-seals', false, {
      operation: 'list_alerts', organization_id: organizationId, status: filters.status ?? null, severity: filters.severity ?? null,
      kind: filters.kind ?? null, offset: filters.offset ?? 0, limit: filters.limit ?? 50,
    }, (p) => {
      const items = p.code === 'LISTED' ? all(p.items, toAlertView) : null;
      return items && typeof p.total === 'number' ? { items, total: p.total } : null;
    });
  }

  getAlert(organizationId: string, alertId: string): Promise<SealOutcome<AlertDetail>> {
    return this.run('query-seals', false, { operation: 'get_alert', organization_id: organizationId, alert_id: alertId },
      (p) => (p.code === 'FOUND' ? toAlertDetail(p.alert) : null));
  }

  acknowledgeAlert(organizationId: string, alertId: string, requestId = newRequestId()): Promise<SealOutcome<true>> {
    return this.run('manage-seals', true, { operation: 'acknowledge_alert', organization_id: organizationId, request_id: requestId, alert_id: alertId },
      (p) => (p.code === 'ACKNOWLEDGED' ? true : null));
  }

  closeAlert(organizationId: string, alertId: string, note: string, requestId = newRequestId()): Promise<SealOutcome<true>> {
    return this.run('manage-seals', true, { operation: 'close_alert', organization_id: organizationId, request_id: requestId, alert_id: alertId, note },
      (p) => (p.code === 'CLOSED' ? true : null));
  }

  // Comandos manuais (US2): pelo cilindro, sempre com justificativa; destravar exige o segundo fator (o servidor decide).
  requestLock(organizationId: string, cylinderId: string, justification: string, requestId = newRequestId()): Promise<SealOutcome<string>> {
    return this.run('manage-seals', true, { operation: 'request_lock', organization_id: organizationId, request_id: requestId, cylinder_id: cylinderId, justification },
      (p) => (p.code === 'REQUESTED' && typeof p.command_id === 'string' ? p.command_id : null));
  }

  requestUnlock(organizationId: string, cylinderId: string, justification: string, requestId = newRequestId()): Promise<SealOutcome<string>> {
    return this.run('manage-seals', true, { operation: 'request_unlock', organization_id: organizationId, request_id: requestId, cylinder_id: cylinderId, justification },
      (p) => (p.code === 'REQUESTED' && typeof p.command_id === 'string' ? p.command_id : null));
  }

  // Vínculo (US5). Spec 013 (RF-018, RF-013a): o lacre chega pelo Master; o tenant não cadastra, não gera chave nem desativa, e pode
  // devolver o lacre à plataforma, com justificativa.
  returnDevice(organizationId: string, deviceId: string, justification: string, requestId = newRequestId()): Promise<SealOutcome<true>> {
    return this.run('manage-seals', true, { operation: 'return_device', organization_id: organizationId, request_id: requestId, device_id: deviceId, justification },
      (p) => (p.code === 'RETURNED' ? true : null));
  }

  bindSeal(organizationId: string, deviceId: string, cylinderId: string, requestId = newRequestId()): Promise<SealOutcome<true>> {
    return this.run('manage-seals', true, { operation: 'bind_seal', organization_id: organizationId, request_id: requestId, device_id: deviceId, cylinder_id: cylinderId },
      (p) => (p.code === 'BOUND' ? true : null));
  }

  unbindSeal(organizationId: string, deviceId: string, justification: string, requestId = newRequestId()): Promise<SealOutcome<true>> {
    return this.run('manage-seals', true, { operation: 'unbind_seal', organization_id: organizationId, request_id: requestId, device_id: deviceId, justification },
      (p) => (p.code === 'UNBOUND' ? true : null));
  }

  // Redes Wi-Fi do lacre (US7). A senha só atravessa esta chamada; o serviço não a guarda.
  addWifi(organizationId: string, deviceId: string, network: { ssid: string; password: string | null; open: boolean }, confirmRisk: boolean, requestId = newRequestId()): Promise<SealOutcome<string>> {
    return this.run('manage-seals', true, {
      operation: 'wifi_add', organization_id: organizationId, request_id: requestId, device_id: deviceId, ssid: network.ssid,
      password: network.open ? null : network.password, open: network.open, confirm_risk: confirmRisk,
    }, (p) => (p.code === 'REQUESTED' && typeof p.command_id === 'string' ? p.command_id : null));
  }

  removeWifi(organizationId: string, deviceId: string, ssid: string, confirmRisk: boolean, requestId = newRequestId()): Promise<SealOutcome<string>> {
    return this.run('manage-seals', true, { operation: 'wifi_remove', organization_id: organizationId, request_id: requestId, device_id: deviceId, ssid, confirm_risk: confirmRisk },
      (p) => (p.code === 'REQUESTED' && typeof p.command_id === 'string' ? p.command_id : null));
  }

  resetWifi(organizationId: string, deviceId: string, justification: string, confirmRisk: boolean, requestId = newRequestId()): Promise<SealOutcome<string>> {
    return this.run('manage-seals', true, { operation: 'wifi_reset', organization_id: organizationId, request_id: requestId, device_id: deviceId, justification, confirm_risk: confirmRisk },
      (p) => (p.code === 'REQUESTED' && typeof p.command_id === 'string' ? p.command_id : null));
  }

  listUnboundActiveSeals(organizationId: string): Promise<SealOutcome<SealSummary[]>> {
    return this.run('query-seals', false, { operation: 'list_unbound_active_seals', organization_id: organizationId },
      (p) => (p.code === 'LISTED' ? all(p.items, toSealSummary) : null));
  }

  // Notificações deste aparelho (US6).
  pushStatus(organizationId: string, endpoint: string): Promise<SealOutcome<boolean>> {
    return this.run('query-seals', false, { operation: 'push_status', organization_id: organizationId, endpoint },
      (p) => (p.code === 'FOUND' && typeof p.active === 'boolean' ? p.active : null));
  }

  pushSubscribe(organizationId: string, subscription: { endpoint: string; p256dh: string; auth: string; label: string }): Promise<SealOutcome<true>> {
    return this.run('manage-seals', true, {
      operation: 'push_subscribe', organization_id: organizationId, request_id: newRequestId(), endpoint: subscription.endpoint,
      p256dh: subscription.p256dh, auth: subscription.auth, label: subscription.label,
    }, (p) => (p.code === 'SUBSCRIBED' ? true : null));
  }

  pushUnsubscribe(organizationId: string, endpoint: string): Promise<SealOutcome<true>> {
    return this.run('manage-seals', true, { operation: 'push_unsubscribe', organization_id: organizationId, request_id: newRequestId(), endpoint },
      (p) => (p.code === 'UNSUBSCRIBED' ? true : null));
  }
}
