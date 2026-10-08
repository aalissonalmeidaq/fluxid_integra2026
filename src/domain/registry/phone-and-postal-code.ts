// Telefone brasileiro e CEP (RF-003, RF-005, RF-008, CA-008). O banco confere o resultado normalizado com as mesmas regras
// (telefone com 10 ou 11 dígitos; CEP com 8).

// Só dígitos, 10 (fixo) ou 11 (celular). Devolve nulo quando não cabe.
export function normalizePhone(value: string): string | null {
  const digits = value.replace(/\D/g, '');
  return digits.length === 10 || digits.length === 11 ? digits : null;
}

export function formatPhone(value: string): string {
  if (/^\d{11}$/.test(value)) return `(${value.slice(0, 2)}) ${value.slice(2, 7)}-${value.slice(7)}`;
  if (/^\d{10}$/.test(value)) return `(${value.slice(0, 2)}) ${value.slice(2, 6)}-${value.slice(6)}`;
  return value;
}

// 8 dígitos, com ou sem hífen e espaços; qualquer letra ou outro tamanho devolve nulo.
export function normalizePostalCode(value: string): string | null {
  const compact = value.replace(/[\s-]/g, '');
  return /^\d{8}$/.test(compact) ? compact : null;
}

export function formatPostalCode(value: string): string {
  return /^\d{8}$/.test(value) ? `${value.slice(0, 5)}-${value.slice(5)}` : value;
}
