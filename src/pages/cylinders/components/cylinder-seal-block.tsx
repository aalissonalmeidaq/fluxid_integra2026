import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { watchSeals, type RealtimePort } from '@/application/seals/seal-realtime';
import type { SealService } from '@/application/seals/seal-service';
import type { SealSummary } from '@/application/seals/seal-views';
import { SealPositionMap } from '@/pages/seals/components/seal-position-map';
import { Alert, Button, ErrorState, Loading } from '@/design-system';
import { sealAbilities } from '@/domain/seals/seal-abilities';
import { LockCommandDialog } from '@/pages/seals/components/lock-command-dialog';
import { BindSealDialog } from '@/pages/seals/components/bind-seal-dialog';
import { CylinderWatchPanel } from './cylinder-watch-panel';
import { contactAge, positionAge } from '@/domain/seals/seal-age';
import { commandOrigin, health, lockState, sealState } from '@/domain/seals/seal-vocabulary';
import { SealBadge } from '@/pages/seals/components/seal-badge';
import { sealPositionQuality } from '@/domain/seals/seal-position-format';
import { SealPositionHistory } from '@/pages/seals/components/seal-position-history';

// Bloco "Lacre" no detalhe do cilindro (Spec 012, RF-011, RF-042, RF-043; História 1, cenários 6 e 7). Mostra a última posição no mapa
// e em texto, a idade da posição, a qualidade, a bateria, a saúde e a trava (ícone e texto). Atualiza sozinho pelo aviso em tempo real
// (ou a cada 30 s) e anuncia a mudança num único status atômico, sem mover o foco. Sem conexão, mantém o que já mostrou, com o horário.

type Load = { kind: 'loading' } | { kind: 'ready'; seal: SealSummary | null; at: Date } | { kind: 'error' } | { kind: 'offline' };

export interface CylinderSealBlockProps {
  organizationId: string;
  cylinderId: string;
  // Número de série do cilindro, nos títulos dos diálogos ("Travar o lacre · CIL-0042").
  serialNumber: string;
  service: SealService | null;
  online: boolean;
  realtime: RealtimePort | null;
  now?: () => Date;
  // Permissões do tenant da pessoa (decidem os botões de travar e destravar) e o segundo fator da sessão (US2).
  permissions?: readonly string[];
  hasSecondFactor?: boolean;
  secondFactor?: React.ReactNode;
}

const COMMAND_FAILURE: Record<string, string> = {
  mfa_required: 'Destravar exige a verificação em duas etapas. Conclua a verificação e tente de novo.',
  no_binding: 'O cilindro não tem lacre vinculado.',
  seal_inactive: 'O dispositivo está desativado.',
  justification_required: 'Explique o motivo com 5 a 500 caracteres.',
  access_denied: 'Você não tem permissão para operar lacres.',
  offline: 'Sem conexão: comandos de lacre exigem conexão.',
};

function Fact({ label, children }: { label: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="min-w-0">
      <dt className="text-legenda text-texto-secundario">{label}</dt>
      <dd className="m-0 break-words text-corpo text-grafite">{children}</dd>
    </div>
  );
}

// Botões de travar e destravar, com o motivo quando estão desabilitados (sealAbilities). Sem permissão de operar, não aparecem.
function SealActions({ seal, permissions, online, onOpen }: { seal: SealSummary; permissions: readonly string[]; online: boolean; onOpen: (kind: 'lock' | 'unlock', trigger: HTMLElement) => void }): React.JSX.Element | null {
  const reasonId = useId();
  if (!permissions.includes('seal.operate')) return null;
  const abilities = sealAbilities({ permissions, online, deviceActive: seal.status === 'active', bound: true, lockState: seal.lockState,
    tripInProgress: false, underWatch: seal.watch !== null, unlockIsException: true });
  const reason = !abilities.lock.allowed ? abilities.lock.reason : !abilities.unlock.allowed ? abilities.unlock.reason : null;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <Button variant="secundario" disabled={!abilities.lock.allowed} aria-describedby={reason ? reasonId : undefined} onClick={(event) => onOpen('lock', event.currentTarget)}>Travar</Button>
        <Button variant="secundario" disabled={!abilities.unlock.allowed} aria-describedby={reason ? reasonId : undefined} onClick={(event) => onOpen('unlock', event.currentTarget)}>Destravar</Button>
      </div>
      {reason && <p id={reasonId} className="m-0 text-legenda text-texto-secundario">{reason}</p>}
    </div>
  );
}

export function CylinderSealBlock({ organizationId, cylinderId, serialNumber, service, online, realtime, now = () => new Date(), permissions = [], hasSecondFactor = false, secondFactor = null }: CylinderSealBlockProps): React.JSX.Element {
  const titleId = useId();
  const [load, setLoad] = useState<Load>(online ? { kind: 'loading' } : { kind: 'offline' });
  const [announcement, setAnnouncement] = useState('');
  const [, setTick] = useState(0);
  const [dialog, setDialog] = useState<{ kind: 'lock' | 'unlock'; trigger: HTMLElement } | null>(null);
  const [busy, setBusy] = useState(false);
  const [commandError, setCommandError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [binding, setBinding] = useState<{ trigger: HTMLElement; seals: SealSummary[] } | null>(null);
  const lastRead = useRef<string | null>(null);
  const nowRef = useRef(now);
  useEffect(() => { nowRef.current = now; }, [now]);

  const fetchSeal = useCallback(async (announce: boolean) => {
    if (!service) return;
    const outcome = await service.cylinderSeal(organizationId, cylinderId);
    if (outcome.kind === 'success') {
      const readAt = outcome.value?.position?.readAt ?? null;
      if (announce && readAt && readAt !== lastRead.current) {
        setAnnouncement(`Posição do lacre atualizada: ${positionAge(readAt, nowRef.current())}.`);
      }
      lastRead.current = readAt;
      setLoad({ kind: 'ready', seal: outcome.value, at: nowRef.current() });
    } else if (outcome.kind === 'offline') {
      setLoad((current) => (current.kind === 'ready' ? current : { kind: 'offline' }));
    } else {
      setLoad((current) => (current.kind === 'ready' && announce ? current : { kind: 'error' }));
    }
  }, [service, organizationId, cylinderId]);

  useEffect(() => {
    if (!online || !service) return;
    void fetchSeal(false);
  }, [online, service, fetchSeal]);

  // Tempo real: o aviso do próprio cilindro (ou a consulta periódica) recarrega o bloco.
  useEffect(() => {
    if (!online || !service || !realtime || !organizationId) return undefined;
    const watch = watchSeals({
      port: realtime, organizationId,
      onChange: (signal) => { if (signal === null || signal.cylinderId === cylinderId) void fetchSeal(true); },
    });
    return () => watch.stop();
  }, [online, service, realtime, organizationId, cylinderId, fetchSeal]);

  // A idade em texto ("há 2 minutos") avança sozinha.
  useEffect(() => {
    const timer = setInterval(() => setTick((value) => value + 1), 30_000);
    return () => clearInterval(timer);
  }, []);

  const openBind = async (trigger: HTMLElement) => {
    if (!service) return;
    setCommandError(null);
    const outcome = await service.listUnboundActiveSeals(organizationId);
    setBinding({ trigger, seals: outcome.kind === 'success' ? outcome.value : [] });
  };

  const bind = async (deviceId: string) => {
    if (!service) return;
    setBusy(true);
    const outcome = await service.bindSeal(organizationId, deviceId, cylinderId);
    setBusy(false);
    if (outcome.kind === 'success') { setBinding(null); setNotice('Lacre vinculado. As próximas mensagens dele passam a valer para este cilindro.'); void fetchSeal(false); }
    else setCommandError(outcome.kind === 'seal_already_bound' ? 'Este lacre já está em outro cilindro.'
      : outcome.kind === 'cylinder_already_bound' ? 'Este cilindro já tem lacre.' : 'Não foi possível vincular agora. Tente de novo.');
  };

  const send = async (justification: string) => {
    if (!service || !dialog) return;
    setBusy(true);
    const outcome = dialog.kind === 'lock'
      ? await service.requestLock(organizationId, cylinderId, justification)
      : await service.requestUnlock(organizationId, cylinderId, justification);
    setBusy(false);
    if (outcome.kind === 'success') {
      setDialog(null);
      setNotice(dialog.kind === 'lock' ? 'Pedido de travar enviado. A trava muda quando o lacre confirmar.' : 'Pedido de destravar enviado. A trava muda quando o lacre confirmar.');
      void fetchSeal(false);
    } else setCommandError(COMMAND_FAILURE[outcome.kind] ?? 'Não foi possível enviar o pedido agora. Tente de novo.');
  };

  let body: React.ReactNode;
  if (load.kind === 'loading') body = <Loading label="Carregando o lacre…" />;
  else if (load.kind === 'offline') body = <p className="text-corpo text-grafite">Sem conexão: as informações do lacre aparecem quando a conexão voltar.</p>;
  else if (load.kind === 'error') body = <ErrorState title="Não foi possível carregar o lacre" message="Tente novamente em instantes." onRetry={() => { setLoad({ kind: 'loading' }); void fetchSeal(false); }} />;
  else if (load.seal === null) {
    body = (
      <div className="flex flex-col gap-2">
        {notice && <Alert variant="sucesso">{notice}</Alert>}
        <p className="m-0 text-corpo text-grafite">Este cilindro não tem lacre vinculado.</p>
        {permissions.includes('seal.operate') && (
          <Button variant="secundario" className="self-start" disabled={!online} onClick={(event) => void openBind(event.currentTarget)}>Vincular lacre</Button>
        )}
      </div>
    );
  }
  else {
    const seal = load.seal;
    const pending = seal.pendingCommand && (seal.pendingCommand.status === 'pending' || seal.pendingCommand.status === 'delivered') ? seal.pendingCommand : null;
    body = (
      <div className="flex flex-col gap-4">
        {!online && <p className="text-legenda text-texto-secundario">Sem conexão. Mostrando o que foi carregado {positionAge(load.at.toISOString(), now())}.</p>}
        <dl className="m-0 grid gap-4 tablet:grid-cols-2 desktop:grid-cols-4">
          <Fact label="Saúde do lacre"><SealBadge presentation={health(seal.health)} /></Fact>
          <Fact label="Trava física">
            <span className="flex flex-col items-start gap-1">
              <SealBadge presentation={lockState(seal.lockState, pending?.kind ?? null)} />
              {pending && <span className="text-legenda text-texto-secundario">Pedido: {commandOrigin(pending.origin)}</span>}
            </span>
          </Fact>
          <Fact label="Bateria">{seal.batteryPct === null ? '—' : `${seal.batteryPct}%`}</Fact>
          <Fact label="Estado do lacre"><SealBadge presentation={sealState(seal.sealState)} /></Fact>
          <Fact label="Última posição">
            {seal.position ? <>{positionAge(seal.position.readAt, now())} <span className="text-texto-secundario">({sealPositionQuality(seal.position.quality, seal.position.accuracyM)})</span></> : 'Sem posição ainda'}
          </Fact>
          <Fact label="Último contato">{contactAge(seal.lastSeenAt, now())}</Fact>
          <Fact label="Dispositivo">{seal.label} <span className="text-texto-secundario">({seal.deviceCode})</span></Fact>
        </dl>
        {notice && <Alert variant="sucesso">{notice}</Alert>}
        <CylinderWatchPanel watch={seal.watch} violation={seal.violation} now={now} />
        <SealActions seal={seal} permissions={permissions} online={online} onOpen={(kind, trigger) => { setCommandError(null); setNotice(null); setDialog({ kind, trigger }); }} />
        {seal.position && <SealPositionMap service={service} organizationId={organizationId} deviceId={seal.deviceId} position={seal.position} title="Última posição do lacre" label={seal.label} />}
        {service && <SealPositionHistory service={service} organizationId={organizationId} target={{ cylinderId }} now={now} />}
      </div>
    );
  }

  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-4">
      <h3 id={titleId} className="text-h3 font-semibold text-navy">Lacre</h3>
      <p role="status" aria-atomic="true" className="sr-only">{announcement}</p>
      <div className="min-h-alvo">{body}</div>
      {binding && (
        <BindSealDialog serialNumber={serialNumber} seals={binding.seals} busy={busy} error={commandError} returnFocusTo={binding.trigger}
          onCancel={() => setBinding(null)} onConfirm={(deviceId) => void bind(deviceId)} now={now} />
      )}
      {dialog && load.kind === 'ready' && (
        <LockCommandDialog kind={dialog.kind} serialNumber={serialNumber} busy={busy} error={commandError} returnFocusTo={dialog.trigger}
          hasSecondFactor={hasSecondFactor} secondFactor={secondFactor} onCancel={() => setDialog(null)} onConfirm={(text) => void send(text)} />
      )}
    </section>
  );
}
