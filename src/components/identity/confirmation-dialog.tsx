import React, { useId, useRef, useState } from 'react';
import { Alert } from '@/design-system/components/alert';
import { Button } from '@/design-system/components/button';
import { Dialog } from '@/design-system/components/dialog';
import { Field } from '@/design-system/components/field';

export const MIN_JUSTIFICATION = 10;
export const MAX_JUSTIFICATION = 500;

// Classes de controles ainda usadas por telas não migradas; já seguem os tokens do design system.
export const primaryButtonClass = 'min-h-alvo rounded-controle bg-azul-profundo px-4 py-2 text-corpo font-semibold text-branco hover:bg-navy';
export const secondaryButtonClass = 'min-h-alvo rounded-controle border border-azul-profundo px-4 py-2 text-corpo font-semibold text-azul-profundo';
export const fieldClass = 'mt-1 min-h-alvo w-full rounded-controle border border-borda-controle px-4';
export const textareaClass = 'mt-1 w-full rounded-controle border border-borda-controle px-4 py-2';

export interface ConfirmationDialogProps {
  title: string;
  confirmLabel: string;
  busy?: boolean;
  // Elemento que abriu o diálogo: recebe o foco de volta ao fechar (RA-002, RA-007).
  returnFocusTo: HTMLElement | null;
  onCancel: () => void;
  // Recebe a justificativa já validada (10 a 500 caracteres); campos extras vêm de `children`.
  onConfirm: (justification: string, form: FormData) => void;
  disabledReason?: string | null;
  children?: React.ReactNode;
}

// Diálogo modal acessível para ações críticas que exigem justificativa e confirmação explícita. Usa o Dialog do
// design system; a regra da justificativa (mínimo de 10 caracteres) é a mesma da Spec 002.
export function ConfirmationDialog({ title, confirmLabel, busy = false, returnFocusTo, onCancel, onConfirm, disabledReason = null, children }: ConfirmationDialogProps): React.JSX.Element {
  const formId = useId();
  const justificationRef = useRef<HTMLTextAreaElement>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (busy || disabledReason) return;
    const data = new FormData(event.currentTarget);
    const justification = String(data.get('justification') ?? '').trim();
    if (justification.length < MIN_JUSTIFICATION) return setError(`Descreva o motivo com pelo menos ${MIN_JUSTIFICATION} caracteres.`);
    setError(null);
    onConfirm(justification, data);
  };

  return (
    <Dialog
      title={title}
      onClose={onCancel}
      initialFocusRef={justificationRef}
      returnFocusTo={returnFocusTo}
      footer={
        <>
          <Button variant="secundario" onClick={onCancel}>
            Cancelar
          </Button>
          <Button type="submit" form={formId} disabled={busy || Boolean(disabledReason)}>
            {busy ? 'Salvando…' : confirmLabel}
          </Button>
        </>
      }
    >
      <form id={formId} noValidate onSubmit={submit} className="flex flex-col gap-4">
        <p className="text-corpo">A alteração vale somente neste tenant e fica registrada na auditoria.</p>
        {children}
        {disabledReason && <Alert variant="alerta">{disabledReason}</Alert>}
        <Field label="Justificativa da alteração" error={error ?? undefined}>
          {(controle) => <textarea ref={justificationRef} name="justification" rows={3} maxLength={MAX_JUSTIFICATION} {...controle} className={textareaClass} />}
        </Field>
      </form>
    </Dialog>
  );
}
