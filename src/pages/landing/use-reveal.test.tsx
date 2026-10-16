import { useRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render } from '@testing-library/react';
import { useReveal } from './use-reveal';

// Spec 011, T038 (RF-012): a revelação das seções é opcional. Com "reduzir movimento" nenhum observador nasce e tudo fica visível;
// sem a preferência, o que está abaixo da tela espera e aparece ao entrar; sem IntersectionObserver, tudo fica visível.
type Retorno = (entradas: Array<{ target: Element; isIntersecting: boolean }>) => void;
let retorno: Retorno | null = null;
let criados = 0;
const desconectar = vi.fn();

class ObservadorFalso {
  constructor(callback: Retorno) {
    retorno = callback;
    criados += 1;
  }
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = desconectar;
}

function Pagina() {
  const raiz = useRef<HTMLDivElement>(null);
  useReveal(raiz);
  return (
    <div ref={raiz}>
      <p data-revelar data-testid="acima">acima da dobra</p>
      <p data-revelar data-testid="abaixo">abaixo da dobra</p>
    </div>
  );
}

const preferencia = (reduzir: boolean): void => {
  vi.stubGlobal('matchMedia', (consulta: string) => ({ matches: reduzir && consulta.includes('reduce'), media: consulta, addEventListener: () => undefined, removeEventListener: () => undefined }));
};

beforeEach(() => {
  retorno = null;
  criados = 0;
  desconectar.mockClear();
  vi.stubGlobal('IntersectionObserver', ObservadorFalso);
  // O parágrafo "abaixo" está fora da tela; o "acima" está dentro.
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    const top = this.getAttribute('data-testid') === 'abaixo' ? 5000 : 10;
    return { top, bottom: top + 20, left: 0, right: 100, width: 100, height: 20, x: 0, y: top, toJSON: () => ({}) };
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('useReveal', () => {
  it('com "reduzir movimento": nenhum observador e nenhum elemento escondido', () => {
    preferencia(true);
    const { getByTestId } = render(<Pagina />);
    expect(criados).toBe(0);
    expect(getByTestId('abaixo').getAttribute('data-revelar')).not.toBe('pendente');
    expect(getByTestId('acima').getAttribute('data-revelar')).not.toBe('pendente');
  });

  it('sem a preferência: o que está acima da dobra aparece de imediato e o que está abaixo espera', () => {
    preferencia(false);
    const { getByTestId } = render(<Pagina />);
    expect(getByTestId('acima').getAttribute('data-revelar')).toBe('visivel');
    expect(getByTestId('abaixo').getAttribute('data-revelar')).toBe('pendente');
  });

  it('ao entrar na tela, o elemento passa a visível', () => {
    preferencia(false);
    const { getByTestId } = render(<Pagina />);
    act(() => { retorno?.([{ target: getByTestId('abaixo'), isIntersecting: true }]); });
    expect(getByTestId('abaixo').getAttribute('data-revelar')).toBe('visivel');
  });

  it('sem IntersectionObserver, nada fica escondido', () => {
    preferencia(false);
    vi.stubGlobal('IntersectionObserver', undefined);
    const { getByTestId } = render(<Pagina />);
    expect(getByTestId('abaixo').getAttribute('data-revelar')).not.toBe('pendente');
  });

  it('ao desmontar, o observador é desconectado', () => {
    preferencia(false);
    const { unmount } = render(<Pagina />);
    unmount();
    expect(desconectar).toHaveBeenCalled();
  });
});
