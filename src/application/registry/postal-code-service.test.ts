import { describe, expect, it, vi } from 'vitest';
import { PostalCodeService } from './postal-code-service';
import type { RegistryTransport } from './registry-service';

const ORG = '20000000-0000-4000-8000-00000000000a';
const ADDRESS = { postal_code: '01001000', street: 'Praça da Sé', district: 'Sé', city: 'São Paulo', state: 'SP', ibge_code: '3550308' };

const transport = (status: number, body: unknown): RegistryTransport & { call: ReturnType<typeof vi.fn> } => ({ call: vi.fn(async () => ({ status, body })) });
const service = (t: RegistryTransport, online = true) => new PostalCodeService(t, () => online);

describe('PostalCodeService: estados da busca (RF-008, RF-011)', () => {
  it('encontrado: devolve o endereço padronizado', async () => {
    const outcome = await service(transport(200, { code: 'FOUND', address: ADDRESS })).lookup(ORG, '01001-000');
    expect(outcome).toEqual({ kind: 'found', address: { postalCode: '01001000', street: 'Praça da Sé', district: 'Sé', city: 'São Paulo', state: 'SP', ibgeCode: '3550308' } });
  });

  it('CEP genérico (sem logradouro e bairro) também é encontrado, com os campos vazios', async () => {
    const outcome = await service(transport(200, { code: 'FOUND', address: { ...ADDRESS, street: '', district: '', ibge_code: null } })).lookup(ORG, '13000000');
    expect(outcome).toMatchObject({ kind: 'found', address: { street: '', district: '', ibgeCode: null } });
  });

  it('não encontrado: HTTP 200 com NOT_FOUND', async () => {
    expect(await service(transport(200, { code: 'NOT_FOUND' })).lookup(ORG, '99999999')).toEqual({ kind: 'not_found' });
  });

  it('indisponível: 503, falha de rede, corpo desconhecido e resposta sem endereço', async () => {
    expect(await service(transport(503, { code: 'SERVICE_UNAVAILABLE' })).lookup(ORG, '01001000')).toEqual({ kind: 'unavailable' });
    expect(await service(transport(500, { code: 'INTERNAL_ERROR' })).lookup(ORG, '01001000')).toEqual({ kind: 'unavailable' });
    expect(await service(transport(200, { code: 'FOUND' })).lookup(ORG, '01001000')).toEqual({ kind: 'unavailable' });
    expect(await service(transport(200, { code: 'FOUND', address: { postal_code: '01001000' } })).lookup(ORG, '01001000')).toEqual({ kind: 'unavailable' });
    const quebrado: RegistryTransport = { call: vi.fn(async () => { throw new Error('rede'); }) };
    expect(await service(quebrado).lookup(ORG, '01001000')).toEqual({ kind: 'unavailable' });
  });

  it('limite atingido: traz o tempo para tentar de novo', async () => {
    expect(await service(transport(429, { code: 'RATE_LIMITED', retry_after_seconds: 42 })).lookup(ORG, '01001000')).toEqual({ kind: 'rate_limited', retryAfterSeconds: 42 });
    expect(await service(transport(429, { code: 'RATE_LIMITED' })).lookup(ORG, '01001000')).toEqual({ kind: 'rate_limited', retryAfterSeconds: 60 });
  });

  it('sem permissão ou sessão vencida: acesso negado', async () => {
    expect(await service(transport(403, { code: 'ACCESS_DENIED' })).lookup(ORG, '01001000')).toEqual({ kind: 'denied' });
    expect(await service(transport(401, { code: 'AUTH_REQUIRED' })).lookup(ORG, '01001000')).toEqual({ kind: 'denied' });
  });

  it('CEP rejeitado pelo servidor: inválido', async () => {
    expect(await service(transport(400, { code: 'VALIDATION_FAILED' })).lookup(ORG, '01001000')).toEqual({ kind: 'invalid' });
  });
});

describe('PostalCodeService: o que é enviado e o que nunca é feito', () => {
  it('envia só a organização e o CEP normalizado', async () => {
    const t = transport(200, { code: 'FOUND', address: ADDRESS });
    await service(t).lookup(ORG, ' 01001-000 ');
    expect(t.call).toHaveBeenCalledTimes(1);
    expect(t.call).toHaveBeenCalledWith('lookup-postal-code', { organization_id: ORG, postal_code: '01001000' });
    expect(Object.keys(t.call.mock.calls[0]?.[1] ?? {}).sort()).toEqual(['organization_id', 'postal_code']);
  });

  it('CEP que não tem 8 dígitos é inválido e nem chama o servidor', async () => {
    const t = transport(200, { code: 'FOUND', address: ADDRESS });
    expect(await service(t).lookup(ORG, '0100100')).toEqual({ kind: 'invalid' });
    expect(await service(t).lookup(ORG, '')).toEqual({ kind: 'invalid' });
    expect(t.call).not.toHaveBeenCalled();
  });

  it('sem conexão devolve offline sem chamar o servidor (RF-045)', async () => {
    const t = transport(200, { code: 'FOUND', address: ADDRESS });
    expect(await service(t, false).lookup(ORG, '01001000')).toEqual({ kind: 'offline' });
    expect(t.call).not.toHaveBeenCalled();
  });

  it('nenhuma resposta vai para localStorage, sessionStorage ou IndexedDB (RF-012)', async () => {
    const local = vi.spyOn(Storage.prototype, 'setItem');
    const open = vi.fn();
    vi.stubGlobal('indexedDB', { open });
    try {
      await service(transport(200, { code: 'FOUND', address: ADDRESS })).lookup(ORG, '01001000');
      await service(transport(200, { code: 'NOT_FOUND' })).lookup(ORG, '99999999');
      await service(transport(503, { code: 'SERVICE_UNAVAILABLE' })).lookup(ORG, '01001000');
      expect(local).not.toHaveBeenCalled();
      expect(open).not.toHaveBeenCalled();
    } finally {
      local.mockRestore();
      vi.unstubAllGlobals();
    }
  });
});
