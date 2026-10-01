import React from 'react';
import { Icon } from '../icons/icon';
import type { IconName } from '../icons/tipos';

export type StatusBadgeVariant = 'ativo' | 'conectado' | 'pendente' | 'bloqueado' | 'erro';

const ESTILOS: Record<StatusBadgeVariant, { classes: string; icone: IconName }> = {
  ativo: { classes: 'bg-sucesso-fundo text-verde-acessivel', icone: 'verificado' },
  conectado: { classes: 'bg-info-fundo text-azul-profundo', icone: 'rede' },
  pendente: { classes: 'bg-alerta-fundo text-alerta-texto', icone: 'historico' },
  bloqueado: { classes: 'bg-cinza-gelo text-grafite', icone: 'bloqueio' },
  erro: { classes: 'bg-erro-fundo text-erro', icone: 'alerta' },
};

export interface StatusBadgeProps {
  variant: StatusBadgeVariant;
  children: React.ReactNode;
}

// Indicador de status (ativo, conectado, pendente, bloqueado, erro): sempre texto, com ícone decorativo (RA-005).
export function StatusBadge({ variant, children }: StatusBadgeProps): React.JSX.Element {
  const { classes, icone } = ESTILOS[variant];
  return (
    <span data-variant={variant} className={`inline-flex items-center gap-1 rounded-controle px-2 py-1 text-legenda font-semibold ${classes}`}>
      <Icon name={icone} size={16} variant="monocromatica" />
      <span>{children}</span>
    </span>
  );
}
