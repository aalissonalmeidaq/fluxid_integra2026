import { isCalendarDate, todayInSaoPaulo } from '../shared/civil-date';
import type { FieldErrors, ValidationResult } from '../registry/registry-validation';
import { TRIP_LIMITS } from './trip-limits';
import { describeTripPlanIssue, summarizeTripPlan, type PlannedStop } from './trip-summary';

// Regras dos formulários de viagem (RF-001 a RF-003, RF-013 a RF-019, RF-021). Mensagens em português, junto do campo e sem culpar
// a pessoa. O servidor repete todas as regras (supabase/migrations/*trips*); aqui só se evita a ida e volta.

const done = <T>(errors: FieldErrors, value: () => T): ValidationResult<T> => (Object.keys(errors).length > 0 ? { ok: false, errors } : { ok: true, value: value() });
const fail = (errors: FieldErrors, field: string, message: string): void => {
  if (!(field in errors)) errors[field] = message;
};
const optionalText = (value: string): string | null => (value.trim() === '' ? null : value.trim());
const between = (value: string, min: number, max: number): boolean => value.trim().length >= min && value.trim().length <= max;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Justificativa de exceção, cancelamento e retorno ao estoque.
export function validateTripJustification(value: string, required = true): ValidationResult<string | null> {
  const text = value.trim();
  if (text === '' && !required) return { ok: true, value: null };
  return between(text, TRIP_LIMITS.justificationMin, TRIP_LIMITS.justificationMax)
    ? { ok: true, value: text }
    : { ok: false, errors: { justification: `Explique em ${TRIP_LIMITS.justificationMin} a ${TRIP_LIMITS.justificationMax} caracteres.` } };
}

// ---------- Planejamento ----------

export interface TripFormInput {
  plannedDate: string;
  vehicleId: string;
  driverId: string;
  notes: string;
  stops: readonly PlannedStop[];
  vehicleCapacity: number | null;
}
export interface TripFormValue {
  plannedDate: string;
  vehicleId: string;
  driverId: string;
  notes: string | null;
  stops: { id?: string; siteId: string; cylinderIds: string[] }[];
}

// Na criação a data prevista é hoje ou depois (fuso de São Paulo); na edição de viagem já planejada ela pode ter passado (a leitura
// marca "atrasada"), então só precisa ser uma data real.
export function validateTripForm(input: TripFormInput, mode: 'create' | 'edit', today: string = todayInSaoPaulo()): ValidationResult<TripFormValue> {
  const errors: FieldErrors = {};
  if (input.plannedDate.trim() === '') fail(errors, 'plannedDate', 'Informe a data prevista.');
  else if (!isCalendarDate(input.plannedDate)) fail(errors, 'plannedDate', 'Informe uma data válida.');
  else if (mode === 'create' && input.plannedDate < today) fail(errors, 'plannedDate', 'Escolha hoje ou uma data futura.');
  if (!UUID.test(input.vehicleId)) fail(errors, 'vehicleId', 'Escolha o veículo.');
  if (!UUID.test(input.driverId)) fail(errors, 'driverId', 'Escolha o motorista.');
  if (input.notes.trim().length > TRIP_LIMITS.maxNotes) fail(errors, 'notes', `Use até ${TRIP_LIMITS.maxNotes} caracteres nas observações.`);

  input.stops.forEach((stop, index) => {
    if (!UUID.test(stop.siteId)) fail(errors, `stops.${index}.siteId`, 'Escolha a unidade da parada.');
  });
  const summary = summarizeTripPlan(input.stops, input.vehicleCapacity);
  for (const issue of summary.issues) {
    const field = 'stopIndex' in issue ? `stops.${issue.stopIndex}.cylinders` : issue.code === 'CAPACITY_EXCEEDED' || issue.code === 'DUPLICATE_CYLINDER' ? 'cylinders' : 'stops';
    fail(errors, field, describeTripPlanIssue(issue));
  }

  return done(errors, () => ({
    plannedDate: input.plannedDate,
    vehicleId: input.vehicleId,
    driverId: input.driverId,
    notes: optionalText(input.notes),
    stops: input.stops.map((stop) => ({ ...(stop.id ? { id: stop.id } : {}), siteId: stop.siteId, cylinderIds: [...stop.cylinderIds] })),
  }));
}

// ---------- Entrega ----------

export interface DeliveryResultInput {
  itemId: string;
  delivered: boolean;
  reason: string;
}
export interface DeliveryFormInput {
  // Data e hora no formato do campo `datetime-local` (AAAA-MM-DDTHH:MM), no fuso do aparelho.
  deliveredAt: string;
  recipientName: string;
  recipientRole: string;
  latitude: string;
  longitude: string;
  atSiteAddress: boolean;
  results: readonly DeliveryResultInput[];
}
export interface DeliveryFormValue {
  deliveredAt: string;
  recipientName: string;
  recipientRole: string | null;
  latitude: number | null;
  longitude: number | null;
  atSiteAddress: boolean;
  results: { itemId: string; delivered: boolean; reason?: string }[];
}

function parseCoordinate(value: string): number | null | 'invalid' {
  const text = value.trim().replace(',', '.');
  if (text === '') return null;
  return /^-?\d+(\.\d+)?$/.test(text) ? Number(text) : 'invalid';
}

// O horário informado não pode estar no futuro; o servidor repete a conferência.
// Na correção só de dados do recebedor (sem cilindros pendentes) a lista de resultados pode ser vazia.
export function validateDeliveryForm(input: DeliveryFormInput, now: Date = new Date(), options: { allowNoResults?: boolean } = {}): ValidationResult<DeliveryFormValue> {
  const errors: FieldErrors = {};
  const moment = input.deliveredAt === '' ? Number.NaN : new Date(input.deliveredAt).getTime();
  if (Number.isNaN(moment)) fail(errors, 'deliveredAt', 'Informe a data e a hora da entrega.');
  else if (moment > now.getTime()) fail(errors, 'deliveredAt', 'O horário da entrega não pode estar no futuro.');

  if (!between(input.recipientName, TRIP_LIMITS.recipientNameMin, TRIP_LIMITS.recipientNameMax)) {
    fail(errors, 'recipientName', `Informe o nome de quem recebeu, de ${TRIP_LIMITS.recipientNameMin} a ${TRIP_LIMITS.recipientNameMax} caracteres.`);
  }
  if (input.recipientRole.trim().length > TRIP_LIMITS.recipientRoleMax) fail(errors, 'recipientRole', `Use até ${TRIP_LIMITS.recipientRoleMax} caracteres na função.`);

  const latitude = parseCoordinate(input.latitude);
  const longitude = parseCoordinate(input.longitude);
  if (latitude === 'invalid') fail(errors, 'latitude', 'Informe a latitude em graus decimais.');
  else if (latitude !== null && (latitude < -90 || latitude > 90)) fail(errors, 'latitude', 'A latitude vai de −90 a 90.');
  if (longitude === 'invalid') fail(errors, 'longitude', 'Informe a longitude em graus decimais.');
  else if (longitude !== null && (longitude < -180 || longitude > 180)) fail(errors, 'longitude', 'A longitude vai de −180 a 180.');
  if ((latitude === null) !== (longitude === null)) fail(errors, latitude === null ? 'latitude' : 'longitude', 'Informe a latitude e a longitude juntas, ou deixe as duas em branco.');

  if (input.results.length === 0 && options.allowNoResults !== true) fail(errors, 'results', 'A parada não tem cilindros para registrar.');
  input.results.forEach((result) => {
    if (!result.delivered && !between(result.reason, TRIP_LIMITS.justificationMin, TRIP_LIMITS.justificationMax)) {
      fail(errors, `results.${result.itemId}`, `Explique por que não foi entregue, em ${TRIP_LIMITS.justificationMin} a ${TRIP_LIMITS.justificationMax} caracteres.`);
    }
  });

  return done(errors, () => ({
    deliveredAt: new Date(input.deliveredAt).toISOString(),
    recipientName: input.recipientName.trim(),
    recipientRole: optionalText(input.recipientRole),
    latitude: typeof latitude === 'number' ? latitude : null,
    longitude: typeof longitude === 'number' ? longitude : null,
    atSiteAddress: input.atSiteAddress,
    results: input.results.map((result) => (result.delivered ? { itemId: result.itemId, delivered: true } : { itemId: result.itemId, delivered: false, reason: result.reason.trim() })),
  }));
}

// ---------- Desbloqueio ----------

// Excepcional (item ainda em trânsito ou não entregue): justificativa obrigatória. Normal (item entregue): justificativa opcional.
export function validateUnlockForm(input: { exceptional: boolean; justification: string }): ValidationResult<{ justification: string | null }> {
  const result = validateTripJustification(input.justification, input.exceptional);
  return result.ok ? { ok: true, value: { justification: result.value } } : result;
}
