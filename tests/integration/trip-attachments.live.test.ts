// @vitest-environment node
import { createHash } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { endAllSessions, login, logout, publishableKey, supabaseUrl, USERS } from '../support/auth-harness';
import { createEligibleCylinder, createWorld, GADMIN, manageTrips, planBody, queryTrips, requestId, TENANT_G } from '../support/trips-fixtures';

// Spec 010, T059 (CA-001, CA-003, MS-005), contra o Supabase local real: a mesma foto enviada 50 vezes vira um só anexo, um só evento e uma só linha; o mesmo
// `attachment_id` com outro resumo é conflito; o Tenant B não lê o anexo do Tenant A; a URL assinada vale 60 segundos. Exige a função trip-attachments e o
// query-trips novo carregados (`npx supabase stop` e `npx supabase start`).
const jpeg = (marker: number): Uint8Array => {
  const bytes = new Uint8Array(400);
  bytes.set([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0]);
  bytes.fill(marker, 20);
  return bytes;
};
const TENANT_B = '20000000-0000-0000-0000-00000000000b';
const sha = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

async function upload(token: string | null, input: { delivery: string; id: string; bytes: Uint8Array; kind?: string; position?: number; org?: string; hash?: string }) {
  const form = new FormData();
  form.append('organization_id', input.org ?? TENANT_G);
  form.append('delivery_id', input.delivery);
  form.append('attachment_id', input.id);
  form.append('kind', input.kind ?? 'photo');
  form.append('position', String(input.position ?? 1));
  form.append('captured_at', new Date(Date.now() - 60_000).toISOString());
  form.append('sha256', input.hash ?? sha(input.bytes));
  form.append('file', new Blob([input.bytes as unknown as BlobPart], { type: 'image/jpeg' }), 'foto.jpg');
  const response = await fetch(`${supabaseUrl}/functions/v1/trip-attachments`, { method: 'POST', headers: { apikey: publishableKey, ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: form });
  return { status: response.status, body: await response.json().catch(() => null) as Record<string, unknown> | null };
}

const ok = (response: { status: number; body: unknown }, label: string): Record<string, unknown> => {
  if (response.status !== 200) throw new Error(`${label}: HTTP ${response.status} ${JSON.stringify(response.body)}`);
  return response.body as Record<string, unknown>;
};

describe('Fotos e assinatura da entrega ao vivo (Spec 010)', () => {
  let token = '';
  let otherTenant = '';
  let tripId = '';
  let deliveryId = '';

  beforeAll(async () => {
    await endAllSessions(GADMIN);
    await endAllSessions(USERS.tenantBAdmin);
    const [a, b] = [await login(GADMIN), await login(USERS.tenantBAdmin)];
    expect([a.status, b.status]).toEqual([200, 200]);
    token = a.body.session.access_token as string;
    otherTenant = b.body.session.access_token as string;

    const world = await createWorld(token);
    const cylinder = await createEligibleCylinder(token, world.typeId);
    const planned = ok(await manageTrips(token, planBody(world, [{ cylinder_ids: [cylinder.id] }])), 'create_trip');
    tripId = String(planned.trip_id);
    ok(await manageTrips(token, { operation: 'start_loading', organization_id: TENANT_G, request_id: requestId(), trip_id: tripId, expected_version: planned.version }), 'start_loading');
    const detail = ok(await queryTrips(token, { operation: 'get_trip', organization_id: TENANT_G, trip_id: tripId }), 'get_trip');
    const item = (detail.items as Array<{ id: string }>)[0]!;
    const stop = (detail.stops as Array<{ id: string }>)[0]!;
    ok(await manageTrips(token, { operation: 'check_item', organization_id: TENANT_G, request_id: requestId(), trip_id: tripId, item_id: item.id }), 'check_item');
    const loading = ok(await queryTrips(token, { operation: 'get_trip', organization_id: TENANT_G, trip_id: tripId }), 'get_trip');
    ok(await manageTrips(token, { operation: 'start_trip', organization_id: TENANT_G, request_id: requestId(), trip_id: tripId, expected_version: (loading.trip as { version: number }).version }), 'start_trip');
    ok(await manageTrips(token, { operation: 'arrive_stop', organization_id: TENANT_G, request_id: requestId(), trip_id: tripId, stop_id: stop.id }), 'arrive_stop');
    const delivered = ok(await manageTrips(token, {
      operation: 'register_delivery', organization_id: TENANT_G, request_id: requestId(), trip_id: tripId, stop_id: stop.id,
      delivered_at: new Date(Date.now() - 120_000).toISOString(), recipient_name: 'Recebedor Fictício', results: [{ item_id: item.id, delivered: true }],
    }), 'register_delivery');
    deliveryId = String(delivered.delivery_id);
  }, 180_000);

  afterAll(async () => {
    for (const accessToken of [token, otherTenant]) if (accessToken) await logout(accessToken);
    await endAllSessions(GADMIN);
    await endAllSessions(USERS.tenantBAdmin);
  });

  it('exige sessão autenticada', async () => {
    expect((await upload(null, { delivery: deliveryId, id: requestId(), bytes: jpeg(1) })).status).toBe(401);
  });

  it('a mesma foto enviada 50 vezes: um só anexo, um só evento, uma só linha', async () => {
    const id = requestId();
    const bytes = jpeg(2);
    const results = [];
    for (let attempt = 0; attempt < 50; attempt += 1) results.push(await upload(token, { delivery: deliveryId, id, bytes }));
    expect(results.every((result) => result.status === 200), JSON.stringify(results.find((result) => result.status !== 200))).toBe(true);
    expect(results[0]!.body).toMatchObject({ code: 'ATTACHED', kind: 'photo', position: 1 });
    expect(results.slice(1).every((result) => result.body?.code === 'REPLAYED')).toBe(true);
    // A resposta nunca traz caminho nem nome do arquivo.
    expect(JSON.stringify(results[0]!.body)).not.toMatch(/foto\.jpg|trip-evidence|\.jpg/);

    const detail = ok(await queryTrips(token, { operation: 'get_trip', organization_id: TENANT_G, trip_id: tripId }), 'get_trip');
    const delivery = (detail.deliveries as Array<{ photo_count: number; has_signature: boolean; attachments: Array<{ id: string }> }>)[0]!;
    expect(delivery.photo_count).toBe(1);
    expect(delivery.attachments.filter((entry) => entry.id === id)).toHaveLength(1);
    const history = ok(await queryTrips(token, { operation: 'trip_history', organization_id: TENANT_G, trip_id: tripId, event_type: 'evidence_attached' }), 'trip_history');
    expect((history.events as unknown[]).length).toBe(1);
  }, 180_000);

  it('o mesmo attachment_id com outro resumo é conflito, e a quarta foto é recusada', async () => {
    const id = requestId();
    expect((await upload(token, { delivery: deliveryId, id, bytes: jpeg(3), position: 2 })).status).toBe(200);
    expect(await upload(token, { delivery: deliveryId, id, bytes: jpeg(4), position: 2 })).toMatchObject({ status: 409, body: { code: 'ATTACHMENT_CONFLICT' } });
    expect((await upload(token, { delivery: deliveryId, id: requestId(), bytes: jpeg(5), position: 3 })).status).toBe(200);
    expect(await upload(token, { delivery: deliveryId, id: requestId(), bytes: jpeg(6), position: 3 })).toMatchObject({ status: 409, body: { code: 'ATTACHMENT_LIMIT' } });
  }, 60_000);

  it('recusa pelos bytes reais, pelo resumo e pelo tamanho', async () => {
    expect(await upload(token, { delivery: deliveryId, id: requestId(), bytes: Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]) })).toMatchObject({ status: 400, body: { code: 'VALIDATION_FAILED' } });
    expect(await upload(token, { delivery: deliveryId, id: requestId(), bytes: jpeg(7), hash: 'a'.repeat(64) })).toMatchObject({ status: 400, body: { code: 'VALIDATION_FAILED' } });
    const big = new Uint8Array(1_600_000);
    big.set([0xff, 0xd8, 0xff]);
    expect(await upload(token, { delivery: deliveryId, id: requestId(), bytes: big, position: 3 })).toMatchObject({ status: 400 });
  }, 60_000);

  it('o Tenant B não anexa à entrega do Tenant A nem lê o anexo', async () => {
    // Com a organização do A, o B é recusado; com a do B, a entrega do A não existe para ele.
    expect([403, 404]).toContain((await upload(otherTenant, { delivery: deliveryId, id: requestId(), bytes: jpeg(8) })).status);
    const attempt = await upload(otherTenant, { delivery: deliveryId, id: requestId(), bytes: jpeg(8), org: TENANT_B });
    expect([403, 404]).toContain(attempt.status);
    const detail = ok(await queryTrips(token, { operation: 'get_trip', organization_id: TENANT_G, trip_id: tripId }), 'get_trip');
    const attachment = (detail.deliveries as Array<{ attachments: Array<{ id: string }> }>)[0]!.attachments[0]!;
    const denied = await queryTrips(otherTenant, { operation: 'get_attachment_url', organization_id: TENANT_G, attachment_id: attachment.id });
    expect([403, 404]).toContain(denied.status);
    const missing = await queryTrips(token, { operation: 'get_attachment_url', organization_id: TENANT_G, attachment_id: requestId() });
    expect(missing.status).toBe(404);
  }, 60_000);

  it('a URL assinada entrega a foto e expira em 60 segundos', async () => {
    const detail = ok(await queryTrips(token, { operation: 'get_trip', organization_id: TENANT_G, trip_id: tripId }), 'get_trip');
    const attachment = (detail.deliveries as Array<{ attachments: Array<{ id: string }> }>)[0]!.attachments[0]!;
    const signed = ok(await queryTrips(token, { operation: 'get_attachment_url', organization_id: TENANT_G, attachment_id: attachment.id }), 'get_attachment_url');
    expect(Date.parse(String(signed.expires_at)) - Date.now()).toBeLessThanOrEqual(61_000);
    // A borda assina com o endereço interno do servidor: troca-se só a origem, como faz o aplicativo.
    const fetched = await fetch(`${supabaseUrl}${new URL(String(signed.url)).pathname}${new URL(String(signed.url)).search}`);
    expect(fetched.status).toBe(200);
    expect(fetched.headers.get('content-type')).toContain('image/jpeg');
    expect(new Uint8Array(await fetched.arrayBuffer())[0]).toBe(0xff);
    // O token da URL traz o prazo: depois dele, nada sai (o Storage recusa; aqui só confere que o prazo declarado é de 60 s).
    const token60 = new URL(String(signed.url)).searchParams.get('token');
    const payload = JSON.parse(Buffer.from(String(token60).split('.')[1]!, 'base64url').toString()) as { exp: number; iat?: number };
    expect(payload.exp - Math.floor(Date.now() / 1000)).toBeLessThanOrEqual(60);
  }, 60_000);

  it('o cliente não escreve no bucket nem na tabela', async () => {
    const response = await fetch(`${supabaseUrl}/storage/v1/object/trip-evidence/${TENANT_G}/x/y/z.jpg`, {
      method: 'POST', headers: { apikey: publishableKey, authorization: `Bearer ${token}`, 'content-type': 'image/jpeg' }, body: jpeg(9) as unknown as BodyInit,
    });
    expect(response.status).toBeGreaterThanOrEqual(400);
    const direct = await fetch(`${supabaseUrl}/rest/v1/trip_delivery_attachments`, {
      method: 'POST', headers: { apikey: publishableKey, authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ id: requestId() }),
    });
    expect(direct.status).toBeGreaterThanOrEqual(400);
  });
});
