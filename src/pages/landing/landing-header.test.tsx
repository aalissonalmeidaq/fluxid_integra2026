import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import { LandingHeader } from './landing-header';
import { LandingFooter } from './landing-footer';
import { TEXTOS } from './landing-content';

// Spec 011, T017 (RF-005, RF-010): cabeçalho com o logotipo, as âncoras e o botão por sessão; rodapé com a identificação do projeto.
describe('LandingHeader', () => {
  // O cabeçalho mede a rolagem a cada quadro (requestAnimationFrame); aqui os quadros andam com o relógio falso.
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame'] });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('é o banner da página, com o logotipo como link de volta ao topo (não é o h1)', () => {
    render(<LandingHeader />);
    const cabecalho = screen.getByRole('banner');
    const logo = within(cabecalho).getByRole('link', { name: 'FluxID' });
    expect(logo).toHaveAttribute('href', '#inicio');
    expect(within(cabecalho).queryByRole('heading')).not.toBeInTheDocument();
  });

  it('a logo do topo é grande (em destaque) e volta ao início da página', () => {
    render(<LandingHeader />);
    const logo = within(screen.getByRole('banner')).getByRole('link', { name: 'FluxID' });
    expect(logo).toHaveAttribute('href', '#inicio');
    const imagem = logo.querySelector('img, svg') as HTMLElement;
    expect(imagem).toHaveClass('landing-logo-topo');
  });

  it('tem a navegação por âncoras das seções principais', () => {
    render(<LandingHeader />);
    const nav = screen.getByRole('navigation', { name: 'Seções da página' });
    // A sequência do pitch: a história, o pitch em vídeo, a trava, o piloto, os planos (16/10/2026: quem decide chega direto aos valores) e
    // os materiais.
    const esperado: Array<[string, string]> = [
      ['A história', '#historia'],
      ['Pitch', '#pitch'],
      ['Trava', '#trava'],
      ['Piloto', '#piloto'],
      ['Planos', '#planos'],
      ['Materiais', '#materiais'],
    ];
    expect(within(nav).getAllByRole('link')).toHaveLength(esperado.length);
    for (const [nome, ancora] of esperado) expect(within(nav).getByRole('link', { name: nome })).toHaveAttribute('href', ancora);
  });

  it('na abertura o cabeçalho rola com a página; depois dela vira a barra compacta fixa, com a seção atual marcada no menu', () => {
    const { container } = render(
      <>
        <LandingHeader />
        <section id="inicio" />
        <section id="historia" />
        <section id="pitch" />
        <section id="causa" />
      </>,
    );
    const cabecalho = screen.getByRole('banner');
    expect(cabecalho).not.toHaveAttribute('data-compacto');
    const posicao = (id: string, topo: number, base: number): void => {
      const secao = container.querySelector<HTMLElement>(`#${id}`)!;
      secao.getBoundingClientRect = () => ({ top: topo, bottom: base, left: 0, right: 0, width: 0, height: base - topo, x: 0, y: topo, toJSON: () => ({}) });
    };
    // A pessoa rolou até o pitch: a abertura já saiu da tela.
    posicao('inicio', -3000, -2100);
    posicao('historia', -2100, -100);
    posicao('pitch', -100, 600);
    posicao('causa', 600, 1300);
    act(() => {
      window.dispatchEvent(new Event('scroll'));
      vi.runAllTimers();
    });
    expect(cabecalho).toHaveAttribute('data-compacto');
    const nav = within(cabecalho).getByRole('navigation', { name: 'Seções da página' });
    expect(within(nav).getByRole('link', { name: 'Pitch' })).toHaveAttribute('aria-current', 'location');
    expect(within(nav).getByRole('link', { name: 'A história' })).not.toHaveAttribute('aria-current');
    // Lendo a Causa, que não tem âncora no menu: nada fica marcado (marcar "Pitch" seria uma localização falsa).
    posicao('historia', -2800, -800);
    posicao('pitch', -800, -100);
    posicao('causa', -100, 600);
    act(() => {
      window.dispatchEvent(new Event('scroll'));
      vi.runAllTimers();
    });
    expect(cabecalho).toHaveAttribute('data-compacto');
    expect(within(nav).queryByRole('link', { current: 'location' })).not.toBeInTheDocument();
    // De volta à abertura: o cabeçalho deixa de ser fixo e nenhuma âncora fica marcada.
    posicao('inicio', 0, 900);
    posicao('historia', 900, 2800);
    posicao('pitch', 2800, 3500);
    act(() => {
      window.dispatchEvent(new Event('scroll'));
      vi.runAllTimers();
    });
    expect(cabecalho).not.toHaveAttribute('data-compacto');
    expect(within(nav).queryByRole('link', { current: 'location' })).not.toBeInTheDocument();
  });

  it('tem o botão por sessão ("Entrar no sistema" para quem não tem sessão)', () => {
    render(<LandingHeader />);
    expect(within(screen.getByRole('banner')).getByRole('link', { name: 'Entrar no sistema' })).toHaveAttribute('href', '/login');
  });
});

describe('LandingFooter', () => {
  it('é o contentinfo, com a identificação do projeto e a nota sobre os dados de exemplo', () => {
    render(<LandingFooter />);
    const rodape = screen.getByRole('contentinfo');
    expect(within(rodape).getByText(TEXTOS.rodape.identificacao)).toBeInTheDocument();
    expect(within(rodape).getByText(TEXTOS.rodape.nota)).toBeInTheDocument();
  });

  it('só tem links internos e os do sistema: nada de coleta de dados', () => {
    render(<LandingFooter />);
    const rodape = screen.getByRole('contentinfo');
    for (const link of within(rodape).getAllByRole('link')) expect(link.getAttribute('href')).toMatch(/^(#|\/)/);
    expect(within(rodape).queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('abaixo de 1024 px, o sanduíche abre a gaveta de âncoras; Escape e a escolha de uma seção fecham e o foco volta ao botão', async () => {
    const { fireEvent } = await import('@testing-library/react');
    render(<LandingHeader />);
    const botao = screen.getByRole('button', { name: 'Menu' });
    expect(botao).toHaveAttribute('aria-expanded', 'false');
    expect(botao).toHaveAttribute('aria-controls', 'landing-gaveta');
    fireEvent.click(botao);
    expect(botao).toHaveAttribute('aria-expanded', 'true');
    const gaveta = document.getElementById('landing-gaveta') as HTMLElement;
    expect(gaveta).toHaveAttribute('role', 'dialog');
    expect(gaveta).toHaveAttribute('aria-modal', 'true');
    expect(within(gaveta).getByRole('link', { name: 'Trava' })).toHaveAttribute('href', '#trava');
    expect(within(gaveta).getByRole('link', { name: 'Entrar no sistema' })).toHaveAttribute('href', '/login');
    // Na gaveta, entrar é secundário (contorno): o verde fica para a ação principal da página.
    expect(within(gaveta).getByRole('link', { name: 'Entrar no sistema' })).toHaveAttribute('data-variante', 'contorno');
    expect(gaveta.contains(document.activeElement)).toBe(true);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(document.getElementById('landing-gaveta')).toBeNull();
    expect(document.activeElement).toBe(botao);
    fireEvent.click(botao);
    fireEvent.click(within(document.getElementById('landing-gaveta') as HTMLElement).getByRole('link', { name: 'Piloto' }));
    expect(document.getElementById('landing-gaveta')).toBeNull();
  });
  it('o sanduíche não tem caixa: fica branco sobre fundo escuro, navy sobre fundo claro e branco de novo com a gaveta aberta', async () => {
    const { act, fireEvent } = await import('@testing-library/react');
    const claro = document.createElement('div');
    claro.className = 'bg-branco';
    claro.style.backgroundColor = 'white';
    document.body.append(claro);
    const original = document.elementsFromPoint;
    document.elementsFromPoint = () => [claro];
    try {
      render(<LandingHeader />);
      const botao = screen.getByRole('button', { name: 'Menu' });
      expect(botao).not.toHaveClass('bg-navy');
      expect(botao).not.toHaveClass('shadow-dialogo');
      expect(botao).toHaveAttribute('data-tom', 'claro');
      expect(botao).toHaveClass('text-navy');
      claro.style.backgroundColor = 'navy';
      await act(async () => {
        window.dispatchEvent(new Event('scroll'));
        await new Promise((resolver) => requestAnimationFrame(() => resolver(undefined)));
      });
      expect(botao).toHaveAttribute('data-tom', 'escuro');
      expect(botao).toHaveClass('text-branco');
      claro.style.backgroundColor = 'white';
      await act(async () => {
        window.dispatchEvent(new Event('scroll'));
        await new Promise((resolver) => requestAnimationFrame(() => resolver(undefined)));
      });
      fireEvent.click(botao);
      expect(botao).toHaveAttribute('data-tom', 'escuro');
    } finally {
      document.elementsFromPoint = original;
      claro.remove();
    }
  });
});
