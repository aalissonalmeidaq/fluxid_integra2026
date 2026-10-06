import React, { useId, useRef, useState } from 'react';
import { JUSTIFICATION_MAX } from '@/domain/cylinders/cylinder-types';
import { validateJustification } from '@/domain/cylinders/cylinder-validation';
import { textareaClass } from '@/components/identity/confirmation-dialog';
import { Alert, Button, Dialog, Field } from '@/design-system';

export interface ReasonDialogProps {
  title: string;
  confirmLabel: string;
  description?: string;
  busy?: boolean;
  // Erro devolvido pelo servidor (conflito, permissão), mostrado dentro do diálogo.
  error?: string | null;
  // Elemento que abriu o diálogo: recebe o foco de volta ao fechar (RA-002, RA-007).
  returnFocusTo: HTMLElement | null;
  onCancel: () => void;
  // Recebe a justificativa já validada (5 a 500 caracteres) e os campos extras do formulário.
  onConfirm: (justification: string, form: FormData) => void;
  // Campos extras (motivo, cilindro de destino), com `name` para chegarem em `FormData`.
  children?: React.ReactNode;
}

// Diálogo modal acessível para ações que exigem justificativa: inativar, reativar, desativar e transferir identificador
// (spec, requisitos de acessibilidade). Usa o Dialog do design system e a regra de justificativa do domínio de cilindros.
export function ReasonDialog({ title, confirmLabel, description, busy = false, error = null, returnFocusTo, onCancel, onConfirm, children }: ReasonDialogProps): React.JSX.Element {
  const formId = useId();
  const justificationRef = useRef<HTMLTextAreaElement>(null);
  const [fieldError, setFieldError] = useState<string | undefined>();

  const submit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (busy) return;
    const data = new FormData(event.currentTarget);
    const parsed = validateJustification(String(data.get('justification') ?? ''));
    if (!parsed.ok) {
      setFieldError(parsed.errors.justification);
      justificationRef.current?.focus();
      return;
    }
    setFieldError(undefined);
    onConfirm(parsed.value, data);
  };

  return (
    <Dialog
      title={title}
      onClose={onCancel}
      initialFocusRef={justificationRef}
      returnFocusTo={returnFocusTo}
      footer={(
        <>
          <Button variant="secundario" onClick={onCancel}>Cancelar</Button>
          <Button type="submit" form={formId} disabled={busy}>{busy ? 'Salvando…' : confirmLabel}</Button>
        </>
      )}
    >
      <form id={formId} noValidate onSubmit={submit} className="flex flex-col gap-4">
        <p className="text-corpo">{description ?? 'A ação fica registrada no histórico do cilindro e na auditoria.'}</p>
        {children}
        {error && <Alert variant="erro">{error}</Alert>}
        <Field label="Justificativa" error={fieldError}>
          {(control) => <textarea ref={justificationRef} name="justification" rows={3} maxLength={JUSTIFICATION_MAX} {...control} className={textareaClass} />}
        </Field>
      </form>
    </Dialog>
  );
}
