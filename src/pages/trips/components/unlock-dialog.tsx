import React, { useId, useRef, useState } from 'react';
import type { TripItemView } from '@/application/trips/trip-views';
import { useAuth } from '@/app/auth/auth-context';
import { Alert, Button, Dialog, Field } from '@/design-system';
import { textareaClass } from '@/components/identity/confirmation-dialog';
import { MfaPage } from '@/pages/auth/mfa-page';
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
// (cilindro ainda em trânsito ou não entregue) pede o segundo fator, antes, e a justificativa. O bloqueio é lógico: o registro não aciona
// a trava do lacre, que será comandada e confirmada pelo dispositivo na Fase 6. Não existe "refazer o bloqueio".
export function UnlockDialog({ item, busy, error, returnFocusTo, onCancel, onConfirm }: UnlockDialogProps): React.JSX.Element {
  const formId = useId();
  const { state } = useAuth();
  const exceptional = item.itemStatus !== 'delivered';
  const hasSecondFactor = state.status === 'authenticated' && state.aal === 'aal2';
  const needsSecondFactor = exceptional && !hasSecondFactor;
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
      size={needsSecondFactor ? 'padrao' : 'compacto'}
      {...(needsSecondFactor ? {} : { initialFocusRef: justificationRef })}
      returnFocusTo={returnFocusTo}
      footer={needsSecondFactor
        ? <Button variant="secundario" onClick={onCancel}>Cancelar</Button>
        : (
          <>
            <Button variant="secundario" onClick={onCancel}>Cancelar</Button>
            <Button type="submit" form={formId} loading={busy} loadingLabel="Registrando…">{exceptional ? 'Registrar desbloqueio excepcional' : 'Registrar desbloqueio'}</Button>
          </>
        )}
    >
      <Alert variant="alerta" title="Registro lógico">
        <p>Isto registra o desbloqueio do cilindro; a trava do lacre será comandada e confirmada pelo dispositivo na Fase 6. O desbloqueio não muda a situação da entrega e não pode ser desfeito.</p>
      </Alert>
      {needsSecondFactor ? (
        <div className="flex flex-col gap-4">
          <p className="text-corpo">{`${item.cylinder.serialNumber} ainda não foi entregue. O desbloqueio excepcional exige a verificação em duas etapas antes da justificativa.`}</p>
          <MfaPage />
        </div>
      ) : (
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
      )}
    </Dialog>
  );
}
