import { describe, expect, it, vi } from 'vitest';
import type {
  CollectedPosition, GatewayResult, IngestItemResult, LocationTrackingPort, LocationTrackingState, QueuedPosition, QueueOwner,
  TrackingGateway, TrackingQueuePort, TrackingSessionGrant,
} from './tracking-ports';
import { DriverTrackingCoordinator } from './tracking-sync-service';

// Spec 015 (T048; RF-007a a RF-007h, CS-014, CS-016): coordenação da coleta do motorista. Posições vão para a fila presa ao dono; o envio
// sai em lotes ordenados e remove só o que o servidor respondeu; sem conexão a fila cresce; depois de 8 horas sem confirmação online a
// coleta pausa sem perder a fila; erro de autenticação pausa e nunca troca de destino.
const NOW = Date.parse('2026-10-22T12:00:00Z');
const at = (minutes: number) => new Date(NOW + minutes * 60_000);

class MemoryQueue implements TrackingQueuePort {
  items: QueuedPosition[] = [];
  private seq = 0;
  async enqueue(owner: QueueOwner, position: CollectedPosition) {
    this.seq += 1;
    const item = { ...position, owner, clientPositionId: `p${this.seq}`, sequenceNo: this.seq };
    this.items.push(item);
    return item;
  }
  async nextBatch(owner: QueueOwner, limit: number) {
    return this.items.filter((i) => i.owner.trackingSessionId === owner.trackingSessionId && i.owner.endpointId === owner.endpointId).slice(0, limit);
  }
  async remove(_owner: QueueOwner, ids: string[]) { this.items = this.items.filter((i) => !ids.includes(i.clientPositionId)); }
  async count(owner: QueueOwner) { return (await this.nextBatch(owner, 10_000)).length; }
  async owners() { return [...new Map(this.items.map((i) => [i.owner.trackingSessionId, i.owner])).values()]; }
}

function fakeLocation(state: Partial<LocationTrackingState> = {}) {
  let emit: (p: CollectedPosition) => void = () => undefined;
  let change: (s: LocationTrackingState) => void = () => undefined;
  const current: LocationTrackingState = { platform: 'android_native', capability: 'full', collecting: false, degradation: null, ...state };
  const port: LocationTrackingPort & { start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn> } = {
    state: () => current,
    start: vi.fn(async () => { current.collecting = true; return current; }),
    stop: vi.fn(async () => { current.collecting = false; }),
    onPosition: (listener) => { emit = listener; return () => undefined; },
    onStateChange: (listener) => { change = listener; return () => undefined; },
  };
  return { port, emit: (p: CollectedPosition) => emit(p), change: (s: Partial<LocationTrackingState>) => change({ ...current, ...s }) };
}

const GRANT: TrackingSessionGrant = { trackingSessionId: 's1', collectUntil: at(480).toISOString(), intervalSeconds: 60, status: 'active' };

function fakeGateway(ingest: (positions: QueuedPosition[]) => GatewayResult<{ serverTime: string; results: IngestItemResult[] }> =
  (positions) => ({ ok: true, value: { serverTime: at(0).toISOString(), results: positions.map((p) => ({ clientPositionId: p.clientPositionId, status: 'stored', retrospective: false })) } })) {
  return {
    startSession: vi.fn(async (): Promise<GatewayResult<TrackingSessionGrant>> => ({ ok: true, value: GRANT })),
    ingest: vi.fn(async (input: { positions: QueuedPosition[] }) => ingest(input.positions)),
    endSession: vi.fn(async (): Promise<GatewayResult<TrackingSessionGrant>> => ({ ok: true, value: { ...GRANT, status: 'completed' } })),
    reportCapability: vi.fn(async (): Promise<GatewayResult<null>> => ({ ok: true, value: null })),
  } satisfies TrackingGateway;
}

const reading = (minute: number): CollectedPosition => ({ observedAt: at(minute).toISOString(), latitude: -7.23, longitude: -39.31, accuracyM: 10 });

function setup(options: { online?: boolean; location?: Partial<LocationTrackingState>; gateway?: ReturnType<typeof fakeGateway> } = {}) {
  let clock = at(0);
  let online = options.online ?? true;
  const queue = new MemoryQueue();
  const location = fakeLocation(options.location);
  const gateway = options.gateway ?? fakeGateway();
  const coordinator = new DriverTrackingCoordinator({
    queue, location: location.port, gateway, clock: { now: () => clock }, isOnline: () => online,
    context: { userId: 'u1', organizationId: 'org-a', endpointId: 'cloud', deviceInstallationId: 'inst-1' },
  });
  return {
    coordinator, queue, location, gateway,
    advance: (minutes: number) => { clock = new Date(clock.getTime() + minutes * 60_000); },
    setOnline: (value: boolean) => { online = value; },
  };
}

describe('coleta do motorista', () => {
  it('iniciar abre a sessão no servidor, liga a coleta a cada 60 s e mostra a coleta ativa', async () => {
    const s = setup();
    await s.coordinator.start('t1');
    expect(s.gateway.startSession).toHaveBeenCalledWith(expect.objectContaining({ organizationId: 'org-a', tripId: 't1', deviceInstallationId: 'inst-1',
      platform: 'android_native', capability: 'full' }));
    expect(s.location.port.start).toHaveBeenCalledWith({ intervalSeconds: 60 });
    expect(s.coordinator.state()).toMatchObject({ phase: 'collecting', collectUntil: GRANT.collectUntil });
  });

  it('posição entregue pela plataforma enquanto a coleta ainda está ligando não se perde', async () => {
    const s = setup();
    s.location.port.start.mockImplementationOnce(async () => {
      s.location.emit(reading(0));
      return { platform: 'android_native', capability: 'full', collecting: true, degradation: null };
    });
    await s.coordinator.start('t1');
    await s.coordinator.idle();
    expect(s.queue.items).toHaveLength(1);
  });

  it('cada posição entra na fila do dono e é enviada em lote, saindo só depois da resposta', async () => {
    const s = setup();
    await s.coordinator.start('t1');
    s.location.emit(reading(1));
    s.location.emit(reading(2));
    await s.coordinator.flush();
    expect(s.gateway.ingest).toHaveBeenCalledTimes(1);
    expect(s.gateway.ingest.mock.calls[0]![0].positions.map((p) => p.sequenceNo)).toEqual([1, 2]);
    expect(s.queue.items).toHaveLength(0);
    expect(s.coordinator.state().pending).toBe(0);
  });

  it('sem conexão, a fila cresce e nada é enviado; ao voltar, envia na ordem original', async () => {
    const s = setup({ online: false });
    await s.coordinator.start('t1').catch(() => undefined);
    // Sem conexão não há sessão nova; o teste começa online e depois cai.
    s.setOnline(true);
    await s.coordinator.start('t1');
    s.setOnline(false);
    for (let m = 1; m <= 3; m += 1) s.location.emit(reading(m));
    await s.coordinator.flush();
    expect(s.gateway.ingest).not.toHaveBeenCalled();
    expect(await s.queue.count({ userId: 'u1', organizationId: 'org-a', endpointId: 'cloud', tripId: 't1', trackingSessionId: 's1' })).toBe(3);
    s.setOnline(true);
    await s.coordinator.flush();
    expect(s.gateway.ingest.mock.calls[0]![0].positions.map((p) => p.observedAt)).toEqual([reading(1), reading(2), reading(3)].map((r) => r.observedAt));
  });

  it('falha de rede no envio mantém tudo para a próxima tentativa, com os mesmos UUIDs', async () => {
    const gateway = fakeGateway(() => ({ ok: false, error: 'UNAVAILABLE' }));
    const s = setup({ gateway });
    await s.coordinator.start('t1');
    s.location.emit(reading(1));
    await s.coordinator.flush();
    expect(s.queue.items.map((i) => i.clientPositionId)).toEqual(['p1']);
    await s.coordinator.flush();
    expect(gateway.ingest.mock.calls[1]![0].positions.map((p) => p.clientPositionId)).toEqual(['p1']);
  });

  it('duplicadas e recusadas definitivas saem da fila; nada fica preso', async () => {
    const gateway = fakeGateway((positions) => ({ ok: true, value: { serverTime: at(0).toISOString(), results: [
      { clientPositionId: positions[0]!.clientPositionId, status: 'duplicate', retrospective: false },
      { clientPositionId: positions[1]!.clientPositionId, status: 'rejected', retrospective: false, code: 'POSITION_TOO_FUTURE' },
    ] } }));
    const s = setup({ gateway });
    await s.coordinator.start('t1');
    s.location.emit(reading(1));
    s.location.emit(reading(2));
    await s.coordinator.flush();
    expect(s.queue.items).toHaveLength(0);
  });

  // Validação humana (27/10/2026): concluída a viagem, o serviço nativo seguia coletando e o servidor recusava cada posição.
  it('o servidor avisa que a sessão terminou: a coleta para e novas posições não entram', async () => {
    const gateway = fakeGateway((positions) => ({ ok: true, value: { serverTime: at(0).toISOString(), results: positions.map((p) => (
      { clientPositionId: p.clientPositionId, status: 'rejected' as const, retrospective: false, code: 'SESSION_ENDED' })) } }));
    const s = setup({ gateway });
    await s.coordinator.start('t1');
    s.location.emit(reading(1));
    await s.coordinator.flush();
    expect(s.location.port.stop).toHaveBeenCalled();
    expect(s.coordinator.state().phase).toBe('stopped');
    s.location.emit(reading(2));
    await s.coordinator.idle();
    expect(s.queue.items).toHaveLength(0);
  });

  it('a viagem já não está em andamento ao iniciar: desliga a coleta que tenha ficado ligada', async () => {
    const gateway = fakeGateway();
    gateway.startSession.mockResolvedValueOnce({ ok: false, error: 'CONFLICT' });
    const s = setup({ gateway });
    await s.coordinator.start('t1');
    expect(s.location.port.stop).toHaveBeenCalled();
    expect(s.location.port.start).not.toHaveBeenCalled();
    expect(s.coordinator.state().phase).toBe('stopped');
  });

  it('depois de 8 horas sem confirmação online, novas posições não entram e a fila fica intacta', async () => {
    const s = setup();
    await s.coordinator.start('t1');
    s.setOnline(false);
    s.location.emit(reading(1));
    s.advance(481);
    s.location.emit(reading(482));
    await s.coordinator.idle();
    expect(s.queue.items).toHaveLength(1);
    expect(s.coordinator.state()).toMatchObject({ phase: 'paused_auth', pending: 1 });
    expect(s.location.port.stop).toHaveBeenCalled();
  });

  it('cada envio aceito renova a janela de 8 horas', async () => {
    const gateway = fakeGateway((positions) => ({ ok: true, value: { serverTime: at(400).toISOString(),
      results: positions.map((p) => ({ clientPositionId: p.clientPositionId, status: 'stored' as const, retrospective: false })) } }));
    const s = setup({ gateway });
    await s.coordinator.start('t1');
    s.advance(400);
    s.location.emit(reading(400));
    await s.coordinator.flush();
    s.advance(300);
    s.location.emit(reading(700));
    await s.coordinator.idle();
    expect(s.queue.items).toHaveLength(1);
    expect(s.coordinator.state().phase).toBe('collecting');
  });

  it('sessão expirada no envio pausa a coleta e pede para entrar de novo, sem trocar de destino', async () => {
    const gateway = fakeGateway(() => ({ ok: false, error: 'AUTH_REQUIRED' }));
    const s = setup({ gateway });
    await s.coordinator.start('t1');
    s.location.emit(reading(1));
    await s.coordinator.flush();
    expect(s.coordinator.state().phase).toBe('auth_required');
    expect(s.queue.items).toHaveLength(1);
  });

  it('mudança de capacidade (negada, só com a tela visível, notificação recusada) é informada ao servidor', async () => {
    const s = setup();
    await s.coordinator.start('t1');
    s.location.change({ capability: 'foreground_only', degradation: 'foreground_only' });
    await vi.waitFor(() => expect(s.gateway.reportCapability).toHaveBeenCalledWith(expect.objectContaining({ trackingSessionId: 's1', capability: 'foreground_only' })));
    expect(s.coordinator.state().degradation).toBe('foreground_only');
  });

  it('recusa que chega logo depois de ligar a coleta não é sobrescrita pelo estado inicial', async () => {
    const s = setup({ location: { platform: 'web_visible', capability: 'foreground_only', degradation: 'foreground_only' } });
    s.location.port.start.mockImplementationOnce(async () => {
      const initial = { platform: 'web_visible' as const, capability: 'foreground_only' as const, collecting: true, degradation: 'foreground_only' as const };
      s.location.change({ capability: 'denied', degradation: 'denied', collecting: false });
      return initial;
    });
    await s.coordinator.start('t1');
    expect(s.coordinator.state()).toMatchObject({ capability: 'denied', degradation: 'denied' });
  });

  it('mudança só de "coletando" (página oculta e visível de novo) não é informada ao servidor', async () => {
    const s = setup();
    await s.coordinator.start('t1');
    s.location.change({ collecting: false });
    s.location.change({ collecting: true });
    await Promise.resolve();
    expect(s.gateway.reportCapability).not.toHaveBeenCalled();
  });

  it('localização negada não bloqueia a viagem: a sessão abre degradada', async () => {
    const s = setup({ location: { capability: 'denied', degradation: 'denied' } });
    await s.coordinator.start('t1');
    expect(s.gateway.startSession).toHaveBeenCalledWith(expect.objectContaining({ capability: 'denied' }));
    expect(s.coordinator.state()).toMatchObject({ phase: 'collecting', degradation: 'denied' });
  });

  it('encerrar para a coleta, envia o que falta e fecha a sessão', async () => {
    const s = setup();
    await s.coordinator.start('t1');
    s.location.emit(reading(1));
    await s.coordinator.stop('completed');
    expect(s.location.port.stop).toHaveBeenCalled();
    expect(s.gateway.ingest).toHaveBeenCalled();
    expect(s.gateway.endSession).toHaveBeenCalledWith(expect.objectContaining({ trackingSessionId: 's1', reason: 'completed' }));
    expect(s.coordinator.state().phase).toBe('stopped');
  });

  it('itens de outro destino ficam na fila e nunca são enviados pelo destino atual', async () => {
    const s = setup();
    await s.coordinator.start('t1');
    await s.queue.enqueue({ userId: 'u1', organizationId: 'org-a', endpointId: 'lan', tripId: 't1', trackingSessionId: 's1' }, reading(1));
    await s.coordinator.flush();
    expect(s.gateway.ingest).not.toHaveBeenCalled();
    expect(s.queue.items).toHaveLength(1);
  });
});
