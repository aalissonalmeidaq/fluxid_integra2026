// Ajudantes de leitura de respostas JSON do servidor (valores desconhecidos viram nulo, nunca são presumidos).
export type Raw = Record<string, unknown>;
export const isObject = (value: unknown): value is Raw => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
export const str = (value: unknown): string | null => (typeof value === 'string' ? value : null);
export const num = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null);
