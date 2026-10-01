// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { compile } from '@tailwindcss/node';

// Prova de conceito da decisão D-007: zerar os namespaces do tema do Tailwind 4 faz com que uma classe fora da escala
// não gere nenhum CSS. O teste definitivo, que usa o tokens.css gerado, substitui este (ver escalas-tailwind.test.ts).
const THEME = `@import "tailwindcss";
@theme {
  --color-*: initial;
  --color-grafite: #26384A;
  --spacing: initial;
  --spacing-*: initial;
  --spacing-1: 4px;
  --spacing-4: 16px;
  --spacing-6: 24px;
  --text-*: initial;
  --text-corpo: 16px;
  --font-weight-*: initial;
  --font-weight-medium: 500;
  --radius-*: initial;
  --radius-card: 12px;
}`;

async function build(candidates: string[]): Promise<string> {
  const compiler = await compile(THEME, { base: process.cwd(), onDependency: () => undefined });
  return compiler.build(candidates);
}

describe('Tema do Tailwind com namespaces zerados (D-007)', () => {
  it('gera CSS para as classes que pertencem às escalas', async () => {
    const css = await build(['p-4', 'p-6', 'px-1', 'text-corpo', 'text-grafite', 'font-medium', 'rounded-card']);
    for (const selector of ['.p-4', '.p-6', '.px-1', '.text-corpo', '.text-grafite', '.font-medium', '.rounded-card']) {
      expect(css).toContain(selector);
    }
  });

  it('não gera CSS para classes fora das escalas', async () => {
    const css = await build(['p-3', 'm-2', 'text-sm', 'bg-slate-900', 'font-bold', 'rounded-lg', 'text-[#123456]']);
    for (const selector of ['.p-3', '.m-2', '.text-sm', '.bg-slate-900', '.font-bold', '.rounded-lg']) {
      expect(css).not.toContain(selector);
    }
  });
});
