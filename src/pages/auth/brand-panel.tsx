import React from 'react';
import { Icon } from '@/design-system';
import type { IconName } from '@/design-system';
import { Logo } from '@/design-system/brand/logo';

const DESTAQUES: { icone: IconName; texto: string }[] = [
  { icone: 'localizacao', texto: 'Rastreamento em tempo real' },
  { icone: 'notificacoes', texto: 'Alertas inteligentes' },
  { icone: 'dashboard', texto: 'Decisões orientadas por dados' },
];

// Selo de ambiente seguro: aparece no painel de marca abaixo de 1024 px e no canto do formulário a partir dela.
export function SecureBadge({ className }: { className?: string }): React.JSX.Element {
  return (
    <span className={['items-center gap-2 rounded-full bg-sucesso-fundo px-4 py-2 text-legenda font-semibold text-verde-acessivel', className].filter(Boolean).join(' ')}>
      <Icon name="escudo" size={16} variant="monocromatica" />
      Ambiente seguro
    </span>
  );
}

// Rede de rotas decorativa: arcos e pontos de localização em traço, sem fotografia nem mapa real.
function RedeDecorativa(): React.JSX.Element {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 400 400"
      preserveAspectRatio="xMidYMid slice"
      className="pointer-events-none absolute inset-0 size-full opacity-25"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <path d="M20 330 C 120 120, 260 80, 380 190" className="text-azul-ciano" />
      <path d="M60 380 C 160 220, 280 200, 390 280" className="text-azul-ciano" strokeDasharray="4 6" />
      <path d="M0 200 C 90 160, 150 170, 230 120" className="text-azul-royal" />
      {[[20, 330], [380, 190], [230, 120], [160, 205], [300, 235]].map(([cx, cy]) => (
        <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="5" fill="currentColor" stroke="none" className="text-azul-ciano" />
      ))}
    </svg>
  );
}

// Painel de marca das telas públicas (RF-002): logotipo oficial como h1 da tela, chamada de valor e três destaques com
// ícones do catálogo. Sem fotografia nem recurso de terceiros. Só tokens da Spec 003. Abaixo de 768 px mostra só o
// logotipo, o selo e a chamada; a explicação e os destaques entram a partir daí.
export function BrandPanel(): React.JSX.Element {
  return (
    <aside className="relative isolate flex flex-col items-center gap-6 overflow-hidden rounded-b-card bg-linear-to-br from-navy via-navy to-azul-profundo px-6 pb-12 pt-8 text-branco tablet:items-start desktop:justify-between desktop:rounded-none desktop:px-12 desktop:py-12">
      <RedeDecorativa />
      <h1 className="m-0">
        <Logo variant="negativa-branca" width={200} />
      </h1>
      <SecureBadge className="inline-flex desktop:hidden" />
      <div className="flex max-w-compacto flex-col gap-4 text-center tablet:text-start">
        <p className="m-0 text-balance text-h3 font-bold leading-tight desktop:text-h2 desktop:leading-tight">
          <span className="block">Controle seus ativos.</span>
          <span className="block text-azul-ciano">Proteja sua operação.</span>
        </p>
        <p className="m-0 hidden text-corpo text-branco/90 tablet:block">
          Rastreabilidade, segurança e inteligência para uma operação mais eficiente e preparada para o futuro.
        </p>
      </div>
      <ul role="list" className="m-0 hidden w-full list-none gap-4 p-0 tablet:grid tablet:grid-cols-3">
        {DESTAQUES.map(({ icone, texto }) => (
          <li key={texto} className="flex flex-col items-start gap-4 rounded-card border border-branco/20 bg-branco/10 p-4 text-corpo font-semibold backdrop-blur-sm">
            <span className="flex size-12 items-center justify-center rounded-full border border-azul-ciano text-azul-ciano">
              <Icon name={icone} size={24} variant="monocromatica" />
            </span>
            <span>{texto}</span>
          </li>
        ))}
      </ul>
    </aside>
  );
}
