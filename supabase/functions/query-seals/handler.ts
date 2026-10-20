import { createOperationsHandler, type OperationSpec, type OperationsGateway, type Rule } from '../_shared/operations.ts';

export type { OperationsGateway } from '../_shared/operations.ts';

// Consultas somente leitura do lacre (Spec 012, contracts/operacoes-servidor.md). Sem auditoria de sucesso; negações são auditadas.
// O isolamento por organização e a permissão `seal.read` são conferidos na RPC, nunca aqui.
const offset: Rule = { t: 'int', min: 0, max: 100000, optional: true };
const HEALTH = ['ok', 'no_gps', 'low_battery', 'no_comm', 'off', 'never_seen'] as const;
const LOCK = ['none', 'locked', 'unlocked', 'unconfirmed', 'locked_violation', 'locked_comm_loss'] as const;
const instant: Rule = { t: 'text', max: 40, nullable: true, optional: true, pattern: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,6})?)?(Z|[+-]\d{2}:\d{2})$/ };

export const QUERY_SEAL_OPERATIONS: Record<string, OperationSpec> = {
  list_seals: {
    rpc: 'list_seals',
    fields: {
      health: [{ t: 'enum', values: HEALTH, nullable: true, optional: true }, 'p_health'],
      lock_state: [{ t: 'enum', values: LOCK, nullable: true, optional: true }, 'p_lock'],
      unbound: [{ t: 'bool', optional: true }, 'p_unbound'],
      offset: [offset, 'p_offset'],
      limit: [{ t: 'int', min: 1, max: 200, optional: true }, 'p_limit'],
      // Spec 013: as linhas de destinações anteriores (devolvidas ou retiradas) só aparecem com o histórico.
      history: [{ t: 'bool', optional: true }, 'p_history'],
    },
  },
  get_seal: { rpc: 'get_seal', fields: { device_id: [{ t: 'uuid' }, 'p_device'] } },
  cylinder_seal_view: { rpc: 'cylinder_seal_view', fields: { cylinder_id: [{ t: 'uuid' }, 'p_cylinder'] } },
  // Geocercas sobre o mapa do lacre: a esperada e as próximas, com "dentro" e distância do banco (geometria só com geofence.read).
  seal_geofence_view: { rpc: 'seal_geofence_view', fields: { device_id: [{ t: 'uuid' }, 'p_device'] } },
  trip_seal_view: { rpc: 'trip_seal_view', fields: { trip_id: [{ t: 'uuid' }, 'p_trip'] } },
  // Histórico de posições (alternativa em texto ao mapa, RF-042): de um cilindro OU de um dispositivo; o banco confere a exclusividade.
  list_positions: {
    rpc: 'list_positions',
    fields: {
      cylinder_id: [{ t: 'uuid', optional: true }, 'p_cylinder'],
      device_id: [{ t: 'uuid', optional: true }, 'p_device'],
      from: [instant, 'p_from'],
      to: [instant, 'p_to'],
      offset: [offset, 'p_offset'],
      limit: [{ t: 'int', min: 1, max: 500, optional: true }, 'p_limit'],
    },
  },
  // US6: lista única de alertas e o detalhe (destino do toque na notificação).
  list_alerts: {
    rpc: 'list_alerts',
    fields: {
      status: [{ t: 'enum', values: ['active', 'open', 'acknowledged', 'closed'], nullable: true, optional: true }, 'p_status'],
      severity: [{ t: 'enum', values: ['medium', 'high', 'critical'], nullable: true, optional: true }, 'p_severity'],
      kind: [{ t: 'text', max: 40, nullable: true, optional: true }, 'p_kind'],
      offset: [offset, 'p_offset'],
      limit: [{ t: 'int', min: 1, max: 200, optional: true }, 'p_limit'],
    },
  },
  get_alert: { rpc: 'get_alert', fields: { alert_id: [{ t: 'uuid' }, 'p_alert'] } },
  // Se o aparelho atual tem inscrição ativa (pelo endereço que o navegador informa).
  push_status: { rpc: 'push_status', fields: { endpoint: [{ t: 'text', max: 1000 }, 'p_endpoint'] } },
  // US2: comandos de um dispositivo com o histórico de estados.
  // US5: lacres que avisaram a ativação e ainda não têm cilindro.
  list_unbound_active_seals: { rpc: 'list_unbound_active_seals', fields: {} },
  list_commands: { rpc: 'list_commands', fields: { device_id: [{ t: 'uuid' }, 'p_device'], limit: [{ t: 'int', min: 1, max: 100, optional: true }, 'p_limit'] } },
};

export function createQuerySealsHandler(gateway: OperationsGateway, operations: Record<string, OperationSpec> = QUERY_SEAL_OPERATIONS) {
  return createOperationsHandler(gateway, operations, { prefix: 'seal' });
}
