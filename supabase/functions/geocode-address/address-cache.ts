import type { GeocodeQuery } from './provider.ts';

// Cache server-side por endereço normalizado (integração temporária do protótipo). A chave é o hash SHA-256 do endereço
// normalizado, para o texto do endereço não servir de índice; o isolamento entre organizações vem de `organization_id` na tabela
// e na consulta, nunca da chave. Prazo de retenção: GEOCODING_CACHE_TTL_DAYS (padrão 30 dias, docs/geocodificacao-prototipo.md).

const fold = (value: string): string => value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();

// Maiúsculas, acentos e espaços repetidos não criam entradas distintas; o CEP já chega só com dígitos.
export const normalizeAddress = (query: GeocodeQuery): string =>
  [query.street, query.number, query.city, query.state, query.postal_code].map(fold).join('|');

export async function addressCacheKey(query: GeocodeQuery): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(normalizeAddress(query)));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
