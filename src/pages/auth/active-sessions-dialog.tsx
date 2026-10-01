import React, { useState } from 'react';
import type { ActiveSessionSummary } from '@/application/identity/session-service';
import { Button, Dialog } from '@/design-system';

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

// Nenhuma sessão é encerrada sem escolha explícita; o Dialog do design system prende o foco e fecha com Escape.
export function ActiveSessionsDialog({ sessions, pending, onConfirm, onCancel }: ActiveSessionsDialogProps): React.JSX.Element {
  const [selected, setSelected] = useState<string | null>(null);

  return (
    <Dialog
      title="Limite de sessões atingido"
      onClose={onCancel}
      footer={
        <>
          <Button variant="secundario" onClick={onCancel}>
            Cancelar
          </Button>
          <Button disabled={!selected || pending} onClick={() => selected && onConfirm(selected)}>
            Encerrar sessão selecionada e entrar
          </Button>
        </>
      }
    >
      <p className="text-corpo">
        Você atingiu o limite de 3 sessões ativas. Escolha uma sessão para encerrar e liberar este acesso.
        Nenhuma sessão é encerrada automaticamente.
      </p>

      <fieldset className="flex flex-col gap-2" disabled={pending}>
        <legend className="text-corpo font-medium">Escolha a sessão a encerrar</legend>
        {sessions.map((session) => (
          <label
            key={session.session_id}
            className="flex min-h-alvo cursor-pointer items-start gap-4 rounded-card border border-borda-controle p-4 has-checked:border-azul-profundo has-checked:bg-info-fundo"
          >
            <input
              type="radio"
              name="revoke-session"
              value={session.session_id}
              checked={selected === session.session_id}
              onChange={() => setSelected(session.session_id)}
              className="mt-1 size-4"
            />
            <span className="text-corpo">
              <span className="block font-medium">Sessão iniciada em {formatDate(session.started_at)}</span>
              <span className="block">Última atividade: {formatDate(session.last_seen_at)}</span>
              {session.aal === 'aal2' && <span className="block">Verificação em duas etapas ativa</span>}
            </span>
          </label>
        ))}
      </fieldset>
    </Dialog>
  );
}
