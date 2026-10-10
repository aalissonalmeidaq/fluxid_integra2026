import React from 'react';
import type { TripItemView, TripStopView } from '@/application/trips/trip-views';
import { Button, Card } from '@/design-system';
import { ItemStatusBadge } from './trip-badges';

export interface LoadingPanelProps {
  stops: readonly TripStopView[];
  items: readonly TripItemView[];
  canOperate: boolean;
  canRemove: boolean;
  online: boolean;
  // Chave da ação em andamento (`check:<item>`, `uncheck:<item>`), para mostrar o carregando só no botão certo.
  busyKey: string | null;
  highlighted: ReadonlySet<string>;
  onCheck: (item: TripItemView) => void;
  onUncheck: (item: TripItemView) => void;
  onRemove: (item: TripItemView, trigger: HTMLElement) => void;
}

const COUNTED = ['planned', 'checked'];

// Painel de conferência do carregamento (RF-010): lista com "Conferir" e "Desfazer" por cilindro e o contador "x de y conferidos".
// A contagem aparece em texto; o anúncio de cada ação vai à região de status única da tela.
export function LoadingPanel({ stops, items, canOperate, canRemove, online, busyKey, highlighted, onCheck, onUncheck, onRemove }: LoadingPanelProps): React.JSX.Element {
  const counted = items.filter((item) => COUNTED.includes(item.itemStatus));
  const checked = counted.filter((item) => item.itemStatus === 'checked').length;
  const disabled = !online || busyKey !== null;
  return (
    <Card as="section" aria-labelledby="loading-panel-title" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="loading-panel-title" className="text-h3 font-semibold text-navy">Conferência da carga</h3>
        <p className="text-corpo font-semibold text-grafite">{`${checked} de ${counted.length} conferidos`}</p>
      </div>
      <p className="text-corpo">Confira cada cilindro antes de iniciar a viagem. A conferência é manual e fica registrada com quem e quando.</p>
      {counted.length === 0 && <p className="text-corpo">Todos os cilindros foram retirados desta viagem.</p>}
      <ul role="list" aria-label="Cilindros a conferir" className="flex flex-col gap-2">
        {counted.map((item) => {
          const stop = stops.find((candidate) => candidate.id === item.stopId);
          const isChecked = item.itemStatus === 'checked';
          return (
            <li key={item.id} data-highlight={highlighted.has(item.id) ? 'true' : undefined}
              className={`flex flex-wrap items-center justify-between gap-2 rounded-controle border p-4 ${highlighted.has(item.id) ? 'border-erro bg-erro-fundo' : 'border-borda-suave'}`}>
              <span className="min-w-0 break-words text-corpo">
                <span className="font-semibold text-navy">{item.cylinder.serialNumber}</span>
                {` · ${item.cylinder.gas} · parada ${stop?.position ?? ''} (${stop?.site.name ?? ''})`}
                {highlighted.has(item.id) && <span className="ml-2 font-semibold text-erro">Falta conferir</span>}
              </span>
              <span className="flex flex-wrap items-center gap-2">
                <ItemStatusBadge status={item.itemStatus} />
                {canOperate && (isChecked
                  ? <Button variant="secundario" disabled={disabled} loading={busyKey === `uncheck:${item.id}`} loadingLabel="Desfazendo…" aria-label={`Desfazer a conferência de ${item.cylinder.serialNumber}`} onClick={() => onUncheck(item)}>Desfazer</Button>
                  : <Button variant="secundario" disabled={disabled} loading={busyKey === `check:${item.id}`} loadingLabel="Conferindo…" aria-label={`Conferir ${item.cylinder.serialNumber}`} onClick={() => onCheck(item)}>Conferir</Button>)}
                {canRemove && (
                  <Button variant="secundario" disabled={disabled} aria-label={`Retirar ${item.cylinder.serialNumber} da viagem`}
                    onClick={(event) => onRemove(item, event.currentTarget)}>Retirar da viagem</Button>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
