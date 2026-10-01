import { describe, expect, it, vi } from 'vitest';
import { checkEndpointCompatibility } from './endpoint-compatibility-check';

describe('EndpointCompatibilityCheck', () => {
  it('aceita somente a versão pública esperada', async () => {
    const compatible = vi.fn().mockResolvedValue(new Response(JSON.stringify({ contractVersion: '002.1' }), { status: 200, headers: { 'content-type': 'application/json' } }));
    await expect(checkEndpointCompatibility('https://example.test', '002.1', { fetcher: compatible })).resolves.toEqual({ ok: true, contractVersion: '002.1' });
  });

  it.each([{}, { contractVersion: '001.0' }])('bloqueia versão ausente ou incompatível', async (body) => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } }));
    await expect(checkEndpointCompatibility('https://example.test', '002.1', { fetcher })).resolves.toMatchObject({ ok: false, failure: 'incompatible_contract', fallbackAllowed: false });
  });

  it('bloqueia resposta pública não elegível', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 401 }));
    await expect(checkEndpointCompatibility('https://example.test', '002.1', { fetcher })).resolves.toEqual({ ok: false, failure: 'configuration', fallbackAllowed: false });
  });
});
