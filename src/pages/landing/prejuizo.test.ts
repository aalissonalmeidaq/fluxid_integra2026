import { describe, expect, it } from 'vitest';
import { calcularPrejuizo, formatarReais, patrimonioMedio, patrimonioPreservado } from './prejuizo';

// Spec 011 (adaptação ao pitch): os números do prejuízo são calculados da fonte, e batem com o roteiro do pitch.
const CUSTOS = [
  { capacidade: '1 m³', valor: 2800 },
  { capacidade: '7 m³', valor: 4000 },
  { capacidade: '10 m³', valor: 4500 },
];

describe('Prejuízo com cilindros perdidos', () => {
  it('o patrimônio médio é a média simples das capacidades (R$ 3.766)', () => {
    expect(formatarReais(patrimonioMedio(CUSTOS))).toBe('R$\u00a03.766');
  });

  it('130 perdas no ano dão R$ 489.666 por ano e R$ 40.805 por mês', () => {
    const prejuizo = calcularPrejuizo(CUSTOS, 130);
    expect(formatarReais(prejuizo.porAno)).toBe('R$\u00a0489.666');
    expect(formatarReais(prejuizo.porMes)).toBe('R$\u00a040.805');
  });

  it('130 perdas no ano são quase 11 por mês, praticamente uma a cada três dias', () => {
    const prejuizo = calcularPrejuizo(CUSTOS, 130);
    expect(Math.round(prejuizo.perdasPorMes)).toBe(11);
    expect(prejuizo.perdasPorMes).toBeLessThan(11);
    expect(Math.round(prejuizo.diasEntrePerdas)).toBe(3);
  });

  it('evitar 1 perda preserva R$ 3.766 e evitar 10 preserva R$ 37.666', () => {
    const medio = patrimonioMedio(CUSTOS);
    expect(formatarReais(patrimonioPreservado(1, medio))).toBe('R$\u00a03.766');
    expect(formatarReais(patrimonioPreservado(10, medio))).toBe('R$\u00a037.666');
    expect(patrimonioPreservado(-3, medio)).toBe(0);
  });

  it('sem dados, não inventa valor', () => {
    expect(patrimonioMedio([])).toBe(0);
    expect(calcularPrejuizo([], 0)).toEqual({ patrimonioMedio: 0, porAno: 0, porMes: 0, perdasPorMes: 0, diasEntrePerdas: 0 });
  });
});
