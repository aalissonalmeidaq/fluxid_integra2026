// Coordenação da coleta do motorista (Spec 015, T048; RF-007a a RF-007h). Liga a coleta da plataforma (web ou nativa), a fila do aparelho
// e o servidor: cada posição entra na fila presa ao dono (conta, empresa, destino, viagem e sessão); o envio sai em lotes ordenados e só
// remove o que o servidor respondeu; sem conexão a fila cresce; passadas 8 horas sem confirmação online a coleta pausa sem perder a fila;
// erro de autenticação pausa e pede para entrar de novo. Nunca troca de destino: itens de outro destino ficam onde estão. Sem regra de
// proximidade aqui: ela é do banco.
import type { DegradationReason } from '@/domain/tracking/tracking-types';
import type {
  Clock, CollectedPosition, LocationTrackingPort, LocationTrackingState, QueueOwner, TrackingCapability, TrackingGateway, TrackingPlatform,
  TrackingQueuePort,
} from './tracking-ports';

export type DriverPhase = 'idle' | 'starting' | 'collecting' | 'paused_auth' | 'auth_required' | 'stopped' | 'error';

export interface DriverTrackingState {
  phase: DriverPhase;
  tripId: string | null;
  platform: TrackingPlatform;
  capability: TrackingCapability;
  degradation: DegradationReason | null;
  collectUntil: string | null;
  pending: number;
  lastSyncAt: string | null;
  // Código sanitizado do último problema (sem coordenadas).
  lastError: string | null;
}

export interface DriverContext {
  userId: string;
  organizationId: string;
  endpointId: string;
  deviceInstallationId: string;
}

const BATCH = 100;
const WINDOW_MS = 8 * 3600_000;

export class DriverTrackingCoordinator {
  private owner: QueueOwner | null = null;
  private current: DriverTrackingState;
  private writes: Promise<void> = Promise.resolve();
  private flushing: Promise<void> | null = null;
  private readonly listeners = new Set<(state: DriverTrackingState) => void>();
  private unsubscribe: (() => void)[] = [];
  // Mudanças de capacidade chegadas enquanto a coleta liga valem mais que o estado devolvido pelo `start` (já antigo).
  private stateChanges = 0;

  constructor(private readonly deps: {
    queue: TrackingQueuePort;
    location: LocationTrackingPort;
    gateway: TrackingGateway;
    clock: Clock;
    isOnline: () => boolean;
    context: DriverContext;
  }) {
    const location = deps.location.state();
    this.current = {
      phase: 'idle', tripId: null, platform: location.platform, capability: location.capability, degradation: location.degradation,
      collectUntil: null, pending: 0, lastSyncAt: null, lastError: null,
    };
  }

  state(): DriverTrackingState { return this.current; }

  subscribe(listener: (state: DriverTrackingState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private update(patch: Partial<DriverTrackingState>): void {
    this.current = { ...this.current, ...patch };
    for (const listener of this.listeners) listener(this.current);
  }

  // Espera as gravações na fila em andamento.
  idle(): Promise<void> { return this.writes; }

  async start(tripId: string): Promise<void> {
    const { gateway, location, context } = this.deps;
    if (!this.deps.isOnline()) {
      this.update({ phase: 'error', lastError: 'OFFLINE' });
      return;
    }
    this.update({ phase: 'starting', tripId, lastError: null });
    const platform = location.state();
    const result = await gateway.startSession({
      organizationId: context.organizationId, tripId, deviceInstallationId: context.deviceInstallationId, platform: platform.platform,
      capability: platform.capability, notificationsDenied: platform.degradation === 'notifications_denied', requestId: crypto.randomUUID(),
    });
    if (!result.ok) {
      // A viagem já não está em andamento (concluída ou cancelada): desliga a coleta que tenha ficado ligada de antes.
      if (result.error === 'CONFLICT') {
        await location.stop();
        this.update({ phase: 'stopped', lastError: null });
        return;
      }
      this.update({ phase: result.error === 'AUTH_REQUIRED' ? 'auth_required' : 'error', lastError: result.error });
      return;
    }
    this.owner = { userId: context.userId, organizationId: context.organizationId, endpointId: context.endpointId, tripId,
      trackingSessionId: result.value.trackingSessionId };
    this.unsubscribe.forEach((stop) => stop());
    this.unsubscribe = [
      location.onPosition((position) => this.collect(position)),
      location.onStateChange((state) => void this.capabilityChanged(state)),
    ];
    // A plataforma pode entregar a primeira posição enquanto ainda está ligando: a coleta já vale a partir daqui.
    this.update({ phase: 'collecting', collectUntil: result.value.collectUntil });
    const changesBefore = this.stateChanges;
    const started = await location.start({ intervalSeconds: result.value.intervalSeconds });
    await this.writes;
    const pending = await this.deps.queue.count(this.owner);
    this.update(this.stateChanges === changesBefore ? { capability: started.capability, degradation: started.degradation, pending } : { pending });
  }

  private collect(position: CollectedPosition): void {
    const owner = this.owner;
    if (!owner || this.current.phase !== 'collecting') return;
    // Janela offline vencida (RF-007g): pausa a coleta; a fila existente fica intacta até a autenticação online.
    if (this.current.collectUntil && this.deps.clock.now().getTime() > Date.parse(this.current.collectUntil)) {
      this.update({ phase: 'paused_auth' });
      void this.deps.location.stop();
      return;
    }
    this.writes = this.writes.then(async () => {
      const stored = await this.deps.queue.enqueue(owner, position);
      if (stored === 'full') this.update({ lastError: 'QUEUE_FULL' });
      this.update({ pending: await this.deps.queue.count(owner) });
    }).catch(() => this.update({ lastError: 'QUEUE_UNAVAILABLE' }));
  }

  private async capabilityChanged(state: LocationTrackingState): Promise<void> {
    // Só capacidade e degradação interessam ao gestor; ligar e desligar a observação (página oculta) não é mudança a informar.
    this.stateChanges += 1;
    const changed = state.capability !== this.current.capability || state.degradation !== this.current.degradation;
    this.update({ capability: state.capability, degradation: state.degradation, platform: state.platform });
    if (!changed) return;
    const owner = this.owner;
    if (!owner || !this.deps.isOnline()) return;
    await this.deps.gateway.reportCapability({
      organizationId: owner.organizationId, trackingSessionId: owner.trackingSessionId, capability: state.capability,
      notificationsDenied: state.degradation === 'notifications_denied', requestId: crypto.randomUUID(),
    });
  }

  // Envia a fila deste dono em lotes. Uma chamada por vez; sem conexão, não tenta.
  flush(): Promise<void> {
    this.flushing ??= this.send().finally(() => { this.flushing = null; });
    return this.flushing;
  }

  private async send(): Promise<void> {
    await this.writes;
    const owner = this.owner;
    if (!owner || !this.deps.isOnline()) return;
    for (;;) {
      const batch = await this.deps.queue.nextBatch(owner, BATCH);
      if (batch.length === 0) break;
      const response = await this.deps.gateway.ingest({
        organizationId: owner.organizationId, trackingSessionId: owner.trackingSessionId, deviceInstallationId: this.deps.context.deviceInstallationId,
        positions: batch,
      });
      if (!response.ok) {
        if (response.error === 'AUTH_REQUIRED') {
          this.update({ phase: 'auth_required', lastError: 'AUTH_REQUIRED' });
          await this.deps.location.stop();
        } else this.update({ lastError: response.error });
        break;
      }
      // Gravadas e duplicadas estão no servidor; recusadas não se recuperam reenviando. Só o que não veio na resposta continua.
      await this.deps.queue.remove(owner, response.value.results.map((item) => item.clientPositionId));
      // A sessão terminou no servidor (viagem concluída ou cancelada): a coleta para aqui, mesmo sem a tela ver a viagem encerrada.
      if (response.value.results.some((item) => item.code === 'SESSION_ENDED')) {
        await this.deps.location.stop();
        this.unsubscribe.forEach((stop) => stop());
        this.unsubscribe = [];
        this.update({ phase: 'stopped', lastError: null });
        break;
      }
      this.update({
        lastSyncAt: response.value.serverTime, lastError: null,
        collectUntil: new Date(Date.parse(response.value.serverTime) + WINDOW_MS).toISOString(),
      });
      if (response.value.results.length === 0) break;
    }
    this.update({ pending: await this.deps.queue.count(owner) });
  }

  async stop(reason: 'completed' | 'cancelled'): Promise<void> {
    await this.deps.location.stop();
    const owner = this.owner;
    if (owner) {
      await this.flush();
      if (this.deps.isOnline()) {
        await this.deps.gateway.endSession({ organizationId: owner.organizationId, trackingSessionId: owner.trackingSessionId, reason,
          requestId: crypto.randomUUID() });
      }
    }
    this.unsubscribe.forEach((stop) => stop());
    this.unsubscribe = [];
    this.update({ phase: 'stopped' });
  }
}
