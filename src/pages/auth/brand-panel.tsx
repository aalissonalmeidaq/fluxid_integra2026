import React from 'react';
import { Icon } from '@/design-system';
import type { IconName } from '@/design-system';
import { Logo } from '@/design-system/brand/logo';

const DESTAQUES: { icone: IconName; texto: string }[] = [
  { icone: 'lacre', texto: 'Custódia individual de cada cilindro' },
  { icone: 'historico', texto: 'Trilha de auditoria imutável' },
  { icone: 'sem-sinal', texto: 'Operação de campo com sinal instável' },
];

// Selo de ambiente seguro: aparece no painel de marca abaixo de 1024 px e no canto do formulário a partir dela.
export function SecureBadge({ className }: { className?: string }): React.JSX.Element {
  return (
    <span className={['items-center gap-2 rounded-full bg-info-fundo px-4 py-2 text-legenda font-semibold text-azul-profundo', className].filter(Boolean).join(' ')}>
      <Icon name="escudo" size={16} variant="monocromatica" />
      Ambiente seguro
    </span>
  );
}

// Etapas do ciclo do cilindro, na ordem do documento de visão: envase, estoque, viagem, cliente e retorno.
const ETAPAS: { id: string; cx: number; cy: number }[] = [
  { id: 'envase', cx: 40, cy: 330 },
  { id: 'estoque', cx: 125, cy: 255 },
  { id: 'viagem', cx: 215, cy: 215 },
  { id: 'cliente', cx: 300, cy: 140 },
  { id: 'retorno', cx: 370, cy: 70 },
];

// Cadeia de custódia decorativa: as cinco etapas do ciclo ligadas por um traço, com o cliente em destaque e o retorno
// tracejado de volta ao início. Só geometria, sem texto, fotografia nem mapa real; estática e na cor dos tokens.
function CadeiaDeCustodia(): React.JSX.Element {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      data-motivo="cadeia-de-custodia"
      viewBox="0 0 400 400"
      preserveAspectRatio="xMidYMid slice"
      className="pointer-events-none absolute inset-0 size-full opacity-20 tablet:opacity-25"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <polyline points={ETAPAS.map(({ cx, cy }) => `${cx},${cy}`).join(' ')} className="text-azul-ciano" strokeLinejoin="round" />
      <path d="M370 70 C 400 190, 300 330, 40 330" className="text-azul-royal" strokeDasharray="4 6" />
      {ETAPAS.map(({ id, cx, cy }) =>
        id === 'cliente' ? (
          <g key={id} data-etapa={id} className="text-azul-ciano">
            <circle cx={cx} cy={cy} r="16" />
            <circle cx={cx} cy={cy} r="7" fill="currentColor" stroke="none" />
          </g>
        ) : (
          <circle key={id} data-etapa={id} cx={cx} cy={cy} r="5" fill="currentColor" stroke="none" className="text-azul-ciano" />
        ),
      )}
    </svg>
  );
}

const CICLO = ['Envase', 'Estoque', 'Viagem', 'Cliente', 'Retorno'];

// Ciclo do cilindro em diagrama: cinco etapas ligadas por uma linha fina, com a etapa do cliente em destaque. É a mesma
// cadeia do fundo, agora legível. Decorativo (os destaques abaixo já dizem o mesmo em texto) e só a partir do tablet.
function CicloDoCilindro(): React.JSX.Element {
  return (
    <div aria-hidden="true" data-ciclo className="relative hidden w-full tablet:block">
      <span className="absolute inset-x-4 top-2 h-px bg-azul-ciano/50" />
      <ol className="relative m-0 flex list-none items-start justify-between p-0">
        {CICLO.map((etapa) => {
          const destaque = etapa === 'Cliente';
          return (
            <li key={etapa} data-destaque={destaque} className="flex flex-col items-center gap-2">
              <span
                className={[
                  'size-4 rounded-full border-2 border-azul-ciano',
                  destaque ? 'bg-azul-ciano ring-4 ring-azul-ciano/30' : 'bg-navy',
                ].join(' ')}
              />
              <span data-passo className={['text-legenda font-semibold', destaque ? 'text-branco' : 'text-branco/90'].join(' ')}>{etapa}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

// Painel de marca das telas públicas (RF-002): logotipo oficial como h1 da tela, chamada de valor e três destaques com
// ícones do catálogo. Sem fotografia nem recurso de terceiros. Só tokens da Spec 003. Abaixo de 768 px mostra só o
// logotipo e a primeira frase da chamada; a explicação e os destaques entram a partir daí.
export function BrandPanel(): React.JSX.Element {
  return (
    <aside className="relative isolate flex flex-col items-center gap-4 overflow-hidden rounded-b-card bg-linear-to-br from-navy via-navy to-azul-profundo px-6 pb-8 pt-6 text-branco tablet:items-start tablet:gap-6 tablet:pb-12 tablet:pt-8 desktop:justify-between desktop:rounded-none desktop:px-12 desktop:py-12">
      <CadeiaDeCustodia />
      <h1 className="m-0">
        <Logo variant="negativa-branca" width={200} />
      </h1>
      <SecureBadge className="hidden tablet:inline-flex desktop:hidden" />
      <div className="flex max-w-compacto flex-col gap-4 text-center tablet:text-start">
        <p className="m-0 text-balance text-h3 font-bold leading-tight desktop:text-h2 desktop:leading-tight">
          <span className="block">Cada cilindro, uma identidade.</span>
          <span className="hidden text-azul-ciano tablet:block">Cada movimento, uma evidência.</span>
        </p>
        <p className="m-0 hidden text-corpo text-branco/90 tablet:block">
          Saiba quem tem cada cilindro, por onde ele esteve e o que aconteceu, com registro que não se apaga.
        </p>
      </div>
      <CicloDoCilindro />
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
