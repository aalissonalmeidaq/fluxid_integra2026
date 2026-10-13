import { offlineSessionState } from '@/domain/field/offline-session';

// Acesso offline restrito (Spec 010, RF-016, RF-016a; research.md §19a). Quando o servidor está inalcançável na abertura do aplicativo, a sessão pode
// voltar a partir deste registro, por até 8 horas desde a última confirmação do servidor. O registro guarda só identificadores, códigos de permissão e
// o instante da confirmação: **nunca** token, e-mail nem dado de domínio. Quem decide cada operação continua sendo o servidor, no envio da fila.
export interface OfflineAccessRecord {
  version: 1;
  actorId: string;
  organizationId: string;
  // Nome e tipo da organização, só para a barra superior mostrar onde a pessoa está sem precisar do servidor.
  organizationName: string;
  organizationKind: string;
  endpointId: string;
  aal: 'aal1' | 'aal2';
  displayName: string;
  // Códigos de permissão do tenant ativo na última confirmação.
  permissions: string[];
  confirmedAt: string;
}

const PERMISSION_CODE = /^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/;
const MAX_PERMISSIONS = 300;
const text = (value: unknown): string | null => (typeof value === 'string' && value.length > 0 && value.length <= 200 ? value : null);

// Lê só a lista fechada de campos: o que vier a mais (token, e-mail, sessão, viagens) é descartado, nunca guardado.
export function parseOfflineAccess(raw: unknown): OfflineAccessRecord | null {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const value = raw as Record<string, unknown>;
  if (value.version !== 1) return null;
  const actorId = text(value.actorId);
  const organizationId = text(value.organizationId);
  const endpointId = text(value.endpointId);
  const confirmedAt = text(value.confirmedAt);
  if (!actorId || !organizationId || !endpointId || !confirmedAt || Number.isNaN(Date.parse(confirmedAt))) return null;
  if (value.aal !== 'aal1' && value.aal !== 'aal2') return null;
  if (typeof value.displayName !== 'string' || value.displayName.length > 200) return null;
  if (typeof value.organizationName !== 'string' || value.organizationName.length > 200) return null;
  const organizationKind = text(value.organizationKind);
  if (!organizationKind || organizationKind.length > 40) return null;
  if (!Array.isArray(value.permissions) || value.permissions.length > MAX_PERMISSIONS) return null;
  if (!value.permissions.every((code) => typeof code === 'string' && PERMISSION_CODE.test(code))) return null;
  return {
    version: 1, actorId, organizationId, organizationName: value.organizationName, organizationKind, endpointId, aal: value.aal, displayName: value.displayName,
    permissions: [...new Set(value.permissions as string[])], confirmedAt,
  };
}

export interface OfflineAccessInput {
  actorId: string;
  organizationId: string;
  organizationName: string;
  organizationKind: string;
  endpointId: string;
  aal: 'aal1' | 'aal2';
  displayName: string;
  permissions: readonly string[];
  confirmedAt: Date;
}

export function buildOfflineAccess(input: OfflineAccessInput): OfflineAccessRecord {
  return {
    version: 1, actorId: input.actorId, organizationId: input.organizationId, organizationName: input.organizationName, organizationKind: input.organizationKind, endpointId: input.endpointId, aal: input.aal,
    displayName: input.displayName, permissions: [...input.permissions], confirmedAt: input.confirmedAt.toISOString(),
  };
}

export type RestoreResult = { ok: true; record: OfflineAccessRecord; remainingMs: number } | { ok: false; reason: 'missing' | 'invalid' | 'expired' };

// Restaura só com o registro válido e a menos de 8 horas da última confirmação (a inatividade de 30 minutos não conta offline).
export function restoreOfflineAccess(raw: unknown, now: Date): RestoreResult {
  if (raw === null || raw === undefined) return { ok: false, reason: 'missing' };
  const record = parseOfflineAccess(raw);
  if (!record) return { ok: false, reason: 'invalid' };
  const state = offlineSessionState(new Date(record.confirmedAt), now);
  if (!state.allowed) return { ok: false, reason: 'expired' };
  return { ok: true, record, remainingMs: state.remainingMs };
}
