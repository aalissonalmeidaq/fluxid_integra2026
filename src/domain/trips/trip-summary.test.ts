import { describe, expect, it } from 'vitest';
import { describeTripPlanIssue, summarizeTripPlan } from './trip-summary';

const ids = (count: number, prefix = 'c'): string[] => Array.from({ length: count }, (_, index) => `${prefix}${index}`);

describe('summarizeTripPlan', () => {
  it('soma paradas e cilindros e calcula a capacidade que sobra', () => {
    const summary = summarizeTripPlan([{ siteId: 's1', cylinderIds: ['a', 'b'] }, { siteId: 's2', cylinderIds: ['c', 'd'] }], 10);
    expect(summary).toMatchObject({ stopCount: 2, cylinderCount: 4, remainingCapacity: 6, issues: [], canSave: true });
  });

  it('sem veículo escolhido a capacidade fica em aberto', () => {
    expect(summarizeTripPlan([{ siteId: 's1', cylinderIds: ['a'] }], null).remainingCapacity).toBeNull();
  });

  it('recusa viagem sem parada', () => {
    expect(summarizeTripPlan([], 10)).toMatchObject({ canSave: false, issues: [{ code: 'NO_STOPS' }] });
  });

  it('recusa parada sem cilindro', () => {
    expect(summarizeTripPlan([{ siteId: 's1', cylinderIds: [] }], 10).issues).toEqual([{ code: 'EMPTY_STOP', stopIndex: 0 }]);
  });

  it('aceita 30 paradas e recusa 31', () => {
    const stops = (count: number) => Array.from({ length: count }, (_, index) => ({ siteId: `s${index}`, cylinderIds: [`c${index}`] }));
    expect(summarizeTripPlan(stops(30), 100).canSave).toBe(true);
    expect(summarizeTripPlan(stops(31), 100).issues).toContainEqual({ code: 'TOO_MANY_STOPS', max: 30 });
  });

  it('aceita 200 cilindros numa parada e recusa 201', () => {
    expect(summarizeTripPlan([{ siteId: 's1', cylinderIds: ids(200) }], 500).canSave).toBe(true);
    expect(summarizeTripPlan([{ siteId: 's1', cylinderIds: ids(201) }], 500).issues).toContainEqual({ code: 'TOO_MANY_CYLINDERS_IN_STOP', stopIndex: 0, max: 200 });
  });

  it('recusa o mesmo cilindro em duas paradas, uma vez só', () => {
    const summary = summarizeTripPlan([{ siteId: 's1', cylinderIds: ['a', 'b'] }, { siteId: 's2', cylinderIds: ['a', 'c'] }, { siteId: 's3', cylinderIds: ['a'] }], 10);
    expect(summary.issues).toEqual([{ code: 'DUPLICATE_CYLINDER', cylinderId: 'a' }]);
    expect(summary.canSave).toBe(false);
  });

  it('recusa carga acima da capacidade e mostra a sobra negativa', () => {
    const summary = summarizeTripPlan([{ siteId: 's1', cylinderIds: ids(5) }], 4);
    expect(summary.remainingCapacity).toBe(-1);
    expect(summary.issues).toEqual([{ code: 'CAPACITY_EXCEEDED', capacity: 4, requested: 5 }]);
  });

  it('carga igual à capacidade passa', () => {
    expect(summarizeTripPlan([{ siteId: 's1', cylinderIds: ids(4) }], 4)).toMatchObject({ canSave: true, remainingCapacity: 0 });
  });
});

describe('describeTripPlanIssue', () => {
  it('descreve cada impedimento em português', () => {
    expect(describeTripPlanIssue({ code: 'NO_STOPS' })).toBe('Inclua pelo menos uma parada.');
    expect(describeTripPlanIssue({ code: 'TOO_MANY_STOPS', max: 30 })).toContain('30');
    expect(describeTripPlanIssue({ code: 'EMPTY_STOP', stopIndex: 1 })).toContain('parada 2');
    expect(describeTripPlanIssue({ code: 'TOO_MANY_CYLINDERS_IN_STOP', stopIndex: 0, max: 200 })).toContain('200');
    expect(describeTripPlanIssue({ code: 'DUPLICATE_CYLINDER', cylinderId: 'a' })).toContain('mais de uma parada');
    expect(describeTripPlanIssue({ code: 'CAPACITY_EXCEEDED', capacity: 4, requested: 5 })).toContain('4 cilindros');
  });
});
