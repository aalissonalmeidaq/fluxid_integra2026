import React, { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { ProximityOccurrenceService, type OccurrenceView } from '@/application/tracking/proximity-occurrence-service';
import { useConnectivity } from '@/app/connectivity-context';
import { usePermissions } from '@/app/navigation/permissions-context';
import { useOnlineStatus } from '@/app/use-online-status';
import { useTenant } from '@/app/tenant/tenant-context';
import { Alert, Button, Card, ErrorState, Icon, Loading } from '@/design-system';
import { formatDateTime } from '@/domain/cylinders/format';
import { positionAge } from '@/domain/seals/seal-age';
import { comparisonText } from '@/domain/tracking/tracking-vocabulary';
import type { ComparisonResult } from '@/domain/tracking/tracking-types';
import { createTrackingTransport } from '@/infrastructure/supabase/tracking-adapter';
import { AccessGate } from '@/pages/cylinders/components/access-gate';
import { ReasonDialog } from '@/pages/cylinders/components/reason-dialog';
import { SealBadge } from '@/pages/seals/components/seal-badge';
import type { Presentation } from '@/domain/seals/seal-vocabulary';
import { OfflineNotice } from './components/offline-notice';

// Ocorrência de afastamento (Spec 015, T068; US4, RF-015, RF-022, RF-023). Mostra o que foi confirmado e as comparações que o sustentam,
// em texto; reconhecer e encerrar exigem a permissão de operar alertas e conexão, com observação obrigatória no encerramento. A tela
// diz que nada disso muda custódia ou trava. O resultado é anunciado num único status; conflito de versão recarrega a versão atual.
type Load = { kind: 'loading' } | { kind: 'ready'; occurrence: OccurrenceView } | { kind: 'not_found' } | { kind: 'error' } | { kind: 'offline' };

export interface ProximityOccurrenceScreenProps {
  service: ProximityOccurrenceService | null;
  organizationId: string;
  occurrenceId: string;
  online: boolean;
  canOperate: boolean;
  now?: () => Date;
}

const STATUS: Record<OccurrenceView['status'], Presentation> = {
  open: { label: 'Aberta', icon: 'alerta', tone: 'erro' },
  acknowledged: { label: 'Reconhecida', icon: 'verificado', tone: 'pendente' },
  closed: { label: 'Encerrada', icon: 'verificado', tone: 'bloqueado' },
  historical_only: { label: 'Só no histórico', icon: 'historico', tone: 'bloqueado' },
};
const OFFLINE = 'Sem conexão: reconhecer e encerrar exigem conexão.';
// O próximo passo de quem acompanha, por situação; encerrada ou só no histórico não pede nada.
const NEXT_STEP: Record<OccurrenceView['status'], string | null> = {
  open: 'Confira a carga com o motorista e reconheça a ocorrência.',
  acknowledged: 'Depois de conferir a carga, encerre a ocorrência com uma observação.',
  closed: null,
  historical_only: null,
};
const SUMMARY_BORDER: Record<OccurrenceView['status'], string> = {
  open: 'border-erro', acknowledged: 'border-alerta-faixa', closed: 'border-borda-suave', historical_only: 'border-borda-suave',
};

function SummaryFact({ term, children }: { term: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <dt className="text-legenda font-semibold text-texto-secundario">{term}</dt>
      <dd className="m-0 break-words text-corpo font-semibold text-navy">{children}</dd>
    </div>
  );
}

export function ProximityOccurrenceScreen({ service, organizationId, occurrenceId, online, canOperate, now = () => new Date() }: ProximityOccurrenceScreenProps): React.JSX.Element {
  const [load, setLoad] = useState<Load>(online ? { kind: 'loading' } : { kind: 'offline' });
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [failure, setFailure] = useState<string | null>(null);
  const [closing, setClosing] = useState<HTMLElement | null>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const reasonId = useId();

  const show = useCallback(async () => {
    if (!service || !organizationId) return;
    const outcome = await service.get(organizationId, occurrenceId);
    if (outcome.kind === 'success') setLoad({ kind: 'ready', occurrence: outcome.value });
    else setLoad(outcome.kind === 'not_found' || outcome.kind === 'access_denied' ? { kind: 'not_found' } : outcome.kind === 'offline' ? { kind: 'offline' } : { kind: 'error' });
  }, [service, organizationId, occurrenceId]);

  useEffect(() => {
    if (!online || !service || !organizationId) return undefined;
    let active = true;
    void service.get(organizationId, occurrenceId).then((outcome) => {
      if (!active) return;
      if (outcome.kind === 'success') setLoad({ kind: 'ready', occurrence: outcome.value });
      else setLoad(outcome.kind === 'not_found' || outcome.kind === 'access_denied' ? { kind: 'not_found' } : outcome.kind === 'offline' ? { kind: 'offline' } : { kind: 'error' });
    });
    return () => { active = false; };
  }, [online, service, organizationId, occurrenceId]);

  const messageOf = (kind: string): string => (kind === 'version_conflict' ? 'A ocorrência mudou enquanto você a via. Recarregamos a versão atual; confira e tente de novo.'
    : kind === 'invalid_transition' ? 'Esta ocorrência já foi encerrada.'
      : kind === 'access_denied' ? 'Você não tem permissão para tratar esta ocorrência.'
        : kind === 'session_expired' ? 'Sua sessão expirou. Entre de novo para continuar.'
          : kind === 'note_required' ? 'Escreva uma observação de 5 a 500 caracteres.'
            : 'Não foi possível concluir agora. Tente de novo; o pedido não será duplicado.');

  // Um identificador por ação aberta: a repetição do mesmo envio usa o mesmo pedido.
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());

  const acknowledge = async (occurrence: OccurrenceView) => {
    if (!service) return;
    setBusy(true);
    setFailure(null);
    const outcome = await service.acknowledge(organizationId, occurrence.id, occurrence.version, requestId);
    setBusy(false);
    if (outcome.kind === 'success') {
      setRequestId(crypto.randomUUID());
      setStatus('Ocorrência reconhecida.');
      await show();
      return;
    }
    setFailure(messageOf(outcome.kind));
    if (outcome.kind === 'version_conflict' || outcome.kind === 'invalid_transition') {
      setRequestId(crypto.randomUUID());
      await show();
    }
  };

  const close = async (occurrence: OccurrenceView, note: string) => {
    if (!service) return;
    setBusy(true);
    setDialogError(null);
    const outcome = await service.close(organizationId, occurrence.id, occurrence.version, note, requestId);
    setBusy(false);
    if (outcome.kind === 'success') {
      setRequestId(crypto.randomUUID());
      setClosing(null);
      setStatus('Ocorrência encerrada.');
      await show();
      return;
    }
    setDialogError(messageOf(outcome.kind));
    if (outcome.kind === 'version_conflict' || outcome.kind === 'invalid_transition') {
      setRequestId(crypto.randomUUID());
      await show();
    }
  };

  const evidences = useMemo(() => (load.kind === 'ready' ? load.occurrence.evidences : []), [load]);

  if (load.kind === 'loading') return <Loading variant="pagina" busy label="Carregando a ocorrência…" />;
  if (load.kind === 'offline') return <OfflineNotice>Sem conexão: a ocorrência aparece quando a conexão voltar.</OfflineNotice>;
  if (load.kind === 'not_found') {
    return <ErrorState variant="sem-permissao" title="Ocorrência não encontrada" message="Esta ocorrência não existe na empresa ativa ou não está disponível para você." />;
  }
  if (load.kind === 'error') return <ErrorState title="Não foi possível carregar a ocorrência" message="Tente novamente em instantes." onRetry={() => { setLoad({ kind: 'loading' }); void show(); }} />;

  const { occurrence } = load;
  const treatable = occurrence.status === 'open' || occurrence.status === 'acknowledged';
  const nextStep = NEXT_STEP[occurrence.status];
  return (
    <article className="flex w-full min-w-0 flex-col gap-6">
      <header className="flex flex-col gap-2">
        <a className="inline-flex min-h-alvo items-center self-start text-corpo text-azul-profundo underline" href={`/rastreamento/viagens/${occurrence.tripId}`}>Viagem {occurrence.tripNumber ?? ''}</a>
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="m-0 text-h3 font-semibold text-navy">Afastamento confirmado · {occurrence.serialNumber ?? 'Cilindro'}</h2>
          <SealBadge presentation={STATUS[occurrence.status]} />
        </div>
        <p className="m-0 max-w-padrao text-corpo text-grafite">
          O celular do motorista e o {occurrence.deviceLabel ?? 'lacre'} ficaram afastados em três comparações válidas seguidas.
          {occurrence.detectionKind === 'retrospective' ? ' A detecção foi feita depois, quando as posições atrasadas chegaram.' : ''}
        </p>
      </header>

      <div className="flex min-w-0 flex-col gap-6 desktop:grid desktop:grid-cols-2 desktop:items-start">
        <div className="flex min-w-0 flex-col gap-4">
          {/* Urgente e calmo: a borda diz o estado (vermelho aberta, âmbar reconhecida) e o texto diz o que fazer agora. */}
          <section aria-label="Resumo da ocorrência" className={`flex flex-col gap-4 rounded-card border-2 bg-branco p-6 shadow-card ${SUMMARY_BORDER[occurrence.status]}`}>
            <dl className="m-0 grid grid-cols-2 gap-4">
              <SummaryFact term="Confirmada">{positionAge(occurrence.openedAt, now())}</SummaryFact>
              <SummaryFact term="Viagem">{occurrence.tripNumber ?? '—'}</SummaryFact>
              <SummaryFact term="Cilindro">{occurrence.serialNumber ?? '—'}</SummaryFact>
              <SummaryFact term="Lacre">{occurrence.deviceLabel ?? '—'}</SummaryFact>
            </dl>
            {nextStep && (
              <p className="m-0 flex items-start gap-2 border-t border-borda-suave pt-4 text-corpo font-semibold text-navy">
                <span className="shrink-0 text-azul-profundo"><Icon name="rota" variant="monocromatica" /></span>
                <span><span className="sr-only">Próximo passo: </span>{nextStep}</span>
              </p>
            )}
          </section>
          <Alert variant="informacao" title="Custódia e trava não mudam">
            Reconhecer ou encerrar esta ocorrência não muda a custódia do cilindro nem o estado da trava: confira a carga e, se preciso, use as ações próprias.
          </Alert>

          {failure && <Alert variant="erro">{failure}</Alert>}
          {treatable && !canOperate && <p className="m-0 text-corpo text-grafite">Só quem opera alertas pode reconhecer ou encerrar esta ocorrência.</p>}
          {treatable && canOperate && (
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap gap-2">
                {occurrence.status === 'open' && (
                  <Button disabled={!online || busy} aria-describedby={!online ? reasonId : undefined} onClick={() => void acknowledge(occurrence)}>
                    Reconhecer
                  </Button>
                )}
                <Button variant={occurrence.status === 'open' ? 'secundario' : 'primario'} disabled={!online || busy} aria-describedby={!online ? reasonId : undefined}
                  onClick={(event) => { setDialogError(null); setClosing(event.currentTarget); }}>Encerrar ocorrência</Button>
              </div>
              {!online && <p id={reasonId} className="m-0 text-legenda text-texto-secundario">{OFFLINE}</p>}
            </div>
          )}
          {/* Confirmação visível e anunciada uma vez: a região existe sempre e só o texto muda. */}
          <div role="status" aria-atomic="true">
            {status && (
              <p className="m-0 flex items-center gap-2 rounded-card border border-verde-escuro bg-sucesso-fundo p-4 text-corpo font-semibold text-verde-acessivel">
                <Icon name="verificado" variant="monocromatica" />{status}
              </p>
            )}
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          <Card as="section" aria-labelledby="occurrence-facts-title" className="flex flex-col gap-2">
            <h3 id="occurrence-facts-title" className="m-0 text-h3 font-semibold text-navy">Situação</h3>
            <ul className="m-0 flex list-none flex-col gap-1 p-0 text-corpo text-grafite">
              <li>Confirmada em {formatDateTime(occurrence.openedAt)}.</li>
              {occurrence.acknowledgedAt && <li>Reconhecida por {occurrence.acknowledgedBy ?? 'uma pessoa autorizada'} em {formatDateTime(occurrence.acknowledgedAt)}.</li>}
              {occurrence.closedAt && <li>Encerrada por {occurrence.closedBy ?? 'uma pessoa autorizada'} em {formatDateTime(occurrence.closedAt)}.</li>}
              {occurrence.closeNote && <li>Observação: <span>{occurrence.closeNote}</span></li>}
              {occurrence.status === 'historical_only' && <li>Registrada só no histórico: as posições chegaram quando a viagem já tinha terminado, então não houve alerta.</li>}
            </ul>
          </Card>

          <Card as="section" aria-labelledby="occurrence-evidence-title" className="flex flex-col gap-2">
            <h3 id="occurrence-evidence-title" className="m-0 text-h3 font-semibold text-navy">Evidências</h3>
            <ol aria-label="Comparações que confirmaram" className="m-0 flex list-none flex-col gap-1 p-0 text-corpo text-grafite">
              {evidences.map((evidence) => (
                <li key={evidence.id}>
                  <span className="tabular-nums">{formatDateTime(evidence.observedAt)}</span> · {comparisonText(evidence.result as ComparisonResult, evidence.reason, evidence.distanceM)}
                  {evidence.thresholdM !== null ? ` (limite de ${Math.round(evidence.thresholdM)} m)` : ''}
                  {evidence.retrospective ? ' · avaliada depois' : ''}
                </li>
              ))}
            </ol>
          </Card>
        </div>
      </div>

      {closing && (
        <ReasonDialog
          title="Encerrar ocorrência"
          confirmLabel="Encerrar"
          fieldLabel="Observação"
          description="Conte o que foi conferido. A observação fica na ocorrência e na auditoria; nada muda a custódia nem a trava."
          busy={busy}
          error={dialogError}
          returnFocusTo={closing}
          onCancel={() => setClosing(null)}
          onConfirm={(note) => void close(occurrence, note)}
        />
      )}
    </article>
  );
}

export function ProximityOccurrencePage({ occurrenceId }: { occurrenceId: string }): React.JSX.Element {
  const { client, config, result } = useConnectivity();
  const online = useOnlineStatus();
  const { activeOrganizationId } = useTenant();
  const { permissions } = usePermissions();
  const endpoint = config?.endpoints.find((candidate) => candidate.kind === result.selectedEndpoint);
  const service = useMemo(() => (endpoint && client ? new ProximityOccurrenceService(createTrackingTransport(endpoint, client), () => navigator.onLine !== false) : null), [client, endpoint]);
  const organizationId = activeOrganizationId ?? '';
  return (
    <AccessGate permission="tracking.read">
      <ProximityOccurrenceScreen key={`${organizationId}:${occurrenceId}`} service={service} organizationId={organizationId} occurrenceId={occurrenceId}
        online={online} canOperate={permissions?.tenant.includes('seal.operate') ?? false} />
    </AccessGate>
  );
}
