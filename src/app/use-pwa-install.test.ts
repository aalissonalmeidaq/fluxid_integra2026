import { beforeEach, describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { resetPwaInstallForTests, usePwaInstall } from './use-pwa-install';

beforeEach(() => resetPwaInstallForTests());

describe('usePwaInstall hook', () => {
  it('inicializa como não instalável e não instalado', () => {
    const { result } = renderHook(() => usePwaInstall());
    expect(result.current.isInstallable).toBe(false);
    expect(result.current.isInstalled).toBe(false);
  });

  it('captura evento beforeinstallprompt e gerencia fluxo de prompt aceito', async () => {
    const { result } = renderHook(() => usePwaInstall());

    const promptMock = vi.fn().mockResolvedValue(undefined);
    const mockEvent = new Event('beforeinstallprompt') as Event & {
      prompt: () => Promise<void>;
      userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
    };
    mockEvent.prompt = promptMock;
    mockEvent.userChoice = Promise.resolve({ outcome: 'accepted' });

    act(() => {
      window.dispatchEvent(mockEvent);
    });

    expect(result.current.isInstallable).toBe(true);

    await act(async () => {
      await result.current.promptInstall();
    });

    expect(promptMock).toHaveBeenCalled();
    expect(result.current.isInstalled).toBe(true);
    expect(result.current.isInstallable).toBe(false);
  });

  it('captura evento appinstalled', () => {
    const { result } = renderHook(() => usePwaInstall());

    act(() => {
      window.dispatchEvent(new Event('appinstalled'));
    });

    expect(result.current.isInstalled).toBe(true);
    expect(result.current.isInstallable).toBe(false);
  });

  it('não dispara prompt se deferredPrompt for nulo', async () => {
    const { result } = renderHook(() => usePwaInstall());
    await act(async () => {
      await result.current.promptInstall();
    });
    expect(result.current.isInstalled).toBe(false);
  });

  it('guarda o convite do navegador para quem monta depois (o evento dispara uma única vez, antes do login)', async () => {
    const promptMock = vi.fn().mockResolvedValue(undefined);
    const mockEvent = Object.assign(new Event('beforeinstallprompt'), { prompt: promptMock, userChoice: Promise.resolve({ outcome: 'dismissed' as const }) });
    // O evento chega com a tela de entrada aberta; a tela seguinte (barra superior) monta o hook depois.
    const entrada = renderHook(() => usePwaInstall());
    act(() => { window.dispatchEvent(mockEvent); });
    expect(entrada.result.current.isInstallable).toBe(true);
    entrada.unmount();

    const barra = renderHook(() => usePwaInstall());
    expect(barra.result.current.isInstallable).toBe(true);
    await act(async () => { await barra.result.current.promptInstall(); });
    expect(promptMock).toHaveBeenCalledTimes(1);
    expect(barra.result.current.isInstallable).toBe(false);
  });

  it('o convite guardado antes de qualquer hook montar também vale', () => {
    const mockEvent = Object.assign(new Event('beforeinstallprompt'), { prompt: vi.fn(), userChoice: Promise.resolve({ outcome: 'dismissed' as const }) });
    window.dispatchEvent(mockEvent);
    const { result } = renderHook(() => usePwaInstall());
    expect(result.current.isInstallable).toBe(true);
  });
});
