import React from 'react';
import { Icon } from '@/design-system';

type NoticeVariant = 'informacao' | 'sucesso' | 'alerta';

const STYLES: Record<NoticeVariant, { classes: string; icon: 'notificacoes' | 'verificado' | 'alerta' }> = {
  informacao: { classes: 'border-azul-royal bg-info-fundo text-azul-profundo', icon: 'notificacoes' },
  sucesso: { classes: 'border-verde-escuro bg-sucesso-fundo text-verde-acessivel', icon: 'verificado' },
  alerta: { classes: 'border-alerta-faixa bg-alerta-fundo text-alerta-texto', icon: 'alerta' },
};

export interface TripNoticeProps {
  variant: NoticeVariant;
  title?: string;
  children: React.ReactNode;
}

// Aviso visual das telas de viagem, com a mesma aparência do Alert do design system, porém sem região viva: cada tela de viagem tem
// uma única região `role="status"` (o anúncio de resultados), e os erros usam o `Alert` de erro. O texto do aviso também vai a ela.
export function TripNotice({ variant, title, children }: TripNoticeProps): React.JSX.Element {
  const { classes, icon } = STYLES[variant];
  return (
    <div data-variant={variant} className={`flex items-start gap-4 rounded-card border p-4 text-corpo ${classes}`}>
      <Icon name={icon} variant="monocromatica" />
      <div className="flex min-w-0 flex-col gap-1">
        {title && <p className="font-semibold">{title}</p>}
        <div>{children}</div>
      </div>
    </div>
  );
}

// A região de anúncio única da tela: visível só para tecnologia assistiva.
export function TripAnnouncer({ message }: { message: string }): React.JSX.Element {
  return <p role="status" aria-live="polite" className="sr-only">{message}</p>;
}
