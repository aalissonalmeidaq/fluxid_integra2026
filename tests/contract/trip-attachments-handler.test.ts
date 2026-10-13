// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createTripAttachmentsHandler, type AttachmentsGateway } from '../../supabase/functions/trip-attachments/handler';

// Spec 010, T050 (RF-018 a RF-023; contracts/operacoes-servidor.md §7): a borda das fotos e da assinatura. Autentica, valida o arquivo pelos bytes reais (assinatura,
// tamanho e resumo), grava em duas fases e responde só com `id`, `kind` e `position`. O banco de verdade é provado no pgTAP (010_attachments.test.sql).
const ORG = '20000000-0000-4000-8000-00000000000a';
const DELIVERY = '99000000-0000-4000-8000-0000000000d1';
const ATTACHMENT = 'a0000000-0000-4000-8000-000000000001';
const USER = '10000000-0000-4000-8000-000000000002';

const jpeg = (size = 200): Uint8Array => { const bytes = new Uint8Array(size); bytes.set([0xff, 0xd8, 0xff, 0xe0]); bytes.fill(7, 4); return bytes; };
const png = (size = 200): Uint8Array => { const bytes = new Uint8Array(size); bytes.set([0x89, 0x50, 0x4e, 0x47]); bytes.fill(9, 4); return bytes; };
const sha = async (bytes: Uint8Array): Promise<string> => [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes as unknown as BufferSource))].map((b) => b.toString(16).padStart(2, '0')).join('');

function backend(rpcResults: Record<string, unknown>[] = [{ code: 'READY', storage_path: `${ORG}/t/${DELIVERY}/${ATTACHMENT}.jpg` }, { code: 'ATTACHED', id: ATTACHMENT, kind: 'photo', position: 1 }]) {
  const queue = [...rpcResults];
  const gateway = {
    authenticate: vi.fn(async (token: string) => (token === 'token-a' ? { userId: USER, sessionId: 's-a', aal: 'aal1' as const } : null)),
    rpc: vi.fn(async () => queue.shift() ?? { code: 'SERVICE' }),
    audit: vi.fn(async () => undefined),
    store: vi.fn(async () => undefined),
    remove: vi.fn(async () => undefined),
  } satisfies AttachmentsGateway;
  return { gateway, handler: createTripAttachmentsHandler(gateway) };
}

async function post(handler: (request: Request) => Promise<Response>, over: { bytes?: Uint8Array; kind?: string; position?: string; token?: string | null; fields?: Record<string, string | null>; type?: string } = {}) {
  const bytes = over.bytes ?? jpeg();
  const form = new FormData();
  const fields: Record<string, string | null> = {
    organization_id: ORG, delivery_id: DELIVERY, attachment_id: ATTACHMENT, kind: over.kind ?? 'photo', position: over.position ?? '1',
    captured_at: '2026-10-13T12:00:00Z', sha256: await sha(bytes), ...over.fields,
  };
  for (const [key, value] of Object.entries(fields)) if (value !== null) form.append(key, value);
  form.append('file', new Blob([bytes as unknown as BlobPart], { type: over.type ?? 'image/jpeg' }), 'qualquer-nome.jpg');
  const headers: Record<string, string> = {};
  if (over.token !== null) headers.authorization = `Bearer ${over.token ?? 'token-a'}`;
  return handler(new Request('http://local/trip-attachments', { method: 'POST', headers, body: form }));
}

describe('trip-attachments: borda', () => {
  it('anexa a foto em duas fases e responde só com id, tipo e posição', async () => {
    const { gateway, handler } = backend();
    const response = await post(handler);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ code: 'ATTACHED', id: ATTACHMENT, kind: 'photo', position: 1 });
    expect(gateway.rpc).toHaveBeenCalledTimes(2);
    expect(gateway.rpc).toHaveBeenNthCalledWith(1, 'attach_trip_evidence', expect.objectContaining({ p_actor: USER, p_session: 's-a', p_organization: ORG, p_confirm: false, p_content_type: 'image/jpeg' }));
    expect(gateway.rpc).toHaveBeenNthCalledWith(2, 'attach_trip_evidence', expect.objectContaining({ p_confirm: true }));
    expect(gateway.store).toHaveBeenCalledWith(`${ORG}/t/${DELIVERY}/${ATTACHMENT}.jpg`, expect.any(Uint8Array), 'image/jpeg');
  });

  it('o ator e a sessão vêm do token, nunca do corpo', async () => {
    const { gateway, handler } = backend();
    await post(handler, { fields: { p_actor: 'outro', actor_id: 'outro', user_id: 'outro' } });
    expect(gateway.rpc).toHaveBeenCalledWith('attach_trip_evidence', expect.objectContaining({ p_actor: USER }));
  });

  it('assinatura PNG na posição 0', async () => {
    const { gateway, handler } = backend([{ code: 'READY', storage_path: 'x.png' }, { code: 'ATTACHED', id: ATTACHMENT, kind: 'signature', position: 0 }]);
    const response = await post(handler, { bytes: png(), kind: 'signature', position: '0', type: 'image/png' });
    expect(response.status).toBe(200);
    expect(gateway.store).toHaveBeenCalledWith('x.png', expect.any(Uint8Array), 'image/png');
  });

  it('repetição: 200 REPLAYED, sem novo objeto', async () => {
    const { gateway, handler } = backend([{ code: 'REPLAYED', id: ATTACHMENT, kind: 'photo', position: 1 }]);
    const response = await post(handler);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ code: 'REPLAYED', replayed: true, id: ATTACHMENT, kind: 'photo', position: 1 });
    expect(gateway.store).not.toHaveBeenCalled();
  });

  it('sem token ou com token inválido: 401, e nada é lido', async () => {
    const { gateway, handler } = backend();
    expect((await post(handler, { token: null })).status).toBe(401);
    expect((await post(handler, { token: 'invalido' })).status).toBe(401);
    expect(gateway.rpc).not.toHaveBeenCalled();
  });

  it('só aceita POST', async () => {
    const { handler } = backend();
    expect((await handler(new Request('http://local/x', { method: 'GET' }))).status).toBe(405);
    expect((await handler(new Request('http://local/x', { method: 'OPTIONS' }))).status).toBe(204);
  });

  it('o tipo vale pelos bytes reais: um PNG enviado como foto é recusado', async () => {
    const { gateway, handler } = backend();
    const response = await post(handler, { bytes: png(), kind: 'photo', type: 'image/jpeg' });
    expect(response.status).toBe(400);
    expect((await response.json()).fields).toEqual([{ field: 'file', message: 'O conteúdo do arquivo não é uma imagem aceita.' }]);
    expect(gateway.rpc).not.toHaveBeenCalled();
    expect(gateway.store).not.toHaveBeenCalled();
  });

  it('assinatura de arquivo errada na assinatura: recusa', async () => {
    const { handler } = backend();
    expect((await post(handler, { bytes: jpeg(), kind: 'signature', position: '0', type: 'image/png' })).status).toBe(400);
  });

  it('tamanho real: foto acima de 1,5 MB e assinatura acima de 200 KB são recusadas; acima de 2 MB é 413', async () => {
    const { handler } = backend();
    expect((await post(handler, { bytes: jpeg(1_572_865) })).status).toBe(400);
    expect((await post(handler, { bytes: png(204_801), kind: 'signature', position: '0' })).status).toBe(400);
    expect((await post(handler, { bytes: jpeg(2_097_153) })).status).toBe(413);
  });

  it('corpo declarado grande demais é recusado antes de ler', async () => {
    const { gateway, handler } = backend();
    const response = await handler(new Request('http://local/x', { method: 'POST', headers: { authorization: 'Bearer token-a', 'content-length': String(5 * 1024 * 1024), 'content-type': 'multipart/form-data; boundary=x' }, body: 'x' }));
    expect(response.status).toBe(413);
    expect(gateway.rpc).not.toHaveBeenCalled();
  });

  it('o resumo precisa conferir com o corpo', async () => {
    const { gateway, handler } = backend();
    const response = await post(handler, { fields: { sha256: 'a'.repeat(64) } });
    expect(response.status).toBe(400);
    expect((await response.json()).fields[0].field).toBe('sha256');
    expect(gateway.store).not.toHaveBeenCalled();
  });

  it.each([
    ['organization_id', 'x'], ['delivery_id', 'x'], ['attachment_id', 'x'], ['kind', 'video'], ['position', '9'], ['captured_at', 'ontem'], ['sha256', 'xyz'],
  ])('campo inválido %s: 400 com o nome do campo', async (field, value) => {
    const { handler } = backend();
    const response = await post(handler, { fields: { [field]: value } });
    expect(response.status).toBe(400);
    expect((await response.json()).fields.map((item: { field: string }) => item.field)).toContain(field);
  });

  it('sem arquivo: 400', async () => {
    const { handler } = backend();
    const form = new FormData();
    form.append('organization_id', ORG);
    expect((await handler(new Request('http://local/x', { method: 'POST', headers: { authorization: 'Bearer token-a' }, body: form }))).status).toBe(400);
  });

  it.each([
    ['ACCESS_DENIED', 403], ['DELIVERY_NOT_FOUND', 404], ['ATTACHMENT_LIMIT', 409], ['ATTACHMENT_WINDOW_CLOSED', 409], ['ATTACHMENT_CONFLICT', 409], ['AUTH_REQUIRED', 401],
  ])('o banco responde %s: HTTP %i, sem gravar objeto', async (code, status) => {
    const { gateway, handler } = backend([{ code }]);
    const response = await post(handler);
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ code });
    expect(gateway.store).not.toHaveBeenCalled();
  });

  it('negação é auditada na borda, sem caminho nem nome', async () => {
    const { gateway, handler } = backend([{ code: 'ACCESS_DENIED' }]);
    await post(handler);
    expect(gateway.audit).toHaveBeenCalledWith({ actorId: USER, action: 'trip.evidence_attach', result: 'denied', reason: 'ACCESS_DENIED' });
    expect(JSON.stringify(gateway.audit.mock.calls)).not.toMatch(/qualquer-nome|\.jpg|storage/);
  });

  it('recusa do banco na validação devolve os campos', async () => {
    const { handler } = backend([{ code: 'VALIDATION_FAILED', fields: [{ field: 'position', message: 'Posição inválida.' }] }]);
    const response = await post(handler);
    expect(response.status).toBe(400);
    expect((await response.json()).fields).toEqual([{ field: 'position', message: 'Posição inválida.' }]);
  });

  it('se a linha não valer depois do objeto (corrida), o objeto novo é removido', async () => {
    const { gateway, handler } = backend([{ code: 'READY', storage_path: 'p.jpg' }, { code: 'ATTACHMENT_LIMIT' }]);
    const response = await post(handler);
    expect(response.status).toBe(409);
    expect(gateway.remove).toHaveBeenCalledWith('p.jpg');
  });

  it('falha do armazenamento ou do banco: 503, sem detalhe', async () => {
    const failing = backend();
    failing.gateway.store.mockRejectedValueOnce(new Error('storage detalhado'));
    const response = await post(failing.handler);
    expect(response.status).toBe(503);
    expect(JSON.stringify(await response.json())).not.toMatch(/detalhado/);
  });

  it('nenhuma resposta traz caminho, nome do arquivo ou conteúdo', async () => {
    const { handler } = backend();
    const body = JSON.stringify(await (await post(handler)).json());
    expect(body).not.toMatch(/qualquer-nome|\.jpg|storage|trip-evidence|20000000/);
  });

  it('nenhum console recebe dado do arquivo', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((method) => vi.spyOn(console, method).mockImplementation(() => undefined));
    const { handler } = backend();
    await post(handler);
    await post(handler, { bytes: png() });
    for (const spy of spies) { expect(JSON.stringify(spy.mock.calls)).not.toMatch(/qualquer-nome|ffd8|\.jpg/); spy.mockRestore(); }
  });
});
