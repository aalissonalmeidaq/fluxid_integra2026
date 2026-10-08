import React, { useEffect, useState } from 'react';
import type { RegistryFailure, RegistryOutcome } from '@/application/registry/registry-service';
import { Button } from '@/design-system';

export interface RevealDocumentProps {
  // "CPF" ou "CNH": nomeia o botão e os anúncios.
  label: string;
  // Valor mascarado que a tela já tem (RF-029).
  masked: string;
  // Só quem tem `*.document` vê o botão; a decisão final é do servidor (RF-030).
  canReveal: boolean;
  // Pede o valor completo ao servidor; nada é gravado no aparelho.
  reveal: () => Promise<RegistryOutcome<string>>;
  // Formata o valor completo para exibição (por exemplo, CPF com pontos e hífen).
  format?: (value: string) => string;
  disabled?: boolean;
}

const failureText = (failure: RegistryFailure): string => {
  switch (failure.kind) {
    case 'access_denied':
    case 'mfa_required': return 'Você não tem permissão para revelar este documento.';
    case 'offline': return 'Sem conexão. Revelar o documento exige conexão.';
    case 'anonymized_record': return 'Os dados pessoais deste cadastro foram anonimizados.';
    case 'not_found': return 'Cadastro não encontrado.';
    default: return 'Não foi possível revelar o documento agora. Tente de novo.';
  }
};

// Documento mascarado com o botão "Revelar" (RF-029, RF-030). O valor completo vive só no estado deste componente: some ao ocultar,
// ao sair da tela, ao trocar de organização (a tela é remontada), ao recarregar e ao perder a sessão; nunca vai para armazenamento
// local, URL nem histórico de navegação (RF-031).
export function RevealDocument({ label, masked, canReveal, reveal, format = (value) => value, disabled = false }: RevealDocumentProps): React.JSX.Element {
  const [value, setValue] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  // Ao ocultar a página (trocar de aba, bloquear a tela), o valor é descartado.
  useEffect(() => {
    const discard = (): void => setValue(null);
    window.addEventListener('pagehide', discard);
    return () => window.removeEventListener('pagehide', discard);
  }, []);

  const show = async (): Promise<void> => {
    if (busy) return;
    setBusy(true);
    setMessage('');
    const outcome = await reveal();
    setBusy(false);
    if (outcome.kind === 'success') {
      setValue(outcome.value);
      setMessage(`${label} revelado. Ele fica visível até você ocultar.`);
    } else {
      setMessage(failureText(outcome));
    }
  };
  const hide = (): void => {
    setValue(null);
    setMessage(`${label} oculto.`);
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="break-all font-semibold text-grafite" data-sensitive={value !== null ? 'revealed' : 'masked'}>{value === null ? masked : format(value)}</span>
        {canReveal && (value === null
          ? <Button variant="secundario" disabled={disabled || busy} loading={busy} loadingLabel="Revelando…" aria-label={`Revelar ${label}`} onClick={() => void show()}>Revelar</Button>
          : <Button variant="secundario" aria-label={`Ocultar ${label}`} onClick={hide}>Ocultar</Button>)}
      </div>
      <p role="status" aria-atomic="true" className="min-h-6 text-legenda text-texto-secundario">{message}</p>
    </div>
  );
}
