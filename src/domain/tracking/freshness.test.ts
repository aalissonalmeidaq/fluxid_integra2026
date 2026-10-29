import { describe, expect, it } from 'vitest';
import { degradationOf, freshnessOf, segmentTrail, type RuleLimits } from './freshness';

const RULE: RuleLimits = { distanceM: 100, maxAgeS: 120, maxAccuracyM: 50, version: 0 };
const NOW = new Date('2026-10-22T15:00:00Z');
const at = (secondsAgo: number) => new Date(NOW.getTime() - secondsAgo * 1000).toISOString();

describe('frescor de uma posição (RF-003)', () => {
  it('sem posição: ausente, nunca estimada', () => {
    expect(freshnessOf(null, RULE, NOW)).toBe('missing');
  });

  it('recente e precisa: atual', () => {
    expect(freshnessOf({ observedAt: at(60), accuracyM: 20 }, RULE, NOW)).toBe('current');
    expect(freshnessOf({ observedAt: at(120), accuracyM: 50 }, RULE, NOW)).toBe('current');
  });

  it('mais antiga que a idade máxima da regra: atrasada', () => {
    expect(freshnessOf({ observedAt: at(121), accuracyM: 20 }, RULE, NOW)).toBe('delayed');
    expect(freshnessOf({ observedAt: at(6 * 3600), accuracyM: 20 }, RULE, NOW)).toBe('delayed');
  });

  it('a leitura repetida do lacre vale pelo último instante confirmado', () => {
    expect(freshnessOf({ observedAt: at(900), confirmedAt: at(30), accuracyM: 10 }, RULE, NOW)).toBe('current');
  });

  it('última posição conhecida do lacre (sem GPS) nunca é atual', () => {
    expect(freshnessOf({ observedAt: at(10), accuracyM: 10, lastKnown: true }, RULE, NOW)).toBe('delayed');
  });

  it('imprecisa, sem precisão ou no futuro: inconclusiva', () => {
    expect(freshnessOf({ observedAt: at(10), accuracyM: 51 }, RULE, NOW)).toBe('inconclusive');
    expect(freshnessOf({ observedAt: at(10), accuracyM: null }, RULE, NOW)).toBe('inconclusive');
    expect(freshnessOf({ observedAt: at(-120), accuracyM: 10 }, RULE, NOW)).toBe('inconclusive');
  });

  it('pequena diferença de relógio para o futuro é tolerada', () => {
    expect(freshnessOf({ observedAt: at(-30), accuracyM: 10 }, RULE, NOW)).toBe('current');
  });
});

describe('degradação do acompanhamento (RF-007c)', () => {
  const started = at(1800);

  it('viagem sem sessão de coleta: indisponível desde o início da viagem', () => {
    expect(degradationOf(null, started)).toEqual({ reason: 'unavailable', since: started });
  });

  it('coleta completa e notificação ativa: sem degradação', () => {
    expect(degradationOf({ status: 'active', capability: 'full', capabilityChangedAt: at(600), notificationsDenied: false }, started)).toBeNull();
  });

  it.each([
    ['denied', 'denied'], ['foreground_only', 'foreground_only'], ['unavailable', 'unavailable'],
  ] as const)('capacidade %s: degradada pelo mesmo motivo', (capability, reason) => {
    expect(degradationOf({ status: 'active', capability, capabilityChangedAt: at(600), notificationsDenied: false }, started))
      .toEqual({ reason, since: at(600) });
  });

  it('notificação recusada: visibilidade reduzida', () => {
    expect(degradationOf({ status: 'active', capability: 'full', capabilityChangedAt: at(600), notificationsDenied: true }, started))
      .toEqual({ reason: 'notifications_denied', since: at(600) });
  });

  it('janela offline expirada: aguardando autenticação', () => {
    expect(degradationOf({ status: 'paused_auth_expired', capability: 'full', capabilityChangedAt: at(600), notificationsDenied: false }, started))
      .toEqual({ reason: 'auth_expired', since: at(600) });
  });
});

describe('trechos do mapa (RF-020)', () => {
  it('posições próximas no tempo formam um trecho, em ordem', () => {
    const result = segmentTrail([{ id: 'b', observedAt: at(60) }, { id: 'a', observedAt: at(120) }], RULE);
    expect(result.segments).toEqual([['a', 'b']]);
    expect(result.gaps).toEqual([]);
  });

  it('um intervalo maior que o dobro da idade máxima quebra o trecho e vira lacuna explícita', () => {
    const result = segmentTrail([{ id: 'a', observedAt: at(1200) }, { id: 'b', observedAt: at(1140) }, { id: 'c', observedAt: at(60) }], RULE);
    expect(result.segments).toEqual([['a', 'b'], ['c']]);
    expect(result.gaps).toEqual([{ from: at(1140), to: at(60) }]);
  });

  it('empate de instante é desempatado pelo id', () => {
    expect(segmentTrail([{ id: 'z', observedAt: at(60) }, { id: 'y', observedAt: at(60) }], RULE).segments).toEqual([['y', 'z']]);
  });

  it('sem posições: nenhum trecho', () => {
    expect(segmentTrail([], RULE)).toEqual({ segments: [], gaps: [] });
  });
});
