import React, { useId, useRef, useState } from 'react';
import type { ConflictView, DecisionFailure, DecisionResult } from '@/application/field/conflict-service';
import { formatDateTime } from '@/domain/cylinders/format';
import { operationLabel } from '@/domain/field/sync-status';
import { TRIP_STATUS_LABELS, type TripStatus } from '@/domain/trips/trip-vocabulary';
import { Alert, Button, Dialog, Field } from '@/design-system';
import { textareaClass } from '@/components/identity/confirmation-dialog';

// Painel do conflito (Spec 010, RF-013, CA-002; contracts/telas-e-fluxos.md §3). Mostra o que a pessoa fez (sem coordenadas nem nome do recebedor), o que
// aconteceu e o estado atual no servidor, e oferece **Descartar** (com justificativa de 5 a 500 caracteres, exige conexão) e **Reenviar**. As duas versões
// ficam preservadas até a decisão; nada é descartado sem ela (RN-002).
const MIN = 5;
const MAX = 500;

const FAILURES: Record<DecisionFailure, string> = {
  offline: 'Exige conexão: a decisão fica registrada no servidor.',
  forbidden: 'Você não tem permissão para decidir sobre este registro.',
  invalid_justification: `A justificativa deve ter de ${MIN} a ${MAX} caracteres.`,
  not_found: 'Este registro não está mais no aparelho. Atualize a tela.',
  already_resolved: 'O servidor já tinha uma decisão para este registro. A tela foi atualizada.',
  session_expired: 'Sua sessão expirou. Entre de novo para decidir.',
  unavailable: 'Não foi possível registrar a decisão agora. Tente de novo.',
};

export interface ConflictPanelProps {
  conflict: ConflictView;
  online: boolean;
  // Só `trip.operate` decide.
  canDecide: boolean;
  returnFocusTo: HTMLElement | null;
  onClose: () => void;
  onDiscard: (justification: string) => Promise<DecisionResult>;
  onResubmit: () => Promise<DecisionResult>;
}

function remoteState(remote: Record<string, unknown>): string {
  const status = [remote.status, remote.from, remote.to].find((value) => typeof value === 'string' && value in TRIP_STATUS_LABELS);
  return typeof status === 'string' ? `Situação da viagem no servidor: ${TRIP_STATUS_LABELS[status as TripStatus]}.` : 'O servidor não informou mais detalhes.';
}

export function ConflictPanel({ conflict, online, canDecide, returnFocusTo, onClose, onDiscard, onResubmit }: ConflictPanelProps): React.JSX.Element {
  const formId = useId();
  const justificationRef = useRef<HTMLTextAreaElement>(null);
  const [mode, setMode] = useState<'view' | 'discard'>('view');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | undefined>();

  const { summary } = conflict;
  const label = operationLabel(summary.operation, { ...(summary.serial !== undefined ? { serial: summary.serial } : {}), ...(summary.stopPosition !== undefined ? { stopPosition: summary.stopPosition } : {}) });

  const finish = (result: DecisionResult): void => {
    setBusy(false);
    if (result.ok) { onClose(); return; }
    setError(FAILURES[result.reason]);
  };
  const resubmit = (): void => {
    setBusy(true);
    setError(null);
    void onResubmit().then(finish).catch(() => finish({ ok: false, reason: 'unavailable' }));
  };
  const discard = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (busy) return;
    const text = String(new FormData(event.currentTarget).get('justification') ?? '').replace(/\s+/g, ' ').trim();
    if (text.length < MIN || text.length > MAX) {
      setFieldError(FAILURES.invalid_justification);
      justificationRef.current?.focus();
      return;
    }
    setFieldError(undefined);
    setBusy(true);
    setError(null);
    void onDiscard(text).then(finish).catch(() => finish({ ok: false, reason: 'unavailable' }));
  };

  return (
    <Dialog
      title="Conflito na sincronização"
      size="padrao"
      onClose={onClose}
      returnFocusTo={returnFocusTo}
      {...(mode === 'discard' ? { initialFocusRef: justificationRef } : {})}
      footer={mode === 'discard' ? (
        <>
          <Button variant="secundario" onClick={() => { setMode('view'); setError(null); setFieldError(undefined); }}>Voltar</Button>
          <Button type="submit" form={formId} disabled={busy || !online}>{busy ? 'Descartando…' : 'Descartar registro'}</Button>
        </>
      ) : (
        <>
          <Button variant="secundario" onClick={onClose}>Fechar</Button>
          {canDecide && <Button variant="secundario" disabled={busy || !online} onClick={() => setMode('discard')}>Descartar</Button>}
          {canDecide && <Button disabled={busy || !online} loading={busy} loadingLabel="Reenviando…" onClick={resubmit}>Reenviar</Button>}
        </>
      )}
    >
      <section aria-labelledby={`${formId}-fez`} className="flex flex-col gap-1">
        <h3 id={`${formId}-fez`} className="text-corpo font-semibold text-navy">O que você fez</h3>
        <p className="text-corpo">{label}</p>
        <p className="text-legenda text-texto-secundario">{`Registrado neste aparelho em ${formatDateTime(summary.queuedAt)}.`}</p>
        {summary.positionInformed !== undefined && <p className="text-legenda text-texto-secundario">{`Posição informada: ${summary.positionInformed ? 'sim' : 'não'}`}</p>}
        {summary.recipientInformed !== undefined && <p className="text-legenda text-texto-secundario">{`Recebedor informado: ${summary.recipientInformed ? 'sim' : 'não'}`}</p>}
      </section>
      <section aria-labelledby={`${formId}-aconteceu`} className="flex flex-col gap-1">
        <h3 id={`${formId}-aconteceu`} className="text-corpo font-semibold text-navy">O que aconteceu</h3>
        <p className="text-corpo">{conflict.reasonText}</p>
      </section>
      <section aria-labelledby={`${formId}-atual`} className="flex flex-col gap-1">
        <h3 id={`${formId}-atual`} className="text-corpo font-semibold text-navy">Estado atual</h3>
        <p className="text-corpo">{remoteState(conflict.remote)}</p>
      </section>
      <p className="text-legenda text-texto-secundario">Os dados que você registrou continuam guardados neste aparelho até você decidir.</p>
      {!canDecide && <p className="text-corpo">Só quem pode operar viagens decide sobre este registro.</p>}
      {canDecide && !online && <p className="text-corpo font-semibold text-alerta-texto">Exige conexão: a decisão fica registrada no servidor.</p>}
      {error && <Alert variant="erro">{error}</Alert>}
      {mode === 'discard' && (
        <form id={formId} noValidate onSubmit={discard} className="flex flex-col gap-2">
          <p className="text-corpo">Descartar apaga o registro deste aparelho. A justificativa fica na auditoria.</p>
          <Field label="Justificativa" error={fieldError}>
            {(control) => <textarea ref={justificationRef} name="justification" rows={3} maxLength={MAX} {...control} className={textareaClass} />}
          </Field>
        </form>
      )}
    </Dialog>
  );
}
