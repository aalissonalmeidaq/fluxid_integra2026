import { TRIP_LIMITS } from './trip-limits';

// Resumo do planejamento (RF-002, RF-003): totais, capacidade do veículo e o que impede salvar. O servidor repete as regras.

export interface PlannedStop {
  // Identificador da parada já gravada (edição); omitido nas paradas novas.
  id?: string;
  siteId: string;
  cylinderIds: readonly string[];
}

export type TripPlanIssue =
  | { code: 'NO_STOPS' }
  | { code: 'TOO_MANY_STOPS'; max: number }
  | { code: 'EMPTY_STOP'; stopIndex: number }
  | { code: 'TOO_MANY_CYLINDERS_IN_STOP'; stopIndex: number; max: number }
  | { code: 'DUPLICATE_CYLINDER'; cylinderId: string }
  | { code: 'CAPACITY_EXCEEDED'; capacity: number; requested: number };

export interface TripPlanSummary {
  stopCount: number;
  cylinderCount: number;
  // Capacidade que sobra no veículo (negativa quando passa); nulo enquanto o veículo não foi escolhido.
  remainingCapacity: number | null;
  issues: TripPlanIssue[];
  canSave: boolean;
}

export function summarizeTripPlan(stops: readonly PlannedStop[], vehicleCapacity: number | null): TripPlanSummary {
  const issues: TripPlanIssue[] = [];
  if (stops.length === 0) issues.push({ code: 'NO_STOPS' });
  if (stops.length > TRIP_LIMITS.maxStops) issues.push({ code: 'TOO_MANY_STOPS', max: TRIP_LIMITS.maxStops });

  const seen = new Set<string>();
  const duplicated = new Set<string>();
  stops.forEach((stop, stopIndex) => {
    if (stop.cylinderIds.length === 0) issues.push({ code: 'EMPTY_STOP', stopIndex });
    if (stop.cylinderIds.length > TRIP_LIMITS.maxCylindersPerStop) issues.push({ code: 'TOO_MANY_CYLINDERS_IN_STOP', stopIndex, max: TRIP_LIMITS.maxCylindersPerStop });
    for (const id of stop.cylinderIds) {
      if (seen.has(id)) duplicated.add(id);
      seen.add(id);
    }
  });
  for (const cylinderId of duplicated) issues.push({ code: 'DUPLICATE_CYLINDER', cylinderId });

  const cylinderCount = stops.reduce((total, stop) => total + stop.cylinderIds.length, 0);
  const remainingCapacity = vehicleCapacity === null ? null : vehicleCapacity - cylinderCount;
  if (vehicleCapacity !== null && cylinderCount > vehicleCapacity) issues.push({ code: 'CAPACITY_EXCEEDED', capacity: vehicleCapacity, requested: cylinderCount });

  return { stopCount: stops.length, cylinderCount, remainingCapacity, issues, canSave: issues.length === 0 };
}

// Texto de cada impedimento, em português e sem culpar a pessoa.
export function describeTripPlanIssue(issue: TripPlanIssue): string {
  switch (issue.code) {
    case 'NO_STOPS': return 'Inclua pelo menos uma parada.';
    case 'TOO_MANY_STOPS': return `Uma viagem tem no máximo ${issue.max} paradas.`;
    case 'EMPTY_STOP': return `A parada ${issue.stopIndex + 1} precisa de pelo menos um cilindro.`;
    case 'TOO_MANY_CYLINDERS_IN_STOP': return `A parada ${issue.stopIndex + 1} aceita no máximo ${issue.max} cilindros.`;
    case 'DUPLICATE_CYLINDER': return 'O mesmo cilindro aparece em mais de uma parada.';
    case 'CAPACITY_EXCEEDED': return `O veículo comporta ${issue.capacity} cilindros e a viagem tem ${issue.requested}.`;
  }
}
