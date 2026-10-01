import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LocalDatabase } from '../../src/infrastructure/local-database/local-database';
import { SyncOutbox } from '../../src/infrastructure/synchronization/sync-outbox';
import { TenantContextService, type TenantContextPorts } from '../../src/application/identity/tenant-context-service';
import type { MembershipRecord } from '../../src/domain/identity/tenant-selection';

const A = '20000000-0000-0000-0000-00000000000a';
const B = '20000000-0000-0000-0000-00000000000b';
const C = '20000000-0000-0000-0000-00000000000c';

const membership = (organizationId: string, name: string, over: Partial<MembershipRecord> = {}): MembershipRecord => ({
  membershipId: `m-${name}`, organizationId, membershipStatus: 'active',
  organization: { id: organizationId, kind: 'tenant', status: 'active', displayName: name }, ...over,
});

const names: string[] = [];
afterEach(async () => {
  await Promise.all(names.splice(0).map((name) => new Promise<void>((resolve) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = request.onerror = request.onblocked = () => resolve();
  })));
});

async function setup(records: MembershipRecord[] = [membership(A, 'Tenant A'), membership(B, 'Tenant B')], overrides: Partial<TenantContextPorts> = {}) {
  const name = `tenant-switch-${crypto.randomUUID()}`;
  names.push(name);
  const database = new LocalDatabase(name);
  await database.open();
  const state = { records };
  const events: string[] = [];
  const service = new TenantContextService({
    database,
    fetchMemberships: async () => state.records,
    pauseMutations: () => { events.push('pause'); },
    resumeMutations: () => { events.push('resume'); },
    ...overrides,
  });
  const outbox = new SyncOutbox(database);
  const enqueue = (organizationId: string) => outbox.enqueue({ organizationId, actorId: 'actor-1', deviceId: 'device-1', operation: 'future-domain.operation', payload: { marker: organizationId }, version: 1 });
  return { database, service, outbox, enqueue, state, events };
}

describe('seleção de tenant: estado e elegibilidade', () => {
  it('com mais de um vínculo exige escolha e mantém a base local bloqueada', async () => {
    const { service, database } = await setup();
    const snapshot = await service.load();
    expect(snapshot.selection.kind).toBe('choose');
    expect(snapshot.activeOrganizationId).toBeNull();
    await expect(database.list('local_outbox')).rejects.toThrow(/bloqueada/i);
  });

  it('com um único vínculo seleciona e desbloqueia sem etapa de escolha', async () => {
    const { service, database } = await setup([membership(A, 'Tenant A')]);
    const snapshot = await service.load();
    expect(snapshot.activeOrganizationId).toBe(A);
    expect(database.activeTenant).toBe(A);
  });

  it('sem vínculo elegível não há contexto e a base permanece bloqueada', async () => {
    const { service, database } = await setup([membership(A, 'Tenant A', { membershipStatus: 'blocked' })]);
    expect((await service.load()).selection.kind).toBe('none');
    await expect(database.list('local_outbox')).rejects.toThrow(/bloqueada/i);
  });

  it('recusa identificador adulterado e mantém o contexto atual intacto', async () => {
    const { service, database } = await setup();
    await service.load();
    expect((await service.select(A)).ok).toBe(true);
    expect(await service.select(C)).toEqual({ ok: false, reason: 'not_eligible' });
    expect(await service.select({ organizationId: B })).toEqual({ ok: false, reason: 'not_eligible' });
    expect(service.snapshot().activeOrganizationId).toBe(A);
    expect(database.activeTenant).toBe(A);
  });

  it('reavalia a elegibilidade no servidor a cada seleção, ignorando opções antigas', async () => {
    const { service, state } = await setup();
    await service.load();
    state.records = [membership(A, 'Tenant A'), membership(B, 'Tenant B', { membershipStatus: 'blocked' })];
    expect(await service.select(B)).toEqual({ ok: false, reason: 'not_eligible' });
  });

  it('não altera o contexto quando a consulta de vínculos falha', async () => {
    const { service, database, state } = await setup();
    await service.load();
    await service.select(A);
    const failing = new TenantContextService({ database, fetchMemberships: async () => { throw new Error('offline'); } });
    expect(await failing.select(B)).toEqual({ ok: false, reason: 'unavailable' });
    expect(database.activeTenant).toBe(A);
    expect(state.records).toHaveLength(2);
  });
});

describe('troca de tenant: isolamento, limpeza e preservação', () => {
  it('trava a base, limpa o contexto anterior e só então libera o novo tenant', async () => {
    const { service, database } = await setup();
    await service.load();
    await service.select(A);
    const seen: Array<string | null> = [];
    service.onClear(() => { seen.push((() => { try { return database.activeTenant; } catch { return null; } })()); });
    await service.select(B);
    expect(seen).toEqual([null]);
    expect(database.activeTenant).toBe(B);
  });

  it('pausa novas mutações durante a troca e as retoma ao concluir', async () => {
    const { service, events } = await setup();
    await service.load();
    await service.select(A);
    events.length = 0;
    await service.select(B);
    expect(events).toEqual(['pause', 'resume']);
  });

  it('o tenant novo não enxerga outbox, cursor nem conflitos do anterior', async () => {
    const { service, database, enqueue } = await setup();
    await service.load();
    await service.select(A);
    await enqueue(A);
    await database.put('local_sync_cursors', { id: 'cursor-a', organization_id: A, collection: 'x', cursor_value: '1' });
    await database.put('local_sync_conflicts', { id: 'conflict-a', organization_id: A, entity_type: 'x' });
    await service.select(B);
    expect(await database.list('local_outbox')).toEqual([]);
    expect(await database.list('local_sync_cursors')).toEqual([]);
    expect(await database.list('local_sync_conflicts')).toEqual([]);
  });

  it('preserva a pendência do tenant anterior, inacessível, e a devolve intacta ao voltar', async () => {
    const { service, database, enqueue, outbox } = await setup();
    await service.load();
    await service.select(A);
    const item = await enqueue(A);
    await service.select(B);
    await enqueue(B);
    expect((await outbox.list()).map((entry) => entry.organization_id)).toEqual([B]);
    await service.select(A);
    const restored = await outbox.list();
    expect(restored).toHaveLength(1);
    expect(restored[0]).toMatchObject({ id: item.id, organization_id: A, status: 'pending', payload: { marker: A } });
    await expect(database.put('local_outbox', { ...item, id: 'cross', organization_id: B })).rejects.toThrow(/outro tenant/i);
  });

  it('selecionar o tenant já ativo não trava nem limpa nada', async () => {
    const { service } = await setup();
    await service.load();
    await service.select(A);
    const clear = vi.fn();
    service.onClear(clear);
    expect((await service.select(A)).ok).toBe(true);
    expect(clear).not.toHaveBeenCalled();
  });

  it('falha fechado: se a limpeza falhar a base permanece bloqueada e o contexto é descartado', async () => {
    const { service, database, events } = await setup();
    await service.load();
    await service.select(A);
    service.onClear(() => { throw new Error('falha ao limpar'); });
    expect(await service.select(B)).toEqual({ ok: false, reason: 'switch_failed' });
    expect(service.snapshot().activeOrganizationId).toBeNull();
    await expect(database.list('local_outbox')).rejects.toThrow(/bloqueada/i);
    expect(events.at(-1)).toBe('resume');
  });

  it('serializa trocas concorrentes: a base termina desbloqueada exatamente para o último pedido', async () => {
    const { service, database } = await setup([membership(A, 'Tenant A'), membership(B, 'Tenant B'), membership(C, 'Tenant C')]);
    await service.load();
    const results = await Promise.all([service.select(A), service.select(B), service.select(C)]);
    expect(results.every((result) => result.ok)).toBe(true);
    expect(service.snapshot().activeOrganizationId).toBe(C);
    expect(database.activeTenant).toBe(C);
  });

  it('permite remover o registro de limpeza', async () => {
    const { service } = await setup();
    await service.load();
    await service.select(A);
    const clear = vi.fn();
    const remove = service.onClear(clear);
    remove();
    await service.select(B);
    expect(clear).not.toHaveBeenCalled();
  });
});

describe('reavaliação do contexto ativo', () => {
  it('tenant suspenso durante a sessão: o contexto é descartado e a base trava', async () => {
    const { service, database, state } = await setup([membership(A, 'Tenant A'), membership(B, 'Tenant B')]);
    await service.load();
    await service.select(A);
    state.records = [
      membership(A, 'Tenant A', { organization: { id: A, kind: 'tenant', status: 'suspended', displayName: 'Tenant A' } }),
      membership(B, 'Tenant B'),
      membership(C, 'Tenant C'),
    ];
    const snapshot = await service.load();
    expect(snapshot.activeOrganizationId).toBeNull();
    expect(snapshot.selection.kind).toBe('choose');
    await expect(database.list('local_outbox')).rejects.toThrow(/bloqueada/i);
  });

  it('se sobra um único vínculo elegível ele é selecionado, com troca isolada', async () => {
    const { service, database, state, enqueue, outbox } = await setup();
    await service.load();
    await service.select(A);
    await enqueue(A);
    state.records = [membership(B, 'Tenant B')];
    const snapshot = await service.load();
    expect(snapshot.activeOrganizationId).toBe(B);
    expect(database.activeTenant).toBe(B);
    expect(await outbox.list()).toEqual([]);
  });

  it('mantém o contexto e os dados quando o tenant continua elegível', async () => {
    const { service, enqueue, outbox } = await setup();
    await service.load();
    await service.select(A);
    await enqueue(A);
    await service.load();
    expect(service.snapshot().activeOrganizationId).toBe(A);
    expect(await outbox.list()).toHaveLength(1);
  });

  it('falha de consulta ao reavaliar não concede nem revoga silenciosamente o contexto', async () => {
    const { service, database } = await setup();
    await service.load();
    await service.select(A);
    const offline = new TenantContextService({ database, fetchMemberships: async () => { throw new Error('offline'); } });
    const snapshot = await offline.load();
    expect(snapshot.status).toBe('error');
    expect(database.activeTenant).toBe(A);
  });
});

describe('opções elegíveis no estado do serviço', () => {
  it('expõe as opções elegíveis ordenadas, mesmo com um tenant selecionado, e as limpa ao encerrar', async () => {
    const { service } = await setup();
    expect(service.snapshot().options).toEqual([]);
    await service.load();
    expect(service.snapshot().options.map((option) => option.displayName)).toEqual(['Tenant A', 'Tenant B']);
    await service.select(B);
    expect(service.snapshot().options.map((option) => option.organizationId)).toEqual([A, B]);
    await service.release();
    expect(service.snapshot().options).toEqual([]);
  });

  it('atualiza as opções quando a elegibilidade muda', async () => {
    const { service, state } = await setup();
    await service.load();
    await service.select(A);
    state.records = [membership(A, 'Tenant A')];
    await service.load();
    expect(service.snapshot().options.map((option) => option.organizationId)).toEqual([A]);
  });

  it('não expõe opções quando a consulta falha na carga inicial', async () => {
    const { database } = await setup();
    const offline = new TenantContextService({ database, fetchMemberships: async () => { throw new Error('offline'); } });
    await offline.load();
    expect(offline.snapshot().options).toEqual([]);
  });
});

describe('confirmação do contexto ativo (gate de sincronização)', () => {
  it('confirma somente quando o tenant ativo continua elegível no servidor', async () => {
    const { service, state } = await setup();
    await service.load();
    expect(await service.confirm()).toBe(false);
    await service.select(A);
    expect(await service.confirm()).toBe(true);
    state.records = [membership(A, 'Tenant A', { membershipStatus: 'blocked' }), membership(B, 'Tenant B')];
    expect(await service.confirm()).toBe(false);
  });

  it('não confirma quando a consulta falha, sem alterar o contexto nem a base', async () => {
    const { service, database } = await setup();
    await service.load();
    await service.select(A);
    const offline = new TenantContextService({ database, fetchMemberships: async () => { throw new Error('offline') } });
    await offline.load();
    expect(await offline.confirm()).toBe(false);
    expect(database.activeTenant).toBe(A);
  });

  it('não confirma quando o tenant é confirmado no servidor mas a base local está travada em outro contexto', async () => {
    const { service, database } = await setup();
    await service.load();
    await service.select(A);
    database.lock();
    expect(await service.confirm()).toBe(false);
  });
});

describe('encerramento da sessão', () => {
  it('trava a base, limpa o contexto e preserva a pendência bloqueada até nova autenticação equivalente', async () => {
    const { service, database, enqueue, outbox } = await setup();
    await service.load();
    await service.select(A);
    await enqueue(A);
    const clear = vi.fn();
    service.onClear(clear);
    await service.release();
    expect(clear).toHaveBeenCalledTimes(1);
    expect(service.snapshot()).toMatchObject({ status: 'idle', activeOrganizationId: null });
    await expect(database.list('local_outbox')).rejects.toThrow(/bloqueada/i);
    await service.load();
    await service.select(A);
    expect(await outbox.list()).toHaveLength(1);
  });

  it('notifica os assinantes a cada mudança de estado', async () => {
    const { service } = await setup();
    const listener = vi.fn();
    const stop = service.subscribe(listener);
    await service.load();
    await service.select(A);
    await service.release();
    expect(listener).toHaveBeenCalled();
    const calls = listener.mock.calls.length;
    stop();
    await service.load();
    expect(listener).toHaveBeenCalledTimes(calls);
  });
});
