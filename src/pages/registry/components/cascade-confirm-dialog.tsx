import React from 'react';
import type { CascadeCounts } from '@/application/registry/registry-service';
import { ReasonDialog } from '@/pages/cylinders/components/reason-dialog';

export interface CascadeConfirmDialogProps {
  // Cliente ou unidade: o cliente inativa unidades e geocercas; a unidade inativa só geocercas.
  scope: 'customer' | 'site';
  // Nome do cadastro, para o título e o texto.
  name: string;
  // Quantidades da prévia (ou as novas, depois de `CASCADE_CHANGED`).
  counts: CascadeCounts;
  busy?: boolean;
  error?: string | null;
  returnFocusTo: HTMLElement | null;
  onCancel: () => void;
  // Recebe a justificativa já validada (5 a 500 caracteres) e as quantidades que a pessoa viu.
  onConfirm: (justification: string, counts: CascadeCounts) => void;
}

const plural = (count: number, one: string, many: string): string => `${count} ${count === 1 ? one : many}`;

// Diálogo de inativação com cascata (RF-034, História 6): mostra o que será inativado junto antes de confirmar, exige justificativa e
// devolve o foco ao acionador. As quantidades confirmadas vão ao servidor (`expected_counts`): se mudaram, o servidor recusa e o
// diálogo reabre com os números novos.
export function CascadeConfirmDialog({ scope, name, counts, busy = false, error = null, returnFocusTo, onCancel, onConfirm }: CascadeConfirmDialogProps): React.JSX.Element {
  const effects: string[] = [];
  if (scope === 'customer') effects.push(plural(counts.sites, 'unidade ativa', 'unidades ativas'));
  effects.push(plural(counts.geofences, 'geocerca ativa', 'geocercas ativas'));
  const nothing = (scope === 'customer' ? counts.sites : 0) === 0 && counts.geofences === 0;
  return (
    <ReasonDialog
      title={scope === 'customer' ? 'Inativar cliente' : 'Inativar unidade'}
      confirmLabel="Confirmar inativação"
      description={`${name} deixa de ser usado e não aceita mais edição. ${nothing ? 'Nada mais será inativado junto.' : `Serão inativadas junto: ${effects.join(' e ')}.`} Nada é apagado, e reativar ${scope === 'customer' ? 'o cliente' : 'a unidade'} não reativa o que foi inativado junto.`}
      busy={busy}
      error={error}
      returnFocusTo={returnFocusTo}
      onCancel={onCancel}
      onConfirm={(justification) => onConfirm(justification, counts)}
    />
  );
}
