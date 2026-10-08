import { normalizePostalCode } from '@/domain/registry/phone-and-postal-code';
import { isObject, num, str, type RegistryTransport } from './registry-service';

// Busca de CEP pelo servidor (RF-008 a RF-012). Só a organização e o CEP normalizado são enviados; a resposta nunca é guardada em
// armazenamento local; sem conexão nem se tenta (RF-045); qualquer falha termina em um estado que leva à digitação do endereço.

export interface PostalAddressView {
  postalCode: string;
  street: string;
  district: string;
  city: string;
  state: string;
  ibgeCode: string | null;
}

export type PostalLookupOutcome =
  | { kind: 'found'; address: PostalAddressView }
  | { kind: 'not_found' }
  | { kind: 'unavailable' }
  | { kind: 'rate_limited'; retryAfterSeconds: number }
  | { kind: 'offline' }
  | { kind: 'invalid' }
  | { kind: 'denied' };

function toAddress(value: unknown): PostalAddressView | null {
  if (!isObject(value)) return null;
  const postalCode = str(value.postal_code);
  const city = str(value.city);
  const state = str(value.state);
  if (postalCode === null || city === null || state === null) return null;
  return { postalCode, street: str(value.street) ?? '', district: str(value.district) ?? '', city, state, ibgeCode: str(value.ibge_code) };
}

export class PostalCodeService {
  constructor(private readonly transport: RegistryTransport, private readonly isOnline: () => boolean = () => true) {}

  async lookup(organizationId: string, postalCode: string): Promise<PostalLookupOutcome> {
    const normalized = normalizePostalCode(postalCode);
    if (normalized === null) return { kind: 'invalid' };
    if (!this.isOnline()) return { kind: 'offline' };
    try {
      const response = await this.transport.call('lookup-postal-code', { organization_id: organizationId, postal_code: normalized });
      const body = isObject(response.body) ? response.body : {};
      const code = typeof body.code === 'string' ? body.code : '';
      if (response.status === 200) {
        if (code === 'NOT_FOUND') return { kind: 'not_found' };
        const address = code === 'FOUND' ? toAddress(body.address) : null;
        return address ? { kind: 'found', address } : { kind: 'unavailable' };
      }
      if (response.status === 429) return { kind: 'rate_limited', retryAfterSeconds: num(body.retry_after_seconds) ?? 60 };
      if (response.status === 401 || response.status === 403) return { kind: 'denied' };
      if (response.status === 400) return { kind: 'invalid' };
      return { kind: 'unavailable' };
    } catch {
      return { kind: 'unavailable' };
    }
  }
}
