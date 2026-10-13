import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MAX_QUEUE_ATTACHMENT_BYTES } from '@/domain/field/attachment-limits';
import { LocalDatabase } from '@/infrastructure/local-database/local-database';
import { AttachmentService, type AddRequest, type AttachmentUploader, type UploadInput } from './attachment-service';

// Spec 010, T053 e T062 (RF-018 a RF-021a, RF-026; contracts/fila-local.md §5 e §7): anexos guardados no aparelho, enviados só depois do registro da entrega, um por vez por
// entrega, idempotentes, sem nunca reverter nem bloquear a entrega. Foto e assinatura seguem o mesmo caminho.
const owner = { actorId: 'user-1', organizationId: 'tenant-a', endpointId: 'local' };
const names: string[] = [];
afterEach(() => { names.length = 0; });

async function setup(uploader: Partial<AttachmentUploader> = {}) {
  const name = `attachments-${crypto.randomUUID()}`;
  names.push(name);
  const database = new LocalDatabase(name);
  await database.open();
  database.unlock(owner.organizationId);
  const upload = vi.fn(async (_input: UploadInput) => ({ status: 200, body: { code: 'ATTACHED' } }));
  const service = new AttachmentService({ database, owner, uploader: { upload, ...uploader } as AttachmentUploader, now: () => new Date('2026-10-13T12:00:00Z') });
  return { database, service, upload };
}

const bytes = (size = 100, first = 0xff): ArrayBuffer => { const array = new Uint8Array(size); array[0] = first; return array.buffer; };
const photo = (n: number, size = 100) => ({ id: `a0000000-0000-4000-8000-00000000000${n}`, bytes: bytes(size), sizeBytes: size, sha256: String(n).repeat(64), contentType: 'image/jpeg', capturedAt: '2026-10-13T11:00:00Z' });
const signature = () => ({ id: 'a0000000-0000-4000-8000-0000000000f0', bytes: bytes(80, 0x89), sizeBytes: 80, sha256: 'f'.repeat(64), contentType: 'image/png', capturedAt: '2026-10-13T11:00:00Z' });
const withEntry = (n: number, over: Partial<AddRequest> = {}): AddRequest => ({ tripId: 'T1', kind: 'photo', file: photo(n), target: { outboxItemId: 'q1' }, ...over });

describe('guardar anexos', () => {
  it('guarda a foto como pendente, com a posição seguinte, vinculada ao item da entrega', async () => {
    const { database, service } = await setup();
    expect(await service.add(withEntry(1))).toMatchObject({ ok: true, position: 1 });
    expect(await service.add(withEntry(2))).toMatchObject({ ok: true, position: 2 });
    const list = await service.list();
    expect(list.map((entry) => [entry.kind, entry.position, entry.status, entry.outboxItemId, entry.deliveryId])).toEqual([['photo', 1, 'pending', 'q1', null], ['photo', 2, 'pending', 'q1', null]]);
    expect(JSON.stringify(list)).not.toMatch(/"bytes"/);
    await database.close();
  });

  it('até 3 fotos por entrega: a quarta é recusada com o motivo', async () => {
    const { database, service } = await setup();
    for (const n of [1, 2, 3]) await service.add(withEntry(n));
    expect(await service.add(withEntry(4))).toEqual({ ok: false, reason: 'photo_limit', message: 'Limite de 3 fotos por entrega.' });
    await database.close();
  });

  it('uma só assinatura por entrega, na posição 0', async () => {
    const { database, service } = await setup();
    expect(await service.add({ tripId: 'T1', kind: 'signature', file: signature(), target: { outboxItemId: 'q1' } })).toMatchObject({ ok: true, position: 0 });
    expect(await service.add({ tripId: 'T1', kind: 'signature', file: { ...signature(), id: 'a0000000-0000-4000-8000-0000000000f1' }, target: { outboxItemId: 'q1' } })).toMatchObject({ ok: false, reason: 'signature_limit' });
    await database.close();
  });

  it('anexo acrescentado depois conta o que o servidor já tem (3 fotos e 1 assinatura no total)', async () => {
    const { database, service } = await setup();
    const target = { deliveryId: 'D1', existingPhotos: 2, hasSignature: true };
    expect(await service.add(withEntry(1, { target }))).toMatchObject({ ok: true, position: 3 });
    expect(await service.add(withEntry(2, { target }))).toMatchObject({ ok: false, reason: 'photo_limit' });
    expect(await service.add({ tripId: 'T1', kind: 'signature', file: signature(), target })).toMatchObject({ ok: false, reason: 'signature_limit' });
    expect((await service.list())[0]).toMatchObject({ outboxItemId: null, deliveryId: 'D1', addedLater: true });
    await database.close();
  });

  it('sem espaço (50 MB de anexos): novas fotos deixam de ser aceitas, com o texto do contrato', async () => {
    const { database, service } = await setup();
    await service.add(withEntry(1, { file: { ...photo(1), sizeBytes: MAX_QUEUE_ATTACHMENT_BYTES } }));
    expect(await service.add(withEntry(2))).toEqual({ ok: false, reason: 'no_space', message: 'Sem espaço para novas fotos. A entrega será registrada sem elas.' });
    expect(await service.usage()).toMatchObject({ count: 1, bytes: MAX_QUEUE_ATTACHMENT_BYTES, level: 'full' });
    await database.close();
  });

  it('falha de gravação não finge que guardou', async () => {
    const { database, service } = await setup();
    await database.close();
    expect(await service.add(withEntry(1))).toMatchObject({ ok: false, reason: 'storage_failed' });
  });

  it('remover antes do envio tira do aparelho; só pendente ou recusado', async () => {
    const { database, service } = await setup();
    await service.add(withEntry(1));
    const [entry] = await service.list();
    expect(await service.remove(entry!.id)).toBe(true);
    expect(await service.list()).toEqual([]);
    expect(await service.remove('inexistente')).toBe(false);
    await database.close();
  });

  it('só a conta, a organização e o destino do dono veem os anexos', async () => {
    const { database, service } = await setup();
    await service.add(withEntry(1));
    const other = new AttachmentService({ database, owner: { ...owner, actorId: 'user-2' }, uploader: { upload: vi.fn() } as never });
    expect(await other.list()).toEqual([]);
    await database.close();
  });
});

describe('enviar anexos', () => {
  it('não envia enquanto a entrega não estiver confirmada (sem delivery_id)', async () => {
    const { database, service, upload } = await setup();
    await service.add(withEntry(1));
    expect(await service.upload()).toEqual({ sent: 0, waiting: 1, failed: 0, retry: false, interrupted: null });
    expect(upload).not.toHaveBeenCalled();
    await database.close();
  });

  it('depois de a entrega confirmar, envia e tira o registro e os bytes do aparelho', async () => {
    const { database, service, upload } = await setup();
    await service.add(withEntry(1));
    await service.add(withEntry(2));
    await service.linkDelivery('q1', 'D1');
    expect(await service.upload()).toMatchObject({ sent: 2, waiting: 0, failed: 0 });
    expect(upload).toHaveBeenCalledTimes(2);
    expect(upload.mock.calls[0]![0]).toMatchObject({ organizationId: 'tenant-a', deliveryId: 'D1', kind: 'photo', position: 1, addedLater: false, sha256: '1'.repeat(64) });
    expect(await service.list()).toEqual([]);
    await database.close();
  });

  it('anexo acrescentado depois sai marcado como tal, sem item da fila', async () => {
    const { database, service, upload } = await setup();
    await service.add(withEntry(1, { target: { deliveryId: 'D9', existingPhotos: 0, hasSignature: false } }));
    await service.upload();
    expect(upload.mock.calls[0]![0]).toMatchObject({ deliveryId: 'D9', addedLater: true });
    await database.close();
  });

  it('REPLAYED também confirma: o reenvio não duplica', async () => {
    const { database, service } = await setup({ upload: vi.fn(async () => ({ status: 200, body: { code: 'REPLAYED', replayed: true } })) });
    await service.add(withEntry(1, { target: { deliveryId: 'D1', existingPhotos: 0, hasSignature: false } }));
    expect(await service.upload()).toMatchObject({ sent: 1 });
    expect(await service.list()).toEqual([]);
    await database.close();
  });

  it('queda de rede ou erro do servidor: volta a pendente, guarda os bytes e pede nova tentativa', async () => {
    for (const failure of [async () => { throw new Error('rede'); }, async () => ({ status: 503, body: { code: 'SERVICE_UNAVAILABLE' } })]) {
      const { database, service } = await setup({ upload: vi.fn(failure) as never });
      await service.add(withEntry(1, { target: { deliveryId: 'D1', existingPhotos: 0, hasSignature: false } }));
      expect(await service.upload()).toMatchObject({ sent: 0, retry: true });
      expect((await service.list())[0]).toMatchObject({ status: 'pending' });
      await database.close();
    }
  });

  it('recusa do servidor vira "recusado", com o motivo em texto, e permite remover; a entrega não é tocada', async () => {
    const { database, service } = await setup({ upload: vi.fn(async () => ({ status: 409, body: { code: 'ATTACHMENT_WINDOW_CLOSED' } })) });
    await service.add(withEntry(1, { target: { deliveryId: 'D1', existingPhotos: 0, hasSignature: false } }));
    expect(await service.upload()).toMatchObject({ sent: 0, failed: 1 });
    const [entry] = await service.list();
    expect(entry).toMatchObject({ status: 'failed', failureText: 'O prazo para acrescentar anexos a esta entrega terminou.' });
    expect(await service.remove(entry!.id)).toBe(true);
    await database.close();
  });

  it('sessão expirada interrompe o envio e mantém tudo', async () => {
    const refusing = vi.fn(async () => ({ status: 401, body: { code: 'AUTH_REQUIRED' } }));
    const { database, service } = await setup({ upload: refusing });
    await service.add(withEntry(1, { target: { deliveryId: 'D1', existingPhotos: 0, hasSignature: false } }));
    await service.add(withEntry(2, { target: { deliveryId: 'D1', existingPhotos: 0, hasSignature: false } }));
    expect(await service.upload()).toMatchObject({ sent: 0, interrupted: 'auth_error' });
    expect(refusing).toHaveBeenCalledTimes(1);
    expect(await service.list()).toHaveLength(2);
    await database.close();
  });

  it('um por vez por entrega, em ordem; uma recusa não impede o resto da fila', async () => {
    const calls: string[] = [];
    const upload = vi.fn(async (input: UploadInput) => { calls.push(`${input.deliveryId}:${input.position}`); return input.position === 1 && input.deliveryId === 'D1' ? { status: 403, body: { code: 'ACCESS_DENIED' } } : { status: 200, body: { code: 'ATTACHED' } }; });
    const { database, service } = await setup({ upload });
    await service.add(withEntry(1, { target: { deliveryId: 'D1', existingPhotos: 0, hasSignature: false } }));
    await service.add(withEntry(2, { target: { deliveryId: 'D1', existingPhotos: 0, hasSignature: false } }));
    await service.add(withEntry(3, { target: { deliveryId: 'D2', existingPhotos: 0, hasSignature: false } }));
    const summary = await service.upload();
    expect(summary).toMatchObject({ sent: 2, failed: 1 });
    expect(calls.filter((call) => call.startsWith('D1'))).toEqual(['D1:1', 'D1:2']);
    expect(calls).toContain('D2:1');
    await database.close();
  });

  it('assinatura segue o mesmo caminho, com tipo PNG e posição 0', async () => {
    const { database, service, upload } = await setup();
    await service.add({ tripId: 'T1', kind: 'signature', file: signature(), target: { deliveryId: 'D1', existingPhotos: 0, hasSignature: false } });
    await service.upload();
    expect(upload.mock.calls[0]![0]).toMatchObject({ kind: 'signature', position: 0, contentType: 'image/png' });
    await database.close();
  });

  it('item em "enviando" que ficou preso (aplicativo fechado no meio) volta a pendente', async () => {
    const { database, service } = await setup();
    await service.add(withEntry(1, { target: { deliveryId: 'D1', existingPhotos: 0, hasSignature: false } }));
    await service.markStaleUploadingPending();
    expect((await service.list())[0]!.status).toBe('pending');
    await database.close();
  });

  it('descartar a entrega descarta os anexos que dependiam dela', async () => {
    const { database, service } = await setup();
    await service.add(withEntry(1));
    await service.discardForItem('q1');
    expect(await service.list()).toEqual([]);
    await database.close();
  });
});
