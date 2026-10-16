import { describe, expect, it } from 'vitest';
import { secaoAtual } from './secao-atual';

// Seção em que a pessoa está, para marcar a âncora do menu (layout de 15/10/2026: navegação fixa no computador).
describe('secaoAtual', () => {
  const posicoes = [
    { id: 'historia', topo: 900 },
    { id: 'pitch', topo: 2800 },
    { id: 'trava', topo: 5600 },
  ];

  it('é a última seção cujo topo já passou da linha de leitura', () => {
    expect(secaoAtual(posicoes, 3000)).toBe('pitch');
    expect(secaoAtual(posicoes, 2800)).toBe('pitch');
    expect(secaoAtual(posicoes, 9000)).toBe('trava');
  });

  it('não marca nenhuma antes da primeira seção do menu (na abertura)', () => {
    expect(secaoAtual(posicoes, 400)).toBeNull();
    expect(secaoAtual([], 400)).toBeNull();
  });

  it('não depende da ordem em que as posições chegam', () => {
    expect(secaoAtual([...posicoes].reverse(), 3000)).toBe('pitch');
  });
});
