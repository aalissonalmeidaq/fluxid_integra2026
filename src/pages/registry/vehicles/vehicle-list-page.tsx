import React, { useCallback, useMemo, useState } from 'react';
import type { RegistryService } from '@/application/registry/registry-service';
import type { VehicleView } from '@/application/registry/registry-views';
import { usePermissions } from '@/app/navigation/permissions-context';
import { Button, Card, ErrorState, Select, TextField, type ColunaDaTabela } from '@/design-system';
import { formatPlate } from '@/domain/registry/plate';
import { VALIDITY_LABELS, VEHICLE_TYPE_LABELS, VEHICLE_TYPES } from '@/domain/registry/registry-vocabulary';
import { AccessGate } from '@/pages/cylinders/components/access-gate';
import { primaryLinkClass, RegistryList } from '../components/registry-list';
import { ValidityBadge, VehicleStatusBadge } from '../components/status-badge';
import { useRegistryService } from '../use-registry-service';

const PAGE_SIZE = 25;

interface Query { search: string; status: 'active' | 'available' | 'maintenance' | 'inactive' | 'all'; vehicleType: string; licensingStatus: string }
const INITIAL: Query = { search: '', status: 'active', vehicleType: '', licensingStatus: '' };

const COLUMNS: readonly ColunaDaTabela<VehicleView>[] = [
  { id: 'placa', cabecalho: 'Placa', cabecalhoDaLinha: true, celula: (vehicle) => <a className="font-semibold text-azul-profundo underline" href={`/veiculos/${vehicle.id}`}>{formatPlate(vehicle.plate)}</a> },
  { id: 'tipo', cabecalho: 'Tipo', celula: (vehicle) => (vehicle.vehicleTypeDetail ? `${VEHICLE_TYPE_LABELS[vehicle.vehicleType]}: ${vehicle.vehicleTypeDetail}` : VEHICLE_TYPE_LABELS[vehicle.vehicleType]) },
  { id: 'veiculo', cabecalho: 'Marca e modelo', celula: (vehicle) => [vehicle.brand, vehicle.model].filter(Boolean).join(' ') || 'Não informado' },
  { id: 'capacidade', cabecalho: 'Capacidade', celula: (vehicle) => `${vehicle.capacityCylinders} ${vehicle.capacityCylinders === 1 ? 'cilindro' : 'cilindros'}` },
  { id: 'situacao', cabecalho: 'Situação', celula: (vehicle) => <VehicleStatusBadge status={vehicle.status} /> },
  { id: 'licenciamento', cabecalho: 'Licenciamento', celula: (vehicle) => <ValidityBadge status={vehicle.licensingStatus} subject="Licenciamento" /> },
];

export interface VehicleListViewProps {
  organizationId: string;
  service: RegistryService | null;
  canCreate: boolean;
}

export function VehicleListView({ organizationId, service, canCreate }: VehicleListViewProps): React.JSX.Element {
  const [query, setQuery] = useState<Query>(INITIAL);
  const [searchDraft, setSearchDraft] = useState('');

  const fetchPage = useCallback(async (current: Query, cursor: string | null) => {
    if (!service) return { kind: 'unavailable' as const };
    return service.listVehicles(organizationId, { search: current.search, status: current.status, vehicleType: current.vehicleType, licensingStatus: current.licensingStatus, limit: PAGE_SIZE, cursor });
  }, [service, organizationId]);

  const create = useMemo(() => (canCreate ? { href: '/veiculos/novo', label: 'Cadastrar veículo' } : undefined), [canCreate]);
  if (!service) return <ErrorState title="Conexão indisponível" message="Não foi possível falar com o servidor agora." />;
  const filtersActive = Boolean(query.search || query.vehicleType || query.licensingStatus || query.status !== 'active');

  return (
    <section aria-labelledby="vehicle-list-title" className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 tablet:flex-row tablet:items-center tablet:justify-between">
        <div>
          <p className="text-legenda font-semibold uppercase text-azul-profundo">Veículos</p>
          <h2 id="vehicle-list-title" className="mt-1 text-h2 font-bold text-navy">Veículos da organização</h2>
          <p className="mt-1 text-corpo">Busque por placa, marca ou modelo e acompanhe a situação do veículo e do licenciamento.</p>
        </div>
        {create && <a className={`${primaryLinkClass} tablet:shrink-0`} href={create.href}>{create.label}</a>}
      </div>

      <Card>
        <form role="search" noValidate onSubmit={(event) => { event.preventDefault(); setQuery((current) => ({ ...current, search: searchDraft })); }} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2 tablet:flex-row tablet:items-end">
            <TextField wrapperClassName="tablet:flex-1" label="Buscar veículo" name="search" value={searchDraft} onChange={(event) => setSearchDraft(event.target.value)} maxLength={200} autoComplete="off" help="Placa (com ou sem hífen), marca ou modelo." />
            <Button type="submit" className="tablet:mb-6">Buscar</Button>
          </div>
          <div className="grid gap-4 tablet:grid-cols-3">
            <Select wrapperClassName="min-w-0" label="Situação do veículo" name="status" value={query.status} onChange={(event) => setQuery((current) => ({ ...current, status: event.target.value as Query['status'] }))}>
              <option value="active">Em uso</option>
              <option value="available">Disponíveis</option>
              <option value="maintenance">Em manutenção</option>
              <option value="inactive">Inativos</option>
              <option value="all">Todos</option>
            </Select>
            <Select wrapperClassName="min-w-0" label="Tipo de veículo" name="vehicleType" value={query.vehicleType} onChange={(event) => setQuery((current) => ({ ...current, vehicleType: event.target.value }))}>
              <option value="">Todos</option>
              {VEHICLE_TYPES.map((type) => <option key={type} value={type}>{VEHICLE_TYPE_LABELS[type]}</option>)}
            </Select>
            <Select wrapperClassName="min-w-0" label="Situação do licenciamento" name="licensingStatus" value={query.licensingStatus} onChange={(event) => setQuery((current) => ({ ...current, licensingStatus: event.target.value }))}>
              <option value="">Todas</option>
              {(['em_dia', 'a_vencer', 'vencido', 'sem_data'] as const).map((status) => <option key={status} value={status}>{VALIDITY_LABELS[status]}</option>)}
            </Select>
          </div>
        </form>
      </Card>

      <RegistryList
        query={query}
        fetchPage={fetchPage}
        columns={COLUMNS}
        getKey={(vehicle) => vehicle.id}
        legend="Veículos da organização"
        nouns={{ one: 'veículo encontrado', many: 'veículos encontrados' }}
        moreLabel="Mostrar mais veículos"
        empty={{
          title: 'Nenhum veículo encontrado', filtersActive,
          filtered: 'Nenhum veículo corresponde à busca e aos filtros escolhidos. Ajuste e tente de novo.',
          unfiltered: 'Esta organização ainda não tem veículos em uso.',
        }}
        create={create}
        subject="veículos"
      />
    </section>
  );
}

export function VehicleListPage(): React.JSX.Element {
  const { service, organizationId } = useRegistryService();
  const { permissions } = usePermissions();
  return (
    <AccessGate permission="vehicle.read">
      <VehicleListView key={organizationId} organizationId={organizationId} service={service} canCreate={permissions?.tenant.includes('vehicle.write') ?? false} />
    </AccessGate>
  );
}

