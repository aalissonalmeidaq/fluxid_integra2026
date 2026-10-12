// Qualidade e origem da posição lida pelo aparelho (RF-009 a RF-014, RN-003). Regras puras: o navegador entra por
// `infrastructure/field/geolocation-reader.ts`. A posição do GPS é evidência declarada pelo aparelho, não prova.
export const LOW_ACCURACY_ABOVE_M = 100;
export const POSITION_STALE_AFTER_MS = 2 * 60 * 1000;
export const POSITION_TIMEOUT_MS = 15_000;
// Limite da restrição `accuracy_m` do banco (0 a 100000).
export const MAX_ACCURACY_M = 100_000;

export type AccuracyBand = 'good' | 'low';
// Origens da posição: as da restrição `position_source` do banco. A chegada só tem `gps` e `typed`.
export const POSITION_ORIGINS = ['gps', 'typed', 'site_address'] as const;
export type PositionOrigin = (typeof POSITION_ORIGINS)[number];

export interface PositionReading {
  latitude: number;
  longitude: number;
  accuracyM: number;
  // Instante da leitura, em milissegundos.
  readAt: number;
}

// Precisão pior que 100 m só avisa e não bloqueia o registro (spec, Clarifications).
export function accuracyBand(accuracyM: number): AccuracyBand {
  return accuracyM > LOW_ACCURACY_ABOVE_M ? 'low' : 'good';
}

const toMs = (value: number | Date): number => (value instanceof Date ? value.getTime() : value);

// Velha só acima de 2 minutos. Posição do futuro (relógio do aparelho adiantado) não é velha; quem registra confere o limite no servidor.
export function isStale(readAt: number | Date, now: number | Date): boolean {
  return toMs(now) - toMs(readAt) > POSITION_STALE_AFTER_MS;
}

export function isValidReading(reading: PositionReading): boolean {
  const { latitude, longitude, accuracyM } = reading;
  return Number.isFinite(latitude) && Math.abs(latitude) <= 90
    && Number.isFinite(longitude) && Math.abs(longitude) <= 180
    && Number.isFinite(accuracyM) && accuracyM >= 0 && accuracyM <= MAX_ACCURACY_M;
}

export function formatAccuracy(accuracyM: number): string {
  return `cerca de ${new Intl.NumberFormat('pt-BR').format(Math.max(1, Math.round(accuracyM)))} m`;
}

export interface PositionOriginInput {
  atSiteAddress: boolean;
  hasCoordinates: boolean;
  // As coordenadas vieram de uma leitura do aparelho.
  fromGps: boolean;
  // A pessoa editou o número à mão depois da leitura.
  editedByHand: boolean;
}

// A origem registrada sempre corresponde ao dado (RF-010): "GPS" só para a posição lida e sem edição manual; coordenadas digitadas
// ou editadas são "informada"; "no endereço da unidade" não tem coordenadas.
export function positionOrigin({ atSiteAddress, hasCoordinates, fromGps, editedByHand }: PositionOriginInput): PositionOrigin | null {
  if (atSiteAddress) return 'site_address';
  if (!hasCoordinates) return null;
  return fromGps && !editedByHand ? 'gps' : 'typed';
}
