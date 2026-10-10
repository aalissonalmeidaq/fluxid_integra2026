import React from 'react';
import type { TripDeliveryView, TripItemView, TripStopView } from '@/application/trips/trip-views';
import { Button } from '@/design-system';
import { HYDROSTATIC_LABELS } from '@/domain/cylinders/cylinder-types';
import { formatDateTime } from '@/domain/cylinders/format';
import { RECIPIENT_RESTRICTED } from '@/domain/trips/trip-vocabulary';
import { currentDelivery } from '../current-delivery';
import { ArriveStopAction } from './arrive-stop-action';
import { CustodyBadge, ItemStatusBadge, LockBadge, StopStatusBadge } from './trip-badges';

export function ItemRow({ item, action }: { item: TripItemView; action?: React.ReactNode }): React.JSX.Element {
  return (
    <li className="flex flex-col gap-2 rounded-controle border border-borda-suave p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="min-w-0 break-words text-corpo"><span className="font-semibold text-navy">{item.cylinder.serialNumber}</span>{` · ${item.cylinder.gas} ${item.cylinder.capacityValue} ${item.cylinder.capacityUnit}`}</span>
        <span className="flex flex-wrap items-center gap-2">
          <ItemStatusBadge status={item.itemStatus} />
          <LockBadge status={item.lockStatus} />
          <CustodyBadge status={item.cylinder.custodyStatus} />
        </span>
      </div>
      <p className="text-legenda text-texto-secundario">{`Teste hidrostático: ${HYDROSTATIC_LABELS[item.cylinder.hydroStatus]}`}</p>
      {item.checkedAt && <p className="text-legenda text-texto-secundario">{`Conferido em ${formatDateTime(item.checkedAt)}${item.checkedByName ? ` por ${item.checkedByName}` : ''}.`}</p>}
      {item.divergenceReason && <p className="break-words text-corpo text-erro">{`Motivo: ${item.divergenceReason}`}</p>}
      {action}
    </li>
  );
}

function DeliverySummary({ delivery, corrections }: { delivery: TripDeliveryView; corrections: number }): React.JSX.Element {
  const restricted = delivery.recipientName === RECIPIENT_RESTRICTED;
  return (
    <div className="flex flex-col gap-1 rounded-controle bg-cinza-gelo p-4">
      <p className="text-corpo font-semibold text-navy">{corrections > 0 ? 'Entrega registrada (corrigida)' : 'Entrega registrada'}</p>
      <p className="break-words text-corpo">
        {`Em ${formatDateTime(delivery.deliveredAt)} · recebido por ${delivery.recipientName}`}
        {delivery.recipientRole && !restricted ? ` (${delivery.recipientRole})` : ''}
      </p>
      {delivery.atSiteAddress && <p className="text-corpo">Entrega no endereço da unidade.</p>}
      {delivery.latitude !== null && delivery.longitude !== null && !delivery.atSiteAddress && <p className="text-corpo">Posição informada na entrega.</p>}
      {delivery.outsideGeofence === true && <p className="text-corpo font-semibold text-alerta-texto">Posição fora da geocerca da unidade.</p>}
      {delivery.outsideGeofence === false && <p className="text-corpo">Posição dentro da geocerca da unidade.</p>}
      {corrections > 0 && <p className="text-legenda text-texto-secundario">{`${corrections} ${corrections === 1 ? 'correção registrada' : 'correções registradas'}; os registros anteriores ficam no histórico.`}</p>}
    </div>
  );
}

export interface StopCardProps {
  stop: TripStopView;
  items: TripItemView[];
  deliveries: readonly TripDeliveryView[];
  tripInProgress: boolean;
  canOperate: boolean;
  canUnlock: boolean;
  canException: boolean;
  // Pode devolver ao estoque (trip.operate e trip.exception) numa viagem em andamento ou cancelada.
  canReturn: boolean;
  online: boolean;
  busyKey: string | null;
  onUnlock: (item: TripItemView, trigger: HTMLElement) => void;
  onReturn: (item: TripItemView, trigger: HTMLElement) => void;
  onArrive: (stop: TripStopView) => void;
  onDeliver: (stop: TripStopView, trigger: HTMLElement) => void;
  onCorrect: (stop: TripStopView, trigger: HTMLElement) => void;
}

export function StopCard({ stop, items, deliveries, tripInProgress, canOperate, canUnlock, canException, canReturn, online, busyKey, onUnlock, onReturn, onArrive, onDeliver, onCorrect }: StopCardProps): React.JSX.Element {
  const current = currentDelivery(deliveries);
  const label = `parada ${stop.position ?? ''}`;
  const busy = busyKey !== null;
  return (
    <li className="flex flex-col gap-4 rounded-card border border-borda-suave bg-branco p-4 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-h3 font-semibold text-navy">{`Parada ${stop.position ?? ''}`}</h4>
        <span className="flex flex-wrap items-center gap-2">
          {stop.outOfOrder && <span className="text-legenda font-semibold text-alerta-texto">Chegada fora da ordem</span>}
          <StopStatusBadge status={stop.status} />
        </span>
      </div>
      <p className="break-words text-corpo"><a className="font-semibold text-azul-profundo underline" href={`/clientes/${stop.site.customerId}/unidades/${stop.site.id}`}>{stop.site.name}</a>{` · ${stop.site.customerName} · ${stop.site.city}/${stop.site.state}`}</p>
      {stop.arrivedAt && <p className="text-legenda text-texto-secundario">{`Chegada em ${formatDateTime(stop.arrivedAt)}.`}</p>}

      {tripInProgress && canOperate && stop.status === 'pending' && (
        <ArriveStopAction position={stop.position} siteName={stop.site.name} online={online} busy={busy} loading={busyKey === `arrive:${stop.id}`} onArrive={() => onArrive(stop)} />
      )}
      {tripInProgress && canOperate && stop.status === 'on_site' && (
        <Button className="self-start" disabled={!online || busy} aria-label={`Registrar entrega da ${label}`} onClick={(event) => onDeliver(stop, event.currentTarget)}>Registrar entrega</Button>
      )}
      {current && <DeliverySummary delivery={current} corrections={deliveries.length - 1} />}
      {tripInProgress && canOperate && (stop.status === 'delivered' || stop.status === 'with_divergence') && current && (
        <Button variant="secundario" className="self-start" disabled={!online || busy} aria-label={`Corrigir a entrega da ${label}`} onClick={(event) => onCorrect(stop, event.currentTarget)}>Corrigir entrega</Button>
      )}

      {items.length === 0 ? <p className="text-corpo">Nenhum cilindro nesta parada.</p> : <ul role="list" aria-label={`Cilindros da ${label}`} className="flex flex-col gap-2">{items.map((item) => {
        // Entregue: desbloqueio normal (trip.unlock). Ainda não entregue: excepcional, só a quem também tem trip.exception.
        const unlockable = item.lockStatus === 'locked' && canUnlock && (item.itemStatus === 'delivered' || canException);
        const returnable = canReturn && (item.itemStatus === 'in_transit' || item.itemStatus === 'not_delivered');
        return (
          <ItemRow key={item.id} item={item} action={unlockable || returnable ? (
            <div className="flex flex-wrap gap-2">
              {returnable && <Button variant="secundario" disabled={!online || busy} aria-label={`Devolver ${item.cylinder.serialNumber} ao estoque`} onClick={(event) => onReturn(item, event.currentTarget)}>Devolver ao estoque</Button>}
              {unlockable && <Button variant="secundario" disabled={!online || busy} aria-label={`Registrar desbloqueio de ${item.cylinder.serialNumber}`} onClick={(event) => onUnlock(item, event.currentTarget)}>Registrar desbloqueio</Button>}
            </div>
          ) : undefined} />
        );
      })}</ul>}
    </li>
  );
}
