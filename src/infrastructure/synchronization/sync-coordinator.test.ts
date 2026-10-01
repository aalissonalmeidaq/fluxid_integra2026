import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LocalDatabase } from '@/infrastructure/local-database/local-database';
import { SyncOutbox } from './sync-outbox';
import { SyncCoordinator, type SyncPorts } from './sync-coordinator';
import type { PushResult } from './push-synchronizer';

const databaseNames: string[] = [];
afterEach(async () => {
  await Promise.all(databaseNames.splice(0).map((name) => new Promise<void>((resolve) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = request.onerror = request.onblocked = () => resolve();
  })));
});

const okPush: PushResult = { successful: 0, failed: 0, conflicts: 0, interrupted: false };
const command = {
  organizationId: 'tenant-a', actorId: 'actor-1', deviceId: 'device-1',
  operation: 'future-domain.operation', payload: {}, version: 1,
};

async function setup(overrides: Partial<SyncPorts> = {}) {
  const name = `coordinator-${crypto.randomUUID()}`;
  databaseNames.push(name);
  const database = new LocalDatabase(name);
  await database.open();
  database.unlock('tenant-a');
  const outbox = new SyncOutbox(database);
  const calls: string[] = [];
  const ports: SyncPorts = {
    outbox,
    push: vi.fn(async () => { calls.push('push'); return okPush; }),
    pull: vi.fn(async () => { calls.push('pull'); }),
    hasOpenConflicts: vi.fn(async () => false),
    gates: {
      session: vi.fn(async () => true),
      tenant: vi.fn(async () => true),
      consistency: vi.fn(async () => true),
    },
    ...overrides,
  };
  return { database, outbox, ports, calls, coordinator: new SyncCoordinator(ports) };
}

describe('SyncCoordinator', () => {
  it('executa push antes de pull e libera após os gates', async () => {
    const { coordinator, calls } = await setup();
    const result = await coordinator.run();
    expect(calls).toEqual(['push', 'pull']);
    expect(result.state).toBe('ready');
  });

  it('reporta as fases pushing, pulling e preparing na ordem em que executa', async () => {
    const phases: string[] = [];
    const { coordinator } = await setup({ onPhase: (phase) => { phases.push(phase); } });
    await coordinator.run();
    expect(phases).toEqual(['pushing', 'pulling', 'preparing']);
  });

  it('não anuncia pulling nem preparing quando o push termina em conflito', async () => {
    const phases: string[] = [];
    const { coordinator } = await setup({ push: vi.fn(async () => ({ ...okPush, conflicts: 1 })), onPhase: (phase) => { phases.push(phase); } });
    await coordinator.run();
    expect(phases).toEqual(['pushing']);
  });

  it('anuncia a fase antes de executá-la', async () => {
    const seen: string[] = [];
    const { coordinator } = await setup({
      onPhase: (phase) => { seen.push(`fase:${phase}`); },
      push: vi.fn(async () => { seen.push('push'); return okPush; }),
      pull: vi.fn(async () => { seen.push('pull'); }),
    });
    await coordinator.run();
    expect(seen).toEqual(['fase:pushing', 'push', 'fase:pulling', 'pull', 'fase:preparing']);
  });

  it('impede execuções concorrentes', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const { coordinator } = await setup({ push: vi.fn(async () => { await gate; return okPush; }) });
    const first = coordinator.run();
    await expect(coordinator.run()).rejects.toThrow(/em andamento/i);
    release();
    await first;
    await expect(coordinator.run()).resolves.toMatchObject({ state: 'ready' });
  });

  it('retoma após fechamento devolvendo itens syncing a pending antes do push', async () => {
    const { coordinator, outbox, ports } = await setup();
    const item = await outbox.enqueue(command);
    await outbox.transition(item.id, 'syncing');
    (ports.push as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      expect((await outbox.list())[0]?.status).toBe('pending');
      return okPush;
    });
    await coordinator.run();
    expect(ports.push).toHaveBeenCalledTimes(1);
  });

  it('não executa pull quando o push termina em conflito', async () => {
    const { coordinator, ports } = await setup({ push: vi.fn(async () => ({ ...okPush, conflicts: 1 })) });
    const result = await coordinator.run();
    expect(result.state).toBe('conflict');
    expect(ports.pull).not.toHaveBeenCalled();
  });

  it('não executa pull quando há conflito crítico aberto', async () => {
    const { coordinator, ports } = await setup({ hasOpenConflicts: vi.fn(async () => true) });
    const result = await coordinator.run();
    expect(result.state).toBe('conflict');
    expect(ports.pull).not.toHaveBeenCalled();
    expect(ports.gates.session).not.toHaveBeenCalled();
  });

  it('interrompe por sessão expirada sem executar pull', async () => {
    const { coordinator, ports } = await setup({
      push: vi.fn(async () => ({ ...okPush, interrupted: true, interruptionReason: 'auth_error' })),
    });
    const result = await coordinator.run();
    expect(result.state).toBe('session_expired');
    expect(ports.pull).not.toHaveBeenCalled();
  });

  it('interrompe por queda de rede preservando a outbox', async () => {
    const { coordinator, ports } = await setup({
      push: vi.fn(async () => ({ ...okPush, interrupted: true, interruptionReason: 'network_error' })),
    });
    const result = await coordinator.run();
    expect(result.state).toBe('interrupted');
    expect(ports.pull).not.toHaveBeenCalled();
  });

  it.each(['session', 'tenant', 'consistency'] as const)('bloqueia a liberação quando o gate %s falha', async (gate) => {
    const { coordinator, ports } = await setup();
    (ports.gates[gate] as ReturnType<typeof vi.fn>).mockResolvedValue(false);
    const result = await coordinator.run();
    expect(result.state).toBe('gate_failed');
    expect(result.failedGate).toBe(gate);
  });

  it('pausa novas mutações e as retoma', async () => {
    const { coordinator } = await setup();
    expect(coordinator.acceptsMutations()).toBe(true);
    coordinator.pauseMutations();
    expect(coordinator.acceptsMutations()).toBe(false);
    coordinator.resumeMutations();
    expect(coordinator.acceptsMutations()).toBe(true);
  });

  it('cancela com segurança entre as fases e não executa pull', async () => {
    const controller = new AbortController();
    const { coordinator, ports } = await setup({
      push: vi.fn(async () => { controller.abort(); return okPush; }),
    });
    const result = await coordinator.run({ signal: controller.signal });
    expect(result.state).toBe('cancelled');
    expect(ports.pull).not.toHaveBeenCalled();
  });

  it('libera a exclusão mútua mesmo quando uma fase lança erro', async () => {
    const { coordinator, ports } = await setup();
    (ports.push as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('falha'));
    await expect(coordinator.run()).rejects.toThrow('falha');
    await expect(coordinator.run()).resolves.toMatchObject({ state: 'ready' });
  });

  it('é determinístico para a mesma entrada', async () => {
    const a = await setup();
    const b = await setup();
    expect(await a.coordinator.run()).toEqual(await b.coordinator.run());
  });
});
