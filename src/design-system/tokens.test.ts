import { describe, expect, it } from 'vitest';
import { contrastRatio } from './contrast';
import { cores, gradientes, usosDeCor } from './tokens';
import { MINIMO_POR_FINALIDADE, verificarGradientes, verificarUsos } from './verificar-contraste';

describe('contraste dos tokens (RF-004, RF-005, RF-006, CA-002)', () => {
  it('toda combinação permitida atende o mínimo da sua finalidade', () => {
    expect(verificarUsos(cores, usosDeCor)).toEqual([]);
  });

  it('os mínimos são 4,5:1 para texto normal e 3:1 para texto grande e componente', () => {
    expect(MINIMO_POR_FINALIDADE['texto-normal']).toBe(4.5);
    expect(MINIMO_POR_FINALIDADE['texto-grande']).toBe(3);
    expect(MINIMO_POR_FINALIDADE.componente).toBe(3);
  });

  it('um par reprovado faz a verificação falhar', () => {
    const violacoes = verificarUsos(cores, [{ texto: 'verde-vivo', fundo: 'branco', finalidade: 'texto-normal' }]);
    expect(violacoes).toHaveLength(1);
    expect(violacoes[0]).toMatch(/verde-vivo/);
    expect(violacoes[0]).toMatch(/4,5/);
  });

  it('o ciano e o verde vivo originais nunca servem de texto sobre fundo claro', () => {
    for (const texto of ['azul-ciano', 'verde-vivo']) {
      for (const fundo of ['branco', 'cinza-gelo']) {
        const violacoes = verificarUsos(cores, [{ texto, fundo, finalidade: 'texto-grande' }]);
        expect(violacoes.join(' ')).toMatch(/decorativ/i);
      }
    }
  });

  it('cor desconhecida é violação', () => {
    expect(verificarUsos(cores, [{ texto: 'rosa', fundo: 'branco', finalidade: 'texto-normal' }])).toHaveLength(1);
  });

  it('combinação decorativa não exige contraste (verde vivo sobre cinza-gelo, só logotipo e decoração)', () => {
    const uso = usosDeCor.find((u) => u.texto === 'verde-vivo' && u.fundo === 'cinza-gelo');
    expect(uso?.finalidade).toBe('decorativo');
    expect(contrastRatio(cores['verde-vivo'], cores['cinza-gelo'])).toBeLessThan(3);
  });

  it('há variantes acessíveis do ciano, do verde vivo e do verde escuro para texto sobre fundo claro', () => {
    for (const texto of ['ciano-acessivel', 'verde-acessivel']) {
      for (const fundo of ['branco', 'cinza-gelo']) {
        expect(usosDeCor).toContainEqual({ texto, fundo, finalidade: 'texto-normal' });
        expect(contrastRatio(cores[texto as keyof typeof cores], cores[fundo as keyof typeof cores])).toBeGreaterThanOrEqual(4.5);
      }
    }
    expect(usosDeCor).toContainEqual({ texto: 'verde-escuro', fundo: 'branco', finalidade: 'componente' });
  });

  it('declara as cores semânticas de erro, alerta e sucesso com texto legível sobre o próprio fundo suave', () => {
    expect(contrastRatio(cores.erro, cores['erro-fundo'])).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(cores['alerta-texto'], cores['alerta-fundo'])).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(cores.grafite, cores['alerta-faixa'])).toBeGreaterThanOrEqual(4.5);
  });

  it('usa o azul profundo oficial #1249B8 e o #1249BB não existe em nenhum token', () => {
    expect(cores['azul-profundo']).toBe('#1249B8');
    expect(Object.values(cores)).not.toContain('#1249BB');
  });

  it('toda cor participa de ao menos uma combinação declarada (RF-004)', () => {
    const citadas = new Set(usosDeCor.flatMap((uso) => [uso.texto, uso.fundo]));
    expect(Object.keys(cores).filter((nome) => !citadas.has(nome))).toEqual([]);
  });
});

describe('gradientes oficiais (RF-006)', () => {
  it('declaram azul digital, conexão segura e profundidade com as cores da prancha', () => {
    expect(gradientes['azul-digital']).toMatchObject({ de: 'azul-profundo', para: 'azul-ciano' });
    expect(gradientes['conexao-segura']).toMatchObject({ de: 'verde-vivo', para: 'azul-royal' });
    expect(gradientes.profundidade).toMatchObject({ de: 'navy', para: 'azul-profundo' });
  });

  it('só permitem texto cujo contraste com o ponto mais crítico do gradiente atende 4,5:1', () => {
    expect(verificarGradientes(cores, gradientes)).toEqual([]);
    expect(gradientes['azul-digital'].textoSobre).toEqual([]);
    expect(gradientes['conexao-segura'].textoSobre).toEqual([]);
    expect(gradientes.profundidade.textoSobre).toEqual(['branco']);
  });

  it('um gradiente com texto sem contraste suficiente faz a verificação falhar', () => {
    const violacoes = verificarGradientes(cores, {
      ruim: { de: 'azul-profundo', para: 'azul-ciano', textoSobre: ['branco'] },
    });
    expect(violacoes).toHaveLength(1);
    expect(violacoes[0]).toMatch(/ruim/);
  });
});
