import React from 'react';
import { SECOES } from '../landing-content';

export interface SecaoProps {
  // Âncora da seção; o tema (escuro ou claro) vem de SECOES, a fonte única da ordem e do ritmo da página.
  id: string;
  titulo: string;
  introducao?: string;
  // Conteúdo complementar na coluna lateral abaixo da introdução (ex.: destaques editoriais do pitch)
  lateral?: React.ReactNode;
  // Nas seções claras, alterna o fundo (gelo e branco) para dar ritmo à rolagem.
  fundo?: 'gelo' | 'branco';
  // Título maior, para a seção que fecha a página (a pergunta final deve pesar mais que o resto).
  destaque?: boolean;
  // No computador, o cabeçalho fica à esquerda e o conteúdo à direita, em vez de empilhados (uma peça só, como o palco do pitch). O título
  // alinha com o topo do conteúdo: centrado, deixava um vão branco acima dele (polish de 15/10/2026).
  lado?: boolean;
  // Slides seguintes da mesma seção, quando o conteúdo não cabe numa tela (apresentação em slides, 15/10/2026). Cada um ocupa a tela
  // inteira, no mesmo fundo; o título da seção fica só no primeiro.
  depois?: readonly React.ReactNode[];
  children?: React.ReactNode;
}

// Navy sólido (premium editorial, 15/10/2026): o gradiente de marca fica só na abertura.
const ESCURA = 'landing-escuro landing-secao-escura relative isolate w-full overflow-hidden bg-navy text-branco';
const FUNDOS = { gelo: 'w-full bg-cinza-gelo text-grafite', branco: 'w-full bg-branco text-grafite' } as const;
// Escala editorial dos títulos de slide (15/10/2026): 48 px no computador, e a pergunta final em 64 px.
const TITULO = 'max-w-largo text-h3 tablet:text-h2 tablet:leading-tight desktop:text-h1 desktop:leading-tight';
const TITULO_DESTAQUE = 'max-w-largo text-h2 tablet:text-h1 tablet:leading-tight desktop:text-display desktop:leading-none';

// Um slide da apresentação: ocupa ao menos a tela inteira, com o conteúdo centrado na vertical (o respiro e o encaixe da rolagem estão em
// landing.css). A seção pode ter vários.
export function Slide({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <div data-slide className="landing-slide w-full px-4 tablet:px-6 desktop:px-8">
      {children}
    </div>
  );
}

// Invólucro de toda seção da landing (Spec 011, RF-005 e RF-010): região nomeada pelo seu h2, com o espaçamento e o tema da página.
// O texto fica sempre sobre superfície sólida (navy, cinza-gelo ou branco): os pares estão medidos em design.md.
export function Secao({ id, titulo, introducao, lateral, fundo = 'gelo', destaque = false, lado = false, depois = [], children }: SecaoProps): React.JSX.Element {
  const escura = SECOES.find((secao) => secao.id === id)?.tema === 'escuro';
  const tituloId = `landing-titulo-${id}`;
  return (
    <section id={id} aria-labelledby={tituloId} data-fundo={escura ? 'escuro' : fundo} className={escura ? ESCURA : FUNDOS[fundo]}>
      <Slide>
        <div className={lado ? 'grid items-start gap-8 desktop:grid-cols-5 desktop:gap-12' : 'flex flex-col gap-8'}>
          <div className={['flex flex-col gap-4', lado ? 'desktop:col-span-2' : ''].filter(Boolean).join(' ')} data-revelar>
            <h2 id={tituloId} className={['m-0 text-balance font-extrabold leading-tight tracking-tight', destaque ? TITULO_DESTAQUE : TITULO].join(' ')}>
              {titulo}
            </h2>
            {/* O parágrafo de abertura é o lead do slide: no computador, em corpo grande, como numa revista. */}
            {introducao ? <p className={['landing-medida m-0 text-corpo leading-relaxed desktop:text-h3 desktop:font-normal desktop:leading-snug', escura ? 'text-cinza-gelo' : 'text-texto-secundario'].join(' ')}>{introducao}</p> : null}
            {lateral}
          </div>
          {lado ? <div className="desktop:col-span-3">{children}</div> : children}
        </div>
      </Slide>
      {depois.map((conteudo, indice) => (
        <Slide key={indice}>
          <div className="flex flex-col gap-8">{conteudo}</div>
        </Slide>
      ))}
    </section>
  );
}
