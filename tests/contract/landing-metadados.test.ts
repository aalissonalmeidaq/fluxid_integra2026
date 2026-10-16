// @vitest-environment node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Spec 011, T046 (RF-011): título, descrição e pré-visualização de compartilhamento próprios, em português do Brasil, sem rastreador.
const RAIZ = join(import.meta.dirname, '..', '..');
const html = readFileSync(join(RAIZ, 'index.html'), 'utf8');
const meta = (atributo: string, nome: string): string | undefined =>
  new RegExp(`<meta[^>]*${atributo}="${nome}"[^>]*content="([^"]*)"|<meta[^>]*content="([^"]*)"[^>]*${atributo}="${nome}"`).exec(html)?.slice(1).find(Boolean);

describe('Metadados de compartilhamento', () => {
  it('o título e a descrição falam do projeto, em português do Brasil', () => {
    expect(html).toMatch(/<html lang="pt-BR"/);
    expect(/<title>([^<]+)<\/title>/.exec(html)?.[1]).toMatch(/FluxID/);
    expect(meta('name', 'description')).toMatch(/cilindros/i);
    expect((meta('name', 'description') ?? '').length).toBeGreaterThan(60);
    expect((meta('name', 'description') ?? '').length).toBeLessThanOrEqual(200);
  });

  it('tem as marcas Open Graph e do cartão do Twitter', () => {
    expect(meta('property', 'og:title')).toMatch(/FluxID/);
    expect(meta('property', 'og:description')).toBeTruthy();
    expect(meta('property', 'og:type')).toBe('website');
    expect(meta('property', 'og:locale')).toBe('pt_BR');
    expect(meta('property', 'og:site_name')).toBe('FluxID');
    expect(meta('name', 'twitter:card')).toBe('summary_large_image');
  });

  it('a imagem de compartilhamento tem URL absoluta, existe e mede 1200 x 630', () => {
    const imagem = meta('property', 'og:image') ?? '';
    expect(imagem).toMatch(/^https:\/\/fluxid\.tec\.br\/landing\/og-fluxid\.png$/);
    expect(meta('name', 'twitter:image')).toBe(imagem);
    expect(meta('property', 'og:image:alt')).toBeTruthy();
    const png = readFileSync(join(RAIZ, 'public', 'landing', 'og-fluxid.png'));
    expect(png.subarray(1, 4).toString('latin1')).toBe('PNG');
    expect(png.readUInt32BE(16)).toBe(1200);
    expect(png.readUInt32BE(20)).toBe(630);
  });

  it('o endereço canônico é o domínio público do projeto e não há rastreador', () => {
    expect(/<link[^>]*rel="canonical"[^>]*href="([^"]*)"/.exec(html)?.[1]).toBe('https://fluxid.tec.br/');
    expect(html).not.toMatch(/google-analytics|googletagmanager|gtag\(|hotjar|facebook\.net|clarity\.ms|segment\.com|mixpanel/i);
  });

  it('a imagem de compartilhamento não entra no precache do service worker', () => {
    const config = readFileSync(join(RAIZ, 'vite.config.ts'), 'utf8');
    expect(config).toMatch(/globIgnores:\s*\[[^\]]*og-fluxid\.png/);
  });
});
