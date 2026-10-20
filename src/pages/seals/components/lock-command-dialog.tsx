import React, { useId, useRef, useState } from 'react';
import { textareaClass } from '@/components/identity/confirmation-dialog';
import { Alert, Button, Dialog, Field } from '@/design-system';
import { validateJustification } from '@/domain/cylinders/cylinder-validation';
import { SEAL_LIMITS } from '@/domain/seals/seal-limits';

// Travar ou destravar o lacre pelo cilindro (Spec 012, RF-025, RN-005). Sempre com justificativa de 5 a 500 caracteres; destravar é
// sempre fora da regra da entrega; sem segundo fator desde a Spec 013 (RF-021). O pedido vira
// um comando pendente: a trava só muda quando o lacre confirmar (RN-001).

export interface LockCommandDialogProps {
  kind: 'lock' | 'unlock';
  serialNumber: string;
  busy: boolean;
  error: string | null;
  returnFocusTo: HTMLElement | null;
  onCancel: () => void;
  onConfirm: (justification: string) => void;
}

export function LockCommandDialog({ kind, serialNumber, busy, error, returnFocusTo, onCancel, onConfirm }: LockCommandDialogProps): React.JSX.Element {
  const formId = useId();
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const [fieldError, setFieldError] = useState<string | undefined>();
  const action = kind === 'lock' ? 'Pedir para travar' : 'Pedir para destravar';

  const submit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (busy) return;
    const parsed = validateJustification(String(new FormData(event.currentTarget).get('justification') ?? ''));
    if (!parsed.ok) {
      setFieldError(parsed.errors.justification);
      fieldRef.current?.focus();
      return;
    }
    setFieldError(undefined);
    onConfirm(parsed.value);
  };

  return (
    <Dialog
      title={`${kind === 'lock' ? 'Travar o lacre' : 'Destravar o lacre'} · ${serialNumber}`}
      onClose={onCancel}
      size="compacto"
      initialFocusRef={fieldRef}
      returnFocusTo={returnFocusTo}
      footer={(
        <>
          <Button variant="secundario" onClick={onCancel}>Cancelar</Button>
          <Button type="submit" form={formId} loading={busy} loadingLabel="Enviando…">{action}</Button>
        </>
      )}
    >
      <p className="text-corpo">
        O pedido vai para o lacre na próxima comunicação dele. A trava só muda quando o lacre confirmar; até lá, aparece como pendente.
      </p>
      <form id={formId} noValidate onSubmit={submit} className="flex flex-col gap-4">
        {error && <Alert variant="erro">{error}</Alert>}
        <Field label="Justificativa" error={fieldError}>
          {(control) => <textarea ref={fieldRef} name="justification" rows={3} maxLength={SEAL_LIMITS.justificationMax} {...control} className={textareaClass} />}
        </Field>
      </form>
    </Dialog>
  );
}
