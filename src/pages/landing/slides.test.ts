import { describe, expect, it } from 'vitest';
import { destinoDoPasso, indiceDoSlide } from './slides';

// Apresentação em slides da landing (pedido de 15/10/2026): qual slide está na tela e para onde vai o próximo passo do teclado.
// Posições em pixels do documento; a tela tem 900 px. O segundo slide é mais alto que a tela (1.500 px).
const SLIDES = [
  { topo: 0, altura: 900 },
  { topo: 900, altura: 1500 },
  { topo: 2400, altura: 900 },
];
const TELA = 900;

describe('indiceDoSlide', () => {
  it('é o slide que ocupa o meio da tela', () => {
    expect(indiceDoSlide(SLIDES, 0, TELA)).toBe(0);
    expect(indiceDoSlide(SLIDES, 900, TELA)).toBe(1);
    expect(indiceDoSlide(SLIDES, 1500, TELA)).toBe(1);
    expect(indiceDoSlide(SLIDES, 2400, TELA)).toBe(2);
  });

  it('antes do primeiro slide, é o primeiro; sem slides, nenhum', () => {
    expect(indiceDoSlide(SLIDES, -50, TELA)).toBe(0);
    expect(indiceDoSlide([], 0, TELA)).toBe(-1);
  });
});

describe('destinoDoPasso', () => {
  it('avança para o início do próximo slide com um único clique', () => {
    expect(destinoDoPasso(SLIDES, 0, TELA, 1)).toBe(900);
    expect(destinoDoPasso(SLIDES, 900, TELA, 1)).toBe(2400);
  });

  it('volta para o slide anterior com um único clique', () => {
    expect(destinoDoPasso(SLIDES, 2400, TELA, -1)).toBe(900);
    expect(destinoDoPasso(SLIDES, 900, TELA, -1)).toBe(0);
  });

  it('volta ao topo do slide quando a rolagem está muito abaixo dele', () => {
    expect(destinoDoPasso(SLIDES, 1500, TELA, -1)).toBe(900);
  });

  it('nas pontas não há para onde ir', () => {
    expect(destinoDoPasso(SLIDES, 0, TELA, -1)).toBeNull();
    expect(destinoDoPasso(SLIDES, 2400, TELA, 1)).toBeNull();
    expect(destinoDoPasso([], 0, TELA, 1)).toBeNull();
  });
});
