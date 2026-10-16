import { describe, expect, it } from 'vitest';
import { tomDaCor } from './tom-do-fundo';

// Spec 011 (polimento de 14/10/2026): o sanduíche fixo do celular não tem caixa (AGENTS.md) e troca de cor conforme o fundo que passa
// por baixo dele. A decisão vem da cor calculada pelo navegador, no formato que getComputedStyle devolve.
describe('Tom da cor de fundo', () => {
  it('navy e azul-profundo são escuros (o ícone fica branco)', () => {
    expect(tomDaCor('rgb(22, 59, 114)')).toBe('escuro');
    expect(tomDaCor('rgb(18, 73, 184)')).toBe('escuro');
  });

  it('o vermelho de erro é escuro: o branco contrasta mais que o navy sobre ele', () => {
    expect(tomDaCor('rgb(180, 35, 24)')).toBe('escuro');
  });

  it('branco, cinza-gelo e o fundo claro de erro são claros (o ícone fica navy)', () => {
    expect(tomDaCor('rgb(255, 255, 255)')).toBe('claro');
    expect(tomDaCor('rgb(243, 247, 250)')).toBe('claro');
    expect(tomDaCor('rgb(253, 236, 234)')).toBe('claro');
  });

  it('o verde-vivo é claro: o navy contrasta mais que o branco sobre ele', () => {
    expect(tomDaCor('rgb(55, 210, 10)')).toBe('claro');
  });

  it('cor transparente ou ilegível não decide nada', () => {
    expect(tomDaCor('rgba(0, 0, 0, 0)')).toBeNull();
    expect(tomDaCor('transparent')).toBeNull();
    expect(tomDaCor('')).toBeNull();
  });

  it('cor quase opaca ainda decide', () => {
    expect(tomDaCor('rgba(22, 59, 114, 0.9)')).toBe('escuro');
  });
});
