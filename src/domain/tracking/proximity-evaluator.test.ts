import { describe, expect, it } from 'vitest';
import {
  advanceStreak, compare, DEFAULT_RULE, distanceM, timingOf, validateRule, type GpsReading,
} from './proximity-evaluator';

// Spec 015 (T033; RF-008 a RF-012, RF-007e, RF-007f, CS-002): regra pura de proximidade. O banco repete esta mesma regra na transação
// de ingestão (pgTAP 015_proximity); aqui ela é provada de forma isolada e determinística.
const T = Date.parse('2026-10-22T15:00:00Z');
const at = (seconds: number) => new Date(T + seconds * 1000).toISOString();
const reading = (seconds: number, latitude: number, longitude: number, accuracyM: number | null = 10): GpsReading => ({
  id: `r${seconds}`, observedAt: at(seconds), latitude, longitude, accuracyM,
});
// Cerca de 111 m por milésimo de grau de latitude.
const BASE = { latitude: -7.23, longitude: -39.31 };

describe('regra de proximidade', () => {
  it('padrão de 100 m, 120 s e 50 m', () => {
    expect(DEFAULT_RULE).toEqual({ distanceM: 100, maxAgeS: 120, maxAccuracyM: 50, version: 0 });
  });

  it('faixas configuráveis: 50–500 m, 60–300 s e 20–100 m', () => {
    expect(validateRule({ distanceM: 50, maxAgeS: 60, maxAccuracyM: 20 })).toEqual([]);
    expect(validateRule({ distanceM: 500, maxAgeS: 300, maxAccuracyM: 100 })).toEqual([]);
    expect(validateRule({ distanceM: 49, maxAgeS: 301, maxAccuracyM: 19 }).map((e) => e.field)).toEqual(['distance_m', 'max_age_s', 'max_accuracy_m']);
    expect(validateRule({ distanceM: 100.5, maxAgeS: 120, maxAccuracyM: 50 }).map((e) => e.field)).toEqual(['distance_m']);
  });
});

describe('distância geodésica', () => {
  it('um milésimo de grau de latitude são cerca de 111 m', () => {
    expect(distanceM(BASE, { latitude: BASE.latitude + 0.001, longitude: BASE.longitude })).toBeCloseTo(111.2, 0);
  });
  it('mesmo ponto: zero', () => {
    expect(distanceM(BASE, BASE)).toBe(0);
  });
});

describe('comparação celular × lacre (RF-008, RF-012)', () => {
  const mobile = reading(0, BASE.latitude, BASE.longitude);

  it('dentro do limite: inside, com a distância', () => {
    const result = compare(mobile, reading(-30, BASE.latitude + 0.0005, BASE.longitude), DEFAULT_RULE);
    expect(result).toMatchObject({ result: 'inside', reason: 'within_limit' });
    expect(result.distanceM).toBeCloseTo(55.6, 0);
  });

  it('acima do limite: outside', () => {
    expect(compare(mobile, reading(-30, BASE.latitude + 0.002, BASE.longitude), DEFAULT_RULE)).toMatchObject({ result: 'outside', reason: 'beyond_limit' });
  });

  it('sem posição do lacre: inconclusiva', () => {
    expect(compare(mobile, null, DEFAULT_RULE)).toEqual({ result: 'inconclusive', reason: 'seal_missing', distanceM: null });
  });

  it('lacre mais velho que a idade máxima em relação ao celular: inconclusiva', () => {
    expect(compare(mobile, reading(-121, BASE.latitude, BASE.longitude), DEFAULT_RULE)).toMatchObject({ result: 'inconclusive', reason: 'stale' });
  });

  it('leitura repetida do lacre vale pela última confirmação', () => {
    const seal = { ...reading(-900, BASE.latitude, BASE.longitude), confirmedAt: at(-30) };
    expect(compare(mobile, seal, DEFAULT_RULE)).toMatchObject({ result: 'inside' });
  });

  it('lacre bem depois do celular: futuro, inconclusiva', () => {
    expect(compare(mobile, reading(61, BASE.latitude, BASE.longitude), DEFAULT_RULE)).toMatchObject({ result: 'inconclusive', reason: 'future' });
  });

  it('precisão acima do limite ou desconhecida, em qualquer lado: imprecisa', () => {
    expect(compare(reading(0, BASE.latitude, BASE.longitude, 51), reading(-10, BASE.latitude, BASE.longitude), DEFAULT_RULE).reason).toBe('imprecise');
    expect(compare(mobile, reading(-10, BASE.latitude, BASE.longitude, null), DEFAULT_RULE).reason).toBe('imprecise');
  });

  it('a regra vigente decide: com 300 m de limite, 222 m é dentro', () => {
    const rule = { distanceM: 300, maxAgeS: 120, maxAccuracyM: 50, version: 2 };
    expect(compare(mobile, reading(-10, BASE.latitude + 0.002, BASE.longitude), rule).result).toBe('inside');
  });
});

describe('sequência de três (RF-010, RF-011, CS-002)', () => {
  const start = { outsideStreak: 0, occurrenceOpen: false };

  it('só a terceira outside consecutiva confirma', () => {
    const one = advanceStreak(start, 'outside');
    const two = advanceStreak(one.state, 'outside');
    const three = advanceStreak(two.state, 'outside');
    expect([one.confirm, two.confirm, three.confirm]).toEqual([false, false, true]);
    expect(three.state).toEqual({ outsideStreak: 3, occurrenceOpen: true });
  });

  it('uma inside reinicia a sequência ainda não confirmada', () => {
    const two = advanceStreak(advanceStreak(start, 'outside').state, 'outside');
    expect(advanceStreak(two.state, 'inside')).toEqual({ state: { outsideStreak: 0, occurrenceOpen: false }, confirm: false });
  });

  it('inconclusiva não conta a favor nem contra', () => {
    const two = advanceStreak(advanceStreak(start, 'outside').state, 'outside');
    const neutral = advanceStreak(two.state, 'inconclusive');
    expect(neutral.state).toEqual(two.state);
    expect(advanceStreak(neutral.state, 'outside').confirm).toBe(true);
  });

  it('com ocorrência aberta, novas outside não confirmam de novo (um alerta por par)', () => {
    const open = { outsideStreak: 3, occurrenceOpen: true };
    expect(advanceStreak(open, 'outside')).toEqual({ state: { outsideStreak: 4, occurrenceOpen: true }, confirm: false });
  });
});

describe('tempo real ou retrospectiva (RF-007e, RF-007f)', () => {
  it('posição recebida dentro da idade máxima: tempo real', () => {
    expect(timingOf({ observedAt: at(0), receivedAt: at(100) }, DEFAULT_RULE, true)).toBe('realtime');
  });
  it('recebida depois da idade máxima com a viagem ativa: retrospectiva', () => {
    expect(timingOf({ observedAt: at(0), receivedAt: at(121) }, DEFAULT_RULE, true)).toBe('retrospective');
  });
  it('recebida depois do fim da viagem: só histórico', () => {
    expect(timingOf({ observedAt: at(0), receivedAt: at(121) }, DEFAULT_RULE, false)).toBe('historical_only');
    expect(timingOf({ observedAt: at(0), receivedAt: at(5) }, DEFAULT_RULE, false)).toBe('historical_only');
  });
});
