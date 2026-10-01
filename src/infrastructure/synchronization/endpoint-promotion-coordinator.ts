import type { SyncRunResult } from './sync-coordinator';

export type PromotionOutcome = 'promoted' | 'unavailable' | 'deferred' | 'blocked' | 'skipped';

export interface PromotionPorts {
  probeCloud: () => Promise<boolean>;
  // Aguarda a operação corrente estabilizar; false indica que ainda não é seguro trocar.
  settleOperations: () => Promise<boolean>;
  pauseMutations: () => void;
  resumeMutations: () => void;
  // Push, pull e gates contra a cloud, antes de qualquer troca de cliente.
  syncWithCloud: () => Promise<SyncRunResult>;
  // Troca controlada: invalida o cliente anterior e ativa a cloud.
  promote: () => Promise<void>;
  log: (event: { transition: string; outcome: PromotionOutcome }) => void;
}

interface Options {
  random?: () => number;
  reevaluationMs?: number;
  jitterRatio?: number;
}

export class EndpointPromotionCoordinator {
  private timer?: ReturnType<typeof setTimeout>;
  private evaluating = false;
  private active = false;
  private readonly random: () => number;
  private readonly reevaluationMs: number;
  private readonly jitterRatio: number;

  constructor(private readonly ports: PromotionPorts, options: Options = {}) {
    this.random = options.random ?? Math.random;
    this.reevaluationMs = options.reevaluationMs ?? 60_000;
    this.jitterRatio = options.jitterRatio ?? 0.1;
  }

  start(activeEndpoint: 'cloud' | 'lan' | 'local'): void {
    this.stop();
    if (activeEndpoint === 'cloud') return;
    this.active = true;
    this.schedule();
  }

  stop(): void {
    this.active = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
  }

  isScheduled(): boolean {
    return this.timer !== undefined;
  }

  async evaluate(): Promise<PromotionOutcome> {
    if (this.evaluating) return 'skipped';
    this.evaluating = true;
    try {
      if (!(await this.ports.probeCloud())) return this.record('cloud_probe', 'unavailable');
      if (!(await this.ports.settleOperations())) return this.record('settle', 'deferred');

      this.ports.pauseMutations();
      try {
        const synced = await this.ports.syncWithCloud();
        if (synced.state !== 'ready') return this.record('sync', 'blocked');
        await this.ports.promote();
        this.stop();
        return this.record('promote', 'promoted');
      } finally {
        this.ports.resumeMutations();
      }
    } finally {
      this.evaluating = false;
    }
  }

  private schedule(): void {
    const delay = this.reevaluationMs * (1 + this.random() * this.jitterRatio);
    this.timer = setTimeout(() => {
      this.timer = undefined;
      void this.evaluate()
        .catch(() => this.record('evaluate', 'blocked'))
        .finally(() => { if (this.active) this.schedule(); });
    }, delay);
  }

  private record(transition: string, outcome: PromotionOutcome): PromotionOutcome {
    this.ports.log({ transition, outcome });
    return outcome;
  }
}
