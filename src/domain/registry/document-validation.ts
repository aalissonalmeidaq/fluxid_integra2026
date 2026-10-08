// Validadores de documento (RF-002, RF-025, CA-008). O banco repete as mesmas regras em private.validate_cpf, validate_cnpj e
// validate_cnh (supabase/migrations/*registry_schema.sql), com a mesma tabela de casos nos testes.

export const normalizeCpf = (value: string): string => value.replace(/\D/g, '');
export const normalizeCnh = (value: string): string => value.replace(/\D/g, '');
// CNPJ: maiúsculas, sem ponto, barra nem hífen. Aceita o numérico e o alfanumérico (em vigor desde julho de 2026).
export const normalizeCnpj = (value: string): string => value.toUpperCase().replace(/[./-]/g, '');

const allSame = (value: string): boolean => /^(.)\1+$/.test(value);

// CPF: 11 dígitos sem pontuação. Recebe o valor já normalizado, como o SQL.
export function validateCpf(value: string): boolean {
  if (!/^\d{11}$/.test(value) || allSame(value)) return false;
  const digit = (index: number): number => Number(value.charAt(index));
  const check = (length: number): number => {
    let total = 0;
    for (let i = 0; i < length; i += 1) total += digit(i) * (length + 1 - i);
    return (total * 10) % 11 % 10;
  };
  return check(9) === digit(9) && check(10) === digit(10);
}

const CNPJ_WEIGHTS_FIRST = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] as const;
const CNPJ_WEIGHTS_SECOND = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] as const;

// CNPJ numérico e alfanumérico (Nota Técnica Conjunta 2025.001): o valor de cada caractere é o código ASCII menos 48, os pesos
// são os do módulo 11 de sempre e os dois dígitos verificadores continuam numéricos. Normaliza antes de validar, como o SQL.
export function validateCnpj(value: string): boolean {
  const normalized = normalizeCnpj(value);
  if (!/^[0-9A-Z]{12}\d{2}$/.test(normalized) || allSame(normalized)) return false;
  const charValue = (index: number): number => normalized.charCodeAt(index) - 48;
  const digitOf = (total: number): number => {
    const rest = total % 11;
    return rest < 2 ? 0 : 11 - rest;
  };
  let first = 0;
  for (let i = 0; i < 12; i += 1) first += charValue(i) * (CNPJ_WEIGHTS_FIRST[i] ?? 0);
  const dv1 = digitOf(first);
  let second = dv1 * (CNPJ_WEIGHTS_SECOND[12] ?? 0);
  for (let i = 0; i < 12; i += 1) second += charValue(i) * (CNPJ_WEIGHTS_SECOND[i] ?? 0);
  const dv2 = digitOf(second);
  return dv1 === charValue(12) && dv2 === charValue(13);
}

// CNH: 11 dígitos sem pontuação (algoritmo do DENATRAN, com o ajuste de `dsc` do primeiro resto).
export function validateCnh(value: string): boolean {
  if (!/^\d{11}$/.test(value) || allSame(value)) return false;
  const digit = (index: number): number => Number(value.charAt(index));
  let total = 0;
  for (let i = 0; i < 9; i += 1) total += digit(i) * (9 - i);
  let dv1 = total % 11;
  let dsc = 0;
  if (dv1 >= 10) {
    dv1 = 0;
    dsc = 2;
  }
  total = 0;
  for (let i = 0; i < 9; i += 1) total += digit(i) * (i + 1);
  let dv2 = (total % 11) - dsc;
  if (dv2 < 0) dv2 += 11;
  if (dv2 >= 10) dv2 = 0;
  return dv1 === digit(9) && dv2 === digit(10);
}
