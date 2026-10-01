import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { gerarTokensCss } from './gerar-css';

// tokens.css é gerado por `npm run tokens:gerar` a partir de tokens.ts e nunca editado à mão (RF-001).
const ARQUIVO = path.resolve(import.meta.dirname, 'tokens.css');
const ler = (arquivo: string): string => fs.readFileSync(arquivo, 'utf8').replace(/\r\n/g, '\n');

describe('tokens.css gerado', () => {
  it('é igual à saída do gerador a partir de tokens.ts', () => {
    expect(ler(ARQUIVO)).toBe(gerarTokensCss());
  });

  it('zera as escalas padrão do Tailwind e declara só os tokens do FluxID', () => {
    const css = gerarTokensCss();
    for (const zerado of ['--color-*: initial', '--spacing: initial', '--spacing-*: initial', '--text-*: initial', '--font-weight-*: initial', '--radius-*: initial']) {
      expect(css).toContain(zerado);
    }
    expect(css).toContain('--color-azul-profundo: #1249B8;');
    expect(css).toContain('--spacing-4: 16px;');
    expect(css).toContain('--spacing-alvo: 44px;');
    expect(css).toContain('--text-corpo: 16px;');
    expect(css).toContain('--radius-card: 12px;');
    expect(css).toContain('--container-largo: 1200px;');
  });

  it('declara a família com Montserrat variável, Arial e sans-serif', () => {
    expect(gerarTokensCss()).toMatch(/--font-sans: 'Montserrat Variable', Montserrat, Arial, sans-serif;/);
  });

  it('declara os gradientes oficiais como variáveis', () => {
    const css = gerarTokensCss();
    expect(css).toContain('--gradiente-azul-digital: linear-gradient(135deg, #1249B8, #23AFE5);');
    expect(css).toContain('--gradiente-profundidade: linear-gradient(135deg, #163B72, #1249B8);');
  });
});
