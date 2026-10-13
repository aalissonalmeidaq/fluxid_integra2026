import React, { useEffect, useId, useRef, useState } from 'react';
import { canAddPhoto, MAX_PHOTOS } from '@/domain/field/attachment-limits';
import { Alert, Button } from '@/design-system';
import { browserImagePipeline, capturePhoto, type CapturedPhoto, type ImagePipeline } from '@/infrastructure/attachments/photo-capture';
import { createPreview, type Preview } from '@/infrastructure/attachments/preview';

// Fotos da entrega (Spec 010, RF-018, RF-024; contracts/telas-e-fluxos.md §5): até 3, opcionais, com miniatura, "Refazer" e "Remover" enquanto a entrega não é salva.
// A foto é reduzida e recodificada no aparelho (sem EXIF) logo que é tirada e fica só aqui, no estado do diálogo, até a pessoa salvar; nada sobe sem o registro.
export interface DraftPhoto {
  photo: CapturedPhoto;
  previewUrl: string;
}

export interface DeliveryPhotosProps {
  photos: readonly DraftPhoto[];
  onChange: (photos: DraftPhoto[]) => void;
  disabled?: boolean;
  // Fotos que a entrega já tem no servidor (anexo acrescentado depois): entram na conta do limite.
  existingPhotos?: number;
  // Bytes de anexos já guardados no aparelho (limite de 50 MB da fila).
  usedBytes?: number;
  cameraAvailable?: boolean;
  // Trocáveis nos testes: o navegador (decodificar e codificar) e a miniatura.
  pipeline?: ImagePipeline;
  preview?: (photo: CapturedPhoto) => Preview;
}

export const NO_CAMERA_TEXT = 'Câmera indisponível neste aparelho. A entrega pode ser registrada sem foto.';
const INVALID_TEXT = 'Não foi possível usar esta imagem. Tire a foto de novo.';
const TOO_LARGE_TEXT = 'A foto ficou grande demais para guardar. Tire de novo, com menos zoom.';

export function DeliveryPhotos({ photos, onChange, disabled = false, existingPhotos = 0, usedBytes = 0, cameraAvailable = true, pipeline, preview }: DeliveryPhotosProps): React.JSX.Element {
  const inputId = useId();
  const input = useRef<HTMLInputElement>(null);
  const redo = useRef<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [live, setLive] = useState('');
  // Cada miniatura tem a sua URL de objeto, revogada ao sair da tela (a imagem não sobrevive fora do aparelho).
  const previews = useRef(new Map<string, Preview>());
  // A foto que termina de ser preparada entra na lista **atual**, não na do momento em que o arquivo foi escolhido.
  const latest = useRef(photos);
  useEffect(() => { latest.current = photos; }, [photos]);
  useEffect(() => {
    const open = previews.current;
    return () => { for (const entry of open.values()) entry.revoke(); open.clear(); };
  }, []);

  const total = photos.length + existingPhotos;
  const decision = canAddPhoto(total, { attachmentBytes: usedBytes });
  const blockedReason = !cameraAvailable ? NO_CAMERA_TEXT : !decision.allowed ? decision.reason : null;

  const open = (index: number | null): void => {
    redo.current = index;
    setError(null);
    input.current?.click();
  };

  const onFile = (event: React.ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) { redo.current = null; return; }
    const index = redo.current;
    redo.current = null;
    setBusy(true);
    void capturePhoto(file, pipeline ?? browserImagePipeline()).then((result) => {
      if (!result.ok) { setError(result.failure === 'too_large' ? TOO_LARGE_TEXT : INVALID_TEXT); return; }
      const made = (preview ?? ((photo: CapturedPhoto) => createPreview(photo.bytes, photo.contentType)))(result.photo);
      previews.current.set(result.photo.id, made);
      const draft: DraftPhoto = { photo: result.photo, previewUrl: made.url };
      const current = latest.current;
      if (index !== null && current[index]) {
        const replaced = current[index]!;
        previews.current.get(replaced.photo.id)?.revoke();
        previews.current.delete(replaced.photo.id);
        onChange(current.map((entry, at) => (at === index ? draft : entry)));
        setLive(`Foto ${index + 1} refeita.`);
      } else {
        if (current.length >= MAX_PHOTOS) { made.revoke(); previews.current.delete(result.photo.id); setError(`Limite de ${MAX_PHOTOS} fotos por entrega.`); return; }
        onChange([...current, draft]);
        latest.current = [...current, draft];
        setLive(`Foto ${current.length + 1} adicionada.`);
      }
    }).finally(() => setBusy(false));
  };

  const remove = (index: number): void => {
    const gone = photos[index];
    if (gone) { previews.current.get(gone.photo.id)?.revoke(); previews.current.delete(gone.photo.id); }
    onChange(photos.filter((_entry, at) => at !== index));
    setLive(`Foto ${index + 1} removida.`);
  };

  return (
    <fieldset className="flex min-w-0 flex-col gap-4" aria-describedby={`${inputId}-help`}>
      <legend className="mb-2 text-h3 font-semibold text-navy">Fotos da entrega (opcional)</legend>
      <p id={`${inputId}-help`} className="text-corpo">{`Até ${MAX_PHOTOS} fotos do local ou da entrega. A entrega vale sem foto.`}</p>
      <div className="flex flex-wrap items-center gap-4">
        <Button variant="secundario" disabled={disabled || busy || blockedReason !== null} loading={busy} loadingLabel="Preparando a foto…" onClick={() => open(null)}>Tirar foto</Button>
        <span className="text-corpo font-semibold text-grafite">{`${total} de ${MAX_PHOTOS}`}</span>
      </div>
      <input ref={input} id={inputId} type="file" accept="image/*" capture="environment" className="hidden" tabIndex={-1} aria-hidden="true" onChange={onFile} />
      {blockedReason && <p className="text-corpo text-grafite">{blockedReason}</p>}
      {error && <Alert variant="erro">{error}</Alert>}
      {photos.length > 0 && (
        <ul role="list" className="grid grid-cols-1 gap-4 tablet:grid-cols-3">
          {photos.map((entry, index) => (
            <li key={entry.photo.id} aria-label={`Foto ${index + 1}`} className="flex flex-col gap-2 rounded-controle border border-borda-suave p-2">
              <img src={entry.previewUrl} alt={`Foto ${index + 1} da entrega`} className="aspect-video w-full rounded-controle object-cover" />
              <div className="flex flex-wrap gap-2">
                <Button variant="secundario" disabled={disabled || busy} aria-label={`Refazer a foto ${index + 1}`} onClick={() => open(index)}>Refazer</Button>
                <Button variant="secundario" disabled={disabled || busy} aria-label={`Remover a foto ${index + 1}`} onClick={() => remove(index)}>Remover</Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <p role="status" aria-live="polite" className="sr-only">{live}</p>
    </fieldset>
  );
}
