import React, { useId, useRef, useState } from 'react';
import { textareaClass } from '@/components/identity/confirmation-dialog';
import { Alert, Button, Dialog, Field } from '@/design-system';
import { validateJustification } from '@/domain/seals/seal-enrollment';
import { SEAL_LIMITS } from '@/domain/seals/seal-limits';

// Diálogo das decisões do Master (Spec 013, contracts/telas.md): toda ação que muda o pedido pede justificativa de 5 a 500 caracteres
// (constituição, princípio III). Algumas têm uma escolha (as redes na retirada, a chave no conflito), sempre com a opção segura marcada.

export interface DialogChoice<V extends string> {
  legend: string;
  options: readonly { value: V; label: string; help: string }[];
  initial: V;
}

export interface JustificationDialogProps<V extends string> {
  title: string;
  description: React.ReactNode;
  confirmLabel: string;
  danger?: boolean;
  choice?: DialogChoice<V>;
  busy: boolean;
  error: string | null;
  returnFocusTo: HTMLElement | null;
  onCancel: () => void;
  onConfirm: (justification: string, choice: V | null) => void;
}

export function JustificationDialog<V extends string>({
  title, description, confirmLabel, danger = false, choice, busy, error, returnFocusTo, onCancel, onConfirm,
}: JustificationDialogProps<V>): React.JSX.Element {
  const formId = useId();
  const choiceName = useId();
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [picked, setPicked] = useState<V | null>(choice?.initial ?? null);

  const submit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (busy) return;
    const parsed = validateJustification(String(new FormData(event.currentTarget).get('justification') ?? ''));
    if (!parsed.ok) {
      setFieldError(parsed.error);
      fieldRef.current?.focus();
      return;
    }
    setFieldError(undefined);
    onConfirm(parsed.value, picked);
  };

  return (
    <Dialog
      title={title}
      onClose={onCancel}
      size="padrao"
      {...(choice ? {} : { initialFocusRef: fieldRef })}
      returnFocusTo={returnFocusTo}
      footer={(
        <>
          <Button variant="secundario" onClick={onCancel}>Cancelar</Button>
          <Button type="submit" form={formId} variant={danger ? 'perigoso' : 'primario'} loading={busy} loadingLabel="Enviando…">{confirmLabel}</Button>
        </>
      )}
    >
      <div className="text-corpo">{description}</div>
      <form id={formId} noValidate onSubmit={submit} className="flex flex-col gap-4">
        {error && <Alert variant="erro">{error}</Alert>}
        {choice && (
          <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
            <legend className="mb-2 font-semibold text-navy">{choice.legend}</legend>
            {choice.options.map((option) => (
              <label key={option.value} className="flex min-h-alvo cursor-pointer items-start gap-4 rounded-controle border border-borda-suave p-4">
                <input type="radio" name={choiceName} value={option.value} className="mt-1 size-6 shrink-0" checked={picked === option.value}
                  onChange={() => setPicked(option.value)} />
                <span className="flex flex-col gap-1">
                  <span className="font-semibold text-grafite">{option.label}</span>
                  <span className="text-legenda text-texto-secundario">{option.help}</span>
                </span>
              </label>
            ))}
          </fieldset>
        )}
        <Field label="Justificativa" error={fieldError} help={`De ${SEAL_LIMITS.justificationMin} a ${SEAL_LIMITS.justificationMax} caracteres. Fica na auditoria.`}>
          {(control) => <textarea ref={fieldRef} name="justification" rows={3} maxLength={SEAL_LIMITS.justificationMax} {...control} className={textareaClass} />}
        </Field>
      </form>
    </Dialog>
  );
}
