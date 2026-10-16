import React, { useEffect, useRef } from 'react';
import { SkipLink } from '@/design-system';
import { Apresentacao } from './apresentacao';
import { LandingFooter } from './landing-footer';
import { LandingHeader } from './landing-header';
import { Causa } from './sections/causa';
import { ChamadaFinal } from './sections/chamada-final';
import { Equipe } from './sections/equipe';
import { Funcionalidades } from './sections/funcionalidades';
import { Hero } from './sections/hero';
import { Historia } from './sections/historia';
import { Materiais } from './sections/materiais';
import { Piloto } from './sections/piloto';
import { Planos } from './sections/planos';
import { Pitch } from './sections/pitch';
import { Prejuizo } from './sections/prejuizo';
import { Solucao } from './sections/solucao';
import { Trava } from './sections/trava';
import { useReveal } from './use-reveal';
import { useRolagemDaSecao } from './use-rolagem-da-secao';
import './landing.css';

const TITULO_DA_PAGINA = 'FluxID — Rastreabilidade de cilindros de gás';

// Landing page pública do FluxID (Spec 011): a raiz "/" do aplicativo. Fica fora do AppShell, com cabeçalho, conteúdo principal e rodapé
// próprios, e só lê o estado da sessão para escolher o botão (RF-001, RF-003). Não faz chamada ao servidor. A ordem das seções é a de
// SECOES em landing-content.ts, a sequência do pitch: abertura, a história do C-262, o prejuízo, a causa, a solução (com a
// jornada do C-262), a trava (segundo pico, com o vídeo do protótipo físico), o que já funciona (com o vídeo do sistema), o piloto, os planos, a equipe,
// os materiais, o pitch em vídeo (depois dos materiais, pedido de 16/10/2026) e a chamada final. Cada seção é um ou mais slides de tela cheia (apresentação em slides, 15/10/2026), com o indicador e as
// teclas de apresentação no computador.
export function LandingPage(): React.JSX.Element {
  const raiz = useRef<HTMLDivElement>(null);
  useReveal(raiz);
  useRolagemDaSecao(raiz);
  useEffect(() => {
    const anterior = document.title;
    document.title = TITULO_DA_PAGINA;
    document.documentElement.lang = 'pt-BR';
    return () => {
      document.title = anterior;
    };
  }, []);
  return (
    <div ref={raiz} className="relative flex min-h-screen flex-col bg-cinza-gelo" data-pagina="landing">
      <SkipLink targetId="main-content">Pular para o conteúdo</SkipLink>
      <LandingHeader />
      <main id="main-content" tabIndex={-1} className="flex flex-1 flex-col">
        <Hero />
        <Historia />
        <Prejuizo />
        <Causa />
        <Solucao />
        <Trava />
        <Funcionalidades />
        <Piloto />
        <Planos />
        <Equipe />
        <Materiais />
        <Pitch />
        <ChamadaFinal />
      </main>
      <LandingFooter />
      <Apresentacao />
    </div>
  );
}

export default LandingPage;
