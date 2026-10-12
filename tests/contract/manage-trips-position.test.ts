// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createManageTripsHandler } from '../../supabase/functions/manage-trips/handler';
import type { OperationsGateway } from '../../supabase/functions/_shared/operations';

// Spec 009, US2 (RF-009 a RF-014): a chegada e a entrega aceitam a posição lida pelo aparelho, sempre opcional, com a origem, a precisão e o
// horário da leitura. A borda confere o formato e o banco repete as regras (supabase/tests/009_position.test.sql).
const ORG = '20000000-0000-4000-8000-00000000000a';
const REQUEST = 'a0000000-0000-4000-8000-000000000001';
const TRIP = '99000000-0000-4000-8000-000000000001';
const STOP = '9a000000-0000-4000-8000-000000000001';
const ITEM = '9b000000-0000-4000-8000-000000000001';
const READ_AT = '2026-10-13T15:29:30Z';

const gateway = (result: Record<string, unknown>): OperationsGateway & { rpc: ReturnType<typeof vi.fn> } => ({
  authenticate: vi.fn(async () => ({ userId: '10000000-0000-4000-8000-000000000002', sessionId: '60000000-0000-4000-8000-0000000900a2', aal: 'aal1' as const })),
  rpc: vi.fn(async () => result),
  audit: vi.fn(async () => undefined),
}) as never;
const post = (body: unknown) => new Request('http://local/fn', { method: 'POST', headers: { authorization: 'Bearer jwt', 'content-type': 'application/json' }, body: JSON.stringify(body) });

const arrive = { operation: 'arrive_stop', organization_id: ORG, request_id: REQUEST, trip_id: TRIP, stop_id: STOP };
const deliver = {
  operation: 'register_delivery', organization_id: ORG, request_id: REQUEST, trip_id: TRIP, stop_id: STOP, delivered_at: '2026-10-13T15:30:00Z',
  recipient_name: 'Recebedor Fictício', results: [{ item_id: ITEM, delivered: true }],
};

describe('arrive_stop com posição', () => {
  it('passa a posição, a precisão, a origem e o horário da leitura ao banco', async () => {
    const gw = gateway({ code: 'ARRIVED' });
    const response = await createManageTripsHandler(gw)(post({ ...arrive, latitude: -23.5505, longitude: -46.6333, accuracy_m: 12.4, position_source: 'gps', position_read_at: READ_AT }));
    expect(response.status).toBe(200);
    expect(gw.rpc).toHaveBeenCalledWith('arrive_stop', expect.objectContaining({
      p_latitude: -23.5505, p_longitude: -46.6333, p_accuracy_m: 12.4, p_position_source: 'gps', p_position_read_at: READ_AT,
    }));
  });

  it('sem posição, manda tudo nulo e a chegada continua como na Spec 008', async () => {
    const gw = gateway({ code: 'ARRIVED' });
    await createManageTripsHandler(gw)(post(arrive));
    expect(gw.rpc).toHaveBeenCalledWith('arrive_stop', expect.objectContaining({
      p_latitude: null, p_longitude: null, p_accuracy_m: null, p_position_source: null, p_position_read_at: null,
    }));
  });

  it('a chegada não tem "no endereço da unidade": a origem só pode ser "gps" ou "typed"', async () => {
    const gw = gateway({ code: 'ARRIVED' });
    expect((await createManageTripsHandler(gw)(post({ ...arrive, latitude: -23.5, longitude: -46.6, position_source: 'site_address' }))).status).toBe(400);
    expect(gw.rpc).not.toHaveBeenCalled();
  });

  it.each([
    ['latitude acima de 90', { latitude: 91, longitude: -46.6 }],
    ['longitude abaixo de -180', { latitude: -23.5, longitude: -181 }],
    ['latitude que não é número', { latitude: '-23,5', longitude: -46.6 }],
    ['precisão negativa', { latitude: -23.5, longitude: -46.6, accuracy_m: -1 }],
    ['precisão acima de 100000', { latitude: -23.5, longitude: -46.6, accuracy_m: 100001 }],
    ['origem desconhecida', { latitude: -23.5, longitude: -46.6, position_source: 'bogus' }],
    ['horário da leitura sem fuso', { latitude: -23.5, longitude: -46.6, position_source: 'gps', position_read_at: '2026-10-13 15:29' }],
  ])('recusa %s com 400 e nenhuma chamada ao banco', async (_nome, extra) => {
    const gw = gateway({ code: 'ARRIVED' });
    expect((await createManageTripsHandler(gw)(post({ ...arrive, ...extra }))).status).toBe(400);
    expect(gw.rpc).not.toHaveBeenCalled();
  });

  it('o resultado devolve a marca de fora da geocerca ao cliente', async () => {
    const gw = gateway({ code: 'ARRIVED', out_of_order: false, outside_geofence: true });
    const response = await createManageTripsHandler(gw)(post({ ...arrive, latitude: -23.5, longitude: -46.6 }));
    expect(await response.json()).toMatchObject({ code: 'ARRIVED', outside_geofence: true });
  });
});

describe('register_delivery com origem, precisão e horário da leitura', () => {
  it.each(['gps', 'typed', 'site_address'])('aceita a origem "%s"', async (source) => {
    const gw = gateway({ code: 'DELIVERED' });
    const body = source === 'site_address' ? { at_site_address: true } : { latitude: -23.55, longitude: -46.63 };
    const response = await createManageTripsHandler(gw)(post({ ...deliver, ...body, accuracy_m: source === 'site_address' ? undefined : 9.5, position_source: source, position_read_at: source === 'gps' ? READ_AT : undefined }));
    expect(response.status).toBe(200);
    expect(gw.rpc).toHaveBeenCalledWith('register_delivery', expect.objectContaining({ p_position_source: source }));
  });

  it('passa a precisão e o horário da leitura', async () => {
    const gw = gateway({ code: 'DELIVERED' });
    await createManageTripsHandler(gw)(post({ ...deliver, latitude: -23.55, longitude: -46.63, accuracy_m: 120, position_source: 'gps', position_read_at: READ_AT }));
    expect(gw.rpc).toHaveBeenCalledWith('register_delivery', expect.objectContaining({ p_accuracy_m: 120, p_position_read_at: READ_AT }));
  });

  it('sem origem, precisão ou horário, manda nulos (a entrega da Spec 008 continua valendo)', async () => {
    const gw = gateway({ code: 'DELIVERED' });
    await createManageTripsHandler(gw)(post(deliver));
    expect(gw.rpc).toHaveBeenCalledWith('register_delivery', expect.objectContaining({ p_accuracy_m: null, p_position_source: null, p_position_read_at: null }));
  });

  it.each([
    ['precisão negativa', { accuracy_m: -5 }],
    ['precisão acima de 100000', { accuracy_m: 100001 }],
    ['origem desconhecida', { position_source: 'wifi' }],
    ['horário da leitura que não é instante', { position_read_at: 'ontem' }],
  ])('recusa %s com 400 e nenhuma chamada ao banco', async (_nome, extra) => {
    const gw = gateway({ code: 'DELIVERED' });
    expect((await createManageTripsHandler(gw)(post({ ...deliver, latitude: -23.55, longitude: -46.63, ...extra }))).status).toBe(400);
    expect(gw.rpc).not.toHaveBeenCalled();
  });

  it('a exclusividade de coordenadas e "no endereço da unidade" da Spec 008 continua recusada na borda', async () => {
    const gw = gateway({ code: 'DELIVERED' });
    expect((await createManageTripsHandler(gw)(post({ ...deliver, latitude: -23.55, longitude: -46.63, at_site_address: true }))).status).toBe(400);
    expect(gw.rpc).not.toHaveBeenCalled();
  });
});
