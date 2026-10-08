import { describe, expect, it } from 'vitest';
import {
  type GeofenceFormInput, type SiteFormInput, type VehicleFormInput,
  validateCustomerForm, validateDriverForm, validateGeofenceForm, validateSiteForm, validateVehicleForm,
} from './registry-validation';

// Casos alternativos dos formulários: cada regra que recusa um valor, com a mensagem junto do campo certo.

const HOJE = '2026-10-07';
const unidade = (parcial: Partial<SiteFormInput> = {}): SiteFormInput => ({
  name: 'Unidade Central', postalCode: '01001-000', street: 'Praça da Sé', number: '100', complement: '', district: 'Sé', city: 'São Paulo', state: 'SP', ibgeCode: '',
  latitude: '', longitude: '', receivingContactName: '', receivingContactPhone: '', receivingDays: [], receivingFrom: '', receivingTo: '', accessInstructions: '', ...parcial,
});
const errosDe = (resultado: { ok: boolean; errors?: Record<string, string> }): Record<string, string> => (resultado.ok ? {} : resultado.errors ?? {});

describe('validateSiteForm: coordenadas e janela de recebimento', () => {
  it('só a longitude pede a latitude, e as duas inválidas apontam cada campo', () => {
    expect(errosDe(validateSiteForm(unidade({ longitude: '-46,6' })))).toHaveProperty('latitude', 'Informe a latitude junto com a longitude.');
    const ambas = errosDe(validateSiteForm(unidade({ latitude: 'x', longitude: 'y' })));
    expect(ambas).toHaveProperty('latitude', 'Informe a latitude em graus decimais.');
    expect(ambas).toHaveProperty('longitude', 'Informe a longitude em graus decimais.');
    expect(errosDe(validateSiteForm(unidade({ latitude: '-95', longitude: '0' })))).toHaveProperty('latitude', 'A latitude vai de -90 a 90.');
    expect(errosDe(validateSiteForm(unidade({ latitude: '0', longitude: '-181' })))).toHaveProperty('longitude', 'A longitude vai de -180 a 180.');
  });

  it('aceita as bordas das coordenadas', () => {
    expect(validateSiteForm(unidade({ latitude: '-90', longitude: '180' }))).toMatchObject({ ok: true, value: { latitude: -90, longitude: 180 } });
  });

  it('janela só com o início ou só com o fim pede o outro horário', () => {
    expect(errosDe(validateSiteForm(unidade({ receivingDays: [1], receivingFrom: '08:00' })))).toHaveProperty('receivingTo', 'Informe o horário final.');
    expect(errosDe(validateSiteForm(unidade({ receivingDays: [1], receivingTo: '17:00' })))).toHaveProperty('receivingFrom', 'Informe o horário inicial.');
  });

  it('horários fora do formato HH:MM são recusados em cada campo, sem comparar os dois', () => {
    const erros = errosDe(validateSiteForm(unidade({ receivingDays: [1], receivingFrom: '8h', receivingTo: '25:00' })));
    expect(erros).toHaveProperty('receivingFrom', 'Informe o horário inicial no formato HH:MM.');
    expect(erros).toHaveProperty('receivingTo', 'Informe o horário final no formato HH:MM.');
  });

  it('horários sem nenhum dia marcado pedem ao menos um dia', () => {
    expect(errosDe(validateSiteForm(unidade({ receivingFrom: '08:00', receivingTo: '17:00' })))).toHaveProperty('receivingDays', 'Marque ao menos um dia de recebimento.');
  });

  it('horário final igual ao inicial é recusado', () => {
    expect(errosDe(validateSiteForm(unidade({ receivingDays: [1], receivingFrom: '08:00', receivingTo: '08:00' })))).toHaveProperty('receivingTo', 'O horário final deve ser depois do inicial.');
  });

  it.each([
    ['complemento', { complement: 'x'.repeat(81) }, 'complement'], ['bairro', { district: 'x'.repeat(81) }, 'district'],
    ['nome do responsável', { receivingContactName: 'x'.repeat(121) }, 'receivingContactName'], ['instruções', { accessInstructions: 'x'.repeat(501) }, 'accessInstructions'],
    ['dia não inteiro', { receivingDays: [1.5] }, 'receivingDays'], ['dia negativo', { receivingDays: [-1] }, 'receivingDays'],
  ])('%s acima do limite é recusado', (_nome, parcial, campo) => {
    expect(errosDe(validateSiteForm(unidade(parcial as Partial<SiteFormInput>)))).toHaveProperty(campo);
  });

  it('o primeiro erro de um campo é o que fica, sem ser sobrescrito pelo seguinte', () => {
    const erros = errosDe(validateSiteForm(unidade({ receivingDays: [1], receivingFrom: '', receivingTo: '25:00' })));
    expect(erros.receivingTo).toBe('Informe o horário final no formato HH:MM.');
  });
});

const circulo = (parcial: Partial<GeofenceFormInput> = {}): GeofenceFormInput => ({ name: 'Portão', shape: 'circle', centerLat: '-23,55', centerLng: '-46,63', radiusM: '200', vertices: [], ...parcial });
const poligono = (vertices: Array<[string, string]>, parcial: Partial<GeofenceFormInput> = {}): GeofenceFormInput =>
  ({ name: 'Pátio', shape: 'polygon', centerLat: '', centerLng: '', radiusM: '', vertices: vertices.map(([lat, lng]) => ({ lat, lng })), ...parcial });

describe('validateGeofenceForm: círculo e polígono', () => {
  it('forma desconhecida é recusada e nada mais é avaliado', () => {
    expect(validateGeofenceForm(circulo({ shape: 'cone' }))).toEqual({ ok: false, errors: { shape: 'Escolha círculo ou polígono.' } });
  });

  it('círculo sem centro ou sem raio numérico aponta cada campo', () => {
    const erros = errosDe(validateGeofenceForm(circulo({ centerLat: '', centerLng: 'x', radiusM: '' })));
    expect(erros).toHaveProperty('centerLat', 'Informe a latitude do centro.');
    expect(erros).toHaveProperty('centerLng', 'Informe a longitude do centro.');
    expect(erros).toHaveProperty('radiusM');
  });

  it('círculo com centro fora do intervalo ou raio fora dos limites é recusado no campo certo', () => {
    expect(errosDe(validateGeofenceForm(circulo({ centerLat: '95' })))).toHaveProperty('centerLat', 'Latitude vai de -90 a 90 e longitude de -180 a 180.');
    expect(errosDe(validateGeofenceForm(circulo({ radiusM: '24' })))).toHaveProperty('radiusM');
    expect(errosDe(validateGeofenceForm(circulo({ radiusM: '5001' })))).toHaveProperty('radiusM');
    expect(errosDe(validateGeofenceForm(circulo({ radiusM: '100,5' })))).toHaveProperty('radiusM');
  });

  it('círculo válido arredonda o centro a 6 casas', () => {
    expect(validateGeofenceForm(circulo({ centerLat: '-23,5505201234', centerLng: '-46.6333087654' }))).toMatchObject({ ok: true, value: { center: { lat: -23.55052, lng: -46.633309 }, radiusM: 200 } });
  });

  it('polígono com vértice não numérico pede coordenadas numéricas', () => {
    expect(errosDe(validateGeofenceForm(poligono([['0', '0'], ['x', '1'], ['1', '1']])))).toHaveProperty('vertices', 'Informe latitude e longitude numéricas em todos os vértices.');
  });

  it.each([
    ['poucos vértices', [['0', '0'], ['1', '1']], 'O polígono precisa de'],
    ['autointerseção', [['0', '0'], ['2', '2'], ['0', '2'], ['2', '0']], 'As arestas do polígono se cruzam ou se tocam'],
    ['área zero', [['0', '0'], ['1', '1'], ['2', '2']], 'não tem área'],
    ['vértice repetido', [['0', '0'], ['0', '0'], ['2', '2'], ['2', '0']], 'vértices repetidos em sequência'],
    ['coordenada fora do intervalo', [['0', '0'], ['91', '0'], ['1', '1']], 'Latitude vai de -90 a 90'],
  ] as Array<[string, Array<[string, string]>, string]>)('polígono com %s mostra o motivo', (_nome, vertices, trecho) => {
    expect(errosDe(validateGeofenceForm(poligono(vertices))).vertices).toContain(trecho);
  });

  it('polígono válido arredonda os vértices e mantém a ordem', () => {
    expect(validateGeofenceForm(poligono([['0', '0'], ['0', '2,0000001'], ['2', '2']]))).toMatchObject({ ok: true, value: { shape: 'polygon', vertices: [{ lat: 0, lng: 0 }, { lat: 0, lng: 2 }, { lat: 2, lng: 2 }] } });
  });

  it('nome curto é recusado junto da forma válida', () => {
    expect(errosDe(validateGeofenceForm(circulo({ name: 'A' })))).toHaveProperty('name');
  });
});

const veiculo = (parcial: Partial<VehicleFormInput> = {}): VehicleFormInput => ({
  plate: 'ABC1D23', vehicleType: 'truck', vehicleTypeDetail: '', brand: '', model: '', manufactureYear: '', capacityCylinders: '10', maxLoadKg: '', licensingDueOn: '', ...parcial,
});

describe('validateVehicleForm: campos opcionais', () => {
  it('marca e modelo longos, ano fora da faixa e carga inválida são recusados', () => {
    expect(errosDe(validateVehicleForm(veiculo({ brand: 'x'.repeat(61) }), HOJE))).toHaveProperty('brand');
    expect(errosDe(validateVehicleForm(veiculo({ model: 'x'.repeat(61) }), HOJE))).toHaveProperty('model');
    expect(errosDe(validateVehicleForm(veiculo({ manufactureYear: '1979' }), HOJE))).toHaveProperty('manufactureYear');
    expect(errosDe(validateVehicleForm(veiculo({ manufactureYear: '2028' }), HOJE))).toHaveProperty('manufactureYear');
    expect(errosDe(validateVehicleForm(veiculo({ manufactureYear: '2020,5' }), HOJE))).toHaveProperty('manufactureYear');
    expect(errosDe(validateVehicleForm(veiculo({ maxLoadKg: '0' }), HOJE))).toHaveProperty('maxLoadKg');
    expect(errosDe(validateVehicleForm(veiculo({ maxLoadKg: 'muito' }), HOJE))).toHaveProperty('maxLoadKg');
    expect(errosDe(validateVehicleForm(veiculo({ maxLoadKg: '10000000' }), HOJE))).toHaveProperty('maxLoadKg');
    expect(errosDe(validateVehicleForm(veiculo({ capacityCylinders: '0' }), HOJE))).toHaveProperty('capacityCylinders');
    expect(errosDe(validateVehicleForm(veiculo({ capacityCylinders: '10000' }), HOJE))).toHaveProperty('capacityCylinders');
    expect(errosDe(validateVehicleForm(veiculo({ licensingDueOn: '2026-02-30' }), HOJE))).toHaveProperty('licensingDueOn');
  });

  it('tipo "outro" exige descrição de até 60 caracteres e o ano do ano seguinte é aceito', () => {
    expect(errosDe(validateVehicleForm(veiculo({ vehicleType: 'other', vehicleTypeDetail: '' }), HOJE))).toHaveProperty('vehicleTypeDetail');
    expect(errosDe(validateVehicleForm(veiculo({ vehicleType: 'other', vehicleTypeDetail: 'x'.repeat(61) }), HOJE))).toHaveProperty('vehicleTypeDetail');
    expect(validateVehicleForm(veiculo({ vehicleType: 'other', vehicleTypeDetail: 'Carreta', manufactureYear: '2027', maxLoadKg: '1500,456', licensingDueOn: '2027-01-31' }), HOJE))
      .toMatchObject({ ok: true, value: { vehicleTypeDetail: 'Carreta', manufactureYear: 2027, maxLoadKg: 1500.46, licensingDueOn: '2027-01-31' } });
  });
});

describe('validateCustomerForm e validateDriverForm: ramos alternativos', () => {
  const contato = { name: 'Maria', role: '', phone: '', email: '', isPrimary: false };
  const cliente = { personType: 'legal', document: '11.222.333/0001-81', legalName: 'Alfa Ltda', tradeName: '', segment: 'hospital', segmentDetail: '', notes: '', contacts: [contato] };

  it('contato com função longa, telefone ou e-mail inválido e mais de um principal é recusado', () => {
    const erros = errosDe(validateCustomerForm({ ...cliente, contacts: [{ ...contato, role: 'x'.repeat(81), phone: '123', email: 'sem-arroba', isPrimary: true }, { ...contato, name: 'João', isPrimary: true }] }));
    expect(erros).toHaveProperty('contacts.0.role');
    expect(erros).toHaveProperty('contacts.0.phone');
    expect(erros).toHaveProperty('contacts.0.email');
    expect(erros).toHaveProperty('contacts', 'Marque só um contato como principal.');
  });

  it('e-mail com mais de 160 caracteres é recusado e o e-mail é guardado em minúsculas', () => {
    expect(errosDe(validateCustomerForm({ ...cliente, contacts: [{ ...contato, email: `${'a'.repeat(156)}@b.co` }] }))).toHaveProperty('contacts.0.email');
    expect(validateCustomerForm({ ...cliente, contacts: [{ ...contato, email: 'MARIA@Exemplo.Invalid' }] })).toMatchObject({ ok: true, value: { contacts: [{ email: 'maria@exemplo.invalid' }] } });
  });

  it('o motorista na edição não exige CPF e CNH, mas na criação exige', () => {
    const base = { fullName: 'Maria Souza', cpf: '', cnhNumber: '', cnhCategory: 'D', cnhValidUntil: '2030-01-31', phone: '', justification: '' };
    expect(validateDriverForm(base as never, 'edit').ok).toBe(true);
    expect(Object.keys(errosDe(validateDriverForm(base as never, 'create'))).length).toBeGreaterThan(0);
  });
});
