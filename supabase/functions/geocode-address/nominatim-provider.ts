import { type GeocodePrecision, type GeocodeQuery, type GeocodeResult, type GeocodingProvider, UFS } from './provider.ts';

// Adaptador do Nominatim (OpenStreetMap), busca estruturada em https://nominatim.openstreetmap.org/search.
// Política de uso: identificação do aplicativo, no máximo 1 requisição por segundo (controlada no manipulador) e nenhum dado
// além do endereço. Só campos de endereço saem, na query string de um GET sem corpo nem cookies (RF-065, CA-018).

export const NOMINATIM_BASE_URL = 'https://nominatim.openstreetmap.org';
export const USER_AGENT = 'FluxID/1.0 (geocodificacao de enderecos de unidades)';

export type FetchLike = (input: string, init: { method: 'GET'; headers: Record<string, string>; signal: AbortSignal }) => Promise<Response>;

const HOUSE_TYPES = new Set(['house', 'building', 'place', 'amenity', 'shop', 'office', 'commercial', 'industrial', 'residential', 'man_made']);
const STREET_TYPES = new Set(['road', 'street', 'pedestrian', 'footway', 'path', 'highway']);

const precisionOf = (addressType: unknown): GeocodePrecision => {
  if (typeof addressType !== 'string') return 'locality';
  if (HOUSE_TYPES.has(addressType)) return 'address';
  if (STREET_TYPES.has(addressType)) return 'street';
  return 'locality';
};

const coordinate = (value: unknown, limit: number): number => {
  const parsed = typeof value === 'string' ? Number(value) : typeof value === 'number' ? value : Number.NaN;
  if (!Number.isFinite(parsed) || Math.abs(parsed) > limit) throw new Error('provider_body');
  return Math.round(parsed * 1e6) / 1e6;
};

export class NominatimProvider implements GeocodingProvider {
  constructor(private readonly fetcher: FetchLike = (input, init) => fetch(input, init)) {}

  async geocode(query: GeocodeQuery, signal: AbortSignal): Promise<GeocodeResult> {
    if (query.city.trim() === '' || !(UFS as readonly string[]).includes(query.state)) throw new Error('address_invalid');
    const params = new URLSearchParams({
      format: 'jsonv2', limit: '1', addressdetails: '1', countrycodes: 'br',
      street: `${query.number} ${query.street}`.trim(), city: query.city, state: query.state,
    });
    if (query.postal_code !== '') params.set('postalcode', query.postal_code);
    const response = await this.fetcher(`${NOMINATIM_BASE_URL}/search?${params.toString()}`, {
      method: 'GET',
      headers: { accept: 'application/json', 'user-agent': USER_AGENT },
      signal,
    });
    if (response.status !== 200) throw new Error('provider_status');
    const body = await response.json().catch(() => null) as unknown;
    if (!Array.isArray(body)) throw new Error('provider_body');
    if (body.length === 0) return 'NOT_FOUND';
    const hit = body[0] as Record<string, unknown> | null;
    if (typeof hit !== 'object' || hit === null) throw new Error('provider_body');
    return {
      latitude: coordinate(hit.lat, 90),
      longitude: coordinate(hit.lon, 180),
      display_name: typeof hit.display_name === 'string' ? hit.display_name.trim().slice(0, 300) : '',
      precision: precisionOf(hit.addresstype),
    };
  }
}
