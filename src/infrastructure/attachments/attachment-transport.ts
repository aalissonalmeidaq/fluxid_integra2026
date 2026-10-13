import type { SupabaseClient } from '@supabase/supabase-js';
import type { AttachmentUploader } from '@/application/field/attachment-service';
import type { PublicEndpoint } from '@/infrastructure/supabase/function-transport';

// Envio do anexo à Edge Function `trip-attachments` do destino ativo (Spec 010, RF-021), só com a chave publicável e o token da sessão. O corpo é multipart:
// o arquivo vai como arquivo e o resto como campos. Nunca grava no bucket direto, e a resposta só traz `id`, `kind` e `position`. Só esta pasta envia imagem.
export function createAttachmentUploader(endpoint: PublicEndpoint, client: SupabaseClient, fetcher: typeof fetch = fetch): AttachmentUploader {
  const url = `${endpoint.url.replace(/\/+$/, '')}/functions/v1/trip-attachments`;
  return {
    async upload(input) {
      const { data } = await client.auth.getSession();
      const accessToken = data.session?.access_token;
      if (!accessToken) return { status: 401, body: { code: 'AUTH_REQUIRED' } };
      const form = new FormData();
      form.append('organization_id', input.organizationId);
      form.append('delivery_id', input.deliveryId);
      form.append('attachment_id', input.attachmentId);
      form.append('kind', input.kind);
      form.append('position', String(input.position));
      form.append('captured_at', input.capturedAt);
      form.append('sha256', input.sha256);
      form.append('added_later', input.addedLater ? 'true' : 'false');
      form.append('file', new Blob([input.bytes], { type: input.contentType }), input.kind === 'photo' ? 'foto.jpg' : 'assinatura.png');
      const response = await fetcher(url, {
        method: 'POST',
        cache: 'no-store',
        headers: { apikey: endpoint.publishableKey, authorization: `Bearer ${accessToken}` },
        body: form,
      });
      const parsed: unknown = await response.json().catch(() => null);
      return { status: response.status, body: parsed };
    },
  };
}
