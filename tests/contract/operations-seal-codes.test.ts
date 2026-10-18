// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createOperationsHandler, type OperationsGateway } from '../../supabase/functions/_shared/operations';

// Spec 012 (T025): os códigos de negócio do lacre (contracts/operacoes-servidor.md) têm o HTTP do contrato na borda comum, sem
// mudar o comportamento das funções existentes.
const ORG = '20000000-0000-4000-8000-00000000000a';

function handlerReturning(code: string) {
  const gateway: OperationsGateway = {
    authenticate: vi.fn(async () => ({ userId: '10000000-0000-4000-8000-000000000002', sessionId: '60000000-0000-4000-8000-0000000800a2', aal: 'aal1' as const })),
    rpc: vi.fn(async () => ({ code })),
    audit: vi.fn(async () => undefined),
  };
  return createOperationsHandler(gateway, { probe: { rpc: 'probe', fields: {} } }, { prefix: 'seal' });
}

const call = async (code: string) => {
  const response = await handlerReturning(code)(new Request('http://x/seal', {
    method: 'POST', headers: { authorization: 'Bearer t' }, body: JSON.stringify({ operation: 'probe', organization_id: ORG }),
  }));
  return response.status;
};

describe('códigos do lacre na borda comum', () => {
  it.each(['BOUND', 'UNBOUND', 'REQUESTED', 'ACKNOWLEDGED', 'CLOSED', 'SUBSCRIBED', 'UNSUBSCRIBED', 'ROTATED'])('%s é sucesso (200)', async (code) => {
    expect(await call(code)).toBe(200);
  });

  it.each([
    ['SEAL_ALREADY_BOUND', 409], ['CYLINDER_ALREADY_BOUND', 409], ['SEAL_INACTIVE', 409], ['NO_BINDING', 409], ['CYLINDER_IN_TRIP', 409],
    ['WIFI_LIST_FULL', 409], ['WIFI_NOT_IN_LIST', 409], ['WIFI_RISK_NOT_CONFIRMED', 400], ['ALERT_CLOSED', 409], ['NOTE_REQUIRED', 400],
    ['JUSTIFICATION_REQUIRED', 400], ['MFA_REQUIRED', 403], ['NOT_FOUND', 404],
  ])('%s responde %i', async (code, status) => {
    expect(await call(code)).toBe(status);
  });
});
