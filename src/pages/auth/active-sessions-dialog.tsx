import React, { useEffect, useRef, useState } from 'react';
import type { ActiveSessionSummary } from '@/application/identity/session-service';

export interface ActiveSessionsDialogProps {
  sessions: ActiveSessionSummary[];
  pending: boolean;
  onConfirm: (sessionId: string) => void;
  onCancel: () => void;
}

const formatter = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
const formatDate = (value: string): string => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'indisponível' : formatter.format(date);
};

// Nenhuma sessão é encerrada sem escolha explícita; o diálogo modal nativo prende o foco e aceita Esc.
export function ActiveSessionsDialog({ sessions, pending, onConfirm, onCancel }: ActiveSessionsDialogProps): React.JSX.Element {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    return () => {
      if (typeof dialog.close === 'function') dialog.close();
    };
  }, []);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="sessions-dialog-title"
      onCancel={(event) => { event.preventDefault(); onCancel(); }}
      className="m-auto w-[calc(100%-2rem)] max-w-md rounded-xl border border-slate-300 bg-white p-6 text-slate-900 shadow-xl backdrop:bg-slate-900/60"
    >
      <h2 id="sessions-dialog-title" className="text-lg font-semibold">Limite de sessões atingido</h2>
      <p className="mt-2 text-sm">
        Você atingiu o limite de 3 sessões ativas. Escolha uma sessão para encerrar e liberar este acesso.
        Nenhuma sessão é encerrada automaticamente.
      </p>

      <fieldset className="mt-4 space-y-2" disabled={pending}>
        <legend className="text-sm font-medium">Escolha a sessão a encerrar</legend>
        {sessions.map((session) => (
          <label
            key={session.session_id}
            className="flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border border-slate-300 p-3 has-[:checked]:border-slate-900 has-[:checked]:bg-slate-50 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-slate-900"
          >
            <input
              type="radio"
              name="revoke-session"
              value={session.session_id}
              checked={selected === session.session_id}
              onChange={() => setSelected(session.session_id)}
              className="mt-1 h-4 w-4"
            />
            <span className="text-sm">
              <span className="block font-medium">Sessão iniciada em {formatDate(session.started_at)}</span>
              <span className="block">Última atividade: {formatDate(session.last_seen_at)}</span>
              {session.aal === 'aal2' && <span className="block">Verificação em duas etapas ativa</span>}
            </span>
          </label>
        ))}
      </fieldset>

      <div className="mt-6 flex flex-wrap justify-end gap-3">
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex min-h-11 min-w-11 items-center rounded-lg border border-slate-400 px-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
        >
          Cancelar
        </button>
        <button
          type="button"
          disabled={!selected || pending}
          onClick={() => selected && onConfirm(selected)}
          className="inline-flex min-h-11 min-w-11 items-center rounded-lg bg-slate-900 px-4 text-white disabled:cursor-not-allowed disabled:bg-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-slate-900"
        >
          Encerrar sessão selecionada e entrar
        </button>
      </div>
    </dialog>
  );
}
