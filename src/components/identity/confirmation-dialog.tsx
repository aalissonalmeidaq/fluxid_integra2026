import React, { useEffect, useId, useRef, useState } from 'react';

export const MIN_JUSTIFICATION = 10;
export const MAX_JUSTIFICATION = 500;

export const primaryButtonClass = 'min-h-11 rounded-lg bg-[#1766D9] px-4 py-2 text-sm font-semibold text-white hover:bg-[#163B72] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1766D9] focus-visible:ring-offset-2';
export const secondaryButtonClass = 'min-h-11 rounded-lg border border-[#26384A] px-3 py-2 text-sm font-semibold text-[#26384A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1766D9]';
export const fieldClass = 'mt-1 min-h-11 w-full rounded-lg border border-[#8CA2B8] px-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1766D9]';
export const textareaClass = 'mt-1 w-full rounded-lg border border-[#8CA2B8] px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1766D9]';

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

// Diálogo modal acessível para ações críticas que exigem justificativa e confirmação explícita.
export function ConfirmationDialog({ title, confirmLabel, busy = false, returnFocusTo, onCancel, onConfirm, disabledReason = null, children }: ConfirmationDialogProps): React.JSX.Element {
  const titleId = useId();
  const errorId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const justificationRef = useRef<HTMLTextAreaElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    justificationRef.current?.focus();
    return () => returnFocusTo?.focus();
  }, [returnFocusTo]);

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'Escape') { event.preventDefault(); onCancel(); return; }
    if (event.key !== 'Tab') return;
    const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('select, textarea, button:not([disabled])') ?? []);
    const first = focusable[0], last = focusable[focusable.length - 1];
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  };

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
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-slate-900/50 p-4 sm:items-center">
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} onKeyDown={onKeyDown} className="max-h-full w-full max-w-md overflow-y-auto rounded-xl bg-white p-5 shadow-lg">
        <form noValidate onSubmit={submit}>
          <h3 id={titleId} className="text-lg font-semibold text-[#163B72]">{title}</h3>
          <p className="mt-1 text-sm">A alteração vale somente neste tenant e fica registrada na auditoria.</p>
          {children}
          {disabledReason && <p className="mt-3 text-sm text-amber-950">{disabledReason}</p>}
          <label className="mt-4 block text-sm font-medium">Justificativa da alteração
            <textarea ref={justificationRef} name="justification" rows={3} maxLength={MAX_JUSTIFICATION} aria-invalid={Boolean(error)} aria-describedby={error ? errorId : undefined} className={textareaClass} />
          </label>
          {error && <p id={errorId} className="mt-1 text-sm text-rose-900">{error}</p>}
          <div className="mt-4 flex flex-wrap justify-end gap-2">
            <button type="button" onClick={onCancel} className={secondaryButtonClass}>Cancelar</button>
            <button disabled={busy || Boolean(disabledReason)} className={`${primaryButtonClass} disabled:cursor-not-allowed disabled:opacity-60`}>{busy ? 'Salvando…' : confirmLabel}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
