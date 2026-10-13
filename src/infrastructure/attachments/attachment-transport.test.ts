import { describe, expect, it, vi } from 'vitest';
import { createAttachmentUploader } from './attachment-transport';

// Spec 010, T053: o envio do anexo leva só o necessário, com a chave publicável e o token da sessão, e nunca grava no bucket.
const endpoint = { url: 'https://projeto.example.invalid/', publishableKey: 'sb_publishable_ficticia' };
const input = { organizationId: 'org', deliveryId: 'del', attachmentId: 'att', kind: 'photo' as const, position: 2, capturedAt: '2026-10-13T12:00:00Z', sha256: 'a'.repeat(64), bytes: new Uint8Array([0xff, 0xd8, 0xff]).buffer, contentType: 'image/jpeg', addedLater: true };
const client = (token: string | null) => ({ auth: { getSession: vi.fn(async () => ({ data: { session: token ? { access_token: token } : null } })) } }) as never;

describe('envio de anexo', () => {
  it('posta multipart em trip-attachments com a chave publicável e o token', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ code: 'ATTACHED' }), { status: 200 }));
    const result = await createAttachmentUploader(endpoint, client('jwt'), fetcher as never).upload(input);
    expect(result).toEqual({ status: 200, body: { code: 'ATTACHED' } });
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://projeto.example.invalid/functions/v1/trip-attachments');
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ apikey: 'sb_publishable_ficticia', authorization: 'Bearer jwt' });
    const form = init.body as FormData;
    expect(Object.fromEntries([...form.entries()].filter(([key]) => key !== 'file'))).toEqual({
      organization_id: 'org', delivery_id: 'del', attachment_id: 'att', kind: 'photo', position: '2', captured_at: '2026-10-13T12:00:00Z', sha256: 'a'.repeat(64), added_later: 'true',
    });
    expect(form.get('file')).toBeInstanceOf(Blob);
  });

  it('sem sessão não envia nada', async () => {
    const fetcher = vi.fn();
    expect(await createAttachmentUploader(endpoint, client(null), fetcher as never).upload(input)).toEqual({ status: 401, body: { code: 'AUTH_REQUIRED' } });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('resposta que não é JSON vira corpo nulo, sem quebrar', async () => {
    const fetcher = vi.fn(async () => new Response('erro', { status: 502 }));
    expect(await createAttachmentUploader(endpoint, client('jwt'), fetcher as never).upload(input)).toEqual({ status: 502, body: null });
  });
});
