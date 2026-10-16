import { useEffect, useState, type RefObject } from 'react';

const DURACAO_MS = 1400;

// Contagem crescente de um número quando ele entra na tela (Spec 011, adaptação ao pitch). É só efeito visual: o valor final é o ponto de
// partida sempre que não houver movimento (reduzir movimento, sem IntersectionObserver ou fora do navegador), e o leitor de tela recebe o
// valor final em texto, nunca a contagem.
export function useContagem(final: number, alvo: RefObject<HTMLElement | null>): number {
  const animar =
    typeof window !== 'undefined' &&
    typeof IntersectionObserver !== 'undefined' &&
    typeof window.requestAnimationFrame === 'function' &&
    !(typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [valor, setValor] = useState(animar ? 0 : final);

  useEffect(() => {
    const elemento = alvo.current;
    if (!animar || !elemento) return undefined;
    let quadro = 0;
    const observador = new IntersectionObserver(
      (entradas) => {
        if (!entradas.some((entrada) => entrada.isIntersecting)) return;
        observador.disconnect();
        const inicio = performance.now();
        const passo = (agora: number): void => {
          const progresso = Math.min(1, (agora - inicio) / DURACAO_MS);
          const suave = 1 - (1 - progresso) ** 3;
          setValor(final * suave);
          if (progresso < 1) quadro = window.requestAnimationFrame(passo);
        };
        quadro = window.requestAnimationFrame(passo);
      },
      { threshold: 0.4 },
    );
    observador.observe(elemento);
    return () => {
      observador.disconnect();
      window.cancelAnimationFrame(quadro);
    };
  }, [animar, final, alvo]);

  return animar ? valor : final;
}
