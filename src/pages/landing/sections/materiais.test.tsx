import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import { MATERIAIS, TEXTOS } from '../landing-content';
import { Materiais } from './materiais';

// Spec 011, T031 (RF-006, RF-008, História 3; críticas de 14/10/2026): os destinos externos em dois blocos, abertos em nova aba com proteção
// de origem e com o aviso de conexão quando o aparelho está offline. Os três vídeos tocam nas seções que comprovam (pitch, trava e o que já
// funciona) e não se repetem aqui; o canal do YouTube, que reúne todos, fica no bloco de código e evidências.
const definirOnline = (online: boolean): void => {
  vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(online);
};

const EXTERNOS = MATERIAIS.filter((item) => item.tipo !== 'video');

afterEach(() => vi.restoreAllMocks());

describe('Materiais do projeto', () => {
  it('é a seção #materiais, nomeada pelo seu único h2', () => {
    const { container } = render(<Materiais />);
    expect(container.querySelector('section#materiais')).not.toBeNull();
    expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(TEXTOS.materiais.titulo);
  });

  it('cada destino tem o ícone do que ele é: pasta, código (repositórios) e vídeo (canal), em vez de configurações e sino (polish de 15/10/2026)', () => {
    const { container } = render(<Materiais />);
    const icone = (id: string): string | null | undefined => container.querySelector(`[data-material="${id}"] [data-icone]`)?.getAttribute('data-icone');
    expect(icone('documentos')).toBe('pasta');
    expect(icone('evidencias')).toBe('pasta');
    expect(icone('repositorio-sistema')).toBe('codigo');
    expect(icone('repositorio-api')).toBe('codigo');
    expect(icone('canal-youtube')).toBe('video');
  });

  it('mostra os 5 destinos externos, cada um com título, descrição e o destino certo; nenhum vídeo se repete aqui', () => {
    render(<Materiais />);
    const links = within(screen.getByRole('region', { name: TEXTOS.materiais.titulo })).getAllByRole('link');
    expect(links).toHaveLength(EXTERNOS.length);
    for (const item of EXTERNOS) {
      const link = screen.getByRole('link', { name: new RegExp(item.titulo) });
      expect(link).toHaveAttribute('href', item.url);
      expect(link).toHaveTextContent(item.descricao);
    }
    for (const video of MATERIAIS.filter((item) => item.tipo === 'video')) expect(screen.queryByText(video.titulo)).not.toBeInTheDocument();
  });

  it('todo link abre em nova aba, com proteção de origem, e avisa que é externo antes de ativar', () => {
    render(<Materiais />);
    for (const link of screen.getAllByRole('link')) {
      expect(link).toHaveAttribute('target', '_blank');
      expect(link.getAttribute('rel')).toContain('noopener');
      expect(link.getAttribute('rel')).toContain('noreferrer');
      expect(link).toHaveAccessibleName(/abre em nova aba/i);
    }
  });

  it('não carrega nenhum player nem recurso de terceiros: sem iframe, script, embed nem vídeo', () => {
    const { container } = render(<Materiais />);
    expect(container.querySelector('iframe, script, embed, object, video, audio, link[rel="stylesheet"]')).toBeNull();
    expect(container.querySelectorAll('img[src^="http"]')).toHaveLength(0);
  });

  it('organiza os destinos em 2 blocos (comece por aqui, código e evidências), com a pasta de documentos sozinha no primeiro', () => {
    const { container } = render(<Materiais />);
    const blocos = TEXTOS.materiais.blocos.map((bloco) => screen.getByRole('region', { name: bloco.titulo }));
    expect(blocos.map((bloco) => within(bloco).getAllByRole('link').length)).toEqual([1, 4]);
    expect(within(blocos[0]!).getByRole('link', { name: /Documentos do projeto/ })).toBeInTheDocument();
    expect(container.querySelector('[data-grade-materiais]')).toHaveClass('desktop:grid-cols-12');
    expect(blocos[0]).toHaveClass('desktop:col-span-5');
    expect(blocos[1]).toHaveClass('desktop:col-span-7');
    expect(container.querySelectorAll('[data-material-secundario]')).toHaveLength(4);
  });

  it('online: nenhum aviso de conexão', () => {
    definirOnline(true);
    render(<Materiais />);
    expect(screen.queryByText(TEXTOS.materiais.precisaConexao)).not.toBeInTheDocument();
  });

  it('offline: cada link informa que precisa de conexão, e o aviso acompanha o evento', () => {
    definirOnline(false);
    render(<Materiais />);
    expect(screen.getAllByText(TEXTOS.materiais.precisaConexao)).toHaveLength(EXTERNOS.length);
    definirOnline(true);
    act(() => { window.dispatchEvent(new Event('online')); });
    expect(screen.queryByText(TEXTOS.materiais.precisaConexao)).not.toBeInTheDocument();
  });
});
