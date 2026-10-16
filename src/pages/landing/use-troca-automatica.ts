import { useEffect, useRef, useState, type RefObject } from 'react';

// Troca automática de uma demonstração (pedidos de 15/10/2026, trava): enquanto ligada, chama `avancar` quando passa `intervalo` desde o
// último momento mostrado (`atual`); como a contagem recomeça sempre que `atual` muda, uma escolha manual também reinicia o tempo. Só conta
// com o painel na tela (quem está em outra seção não perde nada) e recomeça do zero ao voltar. Pausar fica com quem usa o hook (WCAG 2.2.2).
export function useTrocaAutomatica(alvo: RefObject<HTMLElement | null>, ligada: boolean, intervalo: number, atual: unknown, avancar: () => void): void {
  const [visivel, setVisivel] = useState(true);
  const avancarAtual = useRef(avancar);
  useEffect(() => {
    avancarAtual.current = avancar;
  });

  useEffect(() => {
    const elemento = alvo.current;
    if (!elemento || typeof IntersectionObserver === 'undefined') return undefined;
    const observador = new IntersectionObserver(([entrada]) => setVisivel(entrada?.isIntersecting ?? true), { threshold: 0.3 });
    observador.observe(elemento);
    return () => observador.disconnect();
  }, [alvo]);

  const contando = ligada && visivel;
  useEffect(() => {
    if (!contando) return undefined;
    const relogio = window.setTimeout(() => avancarAtual.current(), intervalo);
    return () => window.clearTimeout(relogio);
  }, [contando, intervalo, atual]);
}
