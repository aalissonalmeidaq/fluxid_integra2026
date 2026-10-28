import { createOperationsHandler, type OperationSpec, type OperationsGateway, type Rule } from '../_shared/operations.ts';

export type { OperationsGateway } from '../_shared/operations.ts';

// Comandos do rastreamento (Spec 015, contracts/rastreamento-e-sincronizacao.md): sessão de coleta, ingestão de posições, regra de
// proximidade e tratamento de ocorrências. Todos têm `request_id` (idempotência) e são auditados na transação da RPC. Não existe
// exclusão: operação desconhecida é recusada e auditada como negada. Posições passam por aqui, então nada de corpo ou resposta é
// registrado. Cada história acrescenta as suas operações.
const requestId: [Rule, string] = [{ t: 'uuid' }, 'p_request'];
const trackingSession: [Rule, string] = [{ t: 'uuid' }, 'p_tracking_session'];
const CAPABILITIES = ['full', 'foreground_only', 'denied', 'unavailable'] as const;
const EMAIL_CATEGORIES: Rule = { t: 'text-list', maxItems: 3, maxLength: 40 };
const instant: Rule = { t: 'text', max: 40, pattern: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,6})?)?(Z|[+-]\d{2}:\d{2})$/ };

export const MANAGE_TRACKING_OPERATIONS: Record<string, OperationSpec> = {
  // US2: o motorista abre a coleta da viagem em andamento neste aparelho.
  start_tracking_session: {
    rpc: 'start_tracking_session', action: 'tracking.session_start',
    fields: {
      request_id: requestId,
      trip_id: [{ t: 'uuid' }, 'p_trip'],
      device_installation_id: [{ t: 'uuid' }, 'p_installation'],
      platform: [{ t: 'enum', values: ['android_native', 'web_visible'] }, 'p_platform'],
      capability: [{ t: 'enum', values: CAPABILITIES }, 'p_capability'],
      notifications_denied: [{ t: 'bool', optional: true }, 'p_notifications_denied'],
    },
  },
  // US2: capacidade de coleta informada pelo aparelho (negada, só com a tela visível, notificação recusada).
  report_tracking_capability: {
    rpc: 'report_tracking_capability', action: 'tracking.capability',
    fields: {
      request_id: requestId,
      tracking_session_id: trackingSession,
      capability: [{ t: 'enum', values: CAPABILITIES }, 'p_capability'],
      notifications_denied: [{ t: 'bool' }, 'p_notifications_denied'],
    },
  },
  end_tracking_session: {
    rpc: 'end_tracking_session', action: 'tracking.session_end',
    fields: { request_id: requestId, tracking_session_id: trackingSession, reason: [{ t: 'enum', values: ['completed', 'cancelled'] }, 'p_reason'] },
  },
  // US2: lote de 1 a 100 posições, na ordem. A borda confere só o formato; faixas, horário e contexto são decididos item a item no banco.
  ingest_driver_positions: {
    rpc: 'ingest_driver_positions', action: 'tracking.ingest',
    fields: {
      request_id: requestId,
      tracking_session_id: trackingSession,
      device_installation_id: [{ t: 'uuid' }, 'p_installation'],
      positions: [{
        t: 'objects', minItems: 1, maxItems: 100,
        fields: {
          client_position_id: { t: 'uuid' },
          sequence_no: { t: 'int', min: 0 },
          observed_at: instant,
          latitude: { t: 'number' },
          longitude: { t: 'number' },
          accuracy_m: { t: 'number', min: 0, nullable: true, optional: true },
        },
      }, 'p_positions'],
    },
  },
  // US2 (RF-009a): alterar a regra exige justificativa; faixas e permissão são conferidas no banco.
  set_proximity_rule: {
    rpc: 'set_proximity_rule', action: 'tracking.rule_update',
    fields: {
      request_id: requestId,
      distance_m: [{ t: 'int', min: 1, max: 10000 }, 'p_distance'],
      max_age_s: [{ t: 'int', min: 1, max: 10000 }, 'p_max_age'],
      max_accuracy_m: [{ t: 'int', min: 1, max: 10000 }, 'p_max_accuracy'],
      justification: [{ t: 'text', max: 500 }, 'p_justification'],
    },
  },
  // US4: reconhecer e encerrar a ocorrência de afastamento (permissão de operar alertas, versão e nota de 5 a 500 conferidas no banco).
  acknowledge_proximity_occurrence: {
    rpc: 'acknowledge_proximity_occurrence', action: 'tracking.occurrence_acknowledge',
    fields: { request_id: requestId, occurrence_id: [{ t: 'uuid' }, 'p_occurrence'], version: [{ t: 'int', min: 1 }, 'p_version'] },
  },
  close_proximity_occurrence: {
    rpc: 'close_proximity_occurrence', action: 'tracking.occurrence_close',
    fields: {
      request_id: requestId, occurrence_id: [{ t: 'uuid' }, 'p_occurrence'], version: [{ t: 'int', min: 1 }, 'p_version'],
      note: [{ t: 'text', max: 500 }, 'p_note'],
    },
  },
  // US6: liberar categorias de aviso por e-mail (versão otimista) e escolher as próprias; categorias e permissão conferidas no banco.
  set_notification_categories: {
    rpc: 'set_notification_categories', action: 'notification.categories_update',
    fields: { request_id: requestId, categories: [EMAIL_CATEGORIES, 'p_categories'], version: [{ t: 'int', min: 0 }, 'p_version'] },
  },
  set_my_email_preferences: {
    rpc: 'set_my_email_preferences', action: 'notification.preferences_update',
    fields: { request_id: requestId, categories: [EMAIL_CATEGORIES, 'p_categories'] },
  },
};

export function createManageTrackingHandler(gateway: OperationsGateway, operations: Record<string, OperationSpec> = MANAGE_TRACKING_OPERATIONS) {
  return createOperationsHandler(gateway, operations, { prefix: 'tracking' });
}
