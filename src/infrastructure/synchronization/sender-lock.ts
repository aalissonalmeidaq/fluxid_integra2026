// Uma aba por vez envia a fila (Spec 010, RF-017; research.md §7). Com Web Locks, o navegador garante a exclusão por conta e organização; sem ele,
// uma eleição simples por BroadcastChannel escolhe a aba mais antiga. A idempotência do servidor é a segunda defesa contra o envio em paralelo.
export interface LockManagerLike {
  request<T>(name: string, options: { ifAvailable?: boolean; mode?: 'exclusive' | 'shared' }, callback: (lock: unknown | null) => Promise<T>): Promise<T>;
}

interface ChannelLike {
  onmessage: ((event: { data: unknown }) => void) | null;
  postMessage(data: unknown): void;
  close(): void;
}

export type SenderResult<T> = { ran: true; value: T } | { ran: false; reason: 'busy' };

export interface SenderLock {
  // Roda o envio só se esta aba é a que envia; senão devolve `busy` sem rodar nada.
  run<T>(task: () => Promise<T>): Promise<SenderResult<T>>;
  close(): void;
}

export interface SenderLockOptions {
  // Nome fixo por conta e organização (`fluxid-sync:<conta>:<organização>`): outra conta não disputa a trava.
  name: string;
  // `undefined` usa `navigator.locks`; `null` força a eleição por canal (testes e navegadores sem Web Locks).
  locks?: LockManagerLike | null;
  channel?: (name: string) => ChannelLike;
  openedAt?: number;
  electionMs?: number;
}

const DEFAULT_ELECTION_MS = 50;

export function createSenderLock(options: SenderLockOptions): SenderLock {
  const locks = options.locks === undefined ? (typeof navigator !== 'undefined' ? ((navigator as unknown as { locks?: LockManagerLike }).locks ?? null) : null) : options.locks;
  if (locks) return withWebLocks(options.name, locks);
  return withElection(options);
}

function withWebLocks(name: string, locks: LockManagerLike): SenderLock {
  return {
    async run<T>(task: () => Promise<T>): Promise<SenderResult<T>> {
      return locks.request<SenderResult<T>>(name, { ifAvailable: true, mode: 'exclusive' }, async (lock) => {
        if (!lock) return { ran: false, reason: 'busy' };
        return { ran: true, value: await task() };
      });
    },
    close() { /* a trava do navegador se desfaz sozinha quando a aba fecha */ },
  };
}

type Message = { type: 'hello'; id: string; openedAt: number } | { type: 'bye'; id: string };

function withElection(options: SenderLockOptions): SenderLock {
  const makeChannel = options.channel ?? (typeof BroadcastChannel !== 'undefined' ? (name: string) => new BroadcastChannel(name) as unknown as ChannelLike : null);
  // Sem nenhum dos dois recursos só existe esta aba: ela envia.
  if (!makeChannel) return { run: async (task) => ({ ran: true, value: await task() }), close() { /* nada a fechar */ } };

  const id = Math.random().toString(36).slice(2);
  const openedAt = options.openedAt ?? Date.now();
  const peers = new Map<string, number>([[id, openedAt]]);
  const channel = makeChannel(`${options.name}:election`);
  channel.onmessage = (event) => {
    const message = event.data as Message;
    if (message.type === 'hello') {
      const known = peers.has(message.id);
      peers.set(message.id, message.openedAt);
      // Quem acabou de chegar fica sabendo de quem já estava aberto.
      if (!known) channel.postMessage({ type: 'hello', id, openedAt } satisfies Message);
    } else if (message.type === 'bye') peers.delete(message.id);
  };
  channel.postMessage({ type: 'hello', id, openedAt } satisfies Message);

  let ready: Promise<void> | null = null;
  const isLeader = (): boolean => [...peers.entries()].every(([otherId, otherOpened]) => otherId === id || otherOpened > openedAt || (otherOpened === openedAt && otherId > id));

  return {
    async run<T>(task: () => Promise<T>): Promise<SenderResult<T>> {
      ready ??= new Promise((resolve) => setTimeout(resolve, options.electionMs ?? DEFAULT_ELECTION_MS));
      await ready;
      if (!isLeader()) return { ran: false, reason: 'busy' };
      return { ran: true, value: await task() };
    },
    close() {
      channel.postMessage({ type: 'bye', id } satisfies Message);
      channel.close();
    },
  };
}
