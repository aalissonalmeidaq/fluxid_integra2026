import { type PostalCodeProvider, type PostalLookup, UFS } from './provider.ts';

// Adaptador do ViaCEP (https://viacep.com.br). Contrato observado em 07/10/2026 (research.md, decisão 5):
// - CEP existente: HTTP 200 com cep, logradouro, bairro, localidade, uf, ibge e outros campos;
// - CEP bem formado que não existe: HTTP 200 com {"erro":"true"} (texto; a documentação antiga cita booleano, e os dois valem);
// - CEP malformado: HTTP 400 em HTML (o FluxID valida os 8 dígitos antes de chamar, então este caso é tratado como falha);
// - o campo "complemento" descreve o logradouro, não a unidade, e é ignorado.
// Só o CEP sai, no caminho da URL: sem query string, sem corpo, sem cookies e com cabeçalhos fixos (RF-009, CA-006).

export const VIACEP_BASE_URL = 'https://viacep.com.br/ws';
export const USER_AGENT = 'FluxID/1.0';

export type FetchLike = (input: string, init: { method: 'GET'; headers: Record<string, string>; signal: AbortSignal }) => Promise<Response>;

const limited = (value: unknown, max: number): string => (typeof value === 'string' ? value.trim().slice(0, max) : '');

export class ViaCepProvider implements PostalCodeProvider {
  constructor(private readonly fetcher: FetchLike = (input, init) => fetch(input, init)) {}

  async lookup(postalCode: string, signal: AbortSignal): Promise<PostalLookup> {
    if (!/^\d{8}$/.test(postalCode)) throw new Error('postal_code_invalid');
    const response = await this.fetcher(`${VIACEP_BASE_URL}/${postalCode}/json/`, {
      method: 'GET',
      headers: { accept: 'application/json', 'user-agent': USER_AGENT },
      signal,
    });
    if (response.status !== 200) throw new Error('provider_status');
    const body = await response.json().catch(() => null) as unknown;
    if (typeof body !== 'object' || body === null || Array.isArray(body)) throw new Error('provider_body');
    const data = body as Record<string, unknown>;
    if (data.erro === true || data.erro === 'true') return 'NOT_FOUND';

    const city = limited(data.localidade, 80);
    const state = typeof data.uf === 'string' ? data.uf.trim().toUpperCase() : '';
    if (city === '' || !(UFS as readonly string[]).includes(state)) throw new Error('provider_body');
    const ibge = typeof data.ibge === 'string' && /^\d{7}$/.test(data.ibge.trim()) ? data.ibge.trim() : null;
    return { postal_code: postalCode, street: limited(data.logradouro, 120), district: limited(data.bairro, 80), city, state, ibge_code: ibge };
  }
}
