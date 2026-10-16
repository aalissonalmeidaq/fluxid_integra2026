import React, { useRef } from 'react';
import { act, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useRolagemDaSecao } from './use-rolagem-da-secao';

// A barra de rolagem acompanha a seção que está no meio da tela (pedido de 15/10/2026): navy nas escuras, gelo ou branco nas claras.
function Pagina({ fundos }: { fundos: readonly string[] }): React.JSX.Element {
  const raiz = useRef<HTMLDivElement>(null);
  useRolagemDaSecao(raiz);
  return (
    <div ref={raiz}>
      {fundos.map((fundo, indice) => (
        <section key={indice} data-fundo={fundo} />
      ))}
    </div>
  );
}

// Cada trecho mede 1000 px, empilhado a partir do topo da página, deslocado pela rolagem atual.
function posicionar(rolagem: number): void {
  document.querySelectorAll<HTMLElement>('[data-fundo]').forEach((elemento, indice) => {
    const topo = indice * 1000 - rolagem;
    elemento.getBoundingClientRect = () => ({ top: topo, bottom: topo + 1000, left: 0, right: 0, width: 0, height: 1000, x: 0, y: topo, toJSON: () => ({}) });
  });
}

function rolarAte(rolagem: number): void {
  posicionar(rolagem);
  act(() => {
    window.dispatchEvent(new Event('scroll'));
  });
}

describe('useRolagemDaSecao', () => {
  afterEach(() => {
    delete document.documentElement.dataset.rolagem;
  });

  it('usa o fundo da seção que está no meio da tela e troca ao rolar', async () => {
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 });
    render(<Pagina fundos={['escuro', 'gelo', 'branco']} />);
    rolarAte(0);
    await act(() => new Promise((resolver) => requestAnimationFrame(() => resolver(undefined))));
    expect(document.documentElement.dataset.rolagem).toBe('escuro');

    rolarAte(1000);
    await act(() => new Promise((resolver) => requestAnimationFrame(() => resolver(undefined))));
    expect(document.documentElement.dataset.rolagem).toBe('gelo');

    rolarAte(1900);
    await act(() => new Promise((resolver) => requestAnimationFrame(() => resolver(undefined))));
    expect(document.documentElement.dataset.rolagem).toBe('branco');
  });

  it('devolve a barra padrão ao sair da página', () => {
    const { unmount } = render(<Pagina fundos={['escuro']} />);
    unmount();
    expect(document.documentElement.dataset.rolagem).toBeUndefined();
  });
});
