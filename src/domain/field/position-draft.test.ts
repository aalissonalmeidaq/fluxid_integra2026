// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  validateArrivalPosition, applyReading, draftOrigin, EMPTY_POSITION_DRAFT, editCoordinate, hasTypedCoordinates, isDraftStale, positionPayload, replacingNeedsConfirmation,
  toggleSiteAddress, type PositionDraft,
} from './position-draft';

// RF-009 a RF-014, RN-003: o rascunho de posição de uma tela. A origem registrada sempre corresponde ao dado, e coordenadas digitadas só
// são substituídas pelo GPS depois de confirmação.
const READING = { latitude: -23.55052, longitude: -46.633309, accuracyM: 12.4, readAt: 1_000_000 };

describe('applyReading', () => {
  it('preenche as coordenadas em texto, guarda a precisão e o horário e marca a origem "GPS"', () => {
    const draft = applyReading(EMPTY_POSITION_DRAFT, READING);
    expect(draft).toEqual({ latitude: '-23.550520', longitude: '-46.633309', atSiteAddress: false, gps: { accuracyM: 12.4, readAt: 1_000_000 } });
    expect(draftOrigin(draft)).toBe('gps');
  });

  it('desmarca "no endereço da unidade": coordenadas e endereço nunca valem juntos', () => {
    const draft = applyReading({ ...EMPTY_POSITION_DRAFT, atSiteAddress: true }, READING);
    expect(draft.atSiteAddress).toBe(false);
    expect(draftOrigin(draft)).toBe('gps');
  });

  it('uma nova leitura substitui a anterior', () => {
    const first = applyReading(EMPTY_POSITION_DRAFT, READING);
    const second = applyReading(first, { ...READING, latitude: -23.5, accuracyM: 5, readAt: 2_000_000 });
    expect(second.gps).toEqual({ accuracyM: 5, readAt: 2_000_000 });
    expect(second.latitude).toBe('-23.500000');
  });
});

describe('editCoordinate', () => {
  it('editar o número à mão tira a origem "GPS": passa a ser "informada"', () => {
    const edited = editCoordinate(applyReading(EMPTY_POSITION_DRAFT, READING), 'latitude', '-23.55');
    expect(edited.gps).toBeNull();
    expect(draftOrigin(edited)).toBe('typed');
  });

  it('digitar uma coordenada desmarca "no endereço da unidade"', () => {
    const edited = editCoordinate({ ...EMPTY_POSITION_DRAFT, atSiteAddress: true }, 'longitude', '-46,6');
    expect(edited.atSiteAddress).toBe(false);
    expect(edited.longitude).toBe('-46,6');
  });

  it('apagar tudo deixa sem posição e sem origem', () => {
    let draft = editCoordinate(EMPTY_POSITION_DRAFT, 'latitude', '-23.5');
    draft = editCoordinate(draft, 'latitude', '');
    expect(draftOrigin(draft)).toBeNull();
  });

  it('o campo em branco não desmarca o endereço da unidade', () => {
    expect(editCoordinate({ ...EMPTY_POSITION_DRAFT, atSiteAddress: true }, 'latitude', '  ').atSiteAddress).toBe(true);
  });
});

describe('toggleSiteAddress', () => {
  it('marcar o endereço da unidade limpa as coordenadas e a leitura do GPS', () => {
    const draft = toggleSiteAddress(applyReading(EMPTY_POSITION_DRAFT, READING), true);
    expect(draft).toEqual({ latitude: '', longitude: '', atSiteAddress: true, gps: null });
    expect(draftOrigin(draft)).toBe('site_address');
  });

  it('desmarcar mantém tudo vazio', () => {
    expect(toggleSiteAddress({ ...EMPTY_POSITION_DRAFT, atSiteAddress: true }, false)).toEqual(EMPTY_POSITION_DRAFT);
  });
});

describe('draftOrigin', () => {
  it('sem coordenadas e sem endereço da unidade, não há origem', () => {
    expect(draftOrigin(EMPTY_POSITION_DRAFT)).toBeNull();
  });

  it('coordenadas digitadas são "informada"', () => {
    expect(draftOrigin({ latitude: '-23.5', longitude: '-46.6', atSiteAddress: false, gps: null })).toBe('typed');
  });
});

describe('confirmação antes de substituir (RF-010)', () => {
  it('coordenadas digitadas à mão pedem confirmação', () => {
    const typed: PositionDraft = { latitude: '-23.5', longitude: '', atSiteAddress: false, gps: null };
    expect(hasTypedCoordinates(typed)).toBe(true);
    expect(replacingNeedsConfirmation(typed)).toBe(true);
  });

  it('a leitura anterior do GPS é substituída sem perguntar', () => {
    const fromGps = applyReading(EMPTY_POSITION_DRAFT, READING);
    expect(replacingNeedsConfirmation(fromGps)).toBe(false);
  });

  it('campo vazio e endereço da unidade marcado não pedem confirmação', () => {
    expect(replacingNeedsConfirmation(EMPTY_POSITION_DRAFT)).toBe(false);
    expect(replacingNeedsConfirmation({ ...EMPTY_POSITION_DRAFT, atSiteAddress: true })).toBe(false);
  });
});

describe('isDraftStale (RF-011)', () => {
  it('só uma leitura do GPS pode ficar velha, e só acima de 2 minutos', () => {
    const draft = applyReading(EMPTY_POSITION_DRAFT, READING);
    expect(isDraftStale(draft, READING.readAt + 120_000)).toBe(false);
    expect(isDraftStale(draft, READING.readAt + 120_001)).toBe(true);
  });

  it('coordenadas digitadas nunca ficam velhas', () => {
    expect(isDraftStale({ latitude: '-23.5', longitude: '-46.6', atSiteAddress: false, gps: null }, Number.MAX_SAFE_INTEGER)).toBe(false);
  });
});

describe('positionPayload', () => {
  it('da leitura do GPS: coordenadas em número, precisão, origem e horário em ISO', () => {
    const payload = positionPayload(applyReading(EMPTY_POSITION_DRAFT, READING));
    expect(payload).toEqual({ latitude: -23.55052, longitude: -46.633309, accuracyM: 12.4, source: 'gps', readAt: new Date(1_000_000).toISOString() });
  });

  it('das coordenadas digitadas: origem "informada" e sem precisão nem horário', () => {
    expect(positionPayload({ latitude: '-23,5', longitude: '-46.6', atSiteAddress: false, gps: null })).toEqual({ latitude: -23.5, longitude: -46.6, accuracyM: null, source: 'typed', readAt: null });
  });

  it('sem posição, devolve nulo', () => {
    expect(positionPayload(EMPTY_POSITION_DRAFT)).toBeNull();
  });

  it('"no endereço da unidade" não é posição da chegada: devolve nulo', () => {
    expect(positionPayload({ ...EMPTY_POSITION_DRAFT, atSiteAddress: true })).toBeNull();
  });

  it('coordenadas incompletas ou inválidas devolvem nulo (a validação do formulário explica o erro)', () => {
    expect(positionPayload({ latitude: '-23.5', longitude: '', atSiteAddress: false, gps: null })).toBeNull();
    expect(positionPayload({ latitude: 'abc', longitude: '-46.6', atSiteAddress: false, gps: null })).toBeNull();
  });
});

describe('validateArrivalPosition', () => {
  const typed = (latitude: string, longitude: string): PositionDraft => ({ latitude, longitude, atSiteAddress: false, gps: null });

  it('coordenadas válidas viram a posição da chegada', () => {
    expect(validateArrivalPosition(typed('-23,5505', '-46.6333'))).toEqual({
      ok: true, payload: { latitude: -23.5505, longitude: -46.6333, accuracyM: null, source: 'typed', readAt: null },
    });
  });

  it('a leitura do GPS segue com a precisão e o horário', () => {
    const result = validateArrivalPosition(applyReading(EMPTY_POSITION_DRAFT, READING));
    expect(result).toMatchObject({ ok: true, payload: { source: 'gps', accuracyM: 12.4 } });
  });

  it('sem nada, pede para ler a posição ou digitar as coordenadas', () => {
    expect(validateArrivalPosition(EMPTY_POSITION_DRAFT)).toEqual({ ok: false, errors: { position: 'Leia a posição ou digite a latitude e a longitude.' } });
  });

  it('só uma das coordenadas: aponta a que falta', () => {
    expect(validateArrivalPosition(typed('-23.5', ''))).toEqual({ ok: false, errors: { longitude: 'Informe a latitude e a longitude juntas.' } });
    expect(validateArrivalPosition(typed('', '-46.6'))).toEqual({ ok: false, errors: { latitude: 'Informe a latitude e a longitude juntas.' } });
  });

  it('formato inválido e fora do intervalo', () => {
    expect(validateArrivalPosition(typed('abc', '-46.6'))).toEqual({ ok: false, errors: { latitude: 'Informe a latitude em graus decimais.' } });
    expect(validateArrivalPosition(typed('91', '-46.6'))).toEqual({ ok: false, errors: { latitude: 'A latitude vai de −90 a 90.' } });
    expect(validateArrivalPosition(typed('-23.5', '-181'))).toEqual({ ok: false, errors: { longitude: 'A longitude vai de −180 a 180.' } });
  });

  it('reporta os dois campos de uma vez', () => {
    expect(validateArrivalPosition(typed('x', 'y'))).toEqual({ ok: false, errors: { latitude: 'Informe a latitude em graus decimais.', longitude: 'Informe a longitude em graus decimais.' } });
  });
});
