import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TELAS, TEXTOS } from '../landing-content';
import { Hero, TELA_DA_ABERTURA } from './hero';

// Spec 011, T016 (RF-005, RF-010): a abertura tem o único h1 da página, a chamada, o subtítulo e os dois caminhos de ação.
describe('Hero (abertura)', () => {
  it('tem um único título de primeiro nível com a chamada principal', () => {
    render(<Hero />);
    const titulos = screen.getAllByRole('heading', { level: 1 });
    expect(titulos).toHaveLength(1);
    expect(titulos[0]).toHaveTextContent(TEXTOS.abertura.titulo);
  });

  it('traz o gancho do pitch e o subtítulo, sem etiqueta acima do título', () => {
    const { container } = render(<Hero />);
    expect(screen.getByText(TEXTOS.abertura.gancho)).toBeInTheDocument();
    expect(screen.getByText(TEXTOS.abertura.subtitulo)).toBeInTheDocument();
    // O título é o primeiro texto da abertura: nada de selo ou etiqueta acima dele.
    const texto = container.querySelector('.landing-hero-texto') as HTMLElement;
    expect(texto.firstElementChild?.tagName).toBe('H1');
    const conteudo = container.querySelector('.landing-hero-grade') as HTMLElement;
    expect(conteudo).toContainElement(texto);
    expect(conteudo).toContainElement(screen.getByText(TEXTOS.abertura.subtitulo));
  });

  it('a ação principal é assistir ao pitch e a segunda leva à trava; entrar no sistema fica no cabeçalho', () => {
    render(<Hero />);
    expect(screen.getByRole('link', { name: TEXTOS.abertura.acaoPrincipal })).toHaveAttribute('href', '#assistir-video-pitch');
    expect(screen.getByRole('link', { name: TEXTOS.abertura.acaoSecundaria })).toHaveAttribute('href', '#trava');
    expect(screen.queryByRole('link', { name: 'Entrar no sistema' })).not.toBeInTheDocument();
  });

  it('é a seção #inicio, dentro de uma região nomeada pelo título', () => {
    const { container } = render(<Hero />);
    const secao = container.querySelector('section#inicio');
    expect(secao).not.toBeNull();
    expect(secao).toHaveAttribute('aria-labelledby');
    const rotulo = secao?.getAttribute('aria-labelledby') ?? '';
    expect(container.querySelector(`#${rotulo}`)?.tagName).toBe('H1');
  });

  it('as camadas de brilho e a cadeia de custódia são decorativas e ficam fora da leitura', () => {
    const { container } = render(<Hero />);
    const decorativos = container.querySelectorAll('[data-decorativo]');
    expect(decorativos.length).toBeGreaterThan(0);
    for (const elemento of decorativos) expect(elemento).toHaveAttribute('aria-hidden', 'true');
  });

  it('reserva o espaço do mascote, para a imagem não deslocar o layout quando chegar', () => {
    const { container } = render(<Hero />);
    expect(container.querySelector('[data-area-mascote]')).not.toBeNull();
  });

  it('mostra o produto real com o cilindro, o mascote e uma tela do sistema marcada como exemplo', () => {
    const { container } = render(<Hero />);
    expect(container.querySelector('[data-mascote="abertura"]')).toHaveAttribute('data-pose', 'cilindro');
    expect(screen.getByRole('img', { name: TELAS[0]!.alt })).toHaveAttribute('src', TELA_DA_ABERTURA);
    expect(container.querySelector('[data-tela-hero]')).toHaveTextContent('Exemplo');
  });

  it('mantém textos funcionais em pelo menos 16 px para leitura confortável', () => {
    const { container } = render(<Hero />);
    expect(container.querySelector('[data-tela-hero] figcaption')).toHaveClass('text-corpo');
    expect(container.querySelector('[data-cartao-rastreio] [data-detalhe]')).toHaveClass('text-corpo');
    expect(container.querySelector('[data-cartao-rastreio] ol')).toHaveClass('text-corpo');
    expect(screen.getByRole('link', { name: TEXTOS.abertura.rolar })).toHaveClass('text-corpo');
  });

  it('ocupa a tela inteira e convida a rolar para a história do C-262', () => {
    const { container } = render(<Hero />);
    expect(container.querySelector('section#inicio')).toHaveClass('landing-hero');
    expect(screen.getByRole('link', { name: TEXTOS.abertura.rolar })).toHaveAttribute('href', '#historia');
  });

  it('mostra o cartão de rastreio do C-262 marcado "Exemplo", com as etapas em ordem', () => {
    const { container } = render(<Hero />);
    const cartao = container.querySelector('[data-cartao-rastreio]') as HTMLElement;
    expect(cartao.querySelector('[data-etapa="atual"]')).toHaveTextContent(TEXTOS.abertura.cartao.estados[1]!);
    expect(cartao).toHaveTextContent(TEXTOS.abertura.cartao.titulo);
    expect(cartao).toHaveTextContent('Exemplo');
    const etapas = cartao.querySelectorAll('li');
    expect([...etapas].map((etapa) => etapa.textContent)).toEqual([...TEXTOS.abertura.cartao.estados]);
  });
});
