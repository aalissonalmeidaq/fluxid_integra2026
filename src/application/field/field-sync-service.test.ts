// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PushResult } from '@/infrastructure/synchronization/push-synchronizer';
import type { SenderLock, SenderResult } from '@/infrastructure/synchronization/sender-lock';
import { FieldSyncService, startFieldSyncTriggers } from './field-sync-service';

const done: PushResult = { successful: 2, failed: 0, conflicts: 0, interrupted: false };
const lockThatRuns = (): SenderLock => ({ run: async <T,>(task: () => Promise<T>): Promise<SenderResult<T>> => ({ ran: true, value: await task() }), close: vi.fn() });
const lockBusy = (): SenderLock => ({ run: async () => ({ ran: false, reason: 'busy' }), close: vi.fn() });

function build(over: Partial<ConstructorParameters<typeof FieldSyncService>[0]> = {}) {
  const push = vi.fn(async () => done);
  const verifySession = vi.fn(async () => true);
  const service = new FieldSyncService({ push, lock: lockThatRuns(), verifySession, isOnline: () => true, ...over });
  return { service, push, verifySession };
}

// Spec 010, T039 (RF-008, RF-016, RF-017; contracts/fila-local.md §3): o envio da fila de campo só roda com conexão, depois de reconfirmar a sessão, sob a trava
// de aba, e nunca em paralelo na mesma aba.
describe('FieldSyncService.syncNow', () => {
  it('online, com a sessão confirmada: reconfirma a sessão ANTES de enviar e devolve o resultado', async () => {
    const order: string[] = [];
    const { service } = build({ verifySession: vi.fn(async () => { order.push('sessão'); return true; }), push: vi.fn(async () => { order.push('envio'); return done; }) });
    expect(await service.syncNow()).toEqual({ state: 'done', result: done });
    expect(order).toEqual(['sessão', 'envio']);
  });

  it('sem conexão: não verifica nada nem envia', async () => {
    const { service, push, verifySession } = build({ isOnline: () => false });
    expect(await service.syncNow()).toEqual({ state: 'offline' });
    expect(push).not.toHaveBeenCalled();
    expect(verifySession).not.toHaveBeenCalled();
  });

  it('sessão expirada ou sem confirmação: não envia nada e a fila fica como está', async () => {
    const { service, push } = build({ verifySession: vi.fn(async () => false) });
    expect(await service.syncNow()).toEqual({ state: 'session_expired' });
    expect(push).not.toHaveBeenCalled();
  });

  it('a verificação da sessão que falha (rede) também não envia', async () => {
    const { service, push } = build({ verifySession: vi.fn(async () => { throw new Error('rede'); }) });
    expect(await service.syncNow()).toEqual({ state: 'session_expired' });
    expect(push).not.toHaveBeenCalled();
  });

  it('outra aba enviando: ocupado, sem enviar', async () => {
    const { service, push, verifySession } = build({ lock: lockBusy() });
    expect(await service.syncNow()).toEqual({ state: 'busy' });
    expect(push).not.toHaveBeenCalled();
    expect(verifySession).not.toHaveBeenCalled();
  });

  it('envio interrompido: devolve o motivo; erro de sessão vira "sessão expirada"', async () => {
    const network = build({ push: vi.fn(async () => ({ ...done, interrupted: true, interruptionReason: 'network_error' })) });
    expect(await network.service.syncNow()).toMatchObject({ state: 'interrupted', reason: 'network_error' });
    const auth = build({ push: vi.fn(async () => ({ ...done, interrupted: true, interruptionReason: 'auth_error' })) });
    expect(await auth.service.syncNow()).toMatchObject({ state: 'session_expired' });
  });

  it('exceção inesperada do envio vira "interrompido", sem repetir a mensagem', async () => {
    const { service } = build({ push: vi.fn(async () => { throw new Error('falha com recebedor Fulano'); }) });
    const outcome = await service.syncNow();
    expect(outcome).toEqual({ state: 'interrupted', reason: 'network_error' });
    expect(JSON.stringify(outcome)).not.toContain('Fulano');
  });

  it('não roda duas vezes ao mesmo tempo na mesma aba', async () => {
    let release: () => void = () => undefined;
    const push = vi.fn(() => new Promise<PushResult>((resolve) => { release = () => resolve(done); }));
    const { service } = build({ push });
    const first = service.syncNow();
    await Promise.resolve();
    await Promise.resolve();
    expect(await service.syncNow()).toEqual({ state: 'busy' });
    release();
    expect(await first).toEqual({ state: 'done', result: done });
    expect(push).toHaveBeenCalledTimes(1);
  });

  it('avisa os ouvintes quando começa e quando termina', async () => {
    const { service } = build();
    const phases: boolean[] = [];
    service.subscribe(() => phases.push(service.isSyncing()));
    await service.syncNow();
    expect(phases).toEqual([true, false]);
  });

  it('o último resultado fica disponível para a tela', async () => {
    const { service } = build();
    expect(service.lastOutcome()).toBeNull();
    await service.syncNow();
    expect(service.lastOutcome()).toEqual({ state: 'done', result: done });
  });
});

describe('startFieldSyncTriggers', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const fakeWindow = () => {
    const listeners = new Map<string, Set<() => void>>();
    return {
      addEventListener: (name: string, fn: () => void) => { (listeners.get(name) ?? listeners.set(name, new Set()).get(name)!).add(fn); },
      removeEventListener: (name: string, fn: () => void) => { listeners.get(name)?.delete(fn); },
      emit: (name: string) => listeners.get(name)?.forEach((fn) => fn()),
      count: (name: string) => listeners.get(name)?.size ?? 0,
    };
  };

  it('envia ao abrir, quando a conexão volta e a cada 30 segundos com pendência', async () => {
    const service = { syncNow: vi.fn(async () => ({ state: 'done' as const, result: done })) };
    const target = fakeWindow();
    const stop = startFieldSyncTriggers({ service: service as never, hasPending: async () => true, target: target as never });
    await vi.advanceTimersByTimeAsync(0);
    expect(service.syncNow).toHaveBeenCalledTimes(1);
    target.emit('online');
    await vi.advanceTimersByTimeAsync(0);
    expect(service.syncNow).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(service.syncNow).toHaveBeenCalledTimes(3);
    stop();
  });

  it('sem pendência, o relógio de 30 segundos não envia', async () => {
    const service = { syncNow: vi.fn(async () => ({ state: 'done' as const, result: done })) };
    const stop = startFieldSyncTriggers({ service: service as never, hasPending: async () => false, target: fakeWindow() as never });
    await vi.advanceTimersByTimeAsync(0);
    const afterOpen = service.syncNow.mock.calls.length;
    await vi.advanceTimersByTimeAsync(90_000);
    expect(service.syncNow.mock.calls.length).toBe(afterOpen);
    stop();
  });

  it('parar remove os ouvintes e o relógio', async () => {
    const service = { syncNow: vi.fn(async () => ({ state: 'done' as const, result: done })) };
    const target = fakeWindow();
    const stop = startFieldSyncTriggers({ service: service as never, hasPending: async () => true, target: target as never });
    expect(target.count('online')).toBe(1);
    stop();
    expect(target.count('online')).toBe(0);
    const before = service.syncNow.mock.calls.length;
    await vi.advanceTimersByTimeAsync(120_000);
    expect(service.syncNow.mock.calls.length).toBe(before);
  });
});
