import { todayInSaoPaulo } from '../../../src/domain/shared/civil-date';
import type { CylinderMock } from './mock-cylinders';
import { fail, ORG_A, ORG_B, type Can, type Json, type Reply, type RegistryMock } from './mock-registry';

// Backend simulado das funções query-trips e manage-trips (Spec 008) para os E2E. Reproduz o contrato de
// specs/008-viagens-paradas-carga/contracts/operacoes-servidor.md em memória: isolamento por organização, permissões, MFA, histórico com
// sequência e idempotência por `request_id`. Esta base não conhece nenhuma operação de domínio: cada história registra as suas com
// `register(...)` (planejamento na US1, carregamento e início na US2, entrega na US3, desbloqueio na US4, encerramento na US5 e
// histórico na US6). As regras de banco de verdade são provadas nas suítes pgTAP e `.live`.

export type TripFunctionKind = 'query' | 'manage';

export interface TripOperationContext {
  org: string;
  body: Json;
  can: Can;
  mock: TripMock;
}
export type TripOperationHandler = (context: TripOperationContext) => Reply;

export interface RegisteredTripOperation {
  kind: TripFunctionKind;
  // Permissão exigida; uma lista exige todas elas. Sem permissão, a resposta é 403 ACCESS_DENIED.
  permission: string | readonly string[];
  // Exige sessão com segundo fator (apenas o desbloqueio excepcional decide isso por dentro da operação; ver `aal`).
  mfa?: boolean;
  run: TripOperationHandler;
}

export interface TripRow {
  id: string;
  organization_id: string;
  number: number;
  planned_date: string;
  vehicle_id: string;
  driver_id: string;
  status: 'planned' | 'loading' | 'in_progress' | 'completed' | 'cancelled';
  notes: string | null;
  cancel_reason: string | null;
  version: number;
  created_at: string;
  created_by_name: string;
  started_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
}
export interface TripStopRow {
  id: string;
  organization_id: string;
  trip_id: string;
  site_id: string;
  position: number | null;
  status: 'pending' | 'on_site' | 'delivered' | 'with_divergence' | 'removed';
  arrived_at: string | null;
  out_of_order: boolean;
  closed_at: string | null;
}
export interface TripItemRow {
  id: string;
  organization_id: string;
  trip_id: string;
  stop_id: string;
  cylinder_id: string;
  item_status: 'planned' | 'checked' | 'in_transit' | 'delivered' | 'not_delivered' | 'removed' | 'released' | 'returned';
  lock_status: 'none' | 'locked' | 'unlocked';
  checked_at: string | null;
  checked_by_name: string | null;
  divergence_reason: string | null;
}
export interface TripDeliveryRow {
  id: string;
  organization_id: string;
  stop_id: string;
  delivered_at: string;
  recipient_name: string;
  recipient_role: string | null;
  latitude: number | null;
  longitude: number | null;
  at_site_address: boolean;
  outside_geofence: boolean | null;
  results: Json[];
  supersedes_id: string | null;
  recorded_by_name: string;
  recorded_at: string;
}
export interface TripUnlockRow {
  id: string;
  organization_id: string;
  item_id: string;
  exceptional: boolean;
  justification: string | null;
  aal: 'aal1' | 'aal2';
  actor_name: string;
  occurred_at: string;
}
export interface TripEventRow {
  id: string;
  organization_id: string;
  trip_id: string;
  sequence: number;
  event_type: string;
  actor_name: string;
  occurred_at: string;
  justification: string | null;
  data: Json;
}

export const TRIP_ACTOR_NAME = 'Administrador A';

export class TripMock {
  trips: TripRow[] = [];
  stops: TripStopRow[] = [];
  items: TripItemRow[] = [];
  deliveries: TripDeliveryRow[] = [];
  unlocks: TripUnlockRow[] = [];
  events: TripEventRow[] = [];
  // Pedidos já atendidos, por organização e `request_id` (idempotência de comando).
  private requests = new Map<string, { operation: string; tripId: string | null; reply: Reply }>();
  private counters = new Map<string, number>();
  private operations = new Map<string, RegisteredTripOperation>();
  private counter = 1000;

  // Nível de autenticação da sessão simulada: `aal2` por padrão; os E2E de MFA trocam para `aal1`.
  aal: 'aal1' | 'aal2' = 'aal2';
  // Relógio dos eventos novos; a regressão visual fixa o instante para as capturas não variarem entre execuções.
  now: () => Date = () => new Date();
  // Faz o próximo comando perder a resposta depois de gravar (a rede caiu), para exercitar o estado "resultado desconhecido".
  loseNextCommandResponse = false;
  // A sessão expirou: toda chamada de viagem volta 401 `AUTH_REQUIRED` e nada é gravado.
  sessionExpired = false;
  // Todo `request_id` recebido, na ordem, para provar que cada tentativa leva o seu e a repetição leva o mesmo.
  readonly receivedRequestIds: string[] = [];

  constructor(readonly registry: RegistryMock, readonly cylinders: CylinderMock) {
    cylinders.custodyOf = (cylinderId) => this.custodyOf(cylinderId);
  }

  // Custódia pelo último item que saiu do estoque: em trânsito (saiu ou não foi entregue), no cliente (entregue na unidade da parada) ou de volta.
  custodyOf(cylinderId: string): { status: string; site: { id: string; customer_id: string; name: string } | null } {
    const item = [...this.items].reverse().find((candidate) => candidate.cylinder_id === cylinderId && ['in_transit', 'not_delivered', 'delivered'].includes(candidate.item_status));
    if (!item) return { status: 'in_organization', site: null };
    if (item.item_status !== 'delivered') return { status: 'in_transit', site: null };
    const stop = this.stops.find((candidate) => candidate.id === item.stop_id);
    const site = stop ? this.registry.sites.find((candidate) => candidate.id === stop.site_id) : undefined;
    return { status: 'at_customer', site: site ? { id: String(site.id), customer_id: String(site.customer_id), name: String(site.name) } : null };
  }

  today = (): string => todayInSaoPaulo(this.now());

  nextId(prefix: string): string {
    this.counter += 1;
    return `${prefix}000000-0000-4000-8000-${String(this.counter).padStart(12, '0')}`;
  }

  // Número sequencial por organização, nunca reaproveitado.
  nextNumber(org: string): number {
    const next = (this.counters.get(org) ?? 0) + 1;
    this.counters.set(org, next);
    return next;
  }

  register(operation: string, definition: RegisteredTripOperation): void {
    this.operations.set(`${definition.kind}:${operation}`, definition);
  }

  tripOf(org: string, id: unknown): TripRow | undefined {
    return this.trips.find((trip) => trip.id === id && trip.organization_id === org);
  }

  stopsOf(tripId: string): TripStopRow[] {
    return this.stops.filter((stop) => stop.trip_id === tripId);
  }

  itemsOf(tripId: string): TripItemRow[] {
    return this.items.filter((item) => item.trip_id === tripId);
  }

  // Histórico imutável com sequência contínua por viagem.
  appendEvent(trip: TripRow, eventType: string, justification: string | null, data: Json = {}): TripEventRow {
    const sequence = this.events.filter((event) => event.trip_id === trip.id).length + 1;
    const event: TripEventRow = {
      id: this.nextId('9e'), organization_id: trip.organization_id, trip_id: trip.id, sequence, event_type: eventType,
      actor_name: TRIP_ACTOR_NAME, occurred_at: this.now().toISOString(), justification, data,
    };
    this.events.push(event);
    return event;
  }

  handle(kind: TripFunctionKind, body: Json, can: Can): Reply {
    const org = typeof body.organization_id === 'string' ? body.organization_id : '';
    if (org !== ORG_A && org !== ORG_B) return fail('VALIDATION_FAILED', 400);
    const operation = typeof body.operation === 'string' ? body.operation : '';
    const definition = this.operations.get(`${kind}:${operation}`);
    // Operação desconhecida (inclusive exclusão) não existe: o servidor recusa (RF-033).
    if (!definition) return fail('VALIDATION_FAILED', 400);
    if (this.sessionExpired) return fail('AUTH_REQUIRED', 401);
    if (definition.mfa && this.aal !== 'aal2') return fail('MFA_REQUIRED', 403);
    const required = typeof definition.permission === 'string' ? [definition.permission] : definition.permission;
    if (!required.every((code) => can(org, code))) return fail('ACCESS_DENIED', 403);

    if (kind === 'query') return definition.run({ org, body, can, mock: this });

    const requestId = body.request_id;
    if (typeof requestId !== 'string' || !/^[0-9a-f-]{36}$/i.test(requestId)) return fail('VALIDATION_FAILED', 400, { fields: [{ field: 'request_id', message: 'Campo obrigatório.' }] });
    this.receivedRequestIds.push(requestId);
    const key = `${org}:${requestId}`;
    const tripId = typeof body.trip_id === 'string' ? body.trip_id : null;
    const previous = this.requests.get(key);
    if (previous) {
      // Mesmo pedido: devolve o resultado gravado. Outra operação ou outra viagem com o mesmo `request_id`: REQUEST_REUSED.
      if (previous.operation !== operation || previous.tripId !== tripId) return fail('REQUEST_REUSED', 409);
      return { status: previous.reply.status, json: { ...previous.reply.json, replayed: true } };
    }
    const result = definition.run({ org, body, can, mock: this });
    if (result.status < 300) {
      this.requests.set(key, { operation, tripId, reply: result });
      if (this.loseNextCommandResponse) {
        this.loseNextCommandResponse = false;
        return fail('INTERNAL_ERROR', 503);
      }
    }
    return result;
  }
}
