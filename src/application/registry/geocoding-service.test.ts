import { describe, expect, it, vi } from 'vitest';
import { GeocodingService } from './geocoding-service';
import type { RegistryTransport } from './registry-service';

// Geocodificação do endereço pelo servidor (RF-065 a RF-067). O transporte é falso: nenhum teste chama a rede.

const ORG = '20000000-0000-4000-8000-00000000000a';
const CUSTOMER = '81000000-0000-4000-8000-00000000000a';
const ADDRESS = { street: 'Praça da Sé', number: '100', district: 'Sé', city: 'São Paulo', state: 'SP', postalCode: '01001-000' };
const LOCATION = { latitude: -23.550453, longitude: -46.633911, display_name: 'Praça da Sé, São Paulo', precision: 'address' };

const transportOf = (status: number, body: unknown): RegistryTransport & { call: ReturnType<typeof vi.fn> } =>
  ({ call: vi.fn(async () => ({ status, body })) }) as never;

describe('GeocodingService', () => {
  it('envia a organização, o cliente, a confirmação e só logradouro, número, cidade, UF e CEP (normalizado); nunca o bairro', async () => {
    const transport = transportOf(200, { code: 'FOUND', location: LOCATION });
    await new GeocodingService(transport).locate(ORG, CUSTOMER, ADDRESS, true);
    expect(transport.call).toHaveBeenCalledWith('geocode-address', {
      organization_id: ORG, customer_id: CUSTOMER, consent_confirmed: true, street: 'Praça da Sé', number: '100', city: 'São Paulo', state: 'SP', postal_code: '01001000',
    });
  });

  it('sem a confirmação explícita nem chama o servidor', async () => {
    const transport = transportOf(200, { code: 'FOUND', location: LOCATION });
    expect(await new GeocodingService(transport).locate(ORG, CUSTOMER, ADDRESS, false)).toEqual({ kind: 'confirmation_required' });
    expect(transport.call).not.toHaveBeenCalled();
  });

  it.each([
    [403, { code: 'FEATURE_DISABLED' }, { kind: 'disabled' }],
    [403, { code: 'PERSONAL_ADDRESS_NOT_ALLOWED' }, { kind: 'personal_blocked' }],
    [403, { code: 'TEST_ENVIRONMENT_BLOCKED' }, { kind: 'blocked' }],
    [428, { code: 'CONFIRMATION_REQUIRED' }, { kind: 'confirmation_required' }],
    [400, { code: 'ADDRESS_INCOMPLETE' }, { kind: 'invalid' }],
    [404, { code: 'NOT_FOUND' }, { kind: 'invalid' }],
  ])('bloqueio do servidor %j vira %j', async (status, body, expected) => {
    expect(await new GeocodingService(transportOf(status, body)).locate(ORG, CUSTOMER, ADDRESS, true)).toEqual(expected);
  });

  it('devolve a localização encontrada com o endereço normalizado e a precisão', async () => {
    const outcome = await new GeocodingService(transportOf(200, { code: 'FOUND', location: LOCATION })).locate(ORG, CUSTOMER, ADDRESS, true);
    expect(outcome).toEqual({ kind: 'found', location: { latitude: -23.550453, longitude: -46.633911, displayName: 'Praça da Sé, São Paulo', precision: 'address' } });
  });

  it('endereço inexistente é not_found', async () => {
    expect(await new GeocodingService(transportOf(200, { code: 'NOT_FOUND' })).locate(ORG, CUSTOMER, ADDRESS, true)).toEqual({ kind: 'not_found' });
  });

  it.each([
    [429, { code: 'RATE_LIMITED', retry_after_seconds: 7 }, { kind: 'rate_limited', retryAfterSeconds: 7 }],
    [503, { code: 'SERVICE_UNAVAILABLE' }, { kind: 'unavailable' }],
    [500, { code: 'INTERNAL_ERROR' }, { kind: 'unavailable' }],
    [401, { code: 'AUTH_REQUIRED' }, { kind: 'denied' }],
    [403, { code: 'ACCESS_DENIED' }, { kind: 'denied' }],
    [400, { code: 'VALIDATION_FAILED' }, { kind: 'invalid' }],
    [200, { code: 'FOUND', location: { latitude: 'x' } }, { kind: 'unavailable' }],
    [200, { code: 'FOUND', location: { ...LOCATION, latitude: 123 } }, { kind: 'unavailable' }],
  ])('status %i vira %j', async (status, body, expected) => {
    expect(await new GeocodingService(transportOf(status, body)).locate(ORG, CUSTOMER, ADDRESS, true)).toEqual(expected);
  });

  it('endereço incompleto não chama o servidor', async () => {
    const transport = transportOf(200, { code: 'FOUND', location: LOCATION });
    const service = new GeocodingService(transport);
    expect(await service.locate(ORG, CUSTOMER, { ...ADDRESS, street: ' ' }, true)).toEqual({ kind: 'invalid' });
    expect(await service.locate(ORG, CUSTOMER, { ...ADDRESS, number: '' }, true)).toEqual({ kind: 'invalid' });
    expect(await service.locate(ORG, CUSTOMER, { ...ADDRESS, city: '' }, true)).toEqual({ kind: 'invalid' });
    expect(await service.locate(ORG, CUSTOMER, { ...ADDRESS, state: '' }, true)).toEqual({ kind: 'invalid' });
    expect(await service.locate(ORG, CUSTOMER, { ...ADDRESS, postalCode: '' }, true)).toEqual({ kind: 'invalid' });
    expect(await service.locate(ORG, CUSTOMER, { ...ADDRESS, postalCode: '0100' }, true)).toEqual({ kind: 'invalid' });
    expect(transport.call).not.toHaveBeenCalled();
  });

  it('sem conexão nem tenta; falha do transporte vira unavailable', async () => {
    const transport = transportOf(200, { code: 'FOUND', location: LOCATION });
    expect(await new GeocodingService(transport, () => false).locate(ORG, CUSTOMER, ADDRESS, true)).toEqual({ kind: 'offline' });
    expect(transport.call).not.toHaveBeenCalled();
    const broken: RegistryTransport = { call: async () => { throw new Error('rede'); } };
    expect(await new GeocodingService(broken).locate(ORG, CUSTOMER, ADDRESS, true)).toEqual({ kind: 'unavailable' });
  });
});
