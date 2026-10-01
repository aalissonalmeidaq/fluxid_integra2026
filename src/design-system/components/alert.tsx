import React from 'react';
import { Icon } from '../icons/icon';
import type { IconName } from '../icons/tipos';

export type AlertVariant = 'informacao' | 'sucesso' | 'alerta' | 'erro';

const ESTILOS: Record<AlertVariant, { classes: string; icone: IconName }> = {
  informacao: { classes: 'border-azul-royal bg-info-fundo text-azul-profundo', icone: 'notificacoes' },
  sucesso: { classes: 'border-verde-escuro bg-sucesso-fundo text-verde-acessivel', icone: 'verificado' },
  alerta: { classes: 'border-alerta-faixa bg-alerta-fundo text-alerta-texto', icone: 'alerta' },
  erro: { classes: 'border-erro bg-erro-fundo text-erro', icone: 'alerta' },
};

export interface AlertProps {
  variant: AlertVariant;
  title?: string;
  id?: string;
  className?: string;
  // Permite levar o foco ao aviso (por exemplo, sessão expirada) sem criar um elemento extra.
  ref?: React.Ref<HTMLDivElement>;
  tabIndex?: number;
  children: React.ReactNode;
}

// Mensagem de informação, sucesso, alerta ou erro. O erro é anunciado como alerta e os demais como status; sempre há
// texto e ícone, então a informação nunca depende só da cor (RF-003A, RA-003, RA-005).
export function Alert({ variant, title, id, className, ref, tabIndex, children }: AlertProps): React.JSX.Element {
  const { classes, icone } = ESTILOS[variant];
  return (
    <div
      ref={ref}
      {...(tabIndex !== undefined ? { tabIndex } : {})}
      {...(id ? { id } : {})}
      role={variant === 'erro' ? 'alert' : 'status'}
      data-variant={variant}
      className={['flex items-start gap-4 rounded-card border p-4 text-corpo', classes, className].filter(Boolean).join(' ')}
    >
      <Icon name={icone} variant="monocromatica" />
      <div className="flex min-w-0 flex-col gap-1">
        {title && <p className="font-semibold">{title}</p>}
        <div className="break-words">{children}</div>
      </div>
    </div>
  );
}
