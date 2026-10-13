// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  CONNECTION_REQUIRED_REASON, connectionRequired, dependenciesFor, isOfflineOperation, isStaleOperation, OFFLINE_OPERATIONS, offlinePermission, STALE_OPERATION_DAYS,
  type QueuedRef,
} from './offline-queue-rules';

const queued = (over: Partial<QueuedRef>): QueuedRef => ({ id: 'q', operation: 'trip.check_item', tripId: 'T1', status: 'pending', ...over });

// RF-001 e RF-003: só estas quatro operações entram na fila; o resto exige conexão.
describe('operações offline-safe', () => {
  it('são exatamente as quatro da fila', () => {
    expect([...OFFLINE_OPERATIONS]).toEqual(['trip.check_item', 'trip.uncheck_item', 'trip.arrive_stop', 'trip.deliver']);
  });
  it('isOfflineOperation reconhece só elas', () => {
    expect(OFFLINE_OPERATIONS.every((operation) => isOfflineOperation(operation))).toBe(true);
    for (const outro of ['trip.create', 'trip.start_trip', 'trip.cancel', 'trip.complete', 'trip.unlock', 'trip.return', 'trip.correct_delivery', 'sync.anything', '']) {
      expect(isOfflineOperation(outro)).toBe(false);
    }
  });
  it('a permissão das quatro é trip.operate (trip.deliver é só o nome da operação na auditoria)', () => {
    for (const operation of OFFLINE_OPERATIONS) expect(offlinePermission(operation), operation).toBe('trip.operate');
  });
});

describe('ações que exigem conexão', () => {
  it('planejar, iniciar, cancelar, concluir, desbloquear, devolver, corrigir entrega e consulta geral de cilindros', () => {
    for (const action of ['plan_trip', 'update_trip', 'start_loading', 'revert_loading', 'start_trip', 'cancel_trip', 'complete_trip', 'unlock_item', 'return_item', 'correct_delivery', 'query_cylinders']) {
      expect(connectionRequired(action), action).toBe(true);
    }
  });
  it('as operações da fila não exigem conexão', () => {
    for (const operation of OFFLINE_OPERATIONS) expect(connectionRequired(operation), operation).toBe(false);
  });
  it('o motivo é o texto da tela', () => {
    expect(CONNECTION_REQUIRED_REASON).toBe('Exige conexão');
  });
});

// RF-014: janela de 7 dias do horário informado de origem offline.
describe('janela de 7 dias', () => {
  const now = new Date('2026-10-12T12:00:00Z');
  it('a janela é de 7 dias', () => expect(STALE_OPERATION_DAYS).toBe(7));
  it('6 dias e 23 horas ainda vale; 7 dias e 1 minuto é conflito', () => {
    expect(isStaleOperation(new Date('2026-10-05T12:01:00Z'), now)).toBe(false);
    expect(isStaleOperation(new Date('2026-10-05T11:59:00Z'), now)).toBe(true);
  });
  it('exatamente 7 dias ainda vale', () => expect(isStaleOperation(new Date('2026-10-05T12:00:00Z'), now)).toBe(false));
  it('horário no futuro (relógio adiantado) não é velho', () => expect(isStaleOperation(new Date('2026-10-12T12:30:00Z'), now)).toBe(false));
});

// RF-010 e RF-012: dependências lógicas, não a viagem inteira.
describe('dependências', () => {
  it('a conferência depende da operação anterior sobre o mesmo cilindro', () => {
    const fila = [queued({ id: 'a', itemId: 'I1' }), queued({ id: 'b', itemId: 'I2' })];
    expect(dependenciesFor({ operation: 'trip.uncheck_item', tripId: 'T1', itemId: 'I1' }, fila)).toEqual(['a']);
  });
  it('conferir um cilindro não depende da conferência de outro', () => {
    expect(dependenciesFor({ operation: 'trip.check_item', tripId: 'T1', itemId: 'I3' }, [queued({ id: 'a', itemId: 'I1' }), queued({ id: 'b', itemId: 'I2' })])).toEqual([]);
  });
  it('a entrega depende da chegada da mesma parada, quando ela está na fila', () => {
    const fila = [queued({ id: 'c', operation: 'trip.arrive_stop', stopId: 'S1' }), queued({ id: 'd', operation: 'trip.arrive_stop', stopId: 'S2' })];
    expect(dependenciesFor({ operation: 'trip.deliver', tripId: 'T1', stopId: 'S1', itemIds: ['I1'] }, fila)).toEqual(['c']);
  });
  it('a entrega depende da conferência ainda pendente dos cilindros da parada', () => {
    const fila = [queued({ id: 'a', itemId: 'I1' }), queued({ id: 'b', itemId: 'I9' })];
    expect(dependenciesFor({ operation: 'trip.deliver', tripId: 'T1', stopId: 'S1', itemIds: ['I1', 'I2'] }, fila)).toEqual(['a']);
  });
  it('a chegada não depende de outra parada', () => {
    expect(dependenciesFor({ operation: 'trip.arrive_stop', tripId: 'T1', stopId: 'S3' }, [queued({ id: 'c', operation: 'trip.arrive_stop', stopId: 'S1' })])).toEqual([]);
  });
  it('só conta a mesma viagem e itens ainda não terminados', () => {
    const fila = [
      queued({ id: 'x', tripId: 'T2', itemId: 'I1' }), queued({ id: 'y', itemId: 'I1', status: 'synced' }), queued({ id: 'z', itemId: 'I1', status: 'discarded' }),
      queued({ id: 'w', itemId: 'I1', status: 'conflict' }),
    ];
    expect(dependenciesFor({ operation: 'trip.uncheck_item', tripId: 'T1', itemId: 'I1' }, fila)).toEqual(['w']);
  });
  it('sem repetir e sem depender de si mesmo', () => {
    const fila = [queued({ id: 'a', operation: 'trip.arrive_stop', stopId: 'S1' }), queued({ id: 'b', itemId: 'I1' })];
    const dependencias = dependenciesFor({ operation: 'trip.deliver', tripId: 'T1', stopId: 'S1', itemIds: ['I1', 'I1'] }, fila);
    expect(dependencias.sort()).toEqual(['a', 'b']);
  });
});
