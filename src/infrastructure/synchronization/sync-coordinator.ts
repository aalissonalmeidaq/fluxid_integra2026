import type { SyncOutbox } from './sync-outbox';
import type { PushResult } from './push-synchronizer';

export type SyncGate = 'session' | 'tenant' | 'consistency';
export type SyncState = 'ready' | 'conflict' | 'interrupted' | 'session_expired' | 'gate_failed' | 'cancelled';

export type SyncPhase = 'pushing' | 'pulling' | 'preparing';

export interface SyncPorts {
  outbox: SyncOutbox;
  // Anuncia cada fase antes de executá-la, para a tela de inicialização acompanhar o andamento.
  onPhase?: (phase: SyncPhase) => void;
  push: () => Promise<PushResult>;
  pull: () => Promise<void>;
  hasOpenConflicts: () => Promise<boolean>;
  gates: Record<SyncGate, () => Promise<boolean>>;
}

export interface SyncRunResult {
  state: SyncState;
  failedGate?: SyncGate;
}

const GATE_ORDER: readonly SyncGate[] = ['session', 'tenant', 'consistency'];

export class SyncCoordinator {
  private running = false;
  private mutationsPaused = false;

  constructor(private readonly ports: SyncPorts) {}

  acceptsMutations(): boolean {
    return !this.mutationsPaused;
  }

  pauseMutations(): void {
    this.mutationsPaused = true;
  }

  resumeMutations(): void {
    this.mutationsPaused = false;
  }

  isRunning(): boolean {
    return this.running;
  }

  // Ciclo serial: recuperação, push, pull e gates. O pull nunca precede o push.
  async run(options: { signal?: AbortSignal } = {}): Promise<SyncRunResult> {
    if (this.running) throw new Error('Sincronização em andamento.');
    this.running = true;
    try {
      await this.recoverInterrupted();
      if (options.signal?.aborted) return { state: 'cancelled' };

      this.ports.onPhase?.('pushing');
      const pushed = await this.ports.push();
      if (options.signal?.aborted) return { state: 'cancelled' };
      if (pushed.interrupted) {
        return { state: pushed.interruptionReason === 'auth_error' ? 'session_expired' : 'interrupted' };
      }
      if (pushed.conflicts > 0 || await this.ports.hasOpenConflicts()) return { state: 'conflict' };

      this.ports.onPhase?.('pulling');
      await this.ports.pull();
      if (options.signal?.aborted) return { state: 'cancelled' };

      this.ports.onPhase?.('preparing');
      for (const gate of GATE_ORDER) {
        if (!(await this.ports.gates[gate]())) return { state: 'gate_failed', failedGate: gate };
      }
      return { state: 'ready' };
    } finally {
      this.running = false;
    }
  }

  // Itens deixados em syncing por fechamento anterior voltam a pending; a idempotência evita duplicação.
  private async recoverInterrupted(): Promise<void> {
    for (const item of await this.ports.outbox.list()) {
      if (item.status === 'syncing') await this.ports.outbox.transition(item.id, 'pending');
    }
  }
}
