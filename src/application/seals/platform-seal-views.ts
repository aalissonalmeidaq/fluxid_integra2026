// Vistas da fila de pedidos do Master (Spec 013, contracts/operacoes-plataforma.md e contracts/telas.md). O servidor nunca manda a chave,
// o resumo do endereço nem a chave do aparelho em conflito; a vista recusa o que não reconhece, para a tela nunca mostrar dado inventado.
import { ENROLLMENT_STATUSES, signalText, type ApprovalCandidate, type EnrollmentStatus, type SignalText } from '@/domain/seals/seal-enrollment';

export type Raw = Record<string, unknown>;
const isObject = (value: unknown): value is Raw => typeof value === 'object' && value !== null && !Array.isArray(value);
const str = (value: unknown): string | null => (typeof value === 'string' ? value : null);
const num = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null);

export interface OrganizationRef { id: string; name: string }
const toOrg = (value: unknown): OrganizationRef | null =>
  isObject(value) && typeof value.id === 'string' && typeof value.name === 'string' ? { id: value.id, name: value.name } : null;

export interface EnrollmentView {
  id: string;
  deviceCode: string;
  status: EnrollmentStatus;
  conflict: boolean;
  conflictAt: string | null;
  conflictCalls: number;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
  calls: number;
  signalDbm: number | null;
  signal: SignalText | null;
  wifiSsid: string | null;
  firmwareVersion: string | null;
  organization: OrganizationRef | null;
  deviceId: string | null;
  lastOrganization: OrganizationRef | null;
  networksCleared: boolean;
  forgetNetworks: 'all' | 'extras' | null;
  forgetRequestedAt: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
  origin: 'enrollment' | 'manual';
  updatedAt: string;
}

export function toEnrollmentView(raw: unknown): EnrollmentView | null {
  if (!isObject(raw)) return null;
  const status = raw.status as EnrollmentStatus;
  if (typeof raw.id !== 'string' || typeof raw.device_code !== 'string' || typeof raw.updated_at !== 'string'
      || !ENROLLMENT_STATUSES.includes(status)) return null;
  const signalDbm = num(raw.signal_dbm);
  return {
    id: raw.id,
    deviceCode: raw.device_code,
    status,
    conflict: raw.conflict === true,
    conflictAt: str(raw.conflict_at),
    conflictCalls: num(raw.conflict_calls) ?? 0,
    firstSeenAt: str(raw.first_seen_at),
    lastSeenAt: str(raw.last_seen_at),
    calls: num(raw.calls) ?? 0,
    signalDbm,
    signal: signalText(signalDbm),
    wifiSsid: str(raw.wifi_ssid),
    firmwareVersion: str(raw.firmware_version),
    organization: toOrg(raw.organization),
    deviceId: str(raw.device_id),
    lastOrganization: toOrg(raw.last_organization),
    networksCleared: raw.networks_cleared !== false,
    forgetNetworks: raw.forget_networks === 'all' || raw.forget_networks === 'extras' ? raw.forget_networks : null,
    forgetRequestedAt: str(raw.forget_networks_requested_at),
    decidedAt: str(raw.decided_at),
    decisionNote: str(raw.decision_note),
    origin: raw.origin === 'manual' ? 'manual' : 'enrollment',
    updatedAt: raw.updated_at,
  };
}

// O que o domínio precisa para dizer o que impede a aprovação: o último tenant só conta enquanto o lacre não confirmou o esquecimento.
export const approvalCandidate = (item: EnrollmentView): ApprovalCandidate => ({
  status: item.status,
  conflict: item.conflict,
  lastOrganizationId: item.networksCleared ? null : item.lastOrganization?.id ?? null,
  lastOrganizationName: item.lastOrganization?.name ?? null,
});

export type EnrollmentCounts = Record<EnrollmentStatus, number>;
export interface EnrollmentPage {
  items: EnrollmentView[];
  total: number;
  counts: EnrollmentCounts;
  conflicts: number;
  rateLimitedLast24h: number;
}

export function toEnrollmentPage(raw: Raw): EnrollmentPage | null {
  if (raw.code !== 'LISTED' || !Array.isArray(raw.items) || typeof raw.total !== 'number') return null;
  const items = raw.items.map(toEnrollmentView);
  if (items.some((item) => item === null)) return null;
  const counts = Object.fromEntries(ENROLLMENT_STATUSES.map((s) => [s, isObject(raw.counts) ? num(raw.counts[s]) ?? 0 : 0])) as EnrollmentCounts;
  return { items: items as EnrollmentView[], total: raw.total, counts, conflicts: num(raw.conflicts) ?? 0, rateLimitedLast24h: num(raw.rate_limited_last_24h) ?? 0 };
}

// A lista atualiza a cada 30 s e anuncia só os pedidos aguardando que chegaram desde a leitura anterior (contracts/telas.md).
export const ENROLLMENT_REFRESH_MS = 30_000;
export function newPendingCodes(before: readonly EnrollmentView[] | null, after: readonly EnrollmentView[]): string[] {
  if (!before) return [];
  const known = new Set(before.map((item) => item.id));
  return after.filter((item) => item.status === 'pending' && !known.has(item.id)).map((item) => item.deviceCode);
}

export type PlatformFailureKind =
  | 'offline' | 'unavailable' | 'unknown' | 'session_expired' | 'access_denied' | 'mfa_required' | 'not_found' | 'invalid'
  | 'justification_required' | 'stale' | 'invalid_state' | 'enrollment_conflict' | 'tenant_inactive' | 'networks_not_cleared'
  | 'cylinder_in_trip' | 'not_configured' | 'request_reused';

const TEXTS: Record<PlatformFailureKind, string> = {
  offline: 'Sem conexão. A lista volta quando a conexão voltar.',
  unavailable: 'Não foi possível carregar agora. Tente de novo.',
  unknown: 'Não deu para confirmar o resultado. Atualize a lista antes de tentar de novo.',
  session_expired: 'Sua sessão terminou. Entre de novo para continuar.',
  access_denied: 'Você não tem permissão para gerenciar os lacres da plataforma.',
  mfa_required: 'Sua sessão não permite esta ação agora. Entre de novo e tente outra vez.',
  not_found: 'Não encontramos este pedido ou este tenant.',
  invalid: 'Confira os campos e tente de novo.',
  justification_required: 'Escreva uma justificativa de 5 a 500 caracteres.',
  stale: 'O pedido mudou desde que a lista foi carregada. Atualize e decida de novo.',
  invalid_state: 'Esta ação não vale para a situação atual do pedido.',
  enrollment_conflict: 'Outro aparelho com este código. Resolva o conflito antes de aprovar.',
  tenant_inactive: 'Este tenant não está ativo.',
  networks_not_cleared: 'Este lacre ainda pode ter redes do tenant anterior. Use "Esquecer todas as redes" e configure a rede no novo local.',
  cylinder_in_trip: 'O cilindro deste lacre está numa viagem em andamento.',
  not_configured: 'A senha da rede de configuração não foi configurada no servidor. Veja docs/publicacao-em-nuvem.md.',
  request_reused: 'Este envio já foi usado em outra ação. Tente de novo.',
};
export const failureText = (kind: PlatformFailureKind): string => TEXTS[kind];
