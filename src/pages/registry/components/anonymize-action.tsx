import React, { useId, useState } from 'react';
import type { AnonymizationRequest, AnonymizedResult, RegistryFailure, RegistryOutcome } from '@/application/registry/registry-service';
import { Button } from '@/design-system';
import { AnonymizeDialog, type AnonymizationSubject } from './anonymize-dialog';

export interface AnonymizeActionProps {
  subject: AnonymizationSubject;
  // Nome só para o texto do diálogo.
  name: string;
  label?: string;
  // Motivo pelo qual a ação está bloqueada (por exemplo, "Inative antes de anonimizar."); vazio quando liberada.
  blockedReason?: string | null;
  online: boolean;
  anonymize: (request: AnonymizationRequest) => Promise<RegistryOutcome<AnonymizedResult>>;
  // Chamado depois do sucesso; quem usa recarrega o cadastro e mostra o aviso com a data.
  onDone: (result: AnonymizedResult) => void;
}

function failureMessage(failure: RegistryFailure): string {
  switch (failure.kind) {
    case 'mfa_required': return 'Esta ação exige o segundo fator de autenticação. Confirme o segundo fator na sua conta (em Minha conta) e tente de novo.';
    case 'access_denied': return 'Você não tem permissão para anonimizar.';
    case 'active_record': return 'Inative o cadastro antes de anonimizar.';
    case 'already_anonymized': return 'Os dados pessoais deste cadastro já foram anonimizados. Recarregue a tela.';
    case 'version_conflict': return 'Este cadastro foi alterado por outra pessoa. Recarregue a tela e confira antes de anonimizar.';
    case 'confirmation_required': return 'Confirme digitando a palavra pedida.';
    case 'justification_required': return 'Explique o motivo com pelo menos 5 caracteres.';
    case 'offline': return 'Sem conexão. Esta operação exige conexão e nada é guardado neste aparelho.';
    case 'not_found': return 'Cadastro não encontrado.';
    case 'invalid': return 'Esta anonimização não é permitida para este cadastro.';
    default: return 'Não foi possível confirmar se a anonimização foi concluída. Recarregue a tela antes de tentar de novo.';
  }
}

// Botão "Anonimizar dados pessoais" com o diálogo irreversível (RF-062): desabilitado com o motivo à vista quando o cadastro ainda está
// ativo, e com o erro do servidor (inclusive a falta do segundo fator) dentro do diálogo.
export function AnonymizeAction({ subject, name, label = 'Anonimizar dados pessoais', blockedReason = null, online, anonymize, onDone }: AnonymizeActionProps): React.JSX.Element {
  const hintId = useId();
  const [trigger, setTrigger] = useState<HTMLElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirm = async (request: AnonymizationRequest): Promise<void> => {
    setBusy(true);
    setError(null);
    const outcome = await anonymize(request);
    setBusy(false);
    if (outcome.kind === 'success') { setTrigger(null); onDone(outcome.value); return; }
    setError(failureMessage(outcome));
  };

  const disabled = blockedReason !== null || !online;
  return (
    <div className="flex flex-col items-start gap-2">
      <Button variant="secundario" disabled={disabled} aria-describedby={disabled ? hintId : undefined} onClick={(event) => { setError(null); setTrigger(event.currentTarget); }}>{label}</Button>
      {disabled && <p id={hintId} className="text-legenda text-texto-secundario">{blockedReason ?? 'Sem conexão. Esta operação exige conexão.'}</p>}
      {trigger && (
        <AnonymizeDialog subject={subject} name={name} busy={busy} error={error} returnFocusTo={trigger} onCancel={() => setTrigger(null)} onConfirm={(request) => void confirm(request)} />
      )}
    </div>
  );
}
