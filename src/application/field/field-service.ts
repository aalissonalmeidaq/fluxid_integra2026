import type { CylinderTransport } from '../cylinders/cylinder-service';
import type { IdentifierCandidate } from '@/domain/field/identifier-candidates';
import type { IdentifierKind } from '@/domain/cylinders/cylinder-types';

// Serviço de campo (Spec 009): resolve o código lido (câmera, NFC, digitação ou leitor) pelo servidor. Usa o mesmo transporte de
// `query-cylinders` dos cilindros. Nunca guarda resposta no aparelho e, sem conexão, nem chama o servidor (RF-016, RF-022). O valor lido
// só viaja no corpo da requisição; não vai a log, a URL nem a armazenamento (RF-017).
export interface ResolvedCylinder {
  cylinder: { id: string; serialNumber: string; status: 'active' | 'inactive'; stockStatus: 'in_stock' | 'out_of_stock'; hydroStatus: string };
  identifier: { id: string; kind: IdentifierKind };
  // Posição do candidato que casou na lista enviada.
  matchedIndex: number;
  // Viagem aberta que reserva o cilindro: só vem a quem tem `trip.read` (RF-003).
  trip: { id: string; number: number; status: string } | null;
}

export type ResolveOutcome =
  | { kind: 'found'; value: ResolvedCylinder }
  | { kind: 'not_found' }
  | { kind: 'deactivated'; cylinder: { id: string; serialNumber: string } }
  | { kind: 'invalid' }
  | { kind: 'offline' }
  | { kind: 'access_denied' }
  | { kind: 'session_expired' }
  | { kind: 'unavailable' };

type Raw = Record<string, unknown>;
const isObject = (value: unknown): value is Raw => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const str = (value: unknown): string | null => (typeof value === 'string' ? value : null);

function toResolved(payload: Raw): ResolvedCylinder | null {
  const { cylinder, identifier, trip } = payload;
  if (!isObject(cylinder) || typeof cylinder.id !== 'string' || !isObject(identifier) || typeof identifier.id !== 'string') return null;
  return {
    cylinder: {
      id: cylinder.id, serialNumber: str(cylinder.serial_number) ?? '', status: cylinder.status as ResolvedCylinder['cylinder']['status'],
      stockStatus: cylinder.stock_status as ResolvedCylinder['cylinder']['stockStatus'], hydroStatus: str(cylinder.hydro_status) ?? '',
    },
    identifier: { id: identifier.id, kind: identifier.kind as IdentifierKind },
    matchedIndex: typeof payload.matched === 'number' ? payload.matched : 0,
    trip: isObject(trip) && typeof trip.id === 'string' && typeof trip.number === 'number' ? { id: trip.id, number: trip.number, status: str(trip.status) ?? '' } : null,
  };
}

export class FieldService {
  constructor(private readonly transport: CylinderTransport, private readonly isOnline: () => boolean = () => true) {}

  async resolveIdentifier(organizationId: string, candidates: readonly IdentifierCandidate[], expectedKind?: IdentifierKind): Promise<ResolveOutcome> {
    if (candidates.length === 0) return { kind: 'invalid' };
    if (!this.isOnline()) return { kind: 'offline' };
    const body: Record<string, unknown> = { operation: 'resolve', organization_id: organizationId, candidates: candidates.map((candidate) => candidate.value) };
    if (expectedKind) body.expected_kind = expectedKind;
    try {
      const response = await this.transport.call('query-cylinders', body);
      const payload = isObject(response.body) ? response.body : {};
      if (response.status >= 200 && response.status < 300) {
        const value = payload.code === 'FOUND' ? toResolved(payload) : null;
        return value ? { kind: 'found', value } : { kind: 'unavailable' };
      }
      switch (payload.code) {
        case 'NOT_FOUND': {
          const owner = payload.deactivated === true && isObject(payload.cylinder) && typeof payload.cylinder.id === 'string' ? payload.cylinder : null;
          return owner ? { kind: 'deactivated', cylinder: { id: owner.id as string, serialNumber: str(owner.serial_number) ?? '' } } : { kind: 'not_found' };
        }
        case 'VALIDATION_FAILED': return { kind: 'invalid' };
        case 'ACCESS_DENIED': return { kind: 'access_denied' };
        case 'AUTH_REQUIRED': return { kind: 'session_expired' };
        default: return { kind: 'unavailable' };
      }
    } catch {
      return { kind: 'unavailable' };
    }
  }
}
