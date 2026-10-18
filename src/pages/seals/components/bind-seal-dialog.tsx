import React, { useId, useState } from 'react';
import type { SealSummary } from '@/application/seals/seal-views';
import { Alert, Button, Dialog } from '@/design-system';
import { contactAge } from '@/domain/seals/seal-age';

// Vincular um lacre ao cilindro (Spec 012, RF-033; História 5): escolher entre os lacres ativos sem cilindro, que já avisaram a
// ativação. Ler o identificador do cilindro (Spec 009) abre este mesmo detalhe do cilindro, onde o vínculo é feito.
export function BindSealDialog({ serialNumber, seals, busy, error, returnFocusTo, onCancel, onConfirm, now = () => new Date() }: {
  serialNumber: string; seals: SealSummary[]; busy: boolean; error: string | null; returnFocusTo: HTMLElement | null;
  onCancel: () => void; onConfirm: (deviceId: string) => void; now?: () => Date;
}): React.JSX.Element {
  const formId = useId();
  const legendId = useId();
  const [chosen, setChosen] = useState<string | null>(null);
  const [choiceError, setChoiceError] = useState<string | null>(null);

  const submit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (busy) return;
    if (!chosen) { setChoiceError('Escolha um lacre.'); return; }
    onConfirm(chosen);
  };

  return (
    <Dialog title={`Vincular lacre · ${serialNumber}`} onClose={onCancel} returnFocusTo={returnFocusTo}
      footer={(
        <>
          <Button variant="secundario" onClick={onCancel}>Cancelar</Button>
          {seals.length > 0 && <Button type="submit" form={formId} loading={busy} loadingLabel="Vinculando…">Vincular</Button>}
        </>
      )}
    >
      {seals.length === 0 ? (
        <p className="text-corpo">Nenhum lacre ativo sem cilindro. Ligue o lacre (ele avisa a ativação) e abra esta tela de novo.</p>
      ) : (
        <form id={formId} noValidate onSubmit={submit} className="flex flex-col gap-4">
          {error && <Alert variant="erro">{error}</Alert>}
          <fieldset aria-describedby={choiceError ? legendId : undefined} className="m-0 flex flex-col gap-2 border-0 p-0">
            <legend className="mb-2 text-corpo font-semibold text-navy">Lacres ativos sem cilindro</legend>
            {seals.map((seal) => (
              <label key={seal.deviceId} className="flex min-h-alvo items-center gap-2 rounded-controle border border-borda-suave p-2 text-corpo text-grafite">
                <input type="radio" name="seal" className="size-6" value={seal.deviceId} checked={chosen === seal.deviceId}
                  onChange={() => { setChosen(seal.deviceId); setChoiceError(null); }} />
                <span>{seal.label} ({seal.deviceCode}) · bateria {seal.batteryPct ?? '—'}% · contato {contactAge(seal.lastSeenAt, now())}</span>
              </label>
            ))}
          </fieldset>
          {choiceError && <p id={legendId} className="m-0 text-corpo text-erro">{choiceError}</p>}
        </form>
      )}
    </Dialog>
  );
}
