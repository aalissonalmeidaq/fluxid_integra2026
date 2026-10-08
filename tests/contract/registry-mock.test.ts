// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { ORG_A, ORG_B, RegistryMock, ok } from '../e2e/support/mock-registry';

// Base do backend simulado dos E2E da Spec 007: o contrato que as operações de cada história herdam.
const allow = (codes: string[]) => (_org: string, code: string) => codes.includes(code);
const everything = () => true;
const mock = () => {
  const registry = new RegistryMock();
  registry.register('list_things', { kind: 'query', permission: 'customer.read', run: ({ org }) => ok('LISTED', { org }) });
  registry.register('sensitive', { kind: 'manage', permission: ['driver.anonymize', 'customer.anonymize'], mfa: true, run: () => ok('ANONYMIZED') });
  return registry;
};

describe('RegistryMock: borda das operações', () => {
  it('operação desconhecida (inclusive exclusão) é recusada com 400', () => {
    expect(mock().handle('manage', { operation: 'delete_customer', organization_id: ORG_A }, everything)).toEqual({ status: 400, json: { code: 'VALIDATION_FAILED' } });
  });

  it('organização ausente ou fora das duas conhecidas é 400', () => {
    expect(mock().handle('query', { operation: 'list_things' }, everything).status).toBe(400);
    expect(mock().handle('query', { operation: 'list_things', organization_id: 'outra' }, everything).status).toBe(400);
  });

  it('sem a permissão da operação é 403, e com uma das permissões da lista é permitido', () => {
    const registry = mock();
    expect(registry.handle('query', { operation: 'list_things', organization_id: ORG_A }, allow([]))).toEqual({ status: 403, json: { code: 'ACCESS_DENIED' } });
    expect(registry.handle('query', { operation: 'list_things', organization_id: ORG_A }, allow(['customer.read'])).status).toBe(200);
    expect(registry.handle('manage', { operation: 'sensitive', organization_id: ORG_A }, allow(['customer.anonymize'])).status).toBe(200);
  });

  it('a permissão é conferida na organização do corpo, nunca em outra', () => {
    const registry = mock();
    const soA = (org: string, code: string) => org === ORG_A && code === 'customer.read';
    expect(registry.handle('query', { operation: 'list_things', organization_id: ORG_A }, soA).status).toBe(200);
    expect(registry.handle('query', { operation: 'list_things', organization_id: ORG_B }, soA).status).toBe(403);
  });

  it('operação com MFA responde 403 MFA_REQUIRED sem sessão aal2 e funciona com ela', () => {
    const registry = mock();
    registry.aal = 'aal1';
    expect(registry.handle('manage', { operation: 'sensitive', organization_id: ORG_A }, everything)).toEqual({ status: 403, json: { code: 'MFA_REQUIRED' } });
    registry.aal = 'aal2';
    expect(registry.handle('manage', { operation: 'sensitive', organization_id: ORG_A }, everything).status).toBe(200);
  });

  it('consulta e comando com o mesmo nome são operações diferentes', () => {
    expect(mock().handle('manage', { operation: 'list_things', organization_id: ORG_A }, everything).status).toBe(400);
  });
});

describe('RegistryMock: histórico imutável com sequência', () => {
  it('numera os eventos por entidade, sem lacunas, e isola por organização', () => {
    const registry = mock();
    registry.appendEvent('customer', 'c1', ORG_A, 'customer_created', null);
    registry.appendEvent('customer', 'c1', ORG_A, 'customer_updated', null);
    registry.appendEvent('customer', 'c2', ORG_A, 'customer_created', null);
    registry.appendEvent('customer', 'c1', ORG_B, 'customer_created', null);
    expect(registry.eventsOf('customer', 'c1', ORG_A).map((event) => event.sequence)).toEqual([1, 2]);
    expect(registry.eventsOf('customer', 'c2', ORG_A).map((event) => event.sequence)).toEqual([1]);
    expect(registry.eventsOf('customer', 'c1', ORG_B).map((event) => event.event_type)).toEqual(['customer_created']);
  });

  it('o instante vem do relógio injetado', () => {
    const registry = mock();
    registry.now = () => new Date('2026-10-07T15:00:00Z');
    expect(registry.appendEvent('vehicle', 'v1', ORG_A, 'vehicle_created', null).occurred_at).toBe('2026-10-07T15:00:00.000Z');
  });
});

describe('RegistryMock: consulta de CEP', () => {
  const body = (postal_code: string) => ({ organization_id: ORG_A, postal_code });

  it('encontra o endereço e normaliza o CEP', () => {
    const registry = mock();
    const response = registry.handle('postal', body('01001-000'), allow(['customer.write']));
    expect(response.status).toBe(200);
    expect(response.json).toMatchObject({ code: 'FOUND', address: { postal_code: '01001000', street: 'Praça da Sé', state: 'SP' } });
    expect(registry.postalRequests).toEqual(['01001000']);
  });

  it('exige customer.write e CEP com 8 dígitos, sem chamar o provedor nos dois casos', () => {
    const registry = mock();
    expect(registry.handle('postal', body('01001000'), allow(['customer.read'])).status).toBe(403);
    expect(registry.handle('postal', body('0100'), allow(['customer.write'])).status).toBe(400);
    expect(registry.postalRequests).toEqual([]);
  });

  it.each([
    [{ kind: 'not_found' as const }, 200, 'NOT_FOUND'],
    [{ kind: 'unavailable' as const }, 503, 'SERVICE_UNAVAILABLE'],
    [{ kind: 'rate_limited' as const, retryAfterSeconds: 30 }, 429, 'RATE_LIMITED'],
    [{ kind: 'generic' as const }, 200, 'FOUND'],
  ])('cenário %j', (cenario, status, code) => {
    const registry = mock();
    registry.postalScenario = cenario;
    const response = registry.handle('postal', body('01001000'), allow(['customer.write']));
    expect([response.status, response.json.code]).toEqual([status, code]);
  });

  it('CEP genérico traz só cidade e UF, sem logradouro nem bairro', () => {
    const registry = mock();
    registry.postalScenario = { kind: 'generic' };
    expect(registry.handle('postal', body('01001000'), allow(['customer.write'])).json).toMatchObject({ address: { street: '', district: '' } });
  });

  it('limite de taxa traz o tempo para tentar de novo', () => {
    const registry = mock();
    registry.postalScenario = { kind: 'rate_limited', retryAfterSeconds: 30 };
    expect(registry.handle('postal', body('01001000'), allow(['customer.write'])).json).toMatchObject({ retry_after_seconds: 30 });
  });

  it('endereço do cenário pode ser trocado, e só o CEP é registrado como enviado', () => {
    const registry = mock();
    registry.postalScenario = { kind: 'found', address: { street: 'Avenida Paulista', district: 'Bela Vista' } };
    const response = registry.handle('postal', { ...body('01310100'), number: '1000', name: 'Hospital', document: '11222333000181' }, allow(['customer.write']));
    expect(response.json).toMatchObject({ address: { street: 'Avenida Paulista', district: 'Bela Vista' } });
    expect(registry.postalRequests).toEqual(['01310100']);
  });
});
