import React, { useId, useRef, useState } from 'react';
import type { TripItemView } from '@/application/trips/trip-views';
import { Alert, Button, Dialog, Field } from '@/design-system';
import { textareaClass } from '@/components/identity/confirmation-dialog';
import { TRIP_LIMITS } from '@/domain/trips/trip-limits';
import { validateUnlockForm } from '@/domain/trips/trip-validation';

export interface UnlockDialogProps {
  item: TripItemView;
  busy: boolean;
  error: string | null;
  returnFocusTo: HTMLElement | null;
  onCancel: () => void;
  onConfirm: (justification: string | null) => void;
}

// Desbloqueio como ato independente da entrega (RF-018 a RF-020). O normal (cilindro entregue) tem justificativa opcional. O excepcional
// (cilindro ainda em trânsito ou não entregue) pede a justificativa, sem segundo fator desde a Spec 013 (RF-021). O bloqueio é lógico: o registro não aciona
// a trava do lacre: ela é comandada à parte (Spec 012) e só muda com a confirmação do dispositivo. Não existe "refazer o bloqueio".
export function UnlockDialog({ item, busy, error, returnFocusTo, onCancel, onConfirm }: UnlockDialogProps): React.JSX.Element {
  const formId = useId();
  const exceptional = item.itemStatus !== 'delivered';
  const [fieldError, setFieldError] = useState<string | undefined>();
  const justificationRef = useRef<HTMLTextAreaElement>(null);
  const title = `${exceptional ? 'Desbloqueio excepcional' : 'Registrar desbloqueio'} · ${item.cylinder.serialNumber}`;

  const submit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (busy) return;
    const parsed = validateUnlockForm({ exceptional, justification: String(new FormData(event.currentTarget).get('justification') ?? '') });
    if (!parsed.ok) {
      setFieldError(parsed.errors.justification);
      justificationRef.current?.focus();
      return;
    }
    setFieldError(undefined);
    onConfirm(parsed.value.justification);
  };

  return (
    <Dialog
      title={title}
      onClose={onCancel}
      size="compacto"
      initialFocusRef={justificationRef}
      returnFocusTo={returnFocusTo}
      footer={(
        <>
          <Button variant="secundario" onClick={onCancel}>Cancelar</Button>
          <Button type="submit" form={formId} loading={busy} loadingLabel="Registrando…">{exceptional ? 'Registrar desbloqueio excepcional' : 'Registrar desbloqueio'}</Button>
        </>
      )}
    >
      <Alert variant="alerta" title="Registro lógico">
        <p>Isto registra o desbloqueio lógico do cilindro; a trava física do lacre é comandada à parte e só muda com a confirmação do dispositivo. O desbloqueio não muda a situação da entrega e não pode ser desfeito.</p>
      </Alert>
      <form id={formId} noValidate onSubmit={submit} className="flex flex-col gap-4">
        <p className="text-corpo">
          {exceptional
            ? `${item.cylinder.serialNumber} ainda não foi entregue. Explique o motivo do desbloqueio excepcional: ele fica registrado no histórico e na auditoria.`
            : `Registrar o desbloqueio de ${item.cylinder.serialNumber}, já entregue. A justificativa é opcional.`}
        </p>
        {error && <Alert variant="erro">{error}</Alert>}
        <Field label={exceptional ? 'Justificativa' : 'Justificativa (opcional)'} error={fieldError}>
          {(control) => <textarea ref={justificationRef} name="justification" rows={3} maxLength={TRIP_LIMITS.justificationMax} {...control} className={textareaClass} />}
        </Field>
      </form>
    </Dialog>
  );
}
