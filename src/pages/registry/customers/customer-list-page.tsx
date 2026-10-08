import React, { useCallback, useMemo, useState } from 'react';
import type { RegistryService } from '@/application/registry/registry-service';
import type { CustomerListItem } from '@/application/registry/registry-views';
import { usePermissions } from '@/app/navigation/permissions-context';
import { Button, Card, ErrorState, Select, TextField, type ColunaDaTabela } from '@/design-system';
import { formatCnpj } from '@/domain/registry/masks';
import { SEGMENT_LABELS, SEGMENTS, UFS } from '@/domain/registry/registry-vocabulary';
import { AccessGate } from '@/pages/cylinders/components/access-gate';
import { AnonymizedBadge, EntityStatusBadge } from '../components/status-badge';
import { primaryLinkClass, RegistryList } from '../components/registry-list';
import { useRegistryService } from '../use-registry-service';

const PAGE_SIZE = 25;

interface Query {
  search: string; status: 'active' | 'inactive' | 'all'; segment: string; state: string; geofence: '' | 'yes' | 'no';
}
const INITIAL: Query = { search: '', status: 'active', segment: '', state: '', geofence: '' };

const COLUMNS: readonly ColunaDaTabela<CustomerListItem>[] = [
  {
    id: 'nome', cabecalho: 'Cliente', cabecalhoDaLinha: true,
    celula: (customer) => (
      <span className="flex flex-col items-start gap-1">
        <a className="font-semibold text-azul-profundo underline" href={`/clientes/${customer.id}`}>{customer.legalName}</a>
        {customer.tradeName && <span className="text-legenda text-texto-secundario">{customer.tradeName}</span>}
      </span>
    ),
  },
  { id: 'documento', cabecalho: 'Documento', celula: (customer) => (customer.personType === 'legal' ? formatCnpj(customer.documentDisplay) : customer.documentDisplay) },
  { id: 'segmento', cabecalho: 'Segmento', celula: (customer) => SEGMENT_LABELS[customer.segment] },
  { id: 'cidades', cabecalho: 'Cidades', celula: (customer) => (customer.cities.length > 0 ? customer.cities.join(', ') : 'Sem unidades') },
  {
    id: 'situacao', cabecalho: 'Situação',
    celula: (customer) => <span className="flex flex-wrap items-center gap-2"><EntityStatusBadge status={customer.status} />{customer.anonymizedAt && <AnonymizedBadge />}</span>,
  },
];

export interface CustomerListViewProps {
  organizationId: string;
  service: RegistryService | null;
  // Mostra "Cadastrar cliente" só a quem tem `customer.write` (a decisão final é do servidor).
  canCreate: boolean;
}

export function CustomerListView({ organizationId, service, canCreate }: CustomerListViewProps): React.JSX.Element {
  const [query, setQuery] = useState<Query>(INITIAL);
  const [searchDraft, setSearchDraft] = useState('');

  const fetchPage = useCallback(async (current: Query, cursor: string | null) => {
    if (!service) return { kind: 'unavailable' as const };
    return service.listCustomers(organizationId, {
      status: current.status, limit: PAGE_SIZE, cursor, search: current.search, segment: current.segment, state: current.state,
      ...(current.geofence ? { hasGeofence: current.geofence === 'yes' } : {}),
    });
  }, [service, organizationId]);

  const create = useMemo(() => (canCreate ? { href: '/clientes/novo', label: 'Cadastrar cliente' } : undefined), [canCreate]);
  const filtersActive = Boolean(query.search || query.segment || query.state || query.geofence || query.status !== 'active');

  if (!service) return <ErrorState title="Conexão indisponível" message="Não foi possível falar com o servidor agora." />;

  return (
    <section aria-labelledby="customer-list-title" className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 tablet:flex-row tablet:items-center tablet:justify-between">
        <div>
          <p className="text-legenda font-semibold uppercase text-azul-profundo">Clientes</p>
          <h2 id="customer-list-title" className="mt-1 text-h2 font-bold text-navy">Clientes da organização</h2>
          <p className="mt-1 text-corpo">Busque por nome, cidade ou unidade. O documento só é achado digitando-o inteiro.</p>
        </div>
        {create && <a className={`${primaryLinkClass} tablet:shrink-0`} href={create.href}>{create.label}</a>}
      </div>

      <Card>
        <form role="search" noValidate onSubmit={(event) => { event.preventDefault(); setQuery((current) => ({ ...current, search: searchDraft })); }} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2 tablet:flex-row tablet:items-end">
            <TextField wrapperClassName="tablet:flex-1" label="Buscar cliente" name="search" value={searchDraft} onChange={(event) => setSearchDraft(event.target.value)}
              maxLength={200} autoComplete="off" help="Nome, nome fantasia, cidade, unidade ou o documento completo." />
            <Button type="submit" className="tablet:mb-6">Buscar</Button>
          </div>
          <div className="grid gap-4 tablet:grid-cols-2 desktop:grid-cols-4">
            <Select wrapperClassName="min-w-0" label="Situação cadastral" name="status" value={query.status} onChange={(event) => setQuery((current) => ({ ...current, status: event.target.value as Query['status'] }))}>
              <option value="active">Ativos</option>
              <option value="inactive">Inativos</option>
              <option value="all">Todos</option>
            </Select>
            <Select wrapperClassName="min-w-0" label="Segmento" name="segment" value={query.segment} onChange={(event) => setQuery((current) => ({ ...current, segment: event.target.value }))}>
              <option value="">Todos</option>
              {SEGMENTS.map((segment) => <option key={segment} value={segment}>{SEGMENT_LABELS[segment]}</option>)}
            </Select>
            <Select wrapperClassName="min-w-0" label="UF" name="state" value={query.state} onChange={(event) => setQuery((current) => ({ ...current, state: event.target.value }))}>
              <option value="">Todas</option>
              {UFS.map((uf) => <option key={uf} value={uf}>{uf}</option>)}
            </Select>
            <Select wrapperClassName="min-w-0" label="Geocerca" name="geofence" value={query.geofence} onChange={(event) => setQuery((current) => ({ ...current, geofence: event.target.value as Query['geofence'] }))}>
              <option value="">Todas</option>
              <option value="yes">Com geocerca</option>
              <option value="no">Sem geocerca</option>
            </Select>
          </div>
        </form>
      </Card>

      <RegistryList
          query={query}
          fetchPage={fetchPage}
          columns={COLUMNS}
          getKey={(customer) => customer.id}
          legend="Clientes da organização"
          nouns={{ one: 'cliente encontrado', many: 'clientes encontrados' }}
          moreLabel="Mostrar mais clientes"
          empty={{
            title: 'Nenhum cliente encontrado', filtersActive,
            filtered: 'Nenhum cliente corresponde à busca e aos filtros escolhidos. Ajuste e tente de novo.',
            unfiltered: 'Esta organização ainda não tem clientes ativos.',
          }}
          create={create}
          subject="clientes"
        />
    </section>
  );
}

export function CustomerListPage(): React.JSX.Element {
  const { service, organizationId } = useRegistryService();
  const { permissions } = usePermissions();
  return (
    <AccessGate permission="customer.read">
      <CustomerListView key={organizationId} organizationId={organizationId} service={service} canCreate={permissions?.tenant.includes('customer.write') ?? false} />
    </AccessGate>
  );
}
