// Método de conferência ou de entrega por cilindro (RF-001, RN-002). Os quatro valores são os da restrição `trip_items_source_check`
// do banco; o navegador não distingue digitação de leitor-teclado, então os dois são `typed` (spec, Clarifications).
export const READING_SOURCES = ['manual', 'typed', 'camera', 'nfc'] as const;
export type ReadingSource = (typeof READING_SOURCES)[number];

export const READING_SOURCE_LABELS: Record<ReadingSource, string> = {
  manual: 'toque',
  typed: 'código digitado ou leitor',
  camera: 'câmera',
  nfc: 'NFC',
};

export function isReadingSource(value: unknown): value is ReadingSource {
  return typeof value === 'string' && (READING_SOURCES as readonly string[]).includes(value);
}

// Frase do histórico: "conferido por câmera". Nunca traz o valor lido (RF-017). Sem método reconhecido, devolve só a ação.
export function readingSourceSentence(action: string, source: string | null | undefined): string {
  return isReadingSource(source) ? `${action} por ${READING_SOURCE_LABELS[source]}` : action;
}

export type ReaderMode = 'camera' | 'nfc' | 'keyboard';

// Modo do leitor para o método gravado: câmera e NFC têm o seu; digitação, colagem e leitor-teclado são `typed`.
export function sourceOfCandidate(mode: ReaderMode): ReadingSource {
  return mode === 'keyboard' ? 'typed' : mode;
}
