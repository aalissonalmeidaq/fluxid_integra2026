import React from 'react';
import { approvalCandidate, type EnrollmentView } from '@/application/seals/platform-seal-views';
import { Button, DataTable, type ColunaDaTabela } from '@/design-system';
import { formatDateTime } from '@/domain/cylinders/format';
import { CONFLICT_PRESENTATION, approvalBlock, enrollmentStatus } from '@/domain/seals/seal-enrollment';
import { SealBadge } from '@/pages/seals/components/seal-badge';

// Tabela da fila de pedidos (Spec 013, contracts/telas.md). Vira cartões abaixo de 768 px pelo próprio DataTable. Situação e conflito
// sempre com ícone e texto; o sinal em texto; as ações dependem da situação, e o que impede uma ação aparece em texto.

export type EnrollmentAction = 'approve' | 'refuse' | 'reopen' | 'resolve' | 'withdraw' | 'forget';

export interface EnrollmentTableProps {
  items: readonly EnrollmentView[];
  loading: boolean;
  emptyTitle: string;
  online: boolean;
  onAction: (action: EnrollmentAction, enrollment: EnrollmentView, trigger: HTMLElement) => void;
}

const SIGNAL = { forte: 'Forte', médio: 'Médio', fraco: 'Fraco' } as const;
const approveLabel = (item: EnrollmentView) => (item.status === 'returned' ? 'Destinar de novo' : 'Aprovar');
// Ainda há redes do tenant anterior e nenhum pedido de esquecimento aberto (RN-006).
const canForget = (item: EnrollmentView) => item.status !== 'approved' && !item.networksCleared && item.forgetNetworks === null;

function Actions({ item, online, onAction }: { item: EnrollmentView; online: boolean; onAction: EnrollmentTableProps['onAction'] }): React.JSX.Element | null {
  const act = (action: EnrollmentAction) => (event: React.MouseEvent<HTMLButtonElement>) => onAction(action, item, event.currentTarget);
  const label = `${item.deviceCode}`;
  const conflictBlock = item.conflict && item.status !== 'approved' ? approvalBlock({ ...approvalCandidate(item), lastOrganizationId: null }, '') : null;
  const buttons: React.ReactNode[] = [];
  if (item.status === 'pending' || item.status === 'returned') {
    buttons.push(<Button key="approve" disabled={!online || item.conflict} aria-label={`${approveLabel(item)} ${label}`} onClick={act('approve')}>{approveLabel(item)}</Button>);
  }
  if (item.status === 'pending') buttons.push(<Button key="refuse" variant="secundario" disabled={!online} aria-label={`Recusar ${label}`} onClick={act('refuse')}>Recusar</Button>);
  if (item.status === 'refused') buttons.push(<Button key="reopen" disabled={!online} aria-label={`Retornar para aguardando ${label}`} onClick={act('reopen')}>Retornar para aguardando</Button>);
  if (item.status === 'approved') buttons.push(<Button key="withdraw" variant="perigoso" disabled={!online} aria-label={`Retirar de operação ${label}`} onClick={act('withdraw')}>Retirar de operação</Button>);
  if (item.conflict) buttons.push(<Button key="resolve" variant="secundario" disabled={!online} aria-label={`Resolver conflito ${label}`} onClick={act('resolve')}>Resolver conflito</Button>);
  if (canForget(item)) buttons.push(<Button key="forget" variant="secundario" disabled={!online} aria-label={`Esquecer todas as redes ${label}`} onClick={act('forget')}>Esquecer todas as redes</Button>);
  if (buttons.length === 0 && !conflictBlock) return null;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">{buttons}</div>
      {conflictBlock && <p className="m-0 text-legenda text-texto-secundario">{conflictBlock}</p>}
    </div>
  );
}

export function EnrollmentTable({ items, loading, emptyTitle, online, onAction }: EnrollmentTableProps): React.JSX.Element {
  const columns: ColunaDaTabela<EnrollmentView>[] = [
    { id: 'codigo', cabecalho: 'Código', cabecalhoDaLinha: true, celula: (item) => (
      <span className="flex flex-col">
        <span>{item.deviceCode}</span>
        {item.firmwareVersion && <span className="text-legenda font-normal text-texto-secundario">Firmware {item.firmwareVersion}</span>}
      </span>
    ) },
    { id: 'situacao', cabecalho: 'Situação', celula: (item) => (
      <div className="flex flex-col items-start gap-1">
        <SealBadge presentation={enrollmentStatus(item.status)} />
        {item.conflict && <SealBadge presentation={CONFLICT_PRESENTATION} />}
        {item.forgetNetworks && <span className="text-legenda text-texto-secundario">Aguardando o lacre esquecer as redes</span>}
        {item.origin === 'manual' && <span className="text-legenda text-texto-secundario">Cadastro manual (Spec 012)</span>}
      </div>
    ) },
    { id: 'tenant', cabecalho: 'Empresa', celula: (item) => item.organization?.name
      ?? (item.lastOrganization ? <span className="text-texto-secundario">Último: {item.lastOrganization.name}</span> : '—') },
    { id: 'chamadas', cabecalho: 'Chamadas', celula: (item) => (
      <span className="flex flex-col">
        <span>{item.calls} {item.calls === 1 ? 'chamada' : 'chamadas'}</span>
        <span className="text-legenda text-texto-secundario">Primeira: {formatDateTime(item.firstSeenAt)}</span>
        <span className="text-legenda text-texto-secundario">Última: {formatDateTime(item.lastSeenAt)}</span>
      </span>
    ) },
    { id: 'rede', cabecalho: 'Rede e sinal', celula: (item) => (
      <span className="flex flex-col">
        <span>{item.wifiSsid ?? '—'}</span>
        <span className="text-legenda text-texto-secundario">{item.signal ? `Sinal ${SIGNAL[item.signal].toLowerCase()} (${item.signalDbm} dBm)` : 'Sinal não informado'}</span>
      </span>
    ) },
    { id: 'acoes', cabecalho: 'Ações', celula: (item) => <Actions item={item} online={online} onAction={onAction} /> },
  ];
  return (
    <DataTable
      legenda="Pedidos de aprovação de lacres"
      colunas={columns}
      linhas={items}
      chaveDaLinha={(item) => item.id}
      carregando={loading}
      textoDeCarregamento="Carregando os pedidos…"
      vazio={{ title: emptyTitle, description: 'Quando um lacre chamar o FluxID nesta situação, ele aparece aqui.' }}
    />
  );
}
