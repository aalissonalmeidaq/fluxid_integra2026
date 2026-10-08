import React, { useCallback, useMemo, useState } from 'react';
import type { RegistryService } from '@/application/registry/registry-service';
import type { DriverView } from '@/application/registry/registry-views';
import { usePermissions } from '@/app/navigation/permissions-context';
import { Button, Card, ErrorState, Select, TextField, type ColunaDaTabela } from '@/design-system';
import { VALIDITY_LABELS } from '@/domain/registry/registry-vocabulary';
import { AccessGate } from '@/pages/cylinders/components/access-gate';
import { primaryLinkClass, RegistryList } from '../components/registry-list';
import { AnonymizedBadge, EntityStatusBadge, ValidityBadge } from '../components/status-badge';
import { useRegistryService } from '../use-registry-service';

const PAGE_SIZE = 25;

interface Query { search: string; status: 'active' | 'inactive' | 'all'; cnhStatus: string; linked: '' | 'yes' | 'no' }
const INITIAL: Query = { search: '', status: 'active', cnhStatus: '', linked: '' };

const formatDate = (iso: string): string => iso.split('-').reverse().join('/');

const COLUMNS: readonly ColunaDaTabela<DriverView>[] = [
  { id: 'nome', cabecalho: 'Motorista', cabecalhoDaLinha: true, celula: (driver) => <a className="font-semibold text-azul-profundo underline" href={`/motoristas/${driver.id}`}>{driver.fullName}</a> },
  { id: 'cpf', cabecalho: 'CPF', celula: (driver) => driver.cpfDisplay || 'Não informado' },
  { id: 'cnh', cabecalho: 'CNH', celula: (driver) => (driver.anonymizedAt ? 'Não informada' : `Categoria ${driver.cnhCategory}, validade ${formatDate(driver.cnhValidUntil)}`) },
  { id: 'situacaocnh', cabecalho: 'Situação da CNH', celula: (driver) => (driver.anonymizedAt ? 'Não se aplica' : <ValidityBadge status={driver.cnhStatus} subject="CNH" />) },
  { id: 'usuario', cabecalho: 'Usuário', celula: (driver) => (driver.linked ? 'Vinculado' : 'Sem vínculo') },
  { id: 'situacao', cabecalho: 'Situação', celula: (driver) => <span className="flex flex-wrap items-center gap-2"><EntityStatusBadge status={driver.status} />{driver.anonymizedAt && <AnonymizedBadge />}</span> },
];

export interface DriverListViewProps {
  organizationId: string;
  service: RegistryService | null;
  canCreate: boolean;
}

export function DriverListView({ organizationId, service, canCreate }: DriverListViewProps): React.JSX.Element {
  const [query, setQuery] = useState<Query>(INITIAL);
  const [searchDraft, setSearchDraft] = useState('');

  const fetchPage = useCallback(async (current: Query, cursor: string | null) => {
    if (!service) return { kind: 'unavailable' as const };
    return service.listDrivers(organizationId, {
      search: current.search, status: current.status, cnhStatus: current.cnhStatus, limit: PAGE_SIZE, cursor, ...(current.linked ? { linked: current.linked === 'yes' } : {}),
    });
  }, [service, organizationId]);

  const create = useMemo(() => (canCreate ? { href: '/motoristas/novo', label: 'Cadastrar motorista' } : undefined), [canCreate]);
  if (!service) return <ErrorState title="Conexão indisponível" message="Não foi possível falar com o servidor agora." />;
  const filtersActive = Boolean(query.search || query.cnhStatus || query.linked || query.status !== 'active');

  return (
    <section aria-labelledby="driver-list-title" className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 tablet:flex-row tablet:items-center tablet:justify-between">
        <div>
          <p className="text-legenda font-semibold uppercase text-azul-profundo">Motoristas</p>
          <h2 id="driver-list-title" className="mt-1 text-h2 font-bold text-navy">Motoristas da organização</h2>
          <p className="mt-1 text-corpo">Busque pelo nome ou pelo CPF ou CNH completo. Os documentos aparecem sempre mascarados.</p>
        </div>
        {create && <a className={`${primaryLinkClass} tablet:shrink-0`} href={create.href}>{create.label}</a>}
      </div>

      <Card>
        <form role="search" noValidate onSubmit={(event) => { event.preventDefault(); setQuery((current) => ({ ...current, search: searchDraft })); }} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2 tablet:flex-row tablet:items-end">
            <TextField wrapperClassName="tablet:flex-1" label="Buscar motorista" name="search" value={searchDraft} onChange={(event) => setSearchDraft(event.target.value)} maxLength={200} autoComplete="off" help="Nome, ou CPF ou CNH completo." />
            <Button type="submit" className="tablet:mb-6">Buscar</Button>
          </div>
          <div className="grid gap-4 tablet:grid-cols-3">
            <Select wrapperClassName="min-w-0" label="Situação cadastral" name="status" value={query.status} onChange={(event) => setQuery((current) => ({ ...current, status: event.target.value as Query['status'] }))}>
              <option value="active">Ativos</option>
              <option value="inactive">Inativos</option>
              <option value="all">Todos</option>
            </Select>
            <Select wrapperClassName="min-w-0" label="Situação da CNH" name="cnhStatus" value={query.cnhStatus} onChange={(event) => setQuery((current) => ({ ...current, cnhStatus: event.target.value }))}>
              <option value="">Todas</option>
              {(['em_dia', 'a_vencer', 'vencido'] as const).map((status) => <option key={status} value={status}>{VALIDITY_LABELS[status]}</option>)}
            </Select>
            <Select wrapperClassName="min-w-0" label="Usuário vinculado" name="linked" value={query.linked} onChange={(event) => setQuery((current) => ({ ...current, linked: event.target.value as Query['linked'] }))}>
              <option value="">Todos</option>
              <option value="yes">Com usuário</option>
              <option value="no">Sem usuário</option>
            </Select>
          </div>
        </form>
      </Card>

      <RegistryList
        query={query}
        fetchPage={fetchPage}
        columns={COLUMNS}
        getKey={(driver) => driver.id}
        legend="Motoristas da organização"
        nouns={{ one: 'motorista encontrado', many: 'motoristas encontrados' }}
        moreLabel="Mostrar mais motoristas"
        empty={{
          title: 'Nenhum motorista encontrado', filtersActive,
          filtered: 'Nenhum motorista corresponde à busca e aos filtros escolhidos. Ajuste e tente de novo.',
          unfiltered: 'Esta organização ainda não tem motoristas ativos.',
        }}
        create={create}
        subject="motoristas"
      />
    </section>
  );
}

export function DriverListPage(): React.JSX.Element {
  const { service, organizationId } = useRegistryService();
  const { permissions } = usePermissions();
  return (
    <AccessGate permission="driver.read">
      <DriverListView key={organizationId} organizationId={organizationId} service={service} canCreate={permissions?.tenant.includes('driver.write') ?? false} />
    </AccessGate>
  );
}
