import React from 'react';
import { Icon } from '@/design-system';
import type { TipoDeMaterial } from '../landing-content';

type Desenho = 'pasta' | 'codigo' | 'video';

const DESENHO: Record<TipoDeMaterial, Desenho> = {
  pasta: 'pasta',
  repositorio: 'codigo',
  canal: 'video',
  video: 'video',
};

// Código e vídeo não existem na prancha de 30 ícones da Spec 003 (que é fechada), e a landing usava "configurações" e "sino" no lugar
// (polish de 15/10/2026). Os dois são desenhados aqui no mesmo traço do sistema: grade de 24 px, traço de 2 px, terminais redondos e a
// camada de apoio com 20% de opacidade, como a variante duotone.
const LOCAIS: Record<Exclude<Desenho, 'pasta'>, React.JSX.Element> = {
  codigo: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" fill="currentColor" fillOpacity="0.2" stroke="none" />
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <polyline points="10 9 7 12 10 15" />
      <polyline points="14 9 17 12 14 15" />
    </>
  ),
  video: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="3" fill="currentColor" fillOpacity="0.2" stroke="none" />
      <rect x="3" y="5" width="18" height="14" rx="3" />
      <path d="M10 9 V15 L15 12 Z" />
    </>
  ),
};

// Ícone de cada destino dos materiais: decorativo (o título do cartão diz o que é). Na versão em destaque, branco sobre o azul.
export function IconeDoMaterial({ tipo, negativa }: { tipo: TipoDeMaterial; negativa: boolean }): React.JSX.Element {
  const desenho = DESENHO[tipo];
  if (desenho === 'pasta') {
    return (
      <span data-icone={desenho} className="inline-flex">
        <Icon name="inventario" size={32} variant={negativa ? 'negativa' : 'duotone'} />
      </span>
    );
  }
  return (
    <span data-icone={desenho} className="inline-flex">
      <svg
        aria-hidden="true"
        focusable="false"
        viewBox="0 0 24 24"
        width="32"
        height="32"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={negativa ? 'text-branco' : 'text-grafite'}
      >
        {LOCAIS[desenho]}
      </svg>
    </span>
  );
}
