// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createScanDebounce, READER_IDLE_MS, SCAN_DEBOUNCE_MS } from './scan-debounce';

// RF-004: o mesmo código em sequência curta vale uma leitura só.
// RF-018: a câmera e o NFC desligam sozinhos depois de 2 minutos sem nenhuma leitura.
it('o leitor parado desliga após 2 minutos', () => {
  expect(READER_IDLE_MS).toBe(120_000);
});

describe('createScanDebounce', () => {
  it('a janela padrão é de 1,5 segundo', () => {
    expect(SCAN_DEBOUNCE_MS).toBe(1500);
  });

  it('aceita a primeira leitura e ignora a mesma dentro da janela', () => {
    let now = 0;
    const accept = createScanDebounce(() => now);
    expect(accept('CIL-1')).toBe(true);
    now = 1_000;
    expect(accept('CIL-1')).toBe(false);
  });

  it('aceita o mesmo código de novo depois da janela', () => {
    let now = 0;
    const accept = createScanDebounce(() => now);
    expect(accept('CIL-1')).toBe(true);
    now = 1_500;
    expect(accept('CIL-1')).toBe(true);
  });

  it('códigos diferentes passam, e a janela é de cada código', () => {
    let now = 0;
    const accept = createScanDebounce(() => now);
    expect(accept('CIL-1')).toBe(true);
    now = 10;
    expect(accept('CIL-2')).toBe(true);
    // A câmera alternando entre dois códigos no quadro não pode inundar a conferência: CIL-1 ainda está dentro da janela.
    now = 20;
    expect(accept('CIL-1')).toBe(false);
    now = 1_600;
    expect(accept('CIL-1')).toBe(true);
    expect(accept('CIL-2')).toBe(true);
  });

  it('ignorar repetição não renova a janela', () => {
    let now = 0;
    const accept = createScanDebounce(() => now, 1_000);
    expect(accept('CIL-1')).toBe(true);
    now = 900;
    expect(accept('CIL-1')).toBe(false);
    now = 1_000;
    expect(accept('CIL-1')).toBe(true);
  });

  it('compara o código sem espaços nas pontas e sem diferença entre maiúsculas e minúsculas', () => {
    let now = 0;
    const accept = createScanDebounce(() => now);
    expect(accept('cil-1')).toBe(true);
    now = 100;
    expect(accept('  CIL-1 ')).toBe(false);
  });

  it('código vazio nunca é aceito', () => {
    const accept = createScanDebounce(() => 0);
    expect(accept('')).toBe(false);
    expect(accept('   ')).toBe(false);
  });
});
