import type { PushResult } from '@/infrastructure/synchronization/push-synchronizer';
import type { SenderLock } from '@/infrastructure/synchronization/sender-lock';

// Envio da fila de campo (Spec 010, RF-008, RF-016, RF-017; contracts/fila-local.md §3). Só roda com conexão, **depois de reconfirmar a sessão no servidor**,
// sob a trava de aba (uma aba por vez) e nunca em paralelo na mesma aba. Interromper por sessão, rede ou servidor não perde nada: o envio é idempotente e
// os itens continuam na fila.
export type FieldSyncOutcome =
  | { state: 'offline' }
  | { state: 'busy' }
  | { state: 'session_expired' }
  | { state: 'interrupted'; reason: string; result?: PushResult }
  | { state: 'done'; result: PushResult };

export interface FieldSyncDeps {
  // O envio em si (PushSynchronizer com os executores das operações de campo, restrito à conta e ao destino ativos).
  push: () => Promise<PushResult>;
  lock: SenderLock;
  // Confirma a sessão no servidor; falsa ou com erro, nada é enviado.
  verifySession: () => Promise<boolean>;
  isOnline: () => boolean;
}

export class FieldSyncService {
  private syncing = false;
  private last: FieldSyncOutcome | null = null;
  private readonly listeners = new Set<() => void>();

  constructor(private readonly deps: FieldSyncDeps) {}

  isSyncing(): boolean { return this.syncing; }
  lastOutcome(): FieldSyncOutcome | null { return this.last; }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  private emit(): void { for (const listener of [...this.listeners]) listener(); }

  async syncNow(): Promise<FieldSyncOutcome> {
    if (!this.deps.isOnline()) return this.finish({ state: 'offline' }, false);
    if (this.syncing) return { state: 'busy' };
    this.syncing = true;
    this.emit();
    let outcome: FieldSyncOutcome;
    try {
      const ran = await this.deps.lock.run(async (): Promise<FieldSyncOutcome> => {
        const confirmed = await this.deps.verifySession().catch(() => false);
        if (!confirmed) return { state: 'session_expired' };
        let result: PushResult;
        try {
          result = await this.deps.push();
        } catch {
          // A mensagem do erro pode ter dado sensível: nunca é repetida.
          return { state: 'interrupted', reason: 'network_error' };
        }
        if (!result.interrupted) return { state: 'done', result };
        if (result.interruptionReason === 'auth_error') return { state: 'session_expired' };
        return { state: 'interrupted', reason: result.interruptionReason ?? 'network_error', result };
      });
      outcome = ran.ran ? ran.value : { state: 'busy' };
    } finally {
      this.syncing = false;
    }
    return this.finish(outcome, true);
  }

  private finish(outcome: FieldSyncOutcome, emit: boolean): FieldSyncOutcome {
    if (outcome.state !== 'busy') this.last = outcome;
    if (emit) this.emit();
    return outcome;
  }
}

const POLL_MS = 30_000;

interface TriggerTarget {
  addEventListener(name: 'online', listener: () => void): void;
  removeEventListener(name: 'online', listener: () => void): void;
}

// Quando enviar: ao abrir, ao voltar a conexão e a cada 30 segundos enquanto houver pendência (o botão "Enviar agora" chama `syncNow` direto). Sem
// promessa de envio com o aplicativo fechado (RF-008). Devolve a função que desliga tudo.
export function startFieldSyncTriggers(options: { service: Pick<FieldSyncService, 'syncNow'>; hasPending: () => Promise<boolean>; target?: TriggerTarget; pollMs?: number }): () => void {
  const target = options.target ?? (typeof window !== 'undefined' ? window : null);
  const trigger = (): void => { void options.service.syncNow(); };
  trigger();
  target?.addEventListener('online', trigger);
  const timer = setInterval(() => { void options.hasPending().then((pending) => { if (pending) trigger(); }).catch(() => undefined); }, options.pollMs ?? POLL_MS);
  return () => {
    target?.removeEventListener('online', trigger);
    clearInterval(timer);
  };
}
