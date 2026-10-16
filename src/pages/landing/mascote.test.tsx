import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Mascote } from './mascote';

// Spec 011, T037 (RF-009, casos de borda): o mascote é imagem otimizada com dimensões fixas, descrito só no primeiro uso, carregado
// com prioridade só na abertura e substituído pelo logotipo se a imagem falhar.
describe('Mascote', () => {
  it('abertura: imagem descrita, com prioridade alta e dimensões fixas', () => {
    render(<Mascote uso="abertura" />);
    const imagem = screen.getByRole('img', { name: /Mascote do FluxID/ });
    expect(imagem.tagName).toBe('IMG');
    expect(imagem).toHaveAttribute('fetchpriority', 'high');
    expect(imagem).not.toHaveAttribute('loading', 'lazy');
    expect(imagem).toHaveAttribute('width', '749');
    expect(imagem).toHaveAttribute('height', '804');
    expect(imagem).toHaveAttribute('decoding', 'async');
  });

  it('a descrição conta o que a imagem mostra', () => {
    render(<Mascote uso="abertura" />);
    expect(screen.getByRole('img')).toHaveAccessibleName(/mascote.*cilindro azul.*dispositivo inteligente de rastreio/i);
  });

  it.each(['cartao', 'historia', 'causa', 'video', 'explica', 'contrato', 'final'] as const)('%s: decorativo (alt vazio), carregado sob demanda e sem prioridade', (uso) => {
    const { container } = render(<Mascote uso={uso} />);
    const imagem = container.querySelector('img');
    expect(imagem).toHaveAttribute('alt', '');
    expect(imagem).toHaveAttribute('loading', 'lazy');
    expect(imagem).not.toHaveAttribute('fetchpriority', 'high');
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('usa WebP otimizado em duas larguras com sizes, sem recurso externo', () => {
    const { container } = render(<Mascote uso="abertura" />);
    const imagem = container.querySelector('img')!;
    expect(imagem.getAttribute('src')).toBe('/landing/mascote-cilindro-749.webp');
    const conjunto = imagem.getAttribute('srcset') ?? '';
    expect(conjunto).toContain('/landing/mascote-cilindro-400.webp 400w');
    expect(conjunto).toContain('/landing/mascote-cilindro-749.webp 749w');
    expect(imagem.getAttribute('sizes')).toBeTruthy();
    expect(conjunto).not.toMatch(/https?:/);
  });

  it('cada momento usa a pose que combina com ele: apresenta o cilindro na abertura, procura e se preocupa na perda, aponta, mostra o contrato e fecha com o cilindro', () => {
    const esperadas: Array<[Parameters<typeof Mascote>[0]['uso'], string]> = [
      ['abertura', 'cilindro'],
      ['cartao', 'rosto'],
      ['historia', 'procurando'],
      ['video', 'procurando'],
      ['causa', 'preocupado'],
      ['explica', 'indicando'],
      ['contrato', 'tablet'],
      ['final', 'cilindro'],
    ];
    for (const [uso, pose] of esperadas) {
      const { container, unmount } = render(<Mascote uso={uso} />);
      expect(container.querySelector('img'), uso).toHaveAttribute('data-pose', pose);
      unmount();
    }
  });

  it('as poses da apresentação existem em WebP nas larguras declaradas, sem passar do tamanho da arte', () => {
    const { container } = render(<Mascote uso="historia" />);
    const imagem = container.querySelector('img')!;
    expect(imagem.getAttribute('srcset')).toContain('/landing/mascote-procurando-240.webp 240w');
    expect(imagem.getAttribute('src')).toBe('/landing/mascote-procurando-323.webp');
    expect(imagem).toHaveAttribute('width', '323');
    expect(imagem).toHaveAttribute('height', '482');
    for (const uso of ['historia', 'causa', 'explica', 'contrato', 'final'] as const) {
      const { container: bloco, unmount } = render(<Mascote uso={uso} />);
      for (const candidato of (bloco.querySelector('img')!.getAttribute('srcset') ?? '').split(',')) {
        const arquivo = candidato.trim().split(' ')[0]!;
        expect(existsSync(join(import.meta.dirname, '..', '..', '..', 'public', arquivo)), arquivo).toBe(true);
      }
      unmount();
    }
  });

  it('se a imagem falhar, mostra o logotipo e a página continua legível', () => {
    const { container } = render(<Mascote uso="abertura" />);
    fireEvent.error(container.querySelector('img')!);
    expect(container.querySelector('img[src="/landing/mascote-768.webp"]')).toBeNull();
    expect(screen.getByRole('img', { name: 'FluxID' })).toBeInTheDocument();
  });

  it('é decorativo para o leitor de tela fora da abertura, e o recipiente não rouba o foco', () => {
    const { container } = render(<Mascote uso="final" />);
    expect(container.querySelector('[tabindex]')).toBeNull();
  });

  it('o index.html pré-carrega a imagem da abertura só na landing, com o mesmo conjunto e os mesmos tamanhos do componente', () => {
    const html = readFileSync(join(import.meta.dirname, '..', '..', '..', 'index.html'), 'utf8');
    expect(html).toMatch(/location\.pathname === '\/' && !matchMedia\('\(display-mode: standalone\)'\)\.matches/);
    const { container } = render(<Mascote uso="abertura" />);
    const imagem = container.querySelector('img')!;
    expect(/setAttribute\('imagesrcset', '([^']+)'\)/.exec(html)?.[1]).toBe(imagem.getAttribute('srcset'));
    expect(/setAttribute\('imagesizes', '([^']+)'\)/.exec(html)?.[1]).toBe(imagem.getAttribute('sizes'));
  });
});
