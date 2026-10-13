// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { attachmentStatusLabel, conflictReasonText, hasOldPending, indicatorText, itemStatusLabel, OLD_PENDING_AFTER_MS, operationLabel, type IndicatorInput } from './sync-status';

const base: IndicatorInput = { pending: 0, syncing: 0, total: 0, conflicts: 0, oldPending: 0, online: true };

// RF-004, RF-026 e RF-030: os textos do indicador, dos estados e dos conflitos são os de contracts/telas-e-fluxos.md.
describe('indicador da barra superior', () => {
  it('oculto sem pendência', () => expect(indicatorText(base)).toBeNull());
  it('pendentes', () => expect(indicatorText({ ...base, pending: 3, total: 3 })).toBe('3 pendentes'));
  it('uma pendência no singular', () => expect(indicatorText({ ...base, pending: 1, total: 1 })).toBe('1 pendente'));
  it('enviando', () => expect(indicatorText({ ...base, pending: 3, syncing: 1, total: 5 })).toBe('Enviando 2 de 5…'));
  it('conflito', () => expect(indicatorText({ ...base, conflicts: 1, total: 1 })).toBe('1 conflito'));
  it('conflitos no plural', () => expect(indicatorText({ ...base, conflicts: 2, total: 2 })).toBe('2 conflitos'));
  it('item antigo sem confirmação', () => expect(indicatorText({ ...base, pending: 3, total: 3, oldPending: 1 })).toBe('3 pendentes, 1 há mais de 24 h'));
  it('sem conexão com pendências', () => expect(indicatorText({ ...base, pending: 3, total: 3, online: false })).toBe('Sem conexão, 3 pendentes'));
  it('conflito vale mais que pendente', () => expect(indicatorText({ ...base, pending: 2, conflicts: 1, total: 3 })).toBe('1 conflito'));
});

describe('estados', () => {
  it('rótulos do item', () => {
    expect(itemStatusLabel('pending')).toBe('Pendente');
    expect(itemStatusLabel('syncing')).toBe('Enviando');
    expect(itemStatusLabel('synced')).toBe('Enviado');
    expect(itemStatusLabel('conflict')).toBe('Conflito');
    expect(itemStatusLabel('failed')).toBe('Falhou');
    expect(itemStatusLabel('discarded')).toBe('Descartado');
  });
  it('rótulos do anexo', () => {
    expect(attachmentStatusLabel('pending')).toBe('Pendente');
    expect(attachmentStatusLabel('uploading')).toBe('Enviando');
    expect(attachmentStatusLabel('uploaded')).toBe('Enviado');
    expect(attachmentStatusLabel('failed')).toBe('Recusado');
  });
  it('descrição das operações', () => {
    expect(operationLabel('trip.check_item', { serial: '12345' })).toBe('Conferência do cilindro 12345');
    expect(operationLabel('trip.uncheck_item', { serial: '12345' })).toBe('Desfazer a conferência do cilindro 12345');
    expect(operationLabel('trip.arrive_stop', { stopPosition: 2 })).toBe('Chegada à parada 2');
    expect(operationLabel('trip.deliver', { stopPosition: 2 })).toBe('Entrega da parada 2');
  });
});

describe('item antigo', () => {
  it('mais de 24 horas sem confirmação', () => {
    expect(OLD_PENDING_AFTER_MS).toBe(24 * 60 * 60 * 1000);
    const now = new Date('2026-10-12T12:00:00Z');
    expect(hasOldPending('2026-10-11T12:01:00Z', now)).toBe(false);
    expect(hasOldPending('2026-10-11T11:59:00Z', now)).toBe(true);
  });
});

describe('motivos de conflito', () => {
  it('textos do contrato', () => {
    expect(conflictReasonText('TRIP_CLOSED')).toBe('A viagem foi encerrada depois que você registrou isto.');
    expect(conflictReasonText('INVALID_TRANSITION')).toBe('A situação mudou e o servidor não aceita mais esta operação.');
    expect(conflictReasonText('STOP_CLOSED')).toBe('A parada já foi encerrada.');
    expect(conflictReasonText('NOT_FOUND')).toBe('Este item saiu da viagem ou da parada.');
    expect(conflictReasonText('STALE_OFFLINE_OPERATION')).toBe('Registro com mais de 7 dias de atraso. Peça a uma pessoa autorizada para decidir.');
    expect(conflictReasonText('VERSION_CONFLICT')).toBe('A viagem foi alterada por outra pessoa.');
    expect(conflictReasonText('VALIDATION_FAILED')).toBe('O servidor recusou este registro. Veja o motivo.');
    expect(conflictReasonText('MISSING_DEPENDENCY')).toBe('Depende de um registro que foi descartado.');
  });
  it('código desconhecido cai numa frase segura, sem repetir o código na tela', () => {
    expect(conflictReasonText('ALGO_NOVO')).toBe('O servidor recusou este registro. Veja o motivo.');
  });
});
