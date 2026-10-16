import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { Apresentacao } from './apresentacao';

// Controles da apresentação em slides (pedido de 15/10/2026): indicador "n / total" com o nome da seção, botões de anterior e próximo e as
// teclas de apresentação (setas, PageUp/PageDown e espaço), só no computador e sem roubar a tecla de um campo ou botão em foco.
const TELA = 900;

function paginaDeTres(): HTMLElement {
  const { container } = render(
    <>
      <section id="inicio" data-slide />
      <section id="historia">
        <div data-slide />
        <div data-slide>
          <input type="range" aria-label="Perdas" />
          <button type="button">Ação</button>
        </div>
      </section>
      <Apresentacao />
    </>,
  );
  const slides = [...container.querySelectorAll<HTMLElement>('[data-slide]')];
  slides.forEach((slide, indice) => {
    slide.getBoundingClientRect = () => ({ top: indice * TELA - window.scrollY, bottom: (indice + 1) * TELA - window.scrollY, height: TELA, left: 0, right: 0, width: 0, x: 0, y: 0, toJSON: () => ({}) });
  });
  fireEvent.scroll(window);
  return container;
}

let rolar: ReturnType<typeof vi.fn>;
let computador = true;

beforeEach(() => {
  computador = true;
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: TELA });
  Object.defineProperty(window, 'scrollY', { configurable: true, value: 0 });
  window.matchMedia = vi.fn((consulta: string) => ({
    matches: consulta.includes('min-width') ? computador : false,
    media: consulta,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
  // A rolagem simulada chega na hora ao destino, como no navegador com movimento reduzido.
  rolar = vi.fn(({ top }: ScrollToOptions) => posicionar(top ?? 0));
  window.scrollTo = rolar as unknown as typeof window.scrollTo;
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function posicionar(topo: number): void {
  Object.defineProperty(window, 'scrollY', { configurable: true, value: topo });
  window.dispatchEvent(new Event('scroll'));
}

describe('Apresentacao', () => {
  it('mostra em que slide a pessoa está, de quantos, e o nome da seção', async () => {
    paginaDeTres();
    const nav = screen.getByRole('navigation', { name: 'Slides da apresentação' });
    expect(await within(nav).findByText('1 / 3')).toBeInTheDocument();
    expect(within(nav).getByText('FluxID')).toBeInTheDocument();
    expect(within(nav).getByRole('button', { name: 'Slide anterior' })).toBeDisabled();
    expect(within(nav).getByRole('button', { name: 'Próximo slide' })).toBeEnabled();
  });

  it('o botão de próximo e as teclas de apresentação levam ao início do slide seguinte', async () => {
    paginaDeTres();
    // A posição é medida no quadro seguinte à rolagem.
    await screen.findByText('1 / 3');
    fireEvent.click(screen.getByRole('button', { name: 'Próximo slide' }));
    expect(rolar).toHaveBeenLastCalledWith(expect.objectContaining({ top: TELA }));
    for (const key of ['ArrowDown', 'PageDown', ' ']) {
      posicionar(0);
      rolar.mockClear();
      fireEvent.keyDown(document.body, { key });
      expect(rolar, key).toHaveBeenLastCalledWith(expect.objectContaining({ top: TELA }));
    }
  });

  it('depois do último slide, o próximo passo desce até o fim da página (o rodapé não é slide, mas precisa ser alcançado)', async () => {
    paginaDeTres();
    Object.defineProperty(document.documentElement, 'scrollHeight', { configurable: true, value: TELA * 3 + 200 });
    posicionar(TELA * 2);
    await screen.findByText('3 / 3');
    fireEvent.keyDown(document.body, { key: 'ArrowDown' });
    expect(rolar).toHaveBeenLastCalledWith(expect.objectContaining({ top: TELA * 2 + 200 }));
    // E volta ao último slide.
    fireEvent.keyDown(document.body, { key: 'ArrowUp' });
    expect(rolar).toHaveBeenLastCalledWith(expect.objectContaining({ top: TELA * 2 }));
  });

  it('não rouba a tecla de quem está num campo ou botão: a seta muda o controle deslizante e o espaço aciona o botão', () => {
    paginaDeTres();
    fireEvent.keyDown(screen.getByRole('slider', { name: 'Perdas' }), { key: 'ArrowDown' });
    fireEvent.keyDown(screen.getByRole('button', { name: 'Ação' }), { key: ' ' });
    fireEvent.keyDown(document.body, { key: 'ArrowDown', ctrlKey: true });
    expect(rolar).not.toHaveBeenCalled();
  });

  it('cada gesto da roda ou do trackpad avança um slide; os eventos do mesmo gesto (a inércia) não pulam outros', async () => {
    vi.useFakeTimers({ toFake: ['performance', 'Date', 'setTimeout', 'clearTimeout'] });
    paginaDeTres();
    await vi.waitFor(() => expect(screen.getByText('1 / 3')).toBeInTheDocument());
    const roda = (deltaY: number, extra: Partial<WheelEventInit> = {}): boolean => fireEvent.wheel(window, { deltaY, ...extra });
    expect(roda(40)).toBe(false); // a página assume o gesto (preventDefault)
    expect(rolar).toHaveBeenLastCalledWith(expect.objectContaining({ top: TELA }));
    // A inércia do mesmo gesto chega em sequência: não leva a outro slide.
    vi.advanceTimersByTime(30);
    roda(30);
    vi.advanceTimersByTime(30);
    roda(20);
    expect(rolar).toHaveBeenCalledTimes(1);
    // Um gesto novo, depois de uma pausa, leva ao slide seguinte.
    vi.advanceTimersByTime(300);
    roda(60);
    expect(rolar).toHaveBeenLastCalledWith(expect.objectContaining({ top: TELA * 2 }));
    // Para cima volta.
    vi.advanceTimersByTime(300);
    roda(-60);
    expect(rolar).toHaveBeenLastCalledWith(expect.objectContaining({ top: TELA }));
  });

  it('a roda com Ctrl (zoom) e a roda de lado ficam com o navegador', async () => {
    paginaDeTres();
    await screen.findByText('1 / 3');
    expect(fireEvent.wheel(window, { deltaY: 100, ctrlKey: true })).toBe(true);
    expect(fireEvent.wheel(window, { deltaX: 120, deltaY: 10 })).toBe(true);
    expect(rolar).not.toHaveBeenCalled();
  });

  it('abaixo de 1024 px a roda e as teclas ficam com o navegador (no celular a rolagem é livre)', () => {
    computador = false;
    paginaDeTres();
    expect(fireEvent.wheel(window, { deltaY: 100 })).toBe(true);
    expect(rolar).not.toHaveBeenCalled();
  });

  it('abaixo de 1024 px as teclas ficam com o navegador (no celular a rolagem é livre)', () => {
    computador = false;
    paginaDeTres();
    fireEvent.keyDown(document.body, { key: 'ArrowDown' });
    expect(rolar).not.toHaveBeenCalled();
  });
});

// O indicador não fica por cima da informação (pedido de 16/10/2026): depois de um tempo sem mexer no mouse, na roda ou no teclado, ele se
// recolhe; volta com qualquer movimento. Com o foco de teclado dentro dele, o CSS o mantém à vista (landing.css).
describe('Apresentação: indicador que se recolhe', () => {
  it('recolhe depois de 3 s sem atividade e volta ao mexer o mouse, a roda ou o teclado', () => {
    vi.useFakeTimers();
    paginaDeTres();
    const indicador = screen.getByRole('navigation', { name: 'Slides da apresentação' });
    expect(indicador).toHaveAttribute('data-ocioso', 'false');
    act(() => {
      vi.advanceTimersByTime(2_999);
    });
    expect(indicador).toHaveAttribute('data-ocioso', 'false');
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(indicador).toHaveAttribute('data-ocioso', 'true');
    fireEvent.pointerMove(window);
    expect(indicador).toHaveAttribute('data-ocioso', 'false');
    act(() => {
      vi.advanceTimersByTime(3_000);
    });
    fireEvent.keyDown(window, { key: 'Shift' });
    expect(indicador).toHaveAttribute('data-ocioso', 'false');
  });
});
