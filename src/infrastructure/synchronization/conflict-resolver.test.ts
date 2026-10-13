import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LocalDatabase } from '@/infrastructure/local-database/local-database';
import { ConflictResolver, type ConflictInput } from './conflict-resolver';

const databaseNames: string[] = [];
afterEach(async () => {
  await Promise.all(databaseNames.splice(0).map((name) => new Promise<void>((resolve) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = request.onerror = request.onblocked = () => resolve();
  })));
});

async function setup(tenant = 'tenant-a') {
  const name = `conflicts-${crypto.randomUUID()}`;
  databaseNames.push(name);
  const database = new LocalDatabase(name);
  await database.open();
  database.unlock(tenant);
  const audit = vi.fn();
  const resolver = new ConflictResolver(database, { audit, now: () => new Date('2026-09-29T12:00:00Z') });
  return { database, audit, resolver };
}

const input: ConflictInput = {
  organizationId: 'tenant-a',
  outboxItemId: 'item-1',
  entity: 'memberships',
  entityId: 'entity-1',
  kind: 'concurrent_update',
  localVersion: { version: 2, data: { status: 'active' } },
  remoteVersion: { version: 3, data: { status: 'blocked' } },
};

const authorized = {
  actorId: 'actor-1',
  sessionValid: true,
  justification: 'Confirmado com o responsável do tenant.',
  permissions: ['tenant.manage'],
  scope: 'tenant' as const,
  decision: 'keep_remote' as const,
};

describe('ConflictResolver', () => {
  it('registra o conflito preservando as duas versões sem escrita automática', async () => {
    const { database, resolver } = await setup();
    const conflict = await resolver.register(input);
    expect(conflict).toMatchObject({
      status: 'open',
      local_version: input.localVersion,
      remote_version: input.remoteVersion,
      organization_id: 'tenant-a',
    });
    expect(await resolver.hasOpenConflicts()).toBe(true);
    await database.close();
  });

  it.each([
    'concurrent_update', 'remote_deleted', 'permission_removed', 'tenant_suspended',
    'session_expired', 'duplicate', 'missing_dependency', 'endpoint_changed',
  ] as const)('classifica %s sem aplicar última escrita vence', async (kind) => {
    const { resolver } = await setup();
    const treatment = resolver.classify(kind);
    expect(treatment.autoResolve).toBe(false);
    expect(treatment.preserveBoth).toBe(true);
  });

  it('marca permissão removida como failed e sessão expirada como retorno a pending', async () => {
    const { resolver } = await setup();
    expect(resolver.classify('permission_removed').outboxOutcome).toBe('failed');
    expect(resolver.classify('session_expired').outboxOutcome).toBe('pending');
    expect(resolver.classify('tenant_suspended').outboxOutcome).toBe('blocked');
    expect(resolver.classify('missing_dependency').outboxOutcome).toBe('defer');
    expect(resolver.classify('duplicate').outboxOutcome).toBe('synced');
  });

  it('exige sessão vigente, justificativa e permissão adequada ao escopo', async () => {
    const { resolver, audit } = await setup();
    const conflict = await resolver.register(input);
    await expect(resolver.resolve(conflict.id, { ...authorized, sessionValid: false })).rejects.toThrow(/sessão/i);
    await expect(resolver.resolve(conflict.id, { ...authorized, justification: '  ' })).rejects.toThrow(/justificativa/i);
    await expect(resolver.resolve(conflict.id, { ...authorized, permissions: [] })).rejects.toThrow(/permissão/i);
    await expect(resolver.resolve(conflict.id, { ...authorized, scope: 'global' })).rejects.toThrow(/permissão/i);
    expect(audit).not.toHaveBeenCalled();
    expect(await resolver.hasOpenConflicts()).toBe(true);
  });

  it('resolve no escopo global somente com platform.manage', async () => {
    const { resolver } = await setup();
    const conflict = await resolver.register(input);
    const resolved = await resolver.resolve(conflict.id, { ...authorized, scope: 'global', permissions: ['platform.manage'] });
    expect(resolved.status).toBe('resolved');
  });

  it('audita sync.conflict.resolve de forma sanitizada, sem payload completo', async () => {
    const { resolver, audit } = await setup();
    const conflict = await resolver.register(input);
    await resolver.resolve(conflict.id, authorized);
    expect(audit).toHaveBeenCalledTimes(1);
    const event = audit.mock.calls[0]?.[0];
    expect(event).toMatchObject({
      action: 'sync.conflict.resolve',
      actorId: 'actor-1',
      organizationId: 'tenant-a',
      conflictId: conflict.id,
      decision: 'keep_remote',
      localVersion: 2,
      remoteVersion: 3,
    });
    expect(JSON.stringify(event)).not.toContain('blocked');
    expect(JSON.stringify(event)).not.toContain('Confirmado');
    expect(await resolver.hasOpenConflicts()).toBe(false);
  });

  it('não resolve conflito já resolvido nem inexistente', async () => {
    const { resolver } = await setup();
    const conflict = await resolver.register(input);
    await resolver.resolve(conflict.id, authorized);
    await expect(resolver.resolve(conflict.id, authorized)).rejects.toThrow(/já resolvido/i);
    await expect(resolver.resolve('inexistente', authorized)).rejects.toThrow(/não encontrado/i);
  });

  it('isola conflitos por tenant', async () => {
    const { database, resolver } = await setup();
    await resolver.register(input);
    await expect(resolver.register({ ...input, organizationId: 'tenant-b' })).rejects.toThrow(/outro tenant/i);
    database.unlock('tenant-b');
    expect(await resolver.hasOpenConflicts()).toBe(false);
  });

  // Spec 010, T013: conflitos das operações de campo. O registro guarda só um resumo sem dado sensível; os dados originais ficam no item da fila.
  describe('conflitos de campo (Spec 010)', () => {
    const summary = { operation: 'trip.deliver', serial: '12345', queuedAt: '2026-10-12T12:00:00Z', positionInformed: true, recipientInformed: true };
    const field = { organizationId: 'tenant-a', outboxItemId: 'item-1', tripId: 'trip-1', reasonCode: 'TRIP_CLOSED', summary, remote: { tripStatus: 'cancelled' } };

    it.each([
      ['TRIP_CLOSED', 'trip_closed'], ['INVALID_TRANSITION', 'invalid_transition'], ['STOP_CLOSED', 'stop_closed'], ['NOT_FOUND', 'item_not_found'],
      ['STALE_OFFLINE_OPERATION', 'stale_operation'], ['VERSION_CONFLICT', 'version_conflict'], ['VALIDATION_FAILED', 'validation_rejected'], ['CODIGO_NOVO', 'validation_rejected'],
    ] as const)('o código %s vira o tipo %s', async (reasonCode, kind) => {
      const { database, resolver } = await setup();
      const conflict = await resolver.registerFieldConflict({ ...field, reasonCode });
      expect(conflict).toMatchObject({ kind, entity: 'trip', entity_id: 'trip-1', status: 'open', decision: null, outbox_item_id: 'item-1' });
      expect(resolver.classify(kind).outboxOutcome).toBe('conflict');
      await database.close();
    });

    it('guarda só o resumo sem dado sensível e o estado atual do servidor', async () => {
      const { database, resolver } = await setup();
      const conflict = await resolver.registerFieldConflict(field);
      expect(conflict.local_version.data).toEqual(summary);
      expect(conflict.remote_version.data).toEqual({ tripStatus: 'cancelled' });
      await database.close();
    });

    it.each(['latitude', 'longitude', 'recipient_name', 'recipientName', 'signature', 'photo', 'position', 'results', 'value'])('recusa o campo sensível %s no resumo', async (key) => {
      const { database, resolver } = await setup();
      await expect(resolver.registerFieldConflict({ ...field, summary: { ...summary, [key]: 'x' } as never })).rejects.toThrow(/sensível/i);
      expect(await resolver.list()).toEqual([]);
      await database.close();
    });

    it('fechar o conflito grava a decisão e limpa o resumo (nada fica no registro)', async () => {
      const { database, resolver } = await setup();
      const conflict = await resolver.registerFieldConflict(field);
      const closed = await resolver.closeFieldConflict(conflict.id, 'discard_local');
      expect(closed).toMatchObject({ status: 'resolved', decision: 'discard_local', resolved_at: '2026-09-29T12:00:00.000Z' });
      expect(closed.local_version.data).toBeNull();
      expect(closed.remote_version.data).toBeNull();
      expect(await resolver.hasOpenConflicts()).toBe(false);
      await database.close();
    });

    it('reenviar também fecha o conflito, com a decisão keep_local', async () => {
      const { database, resolver } = await setup();
      const conflict = await resolver.registerFieldConflict(field);
      expect((await resolver.closeFieldConflict(conflict.id, 'keep_local')).decision).toBe('keep_local');
      await database.close();
    });

    it('o conflito de campo de um item já fechado não fecha duas vezes', async () => {
      const { database, resolver } = await setup();
      const conflict = await resolver.registerFieldConflict(field);
      await resolver.closeFieldConflict(conflict.id, 'discard_local');
      await expect(resolver.closeFieldConflict(conflict.id, 'discard_local')).rejects.toThrow(/já resolvido/i);
      await database.close();
    });

    it('um segundo conflito do mesmo item da fila reaproveita o registro aberto (sem duplicar)', async () => {
      const { database, resolver } = await setup();
      const first = await resolver.registerFieldConflict(field);
      const second = await resolver.registerFieldConflict({ ...field, reasonCode: 'INVALID_TRANSITION' });
      expect(second.id).toBe(first.id);
      expect(second.kind).toBe('invalid_transition');
      expect(await resolver.list()).toHaveLength(1);
      await database.close();
    });
  });
});
