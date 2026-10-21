import React, { useId, useRef, useState } from 'react';
import type { SealService } from '@/application/seals/seal-service';
import type { SealDetail } from '@/application/seals/seal-views';
import { PasswordField } from '@/components/identity/password-field';
import { Alert, Button, Dialog, TextField } from '@/design-system';
import { positionAge } from '@/domain/seals/seal-age';
import { SEAL_LIMITS } from '@/domain/seals/seal-limits';
import { COMMAND_KIND_LABELS } from '@/domain/seals/seal-vocabulary';
import { canAddWifi, validateWifiNetwork } from '@/domain/seals/wifi-network';
import { ReasonDialog } from '@/pages/cylinders/components/reason-dialog';

// Redes Wi-Fi do lacre (Spec 012, RF-034a a RF-034f; História 7): rede em uso e nomes das redes guardadas (nunca a senha). Adicionar
// manda nome e senha ao servidor, que guarda a senha só até o lacre confirmar; o campo é limpo ao fechar e a senha nunca volta à tela.
// Com viagem ou vigilância, a troca pode deixar o lacre sem comunicar, então pede confirmação do risco.

type Pending =
  | { kind: 'add'; trigger: HTMLElement }
  | { kind: 'remove'; ssid: string; trigger: HTMLElement }
  | { kind: 'reset'; trigger: HTMLElement }
  | null;

const FAILURE: Record<string, string> = {
  wifi_list_full: `O lacre guarda até ${SEAL_LIMITS.wifiListMax} redes. Remova uma antes de adicionar outra.`,
  wifi_not_in_list: 'Esta rede não está mais na lista do lacre.',
  seal_inactive: 'O dispositivo está desativado.',
  justification_required: 'Explique o motivo com 5 a 500 caracteres.',
  access_denied: 'Você não tem permissão para mudar as redes do lacre.',
  offline: 'Sem conexão: comandos de lacre exigem conexão.',
};
const RISK_TEXT = 'Este cilindro está em viagem ou sob vigilância: durante a troca, o lacre pode ficar sem comunicar e gerar alerta.';
const RISK_CONFIRM = 'Entendo que o lacre pode ficar sem comunicar durante a troca.';
const WAITING = new Set(['pending', 'delivered']);

// Sem `checked`, a caixa fica por conta do formulário (chega como `confirm_risk` no FormData do diálogo de justificativa).
function RiskConfirm({ checked, error = null, onChange }: { checked?: boolean; error?: string | null; onChange?: (value: boolean) => void }): React.JSX.Element {
  const id = useId();
  return (
    <div className="flex flex-col gap-2">
      <Alert variant="alerta">{RISK_TEXT}</Alert>
      <label htmlFor={id} className="flex min-h-alvo items-center gap-2 text-corpo text-grafite">
        <input id={id} name="confirm_risk" type="checkbox" className="size-6" checked={checked} aria-invalid={error ? true : undefined}
          onChange={onChange && ((event) => onChange(event.target.checked))} />
        {RISK_CONFIRM}
      </label>
      {error && <p role="alert" className="m-0 text-legenda font-semibold text-erro">{error}</p>}
    </div>
  );
}

// Nome exibido para a rede em uso do lacre (pedido do responsável, 20/10/2026); o nome real do Wi-Fi segue nas listas de escolha.
const IN_USE_NETWORK_LABEL = 'GSM/Telemetria';

interface WifiOption { ssid: string; current: boolean; available: boolean; rssi: number | null }

function knownNetworks(seal: SealDetail): WifiOption[] {
  const current = seal.wifiInUse;
  const available = new Map((seal.wifiAvailable ?? []).map((network) => [network.ssid, network.rssi]));
  const names = [...new Set([...available.keys(), ...(current ? [current.ssid] : []), ...seal.wifiSaved])];
  return names.map((ssid) => ({ ssid, current: current?.ssid === ssid, available: available.has(ssid) || current?.ssid === ssid, rssi: available.get(ssid) ?? (current?.ssid === ssid ? current.rssi : null) }))
    .sort((left, right) => Number(right.available) - Number(left.available) || (right.rssi ?? -128) - (left.rssi ?? -128));
}

function signalLabel(rssi: number | null): string | null {
  if (rssi === null) return null;
  if (rssi >= -55) return 'Sinal forte';
  if (rssi >= -70) return 'Sinal médio';
  return 'Sinal fraco';
}

function AddDialog({ busy, error, risky, networks, scanAge, returnFocusTo, onCancel, onConfirm }: {
  busy: boolean; error: string | null; risky: boolean; returnFocusTo: HTMLElement; onCancel: () => void;
  networks: readonly WifiOption[];
  scanAge: string | null;
  onConfirm: (network: { ssid: string; password: string | null; open: boolean }, confirmRisk: boolean) => void;
}): React.JSX.Element {
  const formId = useId();
  const ssidRef = useRef<HTMLInputElement>(null);
  const [ssid, setSsid] = useState('');
  const [password, setPassword] = useState('');
  const [open, setOpen] = useState(false);
  const [risk, setRisk] = useState(false);
  const [errors, setErrors] = useState<{ ssid?: string; password?: string; risk?: string }>({});
  const openId = useId();

  const submit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (busy) return;
    const parsed = validateWifiNetwork({ ssid, password, open });
    if (!parsed.ok) { setErrors(parsed.errors); return; }
    if (risky && !risk) { setErrors({ risk: 'Confirme que entende o risco para continuar.' }); return; }
    setErrors({});
    onConfirm(parsed.value, risky && risk);
  };

  return (
    <Dialog title="Adicionar rede Wi-Fi" onClose={onCancel} initialFocusRef={ssidRef} returnFocusTo={returnFocusTo}
      footer={(
        <>
          <Button variant="secundario" onClick={onCancel}>Cancelar</Button>
          <Button type="submit" form={formId} loading={busy} loadingLabel="Enviando…">Enviar ao lacre</Button>
        </>
      )}
    >
      <form id={formId} noValidate onSubmit={submit} className="flex flex-col gap-4">
        <p className="text-corpo">A senha vai só para o lacre e é apagada do FluxID quando ele confirmar. Ela não aparece de novo.</p>
        {error && <Alert variant="erro">{error}</Alert>}
        {networks.length > 0 && (
          <fieldset className="m-0 flex min-w-0 flex-col gap-2 border-0 p-0">
            <legend className="mb-2 text-corpo font-semibold text-grafite">Redes disponíveis para conexão</legend>
            <p className="m-0 text-legenda text-texto-secundario">
              {scanAge ? `Varredura informada ${scanAge}. ` : 'O lacre ainda não informou uma varredura recente. '}
              Redes guardadas continuam disponíveis para reconfiguração.
            </p>
            <div className="flex flex-col gap-2">
              {networks.map((network) => {
                const signal = signalLabel(network.rssi);
                return (
                  <label key={network.ssid} className="flex min-h-alvo cursor-pointer items-center gap-2 rounded-controle border border-borda-suave px-4 py-2 has-checked:border-azul-profundo has-checked:bg-cinza-gelo">
                    <input type="radio" name="known-network" value={network.ssid} checked={ssid === network.ssid}
                      onChange={() => { setSsid(network.ssid); setErrors((current) => ({ ...current, ssid: undefined })); }} />
                    <span className="min-w-0 flex-1 break-words text-corpo font-semibold text-grafite">{network.ssid}</span>
                    <span className="shrink-0 text-legenda text-texto-secundario">
                      {[network.current ? 'Em uso' : null, network.available ? signal : 'Guardada'].filter(Boolean).join(' · ')}
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        )}
        <TextField ref={ssidRef} label="Nome da rede" value={ssid} maxLength={32} autoComplete="off" spellCheck={false} error={errors.ssid}
          onChange={(event) => setSsid(event.target.value)} />
        <label htmlFor={openId} className="flex min-h-alvo items-center gap-2 text-corpo text-grafite">
          <input id={openId} type="checkbox" className="size-6" checked={open} onChange={(event) => { setOpen(event.target.checked); setPassword(''); }} />
          Rede aberta (sem senha)
        </label>
        {!open && (
          <PasswordField label="Senha da rede" value={password} maxLength={63} autoComplete="new-password" error={errors.password}
            onChange={(event) => setPassword(event.target.value)} />
        )}
        {risky && <RiskConfirm checked={risk} error={errors.risk ?? null} onChange={setRisk} />}
      </form>
    </Dialog>
  );
}

function RemoveDialog({ ssid, busy, error, risky, returnFocusTo, onCancel, onConfirm }: {
  ssid: string; busy: boolean; error: string | null; risky: boolean; returnFocusTo: HTMLElement; onCancel: () => void; onConfirm: (confirmRisk: boolean) => void;
}): React.JSX.Element {
  const formId = useId();
  const [risk, setRisk] = useState(false);
  const [riskError, setRiskError] = useState<string | null>(null);
  const submit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (busy) return;
    if (risky && !risk) { setRiskError('Confirme que entende o risco para continuar.'); return; }
    onConfirm(risky && risk);
  };
  return (
    <Dialog title={`Remover a rede ${ssid}`} onClose={onCancel} returnFocusTo={returnFocusTo}
      footer={(
        <>
          <Button variant="secundario" onClick={onCancel}>Cancelar</Button>
          <Button type="submit" form={formId} loading={busy} loadingLabel="Enviando…">Remover do lacre</Button>
        </>
      )}
    >
      <form id={formId} noValidate onSubmit={submit} className="flex flex-col gap-4">
        <p className="text-corpo">O lacre esquece esta rede. Se estiver conectado a ela, passa para outra da lista ou para a rede padrão.</p>
        {error && <Alert variant="erro">{error}</Alert>}
        {risky && <RiskConfirm checked={risk} error={riskError} onChange={setRisk} />}
      </form>
    </Dialog>
  );
}

export interface WifiNetworksPanelProps {
  service: SealService | null;
  organizationId: string;
  seal: SealDetail;
  online: boolean;
  // Quem administra dispositivos (seal.admin) muda as redes.
  canAdmin: boolean;
  now?: () => Date;
  // Pede ao detalhe para recarregar depois de um pedido aceito.
  onChanged: () => void;
}

export function WifiNetworksPanel({ service, organizationId, seal, online, canAdmin, now = () => new Date(), onChanged }: WifiNetworksPanelProps): React.JSX.Element {
  const [pending, setPending] = useState<Pending>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // O servidor conhece a viagem em andamento; a tela só conhece a vigilância. A recusa por risco faz o aviso aparecer.
  const [riskFromServer, setRiskFromServer] = useState(false);
  const risky = seal.watch !== null || riskFromServer;
  const listFull = !canAddWifi(seal.wifiSaved, '');
  const waiting = seal.commands.filter((command) => command.kind.startsWith('wifi_') && WAITING.has(command.status));
  const active = seal.status === 'active';
  const networks = knownNetworks(seal);

  const begin = (next: NonNullable<Pending>) => { setError(null); setNotice(null); setPending(next); };

  const finish = (outcome: Awaited<ReturnType<SealService['addWifi']>>, message: string) => {
    setBusy(false);
    if (outcome.kind === 'success') { setPending(null); setNotice(message); onChanged(); return; }
    if (outcome.kind === 'wifi_risk_not_confirmed') { setRiskFromServer(true); setError(null); return; }
    setError(FAILURE[outcome.kind] ?? 'Não foi possível enviar agora. Tente de novo.');
  };

  const add = async (network: { ssid: string; password: string | null; open: boolean }, confirmRisk: boolean) => {
    if (!service) return;
    setBusy(true);
    finish(await service.addWifi(organizationId, seal.deviceId, network, confirmRisk), `Pedido enviado: ${network.ssid}. A rede só entra na lista quando o lacre confirmar.`);
  };
  const remove = async (ssid: string, confirmRisk: boolean) => {
    if (!service) return;
    setBusy(true);
    finish(await service.removeWifi(organizationId, seal.deviceId, ssid, confirmRisk), `Pedido enviado: remover ${ssid}. A lista muda quando o lacre confirmar.`);
  };
  const reset = async (justification: string, form: FormData) => {
    if (!service) return;
    if (risky && form.get('confirm_risk') !== 'on') { setError('Confirme que entende o risco para continuar.'); return; }
    setBusy(true);
    finish(await service.resetWifi(organizationId, seal.deviceId, justification, risky), 'Pedido enviado: voltar à rede padrão. A lista é apagada quando o lacre confirmar.');
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="m-0 text-corpo text-grafite">
        {seal.wifiInUse
          ? <>Em uso: {IN_USE_NETWORK_LABEL} ({seal.wifiInUse.kind === 'default' ? 'rede padrão' : 'rede da lista'}{seal.wifiInUse.rssi === null ? '' : `, sinal ${seal.wifiInUse.rssi} dBm`}).{seal.wifiInUse.at && <span className="text-texto-secundario"> Informada {positionAge(seal.wifiInUse.at, now())}.</span>}</>
          : 'O lacre ainda não informou a rede em uso.'}
      </p>
      {seal.wifiSaved.length === 0 ? <p className="m-0 text-corpo text-grafite">Redes guardadas: nenhuma além da padrão.</p> : (
        <ul aria-label="Redes guardadas" className="m-0 flex list-none flex-col gap-2 p-0">
          {seal.wifiSaved.map((ssid) => (
            <li key={ssid} className="flex items-center justify-between gap-2 rounded-controle border border-borda-suave px-4 py-2">
              <span className="min-w-0 flex-1 break-words text-corpo font-semibold text-grafite">{ssid}</span>
              {canAdmin && active && (
                <Button variant="secundario" disabled={!online} aria-label={`Remover a rede ${ssid}`}
                  onClick={(event) => begin({ kind: 'remove', ssid, trigger: event.currentTarget })}>Remover</Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {waiting.length > 0 && (
        <ul aria-label="Pedidos de rede aguardando o lacre" className="m-0 flex list-none flex-col gap-1 p-0">
          {waiting.map((command) => (
            <li key={command.id} className="text-legenda text-texto-secundario">
              Aguardando o lacre: {COMMAND_KIND_LABELS[command.kind]}{command.wifiSsid ? ` (${command.wifiSsid})` : ''}, pedido {positionAge(command.createdAt, now())}.
            </li>
          ))}
        </ul>
      )}
      {notice && <Alert variant="sucesso">{notice}</Alert>}
      {error && !pending && <Alert variant="erro">{error}</Alert>}
      {canAdmin && active && (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-2">
            <Button variant="secundario" disabled={!online || listFull} onClick={(event) => begin({ kind: 'add', trigger: event.currentTarget })}>Adicionar rede</Button>
            <Button variant="secundario" disabled={!online} onClick={(event) => begin({ kind: 'reset', trigger: event.currentTarget })}>Voltar à rede padrão</Button>
          </div>
          {listFull && <p className="m-0 text-legenda text-texto-secundario">{FAILURE.wifi_list_full}</p>}
          {!online && <p className="m-0 text-legenda text-texto-secundario">{FAILURE.offline}</p>}
        </div>
      )}

      {pending?.kind === 'add' && (
        <AddDialog busy={busy} error={error} risky={risky} networks={networks}
          scanAge={seal.wifiAvailableAt ? positionAge(seal.wifiAvailableAt, now()) : null}
          returnFocusTo={pending.trigger} onCancel={() => setPending(null)}
          onConfirm={(network, confirmRisk) => void add(network, confirmRisk)} />
      )}
      {pending?.kind === 'remove' && (
        <RemoveDialog ssid={pending.ssid} busy={busy} error={error} risky={risky} returnFocusTo={pending.trigger} onCancel={() => setPending(null)}
          onConfirm={(confirmRisk) => void remove(pending.ssid, confirmRisk)} />
      )}
      {pending?.kind === 'reset' && (
        <ReasonDialog title="Voltar à rede padrão" confirmLabel="Voltar à padrão" busy={busy} error={error} returnFocusTo={pending.trigger}
          description="O lacre apaga todas as redes da lista e volta a usar só a rede padrão gravada no firmware."
          onCancel={() => setPending(null)} onConfirm={(text, form) => void reset(text, form)}>
          {risky && <RiskConfirm />}
        </ReasonDialog>
      )}
    </div>
  );
}
