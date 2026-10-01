import React from 'react';
import { Icon } from '../icons/icon';
import type { IconName } from '../icons/tipos';

export type SyncState = 'sincronizado' | 'sincronizando' | 'offline' | 'conflito';

export interface SyncStatusProps {
  state: SyncState;
  detail?: string;
}

const ESTADOS: Record<SyncState, { texto: string; icone: IconName; classes: string }> = {
  sincronizado: { texto: 'Sincronizado', icone: 'verificado', classes: 'text-verde-acessivel' },
  sincronizando: { texto: 'Sincronizando…', icone: 'sincronizar', classes: 'text-azul-profundo' },
  offline: { texto: 'Sem conexão', icone: 'sem-sinal', classes: 'rounded-controle bg-alerta-fundo px-2 text-alerta-texto' },
  conflito: { texto: 'Conflito a resolver', icone: 'alerta', classes: 'rounded-controle bg-erro-fundo px-2 text-erro' },
};

// Estado de conexão e de sincronização: texto, ícone e região de status; a mudança é anunciada sem mover o foco.
export function SyncStatus({ state, detail }: SyncStatusProps): React.JSX.Element {
  const { texto, icone, classes } = ESTADOS[state];
  return (
    <div role="status" aria-live="polite" data-state={state} className={`inline-flex items-center gap-2 text-legenda font-semibold ${classes}`}>
      <Icon name={icone} size={16} variant="monocromatica" {...(state === 'sincronizando' ? { className: 'motion-safe:animate-spin' } : {})} />
      <span>{texto}</span>
      {detail && <span className="font-normal">{detail}</span>}
    </div>
  );
}
