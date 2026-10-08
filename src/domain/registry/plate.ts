// Placa de veículo (RF-020, CA-008): maiúsculas, sem hífen e sem espaços; padrões antigo (AAA9999) e Mercosul (AAA9A99).
// O banco repete a regra em private.normalize_plate.

const OLD_PATTERN = /^[A-Z]{3}\d{4}$/;
const MERCOSUL_PATTERN = /^[A-Z]{3}\d[A-Z]\d{2}$/;

// Devolve a placa normalizada, ou nulo quando não está em nenhum dos dois padrões.
export function normalizePlate(value: string): string | null {
  const plate = value.toUpperCase().replace(/[\s-]/g, '');
  return OLD_PATTERN.test(plate) || MERCOSUL_PATTERN.test(plate) ? plate : null;
}

export const validatePlate = (value: string): boolean => normalizePlate(value) !== null;

// Exibição: a placa antiga leva hífen (ABC-1234); a Mercosul não (ABC1D23).
export function formatPlate(value: string): string {
  const plate = normalizePlate(value);
  if (plate === null) return value.toUpperCase();
  return OLD_PATTERN.test(plate) ? `${plate.slice(0, 3)}-${plate.slice(3)}` : plate;
}
