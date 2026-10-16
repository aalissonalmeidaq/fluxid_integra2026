import React, { useEffect, useRef, useState } from 'react';
import { Logo } from '@/design-system';
import { LandingCta } from './landing-cta';
import { SECOES } from './landing-content';
import { secaoAtual } from './secao-atual';
import { tomSobOPonto, type TomDoFundo } from './tom-do-fundo';

const GAVETA_ID = 'landing-gaveta';
const MENU = SECOES.filter((secao) => secao.menu);
// Linha de leitura, logo abaixo da barra compacta: a seção cujo topo passou dela é a atual.
const LINHA_DE_LEITURA = 120;

interface Posicao {
  compacto: boolean;
  atual: string | null;
}

// Mede, a cada quadro de rolagem, se a abertura já saiu da tela (o cabeçalho vira a barra compacta) e em que seção do menu a pessoa está.
function usePosicaoNaPagina(): Posicao {
  const [posicao, setPosicao] = useState<Posicao>({ compacto: false, atual: null });
  useEffect(() => {
    let quadro = 0;
    const medir = (): void => {
      quadro = 0;
      const abertura = document.getElementById('inicio');
      // A abertura saiu (ou está saindo por baixo da barra). Sem altura, a página ainda não foi desenhada: nada muda.
      const area = abertura?.getBoundingClientRect();
      const compacto = area !== undefined && area.height > 0 && area.bottom <= LINHA_DE_LEITURA;
      // Mede todas as seções e só marca a âncora quando a seção em leitura é dela: lendo uma seção fora do menu (a causa, por exemplo),
      // nada fica marcado, em vez de o item anterior continuar aceso (crítica de 15/10/2026).
      const posicoes = SECOES.flatMap((secao) => {
        const elemento = document.getElementById(secao.id);
        return elemento ? [{ id: secao.id, topo: elemento.getBoundingClientRect().top }] : [];
      });
      const lida = compacto ? secaoAtual(posicoes, LINHA_DE_LEITURA) : null;
      const atual = MENU.some((secao) => secao.id === lida) ? lida : null;
      setPosicao((anterior) => (anterior.compacto === compacto && anterior.atual === atual ? anterior : { compacto, atual }));
    };
    const agendar = (): void => {
      if (!quadro) quadro = window.requestAnimationFrame(medir);
    };
    medir();
    window.addEventListener('scroll', agendar, { passive: true });
    window.addEventListener('resize', agendar);
    return () => {
      window.cancelAnimationFrame(quadro);
      window.removeEventListener('scroll', agendar);
      window.removeEventListener('resize', agendar);
    };
  }, []);
  return posicao;
}

function Ancoras({ aoEscolher, atual = null }: { aoEscolher?: () => void; atual?: string | null }): React.JSX.Element {
  return (
    <ul className="m-0 flex list-none flex-col gap-2 p-0 desktop:flex-row desktop:items-center desktop:gap-4">
      {MENU.map((secao) => (
        <li key={secao.id}>
          <a
            href={`#${secao.id}`}
            onClick={aoEscolher}
            aria-current={secao.id === atual ? 'location' : undefined}
            className="landing-ancora inline-flex min-h-alvo w-full items-center rounded-controle px-2 text-corpo font-semibold text-branco underline-offset-4 hover:underline"
          >
            {secao.menu}
          </a>
        </li>
      ))}
    </ul>
  );
}

// Gaveta de âncoras para telas abaixo de 1024 px (crítica de 14/10/2026: a página é longa e, no celular, não tinha atalho). Segue o padrão
// do menu do aplicativo (AGENTS.md): sanduíche fixado à direita, que vira "X"; a gaveta abre pela direita com a logo; o fundo escurecido,
// Escape e a escolha de uma seção fecham; o foco entra na gaveta, circula nela e volta ao botão ao fechar. O ícone não tem caixa (AGENTS.md;
// a caixa navy cobria títulos em 360 px): como a landing alterna seções claras e escuras, ele fica branco sobre fundo escuro e navy sobre
// fundo claro, medido a cada quadro de rolagem (tom-do-fundo.ts). Com a gaveta aberta, fica sempre branco sobre ela.
function MenuCelular({ atual }: { atual: string | null }): React.JSX.Element {
  const [aberto, setAberto] = useState(false);
  const [tom, setTom] = useState<TomDoFundo>('escuro');
  const botao = useRef<HTMLButtonElement>(null);
  const gaveta = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let quadro = 0;
    const medir = (): void => {
      quadro = 0;
      const elemento = botao.current;
      if (!elemento) return;
      const area = elemento.getBoundingClientRect();
      const medido = tomSobOPonto(area.left + area.width / 2, area.top + area.height / 2, elemento);
      if (medido) setTom(medido);
    };
    const agendar = (): void => {
      if (!quadro) quadro = window.requestAnimationFrame(medir);
    };
    medir();
    window.addEventListener('scroll', agendar, { passive: true });
    window.addEventListener('resize', agendar);
    return () => {
      window.cancelAnimationFrame(quadro);
      window.removeEventListener('scroll', agendar);
      window.removeEventListener('resize', agendar);
    };
  }, []);
  const claro = tom === 'claro' && !aberto;

  useEffect(() => {
    if (!aberto) return undefined;
    gaveta.current?.querySelector<HTMLElement>('a, button')?.focus();
    const aoTeclar = (evento: KeyboardEvent): void => {
      if (evento.key === 'Escape') {
        setAberto(false);
        botao.current?.focus();
        return;
      }
      if (evento.key !== 'Tab' || !gaveta.current) return;
      const focaveis = [botao.current, ...gaveta.current.querySelectorAll<HTMLElement>('a, button')].filter((item): item is HTMLElement => item !== null);
      const primeiro = focaveis[0];
      const ultimo = focaveis[focaveis.length - 1];
      if (evento.shiftKey && document.activeElement === primeiro) {
        evento.preventDefault();
        ultimo?.focus();
      } else if (!evento.shiftKey && document.activeElement === ultimo) {
        evento.preventDefault();
        primeiro?.focus();
      }
    };
    document.addEventListener('keydown', aoTeclar);
    return () => document.removeEventListener('keydown', aoTeclar);
  }, [aberto]);

  const fechar = (): void => setAberto(false);

  return (
    <>
      <button
        ref={botao}
        type="button"
        aria-label="Menu"
        aria-expanded={aberto}
        aria-controls={GAVETA_ID}
        onClick={() => setAberto((valor) => !valor)}
        data-tom={claro ? 'claro' : 'escuro'}
        className={[
          'landing-sanduiche fixed end-2 top-4 z-50 inline-flex min-h-alvo min-w-alvo cursor-pointer items-center justify-center rounded-controle desktop:hidden',
          claro ? 'text-navy' : 'text-branco',
        ].join(' ')}
      >
        <svg width={28} height={28} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true" focusable="false">
          {aberto ? (
            <>
              <line x1={5} y1={5} x2={19} y2={19} />
              <line x1={19} y1={5} x2={5} y2={19} />
            </>
          ) : (
            <>
              <line x1={4} y1={7} x2={20} y2={7} />
              <line x1={4} y1={12} x2={20} y2={12} />
              <line x1={4} y1={17} x2={20} y2={17} />
            </>
          )}
        </svg>
      </button>
      {aberto ? (
        <>
          <div data-veu aria-hidden="true" onClick={fechar} className="landing-veu fixed inset-0 z-40 desktop:hidden" />
          <div ref={gaveta} id={GAVETA_ID} role="dialog" aria-modal="true" aria-label="Menu da página" className="landing-escuro landing-gaveta fixed inset-y-0 end-0 z-40 flex flex-col gap-8 bg-navy px-6 pb-8 pt-16 text-branco shadow-dialogo desktop:hidden">
            <Logo variant="negativa-branca" width={160} className="h-auto" />
            <nav aria-label="Seções da página">
              <Ancoras aoEscolher={fechar} atual={atual} />
            </nav>
            {/* Entrar é secundário: o verde fica para a ação principal da página. */}
            <LandingCta variante="contorno" />
          </div>
        </>
      ) : null}
    </>
  );
}

// Cabeçalho da landing (Spec 011, RF-005 e RF-010): fica sobre a abertura (que ocupa a tela inteira), sem fundo próprio, e rola com a página.
// O logotipo, em destaque (grande, a marca em primeiro lugar), volta ao topo; "Entrar no sistema" fica sempre visível, discreto, para quem já tem conta; as âncoras aparecem na linha a partir
// de 1024 px e, abaixo disso, na gaveta do sanduíche. O h1 é o da abertura, não o do logotipo.
// Layout de 15/10/2026 (crítica: no computador a navegação sumia no primeiro rolar de uma página de 12 mil pixels): passada a abertura, o
// próprio cabeçalho vira uma barra compacta fixa no topo, com a logo menor, e o menu marca a seção atual (aria-current). É o mesmo cabeçalho,
// não uma cópia: um só banner e um só menu na árvore de acessibilidade. No celular ele continua rolando; ali o atalho é o sanduíche.
export function LandingHeader(): React.JSX.Element {
  const { compacto, atual } = usePosicaoNaPagina();
  return (
    <header
      data-compacto={compacto || undefined}
      className="landing-escuro landing-cabecalho absolute inset-x-0 top-0 z-10 flex items-center justify-between gap-4 py-4 pe-16 ps-4 text-branco tablet:ps-6 desktop:px-8"
    >
      <a href="#inicio" className="inline-flex min-h-alvo items-center rounded-controle">
        <Logo variant="negativa-branca" width={256} className="landing-logo-topo h-auto" />
      </a>
      <nav aria-label="Seções da página" className="hidden desktop:block">
        <Ancoras atual={atual} />
      </nav>
      <LandingCta variante="cabecalho" />
      <MenuCelular atual={atual} />
    </header>
  );
}
