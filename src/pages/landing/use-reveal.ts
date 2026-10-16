import { useEffect, type RefObject } from 'react';

// Revelação das seções ao entrar na tela (Spec 011, RF-012). É opcional e nunca esconde conteúdo por padrão:
// - sem a marca de revelação, todo elemento é visível; o CSS só esconde `data-revelar="pendente"`;
// - com "reduzir movimento", sem IntersectionObserver ou para o que já está na primeira tela, nada é escondido.
// O elemento marcado com `data-revelar` passa de "pendente" a "visivel" ao entrar na tela, uma única vez.
export function useReveal(raiz: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const elemento = raiz.current;
    if (!elemento) return undefined;
    const reduzir = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduzir || typeof IntersectionObserver === 'undefined') return undefined;

    const alvos = [...elemento.querySelectorAll<HTMLElement>('[data-revelar]')];
    const observador = new IntersectionObserver(
      (entradas) => {
        for (const entrada of entradas) {
          if (!entrada.isIntersecting) continue;
          entrada.target.setAttribute('data-revelar', 'visivel');
          observador.unobserve(entrada.target);
        }
      },
      { rootMargin: '0px 0px -10% 0px', threshold: 0.1 },
    );
    for (const alvo of alvos) {
      // O que já está dentro da primeira tela aparece de imediato, sem piscar; o resto espera.
      if (alvo.getBoundingClientRect().top < window.innerHeight) {
        alvo.setAttribute('data-revelar', 'visivel');
      } else {
        alvo.setAttribute('data-revelar', 'pendente');
        observador.observe(alvo);
      }
    }
    return () => observador.disconnect();
  }, [raiz]);
}
