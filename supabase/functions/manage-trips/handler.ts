import { createOperationsHandler, type OperationSpec, type OperationsGateway, type Rule } from '../_shared/operations.ts';

export type { OperationsGateway } from '../_shared/operations.ts';

// Comandos das viagens da Fase 4 (contracts/operacoes-servidor.md): sempre auditados e atômicos no banco, todos com `request_id`
// (idempotência). NÃO existe operação de exclusão (RF-033): qualquer operação desconhecida é recusada e auditada como negada.
// A borda valida o formato; as regras (reserva, elegibilidade, transições, permissões) são do banco.
const notes: Rule = { t: 'text', max: 500, nullable: true, optional: true };
const requestId: [Rule, string] = [{ t: 'uuid' }, 'p_request'];
const version: [Rule, string] = [{ t: 'int', min: 1 }, 'p_expected_version'];

// Paradas na ordem desejada: `id` quando a parada já existe (edição), a unidade e os cilindros.
const stops: Rule = {
  t: 'objects', minItems: 1, maxItems: 30,
  fields: {
    id: { t: 'uuid', optional: true },
    site_id: { t: 'uuid' },
    cylinder_ids: { t: 'uuid-list', minItems: 1, maxItems: 200 },
  },
};

// A justificativa vazia chega ao banco, que responde JUSTIFICATION_REQUIRED (5 a 500 caracteres).
const justification: Rule = { t: 'text', max: 500, nullable: true, optional: true };
// Método de leitura da conferência e da entrega (Spec 009, RF-001): o mesmo conjunto da restrição `trip_items_source_check` do banco,
// que tests/contract/manage-trips-handler.test.ts confere contra o domínio. Declarado pelo cliente; o banco só valida o valor.
export const READING_SOURCES = ['manual', 'typed', 'camera', 'nfc'] as const;
const source: Rule = { t: 'enum', values: READING_SOURCES, optional: true };
// Posição lida pelo aparelho (Spec 009, RF-009 a RF-014), sempre opcional: coordenadas em par, precisão em metros, origem e horário da
// leitura. O banco repete as regras (par, intervalo, origem coerente com o dado, leitura sem futuro e com até 10 minutos).
const coordinate = (limit: number): Rule => ({ t: 'number', min: -limit, max: limit, nullable: true, optional: true });
const accuracy: Rule = { t: 'number', min: 0, max: 100000, nullable: true, optional: true };
const positionSource = (values: readonly string[]): Rule => ({ t: 'enum', values, nullable: true, optional: true });
const tripAndVersion = (): Record<string, [Rule, string]> => ({ trip_id: [{ t: 'uuid' }, 'p_trip'], expected_version: version });
const tripAndItem = (): Record<string, [Rule, string]> => ({ trip_id: [{ t: 'uuid' }, 'p_trip'], item_id: [{ t: 'uuid' }, 'p_item'] });

// Instante ISO 8601 com fuso (o aparelho manda o horário informado convertido para UTC).
const instant: Rule = { t: 'text', max: 40, pattern: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,6})?)?(Z|[+-]\d{2}:\d{2})$/ };
// Resultado de cada cilindro da parada: entregue ou não, com o motivo quando não foi (o banco exige o motivo e o tamanho).
const results: Rule = {
  t: 'objects', maxItems: 200,
  fields: { item_id: { t: 'uuid' }, delivered: { t: 'bool' }, reason: { t: 'text', max: 500, nullable: true, optional: true }, source },
};

const planFields = (): Record<string, [Rule, string]> => ({
  planned_date: [{ t: 'date' }, 'p_planned_date'],
  vehicle_id: [{ t: 'uuid' }, 'p_vehicle'],
  driver_id: [{ t: 'uuid' }, 'p_driver'],
  notes: [notes, 'p_notes'],
  stops: [stops, 'p_stops'],
});

export const MANAGE_OPERATIONS: Record<string, OperationSpec> = {
  create_trip: { rpc: 'create_trip', action: 'trip.create', fields: { request_id: requestId, ...planFields() } },
  update_trip: {
    rpc: 'update_trip', action: 'trip.update',
    fields: { request_id: requestId, trip_id: [{ t: 'uuid' }, 'p_trip'], expected_version: version, ...planFields() },
  },
  // Carregamento e início (US2): conferência manual, retirada com exceção e início com revalidação.
  start_loading: { rpc: 'start_loading', action: 'trip.start_loading', fields: { request_id: requestId, ...tripAndVersion() } },
  revert_loading: { rpc: 'revert_loading', action: 'trip.revert_loading', fields: { request_id: requestId, ...tripAndVersion() } },
  check_item: { rpc: 'check_item', action: 'trip.check_item', fields: { request_id: requestId, ...tripAndItem(), source: [source, 'p_source'] }, queuedAt: { forward: false, operation: 'check_item' } },
  uncheck_item: { rpc: 'uncheck_item', action: 'trip.uncheck_item', fields: { request_id: requestId, ...tripAndItem() }, queuedAt: { forward: false, operation: 'uncheck_item' } },
  remove_item: { rpc: 'remove_item', action: 'trip.remove_item', fields: { request_id: requestId, ...tripAndItem(), justification: [justification, 'p_justification'] } },
  start_trip: { rpc: 'start_trip', action: 'trip.start', fields: { request_id: requestId, ...tripAndVersion() } },
  // Encerramento (US5): concluir, cancelar (a exceção em andamento é conferida pelo banco) e devolver ao estoque.
  complete_trip: { rpc: 'complete_trip', action: 'trip.complete', fields: { request_id: requestId, ...tripAndVersion() } },
  cancel_trip: { rpc: 'cancel_trip', action: 'trip.cancel', fields: { request_id: requestId, ...tripAndVersion(), justification: [justification, 'p_justification'] } },
  return_item: { rpc: 'return_item', action: 'trip.return_item', fields: { request_id: requestId, ...tripAndItem(), justification: [justification, 'p_justification'] } },
  // Desbloqueio como ato independente (US4). Desde a Spec 013 (RF-021) o desbloqueio excepcional não exige segundo fator.
  register_unlock: { rpc: 'register_unlock', action: 'trip.unlock', fields: { request_id: requestId, ...tripAndItem(), justification: [justification, 'p_justification'] } },
  // Spec 010: decisão sobre uma operação de campo recusada pelo servidor (descartar com justificativa, ou reenviar). A justificativa de 5 a 500 caracteres e a
  // permissão `trip.operate` são conferidas pelo banco; a decisão não é uma operação da fila e não grava a trilha pela borda.
  resolve_sync_conflict: {
    rpc: 'resolve_sync_conflict', action: 'trip.sync_conflict_resolve',
    fields: {
      request_id: requestId, trip_id: [{ t: 'uuid' }, 'p_trip'], source_request_id: [{ t: 'uuid' }, 'p_source_request'],
      decision: [{ t: 'enum', values: ['discard', 'resubmit'] }, 'p_decision'], justification: [justification, 'p_justification'],
    },
  },
  // Chegada e entrega por parada (US3). O nome do recebedor nunca é registrado nem devolvido por esta borda.
  arrive_stop: {
    rpc: 'arrive_stop', action: 'trip.arrive_stop', queuedAt: { forward: true, operation: 'arrive_stop' },
    fields: {
      request_id: requestId, trip_id: [{ t: 'uuid' }, 'p_trip'], stop_id: [{ t: 'uuid' }, 'p_stop'], arrived_at: [{ ...instant, nullable: true, optional: true }, 'p_arrived_at'],
      latitude: [coordinate(90), 'p_latitude'], longitude: [coordinate(180), 'p_longitude'], accuracy_m: [accuracy, 'p_accuracy_m'],
      position_source: [positionSource(['gps', 'typed']), 'p_position_source'], position_read_at: [{ ...instant, nullable: true, optional: true }, 'p_position_read_at'],
    },
  },
  register_delivery: {
    rpc: 'register_delivery', action: 'trip.deliver', queuedAt: { forward: true, operation: 'register_delivery' },
    fields: {
      request_id: requestId, trip_id: [{ t: 'uuid' }, 'p_trip'], stop_id: [{ t: 'uuid' }, 'p_stop'], delivered_at: [instant, 'p_delivered_at'],
      recipient_name: [{ t: 'text', max: 120 }, 'p_recipient_name'], recipient_role: [{ t: 'text', max: 80, nullable: true, optional: true }, 'p_recipient_role'],
      latitude: [{ t: 'number', min: -90, max: 90, nullable: true, optional: true }, 'p_latitude'], longitude: [{ t: 'number', min: -180, max: 180, nullable: true, optional: true }, 'p_longitude'],
      at_site_address: [{ t: 'bool', optional: true }, 'p_at_site_address'], results: [results, 'p_results'],
      accuracy_m: [accuracy, 'p_accuracy_m'], position_source: [positionSource(['gps', 'typed', 'site_address']), 'p_position_source'],
      position_read_at: [{ ...instant, nullable: true, optional: true }, 'p_position_read_at'],
      supersedes_id: [{ t: 'uuid', optional: true }, 'p_supersedes'],
      correction_reason: [{ t: 'text', max: 4000, nullable: true, optional: true }, 'p_correction_reason'],
    },
    // RF-015: a correção exige a justificativa de 5 a 500 caracteres (depois de juntar os espaços) e a original não a aceita.
    // RF-013: a posição é por coordenadas ou no endereço da unidade, nunca as duas. O banco repete as duas regras.
    crossCheck: (args) => {
      const issues: { field: string; message: string }[] = [];
      const reason = typeof args.p_correction_reason === 'string' ? args.p_correction_reason.replace(/\s+/g, ' ').trim() : '';
      if (args.p_supersedes) {
        if (reason.length < 5 || reason.length > 500) issues.push({ field: 'correction_reason', message: 'Explique por que corrige a entrega, em 5 a 500 caracteres.' });
      } else if (reason !== '') {
        issues.push({ field: 'correction_reason', message: 'A justificativa só vale na correção de uma entrega.' });
      }
      if (args.p_at_site_address === true && (args.p_latitude != null || args.p_longitude != null)) {
        issues.push({ field: 'at_site_address', message: 'Escolha só uma forma de informar a posição: as coordenadas ou no endereço da unidade.' });
      }
      return issues;
    },
  },
};

export function createManageTripsHandler(gateway: OperationsGateway) {
  return createOperationsHandler(gateway, MANAGE_OPERATIONS, { prefix: 'trip' });
}
