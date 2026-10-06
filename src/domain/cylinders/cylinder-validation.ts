import { z } from 'zod';
import { HYDROSTATIC_RESULTS, IDENTIFIER_KINDS, JUSTIFICATION_MAX, JUSTIFICATION_MIN } from './cylinder-types';
import { IDENTIFIER_MAX_LENGTH, normalizeIdentifier } from './identifier';
import { daysBetween, todayInSaoPaulo } from './hydrostatic-status';

// Regras dos formulários de cilindros (RF-001, RF-019, RF-030). Mensagens em português, junto do campo e sem culpar a pessoa.
// O servidor repete todas as regras (supabase/migrations/*cylinders*); aqui só se evita a ida e volta.

export type FieldErrors = Record<string, string>;
export type ValidationResult<T> = { ok: true; value: T } | { ok: false; errors: FieldErrors };

const blank = (value: string | undefined | null): boolean => value === undefined || value === null || value.trim() === '';
const optionalText = (value: string): string | null => (value.trim() === '' ? null : value.trim());

function collect(issues: readonly z.core.$ZodIssue[]): FieldErrors {
  const errors: FieldErrors = {};
  for (const issue of issues) {
    const field = String(issue.path[0] ?? 'form');
    if (!(field in errors)) errors[field] = issue.message;
  }
  return errors;
}

function run<T>(schema: z.ZodType<T>, input: unknown): ValidationResult<T> {
  const parsed = schema.safeParse(input);
  return parsed.success ? { ok: true, value: parsed.data } : { ok: false, errors: collect(parsed.error.issues) };
}

const isCalendarDate = (value: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year = 0, month = 1, day = 1] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
};

const addYears = (isoDate: string, years: number): string => {
  const [year = 0, month = 1, day = 1] = isoDate.split('-').map(Number);
  const date = new Date(Date.UTC(year + years, month - 1, day));
  return date.toISOString().slice(0, 10);
};

// ---------- Cilindro ----------

export interface CylinderFormInput {
  cylinderTypeId: string; serialNumber: string; manufacturer: string; manufactureYear: string; workingPressureBar: string; notes: string;
}

export interface CylinderFormValue {
  cylinderTypeId: string; serialNumber: string; manufacturer: string | null; manufactureYear: number | null; workingPressureBar: number | null; notes: string | null;
}

export const CYLINDER_FORM_FIELDS = ['cylinderTypeId', 'serialNumber', 'manufacturer', 'manufactureYear', 'workingPressureBar', 'notes'] as const;

export function validateCylinderForm(input: CylinderFormInput, today: string = todayInSaoPaulo()): ValidationResult<CylinderFormValue> {
  const currentYear = Number(today.slice(0, 4));
  const schema = z.object({
    cylinderTypeId: z.string().refine((value) => !blank(value), 'Escolha o tipo de cilindro.'),
    serialNumber: z.string().trim()
      .min(1, 'Informe o número de série gravado no casco.')
      .max(60, 'Use até 60 caracteres no número de série.'),
    manufacturer: z.string().max(120, 'Use até 120 caracteres no fabricante.'),
    manufactureYear: z.string().refine((value) => {
      if (blank(value)) return true;
      if (!/^\d{4}$/.test(value.trim())) return false;
      const year = Number(value.trim());
      return year >= 1900 && year <= currentYear;
    }, 'Informe o ano com quatro dígitos, de 1900 até o ano atual.'),
    workingPressureBar: z.string().refine((value) => {
      if (blank(value)) return true;
      const number = Number(value.trim().replace(',', '.'));
      return Number.isFinite(number) && number > 0;
    }, 'Informe uma pressão de trabalho maior que zero.'),
    notes: z.string().max(500, 'Use até 500 caracteres nas observações.'),
  });
  const parsed = run(schema, input);
  if (!parsed.ok) return parsed;
  return {
    ok: true,
    value: {
      cylinderTypeId: input.cylinderTypeId,
      serialNumber: input.serialNumber.trim(),
      manufacturer: optionalText(input.manufacturer),
      manufactureYear: blank(input.manufactureYear) ? null : Number(input.manufactureYear.trim()),
      workingPressureBar: blank(input.workingPressureBar) ? null : Number(input.workingPressureBar.trim().replace(',', '.')),
      notes: optionalText(input.notes),
    },
  };
}

// ---------- Identificador ----------

export interface IdentifierFormInput { kind: string; value: string }
export interface IdentifierFormValue { kind: (typeof IDENTIFIER_KINDS)[number]; value: string }

export function validateIdentifierForm(input: IdentifierFormInput): ValidationResult<IdentifierFormValue> {
  const value = normalizeIdentifier(input.value);
  const schema = z.object({
    kind: z.enum(IDENTIFIER_KINDS, { error: 'Escolha o tipo do identificador.' }),
    value: z.string().min(1, 'Informe o valor do identificador.').max(IDENTIFIER_MAX_LENGTH, `Use até ${IDENTIFIER_MAX_LENGTH} caracteres no identificador.`),
  });
  return run(schema, { kind: input.kind, value });
}

// ---------- Teste hidrostático ----------

export interface HydrostaticTestFormInput {
  performedOn: string; result: string; reportNumber: string; executor: string; nextDueOn: string; notes: string;
}

export interface HydrostaticTestFormValue {
  performedOn: string; result: (typeof HYDROSTATIC_RESULTS)[number]; reportNumber: string | null; executor: string; nextDueOn: string | null; notes: string | null;
}

export const TEST_FORM_FIELDS = ['performedOn', 'result', 'executor', 'reportNumber', 'nextDueOn', 'notes'] as const;
export const HYDROSTATIC_MAX_YEARS_AHEAD = 10;

export function validateHydrostaticTestForm(input: HydrostaticTestFormInput, today: string = todayInSaoPaulo()): ValidationResult<HydrostaticTestFormValue> {
  const schema = z.object({
    performedOn: z.string().refine(isCalendarDate, 'Informe a data de realização do teste.')
      .refine((value) => !isCalendarDate(value) || daysBetween(today, value) <= 0, 'A data de realização não pode ser futura.'),
    result: z.enum(HYDROSTATIC_RESULTS, { error: 'Escolha o resultado do teste.' }),
    reportNumber: z.string().max(60, 'Use até 60 caracteres no número do laudo.'),
    executor: z.string().trim().min(2, 'Informe quem executou o teste.').max(120, 'Use até 120 caracteres no executor.'),
    nextDueOn: z.string(),
    notes: z.string().max(500, 'Use até 500 caracteres nas observações.'),
  }).superRefine((value, ctx) => {
    const approved = value.result === 'approved';
    if (blank(value.nextDueOn)) {
      if (approved) ctx.addIssue({ code: 'custom', path: ['nextDueOn'], message: 'Informe a próxima data do teste.' });
      return;
    }
    if (!isCalendarDate(value.nextDueOn)) {
      ctx.addIssue({ code: 'custom', path: ['nextDueOn'], message: 'Informe uma próxima data válida.' });
      return;
    }
    if (!isCalendarDate(value.performedOn)) return;
    if (daysBetween(value.performedOn, value.nextDueOn) <= 0) {
      ctx.addIssue({ code: 'custom', path: ['nextDueOn'], message: 'A próxima data deve ser posterior à data de realização.' });
    } else if (value.nextDueOn > addYears(value.performedOn, HYDROSTATIC_MAX_YEARS_AHEAD)) {
      ctx.addIssue({ code: 'custom', path: ['nextDueOn'], message: `A próxima data fica a mais de ${HYDROSTATIC_MAX_YEARS_AHEAD} anos da realização.` });
    }
  });
  const parsed = run(schema, input);
  if (!parsed.ok) return parsed;
  return {
    ok: true,
    value: {
      performedOn: parsed.value.performedOn,
      result: parsed.value.result,
      reportNumber: optionalText(input.reportNumber),
      executor: parsed.value.executor.trim(),
      nextDueOn: blank(input.nextDueOn) ? null : input.nextDueOn,
      notes: optionalText(input.notes),
    },
  };
}

// ---------- Justificativa ----------

export function validateJustification(raw: string): ValidationResult<string> {
  const text = raw.trim();
  const schema = z.string()
    .min(JUSTIFICATION_MIN, `Explique o motivo com pelo menos ${JUSTIFICATION_MIN} caracteres.`)
    .max(JUSTIFICATION_MAX, `Use até ${JUSTIFICATION_MAX} caracteres na justificativa.`);
  const parsed = schema.safeParse(text);
  return parsed.success ? { ok: true, value: text } : { ok: false, errors: { justification: parsed.error.issues[0]?.message ?? '' } };
}

// Primeiro campo com erro, na ordem do formulário: para onde o foco vai (RF-030).
export function firstErrorField(errors: FieldErrors, order: readonly string[]): string | null {
  return order.find((field) => field in errors) ?? null;
}
