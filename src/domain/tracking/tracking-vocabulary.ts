// Vocabulário de apresentação do rastreamento (Spec 015, US1; RF-002, RF-003, RF-007c). Cada frescor tem texto, ícone oficial e tom do
// selo de status; o estado nunca depende só de cor.
import type { Presentation } from '@/domain/seals/seal-vocabulary';
import type { ComparisonResult, DegradationReason, Freshness, PositionOrigin } from './tracking-types';

const FRESHNESS_PRESENTATION: Record<Freshness, Presentation> = {
  current: { label: 'Atual', icon: 'gps', tone: 'ativo' },
  delayed: { label: 'Atrasada', icon: 'historico', tone: 'pendente' },
  missing: { label: 'Sem posição', icon: 'sem-sinal', tone: 'erro' },
  inconclusive: { label: 'Inconclusiva', icon: 'alerta', tone: 'bloqueado' },
};

export const freshness = (value: Freshness): Presentation => FRESHNESS_PRESENTATION[value];

const DEGRADATION: Record<DegradationReason, string> = {
  denied: 'A localização foi negada no celular',
  foreground_only: 'O celular só envia a posição com o aplicativo aberto',
  unavailable: 'O celular não está enviando a posição nesta viagem',
  notifications_denied: 'A notificação de coleta foi recusada no celular',
  auth_expired: 'Coleta pausada: o motorista precisa entrar de novo com conexão',
};

export const degradationText = (reason: DegradationReason): string => DEGRADATION[reason];

export const originLabel = (origin: PositionOrigin): string => (origin === 'mobile' ? 'Celular do motorista' : 'Lacre');

const INCONCLUSIVE: Record<string, string> = {
  stale: 'posição antiga', imprecise: 'posição imprecisa', future: 'horário adiante do celular', seal_missing: 'sem posição do lacre',
  mobile_missing: 'sem posição do celular', context_invalid: 'fora do contexto da viagem',
};

// Texto de uma comparação do histórico (RF-013): resultado com a distância, ou o motivo de ser inconclusiva.
export function comparisonText(result: ComparisonResult, reason: string, distanceM: number | null): string {
  if (result === 'inconclusive') return `Inconclusiva: ${INCONCLUSIVE[reason] ?? 'sem evidência suficiente'}`;
  const distance = distanceM === null ? '' : `: ${Math.round(distanceM)} m`;
  return `${result === 'outside' ? 'Fora do limite' : 'Dentro do limite'}${distance}`;
}

const PRESENCE: Record<string, string> = { nfc: 'por NFC', camera: 'pela câmera', typed: 'digitada' };

// Presença pontual na entrega (RF-016): confirma o instante, não a proximidade contínua.
export const presenceText = (source: string): string => `Leitura presencial ${PRESENCE[source] ?? ''}`.trim();
