import React from 'react';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { contrastRatio } from '../contrast';
import { cores } from '../tokens';
import { Icon } from './icon';
import { GRUPOS_REGISTRADOS, ICONES } from './registro';
import {
  COR_DO_ESTADO,
  ESTADOS,
  NOMES_POR_GRUPO,
  TAMANHOS,
  VARIANTES,
  type Forma,
  type IconName,
} from './tipos';

// RF-027, RF-028, RF-029 e CA-012: 30 ícones em cinco grupos, grade de 24 por 24 px, traço de 2 px, terminais
// arredondados, área segura de 2 px, quatro tamanhos, quatro estados e quatro variantes.
const TODOS_OS_NOMES = Object.values(NOMES_POR_GRUPO).flat() as IconName[];

// A geometria fica entre 3 e 21 para que o traço de 2 px termine dentro da área segura de 2 px.
const MINIMO = 3;
const MAXIMO = 21;

function coordenadas(forma: Forma): number[] {
  switch (forma.t) {
    case 'circle':
      return [forma.cx - forma.r, forma.cx + forma.r, forma.cy - forma.r, forma.cy + forma.r];
    case 'rect':
      return [forma.x, forma.x + forma.w, forma.y, forma.y + forma.h];
    case 'line':
      return [forma.x1, forma.x2, forma.y1, forma.y2];
    case 'polyline':
      return forma.pontos.trim().split(/[\s,]+/).map(Number);
    case 'path':
      return (forma.d.match(/-?\d*\.?\d+/g) ?? []).map(Number);
  }
}

describe('Especificação dos 30 ícones', () => {
  it('são cinco grupos de seis ícones, num total de 30 nomes únicos', () => {
    expect(Object.keys(NOMES_POR_GRUPO)).toEqual(['rastreabilidade', 'seguranca', 'conectividade', 'ativos-logistica', 'sistema']);
    for (const nomes of Object.values(NOMES_POR_GRUPO)) expect(nomes).toHaveLength(6);
    expect(new Set(TODOS_OS_NOMES).size).toBe(30);
  });

  it('cada grupo registrado tem exatamente os seis ícones da prancha', () => {
    for (const grupo of GRUPOS_REGISTRADOS) {
      const nomes = NOMES_POR_GRUPO[grupo];
      const registrados = nomes.filter((nome) => ICONES[nome] !== undefined);
      expect(registrados, `grupo ${grupo}`).toEqual([...nomes]);
    }
  });

  it('os cinco grupos somam os 30 ícones', () => {
    expect(GRUPOS_REGISTRADOS).toHaveLength(5);
    expect(TODOS_OS_NOMES.filter((nome) => ICONES[nome] !== undefined)).toHaveLength(30);
  });
});

describe('Construção dos ícones registrados (grade 24 px, área segura)', () => {
  const registrados = TODOS_OS_NOMES.filter((nome) => ICONES[nome] !== undefined);

  it('há ao menos um ícone registrado', () => {
    expect(registrados.length).toBeGreaterThan(0);
  });

  it.each(registrados)('%s tem traço visível, só comandos absolutos e geometria dentro da área segura', (nome) => {
    const formas = ICONES[nome] as readonly Forma[];
    expect(formas.some((forma) => !forma.apoio)).toBe(true);
    for (const forma of formas) {
      if (forma.t === 'path') expect(forma.d, 'comandos relativos impedem a verificação da área segura').not.toMatch(/[a-z]/);
      for (const valor of coordenadas(forma)) {
        expect(Number.isFinite(valor)).toBe(true);
        expect(valor).toBeGreaterThanOrEqual(MINIMO);
        expect(valor).toBeLessThanOrEqual(MAXIMO);
      }
    }
  });
});

describe('Componente Icon', () => {
  const nome = (ICONES.escudo ? 'escudo' : TODOS_OS_NOMES.find((n) => ICONES[n])) as IconName;
  const svgDe = (props: Partial<React.ComponentProps<typeof Icon>> = {}): SVGSVGElement => {
    const { container } = render(<Icon name={nome} {...props} />);
    return container.querySelector('svg') as SVGSVGElement;
  };

  it('usa a grade de 24 por 24 px, terminais arredondados e não preenche o contorno', () => {
    const svg = svgDe();
    expect(svg.getAttribute('viewBox')).toBe('0 0 24 24');
    expect(svg.getAttribute('stroke-linecap')).toBe('round');
    expect(svg.getAttribute('stroke-linejoin')).toBe('round');
    expect(svg.getAttribute('fill')).toBe('none');
  });

  it.each(TAMANHOS)('aceita o tamanho %s px', (tamanho) => {
    const svg = svgDe({ size: tamanho });
    expect(svg.getAttribute('width')).toBe(String(tamanho));
    expect(svg.getAttribute('height')).toBe(String(tamanho));
  });

  it('o traço efetivo é 2 px a 24 px, proporcional em 32 e 48 px e 2 px a 16 px (3 unidades da grade)', () => {
    for (const [tamanho, esperado] of [[16, 2], [24, 2], [32, 2.67], [48, 4]] as const) {
      const largura = Number(svgDe({ size: tamanho }).getAttribute('stroke-width'));
      expect((largura * tamanho) / 24).toBeCloseTo(esperado, 1);
    }
  });

  it('o tamanho padrão é 24 px', () => {
    expect(svgDe().getAttribute('width')).toBe('24');
  });

  it.each(ESTADOS)('o estado %s usa a cor do token e atende 3:1 sobre branco e cinza-gelo', (estado) => {
    const svg = svgDe({ state: estado });
    expect(svg.style.color).toBe(`var(--color-${COR_DO_ESTADO[estado]})`);
    for (const fundo of ['branco', 'cinza-gelo'] as const) {
      expect(contrastRatio(cores[COR_DO_ESTADO[estado]], cores[fundo])).toBeGreaterThanOrEqual(3);
    }
  });

  it('o estado padrão é "padrao", o ativo usa verde escuro, o desabilitado a borda de controle e o erro a cor de erro', () => {
    expect(COR_DO_ESTADO).toEqual({ padrao: 'grafite', ativo: 'verde-escuro', desabilitado: 'borda-controle', erro: 'erro' });
    expect(svgDe().style.color).toBe('var(--color-grafite)');
  });

  it('a variante duotone desenha as camadas de apoio; contorno e monocromática não', () => {
    const contagem = (variante: (typeof VARIANTES)[number]): number =>
      svgDe({ variant: variante }).querySelectorAll('[data-apoio="true"]').length;
    expect(contagem('duotone')).toBeGreaterThan(0);
    expect(contagem('contorno')).toBe(0);
    expect(contagem('monocromatica')).toBe(0);
  });

  it('a variante monocromática herda a cor do texto e a negativa é branca', () => {
    expect(svgDe({ variant: 'monocromatica' }).style.color).toBe('');
    expect(svgDe({ variant: 'negativa' }).style.color).toBe('var(--color-branco)');
  });

  it('sem rótulo o ícone é decorativo: oculto da tecnologia assistiva e fora da ordem de foco', () => {
    const svg = svgDe();
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(svg.getAttribute('focusable')).toBe('false');
    expect(svg.getAttribute('role')).toBeNull();
  });

  it('com rótulo o ícone vira imagem com nome acessível', () => {
    const svg = svgDe({ label: 'Escudo de segurança' });
    expect(svg.getAttribute('role')).toBe('img');
    expect(svg.getAttribute('aria-label')).toBe('Escudo de segurança');
    expect(svg.getAttribute('aria-hidden')).toBeNull();
  });

  it('um ícone desconhecido é erro de programação', () => {
    expect(() => render(<Icon name={'inexistente' as IconName} />)).toThrow(/inexistente/);
  });
});
