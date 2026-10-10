import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { TripService } from '@/application/trips/trip-service';
import type { TripListItem, TripOptions } from '@/application/trips/trip-views';
import { usePermissions } from '@/app/navigation/permissions-context';
import { Button, Card, ErrorState, Select, TextField, type ColunaDaTabela } from '@/design-system';
import { formatPlate } from '@/domain/registry/plate';
import { CUSTODY_STATUSES, CUSTODY_STATUS_LABELS, type CustodyStatus } from '@/domain/trips/trip-vocabulary';
import { formatDate } from '@/domain/cylinders/format';
import { AccessGate } from '@/pages/cylinders/components/access-gate';
import { primaryLinkClass, RegistryList } from '@/pages/registry/components/registry-list';
import { OverdueBadge, TripStatusBadge } from './components/trip-badges';
import { useTripService } from './use-trip-service';

const PAGE_SIZE = 25;

type StatusFilter = 'open' | 'planned' | 'loading' | 'in_progress' | 'completed' | 'cancelled' | 'all';
type SortFilter = 'number_desc' | 'number_asc' | 'date_desc' | 'date_asc';
interface Query { search: string; status: StatusFilter; from: string; to: string; vehicleId: string; driverId: string; customerId: string; custody: '' | CustodyStatus; sort: SortFilter }
const INITIAL: Query = { search: '', status: 'open', from: '', to: '', vehicleId: '', driverId: '', customerId: '', custody: '', sort: 'number_desc' };

const COLUMNS: readonly ColunaDaTabela<TripListItem>[] = [
  { id: 'numero', cabecalho: 'Viagem', cabecalhoDaLinha: true, celula: (trip) => <a className="font-semibold text-azul-profundo underline" href={`/viagens/${trip.id}`}>{`n.º ${trip.number}`}</a> },
  { id: 'data', cabecalho: 'Data prevista', celula: (trip) => (
    <span className="flex flex-wrap items-center gap-2">{formatDate(trip.plannedDate)}{trip.overdue && <OverdueBadge />}</span>
  ) },
  { id: 'situacao', cabecalho: 'Situação', celula: (trip) => <TripStatusBadge status={trip.status} /> },
  { id: 'veiculo', cabecalho: 'Veículo', celula: (trip) => (trip.vehicle ? <a className="text-azul-profundo underline" href={`/veiculos/${trip.vehicle.id}`}>{formatPlate(trip.vehicle.plate)}</a> : 'Não informado') },
  { id: 'motorista', cabecalho: 'Motorista', celula: (trip) => (trip.driver ? <a className="text-azul-profundo underline" href={`/motoristas/${trip.driver.id}`}>{trip.driver.fullName}</a> : 'Não informado') },
  { id: 'paradas', cabecalho: 'Paradas', celula: (trip) => String(trip.stops) },
  { id: 'cilindros', cabecalho: 'Cilindros', celula: (trip) => String(trip.cylinders) },
  { id: 'divergencias', cabecalho: 'Divergências', celula: (trip) => (trip.divergences > 0 ? `${trip.divergences}` : 'Nenhuma') },
];

export interface TripListViewProps {
  organizationId: string;
  service: TripService | null;
  canCreate: boolean;
}

export function TripListView({ organizationId, service, canCreate }: TripListViewProps): React.JSX.Element {
  const [query, setQuery] = useState<Query>(INITIAL);
  const [searchDraft, setSearchDraft] = useState('');
  const [options, setOptions] = useState<TripOptions | null>(null);

  // Veículos, motoristas e clientes para os filtros; sem eles a lista continua funcionando só com busca, situação e período.
  useEffect(() => {
    if (!service) return undefined;
    let active = true;
    void service.tripOptions(organizationId).then((outcome) => { if (active && outcome.kind === 'success') setOptions(outcome.value); });
    return () => { active = false; };
  }, [service, organizationId]);
  const customers = useMemo(() => {
    const byId = new Map<string, string>();
    for (const site of options?.sites ?? []) byId.set(site.customerId, site.customerName);
    return [...byId].sort((a, b) => a[1].localeCompare(b[1], 'pt-BR'));
  }, [options]);

  const fetchPage = useCallback(async (current: Query, cursor: string | null) => {
    if (!service) return { kind: 'unavailable' as const };
    return service.listTrips(organizationId, { search: current.search, status: current.status, from: current.from, to: current.to, limit: PAGE_SIZE, cursor,
      sort: current.sort, ...(current.vehicleId ? { vehicleId: current.vehicleId } : {}), ...(current.driverId ? { driverId: current.driverId } : {}),
      ...(current.customerId ? { customerId: current.customerId } : {}), ...(current.custody ? { custody: current.custody } : {}) });
  }, [service, organizationId]);

  const create = useMemo(() => (canCreate ? { href: '/viagens/nova', label: 'Planejar viagem' } : undefined), [canCreate]);
  if (!service) return <ErrorState title="Conexão indisponível" message="Não foi possível falar com o servidor agora." />;
  const filtersActive = Boolean(query.search || query.from || query.to || query.status !== 'open' || query.vehicleId || query.driverId || query.customerId || query.custody);

  return (
    <section aria-labelledby="trip-list-title" className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 tablet:flex-row tablet:items-center tablet:justify-between">
        <div>
          <p className="text-legenda font-semibold uppercase text-azul-profundo">Viagens</p>
          <h2 id="trip-list-title" className="mt-1 text-h2 font-bold text-navy">Viagens da organização</h2>
          <p className="mt-1 text-corpo">Planeje, confira a carga e acompanhe cada viagem, da saída à entrega.</p>
        </div>
        {create && <a className={`${primaryLinkClass} tablet:shrink-0`} href={create.href}>{create.label}</a>}
      </div>

      <Card>
        <form role="search" noValidate onSubmit={(event) => { event.preventDefault(); setQuery((current) => ({ ...current, search: searchDraft })); }} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2 tablet:flex-row tablet:items-end">
            <TextField wrapperClassName="tablet:flex-1" label="Buscar viagem" name="search" value={searchDraft} onChange={(event) => setSearchDraft(event.target.value)} maxLength={200} autoComplete="off"
              help="Número, placa, motorista ou cliente." />
            <Button type="submit" className="tablet:mb-6">Buscar</Button>
          </div>
          <div className="grid gap-4 tablet:grid-cols-3">
            <Select wrapperClassName="min-w-0" label="Situação da viagem" name="status" value={query.status} onChange={(event) => setQuery((current) => ({ ...current, status: event.target.value as StatusFilter }))}>
              <option value="open">Abertas</option>
              <option value="planned">Planejadas</option>
              <option value="loading">Carregando</option>
              <option value="in_progress">Em andamento</option>
              <option value="completed">Concluídas</option>
              <option value="cancelled">Canceladas</option>
              <option value="all">Todas</option>
            </Select>
            <TextField wrapperClassName="min-w-0" label="Data prevista, a partir de" name="from" type="date" value={query.from} onChange={(event) => setQuery((current) => ({ ...current, from: event.target.value }))} />
            <TextField wrapperClassName="min-w-0" label="Data prevista, até" name="to" type="date" value={query.to} onChange={(event) => setQuery((current) => ({ ...current, to: event.target.value }))} />
          </div>
          <div className="grid gap-4 tablet:grid-cols-2 desktop:grid-cols-3">
            {options && (
              <>
                <Select wrapperClassName="min-w-0" label="Veículo" name="vehicle" value={query.vehicleId} onChange={(event) => setQuery((current) => ({ ...current, vehicleId: event.target.value }))}>
                  <option value="">Todos</option>
                  {options.vehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{formatPlate(vehicle.plate)}</option>)}
                </Select>
                <Select wrapperClassName="min-w-0" label="Motorista" name="driver" value={query.driverId} onChange={(event) => setQuery((current) => ({ ...current, driverId: event.target.value }))}>
                  <option value="">Todos</option>
                  {options.drivers.map((driver) => <option key={driver.id} value={driver.id}>{driver.fullName}</option>)}
                </Select>
                <Select wrapperClassName="min-w-0" label="Cliente" name="customer" value={query.customerId} onChange={(event) => setQuery((current) => ({ ...current, customerId: event.target.value }))}>
                  <option value="">Todos</option>
                  {customers.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
                </Select>
              </>
            )}
            <Select wrapperClassName="min-w-0" label="Custódia dos cilindros" name="custody" value={query.custody} onChange={(event) => setQuery((current) => ({ ...current, custody: event.target.value as Query['custody'] }))}>
              <option value="">Todas</option>
              {CUSTODY_STATUSES.map((status) => <option key={status} value={status}>{CUSTODY_STATUS_LABELS[status]}</option>)}
            </Select>
            <Select wrapperClassName="min-w-0" label="Ordenar por" name="sort" value={query.sort} onChange={(event) => setQuery((current) => ({ ...current, sort: event.target.value as SortFilter }))}>
              <option value="number_desc">Número (mais recentes primeiro)</option>
              <option value="number_asc">Número (mais antigas primeiro)</option>
              <option value="date_desc">Data prevista (mais distante primeiro)</option>
              <option value="date_asc">Data prevista (mais próxima primeiro)</option>
            </Select>
          </div>
        </form>
      </Card>

      <RegistryList
        query={query}
        fetchPage={fetchPage}
        columns={COLUMNS}
        getKey={(trip) => trip.id}
        legend="Viagens da organização"
        nouns={{ one: 'viagem encontrada', many: 'viagens encontradas' }}
        moreLabel="Mostrar mais viagens"
        empty={{
          title: 'Nenhuma viagem ainda', filtersActive,
          filtered: 'Nenhuma viagem corresponde à busca e aos filtros escolhidos. Ajuste e tente de novo.',
          unfiltered: 'Esta organização ainda não tem viagens abertas.',
        }}
        create={create}
        subject="viagens"
      />
    </section>
  );
}

export function TripListPage(): React.JSX.Element {
  const { service, organizationId } = useTripService();
  const { permissions } = usePermissions();
  return (
    <AccessGate permission="trip.read">
      <TripListView key={organizationId} organizationId={organizationId} service={service} canCreate={permissions?.tenant.includes('trip.write') ?? false} />
    </AccessGate>
  );
}
