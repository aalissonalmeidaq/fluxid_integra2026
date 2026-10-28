import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TRACKING_POLL_INTERVAL_MS, watchTracking, type TrackingRealtimePort, type TrackingSignal } from './tracking-realtime';

// Spec 015 (T020; RF-041, contrato "Invalidação em tempo real"): o aviso do canal privado `tracking:<organização>` faz a tela consultar
// de novo; no detalhe, só avisos da viagem aberta contam. Sem o canal, consulta a cada 30 s. O aviso nunca traz coordenada.
function fakePort() {
  let onSignal: (s: TrackingSignal) => void = () => undefined;
  let onStatus: (s: 'connected' | 'disconnected') => void = () => undefined;
  const unsubscribe = vi.fn();
  const port: TrackingRealtimePort & { subscribe: ReturnType<typeof vi.fn> } = {
    subscribe: vi.fn((_topic: string, signal: (s: TrackingSignal) => void, status: (s: 'connected' | 'disconnected') => void) => {
      onSignal = signal;
      onStatus = status;
      return unsubscribe;
    }),
  };
  return { port, unsubscribe, emit: (s: TrackingSignal) => onSignal(s), status: (s: 'connected' | 'disconnected') => onStatus(s) };
}

beforeEach(() => vi.useFakeTimers({ now: new Date('2026-10-22T15:00:00Z') }));
afterEach(() => vi.useRealTimers());

describe('watchTracking', () => {
  it('assina o canal privado da organização', () => {
    const f = fakePort();
    watchTracking({ port: f.port, organizationId: 'org-a', onChange: vi.fn() });
    expect(f.port.subscribe).toHaveBeenCalledWith('tracking:org-a', expect.any(Function), expect.any(Function));
  });

  it('na lista, qualquer aviso da organização pede nova consulta', () => {
    const f = fakePort();
    const onChange = vi.fn();
    const watch = watchTracking({ port: f.port, organizationId: 'org-a', onChange });
    f.status('connected');
    f.emit({ kind: 'position', tripId: 't1' });
    expect(onChange).toHaveBeenCalledWith({ kind: 'position', tripId: 't1' });
    expect(watch.state()).toEqual({ mode: 'realtime', lastUpdate: new Date('2026-10-22T15:00:00Z') });
  });

  it('no detalhe, avisos de outras viagens são ignorados', () => {
    const f = fakePort();
    const onChange = vi.fn();
    watchTracking({ port: f.port, organizationId: 'org-a', tripId: 't1', onChange });
    f.status('connected');
    f.emit({ kind: 'position', tripId: 't2' });
    expect(onChange).not.toHaveBeenCalled();
    f.emit({ kind: 'session', tripId: 't1' });
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('sem o canal, consulta a cada 30 s; conectado, para; caiu, volta a consultar', () => {
    const f = fakePort();
    const onChange = vi.fn();
    const watch = watchTracking({ port: f.port, organizationId: 'org-a', onChange });
    vi.advanceTimersByTime(TRACKING_POLL_INTERVAL_MS);
    expect(onChange).toHaveBeenLastCalledWith(null);
    expect(watch.state().mode).toBe('polling');
    f.status('connected');
    onChange.mockClear();
    vi.advanceTimersByTime(TRACKING_POLL_INTERVAL_MS * 3);
    expect(onChange).not.toHaveBeenCalled();
    f.status('disconnected');
    vi.advanceTimersByTime(TRACKING_POLL_INTERVAL_MS);
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('parar cancela a assinatura e nenhum aviso posterior chega', () => {
    const f = fakePort();
    const onChange = vi.fn();
    const watch = watchTracking({ port: f.port, organizationId: 'org-a', onChange });
    watch.stop();
    f.emit({ kind: 'position', tripId: 't1' });
    vi.advanceTimersByTime(TRACKING_POLL_INTERVAL_MS * 2);
    expect(f.unsubscribe).toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
  });
});
