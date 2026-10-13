// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createManageTripsHandler } from '../../supabase/functions/manage-trips/handler';
import type { OperationsGateway } from '../../supabase/functions/_shared/operations';

// Spec 010, T034 (RF-013, CA-002): `resolve_sync_conflict` registra a decisão (descartar com justificativa, ou reenviar) sobre uma operação de campo
// recusada. A borda confere o formato; a permissão, a justificativa de 5 a 500 caracteres e a regra de "já descartado" são do banco
// (supabase/tests/010_resolve_conflict.test.sql).
const ORG = '20000000-0000-4000-8000-00000000000a';
const REQUEST = 'a0000000-0000-4000-8000-000000000001';
const SOURCE = 'a0000000-0000-4000-8000-000000000002';
const TRIP = '99000000-0000-4000-8000-000000000001';

const gateway = (result: Record<string, unknown>): OperationsGateway & { rpc: ReturnType<typeof vi.fn>; audit: ReturnType<typeof vi.fn> } => ({
  authenticate: vi.fn(async () => ({ userId: '10000000-0000-4000-8000-000000000002', sessionId: '60000000-0000-4000-8000-0000001003a2', aal: 'aal1' as const })),
  rpc: vi.fn(async () => result),
  audit: vi.fn(async () => undefined),
}) as never;
const post = (body: unknown) => new Request('http://local/fn', { method: 'POST', headers: { authorization: 'Bearer jwt', 'content-type': 'application/json' }, body: JSON.stringify(body) });
const discard = { operation: 'resolve_sync_conflict', organization_id: ORG, request_id: REQUEST, trip_id: TRIP, source_request_id: SOURCE, decision: 'discard', justification: 'Viagem cancelada pelo gestor' };
const resubmit = { operation: 'resolve_sync_conflict', organization_id: ORG, request_id: REQUEST, trip_id: TRIP, source_request_id: SOURCE, decision: 'resubmit' };

describe('resolve_sync_conflict', () => {
  it('descartar: passa a decisão, o pedido original e a justificativa ao banco', async () => {
    const gw = gateway({ code: 'RESOLVED', decision: 'discard' });
    const response = await createManageTripsHandler(gw)(post(discard));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ code: 'RESOLVED', decision: 'discard' });
    expect(gw.rpc).toHaveBeenCalledWith('resolve_sync_conflict', expect.objectContaining({
      p_organization: ORG, p_request: REQUEST, p_trip: TRIP, p_source_request: SOURCE, p_decision: 'discard', p_justification: 'Viagem cancelada pelo gestor',
    }));
  });

  it('reenviar: a justificativa vai nula', async () => {
    const gw = gateway({ code: 'RESOLVED', decision: 'resubmit' });
    expect((await createManageTripsHandler(gw)(post(resubmit))).status).toBe(200);
    expect(gw.rpc).toHaveBeenCalledWith('resolve_sync_conflict', expect.objectContaining({ p_decision: 'resubmit', p_justification: null }));
  });

  it.each([
    ['sem a decisão', { ...discard, decision: undefined }],
    ['decisão fora da lista', { ...discard, decision: 'apagar' }],
    ['sem o pedido original', { ...discard, source_request_id: undefined }],
    ['pedido original que não é uuid', { ...discard, source_request_id: 'abc' }],
    ['sem a viagem', { ...discard, trip_id: undefined }],
    ['sem o request_id', { ...discard, request_id: undefined }],
    ['justificativa com mais de 500 caracteres', { ...discard, justification: 'x'.repeat(501) }],
  ])('recusa %s antes de chamar o banco', async (_label, body) => {
    const gw = gateway({ code: 'RESOLVED' });
    expect((await createManageTripsHandler(gw)(post(body))).status).toBe(400);
    expect(gw.rpc).not.toHaveBeenCalled();
  });

  it.each([
    ['VALIDATION_FAILED', 400], ['NOT_FOUND', 404], ['ALREADY_RESOLVED', 409], ['ACCESS_DENIED', 403], ['AUTH_REQUIRED', 401],
  ])('%s vira %i', async (code, status) => {
    expect((await createManageTripsHandler(gateway({ code }))(post(discard))).status).toBe(status);
  });

  it('a negação de permissão é auditada, sem a justificativa', async () => {
    const gw = gateway({ code: 'ACCESS_DENIED' });
    await createManageTripsHandler(gw)(post(discard));
    expect(gw.audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'trip.sync_conflict_resolve', result: 'denied', reason: 'permission_denied' }));
    expect(JSON.stringify(gw.audit.mock.calls)).not.toContain('cancelada');
  });

  it('a decisão não é uma operação da fila: não aceita queued_at nem grava a trilha pela borda', async () => {
    const gw = gateway({ code: 'RESOLVED' });
    await createManageTripsHandler(gw)(post({ ...discard, queued_at: '2026-10-12T12:00:00Z' }));
    expect(gw.rpc.mock.calls.map((call) => call[0])).toEqual(['resolve_sync_conflict']);
    expect(gw.rpc.mock.calls[0]![1]).not.toHaveProperty('p_queued_at');
  });
});
