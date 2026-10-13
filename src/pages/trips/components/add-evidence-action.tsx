import React, { useState } from 'react';
import type { AddResult } from '@/application/field/attachment-service';
import { Button, Dialog } from '@/design-system';
import type { CapturedSignature } from '@/infrastructure/attachments/signature-canvas';
import { DeliveryPhotos, type DraftPhoto } from './delivery-photos';
import { DeliverySignature } from './delivery-signature';
import { hasEvidence, type DeliveryEvidence } from './delivery-evidence';


// Acrescentar foto ou assinatura a uma entrega já registrada (Spec 010, RF-021a; contracts/telas-e-fluxos.md §5). O registro da entrega não muda: o anexo é só mais um
// item, marcado "acrescentado depois". Funciona sem conexão para a entrega que o aparelho já conhece. Só aparece com a viagem em andamento ou concluída há até 7 dias
// e com vaga (até 3 fotos e 1 assinatura); a decisão de mostrar é de quem usa este botão (`canAddEvidence`), e o servidor confere de novo.
export interface AddEvidenceActionProps {
  stopLabel: string;
  disabled?: boolean;
  onOpen: (trigger: HTMLElement) => void;
}

export function AddEvidenceAction({ stopLabel, disabled = false, onOpen }: AddEvidenceActionProps): React.JSX.Element {
  return (
    <Button variant="secundario" className="self-start" disabled={disabled} aria-label={`Acrescentar foto ou assinatura à entrega da ${stopLabel}`} onClick={(event) => onOpen(event.currentTarget)}>
      Acrescentar foto ou assinatura
    </Button>
  );
}

export interface AddEvidenceDialogProps {
  stopLabel: string;
  existingPhotos: number;
  hasSignature: boolean;
  usedBytes: number;
  returnFocusTo: HTMLElement | null;
  onCancel: () => void;
  // Guarda cada anexo no aparelho; devolve o primeiro motivo de recusa, se houver.
  onSave: (evidence: DeliveryEvidence) => Promise<AddResult | null>;
}

export function AddEvidenceDialog({ stopLabel, existingPhotos, hasSignature, usedBytes, returnFocusTo, onCancel, onSave }: AddEvidenceDialogProps): React.JSX.Element {
  const [photos, setPhotos] = useState<DraftPhoto[]>([]);
  const [signature, setSignature] = useState<CapturedSignature | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const evidence: DeliveryEvidence = { photos: photos.map((entry) => entry.photo), signature };

  const save = (): void => {
    setBusy(true);
    setError(null);
    void onSave(evidence).then((refusal) => {
      if (refusal && !refusal.ok) { setError(refusal.message); return; }
      onCancel();
    }).catch(() => setError('Não foi possível guardar neste aparelho. Tente de novo.')).finally(() => setBusy(false));
  };

  return (
    <Dialog
      title={`Acrescentar à entrega da ${stopLabel}`}
      size="padrao"
      onClose={onCancel}
      returnFocusTo={returnFocusTo}
      footer={(
        <>
          <Button variant="secundario" onClick={onCancel}>Cancelar</Button>
          <Button disabled={busy || !hasEvidence(evidence)} loading={busy} loadingLabel="Guardando…" onClick={save}>Guardar anexos</Button>
        </>
      )}
    >
      <p className="text-corpo">O registro da entrega não muda. Os anexos aparecem como "acrescentado depois" e seguem para o servidor quando houver conexão.</p>
      {error && <p role="alert" className="text-corpo font-semibold text-erro">{error}</p>}
      <DeliveryPhotos photos={photos} onChange={setPhotos} disabled={busy} existingPhotos={existingPhotos} usedBytes={usedBytes} />
      <DeliverySignature value={signature} onChange={setSignature} disabled={busy} alreadyHasSignature={hasSignature} />
    </Dialog>
  );
}
