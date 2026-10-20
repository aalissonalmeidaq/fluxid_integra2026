import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PlatformSealService, type PlatformOutcome } from '@/application/seals/platform-seal-service';
import {
  ENROLLMENT_REFRESH_MS, failureText, newPendingCodes, type EnrollmentCounts, type EnrollmentPage, type EnrollmentView, type OrganizationRef,
} from '@/application/seals/platform-seal-views';
import { useConnectivity } from '@/app/connectivity-context';
import { useOnlineStatus } from '@/app/use-online-status';
import { Alert, ErrorState } from '@/design-system';
import { ENROLLMENT_STATUSES, type EnrollmentStatus } from '@/domain/seals/seal-enrollment';
import { createPlatformSealTransport } from '@/infrastructure/supabase/platform-seal-adapter';
import { ApproveEnrollmentDialog } from './components/approve-enrollment-dialog';
import { EnrollmentTable, type EnrollmentAction } from './components/enrollment-table';
import { JustificationDialog } from './components/justification-dialog';
import { PortalNetworkPanel } from './components/portal-network-panel';
import { ResolveConflictDialog } from './components/resolve-conflict-dialog';

// Lacres da plataforma (Spec 013, contracts/telas.md; RF-011 a RF-016). O Master vê a fila de pedidos por situação, aprova destinando a
// um tenant, recusa, resolve conflitos, retira de operação e pede o esquecimento das redes, sempre com justificativa. A lista atualiza a
// cada 30 s e anuncia os pedidos novos num único status, sem mover o foco. A decisão final é sempre do servidor.

export type PlatformSealsPort = Pick<PlatformSealService,
  'listEnrollments' | 'listTenants' | 'approve' | 'refuse' | 'resolveConflict' | 'withdraw' | 'requestForgetNetworks' | 'revealPortalPassword'>;

const TABS: { status: EnrollmentStatus; label: string; empty: string }[] = [
  { status: 'pending', label: 'Aguardando', empty: 'Nenhum lacre aguardando vinculação a um tenant' },
  { status: 'approved', label: 'Em operação', empty: 'Nenhum lacre em operação' },
  { status: 'returned', label: 'Devolvidos', empty: 'Nenhum lacre devolvido' },
  { status: 'refused', label: 'Recusados', empty: 'Nenhum pedido recusado' },
  { status: 'expired', label: 'Expirados', empty: 'Nenhum pedido expirado' },
];

type Load = { kind: 'loading' } | { kind: 'ready'; page: EnrollmentPage } | { kind: 'error' };
type Open = { action: EnrollmentAction; enrollment: EnrollmentView; trigger: HTMLElement };

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export interface PlatformSealsViewProps {
  service: PlatformSealsPort | null;
  online: boolean;
  // O bloco da rede de configuração (US4) entra aqui, ao lado da fila.
  portalPanel?: React.ReactNode;
}

export function PlatformSealsView({ service, online, portalPanel }: PlatformSealsViewProps): React.JSX.Element {
  const [tab, setTab] = useState<EnrollmentStatus>('pending');
  const [onlyConflict, setOnlyConflict] = useState(false);
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const [counts, setCounts] = useState<EnrollmentCounts | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [open, setOpen] = useState<Open | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [tenants, setTenants] = useState<OrganizationRef[] | null>(null);
  const previous = useRef<EnrollmentView[] | null>(null);
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const fetchPage = useCallback(async (announce: boolean) => {
    if (!service || !online) return;
    const outcome = await service.listEnrollments({ status: tab, ...(onlyConflict ? { conflict: true } : {}) });
    if (outcome.kind === 'success') {
      const fresh = announce ? newPendingCodes(previous.current, outcome.value.items) : [];
      if (fresh.length > 0) {
        setAnnouncement(`${plural(fresh.length, 'pedido novo', 'pedidos novos')} de lacre aguardando vinculação a um tenant: ${fresh.join(', ')}.`);
      }
      previous.current = outcome.value.items;
      setCounts(outcome.value.counts);
      setLoad({ kind: 'ready', page: outcome.value });
    } else {
      setLoad((current) => (announce && current.kind === 'ready' ? current : { kind: 'error' }));
    }
  }, [service, online, tab, onlyConflict]);

  useEffect(() => {
    previous.current = null;
    void fetchPage(false);
  }, [fetchPage]);
  // Trocar a aba ou o filtro mostra o carregamento até a nova lista chegar.
  const changeTab = (status: EnrollmentStatus) => { if (status !== tab) { setLoad({ kind: 'loading' }); setTab(status); } };
  const changeConflict = (value: boolean) => { setLoad({ kind: 'loading' }); setOnlyConflict(value); };

  useEffect(() => {
    if (!online) return undefined;
    const timer = setInterval(() => void fetchPage(true), ENROLLMENT_REFRESH_MS);
    return () => clearInterval(timer);
  }, [online, fetchPage]);

  const startAction = (action: EnrollmentAction, enrollment: EnrollmentView, trigger: HTMLElement) => {
    setActionError(null);
    setOpen({ action, enrollment, trigger });
    if (action === 'approve' && tenants === null && service) {
      void service.listTenants().then((outcome) => { if (outcome.kind === 'success') setTenants(outcome.value); else setActionError(failureText(outcome.kind)); });
    }
  };

  const finish = async (call: Promise<PlatformOutcome<true>>, message: string) => {
    setBusy(true);
    const outcome = await call;
    setBusy(false);
    if (outcome.kind === 'success') {
      setOpen(null);
      setNotice(message);
      void fetchPage(false);
    } else setActionError(failureText(outcome.kind));
  };

  const onTabKey = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    const delta = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    const target = event.key === 'Home' ? 0 : event.key === 'End' ? TABS.length - 1 : delta ? (index + delta + TABS.length) % TABS.length : -1;
    if (target < 0) return;
    event.preventDefault();
    const next = TABS[target]!;
    changeTab(next.status);
    tabRefs.current[next.status]?.focus();
  };

  const current = TABS.find((item) => item.status === tab)!;
  const panelId = 'painel-lacres-plataforma';
  return (
    <div className="flex w-full min-w-0 flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h2 className="m-0 text-h3 font-semibold text-navy">Lacres da plataforma</h2>
        <p className="m-0 max-w-padrao text-corpo text-grafite">
          Os lacres que chamaram o FluxID pedindo aprovação. Confira o código com o lacre em mãos, destine a um tenant ou recuse. Só o Master
          decide a que tenant um lacre pertence.
        </p>
      </header>
      <p role="status" aria-atomic="true" className="sr-only">{announcement}</p>
      {notice && <Alert variant="sucesso">{notice}</Alert>}
      {portalPanel}
      {!online && <p className="m-0 text-corpo text-grafite">Sem conexão: a fila de pedidos aparece e as decisões voltam a funcionar quando a conexão voltar.</p>}
      {online && (
        <section aria-labelledby="titulo-fila" className="flex flex-col gap-4">
          <h3 id="titulo-fila" className="m-0 text-corpo font-semibold text-navy">Pedidos</h3>
          <div role="tablist" aria-label="Situação dos pedidos" className="flex flex-wrap gap-2 border-b border-borda-suave">
            {TABS.map((item, index) => {
              const selected = item.status === tab;
              return (
                <button key={item.status} type="button" role="tab" id={`aba-${item.status}`} aria-selected={selected} aria-controls={panelId}
                  tabIndex={selected ? 0 : -1} ref={(element) => { tabRefs.current[item.status] = element; }}
                  onClick={() => changeTab(item.status)} onKeyDown={(event) => onTabKey(event, index)}
                  className={`-mb-px flex min-h-alvo items-center gap-2 border-b-4 px-4 text-corpo font-semibold ${selected ? 'border-azul-royal text-navy' : 'border-transparent text-texto-secundario'}`}>
                  <span>{item.label}</span>
                  <span className="rounded-controle bg-cinza-gelo px-2 text-legenda text-grafite">{counts?.[item.status] ?? 0}</span>
                </button>
              );
            })}
          </div>
          <div id={panelId} role="tabpanel" aria-labelledby={`aba-${tab}`} className="flex flex-col gap-4">
            <label className="flex min-h-alvo items-center gap-2 self-start text-corpo text-grafite">
              <input type="checkbox" className="size-6" checked={onlyConflict} onChange={(event) => changeConflict(event.target.checked)} />
              Só com conflito
            </label>
            {load.kind === 'ready' && load.page.rateLimitedLast24h > 0 && (
              <p className="m-0 text-legenda text-texto-secundario">
                {plural(load.page.rateLimitedLast24h, 'pedido novo descartado', 'pedidos novos descartados')} pelo limite nas últimas 24 horas.
              </p>
            )}
            {load.kind === 'error'
              ? <ErrorState title="Não foi possível carregar os pedidos" message="Tente de novo em instantes." onRetry={() => { setLoad({ kind: 'loading' }); void fetchPage(false); }} />
              : <EnrollmentTable items={load.kind === 'ready' ? load.page.items : []} loading={load.kind === 'loading'} emptyTitle={current.empty}
                  online={online} onAction={startAction} />}
          </div>
        </section>
      )}

      {open?.action === 'approve' && service && (
        <ApproveEnrollmentDialog enrollment={open.enrollment} tenants={tenants} busy={busy} error={actionError} returnFocusTo={open.trigger}
          onCancel={() => setOpen(null)}
          onConfirm={(organizationId, justification) => void finish(service.approve(open.enrollment, organizationId, justification),
            `Lacre ${open.enrollment.deviceCode} aprovado para ${tenants?.find((t) => t.id === organizationId)?.name ?? 'o tenant escolhido'}.`)} />
      )}
      {open?.action === 'refuse' && service && (
        <JustificationDialog title={`Recusar o pedido · ${open.enrollment.deviceCode}`} confirmLabel="Recusar o pedido" danger
          description={<p className="m-0">O lacre passa a receber "recusado" e só tenta de novo de hora em hora. Você pode reconsiderar depois.</p>}
          busy={busy} error={actionError} returnFocusTo={open.trigger} onCancel={() => setOpen(null)}
          onConfirm={(justification) => void finish(service.refuse(open.enrollment, justification), `Pedido do lacre ${open.enrollment.deviceCode} recusado.`)} />
      )}
      {open?.action === 'withdraw' && service && (
        <JustificationDialog title={`Retirar de operação · ${open.enrollment.deviceCode}`} confirmLabel="Retirar de operação" danger
          description={<p className="m-0">O vínculo com o cilindro é encerrado, os comandos pendentes são cancelados, os alertas abertos fecham e o
            tenant deixa de receber o lacre. Lacre com cilindro em viagem em andamento não pode ser retirado.</p>}
          choice={{ legend: 'Redes Wi-Fi do lacre', initial: 'extras' as const, options: [
            { value: 'extras' as const, label: 'Manter a rede principal (aprovar de novo no mesmo tenant)', help: 'O lacre esquece só as redes extras e continua chamando pela rede do local.' },
            { value: 'all' as const, label: 'Esquecer todas as redes (destinar a outro tenant)', help: 'O lacre apaga as redes do tenant e volta ao portal até alguém configurar a rede do novo local.' },
          ] }}
          busy={busy} error={actionError} returnFocusTo={open.trigger} onCancel={() => setOpen(null)}
          onConfirm={(justification, choice) => void finish(service.withdraw(open.enrollment, choice ?? 'extras', justification),
            `Lacre ${open.enrollment.deviceCode} retirado de operação.`)} />
      )}
      {open?.action === 'resolve' && service && (
        <ResolveConflictDialog enrollment={open.enrollment} busy={busy} error={actionError} returnFocusTo={open.trigger} onCancel={() => setOpen(null)}
          onConfirm={(keepCurrent, justification) => void finish(service.resolveConflict(open.enrollment, keepCurrent, justification),
            `Conflito do lacre ${open.enrollment.deviceCode} resolvido.`)} />
      )}
      {open?.action === 'forget' && service && (
        <JustificationDialog title={`Esquecer todas as redes · ${open.enrollment.deviceCode}`} confirmLabel="Pedir o esquecimento"
          description={<p className="m-0">O lacre apaga as redes Wi-Fi do tenant {open.enrollment.lastOrganization?.name ?? 'anterior'} na próxima chamada.
            Sem rede configurada no novo local, ele volta ao portal. Depois da confirmação dele, você pode destiná-lo a outro tenant.</p>}
          busy={busy} error={actionError} returnFocusTo={open.trigger} onCancel={() => setOpen(null)}
          onConfirm={(justification) => void finish(service.requestForgetNetworks(open.enrollment, justification),
            `Pedido de esquecimento das redes enviado ao lacre ${open.enrollment.deviceCode}.`)} />
      )}
    </div>
  );
}

export function PlatformSealsPage(): React.JSX.Element {
  const { client, config, result } = useConnectivity();
  const online = useOnlineStatus();
  const endpoint = config?.endpoints.find((candidate) => candidate.kind === result.selectedEndpoint);
  const service = useMemo(() => (endpoint && client ? new PlatformSealService(createPlatformSealTransport(endpoint, client), () => navigator.onLine !== false) : null),
    [client, endpoint]);
  return (
    <PlatformSealsView service={service} online={online}
      portalPanel={service ? <PortalNetworkPanel reveal={(justification) => service.revealPortalPassword(justification)} online={online} /> : null} />
  );
}

export { ENROLLMENT_STATUSES };
