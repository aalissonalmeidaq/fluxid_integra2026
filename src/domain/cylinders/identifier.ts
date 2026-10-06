// Normalização de identificadores (RF-012, spec: leitor tipo teclado). A comparação definitiva é sempre do servidor
// (`upper(btrim(value))`); aqui a tela só limpa o que um leitor ou a colagem trazem junto.

export const IDENTIFIER_MAX_LENGTH = 200;

// Leitor que age como teclado costuma enviar Enter no fim e, às vezes, no começo; quebras de linha não fazem parte do valor.
export function normalizeIdentifier(raw: string): string {
  return raw.replace(/[\r\n]+/g, '').trim();
}

// Chave de comparação sem diferença de caixa, igual à do banco.
export function identifierKey(raw: string): string {
  return normalizeIdentifier(raw).toUpperCase();
}

export function isValidIdentifierValue(raw: string): boolean {
  const value = normalizeIdentifier(raw);
  return value.length >= 1 && value.length <= IDENTIFIER_MAX_LENGTH;
}
