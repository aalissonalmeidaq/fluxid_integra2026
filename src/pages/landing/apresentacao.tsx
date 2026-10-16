import React, { useCallback, useEffect, useRef, useState } from 'react';
import { SECOES } from './landing-content';
import { destinoDoPasso, indiceDoSlide, type PosicaoDoSlide } from './slides';

const COMPUTADOR = '(min-width: 1024px)';
const AVANCAR = new Set(['ArrowDown', 'PageDown', ' ']);
const VOLTAR = new Set(['ArrowUp', 'PageUp']);
// Quem está num destes recebe a própria tecla: a seta muda o controle deslizante, o espaço aciona o botão ou abre o bloco recolhível.
const DONOS_DA_TECLA = 'input, textarea, select, button, summary, iframe, video, [contenteditable="true"], [role="slider"], [role="dialog"] *';
// Eventos da roda separados por menos que isto são o mesmo gesto (a inércia do trackpad, uma volta rápida da roda): um gesto, um slide.
const PAUSA_DO_GESTO = 100;
// Se a rolagem suave não chegar ao destino (outra rolagem a interrompeu), o próximo passo volta a partir da posição real.
const VALIDADE_DO_DESTINO = 1000;
// Sem atividade (mouse, roda, teclado ou toque) por este tempo, o indicador se recolhe para não ficar por cima da informação.
const TEMPO_PARA_RECOLHER = 3000;

interface Estado {
  indice: number;
  total: number;
  nome: string;
  // No último slide e já no fim da página (com o rodapé à vista): não há próximo passo.
  noFim: boolean;
}

// Última posição de rolagem possível: abaixo do último slide fica o rodapé, que não é slide mas precisa ser alcançado.
const fimDaPagina = (): number => document.documentElement.scrollHeight - window.innerHeight;

function medirSlides(): Array<PosicaoDoSlide & { elemento: HTMLElement }> {
  return [...document.querySelectorAll<HTMLElement>('[data-slide]')].map((elemento) => {
    const area = elemento.getBoundingClientRect();
    return { elemento, topo: area.top + window.scrollY, altura: area.height };
  });
}

// Nome mostrado no indicador: o rótulo do menu, ou o título da seção do slide.
function nomeDoSlide(elemento: HTMLElement | undefined): string {
  const id = elemento?.closest('section')?.id;
  const secao = SECOES.find((item) => item.id === id);
  return secao?.menu ?? secao?.titulo ?? '';
}

const noComputador = (): boolean => typeof window.matchMedia === 'function' && window.matchMedia(COMPUTADOR).matches;
const reduzirMovimento = (): boolean => typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Controles da apresentação em slides (pedido de 15/10/2026). No computador a página anda slide a slide: cada gesto da roda ou do trackpad,
// as teclas de apresentação (setas, PageUp/PageDown e espaço; Shift+espaço volta) e os botões do indicador levam ao slide anterior ou ao
// próximo; num slide mais alto que a tela, o passo anda por dentro dele antes de trocar (slides.ts). O encaixe é feito aqui e não por CSS
// (scroll-snap), que travava a roda em slides mais altos que a tela. As teclas não são roubadas de quem está num campo, botão ou bloco
// recolhível, e a roda com Ctrl (zoom) ou de lado fica com o navegador. No celular o indicador some e a rolagem é a do navegador.
export function Apresentacao(): React.JSX.Element {
  const [estado, setEstado] = useState<Estado>({ indice: -1, total: 0, nome: '', noFim: false });
  const [ocioso, setOcioso] = useState(false);

  // Recolhe o indicador depois de um tempo parado e o traz de volta com qualquer atividade (pedido de 16/10/2026).
  useEffect(() => {
    let relogio = window.setTimeout(() => setOcioso(true), TEMPO_PARA_RECOLHER);
    const atividade = (): void => {
      setOcioso(false);
      window.clearTimeout(relogio);
      relogio = window.setTimeout(() => setOcioso(true), TEMPO_PARA_RECOLHER);
    };
    const eventos = ['pointermove', 'pointerdown', 'wheel', 'keydown', 'touchstart'] as const;
    for (const evento of eventos) window.addEventListener(evento, atividade, { passive: true });
    return () => {
      window.clearTimeout(relogio);
      for (const evento of eventos) window.removeEventListener(evento, atividade);
    };
  }, []);
  // Destino da rolagem suave em curso: um segundo passo rápido parte dele, e não do meio do caminho.
  const destinoPendente = useRef<{ topo: number; ate: number } | null>(null);

  const irPara = useCallback((direcao: 1 | -1): void => {
    const pendente = destinoPendente.current;
    const base = pendente && pendente.ate > performance.now() ? pendente.topo : window.scrollY;
    let destino = destinoDoPasso(medirSlides(), base, window.innerHeight, direcao);
    // Depois do último slide, o passo desce até o fim da página, onde está o rodapé.
    if (destino === null && direcao === 1 && fimDaPagina() - base > 2) destino = fimDaPagina();
    if (destino === null) return;
    destinoPendente.current = { topo: destino, ate: performance.now() + VALIDADE_DO_DESTINO };
    window.scrollTo({ top: destino, behavior: reduzirMovimento() ? 'auto' : 'smooth' });
  }, []);

  const medir = useCallback((): void => {
    const slides = medirSlides();
    const indice = indiceDoSlide(slides, window.scrollY, window.innerHeight);
    const nome = nomeDoSlide(slides[indice]?.elemento);
    const noFim = indice >= slides.length - 1 && window.scrollY >= fimDaPagina() - 2;
    setEstado((anterior) =>
      anterior.indice === indice && anterior.total === slides.length && anterior.nome === nome && anterior.noFim === noFim ? anterior : { indice, total: slides.length, nome, noFim },
    );
  }, []);

  useEffect(() => {
    let quadro = 0;
    const agendar = (): void => {
      const pendente = destinoPendente.current;
      if (pendente && Math.abs(window.scrollY - pendente.topo) < 2) destinoPendente.current = null;
      if (!quadro) {
        quadro = window.requestAnimationFrame(() => {
          quadro = 0;
          medir();
        });
      }
    };
    // A primeira medida também vai para o próximo quadro, quando o layout da página já está pronto.
    agendar();
    window.addEventListener('scroll', agendar, { passive: true });
    window.addEventListener('resize', agendar);
    return () => {
      window.cancelAnimationFrame(quadro);
      window.removeEventListener('scroll', agendar);
      window.removeEventListener('resize', agendar);
    };
  }, [medir]);

  useEffect(() => {
    const aoTeclar = (evento: KeyboardEvent): void => {
      if (evento.defaultPrevented || evento.altKey || evento.ctrlKey || evento.metaKey || !noComputador()) return;
      const alvo = evento.target;
      if (alvo instanceof Element && alvo.closest(DONOS_DA_TECLA)) return;
      const direcao = AVANCAR.has(evento.key) && !(evento.key === ' ' && evento.shiftKey) ? 1 : VOLTAR.has(evento.key) || (evento.key === ' ' && evento.shiftKey) ? -1 : 0;
      if (direcao === 0) return;
      evento.preventDefault();
      irPara(direcao);
    };

    let ultimoEvento = Number.NEGATIVE_INFINITY;
    const aoRodar = (evento: WheelEvent): void => {
      if (evento.defaultPrevented || evento.ctrlKey || !noComputador()) return;
      if (evento.deltaY === 0 || Math.abs(evento.deltaX) > Math.abs(evento.deltaY)) return;
      evento.preventDefault();
      const agora = performance.now();
      const gestoNovo = agora - ultimoEvento > PAUSA_DO_GESTO;
      ultimoEvento = agora;
      if (gestoNovo) irPara(evento.deltaY > 0 ? 1 : -1);
    };
    window.addEventListener('keydown', aoTeclar);
    window.addEventListener('wheel', aoRodar, { passive: false });
    return () => {
      window.removeEventListener('keydown', aoTeclar);
      window.removeEventListener('wheel', aoRodar);
    };
  }, [irPara]);

  const { indice, total, nome, noFim } = estado;
  return (
    <nav aria-label="Slides da apresentação" data-ocioso={ocioso} className="landing-escuro landing-apresentacao fixed bottom-4 end-4 z-30 hidden items-center gap-1 rounded-full border border-branco/20 bg-navy/95 py-1 pe-1 ps-4 text-branco shadow-dialogo backdrop-blur-xs desktop:flex">
      <p className="m-0 me-1 flex items-baseline gap-2 text-legenda font-semibold">
        <span className="tabular-nums">{total > 0 ? `${indice + 1} / ${total}` : ''}</span>
        {/* Compacto (16/10/2026): só "n / total" à vista, para o controle não cobrir a informação; o nome da seção fica para o leitor de tela
            (e já aparece marcado no menu do cabeçalho). */}
        <span className="sr-only">{nome}</span>
      </p>
      <BotaoDoSlide rotulo="Slide anterior" desativado={indice <= 0} aoClicar={() => irPara(-1)} seta="m18 15-6-6-6 6" />
      <BotaoDoSlide rotulo="Próximo slide" desativado={total === 0 || noFim} aoClicar={() => irPara(1)} seta="m6 9 6 6 6-6" />
    </nav>
  );
}

function BotaoDoSlide({ rotulo, desativado, aoClicar, seta }: { rotulo: string; desativado: boolean; aoClicar: () => void; seta: string }): React.JSX.Element {
  return (
    <button
      type="button"
      aria-label={rotulo}
      disabled={desativado}
      onClick={aoClicar}
      className="inline-flex min-h-alvo min-w-alvo cursor-pointer items-center justify-center rounded-full text-branco transition-colors hover:bg-azul-profundo disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-transparent motion-reduce:transition-none"
    >
      <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d={seta} />
      </svg>
    </button>
  );
}
