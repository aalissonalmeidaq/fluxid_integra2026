import { describe, expect, it } from 'vitest';
import { buildChronology, type ChronoEntry } from './tracking-timeline';

// Spec 015 (T054; US3, RF-019 a RF-021): cronologia determinística. Ordena por instante e, no empate, pelo id; separa os trechos de cada
// origem; um intervalo sem evidência vira lacuna explícita, logo depois da última posição antes dela, e nunca liga pontos.
const RULE = { distanceM: 100, maxAgeS: 120, maxAccuracyM: 50, version: 0 };
const T = Date.parse('2026-10-22T12:00:00Z');
const at = (minutes: number) => new Date(T + minutes * 60_000).toISOString();
const pos = (id: string, minutes: number, origin: 'mobile' | 'seal' = 'mobile', subjectId = origin === 'mobile' ? 'trip' : 'dev1'): ChronoEntry =>
  ({ id, occurredAt: at(minutes), position: { origin, subjectId } });
const fact = (id: string, minutes: number): ChronoEntry => ({ id, occurredAt: at(minutes) });

describe('cronologia do histórico', () => {
  it('ordena por instante e desempata pelo id, sem depender da ordem de chegada', () => {
    const result = buildChronology([fact('z', 1), pos('b', 0), fact('a', 1)], RULE);
    expect(result.entries.map((e) => e.id)).toEqual(['b', 'a', 'z']);
  });

  it('cada origem tem os próprios trechos; posições próximas no tempo formam um trecho', () => {
    const result = buildChronology([pos('m1', 0), pos('m2', 1), pos('s1', 0, 'seal'), pos('s2', 1, 'seal')], RULE);
    expect(result.segments).toEqual([
      { key: 'mobile:trip', origin: 'mobile', subjectId: 'trip', positionIds: ['m1', 'm2'] },
      { key: 'seal:dev1', origin: 'seal', subjectId: 'dev1', positionIds: ['s1', 's2'] },
    ]);
  });

  it('intervalo maior que o dobro da idade máxima vira lacuna explícita e separa os trechos', () => {
    const result = buildChronology([pos('m1', 0), pos('m2', 1), pos('m3', 20), fact('e', 10)], RULE);
    expect(result.segments.map((s) => s.positionIds)).toEqual([['m1', 'm2'], ['m3']]);
    expect(result.entries.map((e) => e.id)).toEqual(['m1', 'm2', 'gap:mobile:trip:m2', 'e', 'm3']);
    expect(result.entries[2]).toEqual({ id: 'gap:mobile:trip:m2', kind: 'gap', occurredAt: at(1), endedAt: at(20), origin: 'mobile', subjectId: 'trip' });
  });

  it('lacunas de origens diferentes são independentes', () => {
    const result = buildChronology([pos('m1', 0), pos('m2', 30), pos('s1', 0, 'seal'), pos('s2', 1, 'seal')], RULE);
    expect(result.entries.filter((e) => 'kind' in e && e.kind === 'gap').map((e) => e.id)).toEqual(['gap:mobile:trip:m1']);
  });

  it('fatos sem posição (eventos, alertas, comparações) não formam trecho nem lacuna', () => {
    const result = buildChronology([fact('a', 0), fact('b', 60)], RULE);
    expect(result.segments).toEqual([]);
    expect(result.entries.map((e) => e.id)).toEqual(['a', 'b']);
  });

  it('compara instantes pelo valor, não pelo texto (Z, +00:00 e -03:00 misturados)', () => {
    const result = buildChronology([
      { id: 'b', occurredAt: '2026-10-22T09:00:30-03:00' }, { id: 'a', occurredAt: '2026-10-22T12:00:00+00:00' }, { id: 'c', occurredAt: '2026-10-22T12:01:00Z' },
    ], RULE);
    expect(result.entries.map((e) => e.id)).toEqual(['a', 'b', 'c']);
  });

  it('acrescentar uma página mantém a ordem e não duplica', () => {
    const first = [pos('m1', 0), pos('m2', 1)];
    const second = [pos('m2', 1), pos('m3', 2)];
    expect(buildChronology([...first, ...second], RULE).entries.map((e) => e.id)).toEqual(['m1', 'm2', 'm3']);
  });
});
