import React from 'react';
import { Icon } from '@/design-system/icons/icon';
import { indicatorText, type IndicatorInput } from '@/domain/field/sync-status';
import { navigateInApp } from '../registry/registry-navigation';
import { useSyncCounts } from '../field/use-sync-counts';

export interface SyncIndicatorProps {
  // Nulo quando a fila não está disponível (sem sessão, sem organização ativa): o indicador não existe.
  counts: IndicatorInput | null;
  onOpen: () => void;
}

// Indicador discreto ao lado do estado de conexão (Spec 010, RF-004, RF-030): texto + ícone, nunca só cor. Sem pendência fica oculto, mas a região
// de status continua no lugar, para anunciar a mudança sem repetir o anúncio a cada atualização (o texto igual não é reanunciado).
export function SyncIndicator({ counts, onOpen }: SyncIndicatorProps): React.JSX.Element | null {
  if (counts === null) return null;
  const text = indicatorText(counts);
  const conflict = counts.conflicts > 0;
  return (
    <div className="flex items-center">
      <span role="status" aria-live="polite" className="sr-only">{text ?? ''}</span>
      {text !== null && (
        <button type="button" aria-label={`Abrir sincronização: ${text}`} onClick={onOpen}
          className={`inline-flex min-h-alvo items-center gap-2 rounded-controle px-2 text-legenda font-semibold ${conflict ? 'bg-erro-fundo text-erro' : counts.online ? 'text-azul-profundo' : 'bg-alerta-fundo text-alerta-texto'}`}>
          <Icon name={conflict ? 'alerta' : counts.online ? 'sincronizar' : 'sem-sinal'} size={16} variant="monocromatica" />
          <span aria-hidden="true">{text}</span>
        </button>
      )}
    </div>
  );
}

// Ligado à fila do aparelho e à tela Sincronização.
export function ConnectedSyncIndicator(): React.JSX.Element | null {
  const counts = useSyncCounts();
  return <SyncIndicator counts={counts} onOpen={() => navigateInApp('/sincronizacao')} />;
}
