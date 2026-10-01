import { describe, expect, it } from 'vitest';
import * as designSystem from '../index';
import { documentacao } from './index';
import { NOMES_POR_GRUPO } from '../icons/tipos';
import { VARIACOES_DO_CATALOGO } from '../brand/logo-variacoes';

// RF-011, CA-010, MS-006, MS-009: todo componente exportado pelo design system está documentado no catálogo, com
// descrição, variantes, estados, orientação de uso e requisitos de acessibilidade.
const exportados = Object.entries(designSystem)
  .filter(([nome, valor]) => /^[A-Z][A-Za-z]+$/.test(nome) && typeof valor === 'function')
  .map(([nome]) => nome);

describe('Documentação do catálogo (CA-010)', () => {
  it('há componentes exportados para documentar', () => {
    expect(exportados.length).toBeGreaterThanOrEqual(20);
  });

  it('todo componente exportado tem documentação', () => {
    const documentados = new Set(documentacao.map((item) => item.nome));
    expect(exportados.filter((nome) => !documentados.has(nome))).toEqual([]);
  });

  it('não há documentação de componente que não existe', () => {
    expect(documentacao.map((item) => item.nome).filter((nome) => !exportados.includes(nome))).toEqual([]);
  });

  it('não há documentação duplicada', () => {
    const nomes = documentacao.map((item) => item.nome);
    expect(new Set(nomes).size).toBe(nomes.length);
  });

  it.each(documentacao.map((item) => [item.nome, item] as const))('%s tem todos os campos preenchidos', (_nome, item) => {
    expect(item.descricao.trim().length).toBeGreaterThan(10);
    expect(item.variantes.length).toBeGreaterThanOrEqual(1);
    expect(item.estados.length).toBeGreaterThanOrEqual(1);
    expect(item.orientacaoDeUso.trim().length).toBeGreaterThan(20);
    expect(item.acessibilidade.length).toBeGreaterThanOrEqual(1);
    for (const texto of [...item.variantes, ...item.estados, ...item.acessibilidade]) expect(texto.trim().length).toBeGreaterThan(0);
  });

  it('os componentes interativos documentam os estados que se aplicam a eles (RF-008)', () => {
    const exigidos: Record<string, string[]> = {
      Button: ['foco', 'desabilitado', 'carregando'],
      TextField: ['foco', 'desabilitado', 'erro'],
      Select: ['foco', 'desabilitado', 'erro'],
    };
    for (const [nome, estados] of Object.entries(exigidos)) {
      const item = documentacao.find((doc) => doc.nome === nome);
      expect(item?.estados, nome).toEqual(expect.arrayContaining(estados));
    }
  });

  it('os ícones e o logotipo estão documentados', () => {
    for (const nome of ['Icon', 'Logo', 'Simbolo']) expect(documentacao.some((item) => item.nome === nome)).toBe(true);
    expect(Object.values(NOMES_POR_GRUPO).flat()).toHaveLength(30);
    expect(VARIACOES_DO_CATALOGO).toHaveLength(9);
  });
});
