import React, { useCallback, useEffect, useState } from 'react';
import { watchSeals, type RealtimePort } from '@/application/seals/seal-realtime';
import type { SealService } from '@/application/seals/seal-service';
import type { SealListItem } from '@/application/seals/seal-views';
import { usePermissions } from '@/app/navigation/permissions-context';
import { Button, DataTable, ErrorState, Select, type ColunaDaTabela } from '@/design-system';
import { contactAge } from '@/domain/seals/seal-age';
import { HEALTH_STATES, LOCK_STATES, health, lockState } from '@/domain/seals/seal-vocabulary';
import { AccessGate } from '@/pages/cylinders/components/access-gate';
import { DeviceFormDialog } from './components/device-form-dialog';
import { DeviceKeyReveal } from './components/device-key-reveal';
import { SealBadge } from './components/seal-badge';
import { useSealService } from './use-seal-service';

// Lista de lacres (Spec 012, História 6; RF-042): saúde e trava em ícone e texto, filtros por saúde, trava e "sem cilindro". Atualiza
// sozinha pelo aviso em tempo real (ou a cada 30 s) e anuncia a atualização num único status, sem mover o foco.

type Load = { kind: 'loading' } | { kind: 'ready'; items: SealListItem[]; total: number } | { kind: 'error' } | { kind: 'offline' };

export interface SealListViewProps {
  service: SealService | null;
  organizationId: string;
  online: boolean;
  realtime: RealtimePort | null;
  now?: () => Date;
  // Quem administra dispositivos cadastra lacres por aqui (US5).
  canAdmin?: boolean;
}

export function SealListView({ service, organizationId, online, realtime, now = () => new Date(), canAdmin = false }: SealListViewProps): React.JSX.Element {
  const [healthFilter, setHealthFilter] = useState('');
  const [lockFilter, setLockFilter] = useState('');
  const [unbound, setUnbound] = useState(false);
  const [load, setLoad] = useState<Load>(online ? { kind: 'loading' } : { kind: 'offline' });
  const [announcement, setAnnouncement] = useState('');
  const [creating, setCreating] = useState<HTMLElement | null>(null);
  const [createBusy, setCreateBusy] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ deviceCode: string; deviceKey: string; trigger: HTMLElement | null } | null>(null);

  const request = useCallback(() => (service && organizationId ? service.listSeals(organizationId, {
    ...(healthFilter ? { health: healthFilter } : {}), ...(lockFilter ? { lockState: lockFilter } : {}), ...(unbound ? { unbound: true } : {}),
  }) : Promise.resolve(null)), [service, organizationId, healthFilter, lockFilter, unbound]);
  const apply = useCallback((outcome: Awaited<ReturnType<typeof request>>, announce: boolean) => {
    if (outcome === null) return;
    if (outcome.kind === 'success') {
      setLoad({ kind: 'ready', items: outcome.value.items, total: outcome.value.total });
      if (announce) setAnnouncement('Lista de lacres atualizada.');
    } else setLoad((current) => (current.kind === 'ready' && announce ? current : outcome.kind === 'offline' ? { kind: 'offline' } : { kind: 'error' }));
  }, []);
  const fetchSeals = useCallback(async (announce: boolean) => apply(await request(), announce), [request, apply]);

  useEffect(() => {
    if (!online) return undefined;
    let active = true;
    void request().then((outcome) => { if (active) apply(outcome, false); });
    return () => { active = false; };
  }, [online, request, apply]);

  useEffect(() => {
    if (!online || !service || !realtime || !organizationId) return undefined;
    const watch = watchSeals({ port: realtime, organizationId, onChange: () => void fetchSeals(true) });
    return () => watch.stop();
  }, [online, service, realtime, organizationId, fetchSeals]);

  const columns: ColunaDaTabela<SealListItem>[] = [
    { id: 'lacre', cabecalho: 'Lacre', cabecalhoDaLinha: true, celula: (row) => (
      <a className="text-azul-profundo underline" href={`/lacres/${row.deviceId}`}>{row.label} <span className="font-normal text-texto-secundario">({row.deviceCode})</span></a>
    ) },
    { id: 'cilindro', cabecalho: 'Cilindro', celula: (row) => (row.cylinder
      ? <a className="text-azul-profundo underline" href={`/cilindros/${row.cylinder.id}`}>{row.cylinder.serialNumber}</a>
      : <span className="text-texto-secundario">Sem cilindro</span>) },
    { id: 'saude', cabecalho: 'Saúde', celula: (row) => <SealBadge presentation={health(row.health)} /> },
    { id: 'trava', cabecalho: 'Trava', celula: (row) => <SealBadge presentation={lockState(row.lockState, row.pendingCommand?.kind ?? null)} /> },
    { id: 'bateria', cabecalho: 'Bateria', celula: (row) => (row.batteryPct === null ? '—' : `${row.batteryPct}%`) },
    { id: 'contato', cabecalho: 'Último contato', celula: (row) => contactAge(row.lastSeenAt, now()) },
  ];

  const create = async (label: string, intervalS: number) => {
    if (!service) return;
    setCreateBusy(true);
    const outcome = await service.createDevice(organizationId, label, intervalS);
    setCreateBusy(false);
    if (outcome.kind === 'success') {
      setCreated({ deviceCode: outcome.value.deviceCode, deviceKey: outcome.value.deviceKey, trigger: creating });
      setCreating(null);
    } else setCreateError(outcome.kind === 'invalid' ? Object.values(outcome.fields ?? {})[0] ?? 'Revise os dados.' : 'Não foi possível cadastrar agora. Tente de novo.');
  };

  const changed = (apply: () => void) => { setLoad({ kind: 'loading' }); apply(); };
  // Sem conexão, mantém o que já foi carregado; sem nada carregado, explica.
  const view: Load = !online && load.kind !== 'ready' ? { kind: 'offline' } : load;
  return (
    <div className="flex w-full min-w-0 flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h2 className="m-0 text-h3 font-semibold text-navy">Lacres</h2>
        <p className="m-0 max-w-padrao text-corpo text-grafite">Lacres da organização ativa: se estão funcionando, em que cilindro estão e o estado da trava.</p>
      </header>
      <p role="status" aria-atomic="true" className="sr-only">{announcement}</p>
      {canAdmin && (
        <div className="flex flex-col gap-2">
          <Button className="self-start" disabled={!online} onClick={(event) => { setCreateError(null); setCreating(event.currentTarget); }}>Cadastrar dispositivo</Button>
          {!online && <p className="m-0 text-legenda text-texto-secundario">Sem conexão: comandos de lacre exigem conexão.</p>}
        </div>
      )}
      <div className="flex flex-col gap-4 tablet:flex-row tablet:flex-wrap tablet:items-end">
        <Select label="Saúde" value={healthFilter} onChange={(event) => changed(() => setHealthFilter(event.target.value))}>
          <option value="">Todas</option>
          {HEALTH_STATES.map((value) => <option key={value} value={value}>{health(value).label}</option>)}
        </Select>
        <Select label="Trava" value={lockFilter} onChange={(event) => changed(() => setLockFilter(event.target.value))}>
          <option value="">Todas</option>
          {LOCK_STATES.map((value) => <option key={value} value={value}>{lockState(value).label}</option>)}
        </Select>
        <label className="flex min-h-alvo items-center gap-2 text-corpo text-grafite">
          <input type="checkbox" className="size-6" checked={unbound} onChange={(event) => changed(() => setUnbound(event.target.checked))} />
          Só lacres sem cilindro
        </label>
      </div>
      {view.kind === 'offline' && <p className="m-0 text-corpo text-grafite">Sem conexão: a lista de lacres aparece quando a conexão voltar.</p>}
      {view.kind === 'error' && <ErrorState title="Não foi possível carregar os lacres" message="Tente novamente em instantes." onRetry={() => changed(() => void fetchSeals(false))} />}
      {(view.kind === 'loading' || view.kind === 'ready') && (
        <DataTable
          legenda="Lacres da organização"
          colunas={columns}
          linhas={view.kind === 'ready' ? view.items : []}
          chaveDaLinha={(row) => row.deviceId}
          carregando={view.kind === 'loading'}
          textoDeCarregamento="Carregando os lacres…"
          vazio={{ title: 'Nenhum lacre encontrado', description: 'Nenhum lacre corresponde aos filtros, ou a organização ainda não tem dispositivos cadastrados.' }}
        />
      )}
      {creating && (
        <DeviceFormDialog busy={createBusy} error={createError} returnFocusTo={creating} onCancel={() => setCreating(null)}
          onConfirm={(label, intervalS) => void create(label, intervalS)} />
      )}
      {created && (
        <DeviceKeyReveal deviceCode={created.deviceCode} deviceKey={created.deviceKey} returnFocusTo={created.trigger}
          onDone={() => { setCreated(null); void fetchSeals(true); }} />
      )}
    </div>
  );
}

export function SealListPage(): React.JSX.Element {
  const { service, realtime, organizationId, online } = useSealService();
  const { permissions } = usePermissions();
  return (
    <AccessGate permission="seal.read">
      <SealListView key={organizationId} service={service} organizationId={organizationId} online={online} realtime={realtime}
        canAdmin={permissions?.tenant.includes('seal.admin') ?? false} />
    </AccessGate>
  );
}
