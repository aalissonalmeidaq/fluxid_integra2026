import { normalizePostalCode } from '@/domain/registry/phone-and-postal-code';
import { isObject, num, str, type RegistryTransport } from './registry-service';

// Geocodificação do endereço da unidade pelo servidor (RF-065 a RF-067). Só a organização e os campos do endereço são
// enviados; a resposta é apenas uma sugestão, nunca guardada em armazenamento local; sem conexão nem se tenta (RF-045); qualquer
// falha termina em um estado que leva ao preenchimento manual das coordenadas.

export type GeocodePrecision = 'address' | 'street' | 'locality';

export interface GeocodedLocation {
  latitude: number;
  longitude: number;
  displayName: string;
  precision: GeocodePrecision;
}

export interface GeocodeAddressInput {
  street: string;
  number: string;
  district: string;
  city: string;
  state: string;
  postalCode: string;
}

export type GeocodeOutcome =
  | { kind: 'found'; location: GeocodedLocation }
  | { kind: 'not_found' }
  | { kind: 'unavailable' }
  | { kind: 'rate_limited'; retryAfterSeconds: number }
  | { kind: 'offline' }
  | { kind: 'invalid' }
  | { kind: 'denied' };

const PRECISIONS: readonly string[] = ['address', 'street', 'locality'];

function toLocation(value: unknown): GeocodedLocation | null {
  if (!isObject(value)) return null;
  const latitude = num(value.latitude);
  const longitude = num(value.longitude);
  const precision = typeof value.precision === 'string' && PRECISIONS.includes(value.precision) ? (value.precision as GeocodePrecision) : null;
  if (latitude === null || longitude === null || precision === null) return null;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  return { latitude, longitude, displayName: str(value.display_name) ?? '', precision };
}

export class GeocodingService {
  constructor(private readonly transport: RegistryTransport, private readonly isOnline: () => boolean = () => true) {}

  async locate(organizationId: string, address: GeocodeAddressInput): Promise<GeocodeOutcome> {
    const street = address.street.trim();
    const city = address.city.trim();
    const state = address.state.trim();
    if (street === '' || city === '' || state === '') return { kind: 'invalid' };
    if (!this.isOnline()) return { kind: 'offline' };
    try {
      const response = await this.transport.call('geocode-address', {
        organization_id: organizationId, street, number: address.number.trim(), district: address.district.trim(), city, state,
        postal_code: normalizePostalCode(address.postalCode) ?? '',
      });
      const body = isObject(response.body) ? response.body : {};
      const code = typeof body.code === 'string' ? body.code : '';
      if (response.status === 200) {
        if (code === 'NOT_FOUND') return { kind: 'not_found' };
        const location = code === 'FOUND' ? toLocation(body.location) : null;
        return location ? { kind: 'found', location } : { kind: 'unavailable' };
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
