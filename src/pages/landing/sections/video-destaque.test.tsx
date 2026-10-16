import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MATERIAIS, TEXTOS, VIDEO_DA_SECAO } from '../landing-content';
import { idDoVideo } from '../video-incorporado';
import { VideoDestaque } from './video-destaque';

// Spec 011 (adaptação ao pitch; vídeos nas próprias seções desde a segunda crítica de 14/10/2026): o vídeo toca na própria página. Antes do
// clique, nenhum player nem recurso de terceiros; depois, o player de privacidade reforçada entra no lugar da capa e recebe o foco.
afterEach(() => vi.restoreAllMocks());

const pitch = MATERIAIS.find((item) => item.id === VIDEO_DA_SECAO.pitch)!;

describe('Vídeo na própria página', () => {
  it('os três vídeos têm seção própria e vêm da lista de materiais (fonte única)', () => {
    expect(Object.values(VIDEO_DA_SECAO).sort()).toEqual(MATERIAIS.filter((item) => item.tipo === 'video').map((item) => item.id).sort());
  });

  it('antes do clique, a capa é um botão "Assistir" desenhado pelo projeto: sem iframe, script nem imagem de terceiros', () => {
    const { container } = render(<VideoDestaque material={pitch} />);
    expect(container.querySelector('[data-palco]')).not.toBeNull();
    expect(screen.getByRole('button', { name: new RegExp(`Assistir: ${pitch.titulo}`) })).toBeEnabled();
    expect(container.querySelector('iframe, script, embed, video, audio, img[src^="http"]')).toBeNull();
  });

  it('mostra o domínio oficial do FluxID no mockup do protótipo do sistema', () => {
    const sistema = MATERIAIS.find((item) => item.id === VIDEO_DA_SECAO.funcionalidades)!;
    render(<VideoDestaque material={sistema} />);
    expect(screen.getByText('fluxid.tec.br/demonstracao')).toBeInTheDocument();
  });

  it('ao tocar em "Assistir", o vídeo toca no player de privacidade reforçada e o player recebe o foco', () => {
    const { container } = render(<VideoDestaque material={pitch} />);
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`Assistir: ${pitch.titulo}`) }));
    const player = container.querySelector('iframe') as HTMLIFrameElement;
    expect(player.src).toBe(`https://www.youtube-nocookie.com/embed/${idDoVideo(pitch.url)}?autoplay=1&rel=0&playsinline=1`);
    expect(player).toHaveAttribute('title', expect.stringContaining(pitch.titulo));
    expect(player).toHaveAttribute('allowfullscreen');
    expect(document.activeElement).toBe(player);
  });

  it('"Fechar o vídeo" volta à capa e devolve o foco ao botão "Assistir"', () => {
    const { container } = render(<VideoDestaque material={pitch} />);
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`Assistir: ${pitch.titulo}`) }));
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`${TEXTOS.video.voltarACapa}: ${pitch.titulo}`) }));
    expect(container.querySelector('iframe')).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: new RegExp(`Assistir: ${pitch.titulo}`) }));
  });

  it('se o player não carregar em 10 s, avisa e leva ao YouTube; se carregar, não avisa', () => {
    vi.useFakeTimers();
    try {
      const { container } = render(<VideoDestaque material={pitch} />);
      fireEvent.click(screen.getByRole('button', { name: /Assistir: / }));
      act(() => { vi.advanceTimersByTime(9_000); });
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
      act(() => { vi.advanceTimersByTime(2_000); });
      expect(screen.getByRole('status')).toHaveTextContent(TEXTOS.video.demorou);
      fireEvent.click(screen.getByRole('button', { name: /Fechar o vídeo: / }));
      fireEvent.click(screen.getByRole('button', { name: /Assistir: / }));
      fireEvent.load(container.querySelector('iframe')!);
      act(() => { vi.advanceTimersByTime(20_000); });
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('mantém o link para assistir no YouTube, em nova aba', () => {
    render(<VideoDestaque material={pitch} />);
    const link = screen.getByRole('link', { name: new RegExp(`${TEXTOS.video.abrirNoYoutube}: ${pitch.titulo}`) });
    expect(link).toHaveAttribute('href', pitch.url);
    expect(link).toHaveAttribute('target', '_blank');
    expect(link.getAttribute('rel')).toMatch(/noopener/);
    expect(link).toHaveAccessibleName(/abre em nova aba/i);
  });

  it('offline: o botão avisa que precisa de conexão e não abre o player', () => {
    vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(false);
    const { container } = render(<VideoDestaque material={pitch} />);
    const botao = screen.getByRole('button', { name: new RegExp(pitch.titulo) });
    expect(botao).toBeDisabled();
    expect(botao).toHaveTextContent(TEXTOS.materiais.precisaConexao);
    // Parece desativado (crítica de 15/10/2026): no lugar do play verde, o ícone de sem sinal.
    expect(botao.querySelector('[data-play]')).toBeNull();
    expect(botao.querySelector('[data-sem-sinal]')).not.toBeNull();
    fireEvent.click(botao);
    expect(container.querySelector('iframe')).toBeNull();
  });
});
