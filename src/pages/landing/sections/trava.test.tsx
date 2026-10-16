import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TEXTOS } from '../landing-content';
import { INTERVALO_DA_TROCA, Trava } from './trava';

// Troca automática dos momentos da trava (pedidos de 15/10/2026): a demonstração anda sozinha a cada 10 s, em ciclo, sem barra de tempo.
// Escolher um momento reinicia a contagem a partir dele, e o botão pausa e retoma a troca (WCAG 2.2.2).
describe('Trava: troca automática dos momentos', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const botoes = (): HTMLElement[] => within(screen.getByRole('group', { name: TEXTOS.trava.rotuloEstados })).getAllByRole('button');
  const escolhido = (): number => botoes().findIndex((botao) => botao.getAttribute('aria-pressed') === 'true');
  const esperar = (ms: number): void => {
    act(() => {
      vi.advanceTimersByTime(ms);
    });
  };

  it('a cada 10 s passa ao próximo momento e volta ao primeiro depois do último', () => {
    render(<Trava />);
    expect(INTERVALO_DA_TROCA).toBe(10_000);
    expect(escolhido()).toBe(0);
    esperar(INTERVALO_DA_TROCA - 1);
    expect(escolhido()).toBe(0);
    esperar(1);
    expect(escolhido()).toBe(1);
    esperar(INTERVALO_DA_TROCA);
    expect(escolhido()).toBe(2);
    esperar(INTERVALO_DA_TROCA);
    expect(escolhido()).toBe(0);
  });

  it('enquanto troca sozinho, o texto do momento não é anunciado a cada volta; escolhido pela pessoa, é', () => {
    const { container } = render(<Trava />);
    const anuncio = (): Element | null => container.querySelector('[data-momentos]');
    expect(anuncio()).toHaveAttribute('aria-live', 'off');
    fireEvent.click(botoes()[1]!);
    expect(anuncio()).toHaveAttribute('aria-live', 'polite');
    esperar(INTERVALO_DA_TROCA);
    expect(anuncio()).toHaveAttribute('aria-live', 'off');
  });

  it('escolher um momento reinicia a contagem: o próximo vem 10 s depois da escolha', () => {
    const { container } = render(<Trava />);
    esperar(INTERVALO_DA_TROCA - 2_000);
    fireEvent.click(botoes()[2]!);
    esperar(INTERVALO_DA_TROCA - 1);
    expect(escolhido()).toBe(2);
    esperar(1);
    expect(escolhido()).toBe(0);
    // Sem barra de tempo na tela.
    expect(container.querySelector('.landing-troca-progresso')).toBeNull();
  });

  it('o botão pausa e retoma a troca', () => {
    render(<Trava />);
    fireEvent.click(screen.getByRole('button', { name: TEXTOS.trava.pausarTroca }));
    esperar(INTERVALO_DA_TROCA * 2);
    expect(escolhido()).toBe(0);
    fireEvent.click(screen.getByRole('button', { name: TEXTOS.trava.retomarTroca }));
    esperar(INTERVALO_DA_TROCA);
    expect(escolhido()).toBe(1);
  });

  it('com "reduzir movimento", não troca sozinho, mas a troca pode ser ligada pelo botão', () => {
    const original = window.matchMedia;
    window.matchMedia = ((consulta: string) => ({ matches: consulta.includes('reduce'), media: consulta, addEventListener: () => undefined, removeEventListener: () => undefined })) as unknown as typeof window.matchMedia;
    try {
      render(<Trava />);
      esperar(INTERVALO_DA_TROCA * 2);
      expect(escolhido()).toBe(0);
      fireEvent.click(screen.getByRole('button', { name: TEXTOS.trava.retomarTroca }));
      esperar(INTERVALO_DA_TROCA);
      expect(escolhido()).toBe(1);
    } finally {
      window.matchMedia = original;
    }
  });
});
