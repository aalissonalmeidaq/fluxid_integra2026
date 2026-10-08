import { describe, expect, it } from 'vitest';
import {
  type ContactInput, type CustomerFormInput, type DriverFormInput, type GeofenceFormInput, type SiteFormInput, type VehicleFormInput,
  validateCustomerForm, validateDriverForm, validateGeofenceForm, validateJustification, validateSiteForm, validateVehicleForm,
} from './registry-validation';

const HOJE = '2026-10-07';

const contato = (parcial: Partial<ContactInput> = {}): ContactInput => ({ name: 'Maria Souza', role: 'Compras', phone: '(11) 91234-5678', email: 'maria@exemplo.invalid', isPrimary: true, ...parcial });
const cliente = (parcial: Partial<CustomerFormInput> = {}): CustomerFormInput => ({
  personType: 'legal', document: '11.222.333/0001-81', legalName: 'Hospital Alfa Ltda', tradeName: '', segment: 'hospital', segmentDetail: '', notes: '', contacts: [contato()], ...parcial,
});

describe('validateCustomerForm (RF-001 a RF-003)', () => {
  it('aceita um cliente jurídico e normaliza o documento', () => {
    const resultado = validateCustomerForm(cliente());
    expect(resultado.ok).toBe(true);
    if (resultado.ok) {
      expect(resultado.value.document).toBe('11222333000181');
      expect(resultado.value.tradeName).toBeNull();
      expect(resultado.value.contacts[0]).toMatchObject({ phone: '11912345678', email: 'maria@exemplo.invalid', isPrimary: true });
    }
  });

  it('aceita CNPJ alfanumérico e CPF de pessoa física', () => {
    expect(validateCustomerForm(cliente({ document: '12.abc.345/01de-35' }))).toMatchObject({ ok: true, value: { document: '12ABC34501DE35' } });
    expect(validateCustomerForm(cliente({ personType: 'individual', document: '529.982.247-25', legalName: 'Ana Lima' }))).toMatchObject({ ok: true, value: { document: '52998224725' } });
  });

  it.each([
    ['CNPJ inválido', cliente({ document: '11222333000182' }), 'document'],
    ['CPF inválido para pessoa física', cliente({ personType: 'individual', document: '11111111111', legalName: 'Ana Lima' }), 'document'],
    ['CPF no lugar do CNPJ', cliente({ document: '52998224725' }), 'document'],
    ['nome curto', cliente({ legalName: 'A' }), 'legalName'],
    ['nome longo', cliente({ legalName: 'x'.repeat(161) }), 'legalName'],
    ['nome fantasia longo', cliente({ tradeName: 'x'.repeat(161) }), 'tradeName'],
    ['segmento desconhecido', cliente({ segment: 'x' }), 'segment'],
    ['segmento outro sem detalhe', cliente({ segment: 'other', segmentDetail: '' }), 'segmentDetail'],
    ['detalhe do segmento longo', cliente({ segment: 'other', segmentDetail: 'x'.repeat(61) }), 'segmentDetail'],
    ['observações longas', cliente({ notes: 'x'.repeat(501) }), 'notes'],
    ['contato sem nome', cliente({ contacts: [contato({ name: '' })] }), 'contacts.0.name'],
    ['telefone do contato inválido', cliente({ contacts: [contato({ phone: '123' })] }), 'contacts.0.phone'],
    ['e-mail do contato inválido', cliente({ contacts: [contato({ email: 'sem-arroba' })] }), 'contacts.0.email'],
    ['função do contato longa', cliente({ contacts: [contato({ role: 'x'.repeat(81) })] }), 'contacts.0.role'],
    ['dois contatos principais', cliente({ contacts: [contato(), contato({ name: 'João Dias' })] }), 'contacts'],
    ['11 contatos', cliente({ contacts: Array.from({ length: 11 }, (_, i) => contato({ name: `Contato ${i + 10}`, isPrimary: i === 0 })) }), 'contacts'],
  ] as const)('recusa: %s', (_nome, entrada, campo) => {
    const resultado = validateCustomerForm(entrada);
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(Object.keys(resultado.errors)).toContain(campo);
  });

  it('segmento diferente de "outro" descarta o detalhe', () => {
    const resultado = validateCustomerForm(cliente({ segment: 'hospital', segmentDetail: 'qualquer coisa' }));
    expect(resultado).toMatchObject({ ok: true, value: { segmentDetail: null } });
  });

  it('e-mail é gravado em minúsculas', () => {
    const resultado = validateCustomerForm(cliente({ contacts: [contato({ email: 'Maria@Exemplo.INVALID' })] }));
    expect(resultado).toMatchObject({ ok: true, value: { contacts: [{ email: 'maria@exemplo.invalid' }] } });
  });

  it('aceita 10 contatos', () => {
    const dez = Array.from({ length: 10 }, (_, i) => contato({ name: `Contato ${i + 10}`, isPrimary: i === 0 }));
    expect(validateCustomerForm(cliente({ contacts: dez })).ok).toBe(true);
  });
});

const unidade = (parcial: Partial<SiteFormInput> = {}): SiteFormInput => ({
  name: 'Unidade Central', postalCode: '01001-000', street: 'Praça da Sé', number: '100', complement: '', district: 'Sé', city: 'São Paulo', state: 'SP', ibgeCode: '3550308',
  latitude: '', longitude: '', receivingContactName: '', receivingContactPhone: '', receivingDays: [], receivingFrom: '', receivingTo: '', accessInstructions: '', ...parcial,
});

describe('validateSiteForm (RF-005, RF-006)', () => {
  it('aceita a unidade mínima e normaliza o CEP', () => {
    expect(validateSiteForm(unidade())).toMatchObject({ ok: true, value: { postalCode: '01001000', latitude: null, longitude: null, receivingDays: null } });
  });

  it('aceita coordenadas com vírgula decimal e janela de recebimento', () => {
    const resultado = validateSiteForm(unidade({ latitude: '-23,550520', longitude: '-46.633308', receivingDays: [1, 2, 3], receivingFrom: '08:00', receivingTo: '17:30' }));
    expect(resultado).toMatchObject({ ok: true, value: { latitude: -23.55052, longitude: -46.633308, receivingDays: [1, 2, 3], receivingFrom: '08:00', receivingTo: '17:30' } });
  });

  it.each([
    ['nome curto', unidade({ name: 'A' }), 'name'],
    ['CEP com 7 dígitos', unidade({ postalCode: '0100100' }), 'postalCode'],
    ['logradouro vazio', unidade({ street: '' }), 'street'],
    ['número vazio', unidade({ number: '' }), 'number'],
    ['número longo', unidade({ number: 'x'.repeat(21) }), 'number'],
    ['cidade vazia', unidade({ city: '' }), 'city'],
    ['UF inválida', unidade({ state: 'XX' }), 'state'],
    ['IBGE com 3 dígitos', unidade({ ibgeCode: '123' }), 'ibgeCode'],
    ['só latitude', unidade({ latitude: '-23,5' }), 'longitude'],
    ['latitude fora do intervalo', unidade({ latitude: '91', longitude: '0' }), 'latitude'],
    ['longitude fora do intervalo', unidade({ latitude: '0', longitude: '181' }), 'longitude'],
    ['coordenada não numérica', unidade({ latitude: 'abc', longitude: '0' }), 'latitude'],
    ['telefone do responsável inválido', unidade({ receivingContactPhone: '123' }), 'receivingContactPhone'],
    ['dia da semana fora de 0 a 6', unidade({ receivingDays: [7] }), 'receivingDays'],
    ['dias repetidos', unidade({ receivingDays: [1, 1] }), 'receivingDays'],
    ['horário final antes do inicial', unidade({ receivingDays: [1], receivingFrom: '10:00', receivingTo: '09:00' }), 'receivingTo'],
    ['horário só com o inicial', unidade({ receivingDays: [1], receivingFrom: '10:00' }), 'receivingTo'],
    ['horário sem nenhum dia marcado', unidade({ receivingFrom: '08:00', receivingTo: '17:00' }), 'receivingDays'],
    ['horário em formato inválido', unidade({ receivingDays: [1], receivingFrom: '8h', receivingTo: '17:00' }), 'receivingFrom'],
    ['instruções longas', unidade({ accessInstructions: 'x'.repeat(501) }), 'accessInstructions'],
  ] as const)('recusa: %s', (_nome, entrada, campo) => {
    const resultado = validateSiteForm(entrada);
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(Object.keys(resultado.errors)).toContain(campo);
  });
});

const circulo = (parcial: Partial<GeofenceFormInput> = {}): GeofenceFormInput => ({
  name: 'Entrada', shape: 'circle', centerLat: '-23.55', centerLng: '-46.633', radiusM: '200', vertices: [], ...parcial,
});
const quadrado = [{ lat: '-23.55', lng: '-46.63' }, { lat: '-23.55', lng: '-46.62' }, { lat: '-23.54', lng: '-46.62' }, { lat: '-23.54', lng: '-46.63' }];

describe('validateGeofenceForm (RF-013 a RF-015)', () => {
  it('aceita círculo e polígono', () => {
    expect(validateGeofenceForm(circulo())).toMatchObject({ ok: true, value: { shape: 'circle', radiusM: 200, center: { lat: -23.55, lng: -46.633 } } });
    expect(validateGeofenceForm(circulo({ shape: 'polygon', vertices: quadrado, centerLat: '', centerLng: '', radiusM: '' }))).toMatchObject({ ok: true, value: { shape: 'polygon' } });
  });

  it.each([
    ['nome curto', circulo({ name: 'A' }), 'name'],
    ['forma desconhecida', circulo({ shape: 'x' }), 'shape'],
    ['raio de 24 m', circulo({ radiusM: '24' }), 'radiusM'],
    ['raio de 5001 m', circulo({ radiusM: '5001' }), 'radiusM'],
    ['raio decimal', circulo({ radiusM: '25.5' }), 'radiusM'],
    ['centro fora do intervalo', circulo({ centerLat: '95' }), 'centerLat'],
    ['centro vazio', circulo({ centerLat: '', centerLng: '' }), 'centerLat'],
    ['polígono com 2 vértices', circulo({ shape: 'polygon', vertices: quadrado.slice(0, 2) }), 'vertices'],
    ['polígono que se cruza', circulo({ shape: 'polygon', vertices: [quadrado[0]!, quadrado[2]!, quadrado[3]!, quadrado[1]!] }), 'vertices'],
    ['vértice não numérico', circulo({ shape: 'polygon', vertices: [{ lat: 'x', lng: '1' }, quadrado[1]!, quadrado[2]!] }), 'vertices'],
  ] as const)('recusa: %s', (_nome, entrada, campo) => {
    const resultado = validateGeofenceForm(entrada);
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(Object.keys(resultado.errors)).toContain(campo);
  });
});

const veiculo = (parcial: Partial<VehicleFormInput> = {}): VehicleFormInput => ({
  plate: 'abc-1d23', vehicleType: 'truck', vehicleTypeDetail: '', brand: '', model: '', manufactureYear: '', capacityCylinders: '40', maxLoadKg: '', licensingDueOn: '', ...parcial,
});

describe('validateVehicleForm (RF-019 a RF-023)', () => {
  it('aceita o veículo mínimo e normaliza a placa', () => {
    expect(validateVehicleForm(veiculo(), HOJE)).toMatchObject({ ok: true, value: { plate: 'ABC1D23', capacityCylinders: 40, manufactureYear: null, licensingDueOn: null } });
  });

  it.each([
    ['placa inválida', veiculo({ plate: 'AB12345' }), 'plate'],
    ['tipo desconhecido', veiculo({ vehicleType: 'x' }), 'vehicleType'],
    ['tipo outro sem detalhe', veiculo({ vehicleType: 'other' }), 'vehicleTypeDetail'],
    ['detalhe do tipo longo', veiculo({ vehicleType: 'other', vehicleTypeDetail: 'x'.repeat(61) }), 'vehicleTypeDetail'],
    ['marca longa', veiculo({ brand: 'x'.repeat(61) }), 'brand'],
    ['modelo longo', veiculo({ model: 'x'.repeat(61) }), 'model'],
    ['ano de 1979', veiculo({ manufactureYear: '1979' }), 'manufactureYear'],
    ['ano 2028 (além do ano seguinte)', veiculo({ manufactureYear: '2028' }), 'manufactureYear'],
    ['capacidade vazia', veiculo({ capacityCylinders: '' }), 'capacityCylinders'],
    ['capacidade zero', veiculo({ capacityCylinders: '0' }), 'capacityCylinders'],
    ['capacidade 10000', veiculo({ capacityCylinders: '10000' }), 'capacityCylinders'],
    ['capacidade decimal', veiculo({ capacityCylinders: '10.5' }), 'capacityCylinders'],
    ['carga máxima zero', veiculo({ maxLoadKg: '0' }), 'maxLoadKg'],
    ['licenciamento com data inválida', veiculo({ licensingDueOn: '2026-02-30' }), 'licensingDueOn'],
  ] as const)('recusa: %s', (_nome, entrada, campo) => {
    const resultado = validateVehicleForm(entrada, HOJE);
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(Object.keys(resultado.errors)).toContain(campo);
  });

  it('aceita o ano seguinte ao atual e 1980', () => {
    expect(validateVehicleForm(veiculo({ manufactureYear: '2027' }), HOJE).ok).toBe(true);
    expect(validateVehicleForm(veiculo({ manufactureYear: '1980' }), HOJE).ok).toBe(true);
  });

  it('aceita carga com vírgula decimal', () => {
    expect(validateVehicleForm(veiculo({ maxLoadKg: '1200,5' }), HOJE)).toMatchObject({ ok: true, value: { maxLoadKg: 1200.5 } });
  });
});

const motorista = (parcial: Partial<DriverFormInput> = {}): DriverFormInput => ({
  fullName: 'Carlos Pereira', cpf: '529.982.247-25', cnhNumber: '12345678900', cnhCategory: 'D', cnhValidUntil: '2028-01-31', phone: '(11) 91234-5678', justification: '', ...parcial,
});

describe('validateDriverForm (RF-024 a RF-028)', () => {
  it('cadastra com documentos válidos, normalizados', () => {
    expect(validateDriverForm(motorista(), 'create')).toMatchObject({
      ok: true, value: { cpf: '52998224725', cnhNumber: '12345678900', phone: '11912345678', cnhCategory: 'D' },
    });
  });

  it.each([
    ['nome curto', motorista({ fullName: 'A' }), 'fullName'],
    ['CPF inválido', motorista({ cpf: '11111111111' }), 'cpf'],
    ['CNH inválida', motorista({ cnhNumber: '12345678901' }), 'cnhNumber'],
    ['categoria desconhecida', motorista({ cnhCategory: 'Z' }), 'cnhCategory'],
    ['validade ausente', motorista({ cnhValidUntil: '' }), 'cnhValidUntil'],
    ['validade inválida', motorista({ cnhValidUntil: '2028-13-01' }), 'cnhValidUntil'],
    ['telefone inválido', motorista({ phone: '123' }), 'phone'],
    ['CPF ausente no cadastro', motorista({ cpf: '' }), 'cpf'],
    ['CNH ausente no cadastro', motorista({ cnhNumber: '' }), 'cnhNumber'],
  ] as const)('recusa no cadastro: %s', (_nome, entrada, campo) => {
    const resultado = validateDriverForm(entrada, 'create');
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(Object.keys(resultado.errors)).toContain(campo);
  });

  it('na edição, documento em branco significa manter o atual', () => {
    expect(validateDriverForm(motorista({ cpf: '', cnhNumber: '' }), 'edit')).toMatchObject({ ok: true, value: { cpf: null, cnhNumber: null } });
  });

  it('na edição, documento novo exige justificativa', () => {
    const semJustificativa = validateDriverForm(motorista({ cnhNumber: '98765432109' }), 'edit');
    expect(semJustificativa.ok).toBe(false);
    if (!semJustificativa.ok) expect(Object.keys(semJustificativa.errors)).toContain('justification');
    expect(validateDriverForm(motorista({ cnhNumber: '98765432109', justification: 'Correção de digitação' }), 'edit').ok).toBe(true);
  });

  it('na edição, documento novo inválido é recusado', () => {
    const resultado = validateDriverForm(motorista({ cpf: '123', justification: 'Correção de digitação' }), 'edit');
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(Object.keys(resultado.errors)).toContain('cpf');
  });
});

describe('validateJustification (5 a 500 caracteres)', () => {
  it.each([
    ['', false], ['abc', false], ['abcd', false], ['abcde', true], ['  abcde  ', true], ['x'.repeat(500), true], ['x'.repeat(501), false],
  ] as const)('%j', (texto, ok) => {
    expect(validateJustification(texto).ok).toBe(ok);
  });
});
