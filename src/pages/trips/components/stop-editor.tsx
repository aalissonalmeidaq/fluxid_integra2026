import React, { useRef, useState } from 'react';
import type { TripService } from '@/application/trips/trip-service';
import type { EligibleCylinderView, SiteOption } from '@/application/trips/trip-views';
import { Button, Select } from '@/design-system';
import { TRIP_LIMITS } from '@/domain/trips/trip-limits';
import { CylinderPicker } from './cylinder-picker';
import { newStopKey, type StopDraft } from './stop-draft';

export interface StopEditorProps {
  stops: readonly StopDraft[];
  sites: readonly SiteOption[];
  onChange: (stops: StopDraft[]) => void;
  service: TripService | null;
  organizationId: string;
  // Quantos cilindros ainda cabem no veículo (negativo quando passou); nulo enquanto o veículo não foi escolhido.
  remaining: number | null;
  errors: Record<string, string>;
  disabled?: boolean;
  onAnnounce: (message: string) => void;
}

// Grupo de unidades por cliente, para a pessoa achar a unidade sem depender de busca.
function groupedSites(sites: readonly SiteOption[]): Array<{ customer: string; sites: SiteOption[] }> {
  const groups = new Map<string, SiteOption[]>();
  for (const site of sites) groups.set(site.customerName, [...(groups.get(site.customerName) ?? []), site]);
  return [...groups.entries()].map(([customer, list]) => ({ customer, sites: list }));
}

// Editor das paradas da viagem (RF-002, RF-003): acrescentar, remover, subir e descer com botões (nunca só arrastar), escolher a
// unidade e os cilindros de cada parada. Cada ação anuncia o resultado na região de status única da tela.
export function StopEditor({ stops, sites, onChange, service, organizationId, remaining, errors, disabled = false, onAnnounce }: StopEditorProps): React.JSX.Element {
  const [pickerOpen, setPickerOpen] = useState<string | null>(null);
  const addRef = useRef<HTMLButtonElement>(null);
  const allIds = new Set(stops.flatMap((stop) => stop.cylinders.map((cylinder) => cylinder.id)));
  const atLimit = stops.length >= TRIP_LIMITS.maxStops;

  const update = (key: string, patch: Partial<StopDraft>): void => onChange(stops.map((stop) => (stop.key === key ? { ...stop, ...patch } : stop)));
  const move = (index: number, delta: -1 | 1): void => {
    const target = index + delta;
    if (target < 0 || target >= stops.length) return;
    const copy = [...stops];
    const [item] = copy.splice(index, 1);
    copy.splice(target, 0, item as StopDraft);
    onChange(copy);
    onAnnounce(`Parada movida para a posição ${target + 1}.`);
  };
  const remove = (index: number): void => {
    onChange(stops.filter((_, position) => position !== index));
    onAnnounce(`Parada ${index + 1} removida.`);
    addRef.current?.focus();
  };

  return (
    <div className="flex flex-col gap-4">
      {stops.length === 0 && <p className="text-corpo">Nenhuma parada ainda. Acrescente a primeira para escolher os cilindros.</p>}
      {errors.stops && <p role="alert" className="text-corpo font-semibold text-erro">{errors.stops}</p>}
      <ol className="flex flex-col gap-4" aria-label="Paradas da viagem">
        {stops.map((stop, index) => {
          const open = pickerOpen === stop.key;
          const siteError = errors[`stops.${index}.siteId`];
          const cylinderError = errors[`stops.${index}.cylinders`];
          return (
            <li key={stop.key} className="flex flex-col gap-4 rounded-card border border-borda-suave bg-branco p-4 shadow-card">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="text-h3 font-semibold text-navy">Parada {index + 1}</h4>
                <div className="flex flex-wrap gap-2">
                  <Button variant="secundario" disabled={disabled || index === 0} aria-label={`Subir a parada ${index + 1}`} onClick={() => move(index, -1)}>Subir</Button>
                  <Button variant="secundario" disabled={disabled || index === stops.length - 1} aria-label={`Descer a parada ${index + 1}`} onClick={() => move(index, 1)}>Descer</Button>
                  <Button variant="secundario" disabled={disabled} aria-label={`Remover a parada ${index + 1}`} onClick={() => remove(index)}>Remover</Button>
                </div>
              </div>

              <Select label={`Unidade da parada ${index + 1}`} name={`stop-${index}-site`} value={stop.siteId} disabled={disabled} error={siteError}
                onChange={(event) => update(stop.key, { siteId: event.target.value })}>
                <option value="" disabled>Selecione a unidade</option>
                {groupedSites(sites).map((group) => (
                  <optgroup key={group.customer} label={group.customer}>
                    {group.sites.map((site) => <option key={site.id} value={site.id}>{`${site.name} — ${site.city}/${site.state}`}</option>)}
                  </optgroup>
                ))}
                {stop.siteId !== '' && !sites.some((site) => site.id === stop.siteId) && <option value={stop.siteId}>Unidade atual (indisponível para novas viagens)</option>}
              </Select>

              <div>
                <p className="text-corpo font-semibold text-grafite">{`Cilindros desta parada (${stop.cylinders.length})`}</p>
                {stop.cylinders.length === 0 ? (
                  <p className="mt-1 text-corpo">Nenhum cilindro escolhido.</p>
                ) : (
                  <ul role="list" className="mt-2 flex flex-col gap-2">
                    {stop.cylinders.map((cylinder) => (
                      <li key={cylinder.id} className="flex flex-wrap items-center justify-between gap-2 rounded-controle border border-borda-suave p-2">
                        <span className="min-w-0 break-words text-corpo"><span className="font-semibold text-navy">{cylinder.serialNumber}</span>{` · ${cylinder.gas}`}</span>
                        <Button variant="secundario" disabled={disabled} aria-label={`Tirar ${cylinder.serialNumber} da parada ${index + 1}`}
                          onClick={() => { update(stop.key, { cylinders: stop.cylinders.filter((other) => other.id !== cylinder.id) }); onAnnounce(`Cilindro ${cylinder.serialNumber} retirado da parada ${index + 1}.`); }}>
                          Tirar
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
                {cylinderError && <p role="alert" className="mt-2 text-corpo font-semibold text-erro">{cylinderError}</p>}
              </div>

              <div className="flex flex-col gap-2">
                <Button variant="secundario" className="self-start" aria-expanded={open} disabled={disabled} onClick={() => setPickerOpen(open ? null : stop.key)}>
                  {open ? `Fechar a busca de cilindros da parada ${index + 1}` : `Adicionar cilindros à parada ${index + 1}`}
                </Button>
                {open && (
                  <CylinderPicker service={service} organizationId={organizationId} excludedIds={allIds} remaining={remaining} disabled={disabled} onAnnounce={onAnnounce}
                    onAdd={(cylinder: EligibleCylinderView) => update(stop.key, { cylinders: [...stop.cylinders, { id: cylinder.id, serialNumber: cylinder.serialNumber, gas: cylinder.gas }] })} />
                )}
              </div>
            </li>
          );
        })}
      </ol>
      <Button ref={addRef} variant="secundario" className="self-start" disabled={disabled || atLimit}
        onClick={() => { onChange([...stops, { key: newStopKey(), siteId: '', cylinders: [] }]); onAnnounce(`Parada ${stops.length + 1} acrescentada.`); }}>
        Adicionar parada
      </Button>
      {atLimit && <p className="text-corpo">{`Uma viagem tem no máximo ${TRIP_LIMITS.maxStops} paradas.`}</p>}
    </div>
  );
}
