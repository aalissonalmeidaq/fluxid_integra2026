import { isCalendarDate, todayInSaoPaulo } from '../shared/civil-date';
import { normalizeCnh, normalizeCnpj, normalizeCpf, validateCnh, validateCnpj, validateCpf } from './document-validation';
import { type GeometryResult, type LatLng, validateCircle, validatePolygon } from './geofence-geometry';
import { GEOFENCE_LIMITS } from './geofence-limits';
import { normalizePhone, normalizePostalCode } from './phone-and-postal-code';
import { normalizePlate } from './plate';
import {
  CNH_CATEGORIES, type CnhCategory, GEOFENCE_SHAPES, type GeofenceShape, JUSTIFICATION_MAX, JUSTIFICATION_MIN, MAX_CONTACTS, PERSON_TYPES,
  type PersonType, SEGMENTS, type Segment, UFS, type Uf, VEHICLE_TYPES, type VehicleType,
} from './registry-vocabulary';

// Regras dos formulários dos cadastros da Fase 3 (RF-001 a RF-028, RF-041). Mensagens em português, junto do campo e sem culpar
// a pessoa. O servidor repete todas as regras (supabase/migrations/*registry*); aqui só se evita a ida e volta.

export type FieldErrors = Record<string, string>;
export type ValidationResult<T> = { ok: true; value: T } | { ok: false; errors: FieldErrors };

const done = <T>(errors: FieldErrors, value: () => T): ValidationResult<T> => (Object.keys(errors).length > 0 ? { ok: false, errors } : { ok: true, value: value() });
const fail = (errors: FieldErrors, field: string, message: string): void => {
  if (!(field in errors)) errors[field] = message;
};
const blank = (value: string): boolean => value.trim() === '';
const optionalText = (value: string): string | null => (blank(value) ? null : value.trim());
const lengthBetween = (value: string, min: number, max: number): boolean => value.trim().length >= min && value.trim().length <= max;
const oneOf = <T extends string>(list: readonly T[], value: string): value is T => (list as readonly string[]).includes(value);

// Número decimal digitado com vírgula ou ponto. Vazio é nulo; texto que não é número é inválido.
function parseDecimal(value: string): number | null | 'invalid' {
  const text = value.trim().replace(',', '.');
  if (text === '') return null;
  if (!/^-?\d+(\.\d+)?$/.test(text)) return 'invalid';
  return Number(text);
}
const round6 = (value: number): number => Math.round(value * 1_000_000) / 1_000_000;

// ---------- Justificativa ----------

export function validateJustification(value: string): ValidationResult<string> {
  const text = value.trim();
  return lengthBetween(text, JUSTIFICATION_MIN, JUSTIFICATION_MAX)
    ? { ok: true, value: text }
    : { ok: false, errors: { justification: `Explique em ${JUSTIFICATION_MIN} a ${JUSTIFICATION_MAX} caracteres.` } };
}

// ---------- Cliente e contatos ----------

export interface ContactInput { name: string; role: string; phone: string; email: string; isPrimary: boolean }
export interface ContactValue { name: string; role: string | null; phone: string | null; email: string | null; isPrimary: boolean }
export interface CustomerFormInput {
  personType: PersonType | string; document: string; legalName: string; tradeName: string; segment: Segment | string; segmentDetail: string;
  notes: string; contacts: readonly ContactInput[];
}
export interface CustomerFormValue {
  personType: PersonType; document: string; legalName: string; tradeName: string | null; segment: Segment; segmentDetail: string | null;
  notes: string | null; contacts: ContactValue[];
}

const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function validateCustomerForm(input: CustomerFormInput): ValidationResult<CustomerFormValue> {
  const errors: FieldErrors = {};
  const personType = oneOf(PERSON_TYPES, input.personType) ? input.personType : null;
  if (personType === null) fail(errors, 'personType', 'Escolha pessoa jurídica ou pessoa física.');

  let document = '';
  if (personType === 'legal') {
    document = normalizeCnpj(input.document);
    if (!validateCnpj(document)) fail(errors, 'document', 'Informe um CNPJ válido.');
  } else if (personType === 'individual') {
    document = normalizeCpf(input.document);
    if (!validateCpf(document)) fail(errors, 'document', 'Informe um CPF válido.');
  }

  const nameLabel = personType === 'individual' ? 'o nome' : 'a razão social';
  if (!lengthBetween(input.legalName, 2, 160)) fail(errors, 'legalName', `Informe ${nameLabel} com 2 a 160 caracteres.`);
  if (input.tradeName.length > 160) fail(errors, 'tradeName', 'Use até 160 caracteres no nome fantasia.');

  const segment = oneOf(SEGMENTS, input.segment) ? input.segment : null;
  if (segment === null) fail(errors, 'segment', 'Escolha o segmento.');
  const detail = optionalText(input.segmentDetail);
  if (segment === 'other' && (detail === null || detail.length > 60)) fail(errors, 'segmentDetail', 'Descreva o segmento em até 60 caracteres.');
  if (input.notes.length > 500) fail(errors, 'notes', 'Use até 500 caracteres nas observações.');

  const contacts: ContactValue[] = [];
  if (input.contacts.length > MAX_CONTACTS) fail(errors, 'contacts', `Use no máximo ${MAX_CONTACTS} contatos.`);
  if (input.contacts.filter((contact) => contact.isPrimary).length > 1) fail(errors, 'contacts', 'Marque só um contato como principal.');
  input.contacts.forEach((contact, index) => {
    if (!lengthBetween(contact.name, 2, 120)) fail(errors, `contacts.${index}.name`, 'Informe o nome do contato com 2 a 120 caracteres.');
    if (contact.role.length > 80) fail(errors, `contacts.${index}.role`, 'Use até 80 caracteres na função.');
    const phone = blank(contact.phone) ? null : normalizePhone(contact.phone);
    if (!blank(contact.phone) && phone === null) fail(errors, `contacts.${index}.phone`, 'Informe o telefone com DDD, 10 ou 11 dígitos.');
    const email = optionalText(contact.email)?.toLowerCase() ?? null;
    if (email !== null && (!EMAIL_PATTERN.test(email) || email.length > 160)) fail(errors, `contacts.${index}.email`, 'Informe um e-mail válido.');
    contacts.push({ name: contact.name.trim(), role: optionalText(contact.role), phone, email, isPrimary: contact.isPrimary });
  });

  return done(errors, () => ({
    personType: personType as PersonType, document, legalName: input.legalName.trim(), tradeName: optionalText(input.tradeName),
    segment: segment as Segment, segmentDetail: segment === 'other' ? detail : null, notes: optionalText(input.notes), contacts,
  }));
}

// ---------- Unidade ----------

export interface SiteFormInput {
  name: string; postalCode: string; street: string; number: string; complement: string; district: string; city: string; state: Uf | string;
  ibgeCode: string; latitude: string; longitude: string; receivingContactName: string; receivingContactPhone: string;
  receivingDays: readonly number[]; receivingFrom: string; receivingTo: string; accessInstructions: string;
}
export interface SiteFormValue {
  name: string; postalCode: string; street: string; number: string; complement: string | null; district: string | null; city: string; state: Uf;
  ibgeCode: string | null; latitude: number | null; longitude: number | null; receivingContactName: string | null; receivingContactPhone: string | null;
  receivingDays: number[] | null; receivingFrom: string | null; receivingTo: string | null; accessInstructions: string | null;
  // Origem das coordenadas: `geocoded` só com confirmação da pessoa (RF-065); ausente, o servidor decide (`manual` quando há coordenadas).
  coordinatesSource?: 'manual' | 'geocoded' | null;
}

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export function validateSiteForm(input: SiteFormInput): ValidationResult<SiteFormValue> {
  const errors: FieldErrors = {};
  if (!lengthBetween(input.name, 2, 120)) fail(errors, 'name', 'Informe o nome da unidade com 2 a 120 caracteres.');
  const postalCode = normalizePostalCode(input.postalCode);
  if (postalCode === null) fail(errors, 'postalCode', 'Informe o CEP com 8 dígitos.');
  if (!lengthBetween(input.street, 1, 120)) fail(errors, 'street', 'Informe o logradouro com até 120 caracteres.');
  if (!lengthBetween(input.number, 1, 20)) fail(errors, 'number', 'Informe o número (ou S/N) com até 20 caracteres.');
  if (input.complement.length > 80) fail(errors, 'complement', 'Use até 80 caracteres no complemento.');
  if (input.district.length > 80) fail(errors, 'district', 'Use até 80 caracteres no bairro.');
  if (!lengthBetween(input.city, 1, 80)) fail(errors, 'city', 'Informe a cidade com até 80 caracteres.');
  const state = oneOf(UFS, input.state) ? input.state : null;
  if (state === null) fail(errors, 'state', 'Escolha uma UF válida.');
  const ibge = optionalText(input.ibgeCode);
  if (ibge !== null && !/^\d{7}$/.test(ibge)) fail(errors, 'ibgeCode', 'O código do município tem 7 dígitos.');

  const latitude = parseDecimal(input.latitude);
  const longitude = parseDecimal(input.longitude);
  if (latitude === 'invalid') fail(errors, 'latitude', 'Informe a latitude em graus decimais.');
  if (longitude === 'invalid') fail(errors, 'longitude', 'Informe a longitude em graus decimais.');
  if (latitude !== 'invalid' && longitude !== 'invalid') {
    if (latitude !== null && longitude === null) fail(errors, 'longitude', 'Informe a longitude junto com a latitude.');
    if (latitude === null && longitude !== null) fail(errors, 'latitude', 'Informe a latitude junto com a longitude.');
    if (latitude !== null && (latitude < -90 || latitude > 90)) fail(errors, 'latitude', 'A latitude vai de -90 a 90.');
    if (longitude !== null && (longitude < -180 || longitude > 180)) fail(errors, 'longitude', 'A longitude vai de -180 a 180.');
  }

  const phone = blank(input.receivingContactPhone) ? null : normalizePhone(input.receivingContactPhone);
  if (!blank(input.receivingContactPhone) && phone === null) fail(errors, 'receivingContactPhone', 'Informe o telefone com DDD, 10 ou 11 dígitos.');
  if (input.receivingContactName.length > 120) fail(errors, 'receivingContactName', 'Use até 120 caracteres no nome do responsável.');

  const days = [...input.receivingDays];
  if (days.some((day) => !Number.isInteger(day) || day < 0 || day > 6) || new Set(days).size !== days.length) {
    fail(errors, 'receivingDays', 'Marque dias da semana sem repetir.');
  }
  const from = optionalText(input.receivingFrom);
  const to = optionalText(input.receivingTo);
  if (from !== null || to !== null) {
    if (from !== null && !TIME_PATTERN.test(from)) fail(errors, 'receivingFrom', 'Informe o horário inicial no formato HH:MM.');
    if (to !== null && !TIME_PATTERN.test(to)) fail(errors, 'receivingTo', 'Informe o horário final no formato HH:MM.');
    if (from === null) fail(errors, 'receivingFrom', 'Informe o horário inicial.');
    if (to === null) fail(errors, 'receivingTo', 'Informe o horário final.');
    if (from !== null && to !== null && TIME_PATTERN.test(from) && TIME_PATTERN.test(to) && to <= from) fail(errors, 'receivingTo', 'O horário final deve ser depois do inicial.');
    if (days.length === 0) fail(errors, 'receivingDays', 'Marque ao menos um dia de recebimento.');
  }
  if (input.accessInstructions.length > 500) fail(errors, 'accessInstructions', 'Use até 500 caracteres nas instruções de acesso.');

  return done(errors, () => ({
    name: input.name.trim(), postalCode: postalCode as string, street: input.street.trim(), number: input.number.trim(),
    complement: optionalText(input.complement), district: optionalText(input.district), city: input.city.trim(), state: state as Uf, ibgeCode: ibge,
    latitude: typeof latitude === 'number' ? round6(latitude) : null, longitude: typeof longitude === 'number' ? round6(longitude) : null,
    receivingContactName: optionalText(input.receivingContactName), receivingContactPhone: phone,
    receivingDays: days.length > 0 ? [...days].sort((a, b) => a - b) : null, receivingFrom: from, receivingTo: to,
    accessInstructions: optionalText(input.accessInstructions),
  }));
}

// ---------- Geocerca ----------

export interface VertexInput { lat: string; lng: string }
export interface GeofenceFormInput {
  name: string; shape: GeofenceShape | string; centerLat: string; centerLng: string; radiusM: string; vertices: readonly VertexInput[];
}
export type GeofenceFormValue =
  | { name: string; shape: 'circle'; center: LatLng; radiusM: number }
  | { name: string; shape: 'polygon'; vertices: LatLng[] };

const radiusMessage = `Informe um raio inteiro de ${GEOFENCE_LIMITS.radiusMinM} m a ${GEOFENCE_LIMITS.radiusMaxM} m.`;
const verticesMessage = (result: Extract<GeometryResult, { ok: false }>): string => {
  switch (result.reason) {
    case 'vertex_count': return `O polígono precisa de ${GEOFENCE_LIMITS.verticesMin} a ${GEOFENCE_LIMITS.verticesMax} vértices.`;
    case 'self_intersection': return 'As arestas do polígono se cruzam ou se tocam. Reordene os vértices.';
    case 'zero_area': return 'Os vértices estão alinhados: o polígono não tem área.';
    case 'duplicate_vertex': return 'Há vértices repetidos em sequência (inclusive o último igual ao primeiro).';
    case 'coordinate_range': return 'Latitude vai de -90 a 90 e longitude de -180 a 180.';
    default: return 'Revise os vértices do polígono.';
  }
};

export function validateGeofenceForm(input: GeofenceFormInput): ValidationResult<GeofenceFormValue> {
  const errors: FieldErrors = {};
  if (!lengthBetween(input.name, 2, 120)) fail(errors, 'name', 'Informe o nome da geocerca com 2 a 120 caracteres.');
  const shape = oneOf(GEOFENCE_SHAPES, input.shape) ? input.shape : null;
  if (shape === null) {
    fail(errors, 'shape', 'Escolha círculo ou polígono.');
    return { ok: false, errors };
  }

  if (shape === 'circle') {
    const lat = parseDecimal(input.centerLat);
    const lng = parseDecimal(input.centerLng);
    const radius = parseDecimal(input.radiusM);
    if (typeof lat !== 'number') fail(errors, 'centerLat', 'Informe a latitude do centro.');
    if (typeof lng !== 'number') fail(errors, 'centerLng', 'Informe a longitude do centro.');
    if (typeof radius !== 'number') fail(errors, 'radiusM', radiusMessage);
    if (typeof lat === 'number' && typeof lng === 'number' && typeof radius === 'number') {
      const result = validateCircle({ lat, lng }, radius);
      if (!result.ok) fail(errors, result.reason === 'coordinate_range' ? 'centerLat' : 'radiusM', result.reason === 'coordinate_range' ? 'Latitude vai de -90 a 90 e longitude de -180 a 180.' : radiusMessage);
    }
    return done(errors, () => ({ name: input.name.trim(), shape: 'circle' as const, center: { lat: round6(lat as number), lng: round6(lng as number) }, radiusM: radius as number }));
  }

  const vertices: LatLng[] = [];
  let numeric = true;
  for (const vertex of input.vertices) {
    const lat = parseDecimal(vertex.lat);
    const lng = parseDecimal(vertex.lng);
    if (typeof lat !== 'number' || typeof lng !== 'number') numeric = false;
    else vertices.push({ lat, lng });
  }
  if (!numeric) fail(errors, 'vertices', 'Informe latitude e longitude numéricas em todos os vértices.');
  else {
    const result = validatePolygon(vertices);
    if (!result.ok) fail(errors, 'vertices', verticesMessage(result));
  }
  return done(errors, () => ({ name: input.name.trim(), shape: 'polygon' as const, vertices: vertices.map((vertex) => ({ lat: round6(vertex.lat), lng: round6(vertex.lng) })) }));
}

// ---------- Veículo ----------

export interface VehicleFormInput {
  plate: string; vehicleType: VehicleType | string; vehicleTypeDetail: string; brand: string; model: string; manufactureYear: string;
  capacityCylinders: string; maxLoadKg: string; licensingDueOn: string;
}
export interface VehicleFormValue {
  plate: string; vehicleType: VehicleType; vehicleTypeDetail: string | null; brand: string | null; model: string | null; manufactureYear: number | null;
  capacityCylinders: number; maxLoadKg: number | null; licensingDueOn: string | null;
}

export function validateVehicleForm(input: VehicleFormInput, today: string = todayInSaoPaulo()): ValidationResult<VehicleFormValue> {
  const errors: FieldErrors = {};
  const plate = normalizePlate(input.plate);
  if (plate === null) fail(errors, 'plate', 'Informe a placa no padrão ABC-1234 ou ABC1D23.');
  const type = oneOf(VEHICLE_TYPES, input.vehicleType) ? input.vehicleType : null;
  if (type === null) fail(errors, 'vehicleType', 'Escolha o tipo do veículo.');
  const detail = optionalText(input.vehicleTypeDetail);
  if (type === 'other' && (detail === null || detail.length > 60)) fail(errors, 'vehicleTypeDetail', 'Descreva o tipo em até 60 caracteres.');
  if (input.brand.length > 60) fail(errors, 'brand', 'Use até 60 caracteres na marca.');
  if (input.model.length > 60) fail(errors, 'model', 'Use até 60 caracteres no modelo.');

  let year: number | null = null;
  if (!blank(input.manufactureYear)) {
    const parsed = parseDecimal(input.manufactureYear);
    const maxYear = Number(today.slice(0, 4)) + 1;
    if (typeof parsed !== 'number' || !Number.isInteger(parsed) || parsed < 1980 || parsed > maxYear) fail(errors, 'manufactureYear', `Informe o ano de 1980 até ${maxYear}.`);
    else year = parsed;
  }

  const capacity = parseDecimal(input.capacityCylinders);
  if (typeof capacity !== 'number' || !Number.isInteger(capacity) || capacity < 1 || capacity > 9999) fail(errors, 'capacityCylinders', 'Informe a capacidade em cilindros, de 1 a 9999.');

  let load: number | null = null;
  if (!blank(input.maxLoadKg)) {
    const parsed = parseDecimal(input.maxLoadKg);
    if (typeof parsed !== 'number' || parsed <= 0 || parsed >= 10_000_000) fail(errors, 'maxLoadKg', 'Informe a carga máxima em kg, maior que zero.');
    else load = Math.round(parsed * 100) / 100;
  }

  const due = optionalText(input.licensingDueOn);
  if (due !== null && !isCalendarDate(due)) fail(errors, 'licensingDueOn', 'Informe uma data válida para o vencimento do licenciamento.');

  return done(errors, () => ({
    plate: plate as string, vehicleType: type as VehicleType, vehicleTypeDetail: type === 'other' ? detail : null, brand: optionalText(input.brand),
    model: optionalText(input.model), manufactureYear: year, capacityCylinders: capacity as number, maxLoadKg: load, licensingDueOn: due,
  }));
}

// ---------- Motorista ----------

export interface DriverFormInput {
  fullName: string; cpf: string; cnhNumber: string; cnhCategory: CnhCategory | string; cnhValidUntil: string; phone: string; justification: string;
}
export interface DriverFormValue {
  fullName: string; cpf: string | null; cnhNumber: string | null; cnhCategory: CnhCategory; cnhValidUntil: string; phone: string | null; justification: string | null;
}

// No cadastro, CPF e CNH são obrigatórios. Na edição, em branco significa manter o atual; um valor novo exige justificativa.
export function validateDriverForm(input: DriverFormInput, mode: 'create' | 'edit'): ValidationResult<DriverFormValue> {
  const errors: FieldErrors = {};
  if (!lengthBetween(input.fullName, 2, 160)) fail(errors, 'fullName', 'Informe o nome com 2 a 160 caracteres.');

  const cpfDigits = normalizeCpf(input.cpf);
  const cnhDigits = normalizeCnh(input.cnhNumber);
  const cpfGiven = !blank(input.cpf);
  const cnhGiven = !blank(input.cnhNumber);
  if (mode === 'create' || cpfGiven) {
    if (!validateCpf(cpfDigits)) fail(errors, 'cpf', 'Informe um CPF válido.');
  }
  if (mode === 'create' || cnhGiven) {
    if (!validateCnh(cnhDigits)) fail(errors, 'cnhNumber', 'Informe um número de CNH válido, com 11 dígitos.');
  }

  const category = oneOf(CNH_CATEGORIES, input.cnhCategory) ? input.cnhCategory : null;
  if (category === null) fail(errors, 'cnhCategory', 'Escolha a categoria da CNH.');
  const validUntil = input.cnhValidUntil.trim();
  if (validUntil === '' || !isCalendarDate(validUntil)) fail(errors, 'cnhValidUntil', 'Informe a validade da CNH.');
  const phone = blank(input.phone) ? null : normalizePhone(input.phone);
  if (!blank(input.phone) && phone === null) fail(errors, 'phone', 'Informe o telefone com DDD, 10 ou 11 dígitos.');

  let justification: string | null = null;
  if (mode === 'edit' && (cpfGiven || cnhGiven)) {
    const result = validateJustification(input.justification);
    if (!result.ok) errors.justification = 'Explique a correção do documento em 5 a 500 caracteres.';
    else justification = result.value;
  }

  return done(errors, () => ({
    fullName: input.fullName.trim(), cpf: cpfGiven ? cpfDigits : null, cnhNumber: cnhGiven ? cnhDigits : null, cnhCategory: category as CnhCategory,
    cnhValidUntil: validUntil, phone, justification,
  }));
}
