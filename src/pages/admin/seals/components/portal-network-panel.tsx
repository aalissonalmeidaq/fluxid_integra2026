import React, { useId, useState } from 'react';
import type { PlatformOutcome } from '@/application/seals/platform-seal-service';
import { failureText } from '@/application/seals/platform-seal-views';
import { Button } from '@/design-system';
import { JustificationDialog } from './justification-dialog';

// Rede de configuração dos lacres (Spec 013, US4; RF-016; contracts/telas.md). Explica o primeiro contato e revela a senha padrão sob
// pedido, com o motivo, que fica na auditoria. A senha é fixa no firmware e igual para toda a frota: não há botão de troca. Ela só
// existe nesta tela enquanto aberta; nada vai para o armazenamento do navegador.

export interface PortalNetworkPanelProps {
  reveal: (justification: string) => Promise<PlatformOutcome<string>>;
  online: boolean;
}

export function PortalNetworkPanel({ reveal, online }: PortalNetworkPanelProps): React.JSX.Element {
  const titleId = useId();
  const fieldId = useId();
  // O botão que abriu o diálogo recebe o foco de volta ao fechar.
  const [asking, setAsking] = useState<HTMLElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const confirm = async (justification: string) => {
    setBusy(true);
    const outcome = await reveal(justification);
    setBusy(false);
    if (outcome.kind === 'success') {
      setPassword(outcome.value);
      setAsking(null);
      setCopied(null);
    } else setError(failureText(outcome.kind));
  };

  const copy = async () => {
    if (!password) return;
    try {
      await navigator.clipboard.writeText(password);
      setCopied('Senha copiada.');
    } catch {
      setCopied('Não foi possível copiar. Selecione o campo e copie.');
    }
  };

  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-4 rounded-card border border-borda-suave bg-branco p-4">
      <h3 id={titleId} className="m-0 text-h3 font-semibold text-navy">Rede de configuração</h3>
      <p className="m-0 max-w-padrao text-corpo text-grafite">
        Sem rede salva, o lacre abre a própria rede Wi-Fi, chamada <strong>FluxID-Lacre-</strong> mais os 4 últimos caracteres do código
        dele (por exemplo, FluxID-Lacre-M9XT para o lacre DSP-7KQ2M9XT).
      </p>
      <ol className="m-0 flex max-w-padrao list-decimal flex-col gap-2 pl-6 text-corpo text-grafite">
        <li>Ligue o lacre perto do local de uso. Se ele já tiver rede, segure o botão BOOT da placa por 5 segundos.</li>
        <li>No celular ou no computador, entre na rede FluxID-Lacre-XXXX com a senha abaixo. A página do lacre abre sozinha.</li>
        <li>Escolha o Wi-Fi do local e informe a senha dele. O lacre testa a rede antes de guardar.</li>
        <li>Conectado à internet, o lacre aparece aqui aguardando a vinculação a uma empresa. Confira o código e aprove para a empresa.</li>
      </ol>
      <p className="m-0 max-w-padrao text-legenda text-texto-secundario">
        A senha é a mesma para todos os lacres e fica fixa no firmware. Para trocá-la, é preciso gravar um firmware novo na frota.
        Cada consulta fica na auditoria.
      </p>
      {password === null ? (
        <Button className="self-start" variant="secundario" disabled={!online} onClick={(event) => { setError(null); setAsking(event.currentTarget); }}>
          Mostrar a senha
        </Button>
      ) : (
        <div className="flex flex-col gap-2">
          <label htmlFor={fieldId} className="text-corpo font-semibold text-grafite">Senha da rede de configuração</label>
          <div className="flex flex-wrap items-center gap-2">
            <input id={fieldId} readOnly value={password} className="min-h-alvo rounded-controle border border-borda-controle px-4 text-corpo"
              onFocus={(event) => event.currentTarget.select()} />
            <Button variant="secundario" onClick={() => void copy()}>Copiar a senha</Button>
            <Button variant="secundario" onClick={() => { setPassword(null); setCopied(null); }}>Ocultar a senha</Button>
          </div>
          {copied && <p role="status" className="m-0 text-legenda text-texto-secundario">{copied}</p>}
        </div>
      )}
      {asking && (
        <JustificationDialog
          title="Mostrar a senha da rede de configuração"
          description={<p className="m-0">Informe por que precisa da senha (por exemplo, a instalação de um lacre). O motivo fica na auditoria.</p>}
          confirmLabel="Mostrar a senha"
          busy={busy}
          error={error}
          returnFocusTo={asking}
          onCancel={() => setAsking(null)}
          onConfirm={(justification) => void confirm(justification)}
        />
      )}
    </section>
  );
}
