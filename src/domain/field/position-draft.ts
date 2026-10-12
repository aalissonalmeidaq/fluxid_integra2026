import { isStale, positionOrigin, type PositionOrigin, type PositionReading } from './position-quality';

// Rascunho da posição de uma tela (Spec 009, RF-009 a RF-014): as coordenadas ficam em texto (como a pessoa as vê e edita), com a leitura
// do GPS ao lado. A origem registrada sempre corresponde ao dado: "GPS" só para a leitura do aparelho sem edição manual, "informada"
// para coordenadas digitadas ou editadas, "no endereço da unidade" só com a marca. Nada disto vai para o aparelho: vive só na tela.
export interface GpsMeta {
  accuracyM: number;
  // Instante da leitura, em milissegundos.
  readAt: number;
}

export interface PositionDraft {
  latitude: string;
  longitude: string;
  atSiteAddress: boolean;
  // Presente só enquanto as coordenadas são, sem edição, as da leitura do aparelho.
  gps: GpsMeta | null;
}

export const EMPTY_POSITION_DRAFT: PositionDraft = { latitude: '', longitude: '', atSiteAddress: false, gps: null };

const hasText = (value: string): boolean => value.trim() !== '';

// Seis casas decimais, como a coluna do banco: cerca de 10 cm.
const format = (value: number): string => value.toFixed(6);

// A leitura do aparelho preenche as coordenadas e desmarca "no endereço da unidade" (nunca valem juntos).
export function applyReading(draft: PositionDraft, reading: PositionReading): PositionDraft {
  return { ...draft, latitude: format(reading.latitude), longitude: format(reading.longitude), atSiteAddress: false, gps: { accuracyM: reading.accuracyM, readAt: reading.readAt } };
}

// Editar o número à mão tira a origem "GPS" e, se não for em branco, desmarca "no endereço da unidade".
export function editCoordinate(draft: PositionDraft, field: 'latitude' | 'longitude', value: string): PositionDraft {
  return { ...draft, [field]: value, gps: null, atSiteAddress: hasText(value) ? false : draft.atSiteAddress };
}

// Marcar "no endereço da unidade" limpa as coordenadas e a leitura; desmarcar deixa tudo vazio.
export function toggleSiteAddress(draft: PositionDraft, checked: boolean): PositionDraft {
  return checked ? { latitude: '', longitude: '', atSiteAddress: true, gps: null } : { ...draft, atSiteAddress: false };
}

export function hasTypedCoordinates(draft: PositionDraft): boolean {
  return draft.gps === null && (hasText(draft.latitude) || hasText(draft.longitude));
}

// "Usar minha posição" só substitui coordenadas digitadas à mão depois de confirmação; a leitura anterior do GPS se troca sem perguntar.
export function replacingNeedsConfirmation(draft: PositionDraft): boolean {
  return hasTypedCoordinates(draft);
}

export function draftOrigin(draft: PositionDraft): PositionOrigin | null {
  return positionOrigin({
    atSiteAddress: draft.atSiteAddress, hasCoordinates: hasText(draft.latitude) || hasText(draft.longitude), fromGps: draft.gps !== null, editedByHand: false,
  });
}

// Só uma leitura do GPS fica velha (acima de 2 minutos); coordenadas digitadas valem como foram escritas.
export function isDraftStale(draft: PositionDraft, now: number): boolean {
  return draft.gps !== null && isStale(draft.gps.readAt, now);
}

export interface ArrivalPositionErrors {
  latitude?: string;
  longitude?: string;
  position?: string;
}
export type ArrivalPositionValidation = { ok: true; payload: PositionPayload } | { ok: false; errors: ArrivalPositionErrors };

// Chegada com a posição (o modo "com a posição" da tela): coordenadas completas e válidas, lidas pelo aparelho ou digitadas. Mensagens do
// mesmo texto do formulário da entrega.
export function validateArrivalPosition(draft: PositionDraft): ArrivalPositionValidation {
  const errors: ArrivalPositionErrors = {};
  const blankLatitude = !hasText(draft.latitude);
  const blankLongitude = !hasText(draft.longitude);
  if (blankLatitude && blankLongitude) return { ok: false, errors: { position: 'Leia a posição ou digite a latitude e a longitude.' } };
  if (blankLatitude !== blankLongitude) return { ok: false, errors: { [blankLatitude ? 'latitude' : 'longitude']: 'Informe a latitude e a longitude juntas.' } };
  const latitude = parse(draft.latitude);
  const longitude = parse(draft.longitude);
  if (latitude === null) errors.latitude = 'Informe a latitude em graus decimais.';
  else if (Math.abs(latitude) > 90) errors.latitude = 'A latitude vai de −90 a 90.';
  if (longitude === null) errors.longitude = 'Informe a longitude em graus decimais.';
  else if (Math.abs(longitude) > 180) errors.longitude = 'A longitude vai de −180 a 180.';
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  const payload = positionPayload(draft);
  return payload ? { ok: true, payload } : { ok: false, errors: { position: 'Leia a posição ou digite a latitude e a longitude.' } };
}

export interface PositionPayload {
  latitude: number;
  longitude: number;
  accuracyM: number | null;
  source: 'gps' | 'typed';
  // Instante da leitura em ISO 8601; nulo nas coordenadas digitadas.
  readAt: string | null;
}

const parse = (value: string): number | null => {
  const text = value.trim().replace(',', '.');
  return /^-?\d+(\.\d+)?$/.test(text) ? Number(text) : null;
};

// Posição da chegada: coordenadas completas e válidas, ou nada. "No endereço da unidade" não é posição da chegada (só da entrega), e
// coordenadas incompletas ficam a cargo da validação do formulário, que explica o erro.
export function positionPayload(draft: PositionDraft): PositionPayload | null {
  const latitude = parse(draft.latitude);
  const longitude = parse(draft.longitude);
  if (draft.atSiteAddress || latitude === null || longitude === null) return null;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  return draft.gps
    ? { latitude, longitude, accuracyM: draft.gps.accuracyM, source: 'gps', readAt: new Date(draft.gps.readAt).toISOString() }
    : { latitude, longitude, accuracyM: null, source: 'typed', readAt: null };
}
