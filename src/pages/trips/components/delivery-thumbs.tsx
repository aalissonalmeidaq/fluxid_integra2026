import React, { useEffect, useState } from 'react';
import type { DeliveryAttachmentView } from '@/application/trips/trip-views';

// Miniaturas das fotos e da assinatura de uma entrega (Spec 010, RF-022, RF-023; contracts/telas-e-fluxos.md §7). Cada imagem vem por uma URL assinada de vida
// curta (60 segundos), pedida só depois de o servidor conferir a permissão do tipo: foto com `trip.read`, assinatura com `trip.recipient`. A lista que chega aqui
// já traz só o que a pessoa pode ver. A URL fica no estado da tela e nunca é guardada nem escrita em log.
export interface DeliveryThumbsProps {
  attachments: readonly DeliveryAttachmentView[];
  // Pede a URL assinada de um anexo; nulo quando o servidor não entrega (sem permissão, expirou, sem conexão).
  loadUrl: (attachmentId: string) => Promise<string | null>;
}

const labelOf = (attachment: DeliveryAttachmentView): string => (attachment.kind === 'signature' ? 'Assinatura de quem recebeu' : `Foto ${attachment.position} da entrega`);

export function DeliveryThumbs({ attachments, loadUrl }: DeliveryThumbsProps): React.JSX.Element | null {
  const [urls, setUrls] = useState<Record<string, string | null>>({});
  const ids = attachments.map((attachment) => attachment.id).join(',');

  useEffect(() => {
    let active = true;
    for (const attachment of attachments) {
      void loadUrl(attachment.id).then((url) => { if (active) setUrls((current) => ({ ...current, [attachment.id]: url })); }).catch(() => { if (active) setUrls((current) => ({ ...current, [attachment.id]: null })); });
    }
    return () => { active = false; };
    // Recarrega quando a lista de anexos muda; `loadUrl` é estável por viagem.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids]);

  if (attachments.length === 0) return null;
  return (
    <ul role="list" aria-label="Anexos da entrega" className="grid grid-cols-2 gap-2 tablet:grid-cols-4">
      {attachments.map((attachment) => {
        const url = urls[attachment.id];
        return (
          <li key={attachment.id} className="flex flex-col gap-1">
            {url ? <img src={url} alt={labelOf(attachment)} className="aspect-video w-full rounded-controle border border-borda-suave bg-branco object-cover" />
              : <p className="rounded-controle border border-borda-suave p-2 text-legenda text-texto-secundario">{url === null ? `${labelOf(attachment)}: não foi possível carregar a imagem.` : `${labelOf(attachment)}: carregando…`}</p>}
            {attachment.addedLater && <span className="text-legenda text-texto-secundario">Acrescentado depois</span>}
          </li>
        );
      })}
    </ul>
  );
}
