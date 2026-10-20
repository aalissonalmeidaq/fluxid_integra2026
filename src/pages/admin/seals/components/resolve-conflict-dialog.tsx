import React from 'react';
import type { EnrollmentView } from '@/application/seals/platform-seal-views';
import { Button, Dialog } from '@/design-system';
import { JustificationDialog } from './justification-dialog';

// Resolver o conflito de chave (Spec 013, RF-010; replace_enrollment_key). Aceitar a chave do aparelho novo serve ao lacre reinstalado;
// manter a atual descarta a chamada estranha. Lacre em operação precisa ser retirado antes: o diálogo só explica.

export interface ResolveConflictDialogProps {
  enrollment: EnrollmentView;
  busy: boolean;
  error: string | null;
  returnFocusTo: HTMLElement | null;
  onCancel: () => void;
  onConfirm: (keepCurrent: boolean, justification: string) => void;
}

export function ResolveConflictDialog({ enrollment, busy, error, returnFocusTo, onCancel, onConfirm }: ResolveConflictDialogProps): React.JSX.Element {
  if (enrollment.status === 'approved') {
    return (
      <Dialog title={`Resolver o conflito · ${enrollment.deviceCode}`} onClose={onCancel} returnFocusTo={returnFocusTo}
        footer={<Button variant="secundario" onClick={onCancel}>Entendi</Button>}>
        <p className="m-0 text-corpo">
          Este lacre está em operação. Para aceitar a chave de outro aparelho com o mesmo código, retire o lacre de operação antes e resolva
          o conflito depois.
        </p>
      </Dialog>
    );
  }
  return (
    <JustificationDialog
      title={`Resolver o conflito · ${enrollment.deviceCode}`}
      description={<p className="m-0">Outro aparelho chamou o FluxID com este código e uma chave diferente. Escolha qual chave vale para este lacre.</p>}
      confirmLabel="Resolver o conflito"
      choice={{
        legend: 'Qual chave vale',
        initial: 'keep',
        options: [
          { value: 'keep', label: 'Manter a chave atual', help: 'A chamada do outro aparelho é ignorada. Use quando não reconhecer o aparelho.' },
          { value: 'replace', label: 'Aceitar a chave do aparelho novo', help: 'Indicado para o lacre reinstalado (memória apagada). O pedido volta a aguardar aprovação.' },
        ],
      }}
      busy={busy}
      error={error}
      returnFocusTo={returnFocusTo}
      onCancel={onCancel}
      onConfirm={(justification, choice) => onConfirm(choice !== 'replace', justification)}
    />
  );
}
