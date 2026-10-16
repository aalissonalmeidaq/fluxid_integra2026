import React from 'react';
import { ExampleBadge, Icon } from '@/design-system';

export interface CartaoC262Props {
  titulo: string;
  detalhe: string;
  estados: readonly string[];
  // Posição atual na lista de estados: os anteriores estão feitos, o atual pulsa, os seguintes ainda não aconteceram.
  atual: number;
  className?: string;
  children?: React.ReactNode;
}

// Cartão de rastreio do cilindro C-262 (Spec 011, adaptação ao pitch): o fio que atravessa a página. Aparece na abertura (em trânsito), na
// jornada (acompanha o trecho que a pessoa está lendo) e no fecho (entregue e de volta). Dados fictícios, sempre marcados "Exemplo"; o estado
// é dito em texto, não só em cor. As cores e os marcadores vêm de landing.css (data-etapa).
export function CartaoC262({ titulo, detalhe, estados, atual, className, children }: CartaoC262Props): React.JSX.Element {
  return (
    <div data-cartao-rastreio className={['landing-cartao-rastreio relative flex flex-col gap-2 rounded-card border border-branco/15 bg-navy/95 p-4 text-branco shadow-dialogo backdrop-blur-xs', className].filter(Boolean).join(' ')}>
      <span className="flex items-center justify-between gap-4">
        <span className="flex items-center gap-2 whitespace-nowrap text-corpo font-bold">
          <Icon name="cilindro" size={24} variant="negativa" />
          {titulo}
        </span>
        <ExampleBadge />
      </span>
      <span data-detalhe className="text-corpo text-cinza-gelo">{detalhe}</span>
      <ol className="m-0 flex list-none flex-col gap-1 p-0 text-corpo font-semibold">
        {estados.map((estado, indice) => (
          <li key={estado} className="flex items-center gap-2" data-etapa={indice < atual ? 'feita' : indice === atual ? 'atual' : 'proxima'}>
            <span aria-hidden="true" className="landing-marcador" />
            <span className={indice > atual ? 'text-cinza-gelo' : 'text-branco'}>{estado}</span>
          </li>
        ))}
      </ol>
      {children}
    </div>
  );
}
