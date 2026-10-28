import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCapacitorLocationAdapter, type FluxidTrackingPlugin } from './capacitor-location-adapter';

// Spec 015 (T050; RF-007a a RF-007c): no Android, a coleta é do serviço em primeiro plano. O adaptador pede a localização e, no Android
// 13+, a notificação, no contexto da viagem; recusa de localização degrada sem bloquear; recusa da notificação vira "visibilidade
// reduzida". As posições guardadas pelo serviço enquanto a tela estava parada são recolhidas em ordem. Sem regra de proximidade aqui.
function plugin(options: { location?: 'granted' | 'denied'; notifications?: 'granted' | 'denied'; buffered?: unknown[][] } = {}) {
  const batches = [...(options.buffered ?? [])];
  const value: FluxidTrackingPlugin & Record<string, ReturnType<typeof vi.fn>> = {
    checkPermissions: vi.fn(async () => ({ location: 'prompt', notifications: 'prompt' })),
    requestPermissions: vi.fn(async ({ permissions }: { permissions: ('location' | 'notifications')[] }) => ({
      location: permissions.includes('location') ? options.location ?? 'granted' : 'prompt',
      notifications: permissions.includes('notifications') ? options.notifications ?? 'granted' : 'prompt',
    })),
    start: vi.fn(async () => ({ running: true })),
    stop: vi.fn(async () => undefined),
    drain: vi.fn(async () => ({ positions: batches.shift() ?? [] })),
  } as never;
  return value;
}
const fix = (seconds: number) => ({ observedAt: new Date(Date.UTC(2026, 9, 22, 12, 0, seconds)).toISOString(), latitude: -7.23, longitude: -39.31, accuracyM: 9 });

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('coleta pelo Android', () => {
  it('pede localização e notificação, liga o serviço e declara a coleta completa', async () => {
    const p = plugin();
    const adapter = createCapacitorLocationAdapter(p, { androidSdk: 34 });
    const state = await adapter.start({ intervalSeconds: 60 });
    expect(p.requestPermissions).toHaveBeenCalledWith({ permissions: ['location'] });
    expect(p.requestPermissions).toHaveBeenCalledWith({ permissions: ['notifications'] });
    expect(p.start).toHaveBeenCalledWith({ intervalSeconds: 60 });
    expect(state).toEqual({ platform: 'android_native', capability: 'full', collecting: true, degradation: null });
  });

  it('Android 12 ou anterior não pede a permissão de notificação', async () => {
    const p = plugin();
    await createCapacitorLocationAdapter(p, { androidSdk: 31 }).start({ intervalSeconds: 60 });
    expect(p.requestPermissions).toHaveBeenCalledTimes(1);
  });

  it('localização negada: não liga o serviço e degrada, sem lançar erro', async () => {
    const p = plugin({ location: 'denied' });
    const state = await createCapacitorLocationAdapter(p, { androidSdk: 34 }).start({ intervalSeconds: 60 });
    expect(p.start).not.toHaveBeenCalled();
    expect(state).toEqual({ platform: 'android_native', capability: 'denied', collecting: false, degradation: 'denied' });
  });

  it('notificação recusada no Android 13+: o serviço roda, com visibilidade reduzida', async () => {
    const p = plugin({ notifications: 'denied' });
    const state = await createCapacitorLocationAdapter(p, { androidSdk: 34 }).start({ intervalSeconds: 60 });
    expect(p.start).toHaveBeenCalled();
    expect(state).toEqual({ platform: 'android_native', capability: 'full', collecting: true, degradation: 'notifications_denied' });
  });

  it('recolhe as posições guardadas pelo serviço, em ordem, periodicamente', async () => {
    const p = plugin({ buffered: [[fix(0), fix(60)], [fix(120)]] });
    const adapter = createCapacitorLocationAdapter(p, { androidSdk: 34, drainEveryMs: 15_000 });
    const received: string[] = [];
    adapter.onPosition((position) => received.push(position.observedAt));
    await adapter.start({ intervalSeconds: 60 });
    await vi.advanceTimersByTimeAsync(15_000);
    await vi.advanceTimersByTimeAsync(15_000);
    expect(received).toEqual([fix(0), fix(60), fix(120)].map((x) => x.observedAt));
  });

  it('item malformado vindo do serviço é descartado', async () => {
    const p = plugin({ buffered: [[{ observedAt: 'ontem', latitude: 'x' }, fix(0)]] });
    const adapter = createCapacitorLocationAdapter(p, { androidSdk: 34, drainEveryMs: 15_000 });
    const received = vi.fn();
    adapter.onPosition(received);
    await adapter.start({ intervalSeconds: 60 });
    await vi.advanceTimersByTimeAsync(15_000);
    expect(received).toHaveBeenCalledTimes(1);
  });

  it('parar desliga o serviço, recolhe o que restou e para o recolhimento', async () => {
    const p = plugin({ buffered: [[fix(0)]] });
    const adapter = createCapacitorLocationAdapter(p, { androidSdk: 34, drainEveryMs: 15_000 });
    const received = vi.fn();
    adapter.onPosition(received);
    await adapter.start({ intervalSeconds: 60 });
    await adapter.stop();
    expect(p.stop).toHaveBeenCalled();
    expect(received).toHaveBeenCalledTimes(1);
    vi.mocked(p.drain).mockClear();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(p.drain).not.toHaveBeenCalled();
    expect(adapter.state().collecting).toBe(false);
  });
});
