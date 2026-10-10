import { describe, expect, it } from 'vitest';
import { validateDeliveryForm, validateTripForm, validateTripJustification, validateUnlockForm, type DeliveryFormInput, type TripFormInput } from './trip-validation';

const TODAY = '2026-10-09';
const V = '11111111-1111-4111-8111-111111111111';
const D = '22222222-2222-4222-8222-222222222222';
const S = '33333333-3333-4333-8333-333333333333';

const trip = (patch: Partial<TripFormInput> = {}): TripFormInput => ({
  plannedDate: TODAY, vehicleId: V, driverId: D, notes: '', vehicleCapacity: 10, stops: [{ siteId: S, cylinderIds: ['a', 'b'] }], ...patch,
});

describe('validateTripForm', () => {
  it('aceita uma viagem completa e limpa os textos', () => {
    const result = validateTripForm(trip({ notes: '  levar rampa  ' }), 'create', TODAY);
    expect(result).toEqual({ ok: true, value: { plannedDate: TODAY, vehicleId: V, driverId: D, notes: 'levar rampa', stops: [{ siteId: S, cylinderIds: ['a', 'b'] }] } });
  });

  it('observações vazias viram nulas', () => {
    expect(validateTripForm(trip({ notes: '   ' }), 'create', TODAY)).toMatchObject({ ok: true, value: { notes: null } });
  });

  it('exige a data, o veículo e o motorista', () => {
    const result = validateTripForm(trip({ plannedDate: '', vehicleId: '', driverId: '' }), 'create', TODAY);
    expect(result).toMatchObject({ ok: false, errors: { plannedDate: 'Informe a data prevista.', vehicleId: 'Escolha o veículo.', driverId: 'Escolha o motorista.' } });
  });

  it('recusa data inexistente', () => {
    expect(validateTripForm(trip({ plannedDate: '2026-02-30' }), 'create', TODAY)).toMatchObject({ ok: false, errors: { plannedDate: 'Informe uma data válida.' } });
  });

  it('na criação recusa data passada; na edição aceita', () => {
    expect(validateTripForm(trip({ plannedDate: '2026-10-08' }), 'create', TODAY)).toMatchObject({ ok: false, errors: { plannedDate: 'Escolha hoje ou uma data futura.' } });
    expect(validateTripForm(trip({ plannedDate: '2026-10-08' }), 'edit', TODAY).ok).toBe(true);
  });

  it('observações até 500 caracteres', () => {
    expect(validateTripForm(trip({ notes: 'n'.repeat(500) }), 'create', TODAY).ok).toBe(true);
    expect(validateTripForm(trip({ notes: 'n'.repeat(501) }), 'create', TODAY)).toMatchObject({ ok: false, errors: { notes: expect.stringContaining('500') } });
  });

  it('exige unidade em toda parada', () => {
    expect(validateTripForm(trip({ stops: [{ siteId: '', cylinderIds: ['a'] }] }), 'create', TODAY)).toMatchObject({ ok: false, errors: { 'stops.0.siteId': 'Escolha a unidade da parada.' } });
  });

  it('sem parada, parada vazia, repetido e acima da capacidade vão junto do campo certo', () => {
    expect(validateTripForm(trip({ stops: [] }), 'create', TODAY)).toMatchObject({ ok: false, errors: { stops: 'Inclua pelo menos uma parada.' } });
    expect(validateTripForm(trip({ stops: [{ siteId: S, cylinderIds: [] }] }), 'create', TODAY)).toMatchObject({ ok: false, errors: { 'stops.0.cylinders': expect.stringContaining('parada 1') } });
    expect(validateTripForm(trip({ stops: [{ siteId: S, cylinderIds: ['a'] }, { siteId: S, cylinderIds: ['a'] }] }), 'create', TODAY)).toMatchObject({ ok: false, errors: { cylinders: expect.stringContaining('mais de uma parada') } });
    expect(validateTripForm(trip({ vehicleCapacity: 1 }), 'create', TODAY)).toMatchObject({ ok: false, errors: { cylinders: expect.stringContaining('comporta 1') } });
  });
});

const NOW = new Date('2026-10-09T15:00:00Z');
const delivery = (patch: Partial<DeliveryFormInput> = {}): DeliveryFormInput => ({
  deliveredAt: '2026-10-09T10:00', recipientName: 'Recebedor Fictício', recipientRole: '', latitude: '', longitude: '', atSiteAddress: false,
  results: [{ itemId: 'i1', delivered: true, reason: '' }, { itemId: 'i2', delivered: true, reason: '' }], ...patch,
});

describe('validateDeliveryForm', () => {
  it('aceita a entrega completa, sem posição', () => {
    const result = validateDeliveryForm(delivery(), NOW);
    expect(result).toMatchObject({ ok: true, value: { recipientName: 'Recebedor Fictício', recipientRole: null, latitude: null, longitude: null, atSiteAddress: false } });
    if (result.ok) expect(result.value.results).toEqual([{ itemId: 'i1', delivered: true }, { itemId: 'i2', delivered: true }]);
  });

  it('o nome do recebedor tem de 2 a 120 caracteres', () => {
    expect(validateDeliveryForm(delivery({ recipientName: 'A' }), NOW)).toMatchObject({ ok: false, errors: { recipientName: expect.stringContaining('de 2 a 120') } });
    expect(validateDeliveryForm(delivery({ recipientName: 'A'.repeat(121) }), NOW).ok).toBe(false);
    expect(validateDeliveryForm(delivery({ recipientName: 'Ab' }), NOW).ok).toBe(true);
    expect(validateDeliveryForm(delivery({ recipientName: 'A'.repeat(120) }), NOW).ok).toBe(true);
  });

  it('a função do recebedor tem até 80 caracteres', () => {
    expect(validateDeliveryForm(delivery({ recipientRole: 'F'.repeat(81) }), NOW)).toMatchObject({ ok: false, errors: { recipientRole: expect.stringContaining('80') } });
    expect(validateDeliveryForm(delivery({ recipientRole: 'Enfermeira' }), NOW)).toMatchObject({ ok: true, value: { recipientRole: 'Enfermeira' } });
  });

  it('o horário não pode estar no futuro nem faltar', () => {
    expect(validateDeliveryForm(delivery({ deliveredAt: '2030-01-01T10:00' }), NOW)).toMatchObject({ ok: false, errors: { deliveredAt: 'O horário da entrega não pode estar no futuro.' } });
    expect(validateDeliveryForm(delivery({ deliveredAt: '' }), NOW)).toMatchObject({ ok: false, errors: { deliveredAt: 'Informe a data e a hora da entrega.' } });
  });

  it('a posição vem completa ou não vem', () => {
    expect(validateDeliveryForm(delivery({ latitude: '-23,55' }), NOW)).toMatchObject({ ok: false, errors: { longitude: expect.stringContaining('juntas') } });
    expect(validateDeliveryForm(delivery({ longitude: '-46.63' }), NOW)).toMatchObject({ ok: false, errors: { latitude: expect.stringContaining('juntas') } });
    expect(validateDeliveryForm(delivery({ latitude: '-23,55', longitude: '-46.63' }), NOW)).toMatchObject({ ok: true, value: { latitude: -23.55, longitude: -46.63 } });
  });

  it('a posição fica dentro do intervalo e é numérica', () => {
    expect(validateDeliveryForm(delivery({ latitude: '91', longitude: '0' }), NOW)).toMatchObject({ ok: false, errors: { latitude: 'A latitude vai de −90 a 90.' } });
    expect(validateDeliveryForm(delivery({ latitude: '0', longitude: '-181' }), NOW)).toMatchObject({ ok: false, errors: { longitude: 'A longitude vai de −180 a 180.' } });
    expect(validateDeliveryForm(delivery({ latitude: 'abc', longitude: '0' }), NOW)).toMatchObject({ ok: false, errors: { latitude: expect.stringContaining('graus') } });
  });

  it('cilindro não entregue exige justificativa, junto do próprio item', () => {
    const results = [{ itemId: 'i1', delivered: true, reason: '' }, { itemId: 'i2', delivered: false, reason: '  ' }];
    expect(validateDeliveryForm(delivery({ results }), NOW)).toMatchObject({ ok: false, errors: { 'results.i2': expect.stringContaining('não foi entregue') } });
    const explained = [{ itemId: 'i1', delivered: true, reason: '' }, { itemId: 'i2', delivered: false, reason: ' Cliente sem espaço ' }];
    const ok = validateDeliveryForm(delivery({ results: explained }), NOW);
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.value.results[1]).toEqual({ itemId: 'i2', delivered: false, reason: 'Cliente sem espaço' });
  });

  it('exige ao menos um resultado', () => {
    expect(validateDeliveryForm(delivery({ results: [] }), NOW)).toMatchObject({ ok: false, errors: { results: expect.any(String) } });
  });

  it('na correção só de dados a lista de resultados pode ser vazia', () => {
    expect(validateDeliveryForm(delivery({ results: [] }), NOW, { allowNoResults: true }).ok).toBe(true);
    expect(validateDeliveryForm(delivery({ results: [] }), NOW).ok).toBe(false);
  });

  it('converte o horário informado em instante ISO', () => {
    const result = validateDeliveryForm(delivery({ deliveredAt: '2026-10-09T10:00' }), NOW);
    expect(result.ok && result.value.deliveredAt).toBe(new Date('2026-10-09T10:00').toISOString());
  });
});

describe('justificativas', () => {
  it('de 5 a 500 caracteres', () => {
    expect(validateTripJustification('Quatro')).toEqual({ ok: true, value: 'Quatro' });
    expect(validateTripJustification('abc')).toMatchObject({ ok: false, errors: { justification: 'Explique em 5 a 500 caracteres.' } });
    expect(validateTripJustification('j'.repeat(501)).ok).toBe(false);
  });

  it('quando opcional, vazio é nulo', () => {
    expect(validateTripJustification('  ', false)).toEqual({ ok: true, value: null });
  });

  it('desbloqueio normal aceita sem justificativa e excepcional exige', () => {
    expect(validateUnlockForm({ exceptional: false, justification: '' })).toEqual({ ok: true, value: { justification: null } });
    expect(validateUnlockForm({ exceptional: true, justification: '' }).ok).toBe(false);
    expect(validateUnlockForm({ exceptional: true, justification: 'Cilindro precisa voltar' })).toEqual({ ok: true, value: { justification: 'Cilindro precisa voltar' } });
  });
});
