import React from 'react';

export type CardVariant = 'informativo' | 'indicador' | 'alerta';

type ElementoDoCard = 'div' | 'section' | 'article';

export interface CardProps extends Omit<React.ComponentProps<'div'>, 'ref'> {
  variant?: CardVariant;
  as?: ElementoDoCard;
}

const VARIANTES: Record<CardVariant, string> = {
  informativo: 'border-borda-suave bg-branco text-grafite',
  indicador: 'border-azul-royal bg-branco text-grafite',
  alerta: 'border-alerta-faixa bg-alerta-fundo text-alerta-texto',
};

// Cartão da prancha de layout: raio de 12 px, padding de 24 px, borda de 1 px e sombra suave (RF-007).
export function Card({ variant = 'informativo', as: Elemento = 'div', className, children, ...props }: CardProps): React.JSX.Element {
  return (
    <Elemento
      {...props}
      data-variant={variant}
      className={['rounded-card border p-6 shadow-card', VARIANTES[variant], className].filter(Boolean).join(' ')}
    >
      {children}
    </Elemento>
  );
}
