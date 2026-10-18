import React from 'react';
import { Icon } from '@/design-system';
import { Mascote } from '../mascote';
import { TELAS, TEXTOS } from '../landing-content';
import { CadeiaDecorativa } from './cadeia-decorativa';
import { CartaoC262 } from './cartao-c262';

const TITULO_ID = 'landing-titulo';
export const TELA_DA_ABERTURA = '/landing/telas/tela-viagem-hero.webp';

// Abertura da landing (Spec 011, RF-005 e RF-016): ocupa a tela inteira ao entrar, escura, com o único h1 da página. A tensão do pitch vem
// logo abaixo do título (o C-262 que sumiu), e a ação principal é a do público da página: assistir ao pitch; a segunda leva à trava. Quem já
// tem conta entra pelo cabeçalho. O cartão de rastreio do C-262 (dados de exemplo) responde ao gancho: no celular ele vem logo depois das
// ações, ainda na primeira tela; do tablet em diante, sobreposto ao pé do mascote (grade em landing.css). A cadeia ao fundo é decorativa;
// o texto fica sempre sobre superfície sólida (navy).
export function Hero(): React.JSX.Element {
  const { cartao } = TEXTOS.abertura;
  const tela = TELAS[0]!;
  return (
    <section
      id="inicio"
      data-slide
      data-fundo="escuro"
      aria-labelledby={TITULO_ID}
      className="landing-escuro landing-secao-escura landing-hero relative isolate flex flex-col overflow-hidden bg-linear-to-br from-navy via-navy to-azul-profundo px-4 pb-8 text-branco tablet:px-6 desktop:px-8"
    >
      <CadeiaDecorativa />
      <div className="landing-hero-grade flex-1 gap-6 tablet:gap-12">
        <div className="landing-hero-texto flex flex-col items-start gap-6" data-revelar>
          <h1 id={TITULO_ID} className="m-0 text-balance text-h2 font-extrabold leading-tight tracking-tight tablet:text-h1 tablet:leading-tight desktop:text-display desktop:leading-tight">
            {TEXTOS.abertura.titulo}
          </h1>
          <p className="landing-medida m-0 text-corpo font-bold leading-snug text-branco tablet:text-h3">{TEXTOS.abertura.gancho}</p>
        </div>
        <div className="landing-hero-fecho flex flex-col items-start gap-6" data-revelar>
          <p className="landing-medida m-0 text-corpo font-medium leading-relaxed text-cinza-gelo tablet:text-h3 tablet:font-normal tablet:leading-snug">{TEXTOS.abertura.subtitulo}</p>
          <div className="flex flex-wrap items-center gap-4">
            <a
              href="#assistir-video-pitch"
              className="inline-flex min-h-alvo items-center justify-center gap-2 rounded-controle border border-verde-vivo bg-verde-vivo px-6 text-corpo font-bold text-navy no-underline transition-colors hover:border-branco hover:bg-branco motion-reduce:transition-none"
            >
              <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
              {TEXTOS.abertura.acaoPrincipal}
            </a>
            <a
              href="#trava"
              className="inline-flex min-h-alvo items-center justify-center gap-2 rounded-controle border border-branco px-6 text-corpo font-semibold text-branco no-underline transition-colors hover:bg-azul-profundo motion-reduce:transition-none"
            >
              <Icon name="bloqueio" size={16} variant="negativa" />
              {TEXTOS.abertura.acaoSecundaria}
            </a>
          </div>
        </div>
        <div data-area-mascote className="landing-hero-palco relative mx-auto w-full">
          <figure data-tela-hero className="landing-tela-hero m-0 overflow-hidden rounded-card bg-branco shadow-dialogo">
            <figcaption className="flex items-center justify-between gap-2 bg-cinza-gelo px-4 py-2 text-corpo font-bold text-navy">
              <span>FluxID em operação</span>
              <span className="rounded-controle bg-alerta-fundo px-2 py-1 text-alerta-texto">Exemplo</span>
            </figcaption>
            {/* Versão própria da abertura (o recorte 16:9 do topo, 640 x 360, scripts/landing/otimizar-imagens.mjs): é o maior elemento da
                primeira tela (LCP) e o index.html a pré-carrega. */}
            <img
              src={TELA_DA_ABERTURA}
              width={640}
              height={360}
              alt={tela.alt}
              decoding="async"
              fetchPriority="high"
              className="landing-tela-hero-imagem block h-auto w-full"
            />
          </figure>
          <div className="landing-produto-hero">
            <Mascote uso="abertura" className="landing-mascote-abertura w-full" />
          </div>
        </div>
        <CartaoC262 titulo={cartao.titulo} detalhe={cartao.detalhe} estados={cartao.estados} atual={1} className="landing-hero-cartao">
          {/* No celular o mascote não cabe na primeira tela: o rosto dele acompanha o cartão, no canto. */}
          <span aria-hidden="true" className="landing-avatar-cartao overflow-hidden rounded-full border-2 border-azul-royal bg-navy">
            <Mascote uso="cartao" className="landing-mascote-rosto" />
          </span>
        </CartaoC262>
      </div>
      <a href="#historia" className="landing-rolar mx-auto mt-6 inline-flex min-h-alvo items-center gap-2 rounded-controle px-2 text-corpo font-semibold text-branco no-underline">
        {TEXTOS.abertura.rolar}
        <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
      </a>
    </section>
  );
}
