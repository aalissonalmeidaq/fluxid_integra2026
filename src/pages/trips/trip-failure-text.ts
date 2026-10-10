import type { TripFailure } from '@/application/trips/trip-service';
import { CYLINDER_REFUSAL_LABELS, ITEM_STATUS_LABELS, TRIP_STATUS_LABELS, type CylinderRefusalReason, type ItemStatus, type TripStatus } from '@/domain/trips/trip-vocabulary';

// Texto das falhas das ações sobre uma viagem existente (conferir, retirar, iniciar, entregar, desbloquear, encerrar), em português
// claro e sem culpar a pessoa. `serialOf` traduz o id de um cilindro no número de série mostrado na tela.
export interface ActionFailureText {
  title?: string;
  message: string;
  // Nível: `info` quando a causa é a conexão; `error` nos demais casos.
  tone: 'info' | 'error';
  // Itens ou paradas que impedem a ação, para a tela destacar.
  itemIds?: string[];
  stopIds?: string[];
  // Viagem que causou o conflito.
  tripLink?: { id: string; number: number };
}

const ENTITY_LABELS: Record<string, string> = { vehicle: 'O veículo', driver: 'O motorista', site: 'Uma unidade da viagem', customer: 'O cliente de uma unidade' };

const statusLabel = (value: string | undefined): string => {
  if (value && value in TRIP_STATUS_LABELS) return TRIP_STATUS_LABELS[value as TripStatus].toLowerCase();
  if (value && value in ITEM_STATUS_LABELS) return ITEM_STATUS_LABELS[value as ItemStatus].toLowerCase();
  return value ?? 'outra situação';
};

export function describeActionFailure(failure: TripFailure, serialOf: (id: string | undefined) => string = () => 'O cilindro'): ActionFailureText {
  switch (failure.kind) {
    case 'offline':
      return { tone: 'info', message: 'Sem conexão. Esta operação exige conexão e nada é guardado neste aparelho.' };
    case 'session_expired':
      return { tone: 'error', title: 'Sessão expirada', message: 'Sua sessão expirou e nada foi gravado. Entre de novo para continuar.' };
    case 'mfa_required':
      return { tone: 'error', title: 'Segundo fator necessário', message: 'O desbloqueio excepcional exige a verificação em duas etapas. Conclua a verificação e tente de novo.' };
    case 'access_denied':
      return { tone: 'error', message: 'Você não tem permissão para esta ação.' };
    case 'not_found':
      return { tone: 'error', message: 'Viagem ou cilindro não encontrado. Recarregue a tela.' };
    case 'version_conflict':
      return { tone: 'error', title: 'Viagem alterada', message: 'Esta viagem foi alterada por outra pessoa depois que você abriu a tela. Os dados foram recarregados: confira e tente de novo.' };
    case 'invalid_transition':
      return { tone: 'error', title: 'Ação indisponível agora', message: `Esta ação não vale a partir de “${statusLabel(failure.from)}”. Os dados foram recarregados.` };
    case 'trip_closed':
      return { tone: 'error', message: 'Esta viagem já foi encerrada e não aceita mais a operação.' };
    case 'stop_closed':
      return { tone: 'error', message: 'Esta parada já foi encerrada. Para corrigir, registre uma correção da entrega.' };
    case 'justification_required':
      return { tone: 'error', message: 'Explique o motivo em 5 a 500 caracteres.' };
    case 'items_pending':
      return { tone: 'error', title: 'Falta conferir cilindros', message: `Ainda faltam ${failure.itemIds?.length ?? ''} cilindros para conferir antes de iniciar a viagem.`.replace('  ', ' '), ...(failure.itemIds ? { itemIds: failure.itemIds } : {}) };
    case 'stops_open':
      return { tone: 'error', title: 'Paradas em aberto', message: 'Ainda há parada sem entrega ou divergência registrada. Registre todas antes de concluir.', ...(failure.stopIds ? { stopIds: failure.stopIds } : {}) };
    case 'driver_license_expired':
      return { tone: 'error', title: 'CNH vencida', message: 'A CNH do motorista venceu: a viagem só pode iniciar com a CNH válida. Troque o motorista na edição da viagem.' };
    case 'cylinder_not_eligible':
      return {
        tone: 'error', title: 'Cilindro não pode seguir',
        message: `${serialOf(failure.cylinderId)}: ${failure.reason ? CYLINDER_REFUSAL_LABELS[failure.reason as CylinderRefusalReason] ?? 'não elegível' : 'não elegível'}. Retire-o da viagem para continuar.`,
      };
    case 'capacity_exceeded':
      return { tone: 'error', title: 'Acima da capacidade', message: `O veículo comporta ${failure.capacity ?? ''} cilindros e a viagem tem ${failure.requested ?? ''}.` };
    case 'parent_inactive':
      return { tone: 'error', title: 'Cadastro indisponível', message: `${ENTITY_LABELS[failure.entity ?? ''] ?? 'Um cadastro'} da viagem está inativo ou indisponível. Resolva o cadastro ou troque-o na edição da viagem.` };
    case 'resource_busy':
      return {
        tone: 'error', title: 'Em outra viagem',
        message: `${failure.entity === 'driver' ? 'O motorista' : 'O veículo'} já está na viagem n.º ${failure.trip?.number ?? ''}, em carregamento ou em andamento.`,
        ...(failure.trip ? { tripLink: failure.trip } : {}),
      };
    case 'request_reused':
      return { tone: 'error', message: 'Este pedido já foi usado por outra operação. Recarregue a tela e tente de novo.' };
    case 'invalid':
      return { tone: 'error', message: 'Revise os dados informados e tente de novo.' };
    default:
      return { tone: 'error', title: 'Resultado desconhecido', message: 'Não foi possível confirmar se a operação foi concluída. Recarregue a viagem antes de tentar de novo; reenviar o mesmo pedido não duplica nada.' };
  }
}
