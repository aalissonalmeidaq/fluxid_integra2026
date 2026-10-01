import { describe, expect, it, vi } from 'vitest';
import { AuditService } from './audit-service';

const TENANT = '20000000-0000-0000-0000-00000000000a';
const ACTOR = '10000000-0000-0000-0000-000000000002';

const raw = {
  id: 7, organization_id: TENANT, actor: { id: ACTOR, display_name: 'Administrador A' }, action: 'role.create', target_type: 'role',
  target_id: 'r1', result: 'success', reason_code: null, justification: 'Papel aprovado', origin: 'database',
  occurred_at: '2026-09-30T12:00:00+00:00', metadata: { permissions: ['audit.read'] },
};
const view = {
  id: 7, organizationId: TENANT, actor: { id: ACTOR, displayName: 'Administrador A' }, action: 'role.create', targetType: 'role',
  targetId: 'r1', result: 'success', reasonCode: null, justification: 'Papel aprovado', origin: 'database',
  occurredAt: '2026-09-30T12:00:00+00:00', metadata: { permissions: ['audit.read'] },
};

const ok = (body: unknown, status = 200) => ({ status, body });
const serviceWith = (response: { status: number; body: unknown } | Error) => {
  const call = vi.fn(async () => { if (response instanceof Error) throw response; return response; });
  return { call, service: new AuditService({ call }) };
};
const tenant = { scope: 'tenant' as const, organizationId: TENANT };

describe('AuditService.query', () => {
  it('monta o pedido do tenant com filtros e cursor no formato do contrato', async () => {
    const { service, call } = serviceWith(ok({ code: 'AUDIT_LISTED', events: [], next: null }));
    await service.query(tenant, { from: '2026-01-01T00:00:00Z', to: '2026-01-31T23:59:59Z', action: 'role.create', result: 'denied', actorId: ACTOR, targetType: 'role' }, { occurredAt: '2026-01-05T10:00:00Z', id: 12 }, 25);
    expect(call).toHaveBeenCalledWith({
      scope: 'tenant', organization_id: TENANT, from: '2026-01-01T00:00:00Z', to: '2026-01-31T23:59:59Z', action: 'role.create', result: 'denied',
      actor_id: ACTOR, target_type: 'role', before: { occurred_at: '2026-01-05T10:00:00Z', id: 12 }, limit: 25,
    });
  });

  it('no escopo global não envia organização', async () => {
    const { service, call } = serviceWith(ok({ code: 'AUDIT_LISTED', events: [], next: null }));
    await service.query({ scope: 'global' });
    expect(call).toHaveBeenCalledWith({ scope: 'global' });
  });

  it('omite filtros vazios ou em branco em vez de enviá-los', async () => {
    const { service, call } = serviceWith(ok({ code: 'AUDIT_LISTED', events: [], next: null }));
    await service.query(tenant, { action: '  ', targetType: '', from: '', result: undefined });
    expect(call).toHaveBeenCalledWith({ scope: 'tenant', organization_id: TENANT });
  });

  it('converte eventos e o cursor da próxima página', async () => {
    const { service } = serviceWith(ok({ code: 'AUDIT_LISTED', events: [raw], next: { occurred_at: '2026-09-30T12:00:00+00:00', id: 7 } }));
    expect(await service.query(tenant)).toEqual({ kind: 'success', value: { events: [view], next: { occurredAt: '2026-09-30T12:00:00+00:00', id: 7 } } });
  });

  it('descarta eventos malformados em vez de confiar neles', async () => {
    const { service } = serviceWith(ok({ code: 'AUDIT_LISTED', events: [raw, { id: 'x' }, null, { ...raw, result: 'talvez' }, { ...raw, id: 8, actor: null }], next: null }));
    const outcome = await service.query(tenant);
    if (outcome.kind !== 'success') throw new Error('esperava sucesso');
    expect(outcome.value.events.map((event) => event.id)).toEqual([7, 8]);
    expect(outcome.value.events[1]?.actor).toEqual({ id: null, displayName: null });
  });

  it('trata cursor malformado como ausência de próxima página', async () => {
    const { service } = serviceWith(ok({ code: 'AUDIT_LISTED', events: [], next: { occurred_at: 5 } }));
    expect(await service.query(tenant)).toEqual({ kind: 'success', value: { events: [], next: null } });
  });

  it('recusa filtros inválidos no cliente, sem chamar o servidor', async () => {
    const { service, call } = serviceWith(ok({}));
    expect(await service.query(tenant, { action: 'acao com espaço' })).toEqual({ kind: 'invalid' });
    expect(await service.query(tenant, { targetType: 'Tipo/Inválido' })).toEqual({ kind: 'invalid' });
    expect(await service.query(tenant, { from: '2026-02-01T00:00:00Z', to: '2026-01-01T00:00:00Z' })).toEqual({ kind: 'invalid' });
    expect(await service.query(tenant, { from: 'ontem' })).toEqual({ kind: 'invalid' });
    expect(await service.query(tenant, {}, undefined, 101)).toEqual({ kind: 'invalid' });
    expect(call).not.toHaveBeenCalled();
  });

  it.each([
    [403, 'ACCESS_DENIED', 'access_denied'],
    [401, 'AUTH_REQUIRED', 'access_denied'],
    [403, 'MFA_REQUIRED', 'mfa_required'],
    [400, 'VALIDATION_FAILED', 'invalid'],
    [500, 'INTERNAL_ERROR', 'unavailable'],
    [503, 'OUTRO', 'unavailable'],
  ] as const)('mapeia %s/%s para %s sem simular sucesso', async (status, code, kind) => {
    expect((await serviceWith(ok({ code }, status)).service.query(tenant)).kind).toBe(kind);
  });

  it('trata 2xx sem lista, corpo não JSON e exceção de rede como indisponível', async () => {
    expect((await serviceWith(ok({ code: 'AUDIT_LISTED' })).service.query(tenant)).kind).toBe('unavailable');
    expect((await serviceWith(ok(null, 502)).service.query(tenant)).kind).toBe('unavailable');
    expect((await serviceWith(new Error('offline')).service.query(tenant)).kind).toBe('unavailable');
  });
});
