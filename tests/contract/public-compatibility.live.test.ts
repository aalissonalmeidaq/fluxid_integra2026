// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { checkEndpointCompatibility } from '../../src/infrastructure/connectivity/endpoint-compatibility-check';

// Contrato de RF-047: cada destino expõe publicamente apenas a versão do contrato/schema.
// Exige o Supabase local em execução.
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_LOCAL_URL ?? 'http://127.0.0.1:54321';
const ENDPOINT = `${SUPABASE_URL}/functions/v1/public-compatibility`;

describe('Contrato público de compatibilidade (RF-047)', () => {
  it('responde sem autenticação com somente contractVersion', async () => {
    const response = await fetch(ENDPOINT);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const body = await response.json();
    expect(Object.keys(body)).toEqual(['contractVersion']);
    expect(body.contractVersion).toMatch(/^\d+(\.\d+)*$/);
  });

  it('não expõe segredo, URL ou detalhes do ambiente', async () => {
    const text = await (await fetch(ENDPOINT)).text();
    expect(text).not.toMatch(/key|secret|token|https?:\/\//i);
  });

  it('rejeita métodos que não sejam GET', async () => {
    expect((await fetch(ENDPOINT, { method: 'POST' })).status).toBe(405);
  });

  it('é aceita pelo EndpointCompatibilityCheck quando a versão coincide e bloqueia quando diverge', async () => {
    const { contractVersion } = await (await fetch(ENDPOINT)).json();
    await expect(checkEndpointCompatibility(SUPABASE_URL, contractVersion)).resolves.toMatchObject({ ok: true });
    await expect(checkEndpointCompatibility(SUPABASE_URL, '999.0')).resolves.toMatchObject({
      ok: false, failure: 'incompatible_contract', fallbackAllowed: false,
    });
  });
});
