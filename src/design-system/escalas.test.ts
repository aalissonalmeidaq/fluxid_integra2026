import { describe, expect, it } from 'vitest';
import {
  ALVO_MINIMO,
  containers,
  espacamento,
  grade,
  pontosDeQuebra,
  raios,
  tipografia,
} from './tokens';

describe('escalas do design system (RF-002, RF-003)', () => {
  it('espaçamento segue 4, 8, 16, 24, 32, 48 e 64 px', () => {
    expect(Object.values(espacamento).filter((valor) => valor > 0)).toEqual([4, 8, 16, 24, 32, 48, 64]);
    expect(espacamento[0]).toBe(0);
  });

  it('os nomes do espaçamento são múltiplos de 4 px e coincidem com a escala do Tailwind', () => {
    for (const [nome, valor] of Object.entries(espacamento)) expect(Number(nome) * 4).toBe(valor);
  });

  it('tamanhos de fonte seguem display 64, H1 48, H2 36, H3 24, corpo 16 e legenda 12 px', () => {
    expect(tipografia.tamanhos).toEqual({ display: 64, h1: 48, h2: 36, h3: 24, corpo: 16, legenda: 12 });
  });

  it('em telas estreitas os títulos reduzem para valores que já pertencem à escala', () => {
    const escala = new Set(Object.values(tipografia.tamanhos));
    expect(tipografia.tamanhosEstreitos).toEqual({ display: 36, h1: 36, h2: 24, h3: 24, corpo: 16, legenda: 12 });
    for (const valor of Object.values(tipografia.tamanhosEstreitos)) expect(escala.has(valor)).toBe(true);
  });

  it('pesos da Montserrat são 300, 400, 500, 600, 700 e 800', () => {
    expect(Object.values(tipografia.pesos)).toEqual([300, 400, 500, 600, 700, 800]);
  });

  it('entrelinha é 100%, 125% ou 150%', () => {
    const permitidas = new Set([1, 1.25, 1.5]);
    for (const valor of Object.values(tipografia.entrelinhas)) expect(permitidas.has(valor)).toBe(true);
    expect(tipografia.entrelinhas.corpo).toBe(1.5);
  });

  it('a família tem Montserrat, Arial e sans-serif como reserva, nesta ordem', () => {
    const familia = tipografia.familia;
    expect(familia[0]).toMatch(/Montserrat/);
    expect(familia.slice(-2)).toEqual(['Arial', 'sans-serif']);
  });

  it('grade: 12 colunas no desktop, 8 no tablet e 4 no mobile, com margens 32, 24 e 16 e calha de 16 px', () => {
    expect(grade.desktop).toEqual({ colunas: 12, margem: 32, calha: 16 });
    expect(grade.tablet).toEqual({ colunas: 8, margem: 24, calha: 16 });
    expect(grade.mobile).toEqual({ colunas: 4, margem: 16, calha: 16 });
    const escala = new Set(Object.values(espacamento));
    for (const faixa of Object.values(grade)) {
      expect(escala.has(faixa.margem)).toBe(true);
      expect(escala.has(faixa.calha)).toBe(true);
    }
  });

  it('containers são 720 (compacto), 960 (padrão) e 1200 px (largo)', () => {
    expect(containers).toEqual({ compacto: 720, padrao: 960, largo: 1200 });
  });

  it('pontos de quebra: tablet a partir de 768 px e desktop a partir de 1024 px', () => {
    expect(pontosDeQuebra).toEqual({ tablet: 768, desktop: 1024 });
  });

  it('raios: 12 px nos cartões e 8 px nos controles; alvo mínimo de 44 px', () => {
    expect(raios).toEqual({ controle: 8, card: 12 });
    expect(ALVO_MINIMO).toBe(44);
  });
});
