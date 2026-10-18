import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { usePermissions } from '@/app/navigation/permissions-context';
import { watchSeals, type RealtimePort } from '@/application/seals/seal-realtime';
import type { SealService } from '@/application/seals/seal-service';
import type { AlertDetail } from '@/application/seals/seal-views';
import { SealPositionMap } from '@/pages/seals/components/seal-position-map';
import { Alert, Button, ErrorState, Loading } from '@/design-system';
import { contactAge, positionAge } from '@/domain/seals/seal-age';
import { ALERT_STATUS_LABELS, alertKind, alertSeverity, health, lockState } from '@/domain/seals/seal-vocabulary';
import { AccessGate } from '@/pages/cylinders/components/access-gate';
import { ReasonDialog } from '@/pages/cylinders/components/reason-dialog';
import { SealBadge } from '@/pages/seals/components/seal-badge';
import { useSealService } from '@/pages/seals/use-seal-service';

// Detalhe do alerta do lacre (Spec 012, RF-036, RF-036c): o destino do toque na notificação. Mostra o lacre, o cilindro, a última
// posição no mapa e em texto e a volta do lacre, se houve. Reconhecer e encerrar exigem `seal.operate` e conexão; encerrar pede
// observação de 5 a 500 caracteres (o servidor repete a regra).

type Load = { kind: 'loading' } | { kind: 'ready'; alert: AlertDetail } | { kind: 'not_found' } | { kind: 'error' } | { kind: 'offline' };
const OFFLINE = 'Sem conexão: comandos de lacre exigem conexão.';

function Fact({ label, children }: { label: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="min-w-0">
      <dt className="text-legenda text-texto-secundario">{label}</dt>
      <dd className="m-0 break-words text-corpo text-grafite">{children}</dd>
    </div>
  );
}

export interface AlertDetailViewProps {
  service: SealService | null;
  organizationId: string;
  alertId: string;
  online: boolean;
  realtime: RealtimePort | null;
  canOperate: boolean;
  now?: () => Date;
}

export function AlertDetailView({ service, organizationId, alertId, online, realtime, canOperate, now = () => new Date() }: AlertDetailViewProps): React.JSX.Element {
  const [load, setLoad] = useState<Load>(online ? { kind: 'loading' } : { kind: 'offline' });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [closing, setClosing] = useState<HTMLElement | null>(null);
  const reasonId = useId();
  const closeButton = useRef<HTMLButtonElement>(null);

  const request = useCallback(() => (service && organizationId ? service.getAlert(organizationId, alertId) : Promise.resolve(null)), [service, organizationId, alertId]);
  const apply = useCallback((outcome: Awaited<ReturnType<typeof request>>) => {
    if (outcome === null) return;
    if (outcome.kind === 'success') setLoad({ kind: 'ready', alert: outcome.value });
    else if (outcome.kind === 'not_found' || outcome.kind === 'access_denied') setLoad({ kind: 'not_found' });
    else setLoad((current) => (current.kind === 'ready' ? current : outcome.kind === 'offline' ? { kind: 'offline' } : { kind: 'error' }));
  }, []);
  const fetchAlert = useCallback(async () => apply(await request()), [request, apply]);

  useEffect(() => {
    if (!online) return undefined;
    let active = true;
    void request().then((outcome) => { if (active) apply(outcome); });
    return () => { active = false; };
  }, [online, request, apply]);
  useEffect(() => {
    if (!online || !service || !realtime || !organizationId) return undefined;
    const watch = watchSeals({ port: realtime, organizationId, onChange: () => void fetchAlert() });
    return () => watch.stop();
  }, [online, service, realtime, organizationId, fetchAlert]);

  const acknowledge = async () => {
    if (!service) return;
    setBusy(true);
    setActionError(null);
    const outcome = await service.acknowledgeAlert(organizationId, alertId);
    setBusy(false);
    if (outcome.kind === 'success') { setNotice('Alerta reconhecido.'); void fetchAlert(); }
    else setActionError(outcome.kind === 'alert_closed' ? 'Este alerta já foi encerrado.' : 'Não foi possível reconhecer agora. Tente de novo.');
  };

  const close = async (note: string) => {
    if (!service) return;
    setBusy(true);
    setActionError(null);
    const outcome = await service.closeAlert(organizationId, alertId, note);
    setBusy(false);
    if (outcome.kind === 'success') { setClosing(null); setNotice('Alerta encerrado.'); void fetchAlert(); }
    else setActionError(outcome.kind === 'note_required' ? 'Escreva uma observação de 5 a 500 caracteres.' : 'Não foi possível encerrar agora. Tente de novo.');
  };

  if (load.kind === 'loading') return <Loading variant="pagina" busy label="Carregando o alerta…" />;
  if (load.kind === 'offline') return <p className="m-0 text-corpo text-grafite">Sem conexão: o alerta aparece quando a conexão voltar.</p>;
  if (load.kind === 'not_found') return <ErrorState variant="sem-permissao" title="Alerta não encontrado" message="Ele não existe nesta organização." />;
  if (load.kind === 'error') return <ErrorState title="Não foi possível carregar o alerta" message="Tente novamente em instantes." onRetry={() => { setLoad({ kind: 'loading' }); void fetchAlert(); }} />;

  const { alert } = load;
  const kind = alertKind(alert.kind);
  const seal = alert.seal;
  const open = alert.status !== 'closed';
  return (
    <article aria-labelledby="alert-detail-title" className="flex w-full min-w-0 flex-col gap-6">
      <div className="flex flex-col gap-2">
        <p className="m-0 text-legenda font-semibold uppercase text-azul-profundo"><a className="underline" href="/alertas">Alertas</a></p>
        <h2 id="alert-detail-title" className="m-0 break-words text-h2 font-bold text-navy">{kind.label}</h2>
        <div className="flex flex-wrap items-center gap-2">
          <SealBadge presentation={alertSeverity(alert.severity)} />
          <span className="text-corpo font-semibold text-grafite">{ALERT_STATUS_LABELS[alert.status]}</span>
        </div>
      </div>

      {notice && <Alert variant="sucesso">{notice}</Alert>}
      {actionError && <Alert variant="erro">{actionError}</Alert>}
      {alert.recoveredAt && <Alert variant="informacao">O lacre voltou a comunicar {positionAge(alert.recoveredAt, now())}. O alerta continua aberto até ser encerrado.</Alert>}

      <dl className="m-0 grid gap-4 tablet:grid-cols-2 desktop:grid-cols-3">
        <Fact label="Aberto">{positionAge(alert.openedAt, now())}</Fact>
        <Fact label="Lacre">{alert.device.label} ({alert.device.deviceCode})</Fact>
        <Fact label="Cilindro">{alert.cylinder ? <a className="text-azul-profundo underline" href={`/cilindros/${alert.cylinder.id}`}>{alert.cylinder.serialNumber}</a> : 'Sem cilindro vinculado'}</Fact>
        {seal && <Fact label="Saúde do lacre"><SealBadge presentation={health(seal.health)} /></Fact>}
        {seal && <Fact label="Trava física"><SealBadge presentation={lockState(seal.lockState, seal.pendingCommand?.kind ?? null)} /></Fact>}
        {seal && <Fact label="Último contato">{contactAge(seal.lastSeenAt, now())}</Fact>}
        {alert.closeNote && <Fact label="Observação do encerramento">{alert.closeNote}</Fact>}
      </dl>

      {seal?.position
        ? <SealPositionMap service={service} organizationId={organizationId} deviceId={alert.device.id} position={seal.position}
            title="Última posição do lacre" label={`${kind.label} · ${alert.device.label}`}
            details={[alert.device.deviceCode, alert.cylinder?.serialNumber ?? 'Sem cilindro vinculado', seal.watch ? `Vigilância: ${seal.watch.siteName}` : 'Local do alerta']}
            caption={`Lida ${positionAge(seal.position.readAt, now())}.`} />
        : <p className="m-0 text-corpo text-grafite">O lacre ainda não enviou posição.</p>}

      {canOperate && open && (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-2">
            {alert.status === 'open' && <Button variant="secundario" disabled={!online || busy} onClick={() => void acknowledge()}>Reconhecer</Button>}
            <Button ref={closeButton} disabled={!online || busy} aria-describedby={!online ? reasonId : undefined}
              onClick={(event) => { setActionError(null); setClosing(event.currentTarget); }}>Encerrar alerta</Button>
          </div>
          {!online && <p id={reasonId} className="m-0 text-legenda text-texto-secundario">{OFFLINE}</p>}
        </div>
      )}

      {closing && (
        <ReasonDialog
          title="Encerrar alerta"
          confirmLabel="Encerrar"
          fieldLabel="Observação"
          description="Conte o que foi conferido. A observação fica no alerta; a auditoria registra só que ele foi encerrado."
          busy={busy}
          error={actionError}
          returnFocusTo={closing}
          onCancel={() => setClosing(null)}
          onConfirm={(note) => void close(note)}
        />
      )}
    </article>
  );
}

export function AlertDetailPage({ alertId }: { alertId: string }): React.JSX.Element {
  const { service, realtime, organizationId, online } = useSealService();
  const { permissions } = usePermissions();
  return (
    <AccessGate permission="seal.read">
      <AlertDetailView key={`${organizationId}:${alertId}`} service={service} organizationId={organizationId} alertId={alertId} online={online}
        realtime={realtime} canOperate={permissions?.tenant.includes('seal.operate') ?? false} />
    </AccessGate>
  );
}
