import React, { useCallback, useEffect, useState } from 'react';
import type { CylinderOutcome, CylinderService } from '@/application/cylinders/cylinder-service';
import type { CylinderListItem, CylinderListPage, CylinderListQuery, CylinderTypeView } from '@/application/cylinders/cylinder-views';
import { usePermissions } from '@/app/navigation/permissions-context';
import { HYDROSTATIC_LABELS, HYDROSTATIC_STATUSES, STOCK_LABELS, STOCK_STATUSES, type HydrostaticStatus, type StockStatus } from '@/domain/cylinders/cylinder-types';
import { Alert, Button, Card, DataTable, ErrorState, Select, TextField, type ColunaDaTabela } from '@/design-system';
import { AccessGate } from './components/access-gate';
import { CameraScanButton } from './components/camera-scan-button';
import { IdentifierWarning, StatusBadges } from './components/status-badges';
import { typeLabel } from './type-label';
import { useCylinderService } from './use-cylinder-service';

const PAGE_SIZE = 25;

interface Query {
  search: string; status: 'active' | 'inactive' | 'all'; stockStatus: '' | StockStatus; hydroStatus: '' | HydrostaticStatus; cylinderTypeId: string; sort: 'serial' | 'serial_desc';
}
const INITIAL: Query = { search: '', status: 'active', stockStatus: '', hydroStatus: '', cylinderTypeId: '', sort: 'serial' };

const toServiceQuery = (query: Query): CylinderListQuery => ({
  status: query.status, sort: query.sort, limit: PAGE_SIZE,
  ...(query.search.trim() ? { search: query.search.trim() } : {}),
  ...(query.stockStatus ? { stockStatus: query.stockStatus } : {}),
  ...(query.hydroStatus ? { hydroStatus: query.hydroStatus } : {}),
  ...(query.cylinderTypeId ? { cylinderTypeId: query.cylinderTypeId } : {}),
});

type Phase = 'loading' | 'ready' | 'error';
type Failure = { kind: 'access_denied' | 'offline' | 'unavailable'; message: string };

const FAILURES: Record<Failure['kind'], string> = {
  access_denied: 'Você não tem permissão para ver cilindros.',
  offline: 'Sem conexão. A consulta de cilindros exige conexão.',
  unavailable: 'Não foi possível carregar os cilindros agora.',
};

const failureOf = (outcome: Exclude<CylinderOutcome<unknown>, { kind: 'success' }>): Failure => {
  const kind = outcome.kind === 'access_denied' || outcome.kind === 'offline' ? outcome.kind : 'unavailable';
  return { kind, message: FAILURES[kind] };
};

const COLUMNS: readonly ColunaDaTabela<CylinderListItem>[] = [
  {
    id: 'serie', cabecalho: 'Número de série', cabecalhoDaLinha: true,
    celula: (cylinder) => <a className="font-semibold text-azul-profundo underline" href={`/cilindros/${cylinder.id}`}>{cylinder.serialNumber}</a>,
  },
  { id: 'tipo', cabecalho: 'Tipo', celula: (cylinder) => typeLabel(cylinder.type) },
  {
    id: 'situacao', cabecalho: 'Situação',
    celula: (cylinder) => (
      <span className="flex flex-col items-start gap-2">
        <StatusBadges status={cylinder.status} stockStatus={cylinder.stockStatus} hydroStatus={cylinder.hydroStatus} />
        <IdentifierWarning activeCount={cylinder.activeIdentifierCount} />
      </span>
    ),
  },
];

export interface CylinderListViewProps {
  organizationId: string;
  service: CylinderService | null;
  online: boolean;
  // Mostra "Cadastrar cilindro" só a quem tem `cylinder.write` (a decisão final é do servidor).
  canCreate: boolean;
}

export function CylinderListView({ organizationId, service, canCreate }: CylinderListViewProps): React.JSX.Element {
  const [query, setQuery] = useState<Query>(INITIAL);
  const [searchDraft, setSearchDraft] = useState('');
  const [types, setTypes] = useState<CylinderTypeView[]>([]);
  const [items, setItems] = useState<CylinderListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [next, setNext] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>('loading');
  const [failure, setFailure] = useState<Failure | null>(null);
  const [reloadTick, setReloadTick] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);

  const applyPage = useCallback((page: CylinderListPage, append: boolean): void => {
    setItems((current) => (append ? [...current, ...page.items] : page.items));
    setTotal(page.total);
    setNext(page.next);
    setFailure(null);
    setPhase('ready');
  }, []);

  useEffect(() => {
    if (!service) return undefined;
    let active = true;
    void service.catalog(organizationId).then((outcome) => { if (active && outcome.kind === 'success') setTypes(outcome.value); });
    return () => { active = false; };
  }, [service, organizationId]);

  // A consulta roda quando o filtro muda ou a pessoa pede nova tentativa. O estado "carregando" é marcado nos eventos.
  useEffect(() => {
    if (!service) return undefined;
    let active = true;
    void service.list(organizationId, toServiceQuery(query)).then((outcome) => {
      if (!active) return;
      if (outcome.kind === 'success') applyPage(outcome.value, false);
      else { setFailure(failureOf(outcome)); setPhase('error'); }
    });
    return () => { active = false; };
  }, [service, organizationId, query, reloadTick, applyPage]);

  const change = (patch: Partial<Query>): void => {
    setPhase('loading');
    setItems([]);
    setQuery((current) => ({ ...current, ...patch }));
  };

  const loadMore = async (): Promise<void> => {
    if (!service || next === null || loadingMore) return;
    setLoadingMore(true);
    const outcome = await service.list(organizationId, { ...toServiceQuery(query), cursor: next });
    setLoadingMore(false);
    if (outcome.kind === 'success') applyPage(outcome.value, true);
    else { setFailure(failureOf(outcome)); }
  };

  if (!service) return <ErrorState title="Conexão indisponível" message="Não foi possível falar com o servidor agora." />;

  const showEmpty = phase === 'ready' && items.length === 0;
  const totalText = `${total} ${total === 1 ? 'cilindro encontrado' : 'cilindros encontrados'}`;

  return (
    <section aria-labelledby="cyl-list-title" className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 tablet:flex-row tablet:items-center tablet:justify-between">
        <div>
          <p className="text-legenda font-semibold uppercase text-azul-profundo">Cilindros</p>
          <h2 id="cyl-list-title" className="mt-1 text-h2 font-bold text-navy">Cilindros da organização</h2>
          <p className="mt-1 text-corpo">Busque por identificador ou número de série e confira as situações cadastral, de estoque e do teste.</p>
        </div>
        {canCreate && !showEmpty && (
          <a className="inline-flex min-h-alvo items-center justify-center rounded-controle border border-azul-profundo bg-azul-profundo px-4 text-corpo font-semibold text-branco hover:bg-navy tablet:shrink-0" href="/cilindros/novo">
            Cadastrar cilindro
          </a>
        )}
      </div>

      <Card>
        <form
          role="search"
          noValidate
          onSubmit={(event) => { event.preventDefault(); change({ search: searchDraft }); }}
          className="flex flex-col gap-4"
        >
          <div className="flex flex-col gap-2 tablet:flex-row tablet:items-end">
            <TextField
              wrapperClassName="tablet:flex-1"
              label="Buscar por identificador ou número de série"
              name="search"
              value={searchDraft}
              onChange={(event) => setSearchDraft(event.target.value)}
              maxLength={200}
              autoComplete="off"
              help="O identificador é comparado inteiro; o número de série pode ser só um pedaço."
            />
            <Button type="submit" className="tablet:mb-6">Buscar</Button>
            <CameraScanButton onRead={(scanned) => { setSearchDraft(scanned); change({ search: scanned }); }} />
          </div>
          <div className="grid gap-4 tablet:grid-cols-2 desktop:grid-cols-3">
            <Select wrapperClassName="min-w-0" label="Situação cadastral" name="status" value={query.status} onChange={(event) => change({ status: event.target.value as Query['status'] })}>
              <option value="active">Ativos</option>
              <option value="inactive">Inativos</option>
              <option value="all">Todos</option>
            </Select>
            <Select wrapperClassName="min-w-0" label="Situação de estoque" name="stockStatus" value={query.stockStatus} onChange={(event) => change({ stockStatus: event.target.value as Query['stockStatus'] })}>
              <option value="">Todas</option>
              {STOCK_STATUSES.map((status) => <option key={status} value={status}>{STOCK_LABELS[status]}</option>)}
            </Select>
            <Select wrapperClassName="min-w-0" label="Situação do teste" name="hydroStatus" value={query.hydroStatus} onChange={(event) => change({ hydroStatus: event.target.value as Query['hydroStatus'] })}>
              <option value="">Todas</option>
              {HYDROSTATIC_STATUSES.map((status) => <option key={status} value={status}>{HYDROSTATIC_LABELS[status]}</option>)}
            </Select>
            <Select wrapperClassName="min-w-0" label="Tipo de cilindro" name="cylinderTypeId" value={query.cylinderTypeId} onChange={(event) => change({ cylinderTypeId: event.target.value })}>
              <option value="">Todos</option>
              {types.map((type) => <option key={type.id} value={type.id}>{typeLabel(type)}</option>)}
            </Select>
            <Select wrapperClassName="min-w-0" label="Ordenar por" name="sort" value={query.sort} onChange={(event) => change({ sort: event.target.value as Query['sort'] })}>
              <option value="serial">Número de série (crescente)</option>
              <option value="serial_desc">Número de série (decrescente)</option>
            </Select>
          </div>
        </form>
      </Card>

      {phase === 'ready' && <p role="status" className="text-corpo font-semibold text-grafite">{totalText}</p>}

      {failure && phase === 'error' && (
        failure.kind === 'unavailable'
          ? <ErrorState title="Não foi possível carregar os cilindros" message="Tente novamente em instantes." onRetry={() => { setPhase('loading'); setReloadTick((tick) => tick + 1); }} />
          : <ErrorState variant="sem-permissao" title={failure.kind === 'offline' ? 'Sem conexão' : 'Acesso negado'} message={failure.message} />
      )}
      {failure && phase === 'ready' && <Alert variant="erro">{failure.message}</Alert>}

      {phase !== 'error' && (
        showEmpty ? (
          <Card>
            <div className="flex flex-col items-start gap-4">
              <h3 className="text-h3 font-semibold text-navy">Nenhum cilindro encontrado</h3>
              <p className="text-corpo">
                {query.search || query.stockStatus || query.hydroStatus || query.cylinderTypeId || query.status !== 'active'
                  ? 'Nenhum cilindro corresponde à busca e aos filtros escolhidos. Ajuste e tente de novo.'
                  : 'Esta organização ainda não tem cilindros ativos.'}
              </p>
              {canCreate && (
                <a className="inline-flex min-h-alvo items-center justify-center rounded-controle border border-azul-profundo bg-azul-profundo px-4 text-corpo font-semibold text-branco hover:bg-navy" href="/cilindros/novo">
                  Cadastrar cilindro
                </a>
              )}
            </div>
          </Card>
        ) : (
          <DataTable
            legenda="Cilindros da organização"
            colunas={COLUMNS}
            linhas={items}
            chaveDaLinha={(cylinder) => cylinder.id}
            carregando={phase === 'loading'}
            textoDeCarregamento="Carregando cilindros…"
          />
        )
      )}

      {phase === 'ready' && next !== null && (
        <Button variant="secundario" className="self-start" loading={loadingMore} loadingLabel="Carregando…" onClick={() => void loadMore()}>
          Mostrar mais cilindros
        </Button>
      )}
    </section>
  );
}

export function CylinderListPage(): React.JSX.Element {
  const { service, organizationId, online } = useCylinderService();
  const { permissions } = usePermissions();
  return (
    <AccessGate permission="cylinder.read">
      <CylinderListView
        key={organizationId}
        organizationId={organizationId}
        service={service}
        online={online}
        canCreate={permissions?.tenant.includes('cylinder.write') ?? false}
      />
    </AccessGate>
  );
}
