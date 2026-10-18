import { SEAL_LIMITS } from './seal-limits';

// Relação do lacre com uma geocerca, em texto (Spec 012, RF-042): é a alternativa acessível ao desenho no mapa e diz, sem depender
// de cor, se o lacre está dentro, na tolerância da vigilância (50 m) ou fora, e a que distância.
export interface GeofenceRelationInput {
  name: string;
  inside: boolean | null;
  distanceM: number | null;
  expected: boolean;
}

export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  const km = (meters / 1000).toFixed(1);
  return `${km.endsWith('.0') ? km.slice(0, -2) : km.replace('.', ',')} km`;
}

export function describeGeofenceRelation({ name, inside, distanceM }: GeofenceRelationInput): string {
  if (inside === null || distanceM === null) return `${name}: sem posição do lacre para comparar.`;
  if (inside) return `Dentro de ${name}.`;
  if (distanceM <= SEAL_LIMITS.geofenceToleranceM) return `Fora de ${name} por ${formatDistance(distanceM)}, dentro da tolerância de ${SEAL_LIMITS.geofenceToleranceM} m.`;
  return `Fora de ${name}, a ${formatDistance(distanceM)}.`;
}
