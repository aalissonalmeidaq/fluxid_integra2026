import { describe, expect, it } from 'vitest';
import { createBrowserPush, describeDevice } from './push-manager';

// Spec 012 (T054; RF-036b; caso de borda do iPhone): suporte a notificações e rótulo do aparelho.
const fakeWindow = (userAgent: string, extras: Record<string, unknown>, standalone = false) => ({
  navigator: { userAgent, ...('serviceWorker' in extras ? { serviceWorker: extras.serviceWorker } : {}) },
  matchMedia: () => ({ matches: standalone }),
  ...extras,
}) as unknown as Window;

describe('push-manager', () => {
  it('rótulo legível do aparelho', () => {
    expect(describeDevice('Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36')).toBe('Chrome no Android');
    expect(describeDevice('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1')).toBe('Safari no iPhone');
    expect(describeDevice('Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/130.0 Safari/537.36 Edg/130.0')).toBe('Edge no Windows');
  });

  it('com service worker, PushManager e Notification: suportado', () => {
    const win = fakeWindow('Chrome/130 Android', { serviceWorker: {}, PushManager: {}, Notification: {} });
    expect(createBrowserPush(win).support()).toBe('supported');
  });

  it('iPhone fora da tela de início: pede a instalação; outro navegador sem suporte: sem suporte', () => {
    expect(createBrowserPush(fakeWindow('iPhone Safari', {})).support()).toBe('install_required');
    expect(createBrowserPush(fakeWindow('Navegador antigo', {})).support()).toBe('unsupported');
  });
});
