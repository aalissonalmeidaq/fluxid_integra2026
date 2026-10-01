import { describe, expect, it } from 'vitest';
import { contrastRatio, relativeLuminance } from './contrast';

// Valores medidos na spec 003 em 30/09/2026 com a fórmula de luminância da WCAG 2.2.
describe('contrastRatio', () => {
  it.each([
    ['#1249B8', '#FFFFFF', 7.86],
    ['#1249B8', '#F3F7FA', 7.3],
    ['#1766D9', '#FFFFFF', 5.33],
    ['#23AFE5', '#FFFFFF', 2.52],
    ['#37D20A', '#FFFFFF', 2.02],
    ['#159B19', '#FFFFFF', 3.66],
    ['#163B72', '#FFFFFF', 11.04],
    ['#26384A', '#FFFFFF', 12.02],
    ['#37D20A', '#163B72', 5.46],
    ['#23AFE5', '#163B72', 4.38],
    ['#37D20A', '#1249B8', 3.89],
    ['#23AFE5', '#1249B8', 3.12],
    ['#37D20A', '#F3F7FA', 1.88],
  ])('%s sobre %s dá %s:1', (foreground, background, expected) => {
    expect(contrastRatio(foreground, background)).toBeCloseTo(expected, 1);
  });

  it('é simétrica e vale 1 para cores iguais', () => {
    expect(contrastRatio('#26384A', '#FFFFFF')).toBe(contrastRatio('#FFFFFF', '#26384A'));
    expect(contrastRatio('#123456', '#123456')).toBe(1);
  });

  it('vale 21 para preto sobre branco', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
  });

  it('aceita hexadecimal em minúsculas e rejeita valores inválidos', () => {
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 5);
    expect(() => contrastRatio('azul', '#FFFFFF')).toThrow(/hexadecimal/i);
    expect(() => contrastRatio('#FFF', '#FFFFFF')).toThrow(/hexadecimal/i);
  });

  it('calcula a luminância relativa entre 0 e 1', () => {
    expect(relativeLuminance('#000000')).toBe(0);
    expect(relativeLuminance('#FFFFFF')).toBeCloseTo(1, 5);
  });
});
