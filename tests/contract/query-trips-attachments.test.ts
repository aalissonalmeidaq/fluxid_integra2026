// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createQueryTripsHandler, type AttachmentStorage, type OperationsGateway } from '../../supabase/functions/query-trips/handler';

// Spec 010, T051 (RF-022, RF-023; contracts/operacoes-servidor.md §4 e §6): URL assinada de 60 segundos para o anexo, com a permissão do tipo conferida no banco, e a
// contagem de fotos e a assinatura no detalhe da viagem. A permissão e o isolamento de verdade estão no pgTAP (010_attachments.test.sql).
const ORG = '20000000-0000-4000-8000-00000000000a';
const TRIP = '99000000-0000-4000-8000-000000000001';
const DELIVERY = '99000000-0000-4000-8000-0000000000d1';
const ATTACHMENT = 'a0000000-0000-4000-8000-000000000001';
const USER = '10000000-0000-4000-8000-000000000002';

const post = (body: unknown, token: string | null = 'jwt') => new Request('http://local/query-trips', {
  method: 'POST', headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), 'content-type': 'application/json' }, body: JSON.stringify(body),
});
const gateway = (rpc: (name: string, args: Record<string, unknown>) => Record<string, unknown> | Promise<Record<string, unknown>>) => ({
  authenticate: vi.fn(async (token: string) => (token === 'jwt' ? { userId: USER, sessionId: 's1', aal: 'aal1' as const } : null)),
  rpc: vi.fn(async (name: string, args: Record<string, unknown>) => rpc(name, args)),
  audit: vi.fn(async () => undefined),
}) satisfies OperationsGateway;
const storage = (url: string | null = 'https://storage.example.invalid/sign/x?token=t'): AttachmentStorage & { signUrl: ReturnType<typeof vi.fn> } => ({ signUrl: vi.fn(async () => url) }) as never;

describe('get_attachment_url', () => {
  it('assina a URL por 60 segundos e nunca devolve o caminho', async () => {
    const gw = gateway(() => ({ code: 'OK', kind: 'photo', storage_path: `${ORG}/${TRIP}/${DELIVERY}/${ATTACHMENT}.jpg` }));
    const store = storage();
    const response = await createQueryTripsHandler(gw, store)(post({ operation: 'get_attachment_url', organization_id: ORG, attachment_id: ATTACHMENT }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ code: 'FOUND', url: 'https://storage.example.invalid/sign/x?token=t' });
    expect(Date.parse(body.expires_at) - Date.now()).toBeLessThanOrEqual(60_000);
    expect(Date.parse(body.expires_at) - Date.now()).toBeGreaterThan(50_000);
    expect(store.signUrl).toHaveBeenCalledWith(`${ORG}/${TRIP}/${DELIVERY}/${ATTACHMENT}.jpg`, 60);
    expect(JSON.stringify(body)).not.toContain(DELIVERY);
    expect(gw.rpc).toHaveBeenCalledWith('query_attachment_target', { p_actor: USER, p_session: 's1', p_organization: ORG, p_attachment: ATTACHMENT });
  });

  it('anexo de outra organização, sem permissão ou inexistente: a mesma resposta "não encontrado", sem assinar nada', async () => {
    const gw = gateway(() => ({ code: 'NOT_FOUND' }));
    const store = storage();
    const response = await createQueryTripsHandler(gw, store)(post({ operation: 'get_attachment_url', organization_id: ORG, attachment_id: ATTACHMENT }));
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ code: 'NOT_FOUND' });
    expect(store.signUrl).not.toHaveBeenCalled();
  });

  it('sem token: 401; identificador inválido: 400; falha ao assinar: 503', async () => {
    const gw = gateway(() => ({ code: 'OK', storage_path: 'p.jpg' }));
    const handler = createQueryTripsHandler(gw, storage());
    expect((await handler(post({ operation: 'get_attachment_url', organization_id: ORG, attachment_id: ATTACHMENT }, null))).status).toBe(401);
    expect((await handler(post({ operation: 'get_attachment_url', organization_id: ORG, attachment_id: 'x' }))).status).toBe(400);
    expect((await createQueryTripsHandler(gw, storage(null))(post({ operation: 'get_attachment_url', organization_id: ORG, attachment_id: ATTACHMENT }))).status).toBe(503);
    expect((await createQueryTripsHandler(gw)(post({ operation: 'get_attachment_url', organization_id: ORG, attachment_id: ATTACHMENT }))).status).toBe(503);
  });

  it('erro do banco: 503 sem detalhe', async () => {
    const gw = gateway(() => { throw new Error('detalhe interno'); });
    const response = await createQueryTripsHandler(gw, storage())(post({ operation: 'get_attachment_url', organization_id: ORG, attachment_id: ATTACHMENT }));
    expect(response.status).toBe(503);
    expect(JSON.stringify(await response.json())).not.toContain('detalhe');
  });
});

describe('get_trip com anexos', () => {
  const detail = { code: 'FOUND', trip: { id: TRIP }, deliveries: [{ id: DELIVERY, stop_id: 's1' }, { id: 'd2', stop_id: 's2' }] };
  const run = (attached: Record<string, unknown>) => {
    const gw = gateway((name) => (name === 'get_trip' ? detail : attached));
    return createQueryTripsHandler(gw, storage())(post({ operation: 'get_trip', organization_id: ORG, trip_id: TRIP }));
  };

  it('junta, por entrega, a contagem de fotos, a assinatura e a lista sem caminho', async () => {
    const response = await run({ code: 'OK', deliveries: [{ delivery_id: DELIVERY, photo_count: 2, has_signature: true, attachments: [{ id: ATTACHMENT, kind: 'photo', position: 1, captured_at: 'x', added_later: false }] }] });
    const body = await response.json();
    expect(body.deliveries[0]).toMatchObject({ id: DELIVERY, photo_count: 2, has_signature: true });
    expect(body.deliveries[0].attachments).toHaveLength(1);
    expect(body.deliveries[1]).toMatchObject({ id: 'd2', photo_count: 0, has_signature: false, attachments: [] });
    expect(JSON.stringify(body)).not.toMatch(/storage_path|\.jpg|trip-evidence/);
  });

  it('se a consulta dos anexos falhar, o detalhe segue sem eles', async () => {
    const response = await run({ code: 'ACCESS_DENIED' });
    expect(response.status).toBe(200);
    expect((await response.json()).deliveries[0].photo_count).toBeUndefined();
  });

  it('o detalhe negado ou inexistente passa direto', async () => {
    const gw = gateway(() => ({ code: 'NOT_FOUND' }));
    const response = await createQueryTripsHandler(gw)(post({ operation: 'get_trip', organization_id: ORG, trip_id: TRIP }));
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ code: 'NOT_FOUND' });
  });
});
