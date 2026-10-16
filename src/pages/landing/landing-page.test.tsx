import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { SECOES } from './landing-content';
import { LandingPage } from './landing-page';

// Spec 011 (RF-001, RF-005, RF-010): a página completa tem as seções na ordem planejada, um único h1, os marcos semânticos e o link de
// pular como primeiro elemento.
describe('LandingPage', () => {
  it('tem as seções na ordem de SECOES, cada uma com o id da âncora', () => {
    const { container } = render(<LandingPage />);
    const ids = [...container.querySelectorAll('main > section')].map((secao) => secao.id);
    expect(ids).toEqual(SECOES.map((secao) => secao.id));
  });

  it('tem um único h1 e nenhum salto de nível de título', () => {
    render(<LandingPage />);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    const niveis = screen.getAllByRole('heading').map((titulo) => Number(titulo.tagName.slice(1)));
    for (let indice = 1; indice < niveis.length; indice += 1) expect(niveis[indice]! - niveis[indice - 1]!).toBeLessThanOrEqual(1);
  });

  it('tem os marcos: banner, principal e contentinfo, e o menu de âncoras', () => {
    render(<LandingPage />);
    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getAllByRole('main')).toHaveLength(1);
    expect(screen.getByRole('contentinfo')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Seções da página' })).toBeInTheDocument();
  });

  it('"Pular para o conteúdo" é o primeiro elemento da página e aponta para o conteúdo principal', () => {
    const { container } = render(<LandingPage />);
    const primeiro = container.querySelector('a, button, input, [tabindex]');
    expect(primeiro).toHaveTextContent('Pular para o conteúdo');
    expect(primeiro).toHaveAttribute('href', '#main-content');
    expect(container.querySelector('main#main-content')).toHaveAttribute('tabindex', '-1');
  });

  it('toda âncora do menu e dos botões leva a uma seção que existe', () => {
    const { container } = render(<LandingPage />);
    const ancoras = [...container.querySelectorAll('a[href^="#"]')].map((link) => link.getAttribute('href')!.slice(1));
    for (const id of ancoras) expect(container.querySelector(`#${id}`), id).not.toBeNull();
  });

  it('atualiza o título do documento', () => {
    render(<LandingPage />);
    expect(document.title).toMatch(/FluxID/);
  });

  it('os links externos são só os 8 destinos: 5 nos materiais e os 3 vídeos nas próprias seções, todos em nova aba com proteção', () => {
    const { container } = render(<LandingPage />);
    const materiais = screen.getByRole('region', { name: 'Materiais do projeto' });
    const externos = screen.getAllByRole('link').filter((link) => /^https?:/.test(link.getAttribute('href') ?? ''));
    expect(externos).toHaveLength(8);
    expect(new Set(externos.map((link) => link.getAttribute('href'))).size).toBe(8);
    for (const link of externos) {
      // Fora dos materiais, só o "Abrir no YouTube" de cada vídeo, dentro do bloco do próprio vídeo.
      expect(materiais.contains(link) || link.closest('article[data-material]') !== null).toBe(true);
      expect(link).toHaveAttribute('target', '_blank');
      expect(link.getAttribute('rel')).toMatch(/noopener/);
    }
    for (const secao of ['pitch', 'trava', 'funcionalidades']) {
      expect(within(container.querySelector(`section#${secao}`) as HTMLElement).getAllByRole('link', { name: /abre em nova aba/i })).toHaveLength(1);
    }
    expect(within(screen.getByRole('banner')).queryAllByRole('link', { name: /youtube|github|drive/i })).toHaveLength(0);
  });
});
