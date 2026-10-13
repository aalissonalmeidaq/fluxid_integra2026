import { accuracyBand, formatAccuracy, type PositionOrigin } from './position-quality';

// Resumo da posição de uma chegada ou entrega, só com a origem e a precisão em texto (RF-010, RN-003). Nunca traz as coordenadas e nunca
// afirma que a posição é prova: é o que o aparelho declarou. Sem origem (registro anterior à Spec 009), não há o que dizer.
export function positionSummary(source: PositionOrigin | null | undefined, accuracyM: number | null | undefined): string | null {
  if (!source) return null;
  if (source === 'site_address') return 'Entrega no endereço da unidade.';
  if (source === 'typed') return 'Posição informada.';
  if (accuracyM === null || accuracyM === undefined) return 'Posição lida pelo GPS.';
  return `Posição lida pelo GPS, precisão ${formatAccuracy(accuracyM)} (${accuracyBand(accuracyM) === 'low' ? 'baixa' : 'boa'}).`;
}
