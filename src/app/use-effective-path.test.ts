import { describe, expect, it } from 'vitest';
import { isInstalledApp, resolveEffectivePath } from './use-effective-path';

// Spec 011: o app instalado nunca abre a landing. Spec 015 (validação humana de 27/10/2026): a casca Android (Capacitor) também é app
// instalado, então abre direto na entrada, mesmo sem o modo standalone do PWA.
describe('caminho efetivo', () => {
  it('a raiz do app instalado vai para a Visão geral (que pede a entrada a quem não autenticou); no navegador, mostra a landing', () => {
    expect(resolveEffectivePath('/', false, true)).toBe('/visao-geral');
    expect(resolveEffectivePath('/', false, false)).toBe('/');
    expect(resolveEffectivePath('/login', true, false)).toBe('/visao-geral');
  });

  it('a casca nativa conta como app instalado, mesmo sem o modo standalone', () => {
    const notStandalone = () => ({ matches: false }) as MediaQueryList;
    expect(isInstalledApp({ matchMedia: notStandalone, native: true })).toBe(true);
    expect(isInstalledApp({ matchMedia: notStandalone, native: false })).toBe(false);
    expect(isInstalledApp({ matchMedia: () => ({ matches: true }) as MediaQueryList, native: false })).toBe(true);
    expect(isInstalledApp({ matchMedia: undefined, native: false })).toBe(false);
  });

  // A casca nativa publica `window.Capacitor` antes do aplicativo carregar: lê-se o global, sem levar o pacote do Capacitor para o
  // carregamento inicial da landing e da entrada.
  it('sem ambiente informado, reconhece a casca nativa pelo global do Capacitor', () => {
    const global = globalThis as { Capacitor?: unknown };
    try {
      global.Capacitor = { isNativePlatform: () => true };
      expect(isInstalledApp()).toBe(true);
      global.Capacitor = { isNativePlatform: () => false };
      expect(isInstalledApp()).toBe(false);
    } finally {
      delete global.Capacitor;
    }
    expect(isInstalledApp()).toBe(false);
  });
});
