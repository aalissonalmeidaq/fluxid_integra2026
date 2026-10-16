import { useEffect, type RefObject } from 'react';
import { secaoAtual } from './secao-atual';

// Barra de rolagem no tom da seção que está na tela (pedido de 15/10/2026): a cada quadro de rolagem, mede os trechos marcados com
// data-fundo (as seções e o rodapé) e copia para <html data-rolagem> o fundo do trecho que ocupa o meio da tela. As cores de cada
// fundo ficam em landing.css; ao sair da landing, o atributo some e o aplicativo volta à barra padrão (base.css).
export function useRolagemDaSecao(raiz: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const html = document.documentElement;
    let quadro = 0;
    const medir = (): void => {
      quadro = 0;
      const trechos = [...(raiz.current?.querySelectorAll<HTMLElement>('[data-fundo]') ?? [])];
      const posicoes = trechos.map((elemento, indice) => ({ id: String(indice), topo: elemento.getBoundingClientRect().top }));
      const atual = secaoAtual(posicoes, window.innerHeight / 2);
      const fundo = trechos[Number(atual ?? 0)]?.dataset.fundo;
      if (fundo && html.dataset.rolagem !== fundo) html.dataset.rolagem = fundo;
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
      delete html.dataset.rolagem;
    };
  }, [raiz]);
}
