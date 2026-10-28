import React, { useCallback, useEffect, useState } from 'react';
import { watchTracking, type TrackingRealtimePort } from '@/application/tracking/tracking-realtime';
import type { TrackingOutcome, TripTrackingService } from '@/application/tracking/trip-tracking-service';
import type { ActiveTripRowView, ActiveTripsView, CounterView } from '@/application/tracking/tracking-views';
import { filterActiveTrips, isFilterableCounter } from '@/application/tracking/active-trips-filter';
import { Alert, Button, DataTable, ErrorState, Icon, type ColunaDaTabela } from '@/design-system';
import { formatDateTime } from '@/domain/cylinders/format';
import { degradationText, freshness } from '@/domain/tracking/tracking-vocabulary';
import { usePermissions } from '@/app/navigation/permissions-context';
import { AccessGate } from '@/pages/cylinders/components/access-gate';
import { SealBadge } from '@/pages/seals/components/seal-badge';
import { OfflineNotice } from './components/offline-notice';
import { useTrackingService } from './use-tracking-service';

// Viagens em andamento (Spec 015, US1; RF-001 a RF-006): cada viagem com as origens de posição (celular e lacres) em ícone e texto,
// a degradação do acompanhamento e o link para o acompanhamento. Contadores e lista vêm da mesma coleção. Atualiza sozinha e anuncia
// num único status, sem mover o foco. A tabela vira cartões abaixo de 768 px (DataTable do design system).
type Load = { kind: 'loading' } | { kind: 'ready'; view: ActiveTripsView } | { kind: 'error' } | { kind: 'offline' };

export interface ActiveTripsScreenProps {
  service: TripTrackingService | null;
  organizationId: string;
  online: boolean;
  realtime: TrackingRealtimePort | null;
  now?: () => Date;
  // Spec 015 (US6): link para liberar os avisos por e-mail, só para quem administra as categorias.
  canManageEmail?: boolean;
}

const clock = (iso: string) => formatDateTime(iso).split(' ')[1] ?? formatDateTime(iso);

// Frase completa de cada contador, para a leitura não depender do número isolado.
const COUNTER_TEXT: Record<string, [string, string]> = {
  trips: ['viagem em andamento', 'viagens em andamento'],
  current: ['origem atual', 'origens atuais'],
  delayed: ['origem atrasada', 'origens atrasadas'],
  missing: ['origem sem posição', 'origens sem posição'],
  inconclusive: ['origem inconclusiva', 'origens inconclusivas'],
  degraded: ['viagem com acompanhamento degradado', 'viagens com acompanhamento degradado'],
};
const counterNoun = (counter: CounterView) => {
  const [one, many] = COUNTER_TEXT[counter.key] ?? [counter.meaning, counter.meaning];
  return counter.value === 1 ? one : many;
};
const counterText = (counter: CounterView) => `${counter.value ?? '—'} ${counterNoun(counter)}`;
// Contadores que pedem atenção quando têm valor: ganham o tom de alerta (estado, nunca enfeite). Os demais ficam neutros.
const ATTENTION = new Set(['delayed', 'missing', 'inconclusive', 'degraded']);
const FILTER_TEXT: Record<string, string> = {
  current: 'com origem atual', delayed: 'com origem atrasada', missing: 'com origem sem posição',
  inconclusive: 'com origem inconclusiva', degraded: 'com acompanhamento degradado',
};
const SETTINGS_LINK = 'inline-flex min-h-alvo items-center gap-2 rounded-controle border border-azul-profundo bg-branco px-4 text-corpo font-semibold text-azul-profundo hover:bg-info-fundo';

// Contador do resumo: número grande em algarismos tabulares e a frase completa. Os que filtram são botões de alternância.
function CounterTile({ counter, pressed, onToggle }: { counter: CounterView; pressed: boolean; onToggle: () => void }): React.JSX.Element {
  const tone = ATTENTION.has(counter.key) ? 'border-alerta-faixa bg-alerta-fundo text-alerta-texto' : 'border-borda-suave bg-branco text-grafite';
  const content = (
    <>
      <span className={`text-h2 font-bold tabular-nums ${ATTENTION.has(counter.key) ? '' : 'text-navy'}`}>{counter.value ?? '—'}</span>{' '}
      <span className="min-w-0 max-w-full wrap-anywhere text-corpo hyphens-auto">{counterNoun(counter)}</span>
    </>
  );
  const base = `flex h-full w-full min-w-0 flex-col items-start gap-1 rounded-card border p-4 text-left ${tone}`;
  if (!isFilterableCounter(counter.key)) return <div className={base}>{content}</div>;
  return (
    <button type="button" aria-pressed={pressed} onClick={onToggle}
      className={`${base} cursor-pointer hover:border-navy ${pressed ? 'border-navy ring-2 ring-navy' : ''}`}>
      {content}
    </button>
  );
}

export function ActiveTripsScreen({ service, organizationId, online, realtime, canManageEmail = false }: ActiveTripsScreenProps): React.JSX.Element {
  const [load, setLoad] = useState<Load>(online ? { kind: 'loading' } : { kind: 'offline' });
  const [announcement, setAnnouncement] = useState('');
  const [filter, setFilter] = useState<string | null>(null);

  const request = useCallback(() => (service && organizationId ? service.listActive(organizationId) : Promise.resolve(null)), [service, organizationId]);
  const apply = useCallback((outcome: TrackingOutcome<ActiveTripsView> | null, announce: boolean) => {
    if (outcome === null) return;
    if (outcome.kind === 'success') {
      setLoad({ kind: 'ready', view: outcome.value });
      if (announce) setAnnouncement(`Lista atualizada às ${clock(outcome.value.generatedAt)}.`);
    } else setLoad((current) => (current.kind === 'ready' && announce ? current : outcome.kind === 'offline' ? { kind: 'offline' } : { kind: 'error' }));
  }, []);
  const refresh = useCallback(async (announce: boolean) => apply(await request(), announce), [request, apply]);

  useEffect(() => {
    if (!online) return undefined;
    let active = true;
    void request().then((outcome) => { if (active) apply(outcome, false); });
    return () => { active = false; };
  }, [online, request, apply]);

  useEffect(() => {
    if (!online || !service || !realtime || !organizationId) return undefined;
    const watch = watchTracking({ port: realtime, organizationId, onChange: () => void refresh(true) });
    return () => watch.stop();
  }, [online, service, realtime, organizationId, refresh]);

  const columns: ColunaDaTabela<ActiveTripRowView>[] = [
    { id: 'viagem', cabecalho: 'Viagem', cabecalhoDaLinha: true, celula: (row) => (
      <a className="text-azul-profundo underline" href={`/rastreamento/viagens/${row.tripId}`}>Viagem {row.tripNumber}</a>
    ) },
    { id: 'veiculo', cabecalho: 'Veículo e motorista', celula: (row) => `${row.vehiclePlate} · ${row.driverName}` },
    { id: 'origens', cabecalho: 'Origens de posição', celula: (row) => (
      <ul className="m-0 flex list-none flex-col gap-1 p-0">
        {row.origins.map((origin) => (
          <li key={origin.key} className="flex flex-wrap items-center gap-1">
            <span>{origin.label}:</span>{' '}
            <SealBadge presentation={freshness(origin.freshness)} />
          </li>
        ))}
      </ul>
    ) },
    { id: 'acompanhamento', cabecalho: 'Acompanhamento', celula: (row) => (row.degradation ? (
      <span className="flex flex-col items-start gap-1">
        <SealBadge presentation={{ label: 'Degradado', icon: 'alerta', tone: 'pendente' }} />
        <span className="text-legenda text-texto-secundario">{degradationText(row.degradation.reason)}</span>
      </span>
    ) : <SealBadge presentation={{ label: 'Completo', icon: 'verificado', tone: 'ativo' }} />) },
    { id: 'inicio', cabecalho: 'Início', celula: (row) => formatDateTime(row.startedAt) },
  ];

  const view: Load = !online && load.kind !== 'ready' ? { kind: 'offline' } : load;
  // Em destaque: o total de viagens e os contadores com valor; os zerados vão para uma linha discreta. O filtro só vale enquanto o
  // contador escolhido tiver valor (uma atualização pode zerá-lo).
  const counters = view.kind === 'ready' ? view.view.counters : [];
  const shown = counters.filter((counter) => counter.key === 'trips' || (counter.value ?? 0) > 0);
  const quiet = counters.filter((counter) => !shown.includes(counter));
  const activeFilter = filter && shown.some((counter) => counter.key === filter) ? filter : null;
  const allRows = view.kind === 'ready' ? view.view.rows : [];
  const rows = filterActiveTrips(allRows, activeFilter);
  return (
    <div className="flex w-full min-w-0 flex-col gap-6">
      <header className="flex flex-col gap-4 desktop:flex-row desktop:items-start desktop:justify-between">
        <div className="flex flex-col gap-1">
          <h2 className="m-0 text-h3 font-semibold text-navy">Rastreamento</h2>
          <p className="m-0 max-w-padrao text-corpo text-grafite">Viagens em andamento da empresa ativa: onde estão o celular do motorista e os lacres da carga, e se a informação está em dia.</p>
        </div>
        <nav aria-label="Configurações do rastreamento" className="flex shrink-0 flex-wrap gap-2">
          <a className={SETTINGS_LINK} href="/rastreamento/regra"><Icon name="configuracoes" size={16} variant="monocromatica" />Regra de proximidade</a>
          {canManageEmail && <a className={SETTINGS_LINK} href="/rastreamento/avisos"><Icon name="notificacoes" size={16} variant="monocromatica" />Avisos por e-mail</a>}
        </nav>
      </header>
      <p role="status" aria-atomic="true" className="sr-only">{announcement}</p>
      {view.kind === 'ready' && (
        <ul aria-label="Resumo do acompanhamento" className="m-0 grid list-none grid-cols-2 gap-2 p-0 tablet:grid-cols-4">
          {shown.map((counter) => (
            <li key={counter.key} className="min-w-0">
              <CounterTile counter={counter} pressed={activeFilter === counter.key}
                onToggle={() => setFilter((current) => (current === counter.key ? null : counter.key))} />
            </li>
          ))}
          {quiet.length > 0 && (
            <li className="col-span-2 text-legenda text-texto-secundario tablet:col-span-4">{quiet.map(counterText).join(' · ')}</li>
          )}
        </ul>
      )}
      {!online && view.kind === 'ready' && (
        <Alert variant="informacao" title="Informação anterior">Sem conexão: lista de {formatDateTime(view.view.generatedAt)}. Ela não é a situação atual.</Alert>
      )}
      {view.kind === 'offline' && <OfflineNotice>Sem conexão: as viagens em andamento aparecem quando a conexão voltar.</OfflineNotice>}
      {view.kind === 'error' && <ErrorState title="Não foi possível carregar as viagens em andamento" message="Tente novamente em instantes." onRetry={() => { setLoad({ kind: 'loading' }); void refresh(false); }} />}
      {activeFilter && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <p className="m-0 text-corpo text-grafite">
            Mostrando {rows.length} de {allRows.length} {allRows.length === 1 ? 'viagem' : 'viagens'}: {FILTER_TEXT[activeFilter]}.
          </p>
          <Button variant="secundario" onClick={() => setFilter(null)}>Mostrar todas</Button>
        </div>
      )}
      {(view.kind === 'loading' || view.kind === 'ready') && (
        <DataTable
          legenda="Viagens em andamento"
          colunas={columns}
          linhas={rows}
          chaveDaLinha={(row) => row.tripId}
          carregando={view.kind === 'loading'}
          textoDeCarregamento="Carregando as viagens em andamento…"
          vazio={{ title: 'Nenhuma viagem em andamento', description: 'As viagens aparecem aqui assim que o motorista inicia o transporte.' }}
        />
      )}
    </div>
  );
}

export function ActiveTripsPage(): React.JSX.Element {
  const { service, realtime, organizationId, online } = useTrackingService();
  const { permissions } = usePermissions();
  return (
    <AccessGate permission="tracking.read">
      <ActiveTripsScreen key={organizationId} service={service} organizationId={organizationId} online={online} realtime={realtime}
        canManageEmail={permissions?.tenant.includes('notification_category.manage') ?? false} />
    </AccessGate>
  );
}
