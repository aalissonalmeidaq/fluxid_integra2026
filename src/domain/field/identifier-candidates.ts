// Candidatos de identificador para a consulta `resolve` (RF-007). O servidor compara, na ordem, cada candidato com os identificadores
// ativos da organização; aqui só se monta a lista, sem conhecer navegador nem rede.
export const IDENTIFIER_CANDIDATE_LIMITS = { maxCandidates: 3, maxLength: 200 } as const;

export type CandidateOrigin = 'serial' | 'serial_colon' | 'text' | 'scanned';

export interface IdentifierCandidate {
  value: string;
  origin: CandidateOrigin;
}

const hasLineBreak = (value: string): boolean => /[\r\n]/.test(value);
const fits = (value: string): boolean => value.length >= 1 && value.length <= IDENTIFIER_CANDIDATE_LIMITS.maxLength && !hasLineBreak(value);

// Número de série sem separadores (`:`, `-` e espaços) e em maiúsculas. Vazio, só zeros ou grande demais é inutilizável.
export function normalizeSerial(raw: string | null | undefined): string | null {
  const value = (raw ?? '').replace(/[\s:-]/g, '').toUpperCase();
  if (!fits(value) || /^0+$/.test(value)) return null;
  return value;
}

// O mesmo número com dois-pontos entre os bytes, formato que o navegador entrega e que alguém pode ter cadastrado. Só vale para
// hexadecimal de bytes inteiros; fora disso não se inventa separador.
export function serialWithColons(normalized: string): string | null {
  if (!/^(?:[0-9A-F]{2})+$/.test(normalized)) return null;
  return normalized.match(/../g)!.join(':');
}

export interface NfcReadingInput {
  serialNumber: string | null | undefined;
  texts: readonly string[];
}

// Número de série (sem e com dois-pontos) e, se houver, o primeiro texto gravado. Nunca mais de 3 e sem repetir (maiúsculas e
// minúsculas contam como iguais, porque o servidor compara em maiúsculas).
export function candidatesFromNfc({ serialNumber, texts }: NfcReadingInput): IdentifierCandidate[] {
  const found: IdentifierCandidate[] = [];
  const seen = new Set<string>();
  const add = (value: string | null, origin: CandidateOrigin): void => {
    if (value === null || found.length >= IDENTIFIER_CANDIDATE_LIMITS.maxCandidates) return;
    const key = value.toUpperCase();
    if (seen.has(key)) return;
    seen.add(key);
    found.push({ value, origin });
  };
  const serial = normalizeSerial(serialNumber);
  if (serial !== null) {
    add(serial, 'serial');
    add(serialWithColons(serial), 'serial_colon');
  }
  const text = texts.map((item) => item.trim()).find(fits);
  add(text ?? null, 'text');
  return found;
}

// Código lido pela câmera: um único candidato, tal como veio, sem espaços nas pontas.
export function candidateFromScan(raw: string): IdentifierCandidate[] {
  const value = raw.trim();
  return fits(value) ? [{ value, origin: 'scanned' }] : [];
}
