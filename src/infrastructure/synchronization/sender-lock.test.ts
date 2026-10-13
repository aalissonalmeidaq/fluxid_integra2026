// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createSenderLock, type LockManagerLike } from './sender-lock';

// Spec 010, T036 (RF-017; research.md §7): uma aba por vez envia a fila. Com Web Locks, o navegador decide; sem ele, uma eleição simples por canal.
const deferred = () => { let release: () => void = () => undefined; const promise = new Promise<void>((resolve) => { release = resolve; }); return { promise, release }; };

// Web Locks simulado: fila por nome, exclusivo, `ifAvailable` devolve nulo se já está tomado.
function fakeLocks(): LockManagerLike & { held: Set<string> } {
  const held = new Set<string>();
  return {
    held,
    async request(name: string, options: { ifAvailable?: boolean }, callback: (lock: unknown) => Promise<unknown>) {
      if (held.has(name)) {
        if (options.ifAvailable) return callback(null);
        throw new Error('o simulado só implementa ifAvailable');
      }
      held.add(name);
      try { return await callback({ name }); } finally { held.delete(name); }
    },
  } as never;
}

describe('createSenderLock com Web Locks', () => {
  it('executa o envio quando ninguém mais está enviando', async () => {
    const lock = createSenderLock({ name: 'fluxid-sync:u1:tenant-a', locks: fakeLocks() });
    const task = vi.fn(async () => 'enviado');
    expect(await lock.run(task)).toEqual({ ran: true, value: 'enviado' });
    expect(task).toHaveBeenCalledTimes(1);
  });

  it('com outra aba enviando, não executa e avisa que está ocupado (nunca envia em paralelo)', async () => {
    const locks = fakeLocks();
    const lock = createSenderLock({ name: 'fluxid-sync:u1:tenant-a', locks });
    const first = deferred();
    const running = lock.run(() => first.promise);
    await Promise.resolve();
    const second = vi.fn(async () => 'não deveria rodar');
    expect(await createSenderLock({ name: 'fluxid-sync:u1:tenant-a', locks }).run(second)).toEqual({ ran: false, reason: 'busy' });
    expect(second).not.toHaveBeenCalled();
    first.release();
    await running;
  });

  it('libera a trava quando o envio termina, inclusive com erro', async () => {
    const locks = fakeLocks();
    const lock = createSenderLock({ name: 'fluxid-sync:u1:tenant-a', locks });
    await expect(lock.run(async () => { throw new Error('queda'); })).rejects.toThrow('queda');
    expect(locks.held.size).toBe(0);
    expect(await lock.run(async () => 1)).toEqual({ ran: true, value: 1 });
  });

  it('o nome da trava é por conta e organização: outra conta não disputa a mesma trava', async () => {
    const locks = fakeLocks();
    const first = deferred();
    const a = createSenderLock({ name: 'fluxid-sync:u1:tenant-a', locks }).run(() => first.promise);
    await Promise.resolve();
    expect(await createSenderLock({ name: 'fluxid-sync:u2:tenant-a', locks }).run(async () => 'outra conta')).toEqual({ ran: true, value: 'outra conta' });
    first.release();
    await a;
  });
});

// Sem Web Locks: eleição por canal. A aba mais antiga (menor carimbo de abertura) envia; as outras esperam.
class FakeChannel {
  static channels = new Map<string, Set<FakeChannel>>();
  onmessage: ((event: { data: unknown }) => void) | null = null;
  constructor(readonly name: string) { (FakeChannel.channels.get(name) ?? FakeChannel.channels.set(name, new Set()).get(name)!).add(this); }
  postMessage(data: unknown) { for (const other of FakeChannel.channels.get(this.name)!) if (other !== this) queueMicrotask(() => other.onmessage?.({ data })); }
  close() { FakeChannel.channels.get(this.name)?.delete(this); }
}

describe('createSenderLock sem Web Locks (eleição por canal)', () => {
  const settle = () => new Promise((resolve) => setTimeout(resolve, 5));

  it('sozinha, a aba envia', async () => {
    FakeChannel.channels.clear();
    const lock = createSenderLock({ name: 'x:1', locks: null, channel: (name) => new FakeChannel(name) as never, openedAt: 100, electionMs: 1 });
    expect(await lock.run(async () => 7)).toEqual({ ran: true, value: 7 });
  });

  it('com duas abas, só a mais antiga envia', async () => {
    FakeChannel.channels.clear();
    const older = createSenderLock({ name: 'x:2', locks: null, channel: (name) => new FakeChannel(name) as never, openedAt: 100, electionMs: 1 });
    const newer = createSenderLock({ name: 'x:2', locks: null, channel: (name) => new FakeChannel(name) as never, openedAt: 200, electionMs: 1 });
    await settle();
    expect(await newer.run(async () => 'nova')).toEqual({ ran: false, reason: 'busy' });
    expect(await older.run(async () => 'antiga')).toEqual({ ran: true, value: 'antiga' });
  });

  it('se a aba mais antiga fecha, a seguinte assume', async () => {
    FakeChannel.channels.clear();
    const older = createSenderLock({ name: 'x:3', locks: null, channel: (name) => new FakeChannel(name) as never, openedAt: 100, electionMs: 1 });
    const newer = createSenderLock({ name: 'x:3', locks: null, channel: (name) => new FakeChannel(name) as never, openedAt: 200, electionMs: 1 });
    await settle();
    older.close();
    await settle();
    expect(await newer.run(async () => 'nova')).toEqual({ ran: true, value: 'nova' });
  });
});
