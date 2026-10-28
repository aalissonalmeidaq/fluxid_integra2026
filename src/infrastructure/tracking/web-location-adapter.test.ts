import { describe, expect, it, vi } from 'vitest';
import { createWebLocationAdapter, type WebLocationEnv } from './web-location-adapter';

// Spec 015 (T037; RF-007a, RF-007c, plan.md item 1): no navegador/PWA a coleta só acontece com a página visível (watchPosition); por isso a
// capacidade é sempre "só com o aplicativo aberto" (degradada). Página oculta para a coleta; voltar a mostrar retoma; localização negada
// ou indisponível degrada sem bloquear a viagem. Entrega no máximo uma posição por intervalo.
function env(options: { secure?: boolean; supported?: boolean } = {}) {
  let success: PositionCallback = () => undefined;
  let failure: PositionErrorCallback = () => undefined;
  let visibility: DocumentVisibilityState = 'visible';
  const listeners: (() => void)[] = [];
  const geolocation = {
    watchPosition: vi.fn((ok: PositionCallback, error?: PositionErrorCallback | null) => { success = ok; failure = error ?? (() => undefined); return 7; }),
    clearWatch: vi.fn(),
    getCurrentPosition: vi.fn(),
  };
  const value: WebLocationEnv = {
    geolocation: options.supported === false ? undefined : geolocation as unknown as Geolocation,
    isSecureContext: options.secure ?? true,
    visibility: () => visibility,
    onVisibilityChange: (listener) => { listeners.push(listener); return () => undefined; },
  };
  const fix = (seconds: number, accuracy = 12) => success({
    coords: { latitude: -7.23, longitude: -39.31, accuracy } as GeolocationCoordinates, timestamp: Date.UTC(2026, 9, 22, 12, 0, seconds),
  } as GeolocationPosition);
  return {
    value, geolocation, fix,
    deny: () => failure({ code: 1, PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3, message: 'negado' } as GeolocationPositionError),
    hide: () => { visibility = 'hidden'; listeners.forEach((l) => l()); },
    show: () => { visibility = 'visible'; listeners.forEach((l) => l()); },
  };
}

describe('coleta pelo navegador', () => {
  it('começa com watchPosition em alta precisão e declara a coleta só com a página aberta', async () => {
    const e = env();
    const adapter = createWebLocationAdapter(e.value);
    const state = await adapter.start({ intervalSeconds: 60 });
    expect(e.geolocation.watchPosition).toHaveBeenCalledWith(expect.any(Function), expect.any(Function), expect.objectContaining({ enableHighAccuracy: true, maximumAge: 0 }));
    expect(state).toEqual({ platform: 'web_visible', capability: 'foreground_only', collecting: true, degradation: 'foreground_only' });
  });

  it('entrega no máximo uma posição por intervalo, com o horário do sensor', async () => {
    const e = env();
    const adapter = createWebLocationAdapter(e.value);
    const received: string[] = [];
    adapter.onPosition((p) => received.push(p.observedAt));
    await adapter.start({ intervalSeconds: 60 });
    e.fix(0); e.fix(20); e.fix(50); e.fix(61);
    expect(received).toEqual([new Date(Date.UTC(2026, 9, 22, 12, 0, 0)).toISOString(), new Date(Date.UTC(2026, 9, 22, 12, 1, 1)).toISOString()]);
  });

  it('página oculta para a coleta; ao voltar, retoma', async () => {
    const e = env();
    const adapter = createWebLocationAdapter(e.value);
    await adapter.start({ intervalSeconds: 60 });
    e.hide();
    expect(e.geolocation.clearWatch).toHaveBeenCalledWith(7);
    expect(adapter.state().collecting).toBe(false);
    e.show();
    expect(e.geolocation.watchPosition).toHaveBeenCalledTimes(2);
    expect(adapter.state().collecting).toBe(true);
  });

  it('localização negada degrada sem lançar erro e avisa quem acompanha', async () => {
    const e = env();
    const adapter = createWebLocationAdapter(e.value);
    const changes = vi.fn();
    adapter.onStateChange(changes);
    await adapter.start({ intervalSeconds: 60 });
    e.deny();
    expect(adapter.state()).toEqual({ platform: 'web_visible', capability: 'denied', collecting: false, degradation: 'denied' });
    expect(changes).toHaveBeenLastCalledWith(expect.objectContaining({ capability: 'denied' }));
    e.hide(); e.show();
    expect(e.geolocation.watchPosition).toHaveBeenCalledTimes(1);
  });

  it('sem geolocalização ou fora de contexto seguro: indisponível', async () => {
    expect(await createWebLocationAdapter(env({ supported: false }).value).start({ intervalSeconds: 60 }))
      .toEqual({ platform: 'web_visible', capability: 'unavailable', collecting: false, degradation: 'unavailable' });
    expect((await createWebLocationAdapter(env({ secure: false }).value).start({ intervalSeconds: 60 })).capability).toBe('unavailable');
  });

  it('parar limpa a observação e nada mais é entregue', async () => {
    const e = env();
    const adapter = createWebLocationAdapter(e.value);
    const received = vi.fn();
    adapter.onPosition(received);
    await adapter.start({ intervalSeconds: 60 });
    await adapter.stop();
    e.fix(0);
    expect(e.geolocation.clearWatch).toHaveBeenCalledWith(7);
    expect(received).not.toHaveBeenCalled();
  });
});
