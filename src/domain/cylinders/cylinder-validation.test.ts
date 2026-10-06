import { describe, expect, it } from 'vitest';
import {
  validateCylinderForm, validateHydrostaticTestForm, validateIdentifierForm, validateJustification, firstErrorField,
} from './cylinder-validation';

const HOJE = '2026-10-05';
const TIPO = '71000000-0000-4000-8000-0000000000a1';

describe('validateCylinderForm (RF-001)', () => {
  const valido = { cylinderTypeId: TIPO, serialNumber: 'AB-123', manufacturer: '', manufactureYear: '', workingPressureBar: '', notes: '' };

  it('aceita só os obrigatórios: tipo e número de série', () => {
    const resultado = validateCylinderForm(valido, HOJE);
    expect(resultado.ok).toBe(true);
    if (resultado.ok) expect(resultado.value).toEqual({ cylinderTypeId: TIPO, serialNumber: 'AB-123', manufacturer: null, manufactureYear: null, workingPressureBar: null, notes: null });
  });

  it('apara espaços do número de série', () => {
    const resultado = validateCylinderForm({ ...valido, serialNumber: '  ab-9  ' }, HOJE);
    expect(resultado.ok && resultado.value.serialNumber).toBe('ab-9');
  });

  it('exige número de série e tipo, com mensagens junto do campo', () => {
    const resultado = validateCylinderForm({ ...valido, serialNumber: '   ', cylinderTypeId: '' }, HOJE);
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) {
      expect(resultado.errors.serialNumber).toBe('Informe o número de série gravado no casco.');
      expect(resultado.errors.cylinderTypeId).toBe('Escolha o tipo de cilindro.');
    }
  });

  it('recusa número de série com mais de 60 caracteres', () => {
    const resultado = validateCylinderForm({ ...valido, serialNumber: 'A'.repeat(61) }, HOJE);
    expect(!resultado.ok && resultado.errors.serialNumber).toBe('Use até 60 caracteres no número de série.');
  });

  it('ano de fabricação: entre 1900 e o ano corrente', () => {
    expect(validateCylinderForm({ ...valido, manufactureYear: '1899' }, HOJE).ok).toBe(false);
    expect(validateCylinderForm({ ...valido, manufactureYear: '2027' }, HOJE).ok).toBe(false);
    expect(validateCylinderForm({ ...valido, manufactureYear: '2026' }, HOJE).ok).toBe(true);
    expect(validateCylinderForm({ ...valido, manufactureYear: '1900' }, HOJE).ok).toBe(true);
    const ruim = validateCylinderForm({ ...valido, manufactureYear: '20x6' }, HOJE);
    expect(!ruim.ok && ruim.errors.manufactureYear).toBe('Informe o ano com quatro dígitos, de 1900 até o ano atual.');
  });

  it('pressão de trabalho maior que zero', () => {
    expect(validateCylinderForm({ ...valido, workingPressureBar: '0' }, HOJE).ok).toBe(false);
    expect(validateCylinderForm({ ...valido, workingPressureBar: '-5' }, HOJE).ok).toBe(false);
    const aceito = validateCylinderForm({ ...valido, workingPressureBar: '200,5' }, HOJE);
    expect(aceito.ok && aceito.value.workingPressureBar).toBe(200.5);
  });

  it('limites de fabricante e observações', () => {
    expect(validateCylinderForm({ ...valido, manufacturer: 'F'.repeat(121) }, HOJE).ok).toBe(false);
    expect(validateCylinderForm({ ...valido, notes: 'x'.repeat(501) }, HOJE).ok).toBe(false);
    expect(validateCylinderForm({ ...valido, notes: 'x'.repeat(500) }, HOJE).ok).toBe(true);
  });
});

describe('validateIdentifierForm (RF-007)', () => {
  it('aceita os quatro tipos', () => {
    for (const kind of ['qr_code', 'data_matrix', 'nfc_tag', 'hull_number']) {
      expect(validateIdentifierForm({ kind, value: 'ABC' }).ok).toBe(true);
    }
  });

  it('recusa tipo desconhecido e valor vazio ou longo demais', () => {
    expect(validateIdentifierForm({ kind: 'barcode', value: 'ABC' }).ok).toBe(false);
    const vazio = validateIdentifierForm({ kind: 'qr_code', value: ' \n ' });
    expect(!vazio.ok && vazio.errors.value).toBe('Informe o valor do identificador.');
    const longo = validateIdentifierForm({ kind: 'qr_code', value: 'A'.repeat(201) });
    expect(!longo.ok && longo.errors.value).toBe('Use até 200 caracteres no identificador.');
  });

  it('normaliza o valor lido por leitor tipo teclado', () => {
    const resultado = validateIdentifierForm({ kind: 'qr_code', value: ' QR-1\n' });
    expect(resultado.ok && resultado.value.value).toBe('QR-1');
  });
});

describe('validateHydrostaticTestForm (RF-019)', () => {
  const aprovado = { performedOn: '2026-10-01', result: 'approved', reportNumber: '', executor: 'Laboratório X', nextDueOn: '2027-10-01', notes: '' };

  it('aceita teste aprovado completo', () => {
    expect(validateHydrostaticTestForm(aprovado, HOJE).ok).toBe(true);
  });

  it('aprovado exige a próxima data; reprovado não', () => {
    const sem = validateHydrostaticTestForm({ ...aprovado, nextDueOn: '' }, HOJE);
    expect(!sem.ok && sem.errors.nextDueOn).toBe('Informe a próxima data do teste.');
    expect(validateHydrostaticTestForm({ ...aprovado, result: 'rejected', nextDueOn: '' }, HOJE).ok).toBe(true);
  });

  it('a data de realização não pode ser futura', () => {
    const futuro = validateHydrostaticTestForm({ ...aprovado, performedOn: '2026-10-06' }, HOJE);
    expect(!futuro.ok && futuro.errors.performedOn).toBe('A data de realização não pode ser futura.');
    expect(validateHydrostaticTestForm({ ...aprovado, performedOn: '2026-10-05', nextDueOn: '2027-10-05' }, HOJE).ok).toBe(true);
  });

  it('a próxima data é posterior à realização e fica a até 10 anos', () => {
    const igual = validateHydrostaticTestForm({ ...aprovado, nextDueOn: '2026-10-01' }, HOJE);
    expect(!igual.ok && igual.errors.nextDueOn).toBe('A próxima data deve ser posterior à data de realização.');
    const longe = validateHydrostaticTestForm({ ...aprovado, nextDueOn: '2036-10-02' }, HOJE);
    expect(!longe.ok && longe.errors.nextDueOn).toBe('A próxima data fica a mais de 10 anos da realização.');
    expect(validateHydrostaticTestForm({ ...aprovado, nextDueOn: '2036-10-01' }, HOJE).ok).toBe(true);
  });

  it('executor de 2 a 120 caracteres; laudo até 60; observações até 500', () => {
    expect(validateHydrostaticTestForm({ ...aprovado, executor: 'L' }, HOJE).ok).toBe(false);
    expect(validateHydrostaticTestForm({ ...aprovado, executor: 'L'.repeat(121) }, HOJE).ok).toBe(false);
    expect(validateHydrostaticTestForm({ ...aprovado, reportNumber: 'R'.repeat(61) }, HOJE).ok).toBe(false);
    expect(validateHydrostaticTestForm({ ...aprovado, notes: 'n'.repeat(501) }, HOJE).ok).toBe(false);
  });

  it('data inválida e resultado desconhecido são recusados', () => {
    expect(validateHydrostaticTestForm({ ...aprovado, performedOn: '31/02/2026' }, HOJE).ok).toBe(false);
    expect(validateHydrostaticTestForm({ ...aprovado, result: 'passou' }, HOJE).ok).toBe(false);
  });
});

describe('validateJustification', () => {
  it('exige de 5 a 500 caracteres', () => {
    const curta = validateJustification('ruim');
    expect(!curta.ok && curta.errors.justification).toBe('Explique o motivo com pelo menos 5 caracteres.');
    expect(validateJustification('motivo ok').ok).toBe(true);
    expect(validateJustification('x'.repeat(501)).ok).toBe(false);
    expect(validateJustification('   ').ok).toBe(false);
  });
});

describe('firstErrorField', () => {
  it('devolve o primeiro campo com erro na ordem do formulário', () => {
    expect(firstErrorField({ notes: 'a', serialNumber: 'b' }, ['cylinderTypeId', 'serialNumber', 'notes'])).toBe('serialNumber');
    expect(firstErrorField({}, ['serialNumber'])).toBeNull();
  });
});
