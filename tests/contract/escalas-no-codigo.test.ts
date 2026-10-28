// @vitest-environment node
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { compile } from '@tailwindcss/node';

// RNF-006 e CA-013: nenhuma tela cria cor, tamanho de fonte ou espaçamento fora dos tokens. A verificação compila as
// classes que aparecem no código com o tema do FluxID (tokens.css) e reprova a que não gera estilo, além de cores
// literais e valores arbitrários do Tailwind.
const ROOT = path.resolve(import.meta.dirname, '../..');
const SRC = path.join(ROOT, 'src');
// O catálogo (documentação do design system) também só usa os tokens.
const CATALOGO = path.join(ROOT, 'catalogo');
const TOKENS_CSS = path.join(SRC, 'design-system', 'tokens.css');

// Arquivos ainda no visual anterior à Spec 003. Cada tela migrada sai desta lista; a lista deve chegar a vazia na
// tarefa T074. Não acrescente arquivos novos aqui: tela nova usa só os tokens.
const PENDENTES: Record<string, string> = {};

const FORA_DA_VARREDURA = [
  path.join('src', 'design-system', 'tokens.ts'),
  path.join('src', 'design-system', 'tokens.css'),
  path.join('src', 'design-system', 'gerar-css.ts'),
  path.join('src', 'test') + path.sep,
];

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

const FILES = [...walk(SRC), ...walk(CATALOGO)].filter((file) => {
  const relative = path.relative(ROOT, file);
  return /\.(tsx?|css)$/.test(file) && !/\.test\.tsx?$/.test(file) && !FORA_DA_VARREDURA.some((skip) => relative.startsWith(skip));
});

const CORES_LITERAIS = /#[0-9a-fA-F]{3,8}\b|\b(?:rgb|rgba|hsl|hsla|oklch|oklab)\(/g;
const VALOR_ARBITRARIO = /(?<![\w-])(?:[a-z0-9-]+:)*(?!aria-|data-|group-|peer-|has-|supports-|nth-)[a-z][a-z0-9-]*-\[[^\]\s]+\]/g;
const PREFIXOS =
  'p|px|py|pt|pr|pb|pl|ps|pe|m|mx|my|mt|mr|mb|ml|ms|me|gap|gap-x|gap-y|space-x|space-y|w|h|size|min-w|min-h|max-w|max-h|text|bg|border|border-x|border-y|border-t|border-b|font|rounded|rounded-t|rounded-b|leading|tracking|shadow|ring|outline|fill|stroke|inset|top|left|right|bottom|divide|decoration|from|to|via|accent|caret';
const CLASSE_DE_UTILIDADE = new RegExp(`^(?:[a-z0-9-]+:)*-?(?:${PREFIXOS})-[a-z0-9./%-]+$`);

function classesDoArquivo(source: string): string[] {
  const textos = [...source.matchAll(/(["'`])((?:\\.|(?!\1)[^\\\n])*)\1/g)].map((match) => match[2] ?? '');
  const classes = textos.flatMap((texto) => texto.split(/\s+/)).filter((token) => CLASSE_DE_UTILIDADE.test(token));
  return [...new Set(classes)];
}

const escapar = (classe: string): string => classe.replace(/[^a-zA-Z0-9_-]/g, (caractere) => `\\${caractere}`);

// Varre os arquivos do projeto de forma síncrona: com a suíte inteira e a cobertura (v8) ligadas passa dos 5 s padrão.
describe('Tokens no código (CA-013, RNF-006)', { timeout: 30_000 }, () => {
  it('há arquivos para varrer e o tema do FluxID existe', () => {
    expect(FILES.length).toBeGreaterThan(20);
    expect(fs.existsSync(TOKENS_CSS)).toBe(true);
  });

  it('nenhum arquivo usa cor literal fora dos tokens', () => {
    const ofensores = FILES.flatMap((file) => {
      const relative = path.relative(ROOT, file).replace(/\\/g, '/');
      if (relative in PENDENTES) return [];
      return [...new Set(fs.readFileSync(file, 'utf8').match(CORES_LITERAIS) ?? [])].map((cor) => `${relative}: ${cor}`);
    });
    expect(ofensores).toEqual([]);
  });

  it('nenhum arquivo usa valor arbitrário do Tailwind', () => {
    const ofensores = FILES.flatMap((file) => {
      const relative = path.relative(ROOT, file).replace(/\\/g, '/');
      if (relative in PENDENTES) return [];
      return [...new Set(fs.readFileSync(file, 'utf8').match(VALOR_ARBITRARIO) ?? [])].map((valor) => `${relative}: ${valor}`);
    });
    expect(ofensores).toEqual([]);
  });

  it('toda classe de cor, espaçamento, fonte, raio e sombra pertence às escalas dos tokens', async () => {
    const tema = fs.readFileSync(TOKENS_CSS, 'utf8');
    const compilador = await compile(`@import "tailwindcss";\n${tema}`, { base: ROOT, onDependency: () => undefined });
    const ofensores: string[] = [];
    for (const file of FILES.filter((arquivo) => arquivo.endsWith('.tsx'))) {
      const relative = path.relative(ROOT, file).replace(/\\/g, '/');
      if (relative in PENDENTES) continue;
      const classes = classesDoArquivo(fs.readFileSync(file, 'utf8'));
      const css = compilador.build(classes);
      // O seletor precisa terminar ali: `.border-borda` dentro de `.border-borda-suave` não conta como estilo gerado.
      for (const classe of classes) if (!new RegExp(`\\.${escapar(classe).replace(/[\\.]/g, '\\$&')}(?![\\w-])`).test(css)) ofensores.push(`${relative}: ${classe}`);
    }
    expect(ofensores).toEqual([]);
  });

  // Spec 015 (T102): as telas novas entram na varredura, e nenhuma transição pode atrasar o anel de foco. A garantia é global: em
  // `base.css`, todo `:focus-visible` limita a transição a fundo e borda com `!important`, o que vence `transition-all` e afins do
  // Tailwind. Nenhuma outra regra de CSS pode animar `outline` ou `box-shadow` com `!important` por cima dela.
  it('as telas da Spec 015 estão na varredura', () => {
    for (const dir of ['src/pages/tracking', 'src/pages/reports', 'src/pages/settings', 'src/components/maps']) {
      expect(FILES.some((file) => path.relative(ROOT, file).split(path.sep).join('/').startsWith(`${dir}/`)), dir).toBe(true);
    }
  });

  it('nenhuma transição atrasa o anel de foco', () => {
    const base = fs.readFileSync(path.join(SRC, 'styles', 'base.css'), 'utf8');
    const foco = base.match(/:focus-visible[^{]*\{([^}]*)\}/)?.[1] ?? '';
    expect(foco).toMatch(/outline:\s*3px solid/);
    expect(foco).toMatch(/transition-property:\s*background-color,\s*border-color\s*!important/);
    const ofensores = FILES.filter((file) => file.endsWith('.css')).flatMap((file) =>
      (fs.readFileSync(file, 'utf8').match(/transition(?:-property)?\s*:[^;]*!important/g) ?? [])
        .filter((regra) => /\b(all|outline|box-shadow)\b/.test(regra))
        .map((regra) => `${path.relative(ROOT, file)}: ${regra}`));
    expect(ofensores).toEqual([]);
  });

  it('a lista de pendências só contém arquivos que existem', () => {
    for (const relative of Object.keys(PENDENTES)) expect(fs.existsSync(path.join(ROOT, relative))).toBe(true);
  });
});
