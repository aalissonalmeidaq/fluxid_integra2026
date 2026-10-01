import fs from 'node:fs';
import path from 'node:path';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LARGURA_MINIMA_DIGITAL, PROPORCAO_DO_SIMBOLO, TAMANHOS_DO_SIMBOLO } from './constantes';
import { Logo } from './logo';
import { VARIACOES_DO_CATALOGO } from './logo-variacoes';
import { Simbolo } from './symbol';

// RF-024, RF-025, RF-026, RF-030: o logotipo e o símbolo são os arquivos oficiais da equipe de marca, hospedados no
// aplicativo; as versões que a marca não enviou são derivadas deles sem redesenho.
const OFICIAL = path.resolve(import.meta.dirname, 'oficial');

describe('Simbolo (arquivo oficial icone.svg)', () => {
  it('existe nos tamanhos 256, 64, 32 e 16 px de altura, mantendo a proporção do arquivo oficial', () => {
    expect(TAMANHOS_DO_SIMBOLO).toEqual([256, 64, 32, 16]);
    for (const tamanho of TAMANHOS_DO_SIMBOLO) {
      const { container, unmount } = render(<Simbolo size={tamanho} />);
      const imagem = container.querySelector('img') as HTMLImageElement;
      expect(imagem.getAttribute('height')).toBe(String(tamanho));
      expect(Number(imagem.getAttribute('width'))).toBe(Math.round(tamanho * PROPORCAO_DO_SIMBOLO));
      unmount();
    }
  });

  it('é uma imagem com nome acessível "FluxID" por padrão e decorativo quando indicado', () => {
    const { container, rerender } = render(<Simbolo size={64} />);
    expect(screen.getByRole('img', { name: 'FluxID' })).toBeInTheDocument();
    rerender(<Simbolo size={64} decorative />);
    expect((container.querySelector('img') as HTMLImageElement).getAttribute('alt')).toBe('');
  });

  it('usa sempre o arquivo oficial icone.svg, em todos os tamanhos, sem versão reduzida', () => {
    for (const tamanho of TAMANHOS_DO_SIMBOLO) {
      const { container, unmount } = render(<Simbolo size={tamanho} />);
      const origem = (container.querySelector('img') as HTMLImageElement).getAttribute('src') ?? '';
      expect(origem).toMatch(/\/icone[.-]/);
      expect(origem).not.toContain('reduzido');
      unmount();
    }
  });
});

describe('Logo (arquivos oficiais)', () => {
  it('a largura mínima digital é de 120 px e o componente recusa menos que isso', () => {
    expect(LARGURA_MINIMA_DIGITAL).toBe(120);
    expect(() => render(<Logo variant="horizontal" width={119} />)).toThrow(/120/);
    expect(() => render(<Logo variant="horizontal" width={120} />)).not.toThrow();
  });

  it.each([
    ['horizontal', 'logo-horizontal'],
    ['vertical', 'logo-vertical'],
    ['negativa-branca', 'logo-negativa-branca'],
  ] as const)('a versão %s é a imagem %s com nome acessível "FluxID"', (variant, arquivo) => {
    render(<Logo variant={variant} width={200} />);
    const imagem = screen.getByRole('img', { name: 'FluxID' });
    expect(imagem.getAttribute('src') ?? '').toContain(arquivo);
  });

  it('fica decorativo quando acompanhado do nome em texto', () => {
    const { container } = render(<Logo variant="horizontal" width={160} decorative />);
    expect((container.querySelector('img') as HTMLImageElement).getAttribute('alt')).toBe('');
  });

  it('as proporções seguem os arquivos oficiais: horizontal mais larga que alta e vertical quase quadrada', () => {
    const razao = (variant: 'horizontal' | 'vertical'): number => {
      const { container, unmount } = render(<Logo variant={variant} width={240} />);
      const imagem = container.querySelector('img') as HTMLImageElement;
      unmount();
      return Number(imagem.getAttribute('width')) / Number(imagem.getAttribute('height'));
    };
    expect(razao('horizontal')).toBeGreaterThan(2.5);
    expect(razao('vertical')).toBeLessThan(1);
  });

  it('a largura define a altura pela proporção do arquivo, sem distorcer', () => {
    const { container } = render(<Logo variant="horizontal" width={374} />);
    const imagem = container.querySelector('img') as HTMLImageElement;
    expect(imagem.getAttribute('width')).toBe('374');
    expect(imagem.getAttribute('height')).toBe('130');
  });
});

describe('Variações do catálogo', () => {
  it('cobrem as nove versões da prancha, cada uma com seu arquivo', () => {
    expect(VARIACOES_DO_CATALOGO.map((variacao) => variacao.nome)).toEqual([
      'Assinatura principal (horizontal com slogan)',
      'Assinatura secundária (horizontal sem slogan)',
      'Assinatura vertical',
      'Wordmark',
      'Monocromática azul',
      'Monocromática preta',
      'Escala de cinza',
      'Negativa branca',
      'Símbolo',
    ]);
    const arquivos = VARIACOES_DO_CATALOGO.map((variacao) => variacao.arquivo);
    expect(new Set(arquivos).size).toBe(arquivos.length);
    for (const arquivo of arquivos) expect(arquivo).toBeTruthy();
  });

  it('as versões usadas no aplicativo são secundária, vertical, símbolo e negativa branca', () => {
    expect(VARIACOES_DO_CATALOGO.filter((variacao) => variacao.usadaNoApp).map((variacao) => variacao.nome)).toEqual([
      'Assinatura secundária (horizontal sem slogan)',
      'Assinatura vertical',
      'Negativa branca',
      'Símbolo',
    ]);
  });
});

describe('Arquivos da marca', () => {
  const arquivos = fs.readdirSync(OFICIAL).filter((nome) => nome.endsWith('.svg'));

  it('estão todos no repositório: seis oficiais e quatro derivados, e nenhum ícone reduzido', () => {
    expect(fs.readdirSync(OFICIAL)).not.toContain('icone-reduzido.svg');
    for (const esperado of [
      'logo-principal.svg',
      'logo-vertical.svg',
      'logo-negativa-branca.svg',
      'logo-negativa-navy.svg',
      'logo-monocromatica-preta.svg',
      'icone.svg',
      'logo-horizontal.svg',
      'logo-wordmark.svg',
      'logo-monocromatica-azul.svg',
      'logo-escala-de-cinza.svg',
    ]) {
      expect(arquivos).toContain(esperado);
    }
  });

  it.each(arquivos)('%s é um SVG sem recurso externo, script ou imagem embutida', (nome) => {
    const svg = fs.readFileSync(path.join(OFICIAL, nome), 'utf8');
    expect(svg).toMatch(/<svg[^>]+viewBox="[^"]+"/);
    expect(svg.replace(/http:\/\/www\.w3\.org\/2000\/svg/g, '')).not.toMatch(/https?:\/\//);
    expect(svg).not.toMatch(/<(script|image|use|foreignObject)\b/i);
    expect(svg).not.toMatch(/\son\w+=/i);
  });

  it('só os arquivos derivados trazem o aviso de derivação; os oficiais ficam como a marca enviou', () => {
    const derivados = ['logo-horizontal.svg', 'logo-wordmark.svg', 'logo-monocromatica-azul.svg', 'logo-escala-de-cinza.svg'];
    for (const nome of arquivos) {
      const svg = fs.readFileSync(path.join(OFICIAL, nome), 'utf8');
      expect(svg.includes('Derivado de'), nome).toBe(derivados.includes(nome));
    }
  });

  it('as dimensões declaradas no componente batem com o viewBox dos arquivos oficiais', () => {
    const viewBox = (nome: string): string => (fs.readFileSync(path.join(OFICIAL, nome), 'utf8').match(/viewBox="([^"]+)"/) as RegExpMatchArray)[1] as string;
    expect(viewBox('logo-horizontal.svg')).toBe('0 0 374 130');
    expect(viewBox('logo-vertical.svg')).toBe('0 0 159 164');
    expect(viewBox('logo-negativa-branca.svg')).toBe('0 0 214 79');
    expect(viewBox('icone.svg')).toBe('0 0 104 126');
  });
});
