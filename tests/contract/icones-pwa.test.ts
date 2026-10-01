import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// RF-025: o favicon e os ícones de instalação da PWA derivam do símbolo oficial da marca (arquivo icone.svg).
const ROOT = path.resolve(import.meta.dirname, '../..');
const PUBLIC = path.join(ROOT, 'public');
const OFICIAL = path.join(ROOT, 'src', 'design-system', 'brand', 'oficial');

function dimensoesDoPng(arquivo: string): { largura: number; altura: number } {
  const buffer = fs.readFileSync(arquivo);
  expect(buffer.subarray(1, 4).toString('ascii')).toBe('PNG');
  return { largura: buffer.readUInt32BE(16), altura: buffer.readUInt32BE(20) };
}

describe('Ícones da PWA derivados do símbolo oficial', () => {
  it.each([
    ['icon-192.png', 192],
    ['icon-512.png', 512],
    ['maskable-512.png', 512],
  ])('%s existe com %i px de lado', (nome, lado) => {
    expect(dimensoesDoPng(path.join(PUBLIC, 'icons', nome))).toEqual({ largura: lado, altura: lado });
  });

  it('o favicon é idêntico, byte a byte, ao icone.svg oficial da marca', () => {
    const favicon = fs.readFileSync(path.join(PUBLIC, 'favicon.svg'));
    const oficial = fs.readFileSync(path.join(OFICIAL, 'icone.svg'));
    expect(favicon.equals(oficial)).toBe(true);
    const svg = favicon.toString('utf8');
    expect(svg).toContain('viewBox="0 0 104 126"');
    expect(svg).toContain('#0138B3');
    expect(svg).not.toMatch(/#0f172a|#10b981/i);
    expect(svg).not.toMatch(/https?:\/\/(?!www\.w3\.org)/);
  });

  it('o manifesto da PWA referencia os três ícones e o index.html referencia o favicon', () => {
    const vite = fs.readFileSync(path.join(ROOT, 'vite.config.ts'), 'utf8');
    for (const icone of ['/icons/icon-192.png', '/icons/icon-512.png', '/icons/maskable-512.png']) expect(vite).toContain(icone);
    expect(vite).toContain("purpose: 'maskable'");
    expect(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8')).toContain('href="/favicon.svg"');
  });

  it('o script que gera os ícones parte só do icone.svg oficial, sem versão reduzida', () => {
    const script = fs.readFileSync(path.join(ROOT, 'scripts', 'design-system', 'gerar-icones-pwa.mjs'), 'utf8');
    expect(script).toContain('icone.svg');
    expect(script).toContain('favicon.svg');
    expect(script).not.toContain('reduzido');
    expect(script).not.toContain('geometria');
  });
});
