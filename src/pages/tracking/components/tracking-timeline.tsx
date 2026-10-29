import React from 'react';
import type { OriginView, TimelineItem } from '@/application/tracking/tracking-views';
import { Icon } from '@/design-system';
import { formatDateTime } from '@/domain/cylinders/format';
import { degradationText, freshness } from '@/domain/tracking/tracking-vocabulary';
import { SealBadge } from '@/pages/seals/components/seal-badge';

// Cronologia recente (Spec 015, T029; RF-002, RF-004, RF-020): a alternativa completa ao mapa, permanente. Cada posição diz origem,
// frescor (ícone e texto), instante, precisão e se chegou depois (retrospectiva); lacunas e degradações aparecem como fatos próprios,
// sem ligar pontos. Selecionar um item destaca o ponto no mapa e não move o foco.
export interface TrackingTimelineProps {
  items: readonly TimelineItem[];
  origins: readonly OriginView[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

const precision = (accuracy: number | null) => (accuracy === null ? 'precisão desconhecida' : `± ${Math.round(accuracy)} m`);

export function TrackingTimeline({ items, origins, selectedId, onSelect }: TrackingTimelineProps): React.JSX.Element {
  const labelOf = (key: string) => origins.find((origin) => origin.key === key)?.label ?? 'Lacre';
  const keyOf = (origin: 'mobile' | 'seal', subjectId: string) => (origin === 'mobile' ? 'mobile' : `seal:${subjectId}`);

  if (items.length === 0) {
    return <p className="m-0 text-corpo text-grafite">Nenhuma posição na última hora.</p>;
  }
  return (
    <ol aria-label="Cronologia recente" className="m-0 flex list-none flex-col gap-2 p-0">
      {items.map((item) => {
        if (item.kind === 'position') {
          const { position } = item;
          const label = labelOf(keyOf(position.origin, position.subjectId));
          const state = freshness(position.freshness);
          const selected = selectedId === item.id;
          return (
            <li key={item.id}>
              <button
                type="button"
                aria-pressed={selected}
                aria-label={`${label}, ${state.label}, ${formatDateTime(position.observedAt)}, ${precision(position.accuracyM)}${position.retrospective ? ', recebida depois' : ''}`}
                onClick={() => onSelect(item.id)}
                className={[
                  'flex min-h-alvo w-full flex-wrap items-center gap-x-4 gap-y-1 rounded-card border p-2 text-left text-corpo text-grafite',
                  selected ? 'border-navy bg-info-fundo' : 'border-borda-suave bg-branco',
                ].join(' ')}
              >
                {/* Duas linhas no celular (quem e como está; quando e com que precisão) e uma só a partir do tablet. */}
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-navy">{label}</span>
                  <SealBadge presentation={state} />
                </span>
                <span className="flex flex-wrap items-center gap-x-2">
                  <span className="tabular-nums">{formatDateTime(position.observedAt)}</span>
                  <span className="text-texto-secundario">{precision(position.accuracyM)}</span>
                  {position.retrospective && <span className="text-legenda font-semibold text-alerta-texto">Recebida depois</span>}
                </span>
              </button>
            </li>
          );
        }
        if (item.kind === 'gap') {
          const subject = item.origin === 'mobile' ? 'do celular' : `do ${labelOf(keyOf(item.origin, item.subjectId))}`;
          return (
            <li key={item.id} className="flex items-start gap-2 rounded-card border border-dashed border-borda-controle p-2 text-corpo text-grafite">
              <Icon name="sem-sinal" size={16} variant="monocromatica" />
              <span>Sem posição {subject} entre {formatDateTime(item.occurredAt)} e {item.endedAt ? formatDateTime(item.endedAt) : 'agora'}</span>
            </li>
          );
        }
        if (item.kind === 'degradation') {
          return (
            <li key={item.id} className="flex items-start gap-2 rounded-card border border-alerta-faixa bg-alerta-fundo p-2 text-corpo text-alerta-texto">
              <Icon name="alerta" size={16} variant="monocromatica" />
              <span>{degradationText(item.reason)} (desde {formatDateTime(item.occurredAt)})</span>
            </li>
          );
        }
        return null;
      })}
    </ol>
  );
}
