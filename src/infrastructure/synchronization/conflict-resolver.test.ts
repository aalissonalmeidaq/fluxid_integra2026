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
});
