import React from 'react';
import type { MyDriverTripView } from '@/application/tracking/trip-tracking-service';
import { Alert, Card, EmptyState, ErrorState, Loading } from '@/design-system';
import { formatDate, formatDateTime } from '@/domain/cylinders/format';
import { TRIP_STATUS_LABELS, type TripStatus } from '@/domain/trips/trip-vocabulary';
import { DriverTrackingPanel } from './driver-tracking-panel';
import { useMyDriverTrips, type MyDriverTripsLoad } from './use-my-driver-trips';

// "Minha viagem" (Spec 015, validação humana de 27/10/2026): o papel Motorista não tem trip.read, e o painel de coleta ficava só no
// detalhe da viagem. Aqui a pessoa motorista vê as próprias viagens planejadas ou em andamento (número, situação, veículo e paradas;
// nada de cliente ou endereço) e, na que está em andamento, o painel de coleta. Sem conexão, a última lista guardada aparece como
// informação anterior, para a coleta continuar visível no meio da viagem.
export interface MyDriverTripsScreenProps {
  load: MyDriverTripsLoad;
  onRetry: () => void;
  panel: (trip: MyDriverTripView) => React.ReactNode;
}

const statusLabel = (status: string) => TRIP_STATUS_LABELS[status as TripStatus] ?? status;

function TripCard({ trip, panel }: { trip: MyDriverTripView; panel: MyDriverTripsScreenProps['panel'] }): React.JSX.Element {
  const titleId = `minha-viagem-${trip.id}`;
  return (
    <Card as="section" aria-labelledby={titleId} className="flex flex-col gap-4">
      <h3 id={titleId} className="m-0 text-h3 font-semibold text-navy">Viagem {trip.number}</h3>
      <dl className="m-0 grid grid-cols-1 gap-x-6 gap-y-2 text-corpo text-grafite tablet:grid-cols-2">
        <div className="flex flex-col"><dt className="text-legenda text-texto-secundario">Situação</dt><dd className="m-0">{statusLabel(trip.status)}</dd></div>
        <div className="flex flex-col"><dt className="text-legenda text-texto-secundario">Veículo</dt><dd className="m-0">{trip.vehiclePlate}</dd></div>
        <div className="flex flex-col"><dt className="text-legenda text-texto-secundario">Entregas</dt><dd className="m-0">{trip.stopCount === 1 ? '1 parada' : `${trip.stopCount} paradas`}</dd></div>
        <div className="flex flex-col">
          <dt className="text-legenda text-texto-secundario">{trip.startedAt ? 'Início' : 'Data prevista'}</dt>
          <dd className="m-0">{trip.startedAt ? formatDateTime(trip.startedAt) : formatDate(trip.plannedDate)}</dd>
        </div>
      </dl>
      {trip.status === 'in_progress'
        ? panel(trip)
        : <p className="m-0 text-corpo text-grafite">A coleta da localização começa quando a viagem for iniciada.</p>}
    </Card>
  );
}

export function MyDriverTripsScreen({ load, onRetry, panel }: MyDriverTripsScreenProps): React.JSX.Element {
  return (
    <div className="flex w-full min-w-0 flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h2 className="m-0 text-h3 font-semibold text-navy">Minha viagem</h2>
        <p className="m-0 max-w-padrao text-corpo text-grafite">As viagens em que você é a pessoa motorista. Na viagem em andamento, o FluxID registra a sua localização para o gestor acompanhar a carga.</p>
      </header>
      {load.kind === 'loading' && <Loading label="Carregando suas viagens…" />}
      {load.kind === 'offline' && <p className="m-0 text-corpo text-grafite">Sem conexão: suas viagens aparecem quando a conexão voltar.</p>}
      {load.kind === 'error' && <ErrorState title="Não foi possível carregar suas viagens" message="Tente novamente em instantes." onRetry={onRetry} />}
      {load.kind === 'ready' && load.savedAt && (
        <Alert variant="informacao" title="Informação anterior">Sem conexão: lista de {formatDateTime(load.savedAt)}. A coleta continua no celular e envia as posições quando a conexão voltar.</Alert>
      )}
      {load.kind === 'ready' && !load.view.isDriver && (
        <EmptyState title="Nenhuma viagem para mostrar" description="Sua conta não está cadastrada como motorista nesta empresa." />
      )}
      {load.kind === 'ready' && load.view.isDriver && load.view.trips.length === 0 && (
        <EmptyState title="Nenhuma viagem para você agora" description="Quando você for escalado para uma viagem, ela aparece aqui." />
      )}
      {load.kind === 'ready' && load.view.isDriver && load.view.trips.map((trip) => <TripCard key={trip.id} trip={trip} panel={panel} />)}
    </div>
  );
}

export function MyDriverTripsPage(): React.JSX.Element {
  const { load, organizationId, retry } = useMyDriverTrips();
  return (
    <MyDriverTripsScreen key={organizationId} load={load} onRetry={retry}
      panel={(trip) => <DriverTrackingPanel organizationId={organizationId} tripId={trip.id} tripStatus={trip.status} />} />
  );
}
