import React, { useCallback, useEffect, useState } from 'react';
import type { RegistryService } from '@/application/registry/registry-service';
import type { GeofenceListItem } from '@/application/registry/registry-views';
import { usePermissions } from '@/app/navigation/permissions-context';
import { Button, Card, ErrorState, Select, TextField, type ColunaDaTabela } from '@/design-system';
import { GEOFENCE_SHAPE_LABELS, GEOFENCE_SHAPES } from '@/domain/registry/registry-vocabulary';
import { AccessGate } from '@/pages/cylinders/components/access-gate';
import { RegistryList } from '../components/registry-list';
import { EntityStatusBadge } from '../components/status-badge';
import { useRegistryService } from '../use-registry-service';

const PAGE_SIZE = 25;

interface Query { search: string; status: 'active' | 'inactive' | 'all'; shape: string; customerId: string }
const INITIAL: Query = { search: '', status: 'active', shape: '', customerId: '' };

const COLUMNS: readonly ColunaDaTabela<GeofenceListItem>[] = [
  { id: 'nome', cabecalho: 'Geocerca', cabecalhoDaLinha: true, celula: (geofence) => <a className="font-semibold text-azul-profundo underline" href={`/geocercas/${geofence.id}`}>{geofence.name}</a> },
  { id: 'unidade', cabecalho: 'Unidade', celula: (geofence) => <a className="underline" href={`/clientes/${geofence.customerId}/unidades/${geofence.siteId}`}>{geofence.siteName}</a> },
  { id: 'cliente', cabecalho: 'Cliente', celula: (geofence) => <a className="underline" href={`/clientes/${geofence.customerId}`}>{geofence.customerName}</a> },
  { id: 'forma', cabecalho: 'Forma', celula: (geofence) => GEOFENCE_SHAPE_LABELS[geofence.shape] },
  { id: 'situacao', cabecalho: 'Situação', celula: (geofence) => <EntityStatusBadge status={geofence.status} /> },
];

export interface GeofenceListViewProps {
  organizationId: string;
  service: RegistryService | null;
}

export function GeofenceListView({ organizationId, service }: GeofenceListViewProps): React.JSX.Element {
  const [query, setQuery] = useState<Query>(INITIAL);
  const [searchDraft, setSearchDraft] = useState('');
  const [customers, setCustomers] = useState<Array<{ id: string; name: string }>>([]);

  // Clientes para o filtro: carregados uma vez, quando a tela abre (até 100, os primeiros por nome).
  useEffect(() => {
    if (!service) return undefined;
    let active = true;
    void service.listCustomers(organizationId, { status: 'all', limit: 100 }).then((outcome) => {
      if (active && outcome.kind === 'success') setCustomers(outcome.value.items.map((customer) => ({ id: customer.id, name: customer.legalName })));
    });
    return () => { active = false; };
  }, [service, organizationId]);

  const fetchPage = useCallback(async (current: Query, cursor: string | null) => {
    if (!service) return { kind: 'unavailable' as const };
    return service.listGeofences(organizationId, { status: current.status, limit: PAGE_SIZE, cursor, search: current.search, shape: current.shape, customerId: current.customerId });
  }, [service, organizationId]);

  if (!service) return <ErrorState title="Conexão indisponível" message="Não foi possível falar com o servidor agora." />;
  const filtersActive = Boolean(query.search || query.shape || query.customerId || query.status !== 'active');

  return (
    <section aria-labelledby="geofence-list-title" className="flex flex-col gap-6">
      <div>
        <p className="text-legenda font-semibold uppercase text-azul-profundo">Geocercas</p>
        <h2 id="geofence-list-title" className="mt-1 text-h2 font-bold text-navy">Geocercas da organização</h2>
        <p className="mt-1 text-corpo">Cada geocerca pertence a uma unidade. Para criar uma nova, abra a unidade do cliente.</p>
      </div>

      <Card>
        <form role="search" noValidate onSubmit={(event) => { event.preventDefault(); setQuery((current) => ({ ...current, search: searchDraft })); }} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2 tablet:flex-row tablet:items-end">
            <TextField wrapperClassName="tablet:flex-1" label="Buscar geocerca" name="search" value={searchDraft} onChange={(event) => setSearchDraft(event.target.value)} maxLength={200} autoComplete="off" help="Nome da geocerca, da unidade ou do cliente." />
            <Button type="submit" className="tablet:mb-6">Buscar</Button>
          </div>
          <div className="grid gap-4 tablet:grid-cols-3">
            <Select wrapperClassName="min-w-0" label="Situação cadastral" name="status" value={query.status} onChange={(event) => setQuery((current) => ({ ...current, status: event.target.value as Query['status'] }))}>
              <option value="active">Ativas</option>
              <option value="inactive">Inativas</option>
              <option value="all">Todas</option>
            </Select>
            <Select wrapperClassName="min-w-0" label="Forma" name="shape" value={query.shape} onChange={(event) => setQuery((current) => ({ ...current, shape: event.target.value }))}>
              <option value="">Todas</option>
              {GEOFENCE_SHAPES.map((shape) => <option key={shape} value={shape}>{GEOFENCE_SHAPE_LABELS[shape]}</option>)}
            </Select>
            <Select wrapperClassName="min-w-0" label="Cliente" name="customerId" value={query.customerId} onChange={(event) => setQuery((current) => ({ ...current, customerId: event.target.value }))}>
              <option value="">Todos</option>
              {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
            </Select>
          </div>
        </form>
      </Card>

      <RegistryList
        query={query}
        fetchPage={fetchPage}
        columns={COLUMNS}
        getKey={(geofence) => geofence.id}
        legend="Geocercas da organização"
        nouns={{ one: 'geocerca encontrada', many: 'geocercas encontradas' }}
        moreLabel="Mostrar mais geocercas"
        empty={{
          title: 'Nenhuma geocerca encontrada', filtersActive,
          filtered: 'Nenhuma geocerca corresponde à busca e aos filtros escolhidos. Ajuste e tente de novo.',
          unfiltered: 'Esta organização ainda não tem geocercas ativas. Crie a primeira pelo detalhe de uma unidade.',
        }}
        subject="geocercas"
      />
    </section>
  );
}

export function GeofenceListPage(): React.JSX.Element {
  const { service, organizationId } = useRegistryService();
  usePermissions();
  return (
    <AccessGate permission="geofence.read">
      <GeofenceListView key={organizationId} organizationId={organizationId} service={service} />
    </AccessGate>
  );
}
