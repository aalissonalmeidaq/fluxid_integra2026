import { todayInSaoPaulo } from '../../../src/domain/shared/civil-date';

// Backend simulado das funções query-registry, manage-registry e lookup-postal-code (Spec 007) para os E2E. Reproduz o
// contrato de specs/007-clientes-geocercas-frota/contracts/ em memória: isolamento por organização, permissões, MFA, histórico com
// sequência e os cenários da consulta de CEP. Esta base não conhece nenhuma operação de domínio: cada história registra as suas
// com `register(...)` (clientes e unidades na US1/US2, geocercas na US3, veículos na US4, motoristas na US5, inativação na US6,
// histórico na US7, anonimização na US8). As regras de banco de verdade são provadas nas suítes pgTAP e `.live`.

export type Json = Record<string, unknown>;
export type Reply = { status: number; json: Json };

export const ORG_A = '20000000-0000-0000-0000-00000000000a';
export const ORG_B = '20000000-0000-0000-0000-00000000000b';
export const ACTOR_NAME = 'Administrador A';

export type Can = (organizationId: string, code: string) => boolean;
export type FunctionKind = 'query' | 'manage' | 'postal' | 'geocode';

export interface OperationContext {
  org: string;
  body: Json;
  can: Can;
  mock: RegistryMock;
}
export type OperationHandler = (context: OperationContext) => Reply;

export interface RegisteredOperation {
  kind: 'query' | 'manage';
  // Permissão exigida; uma lista exige qualquer uma delas. Sem permissão, a resposta é 403 ACCESS_DENIED.
  permission: string | readonly string[];
  // Exige sessão com segundo fator (anonimização, RF-055).
  mfa?: boolean;
  run: OperationHandler;
}

export interface RegistryEventRow {
  id: string;
  organization_id: string;
  entity_type: string;
  entity_id: string;
  sequence: number;
  event_type: string;
  actor_name: string;
  occurred_at: string;
  justification: string | null;
  data: Json;
}

// Cenários da geocodificação do endereço (contracts/geocodificacao-de-endereco.md).
export type GeocodeScenario =
  | { kind: 'found'; latitude?: number; longitude?: number; precision?: 'address' | 'street' | 'locality'; displayName?: string }
  | { kind: 'not_found' }
  | { kind: 'unavailable' }
  | { kind: 'disabled' }
  | { kind: 'personal_blocked' }
  | { kind: 'rate_limited'; retryAfterSeconds: number };

// Cenários da consulta de CEP (contracts/consulta-de-cep.md).
export type PostalScenario =
  | { kind: 'found'; address?: Partial<PostalAddress> }
  | { kind: 'generic' }
  | { kind: 'not_found' }
  | { kind: 'unavailable' }
  | { kind: 'rate_limited'; retryAfterSeconds: number };

export interface PostalAddress { postal_code: string; street: string; district: string; city: string; state: string; ibge_code: string }

const DEFAULT_ADDRESS: Omit<PostalAddress, 'postal_code'> = { street: 'Praça da Sé', district: 'Sé', city: 'São Paulo', state: 'SP', ibge_code: '3550308' };

export const reply = (status: number, json: Json): Reply => ({ status, json });
export const ok = (code: string, extra: Json = {}): Reply => reply(200, { code, ...extra });
export const fail = (code: string, status: number, extra: Json = {}): Reply => reply(status, { code, ...extra });

export class RegistryMock {
  // Dados por área, preenchidos e usados pelas operações que cada história registra.
  customers: Json[] = [];
  documents = new Map<string, Json>();
  contacts: Json[] = [];
  sites: Json[] = [];
  geofences: Json[] = [];
  vehicles: Json[] = [];
  drivers: Json[] = [];
  driverDocuments = new Map<string, Json>();
  events: RegistryEventRow[] = [];
  // Usuários com o papel de motorista, para o vínculo (o banco real consulta memberships e roles).
  linkableUsers: Array<{ id: string; organization_id: string; display_name: string; active: boolean }> = [];

  // Nível de autenticação da sessão simulada: `aal2` por padrão; os E2E de MFA trocam para `aal1`.
  aal: 'aal1' | 'aal2' = 'aal2';
  // Relógio dos eventos novos; a regressão visual fixa o instante para as capturas não variarem entre execuções.
  now: () => Date = () => new Date();
  postalScenario: PostalScenario = { kind: 'found' };
  // Faz o próximo comando perder a resposta depois de gravar (a rede caiu), para exercitar o estado "resultado desconhecido".
  loseNextCommandResponse = false;
  // Todo CEP pedido à função, para provar que só o CEP é enviado (CA-006).
  readonly postalRequests: string[] = [];
  geocodeScenario: GeocodeScenario = { kind: 'found' };
  // Todo corpo recebido pela geocodificação, para provar que só campos de endereço são enviados (CA-018).
  readonly geocodeRequests: Json[] = [];

  private operations = new Map<string, RegisteredOperation>();
  private counter = 1000;

  today = (): string => todayInSaoPaulo(this.now());

  nextId(prefix: string): string {
    this.counter += 1;
    return `${prefix}000000-0000-4000-8000-${String(this.counter).padStart(12, '0')}`;
  }

  register(operation: string, definition: RegisteredOperation): void {
    this.operations.set(`${definition.kind}:${operation}`, definition);
  }

  // Histórico imutável com sequência contínua por entidade (RF-036, RF-037).
  appendEvent(entityType: string, entityId: string, organizationId: string, eventType: string, justification: string | null, data: Json = {}): RegistryEventRow {
    const sequence = this.events.filter((event) => event.entity_type === entityType && event.entity_id === entityId).length + 1;
    const event: RegistryEventRow = {
      id: this.nextId('87'), organization_id: organizationId, entity_type: entityType, entity_id: entityId, sequence, event_type: eventType,
      actor_name: ACTOR_NAME, occurred_at: this.now().toISOString(), justification, data,
    };
    this.events.push(event);
    return event;
  }

  eventsOf(entityType: string, entityId: string, organizationId: string): RegistryEventRow[] {
    return this.events.filter((event) => event.entity_type === entityType && event.entity_id === entityId && event.organization_id === organizationId);
  }

  handle(kind: FunctionKind, body: Json, can: Can): Reply {
    if (kind === 'postal') return this.handlePostal(body, can);
    if (kind === 'geocode') return this.handleGeocode(body, can);
    const org = typeof body.organization_id === 'string' ? body.organization_id : '';
    if (org !== ORG_A && org !== ORG_B) return fail('VALIDATION_FAILED', 400);
    const operation = typeof body.operation === 'string' ? body.operation : '';
    const definition = this.operations.get(`${kind}:${operation}`);
    // Operação desconhecida (inclusive exclusão) não existe: o servidor recusa (CA-002).
    if (!definition) return fail('VALIDATION_FAILED', 400);
    if (definition.mfa && this.aal !== 'aal2') return fail('MFA_REQUIRED', 403);
    const required = typeof definition.permission === 'string' ? [definition.permission] : definition.permission;
    if (!required.some((code) => can(org, code))) return fail('ACCESS_DENIED', 403);
    const result = definition.run({ org, body, can, mock: this });
    if (kind === 'manage' && this.loseNextCommandResponse && result.status < 300) {
      this.loseNextCommandResponse = false;
      return fail('INTERNAL_ERROR', 503);
    }
    return result;
  }

  private handleGeocode(body: Json, can: Can): Reply {
    const org = typeof body.organization_id === 'string' ? body.organization_id : '';
    if (org !== ORG_A && org !== ORG_B) return fail('VALIDATION_FAILED', 400);
    if (!can(org, 'customer.write')) return fail('ACCESS_DENIED', 403);
    if (typeof body.customer_id !== 'string') return fail('VALIDATION_FAILED', 400);
    const complete = ['street', 'number', 'city', 'state'].every((field) => typeof body[field] === 'string' && String(body[field]).trim() !== '')
      && /^\d{8}$/.test(String(body.postal_code ?? ''));
    // Como o servidor: a funcionalidade desligada e a confirmação ausente recusam antes de olhar o endereço.
    if (this.geocodeScenario.kind === 'disabled') return fail('FEATURE_DISABLED', 403);
    if (body.consent_confirmed !== true) return fail('CONFIRMATION_REQUIRED', 428);
    if (!complete) return fail('ADDRESS_INCOMPLETE', 400);
    this.geocodeRequests.push({ ...body });
    const scenario = this.geocodeScenario;
    switch (scenario.kind) {
      case 'personal_blocked': return fail('PERSONAL_ADDRESS_NOT_ALLOWED', 403);
      case 'not_found': return ok('NOT_FOUND');
      case 'unavailable': return fail('SERVICE_UNAVAILABLE', 503);
      case 'rate_limited': return fail('RATE_LIMITED', 429, { retry_after_seconds: scenario.retryAfterSeconds });
      default: return ok('FOUND', {
        location: {
          latitude: scenario.latitude ?? -23.550453, longitude: scenario.longitude ?? -46.633911, precision: scenario.precision ?? 'address',
          display_name: scenario.displayName ?? `${String(body.street)}, ${String(body.city)}, ${String(body.state)}, Brasil`,
        },
      });
    }
  }

  private handlePostal(body: Json, can: Can): Reply {
    const org = typeof body.organization_id === 'string' ? body.organization_id : '';
    if (org !== ORG_A && org !== ORG_B) return fail('VALIDATION_FAILED', 400);
    if (!can(org, 'customer.write')) return fail('ACCESS_DENIED', 403);
    const postalCode = typeof body.postal_code === 'string' ? body.postal_code.replace(/[\s-]/g, '') : '';
    if (!/^\d{8}$/.test(postalCode)) return fail('VALIDATION_FAILED', 400, { fields: [{ field: 'postal_code', message: 'Informe o CEP com 8 dígitos.' }] });
    this.postalRequests.push(postalCode);
    const scenario = this.postalScenario;
    switch (scenario.kind) {
      case 'not_found': return ok('NOT_FOUND');
      case 'unavailable': return fail('SERVICE_UNAVAILABLE', 503);
      case 'rate_limited': return fail('RATE_LIMITED', 429, { retry_after_seconds: scenario.retryAfterSeconds });
      case 'generic': return ok('FOUND', { address: { postal_code: postalCode, street: '', district: '', city: 'Cidade Genérica', state: 'SP', ibge_code: '3500000' } });
      default: return ok('FOUND', { address: { postal_code: postalCode, ...DEFAULT_ADDRESS, ...scenario.address } });
    }
  }
}
