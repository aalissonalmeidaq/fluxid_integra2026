import { describe, expect, it, vi } from 'vitest';
import type { TrackingTransport } from './tracking-ports';
import { ProximityRuleService } from './proximity-rule-service';

// Spec 015 (T041d; RF-009, RF-009a): consulta e alteração da regra fora do React. As faixas são conferidas antes do envio (o banco
// confere de novo); a justificativa é obrigatória; a resposta vira estado de tela.
const ORG = 'org-a';
const RULE = { id: 'r1', version: 2, distance_m: 200, max_age_s: 180, max_accuracy_m: 40, valid_from: '2026-10-22T12:00:00Z' };
const transport = (status: number, body: unknown) => ({ call: vi.fn(async () => ({ status, body })) }) satisfies TrackingTransport;

describe('regra de proximidade', () => {
  it('lê a regra vigente', async () => {
    const t = transport(200, { code: 'FOUND', rule: RULE });
    expect(await new ProximityRuleService(t).get(ORG)).toEqual({ kind: 'success', value: { version: 2, distanceM: 200, maxAgeS: 180, maxAccuracyM: 40, validFrom: '2026-10-22T12:00:00Z' } });
    expect(t.call).toHaveBeenCalledWith('query-tracking', { operation: 'get_proximity_rule', organization_id: ORG });
  });

  it('recusa valores fora das faixas antes de enviar', async () => {
    const t = transport(200, {});
    const outcome = await new ProximityRuleService(t).set(ORG, { distanceM: 600, maxAgeS: 30, maxAccuracyM: 50 }, 'Rota rural com sinal fraco.', 'req');
    expect(outcome).toEqual({ kind: 'invalid', fields: { distance_m: 'Use um número inteiro entre 50 e 500.', max_age_s: 'Use um número inteiro entre 60 e 300.' } });
    expect(t.call).not.toHaveBeenCalled();
  });

  it('exige justificativa de 10 a 500 caracteres', async () => {
    const outcome = await new ProximityRuleService(transport(200, {})).set(ORG, { distanceM: 200, maxAgeS: 180, maxAccuracyM: 40 }, 'curta', 'req');
    expect(outcome).toEqual({ kind: 'invalid', fields: { justification: 'Explique a mudança com 10 a 500 caracteres.' } });
  });

  it('envia a alteração com o identificador do pedido e devolve a nova versão', async () => {
    const t = transport(200, { code: 'UPDATED', rule: RULE });
    const outcome = await new ProximityRuleService(t).set(ORG, { distanceM: 200, maxAgeS: 180, maxAccuracyM: 40 }, '  Rota rural com sinal fraco.  ', 'req-1');
    expect(t.call).toHaveBeenCalledWith('manage-tracking', { operation: 'set_proximity_rule', organization_id: ORG, request_id: 'req-1',
      distance_m: 200, max_age_s: 180, max_accuracy_m: 40, justification: 'Rota rural com sinal fraco.' });
    expect(outcome).toMatchObject({ kind: 'success', value: { version: 2 } });
  });

  it.each([[403, { code: 'ACCESS_DENIED' }, 'access_denied'], [401, { code: 'AUTH_REQUIRED' }, 'session_expired'], [500, {}, 'unknown']] as const)(
    'HTTP %i vira %s', async (status, body, kind) => {
      expect((await new ProximityRuleService(transport(status, body)).set(ORG, { distanceM: 200, maxAgeS: 180, maxAccuracyM: 40 }, 'Rota rural com sinal fraco.', 'r')).kind).toBe(kind);
    });
});
