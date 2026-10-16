import { describe, expect, it } from 'vitest';
import { enderecoIncorporado, idDoVideo } from './video-incorporado';

// Spec 011 (adaptação ao pitch): o vídeo toca na própria página, com o player de privacidade reforçada, só a partir de endereços conhecidos.
describe('Vídeo incorporado', () => {
  it('extrai o identificador dos dois formatos de endereço usados na página', () => {
    expect(idDoVideo('https://www.youtube.com/watch?v=VBYOPnadE9M')).toBe('VBYOPnadE9M');
    expect(idDoVideo('https://youtu.be/j7Qnq4MC9ZE')).toBe('j7Qnq4MC9ZE');
  });

  it('recusa canal, outro domínio, http e identificador malformado', () => {
    expect(idDoVideo('https://www.youtube.com/channel/UCdPUZsu3yPHOae_sGLkX1oQ')).toBeNull();
    expect(idDoVideo('https://exemplo.invalid/watch?v=VBYOPnadE9M')).toBeNull();
    expect(idDoVideo('http://youtu.be/j7Qnq4MC9ZE')).toBeNull();
    expect(idDoVideo('https://youtu.be/curto')).toBeNull();
    expect(idDoVideo('não é endereço')).toBeNull();
  });

  it('o player usa youtube-nocookie.com, começa a tocar ao abrir e não sugere vídeos de outros canais', () => {
    const url = new URL(enderecoIncorporado('VBYOPnadE9M'));
    expect(url.origin).toBe('https://www.youtube-nocookie.com');
    expect(url.pathname).toBe('/embed/VBYOPnadE9M');
    expect(url.searchParams.get('autoplay')).toBe('1');
    expect(url.searchParams.get('rel')).toBe('0');
    expect(() => enderecoIncorporado('"><script>')).toThrow();
  });
});
