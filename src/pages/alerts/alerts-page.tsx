import React, { useCallback, useEffect, useId, useState } from 'react';
import { watchSeals, type RealtimePort } from '@/application/seals/seal-realtime';
import type { SealService } from '@/application/seals/seal-service';
import type { AlertView } from '@/application/seals/seal-views';
import { ErrorState, Icon, Loading, Select } from '@/design-system';
import { positionAge } from '@/domain/seals/seal-age';
import { ALERT_STATUS_LABELS, alertKind, alertSeverity } from '@/domain/seals/seal-vocabulary';
import { AccessGate } from '@/pages/cylinders/components/access-gate';
import { SealBadge } from '@/pages/seals/components/seal-badge';
import { useSealService } from '@/pages/seals/use-seal-service';

// Página de alertas (Spec 012, RF-035, RF-042, RF-043): a lista REAL dos alertas do lacre na organização ativa, com filtros por
// situação e severidade. Cada alerta abre o detalhe em /alertas/:id. Atualiza sozinha pelo aviso em tempo real (ou a cada 30 s).

type Load = { kind: 'loading' } | { kind: 'ready'; items: AlertView[]; total: number } | { kind: 'error' } | { kind: 'offline' };

const STATUS_OPTIONS = [['active', 'Abertos e reconhecidos'], ['open', 'Abertos'], ['acknowledged', 'Reconhecidos'], ['closed', 'Encerrados']] as const;
const SEVERITY_OPTIONS = [['', 'Todas'], ['critical', 'Crítica'], ['high', 'Alta'], ['medium', 'Média']] as const;

export interface AlertsListViewProps {
  service: SealService | null;
  organizationId: string;
  online: boolean;
  realtime: RealtimePort | null;
  now?: () => Date;
}

export function AlertsListView({ service, organizationId, online, realtime, now = () => new Date() }: AlertsListViewProps): React.JSX.Element {
  const [status, setStatus] = useState<string>('active');
  const [severity, setSeverity] = useState<string>('');
  const [load, setLoad] = useState<Load>(online ? { kind: 'loading' } : { kind: 'offline' });
  const listLabelId = useId();

  const request = useCallback(() => (service && organizationId
    ? service.listAlerts(organizationId, { status, ...(severity ? { severity } : {}) }) : Promise.resolve(null)), [service, organizationId, status, severity]);
  const apply = useCallback((outcome: Awaited<ReturnType<typeof request>>) => {
    if (outcome === null) return;
    if (outcome.kind === 'success') setLoad({ kind: 'ready', items: outcome.value.items, total: outcome.value.total });
    else setLoad(outcome.kind === 'offline' ? { kind: 'offline' } : { kind: 'error' });
  }, []);
  const fetchAlerts = useCallback(async () => apply(await request()), [request, apply]);

  useEffect(() => {
    if (!online) return undefined;
    let active = true;
    void request().then((outcome) => { if (active) apply(outcome); });
    return () => { active = false; };
  }, [online, request, apply]);

  useEffect(() => {
    if (!online || !service || !realtime || !organizationId) return undefined;
    const watch = watchSeals({ port: realtime, organizationId, onChange: (signal) => { if (signal === null || signal.kind === 'alert') void fetchAlerts(); } });
    return () => watch.stop();
  }, [online, service, realtime, organizationId, fetchAlerts]);

  // Sem conexão, mantém o que já foi carregado; sem nada carregado, explica.
  const view: Load = !online && load.kind !== 'ready' ? { kind: 'offline' } : load;
  return (
    <div className="flex w-full min-w-0 flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h2 className="m-0 text-h3 font-semibold text-navy">Alertas</h2>
        <p className="m-0 max-w-padrao text-corpo text-grafite">
          Alertas dos lacres da organização ativa: falta de comunicação, possível extravio, violação de geocerca, trava e bateria.
        </p>
      </header>
      <div className="grid grid-cols-1 gap-4 tablet:grid-cols-2 desktop:max-w-compacto">
        <Select label="Situação" value={status} onChange={(event) => { setLoad({ kind: 'loading' }); setStatus(event.target.value); }}>
          {STATUS_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </Select>
        <Select label="Severidade" value={severity} onChange={(event) => { setLoad({ kind: 'loading' }); setSeverity(event.target.value); }}>
          {SEVERITY_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </Select>
      </div>
      {view.kind === 'loading' && <Loading label="Carregando os alertas…" />}
      {view.kind === 'offline' && <p className="m-0 text-corpo text-grafite">Sem conexão: os alertas aparecem quando a conexão voltar.</p>}
      {view.kind === 'error' && <ErrorState title="Não foi possível carregar os alertas" message="Tente novamente em instantes." onRetry={() => { setLoad({ kind: 'loading' }); void fetchAlerts(); }} />}
      {view.kind === 'ready' && (view.items.length === 0
        ? <p className="m-0 text-corpo text-grafite">Nenhum alerta nesta situação.</p>
        : (
          <section aria-labelledby={listLabelId} className="flex flex-col gap-2">
            <h3 id={listLabelId} className="sr-only">Lista de alertas</h3>
            <ul aria-label="Lista de alertas" className="m-0 flex list-none flex-col gap-2 p-0">
              {view.items.map((item) => {
                const kind = alertKind(item.kind);
                return (
                  <li key={item.id} className="min-w-0">
                    <a href={`/alertas/${item.id}`} className="flex min-h-alvo min-w-0 items-start gap-4 rounded-controle border border-borda-suave bg-branco p-4 hover:bg-info-fundo">
                      <span className="mt-1 text-azul-profundo"><Icon name={kind.icon} size={24} /></span>
                      <span className="flex min-w-0 flex-1 flex-col gap-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="break-words text-corpo font-semibold text-navy">{kind.label}</span>
                          <SealBadge presentation={alertSeverity(item.severity)} />
                          {item.status !== 'open' && <span className="text-legenda text-texto-secundario">{ALERT_STATUS_LABELS[item.status]}</span>}
                        </span>
                        <span className="break-words text-legenda text-texto-secundario">
                          {item.cylinder ? `Cilindro ${item.cylinder.serialNumber}` : `Lacre ${item.device.deviceCode}`} · {positionAge(item.openedAt, now())}
                          {item.recoveredAt ? ' · voltou a comunicar' : ''}
                        </span>
                      </span>
                    </a>
                  </li>
                );
              })}
            </ul>
            {view.total > view.items.length && <p className="m-0 text-legenda text-texto-secundario">Mostrando {view.items.length} de {view.total}.</p>}
          </section>
        ))}
    </div>
  );
}

export function AlertsPage(): React.JSX.Element {
  const { service, realtime, organizationId, online } = useSealService();
  return (
    <AccessGate permission="seal.read">
      <AlertsListView key={organizationId} service={service} organizationId={organizationId} online={online} realtime={realtime} />
    </AccessGate>
  );
}
