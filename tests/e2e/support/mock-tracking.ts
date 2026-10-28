import { fail, ORG_A, ORG_B, type Can, type Json, type Reply } from './mock-registry';

// Backend simulado da Edge Function query-tracking (Spec 015, US1) para os E2E. Reproduz o contrato de
// specs/015-rastreamento-proximidade-relatorios/contracts/rastreamento-e-sincronizacao.md em memória: `tracking.read`, isolamento por
// organização (viagem de outra empresa é "não encontrada") e a mesma forma de resposta das RPCs. As regras de verdade são provadas nas
// suítes pgTAP.
export const TRACKING_TRIP_A = 'b1560000-0000-4000-8000-0000000000a1';
export const TRACKING_TRIP_B = 'b1560000-0000-4000-8000-0000000000b1';
export const TRACKING_OCCURRENCE_A = 'f1560000-0000-4000-8000-0000000000a1';

const RULE = { id: null, version: 0, distance_m: 100, max_age_s: 120, max_accuracy_m: 50, valid_from: null };

export class TrackingMock {
  // Viagens em andamento por organização, na forma da linha devolvida por `list_active_trip_tracking`.
  readonly trips: Record<string, Json[]> = { [ORG_A]: [], [ORG_B]: [] };
  // Trilha recente por viagem, na forma de `recent` de `get_trip_tracking`.
  readonly recent: Record<string, Json> = {};
  now: () => Date = () => new Date();
  // Ocorrências (US4), na forma de `get_proximity_occurrence`, com versão e estado.
  readonly occurrences: Record<string, Json> = {};
  // Histórico (US3): fatos por viagem, já na forma de `query_tracking_history`, em ordem; páginas de `historyPageSize`.
  readonly history: Record<string, Json[]> = {};
  historyPageSize = 200;
  // Coleta do motorista (US2): viagens em que a pessoa logada é a motorista, posições recebidas e o status da ingestão.
  readonly driverTrips = new Set<string>();
  readonly received: Json[] = [];
  readonly capabilities: Json[] = [];
  ingestStatus = 200;
  private session: Json | null = null;
  // Avisos por e-mail (US6): categorias liberadas, versão, escolhas da pessoa logada e o estado dos avisos por alerta.
  emailReleased: string[] = [];
  emailVersion = 0;
  emailChosen: string[] = [];
  readonly emailDeliveries: Record<string, Json[]> = {};

  private emailPreferences(can: Can, org: string): Json[] {
    return ['proximity_confirmed', 'seal_high_critical', 'seal_recovered'].map((category) => {
      const released = this.emailReleased.includes(category);
      const permitted = can(org, category === 'proximity_confirmed' ? 'tracking.read' : 'seal.read');
      return { category, allowed: released && permitted, enabled: released && permitted && this.emailChosen.includes(category),
        reason: !released ? 'not_released' : !permitted ? 'no_permission' : null };
    });
  }

  private emailCategories(): Json {
    return { version: this.emailVersion, categories: ['proximity_confirmed', 'seal_high_critical', 'seal_recovered'].map((category) => ({ category, enabled: this.emailReleased.includes(category) })) };
  }

  private email(body: Json, can: Can, org: string): Reply | null {
    const categories = Array.isArray(body.categories) ? body.categories.map(String) : [];
    switch (body.operation) {
      case 'get_my_email_preferences': return { status: 200, json: { code: 'FOUND', categories: this.emailPreferences(can, org) } };
      case 'get_notification_categories':
        return can(org, 'notification_category.manage') ? { status: 200, json: { code: 'FOUND', ...this.emailCategories() } } : fail('ACCESS_DENIED', 403);
      case 'get_email_deliveries':
        return can(org, 'seal.read') ? { status: 200, json: { code: 'FOUND', items: this.emailDeliveries[String(body.alert_id)] ?? [] } } : fail('ACCESS_DENIED', 403);
      case 'set_notification_categories':
        if (!can(org, 'notification_category.manage')) return fail('ACCESS_DENIED', 403);
        if (body.version !== this.emailVersion) return { status: 409, json: { code: 'VERSION_CONFLICT', version: this.emailVersion } };
        this.emailReleased = categories;
        this.emailVersion += 1;
        return { status: 200, json: { code: 'UPDATED', ...this.emailCategories() } };
      case 'set_my_email_preferences':
        if (categories.some((c) => !this.emailPreferences(can, org).find((p) => p.category === c)?.allowed)) return { status: 409, json: { code: 'CATEGORY_NOT_ALLOWED' } };
        this.emailChosen = categories;
        return { status: 200, json: { code: 'UPDATED', categories: this.emailPreferences(can, org) } };
      default: return null;
    }
  }

  manage(body: Json, can: Can = () => false): Reply {
    const org = typeof body.organization_id === 'string' ? body.organization_id : '';
    if (org !== ORG_A && org !== ORG_B) return fail('VALIDATION_FAILED', 400);
    const email = this.email(body, can, org);
    if (email) return email;
    const collectUntil = new Date(this.now().getTime() + 8 * 3600_000).toISOString();
    if (body.operation === 'start_tracking_session') {
      if (!this.driverTrips.has(String(body.trip_id))) return fail('ACCESS_DENIED', 403);
      this.session ??= { id: 'b1590000-0000-4000-8000-0000000000e2', trip_id: body.trip_id, status: 'active', platform: body.platform,
        capability: body.capability, notifications_denied: body.notifications_denied ?? false, interval_s: 60 };
      return { status: 200, json: { code: 'STARTED', session: { ...this.session, collect_until: collectUntil }, rule: RULE } };
    }
    if (body.operation === 'ingest_driver_positions') {
      if (this.ingestStatus === 401) return fail('AUTH_REQUIRED', 401);
      const positions = Array.isArray(body.positions) ? body.positions as Json[] : [];
      const results = positions.map((position) => {
        const duplicate = this.received.some((r) => r.client_position_id === position.client_position_id);
        if (!duplicate) this.received.push(position);
        return { client_position_id: position.client_position_id, status: duplicate ? 'duplicate' : 'stored', retrospective: false, evaluations_created: 0 };
      });
      return { status: 200, json: { code: 'INGESTED', server_time: this.now().toISOString(), results } };
    }
    if (body.operation === 'acknowledge_proximity_occurrence' || body.operation === 'close_proximity_occurrence') {
      const found = this.occurrences[String(body.occurrence_id)];
      if (!found || (found.occurrence as Json & { org?: string }).org !== org) return fail('NOT_FOUND', 404);
      const occurrence = found.occurrence as Json;
      if (occurrence.version !== body.version) return fail('VERSION_CONFLICT', 409);
      const closing = body.operation === 'close_proximity_occurrence';
      const at = this.now().toISOString();
      Object.assign(occurrence, closing
        ? { status: 'closed', closed_at: at, closed_by_name: 'Gestora Fictícia', close_note: body.note, acknowledged_at: occurrence.acknowledged_at ?? at }
        : { status: 'acknowledged', acknowledged_at: at, acknowledged_by_name: 'Gestora Fictícia' });
      occurrence.version = Number(occurrence.version) + 1;
      return { status: 200, json: { code: closing ? 'CLOSED' : 'ACKNOWLEDGED', version: occurrence.version } };
    }
    if (body.operation === 'report_tracking_capability') {
      this.capabilities.push({ capability: body.capability, notifications_denied: body.notifications_denied });
      return { status: 200, json: { code: 'UPDATED' } };
    }
    if (body.operation === 'end_tracking_session') {
      return { status: 200, json: { code: 'ENDED', session: { ...(this.session ?? {}), status: body.reason, collect_until: collectUntil } } };
    }
    return fail('VALIDATION_FAILED', 400);
  }

  handle(body: Json, can: Can): Reply {
    const org = typeof body.organization_id === 'string' ? body.organization_id : '';
    if (org !== ORG_A && org !== ORG_B) return fail('VALIDATION_FAILED', 400);
    const email = this.email(body, can, org);
    if (email) return email;
    // A situação do motorista não exige tracking.read: só sessão e vínculo.
    if (body.operation === 'get_driver_tracking_status') {
      return { status: 200, json: { code: 'FOUND', is_driver: this.driverTrips.has(String(body.trip_id)), trip_status: 'in_progress', session: null } };
    }
    // "Minha viagem": as viagens da própria pessoa motorista, também só com sessão e vínculo.
    if (body.operation === 'list_my_driver_trips') {
      const trips = [...this.driverTrips].map((id, index) => ({
        id, number: index + 1, status: 'in_progress', planned_date: this.now().toISOString().slice(0, 10), started_at: this.now().toISOString(),
        vehicle_plate: 'TRK1A23', stop_count: 1,
      }));
      return { status: 200, json: { code: 'FOUND', is_driver: trips.length > 0, trips } };
    }
    if (!can(org, 'tracking.read')) return fail('ACCESS_DENIED', 403);
    const generated = this.now().toISOString();
    if (body.operation === 'list_active_trip_tracking') {
      return { status: 200, json: { code: 'LISTED', generated_at: generated, rule: RULE, items: this.trips[org] ?? [], next_cursor: null } };
    }
    if (body.operation === 'get_proximity_occurrence') {
      const found = this.occurrences[String(body.occurrence_id)];
      if (!found || (found.occurrence as Json & { org?: string }).org !== org) return fail('NOT_FOUND', 404);
      const occurrence: Json = { ...(found.occurrence as Json) };
      delete occurrence.org;
      return { status: 200, json: { code: 'FOUND', occurrence, evidences: found.evidences } };
    }
    if (body.operation === 'query_tracking_history') {
      const trip = (this.trips[org] ?? []).find((row) => row.trip_id === body.subject_id);
      if (!trip) return fail('NOT_FOUND', 404);
      const all = this.history[String(body.subject_id)] ?? [];
      const start = typeof body.cursor_id === 'string' ? all.findIndex((item) => item.id === body.cursor_id) + 1 : 0;
      const page = all.slice(start, start + this.historyPageSize);
      const last = page.at(-1);
      const next = start + this.historyPageSize < all.length && last ? { at: last.occurred_at, id: last.id } : null;
      return { status: 200, json: { code: 'LISTED', generated_at: generated, rule: RULE, items: page, next_cursor: next } };
    }
    if (body.operation === 'get_trip_tracking') {
      const trip = (this.trips[org] ?? []).find((row) => row.trip_id === body.trip_id);
      if (!trip) return fail('NOT_FOUND', 404);
      return { status: 200, json: { code: 'FOUND', generated_at: generated, rule: RULE, trip, recent: this.recent[trip.trip_id as string] ?? { mobile: [], seals: [] } } };
    }
    return fail('VALIDATION_FAILED', 400);
  }
}

// Uma viagem do Tenant A com o celular em coleta só com o aplicativo aberto (degradado), a trilha recente com uma lacuna e um lacre
// atrasado; e uma viagem do Tenant B, para a tentativa de acesso cruzado.
export function semearRastreamento(mock: TrackingMock): void {
  const now = mock.now().getTime();
  const at = (secondsAgo: number) => new Date(now - secondsAgo * 1000).toISOString();
  const point = (id: string, secondsAgo: number, accuracy: number, extra: Json = {}) => ({
    id, latitude: -7.23 - secondsAgo / 1e6, longitude: -39.31 - secondsAgo / 1e6, accuracy_m: accuracy, observed_at: at(secondsAgo),
    received_at: at(Math.max(secondsAgo - 2, 0)), ...extra,
  });
  const device = 'b1580000-0000-4000-8000-0000000000a1';
  mock.trips[ORG_A] = [{
    trip_id: TRACKING_TRIP_A, trip_number: 9161, status: 'in_progress', started_at: at(1800),
    vehicle: { id: 'v', plate: 'TRQ1A11' }, driver: { id: 'd', name: 'Motorista Um' },
    session: { id: 's', status: 'active', platform: 'web_visible', capability: 'foreground_only', capability_changed_at: at(900),
      notifications_denied: false, last_online_confirmed_at: at(30), started_at: at(1700) },
    mobile: point('m2', 30, 15, { sync_kind: 'live', validity: 'valid' }),
    seals: [{ device_id: device, label: 'Lacre do C1', cylinder_id: 'c1', serial_number: 'TRK-A-1', item_status: 'in_transit',
      position: point('s2', 600, 9, { confirmed_at: at(600), quality: 'gps' }) }],
    open_occurrences: 0,
  }];
  mock.recent[TRACKING_TRIP_A] = {
    mobile: [point('m0', 1500, 15), point('m1', 1440, 15), point('m2', 30, 15)],
    seals: [{ device_id: device, positions: [point('s1', 660, 9), point('s2', 600, 9)] }],
  };
  const fact = (id: string, secondsAgo: number, extra: Json) => ({ id, subject_id: device, cylinder_id: 'c1', occurred_at: at(secondsAgo), ...extra });
  const mobileFact = (id: string, secondsAgo: number) => ({ ...point(id, secondsAgo, 15), kind: 'position', origin: 'mobile', subject_id: TRACKING_TRIP_A,
    subject_label: 'Celular do motorista', occurred_at: at(secondsAgo), sync_kind: 'live', validity: 'valid' });
  mock.history[TRACKING_TRIP_A] = [
    { id: 'e0', kind: 'event', subject_id: TRACKING_TRIP_A, trip_id: TRACKING_TRIP_A, event_type: 'trip_started', occurred_at: at(1800) },
    mobileFact('m0', 1500), mobileFact('m1', 1440),
    fact('c1', 300, { kind: 'comparison', result: 'outside', reason: 'beyond_limit', distance_m: 231.5, retrospective: false, rule_version: 1 }),
    mobileFact('m2', 300),
    fact('c2', 240, { kind: 'comparison', result: 'outside', reason: 'beyond_limit', distance_m: 240.2, retrospective: false, rule_version: 1 }),
    fact('c3', 180, { kind: 'comparison', result: 'outside', reason: 'beyond_limit', distance_m: 252.9, retrospective: false, rule_version: 1 }),
    fact('o1', 179, { kind: 'occurrence', trip_id: TRACKING_TRIP_A, status: 'open', detection_kind: 'live', alert_id: 'a1' }),
    fact('a1', 178, { kind: 'alert', alert_kind: 'proximity_separation', severity: 'high', status: 'open' }),
  ];
  mock.occurrences[TRACKING_OCCURRENCE_A] = {
    occurrence: { org: ORG_A, id: TRACKING_OCCURRENCE_A, status: 'open', detection_kind: 'live', version: 1, opened_at: at(179), acknowledged_at: null,
      closed_at: null, close_note: null, trip_id: TRACKING_TRIP_A, cylinder_id: 'c1', device_id: device, alert_id: 'a1', trip_number: 9161,
      serial_number: 'TRK-A-1', device_label: 'Lacre do C1', alert_status: 'open', acknowledged_by_name: null, closed_by_name: null },
    evidences: [300, 240, 180].map((seconds, index) => ({ id: `ev${index}`, observed_at: at(seconds), result: 'outside', reason: 'beyond_limit',
      distance_m: 231.5 + index * 10, rule_version: 1, distance_threshold_m: 100, retrospective: false })),
  };
  mock.trips[ORG_B] = [{
    trip_id: TRACKING_TRIP_B, trip_number: 7001, status: 'in_progress', started_at: at(600),
    vehicle: { id: 'vb', plate: 'TRQ1B11' }, driver: { id: 'db', name: 'Motorista B' }, session: null, mobile: null, seals: [], open_occurrences: 0,
  }];
}

export const createTrackingMock = (): TrackingMock => new TrackingMock();
