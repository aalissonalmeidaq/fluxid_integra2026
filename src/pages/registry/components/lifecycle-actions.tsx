import React, { useState } from 'react';
import type { CascadeCounts, RegistryFailure, RegistryOutcome } from '@/application/registry/registry-service';
import { Alert, Button } from '@/design-system';
import { ReasonDialog } from '@/pages/cylinders/components/reason-dialog';
import { CascadeConfirmDialog } from './cascade-confirm-dialog';

export interface LifecycleLabels {
  inactivate: string;
  reactivate: string;
  inactivated: string;
  reactivated: string;
  inactivateTitle: string;
  reactivateTitle: string;
  inactivateDescription: string;
  reactivateDescription: string;
}

export interface LifecycleActionsProps {
  name: string;
  active: boolean;
  // Registro anonimizado não aceita reativação nem outra ação (RF-058).
  blocked?: boolean;
  canDeactivate: boolean;
  online: boolean;
  labels: LifecycleLabels;
  // Presente só quando a inativação tem cascata (cliente e unidade): pede a prévia ao servidor antes de abrir o diálogo.
  cascade?: { scope: 'customer' | 'site'; preview: () => Promise<RegistryOutcome<CascadeCounts>> };
  inactivate: (justification: string, counts: CascadeCounts) => Promise<RegistryOutcome<unknown>>;
  reactivate: (justification: string) => Promise<RegistryOutcome<unknown>>;
  // Chamado depois do sucesso com a mensagem a anunciar; quem usa recarrega o cadastro.
  onChanged: (message: string) => void;
}

type Dialog =
  | { kind: 'inactivate'; trigger: HTMLElement; counts: CascadeCounts }
  | { kind: 'reactivate'; trigger: HTMLElement }
  | null;

function failureMessage(failure: RegistryFailure): string {
  switch (failure.kind) {
    case 'access_denied':
    case 'mfa_required': return 'Você não tem permissão para esta ação.';
    case 'offline': return 'Sem conexão. Esta operação exige conexão e nada é guardado neste aparelho.';
    case 'justification_required': return 'Explique o motivo com pelo menos 5 caracteres.';
    case 'already_inactive': return 'Este cadastro já estava inativo. Recarregue a tela.';
    case 'parent_inactive': return 'O cadastro de origem está inativo. Reative primeiro o cadastro de origem.';
    case 'anonymized_record': return 'Os dados pessoais deste cadastro foram anonimizados e ele não aceita mais ações.';
    case 'cascade_changed': return 'As quantidades mudaram desde a prévia. Confira os números novos e confirme de novo.';
    case 'not_found': return 'Cadastro não encontrado.';
    case 'invalid': return 'O cadastro já está nesta situação. Recarregue a tela.';
    default: return 'Não foi possível confirmar se a ação foi concluída. Recarregue a tela antes de tentar de novo.';
  }
}

// Ações de inativar e reativar de um cadastro (cliente, unidade, geocerca ou motorista): diálogo acessível com justificativa, prévia
// da cascata quando existe, foco devolvido ao acionador e nenhuma exclusão em lugar algum (RF-033 a RF-035, CA-002).
export function LifecycleActions({ name, active, blocked = false, canDeactivate, online, labels, cascade, inactivate, reactivate, onChanged }: LifecycleActionsProps): React.JSX.Element | null {
  const [dialog, setDialog] = useState<Dialog>(null);
  const [busy, setBusy] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);

  if (!canDeactivate) return null;

  const open = async (kind: 'inactivate' | 'reactivate', trigger: HTMLElement): Promise<void> => {
    setPageError(null);
    setDialogError(null);
    if (kind === 'reactivate') return setDialog({ kind, trigger });
    if (!cascade) return setDialog({ kind, trigger, counts: { sites: 0, geofences: 0 } });
    setBusy(true);
    const preview = await cascade.preview();
    setBusy(false);
    if (preview.kind === 'success') setDialog({ kind, trigger, counts: preview.value });
    else setPageError(failureMessage(preview));
  };

  const confirmInactivate = async (justification: string, counts: CascadeCounts): Promise<void> => {
    if (dialog?.kind !== 'inactivate') return;
    setBusy(true);
    setDialogError(null);
    const outcome = await inactivate(justification, counts);
    setBusy(false);
    if (outcome.kind === 'success') { setDialog(null); onChanged(labels.inactivated); return; }
    if (outcome.kind === 'cascade_changed' && outcome.cascadeCounts) {
      // O diálogo reabre com os números novos para a pessoa conferir antes de confirmar de novo.
      setDialog({ ...dialog, counts: outcome.cascadeCounts });
    }
    setDialogError(failureMessage(outcome));
  };

  const confirmReactivate = async (justification: string): Promise<void> => {
    setBusy(true);
    setDialogError(null);
    const outcome = await reactivate(justification);
    setBusy(false);
    if (outcome.kind === 'success') { setDialog(null); onChanged(labels.reactivated); return; }
    setDialogError(failureMessage(outcome));
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        {active && !blocked && <Button variant="secundario" disabled={!online || busy} onClick={(event) => void open('inactivate', event.currentTarget)}>{labels.inactivate}</Button>}
        {!active && !blocked && <Button variant="secundario" disabled={!online || busy} onClick={(event) => void open('reactivate', event.currentTarget)}>{labels.reactivate}</Button>}
      </div>
      {!online && <p className="text-legenda text-texto-secundario">Sem conexão. Esta operação exige conexão.</p>}
      {pageError && <Alert variant="erro">{pageError}</Alert>}

      {dialog?.kind === 'inactivate' && cascade && (
        <CascadeConfirmDialog scope={cascade.scope} name={name} counts={dialog.counts} busy={busy} error={dialogError} returnFocusTo={dialog.trigger}
          onCancel={() => setDialog(null)} onConfirm={(justification, counts) => void confirmInactivate(justification, counts)} />
      )}
      {dialog?.kind === 'inactivate' && !cascade && (
        <ReasonDialog title={labels.inactivateTitle} confirmLabel="Confirmar inativação" description={labels.inactivateDescription} busy={busy} error={dialogError} returnFocusTo={dialog.trigger}
          onCancel={() => setDialog(null)} onConfirm={(justification) => void confirmInactivate(justification, dialog.counts)} />
      )}
      {dialog?.kind === 'reactivate' && (
        <ReasonDialog title={labels.reactivateTitle} confirmLabel="Confirmar reativação" description={labels.reactivateDescription} busy={busy} error={dialogError} returnFocusTo={dialog.trigger}
          onCancel={() => setDialog(null)} onConfirm={(justification) => void confirmReactivate(justification)} />
      )}
    </div>
  );
}
