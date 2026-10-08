import { afterEach, describe, expect, it, vi } from 'vitest';
import { closeModal, isPlainClick, navigateInApp } from './registry-navigation';

afterEach(() => {
  window.history.replaceState(null, '', '/');
});

describe('navegação interna dos cadastros', () => {
  it('acrescenta uma entrada ao histórico, troca o endereço e avisa quem escuta', () => {
    const listener = vi.fn();
    window.addEventListener('fluxid:navigate', listener);
    navigateInApp('/clientes/novo');
    window.removeEventListener('fluxid:navigate', listener);
    expect(window.location.pathname).toBe('/clientes/novo');
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('com replace, troca a entrada atual e mantém a consulta do endereço', () => {
    const before = window.history.length;
    navigateInApp('/geocercas/nova?unidade=abc', { replace: true });
    expect(window.history.length).toBe(before);
    expect(window.location.pathname + window.location.search).toBe('/geocercas/nova?unidade=abc');
  });

  it('fechar um modal aberto de dentro do app volta uma entrada do histórico', () => {
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => undefined);
    navigateInApp('/clientes/novo', { modal: true });
    closeModal('/clientes');
    expect(back).toHaveBeenCalledTimes(1);
    back.mockRestore();
  });

  it('fechar um modal aberto por link direto vai ao endereço pai, sem acrescentar entrada', () => {
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => undefined);
    window.history.replaceState(null, '', '/clientes/novo');
    const before = window.history.length;
    closeModal('/clientes');
    expect(back).not.toHaveBeenCalled();
    expect(window.location.pathname).toBe('/clientes');
    expect(window.history.length).toBe(before);
    back.mockRestore();
  });

  it('só trata como navegação interna o clique simples em âncora da mesma origem', () => {
    const anchor = document.createElement('a');
    anchor.href = '/clientes/novo';
    const click = (init: MouseEventInit): MouseEvent => new MouseEvent('click', { button: 0, ...init });
    expect(isPlainClick(click({}), anchor)).toBe(true);
    expect(isPlainClick(click({ ctrlKey: true }), anchor)).toBe(false);
    expect(isPlainClick(click({ metaKey: true }), anchor)).toBe(false);
    expect(isPlainClick(click({ shiftKey: true }), anchor)).toBe(false);
    expect(isPlainClick(click({ button: 1 }), anchor)).toBe(false);
    anchor.target = '_blank';
    expect(isPlainClick(click({}), anchor)).toBe(false);
    const external = document.createElement('a');
    external.href = 'https://outro.example/clientes/novo';
    expect(isPlainClick(click({}), external)).toBe(false);
  });
});
