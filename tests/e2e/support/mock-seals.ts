import { fail, ORG_A, ORG_B, type Can, type Json, type Reply } from './mock-registry';

// Backend simulado das funções query-seals e manage-seals (Spec 012) para os E2E. Reproduz o contrato de
// specs/012-lacre-iot-geocerca-trava/contracts/operacoes-servidor.md em memória: isolamento por organização, permissões, segundo fator e
// idempotência por `request_id`. Esta base não conhece nenhuma operação de domínio: cada história registra as suas com `register(...)`.
// As regras de verdade são provadas nas suítes pgTAP e `.live`.

export type SealFunctionKind = 'query' | 'manage';

export interface SealOperationContext { org: string; body: Json; can: Can; mock: SealMock }
export type SealOperationHandler = (context: SealOperationContext) => Reply;

export interface RegisteredSealOperation {
  kind: SealFunctionKind;
  // Permissão exigida; sem ela, a resposta é 403 ACCESS_DENIED.
  permission: string;
  run: SealOperationHandler;
}

export class SealMock {
  // Linhas simuladas, livres para cada história (dispositivos, posições, comandos, alertas, inscrições de notificação).
  readonly tables: Record<string, Json[]> = {};
  private readonly requests = new Map<string, { operation: string; reply: Reply }>();
  private readonly operations = new Map<string, RegisteredSealOperation>();
  private counter = 5000;

  // Nível de autenticação da sessão simulada; os E2E do destravamento excepcional trocam para `aal1`.
  aal: 'aal1' | 'aal2' = 'aal2';
  // Relógio dos registros novos; a regressão visual fixa o instante.
  now: () => Date = () => new Date();
  sessionExpired = false;
  readonly receivedRequestIds: string[] = [];

  rows(table: string): Json[] {
    this.tables[table] ??= [];
    return this.tables[table];
  }

  nextId(prefix: string): string {
    this.counter += 1;
    return `${prefix}000000-0000-4000-8000-${String(this.counter).padStart(12, '0')}`;
  }

  register(operation: string, definition: RegisteredSealOperation): void {
    this.operations.set(`${definition.kind}:${operation}`, definition);
  }

  handle(kind: SealFunctionKind, body: Json, can: Can): Reply {
    const org = typeof body.organization_id === 'string' ? body.organization_id : '';
    if (org !== ORG_A && org !== ORG_B) return fail('VALIDATION_FAILED', 400);
    const operation = typeof body.operation === 'string' ? body.operation : '';
    const definition = this.operations.get(`${kind}:${operation}`);
    // Operação desconhecida (inclusive exclusão) não existe (RF-041).
    if (!definition) return fail('VALIDATION_FAILED', 400);
    if (this.sessionExpired) return fail('AUTH_REQUIRED', 401);
    if (!can(org, definition.permission)) return fail('ACCESS_DENIED', 403);
    if (kind === 'query') return definition.run({ org, body, can, mock: this });

    const requestId = body.request_id;
    if (typeof requestId !== 'string' || !/^[0-9a-f-]{36}$/i.test(requestId)) {
      return fail('VALIDATION_FAILED', 400, { fields: [{ field: 'request_id', message: 'Campo obrigatório.' }] });
    }
    this.receivedRequestIds.push(requestId);
    const key = `${org}:${requestId}`;
    const previous = this.requests.get(key);
    if (previous) {
      if (previous.operation !== operation) return fail('REQUEST_REUSED', 409);
      return { status: previous.reply.status, json: { ...previous.reply.json, replayed: true } };
    }
    const result = definition.run({ org, body, can, mock: this });
    if (result.status < 300) this.requests.set(key, { operation, reply: result });
    return result;
  }
}

export const createSealMock = (): SealMock => new SealMock();
