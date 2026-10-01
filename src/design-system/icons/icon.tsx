import React from 'react';
import { ICONES } from './registro';
import { COR_DO_ESTADO, type Forma, type IconName, type IconSize, type IconState, type IconVariant } from './tipos';

export interface IconProps {
  name: IconName;
  size?: IconSize;
  state?: IconState;
  variant?: IconVariant;
  // Sem `label` o ícone é decorativo e fica oculto da tecnologia assistiva; com `label` ele é uma imagem nomeada.
  label?: string;
  className?: string;
}

function corDoIcone(state: IconState, variant: IconVariant): string | undefined {
  if (variant === 'monocromatica') return undefined;
  if (variant === 'negativa') return 'var(--color-branco)';
  return `var(--color-${COR_DO_ESTADO[state]})`;
}

function desenhar(forma: Forma, chave: number): React.ReactNode {
  const apoio = forma.apoio ? { 'data-apoio': 'true', fill: 'currentColor', fillOpacity: 0.2, stroke: 'none' } : {};
  switch (forma.t) {
    case 'path':
      return <path key={chave} d={forma.d} {...apoio} />;
    case 'circle':
      return <circle key={chave} cx={forma.cx} cy={forma.cy} r={forma.r} {...apoio} />;
    case 'rect':
      return <rect key={chave} x={forma.x} y={forma.y} width={forma.w} height={forma.h} {...(forma.rx ? { rx: forma.rx } : {})} {...apoio} />;
    case 'line':
      return <line key={chave} x1={forma.x1} y1={forma.y1} x2={forma.x2} y2={forma.y2} />;
    case 'polyline':
      return <polyline key={chave} points={forma.pontos} {...apoio} />;
  }
}

// Ícone do sistema FluxID: grade de 24 por 24 px, traço de 2 px (3 unidades a 16 px, para manter 2 px efetivos),
// terminais arredondados. Tamanho, estado e variante só mudam atributos e variáveis de cor (RF-028).
export function Icon({ name, size = 24, state = 'padrao', variant = 'contorno', label, className }: IconProps): React.JSX.Element {
  const formas = ICONES[name];
  if (!formas) throw new Error(`Ícone desconhecido: "${name}".`);
  const cor = corDoIcone(state, variant);
  const mostrarApoio = variant === 'duotone' || variant === 'negativa';
  const acessibilidade = label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true, focusable: 'false' as const };

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={size === 16 ? 3 : 2}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={cor ? { color: cor } : undefined}
      {...(className ? { className } : {})}
      {...acessibilidade}
    >
      {formas.filter((forma) => !forma.apoio || mostrarApoio).map(desenhar)}
    </svg>
  );
}
