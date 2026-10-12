// O mesmo código em sequência curta vale uma leitura só (RF-004): a câmera lê o mesmo quadro várias vezes por segundo.
export const SCAN_DEBOUNCE_MS = 1500;
// Leitor aberto sem nenhuma leitura por este tempo desliga a câmera e o NFC e oferece "Continuar lendo" (RF-018).
export const READER_IDLE_MS = 2 * 60 * 1000;

// Devolve `true` quando a leitura deve ser tratada e `false` quando é repetição dentro da janela. A repetição ignorada não renova a
// janela; o relógio é injetável para os testes.
export function createScanDebounce(now: () => number = Date.now, windowMs: number = SCAN_DEBOUNCE_MS): (code: string) => boolean {
  const lastAccepted = new Map<string, number>();
  return (code: string): boolean => {
    const key = code.trim().toUpperCase();
    if (key === '') return false;
    const current = now();
    const previous = lastAccepted.get(key);
    if (previous !== undefined && current - previous < windowMs) return false;
    lastAccepted.set(key, current);
    return true;
  };
}
