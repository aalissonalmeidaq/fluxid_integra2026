import React, { useId, useRef, useState } from 'react';
import { textareaClass } from '@/components/identity/confirmation-dialog';
import { Alert, Button, Dialog, Field } from '@/design-system';
import { validateJustification } from '@/domain/cylinders/cylinder-validation';
import { SEAL_LIMITS } from '@/domain/seals/seal-limits';

// Travar ou destravar o lacre pelo cilindro (Spec 012, RF-025, RN-005). Sempre com justificativa de 5 a 500 caracteres; destravar é
// sempre fora da regra da entrega e pede antes a verificação em duas etapas, como o desbloqueio excepcional da Spec 008. O pedido vira
// um comando pendente: a trava só muda quando o lacre confirmar (RN-001).

export interface LockCommandDialogProps {
  kind: 'lock' | 'unlock';
  serialNumber: string;
  busy: boolean;
  error: string | null;
  returnFocusTo: HTMLElement | null;
  hasSecondFactor: boolean;
  // A verificação em duas etapas (a mesma tela de MFA do app), mostrada quando destravar e a sessão ainda não tem o segundo fator.
  secondFactor: React.ReactNode;
  onCancel: () => void;
  onConfirm: (justification: string) => void;
}

export function LockCommandDialog({ kind, serialNumber, busy, error, returnFocusTo, hasSecondFactor, secondFactor, onCancel, onConfirm }: LockCommandDialogProps): React.JSX.Element {
  const formId = useId();
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const [fieldError, setFieldError] = useState<string | undefined>();
  const needsSecondFactor = kind === 'unlock' && !hasSecondFactor;
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
      size={needsSecondFactor ? 'padrao' : 'compacto'}
      {...(needsSecondFactor ? {} : { initialFocusRef: fieldRef })}
      returnFocusTo={returnFocusTo}
      footer={needsSecondFactor
        ? <Button variant="secundario" onClick={onCancel}>Cancelar</Button>
        : (
          <>
            <Button variant="secundario" onClick={onCancel}>Cancelar</Button>
            <Button type="submit" form={formId} loading={busy} loadingLabel="Enviando…">{action}</Button>
          </>
        )}
    >
      <p className="text-corpo">
        O pedido vai para o lacre na próxima comunicação dele. A trava só muda quando o lacre confirmar; até lá, aparece como pendente.
      </p>
      {needsSecondFactor ? (
        <div className="flex flex-col gap-4">
          <p className="text-corpo">Destravar fora da entrega exige a verificação em duas etapas antes da justificativa.</p>
          {secondFactor}
        </div>
      ) : (
        <form id={formId} noValidate onSubmit={submit} className="flex flex-col gap-4">
          {error && <Alert variant="erro">{error}</Alert>}
          <Field label="Justificativa" error={fieldError}>
            {(control) => <textarea ref={fieldRef} name="justification" rows={3} maxLength={SEAL_LIMITS.justificationMax} {...control} className={textareaClass} />}
          </Field>
        </form>
      )}
    </Dialog>
  );
}
