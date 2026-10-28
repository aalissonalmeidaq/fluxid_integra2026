import { createOperationsHandler, type OperationSpec, type OperationsGateway, type Rule } from '../_shared/operations.ts';

export type { OperationsGateway } from '../_shared/operations.ts';

// Consultas do rastreamento (Spec 015, contracts/rastreamento-e-sincronizacao.md): acompanhamento, histórico, ocorrência e regra
// vigente. Sem auditoria de sucesso; negações são auditadas. Permissão (`tracking.read`) e isolamento por organização são conferidos na
// RPC, nunca aqui. Cada história acrescenta as suas operações.
const optionalId: Rule = { t: 'uuid', optional: true };
const instant: Rule = { t: 'text', max: 40, optional: true, pattern: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,6})?)?(Z|[+-]\d{2}:\d{2})$/ };

export const QUERY_TRACKING_OPERATIONS: Record<string, OperationSpec> = {
  // US1: viagens em andamento, mais recentes primeiro, com cursor (started_at, id).
  list_active_trip_tracking: {
    rpc: 'list_active_trip_tracking',
    fields: {
      trip_id: [optionalId, 'p_trip'],
      vehicle_id: [optionalId, 'p_vehicle'],
      driver_id: [optionalId, 'p_driver'],
      cursor_at: [instant, 'p_cursor_at'],
      cursor_id: [optionalId, 'p_cursor_id'],
      limit: [{ t: 'int', min: 1, max: 100, optional: true }, 'p_limit'],
    },
  },
  // US1: uma viagem, com a trilha recente de cada origem.
  get_trip_tracking: { rpc: 'get_trip_tracking', fields: { trip_id: [{ t: 'uuid' }, 'p_trip'] } },
  // US2: regra de proximidade vigente.
  get_proximity_rule: { rpc: 'get_proximity_rule', fields: {} },
  // US2 (painel do motorista): se a pessoa é a motorista da viagem e a sessão de coleta dela. Não exige tracking.read.
  get_driver_tracking_status: { rpc: 'get_driver_tracking_status', fields: { trip_id: [{ t: 'uuid' }, 'p_trip'] } },
  // "Minha viagem": as viagens planejadas ou em andamento da própria pessoa motorista. Exige só o vínculo, não trip.read.
  list_my_driver_trips: { rpc: 'list_my_driver_trips', fields: {} },
  // US4: ocorrência de afastamento com as comparações que a confirmaram (sem coordenadas).
  get_proximity_occurrence: { rpc: 'get_proximity_occurrence', fields: { occurrence_id: [{ t: 'uuid' }, 'p_occurrence'] } },
  // US3: histórico cronológico por viagem ou cilindro, com período obrigatório (até 31 dias, conferido no banco).
  query_tracking_history: {
    rpc: 'query_tracking_history',
    fields: {
      subject: [{ t: 'enum', values: ['trip', 'cylinder'] }, 'p_subject'],
      subject_id: [{ t: 'uuid' }, 'p_subject_id'],
      from: [{ ...instant, optional: false }, 'p_from'],
      to: [{ ...instant, optional: false }, 'p_to'],
      cursor_at: [instant, 'p_cursor_at'],
      cursor_id: [optionalId, 'p_cursor_id'],
      limit: [{ t: 'int', min: 1, max: 200, optional: true }, 'p_limit'],
    },
  },
  // US6: categorias de aviso por e-mail da empresa (notification_category.manage), preferência própria e estado dos avisos de um alerta
  // (seal.read; sem destinatário).
  get_notification_categories: { rpc: 'get_notification_categories', fields: {} },
  get_my_email_preferences: { rpc: 'get_my_email_preferences', fields: {} },
  get_email_deliveries: { rpc: 'get_email_deliveries', fields: { alert_id: [{ t: 'uuid' }, 'p_alert'] } },
};

export function createQueryTrackingHandler(gateway: OperationsGateway, operations: Record<string, OperationSpec> = QUERY_TRACKING_OPERATIONS) {
  return createOperationsHandler(gateway, operations, { prefix: 'tracking' });
}
