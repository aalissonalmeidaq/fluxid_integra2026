import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { watchSeals, type RealtimePort, type SealSignal } from './seal-realtime';

// Spec 012 (T038; RNF-001, research.md item 7): o aviso em tempo real faz a tela consultar de novo; sem o canal, a tela consulta a cada
// 30 s e volta ao tempo real quando ele reconecta. Nada fica guardado no aparelho.
function fakePort() {
  let onSignal: (s: SealSignal) => void = () => undefined;
  let onStatus: (s: 'connected' | 'disconnected') => void = () => undefined;
  const unsubscribe = vi.fn();
  const port: RealtimePort & { subscribe: ReturnType<typeof vi.fn> } = {
    subscribe: vi.fn((_topic: string, signal: (s: SealSignal) => void, status: (s: 'connected' | 'disconnected') => void) => {
      onSignal = signal;
      onStatus = status;
      return unsubscribe;
    }),
  };
  return { port, unsubscribe, emit: (s: SealSignal) => onSignal(s), status: (s: 'connected' | 'disconnected') => onStatus(s) };
}

beforeEach(() => vi.useFakeTimers({ now: new Date('2026-10-17T14:00:00Z') }));
afterEach(() => { vi.useRealTimers(); localStorage.clear(); });

describe('watchSeals', () => {
  it('assina o canal privado da organização', () => {
    const f = fakePort();
    watchSeals({ port: f.port, organizationId: 'org-a', onChange: vi.fn() });
    expect(f.port.subscribe).toHaveBeenCalledWith('seals:org-a', expect.any(Function), expect.any(Function));
  });

  it('aviso recebido pede nova consulta e marca o horário da atualização', () => {
    const f = fakePort();
    const onChange = vi.fn();
    const watch = watchSeals({ port: f.port, organizationId: 'org-a', onChange });
    f.status('connected');
    f.emit({ kind: 'position', deviceId: 'd1', cylinderId: 'c1' });
    expect(onChange).toHaveBeenCalledWith({ kind: 'position', deviceId: 'd1', cylinderId: 'c1' });
    expect(watch.state()).toEqual({ mode: 'realtime', lastUpdate: new Date('2026-10-17T14:00:00Z') });
  });

  it('sem o canal, consulta a cada 30 s; conectado, para de consultar', () => {
    const f = fakePort();
    const onChange = vi.fn();
    const watch = watchSeals({ port: f.port, organizationId: 'org-a', onChange });
    expect(watch.state().mode).toBe('polling');
    vi.advanceTimersByTime(30_000);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith(null);
    f.status('connected');
    vi.advanceTimersByTime(90_000);
    expect(onChange).toHaveBeenCalledTimes(1);
    f.status('disconnected');
    expect(watch.state().mode).toBe('polling');
    vi.advanceTimersByTime(30_000);
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it('parar cancela a assinatura e o temporizador', () => {
    const f = fakePort();
    const onChange = vi.fn();
    const watch = watchSeals({ port: f.port, organizationId: 'org-a', onChange });
    watch.stop();
    vi.advanceTimersByTime(120_000);
    expect(f.unsubscribe).toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('nada fica no armazenamento do navegador', () => {
    const f = fakePort();
    watchSeals({ port: f.port, organizationId: 'org-a', onChange: vi.fn() });
    f.status('connected');
    f.emit({ kind: 'health', deviceId: 'd1', cylinderId: null });
    expect(localStorage.length + sessionStorage.length).toBe(0);
  });
});
