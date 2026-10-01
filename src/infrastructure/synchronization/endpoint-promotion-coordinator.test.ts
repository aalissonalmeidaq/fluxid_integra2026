import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EndpointPromotionCoordinator, type PromotionPorts } from './endpoint-promotion-coordinator';

function setup(overrides: Partial<PromotionPorts> = {}, random = () => 0.5) {
  const calls: string[] = [];
  const ports: PromotionPorts = {
    probeCloud: vi.fn(async () => { calls.push('probe'); return true; }),
    settleOperations: vi.fn(async () => { calls.push('settle'); return true; }),
    pauseMutations: vi.fn(() => { calls.push('pause'); }),
    resumeMutations: vi.fn(() => { calls.push('resume'); }),
    syncWithCloud: vi.fn(async () => { calls.push('sync'); return { state: 'ready' as const }; }),
    promote: vi.fn(async () => { calls.push('promote'); }),
    log: vi.fn(),
    ...overrides,
  };
  return { ports, calls, coordinator: new EndpointPromotionCoordinator(ports, { random }) };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('EndpointPromotionCoordinator', () => {
  it('não agenda reavaliação quando a cloud já é o destino ativo', () => {
    const { coordinator, ports } = setup();
    coordinator.start('cloud');
    vi.advanceTimersByTime(600_000);
    expect(ports.probeCloud).not.toHaveBeenCalled();
    expect(coordinator.isScheduled()).toBe(false);
  });

  it('reavalia a cloud após 60 s mais jitter de até 10%', async () => {
    const { coordinator, ports } = setup({}, () => 1);
    coordinator.start('lan');
    await vi.advanceTimersByTimeAsync(65_999);
    expect(ports.probeCloud).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(ports.probeCloud).toHaveBeenCalledTimes(1);
  });

  it('sem jitter reavalia em exatamente 60 s', async () => {
    const { coordinator, ports } = setup({}, () => 0);
    coordinator.start('local');
    await vi.advanceTimersByTimeAsync(59_999);
    expect(ports.probeCloud).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(ports.probeCloud).toHaveBeenCalledTimes(1);
  });

  it('promove somente após estabilizar, pausar, sincronizar e confirmar os gates', async () => {
    const { coordinator, calls } = setup();
    const result = await coordinator.evaluate();
    expect(result).toBe('promoted');
    expect(calls).toEqual(['probe', 'settle', 'pause', 'sync', 'promote', 'resume']);
  });

  it('mantém o endpoint atual e reagenda quando a cloud continua indisponível', async () => {
    const { coordinator, ports } = setup({ probeCloud: vi.fn(async () => false) }, () => 0);
    coordinator.start('lan');
    await vi.advanceTimersByTimeAsync(60_000);
    expect(ports.promote).not.toHaveBeenCalled();
    expect(ports.pauseMutations).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(ports.probeCloud).toHaveBeenCalledTimes(2);
  });

  it('não troca de cliente enquanto a operação em andamento não estabiliza', async () => {
    const { coordinator, ports } = setup({ settleOperations: vi.fn(async () => false) });
    expect(await coordinator.evaluate()).toBe('deferred');
    expect(ports.pauseMutations).not.toHaveBeenCalled();
    expect(ports.promote).not.toHaveBeenCalled();
  });

  it.each(['conflict', 'interrupted', 'session_expired', 'gate_failed', 'cancelled'] as const)(
    'não promove e retoma mutações quando a sincronização termina em %s',
    async (state) => {
      const { coordinator, ports } = setup({ syncWithCloud: vi.fn(async () => ({ state })) });
      expect(await coordinator.evaluate()).toBe('blocked');
      expect(ports.promote).not.toHaveBeenCalled();
      expect(ports.resumeMutations).toHaveBeenCalledTimes(1);
    },
  );

  it('retoma as mutações quando a promoção lança erro', async () => {
    const { coordinator, ports } = setup({ promote: vi.fn(async () => { throw new Error('falha'); }) });
    await expect(coordinator.evaluate()).rejects.toThrow('falha');
    expect(ports.resumeMutations).toHaveBeenCalledTimes(1);
  });

  it('não sobrepõe ciclos de avaliação', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const { coordinator, ports } = setup({ probeCloud: vi.fn(async () => { await gate; return false; }) });
    const first = coordinator.evaluate();
    expect(await coordinator.evaluate()).toBe('skipped');
    release();
    await first;
    expect(ports.probeCloud).toHaveBeenCalledTimes(1);
  });

  it('para de reagendar após a promoção e ao ser interrompido', async () => {
    const { coordinator, ports } = setup({}, () => 0);
    coordinator.start('lan');
    await vi.advanceTimersByTimeAsync(60_000);
    expect(ports.promote).toHaveBeenCalledTimes(1);
    expect(coordinator.isScheduled()).toBe(false);

    const other = setup({ probeCloud: vi.fn(async () => false) }, () => 0);
    other.coordinator.start('local');
    other.coordinator.stop();
    await vi.advanceTimersByTimeAsync(600_000);
    expect(other.ports.probeCloud).not.toHaveBeenCalled();
  });

  it('registra apenas transições sanitizadas', async () => {
    const { coordinator, ports } = setup();
    await coordinator.evaluate();
    const serialized = JSON.stringify((ports.log as ReturnType<typeof vi.fn>).mock.calls);
    expect(serialized).not.toMatch(/https?:\/\//);
    expect(serialized).toContain('promoted');
  });
});
