// @vitest-environment node
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { READING_SOURCES as DOMAIN_SOURCES } from '../../src/domain/field/reading-source';
import { createManageTripsHandler, READING_SOURCES as HANDLER_SOURCES } from '../../supabase/functions/manage-trips/handler';
import type { OperationsGateway } from '../../supabase/functions/_shared/operations';

// Spec 009, US1 (RF-001, RF-001a, RN-002): o método de leitura entra em `check_item` e em `results[]` da entrega, com a lista fechada
// de quatro valores, igual à do domínio e à restrição do banco.
const ROOT = path.resolve(import.meta.dirname, '../..');
const ORG = '20000000-0000-4000-8000-00000000000a';
const REQUEST = 'a0000000-0000-4000-8000-000000000001';
const TRIP = '99000000-0000-4000-8000-000000000001';
const STOP = '9a000000-0000-4000-8000-000000000001';
const ITEM = '9b000000-0000-4000-8000-000000000001';

const gateway = (result: Record<string, unknown> = { code: 'CHECKED' }): OperationsGateway & { rpc: ReturnType<typeof vi.fn> } => ({
  authenticate: vi.fn(async () => ({ userId: '10000000-0000-4000-8000-000000000002', sessionId: '60000000-0000-4000-8000-0000000900a2', aal: 'aal1' as const })),
  rpc: vi.fn(async () => result),
  audit: vi.fn(async () => undefined),
}) as never;
const post = (body: unknown) => new Request('http://local/fn', { method: 'POST', headers: { authorization: 'Bearer jwt', 'content-type': 'application/json' }, body: JSON.stringify(body) });

const check = { operation: 'check_item', organization_id: ORG, request_id: REQUEST, trip_id: TRIP, item_id: ITEM };
const deliver = (results: unknown) => ({
  operation: 'register_delivery', organization_id: ORG, request_id: REQUEST, trip_id: TRIP, stop_id: STOP, delivered_at: '2026-10-13T15:30:00Z',
  recipient_name: 'Recebedor Fictício', results,
});

describe('a lista de métodos é uma só', () => {
  it('a borda, o domínio e a restrição do banco têm os mesmos quatro valores', () => {
    expect([...HANDLER_SOURCES]).toEqual([...DOMAIN_SOURCES]);
    const dir = path.join(ROOT, 'supabase', 'migrations');
    const file = fs.readdirSync(dir).find((name) => name.endsWith('_field_reading_source.sql'))!;
    const sql = fs.readFileSync(path.join(dir, file), 'utf8');
    expect(sql).toContain("check_source is null or check_source in ('manual', 'typed', 'camera', 'nfc')");
  });
});

describe('check_item com método', () => {
  it.each([...HANDLER_SOURCES])('passa o método "%s" ao banco', async (source) => {
    const gw = gateway();
    expect((await createManageTripsHandler(gw)(post({ ...check, source }))).status).toBe(200);
    expect(gw.rpc).toHaveBeenCalledWith('check_item', expect.objectContaining({ p_trip: TRIP, p_item: ITEM, p_source: source }));
  });

  it('sem método, manda nulo e o banco assume "manual"', async () => {
    const gw = gateway();
    await createManageTripsHandler(gw)(post(check));
    expect(gw.rpc).toHaveBeenCalledWith('check_item', expect.objectContaining({ p_source: null }));
  });

  it.each(['scan', 'qr', 'CAMERA', '', 7])('recusa o método %j com 400 e o campo "source"', async (source) => {
    const gw = gateway();
    const response = await createManageTripsHandler(gw)(post({ ...check, source }));
    expect(response.status).toBe(400);
    expect(JSON.stringify(await response.json())).toContain('source');
    expect(gw.rpc).not.toHaveBeenCalled();
  });
});

describe('entrega com método por cilindro', () => {
  it('aceita o método em cada resultado e repassa a lista ao banco', async () => {
    const gw = gateway({ code: 'DELIVERED' });
    const results = [{ item_id: ITEM, delivered: true, source: 'nfc' }, { item_id: '9b000000-0000-4000-8000-000000000002', delivered: true }];
    expect((await createManageTripsHandler(gw)(post(deliver(results)))).status).toBe(200);
    const sent = (gw.rpc.mock.calls[0]![1] as { p_results: { item_id: string; source?: unknown }[] }).p_results;
    expect(sent[0]).toMatchObject({ item_id: ITEM, delivered: true, source: 'nfc' });
    expect(sent[1]!.source ?? null).toBeNull();
  });

  it('recusa método inválido num resultado, com 400 e nenhuma chamada ao banco', async () => {
    const gw = gateway({ code: 'DELIVERED' });
    const response = await createManageTripsHandler(gw)(post(deliver([{ item_id: ITEM, delivered: true, source: 'scan' }])));
    expect(response.status).toBe(400);
    expect(gw.rpc).not.toHaveBeenCalled();
  });
});
