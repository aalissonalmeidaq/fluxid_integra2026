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

// Spec 009 (RF-010, RF-011, RF-014): a origem, a precisão e o horário da leitura da posição seguem no valor da entrega; leitura velha é recusada.
describe('validateDeliveryForm: origem e precisão da posição', () => {
  const gpsAt = (offsetMs: number) => ({ accuracyM: 12.4, readAt: NOW.getTime() - offsetMs });
  const withCoords = (over: Partial<DeliveryFormInput> = {}) => delivery({ latitude: '-23.550520', longitude: '-46.633309', ...over });

  it('coordenadas lidas pelo GPS levam origem "gps", precisão e horário da leitura em ISO', () => {
    const result = validateDeliveryForm(withCoords({ gps: gpsAt(30_000) }), NOW);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.position).toEqual({ source: 'gps', accuracyM: 12.4, readAt: new Date(NOW.getTime() - 30_000).toISOString() });
  });

  it('coordenadas digitadas levam origem "informada", sem precisão nem horário', () => {
    const result = validateDeliveryForm(withCoords(), NOW);
    expect(result.ok && result.value.position).toEqual({ source: 'typed', accuracyM: null, readAt: null });
  });

  it('"no endereço da unidade" leva a origem "site_address"', () => {
    const result = validateDeliveryForm(delivery({ atSiteAddress: true }), NOW);
    expect(result.ok && result.value.position).toEqual({ source: 'site_address', accuracyM: null, readAt: null });
  });

  it('sem posição, o valor não tem o campo "position" (a posição é opcional)', () => {
    const result = validateDeliveryForm(delivery(), NOW);
    expect(result.ok).toBe(true);
    if (result.ok) expect('position' in result.value).toBe(false);
  });

  it('leitura do GPS com mais de 2 minutos é recusada, com texto que manda ler de novo', () => {
    const result = validateDeliveryForm(withCoords({ gps: gpsAt(120_001) }), NOW);
    expect(result).toMatchObject({ ok: false, errors: { position: expect.stringContaining('Leia de novo') } });
  });

  it('leitura com exatamente 2 minutos ainda vale', () => {
    expect(validateDeliveryForm(withCoords({ gps: gpsAt(120_000) }), NOW).ok).toBe(true);
  });

  it('precisão ruim (acima de 100 m) não bloqueia: só marca a faixa na tela', () => {
    const result = validateDeliveryForm(withCoords({ gps: { accuracyM: 450, readAt: NOW.getTime() } }), NOW);
    expect(result.ok && result.value.position).toMatchObject({ source: 'gps', accuracyM: 450 });
  });

  it('a leitura do GPS sem coordenadas no formulário não vira posição', () => {
    const result = validateDeliveryForm(delivery({ gps: gpsAt(1_000) }), NOW);
    if (result.ok) expect('position' in result.value).toBe(false);
  });
});

// Spec 009 (RF-001a): o método de leitura de cada cilindro entregue segue no valor do formulário; o não entregue nunca o leva.
describe('validateDeliveryForm: método de leitura por cilindro', () => {
  it('mantém o método informado em cada cilindro entregue', () => {
    const result = validateDeliveryForm(delivery({ results: [{ itemId: 'i1', delivered: true, reason: '', source: 'camera' }, { itemId: 'i2', delivered: true, reason: '', source: 'nfc' }] }), NOW);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.results).toEqual([{ itemId: 'i1', delivered: true, source: 'camera' }, { itemId: 'i2', delivered: true, source: 'nfc' }]);
  });

  it('sem método informado, não inventa um (o servidor assume "manual")', () => {
    const result = validateDeliveryForm(delivery(), NOW);
    if (result.ok) expect(result.value.results.every((entry) => !('source' in entry))).toBe(true);
  });

  it('cilindro não entregue nunca leva o método, mesmo que a tela o tenha guardado', () => {
    const result = validateDeliveryForm(delivery({ results: [{ itemId: 'i1', delivered: false, reason: 'Cilindro não estava no endereço', source: 'camera' }] }), NOW);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.results).toEqual([{ itemId: 'i1', delivered: false, reason: 'Cilindro não estava no endereço' }]);
  });
});

describe('validateDeliveryForm: justificativa da correção (RF-015)', () => {
  const correcao = { allowNoResults: true, correction: true } as const;
  const erro = { ok: false, errors: { correctionReason: expect.stringContaining('5 a 500') } };

  it('a correção exige a justificativa', () => {
    expect(validateDeliveryForm(delivery({ results: [] }), NOW, correcao)).toMatchObject(erro);
    expect(validateDeliveryForm(delivery({ results: [], correctionReason: undefined }), NOW, correcao)).toMatchObject(erro);
  });

  it('justificativa só com espaços conta como vazia', () => {
    expect(validateDeliveryForm(delivery({ results: [], correctionReason: '      ' }), NOW, correcao)).toMatchObject(erro);
    expect(validateDeliveryForm(delivery({ results: [], correctionReason: '\n\t  \n' }), NOW, correcao)).toMatchObject(erro);
  });

  it('tem de 5 a 500 caracteres, contados depois de limpar os espaços', () => {
    expect(validateDeliveryForm(delivery({ results: [], correctionReason: 'Erro' }), NOW, correcao)).toMatchObject(erro);
    expect(validateDeliveryForm(delivery({ results: [], correctionReason: '  ab  c ' }), NOW, correcao)).toMatchObject(erro);
    expect(validateDeliveryForm(delivery({ results: [], correctionReason: 'Erro!' }), NOW, correcao).ok).toBe(true);
    expect(validateDeliveryForm(delivery({ results: [], correctionReason: 'x'.repeat(500) }), NOW, correcao).ok).toBe(true);
    expect(validateDeliveryForm(delivery({ results: [], correctionReason: 'x'.repeat(501) }), NOW, correcao)).toMatchObject(erro);
  });

  it('normaliza os espaços e devolve a justificativa limpa', () => {
    const result = validateDeliveryForm(delivery({ results: [], correctionReason: '  Nome   do\n recebedor \t digitado   errado  ' }), NOW, correcao);
    expect(result).toMatchObject({ ok: true, value: { correctionReason: 'Nome do recebedor digitado errado' } });
  });

  it('a entrega original não tem justificativa de correção, mesmo que o campo venha preenchido', () => {
    expect(validateDeliveryForm(delivery({ correctionReason: 'Texto que não vale' }), NOW)).toMatchObject({ ok: true, value: { correctionReason: null } });
    expect(validateDeliveryForm(delivery(), NOW)).toMatchObject({ ok: true, value: { correctionReason: null } });
  });
});

describe('validateDeliveryForm: posição por coordenadas ou no endereço da unidade, nunca as duas', () => {
  const contradicao = { ok: false, errors: { atSiteAddress: expect.stringContaining('só uma') } };

  it.each([
    ['coordenadas', { latitude: '-23,55', longitude: '-46,63', atSiteAddress: false }, true],
    ['no endereço da unidade', { latitude: '', longitude: '', atSiteAddress: true }, true],
    ['sem posição', { latitude: '', longitude: '', atSiteAddress: false }, true],
  ])('aceita %s', (_nome, patch, ok) => {
    expect(validateDeliveryForm(delivery(patch), NOW).ok).toBe(ok);
  });

  it.each([
    ['as duas coordenadas e o endereço', { latitude: '-23,55', longitude: '-46,63', atSiteAddress: true }],
    ['só a latitude e o endereço', { latitude: '-23,55', longitude: '', atSiteAddress: true }],
    ['só a longitude e o endereço', { latitude: '', longitude: '-46,63', atSiteAddress: true }],
  ])('recusa %s', (_nome, patch) => {
    expect(validateDeliveryForm(delivery(patch), NOW)).toMatchObject(contradicao);
  });

  it('no endereço da unidade o valor devolvido não leva coordenadas', () => {
    expect(validateDeliveryForm(delivery({ atSiteAddress: true }), NOW)).toMatchObject({ ok: true, value: { latitude: null, longitude: null, atSiteAddress: true } });
  });

  it('mantém o par de coordenadas e a faixa de cada uma', () => {
    expect(validateDeliveryForm(delivery({ latitude: '-23,55' }), NOW)).toMatchObject({ ok: false, errors: { longitude: expect.stringContaining('juntas') } });
    expect(validateDeliveryForm(delivery({ latitude: '91', longitude: '0' }), NOW)).toMatchObject({ ok: false, errors: { latitude: 'A latitude vai de −90 a 90.' } });
  });
});
