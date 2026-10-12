import { describe, expect, it } from 'vitest';
import { TRIP_EVENT_TYPES } from './trip-vocabulary';
import { describeTripEvent } from './trip-history-format';

// Spec 009 (RF-005, RF-017): o histórico diz COMO o cilindro foi conferido e entregue, em texto, e nunca mostra o valor lido.
// Spec 009 (RF-010, RF-013, RF-017): o histórico diz a origem e a faixa de precisão da posição, nunca as coordenadas.
describe('describeTripEvent: posição', () => {
  it('chegada com GPS de precisão boa', () => {
    expect(describeTripEvent('stop_arrived', { position: 2, out_of_order: false, position_source: 'gps', accuracy_band: 'good' })).toBe('Chegada à parada 2. Posição por GPS, precisão boa.');
  });

  it('chegada com precisão baixa e fora da área da unidade, fora da ordem', () => {
    expect(describeTripEvent('stop_arrived', { position: 2, out_of_order: true, position_source: 'gps', accuracy_band: 'low', outside_geofence: true }))
      .toBe('Chegada à parada 2, fora da ordem planejada. Posição por GPS, precisão baixa. Fora da área da unidade.');
  });

  it('chegada com coordenadas digitadas', () => {
    expect(describeTripEvent('stop_arrived', { position: 1, position_source: 'typed' })).toBe('Chegada à parada 1. Posição informada.');
  });

  it('chegada sem posição continua como era', () => {
    expect(describeTripEvent('stop_arrived', { position: 1, out_of_order: false })).toBe('Chegada à parada 1.');
    expect(describeTripEvent('stop_arrived', { position: 1, position_source: null, accuracy_band: null, outside_geofence: null })).toBe('Chegada à parada 1.');
  });

  it('entrega com a origem da posição, antes dos métodos', () => {
    expect(describeTripEvent('delivery_registered', { position: 1, delivered: 2, not_delivered: 0, has_recipient: true, position_source: 'gps', accuracy_band: 'good', sources: { camera: 2 } }))
      .toBe('Parada 1: 2 entregues e 0 não entregues, com recebedor registrado. Posição por GPS, precisão boa. Métodos: 2 por câmera.');
  });

  it('entrega no endereço da unidade', () => {
    expect(describeTripEvent('delivery_registered', { position: 3, delivered: 1, not_delivered: 0, has_recipient: true, position_source: 'site_address' }))
      .toBe('Parada 3: 1 entregue e 0 não entregues, com recebedor registrado. Entrega no endereço da unidade.');
  });

  it('nunca escreve coordenadas, mesmo que o dado as traga por engano', () => {
    const text = describeTripEvent('stop_arrived', { position: 1, position_source: 'gps', accuracy_band: 'good', latitude: -23.55, longitude: -46.63 });
    expect(text).not.toMatch(/23\.55|46\.63/);
  });
});

describe('describeTripEvent: método de leitura', () => {
  it.each([
    ['manual', 'Cilindro conferido por toque.'],
    ['typed', 'Cilindro conferido por código digitado ou leitor.'],
    ['camera', 'Cilindro conferido por câmera.'],
    ['nfc', 'Cilindro conferido por NFC.'],
  ])('conferência com o método "%s"', (source, text) => {
    expect(describeTripEvent('item_checked', { item_id: 'i1', source })).toBe(text);
  });

  it('conferência sem método reconhecido não inventa um', () => {
    expect(describeTripEvent('item_checked', { item_id: 'i1' })).toBe('Cilindro conferido.');
    expect(describeTripEvent('item_checked', { item_id: 'i1', source: 'scan' })).toBe('Cilindro conferido.');
  });

  it('entrega: conta os métodos usados, na ordem fixa, sem nenhum valor lido', () => {
    const text = describeTripEvent('delivery_registered', { position: 1, delivered: 3, not_delivered: 0, has_recipient: true, sources: { nfc: 1, manual: 1, camera: 1 } });
    expect(text).toBe('Parada 1: 3 entregues e 0 não entregues, com recebedor registrado. Métodos: 1 por toque, 1 por câmera, 1 por NFC.');
  });

  it('entrega sem contagem de métodos (registro antigo) continua como era', () => {
    expect(describeTripEvent('delivery_registered', { position: 1, delivered: 2, not_delivered: 0, has_recipient: true })).toBe('Parada 1: 2 entregues e 0 não entregues, com recebedor registrado.');
  });

  it('a correção também mostra os métodos', () => {
    expect(describeTripEvent('delivery_corrected', { position: 2, delivered: 1, not_delivered: 0, has_recipient: true, sources: { typed: 1 } }))
      .toBe('Parada 2 corrigida: 1 entregue e 0 não entregues, com recebedor registrado. Métodos: 1 por código digitado ou leitor.');
  });

  it('ignora contagem inválida', () => {
    expect(describeTripEvent('delivery_registered', { position: 1, delivered: 1, not_delivered: 0, has_recipient: true, sources: { camera: 'x', nfc: -1, bogus: 4 } }))
      .toBe('Parada 1: 1 entregue e 0 não entregues, com recebedor registrado.');
  });
});

describe('describeTripEvent', () => {
  it('todo tipo de evento tem texto', () => {
    for (const type of TRIP_EVENT_TYPES) expect(describeTripEvent(type, {}).length, type).toBeGreaterThan(0);
  });

  it('viagem planejada traz a data, as paradas e os cilindros', () => {
    expect(describeTripEvent('trip_created', { number: 7, planned_date: '2026-10-12', stops: 2, cylinders: 3 }))
      .toBe('Viagem n.º 7 planejada para 12/10/2026, com 2 paradas e 3 cilindros.');
    expect(describeTripEvent('trip_created', { number: 1, planned_date: '2026-10-12', stops: 1, cylinders: 1 }))
      .toBe('Viagem n.º 1 planejada para 12/10/2026, com 1 parada e 1 cilindro.');
  });

  it('a edição mostra o valor anterior e o novo; veículo e motorista usam os nomes quando conhecidos', () => {
    const data = {
      changes: [
        { field: 'planned_date', old: '2026-10-12', new: '2026-10-14' },
        { field: 'vehicle_id', old: 'v1', new: 'v2' },
        { field: 'driver_id', old: 'd1', new: 'd2' },
        { field: 'notes_changed', old: null, new: true },
      ],
      stops: 2, cylinders: 4, added: 1, released: 0,
    };
    const text = describeTripEvent('trip_updated', data, { v1: 'ABC1234', v2: 'XYZ9876' });
    expect(text).toContain('Data prevista: 12/10/2026 → 14/10/2026');
    expect(text).toContain('Veículo: ABC1234 → XYZ9876');
    expect(text).toContain('Motorista alterado');
    expect(text).toContain('Observações alteradas');
    expect(text).toContain('1 cilindro adicionado');
  });

  it('a edição sem mudança de campo ainda descreve os cilindros', () => {
    expect(describeTripEvent('trip_updated', { changes: [], stops: 1, cylinders: 2, added: 0, released: 1 })).toContain('1 cilindro liberado');
  });

  it('a entrega diz as contagens e que há recebedor, nunca o nome', () => {
    const text = describeTripEvent('delivery_registered', { position: 2, delivered: 1, not_delivered: 1, has_recipient: true, outside_geofence: true, nome: 'Fulana' });
    expect(text).toBe('Parada 2: 1 entregue e 1 não entregue, com recebedor registrado. Registrada fora da área da unidade.');
    expect(text).not.toContain('Fulana');
  });

  it('a entrega corrigida e a chegada fora de ordem', () => {
    expect(describeTripEvent('delivery_corrected', { position: 1, delivered: 2, not_delivered: 0, has_recipient: true, outside_geofence: false })).toBe('Parada 1 corrigida: 2 entregues e 0 não entregues, com recebedor registrado.');
    expect(describeTripEvent('stop_arrived', { position: 3, out_of_order: true })).toBe('Chegada à parada 3, fora da ordem planejada.');
    expect(describeTripEvent('stop_arrived', { position: 1, out_of_order: false })).toBe('Chegada à parada 1.');
  });

  it('o desbloqueio excepcional se distingue do normal', () => {
    expect(describeTripEvent('unlock_registered', { exceptional: true })).toBe('Desbloqueio excepcional registrado.');
    expect(describeTripEvent('unlock_registered', { exceptional: false })).toBe('Desbloqueio registrado.');
  });

  it('conclusão e cancelamento trazem as contagens', () => {
    expect(describeTripEvent('trip_completed', { number: 7, delivered: 4, returned: 1 })).toBe('Viagem concluída: 4 cilindros entregues e 1 devolvido ao estoque.');
    expect(describeTripEvent('trip_cancelled', { number: 7, from: 'in_progress', released: 0, in_transit: 2 })).toBe('Viagem cancelada em andamento; 2 cilindros continuam em trânsito.');
    expect(describeTripEvent('trip_cancelled', { number: 7, from: 'planned', released: 3, in_transit: 0 })).toBe('Viagem cancelada; 3 cilindros liberados.');
  });

  it('tolera dado ausente ou de tipo errado, sem estourar', () => {
    expect(describeTripEvent('trip_created', { stops: 'x', cylinders: null })).toBe('Viagem planejada.');
    expect(describeTripEvent('delivery_registered', {})).toBe('Entrega registrada.');
    expect(describeTripEvent('item_returned', { from: 'in_transit' })).toBe('Cilindro devolvido ao estoque.');
  });
});
