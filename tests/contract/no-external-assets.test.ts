import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// A PWA precisa abrir offline e não pode expor o IP das pessoas a terceiros a cada carga: fontes, imagens, scripts e folhas
// de estilo vêm do próprio aplicativo. Fontes ou imagens externas exigem decisão de spec (hospedagem própria, por exemplo).
const ROOT = path.resolve(import.meta.dirname, '../..');
const ALLOWED = [/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?/, /^https?:\/\/www\.w3\.org\//, /^https?:\/\/[^/]*example\.invalid/];

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

const FILES = [
  path.join(ROOT, 'index.html'),
  // src/test guarda fixtures de teste, que não chegam ao navegador.
  ...walk(path.join(ROOT, 'src')).filter(
    (file) => /\.(tsx?|css|html)$/.test(file) && !/\.test\.tsx?$/.test(file) && !file.includes(path.join('src', 'test')),
  ),
];

describe('Recursos de terceiros no cliente', () => {
  it('há arquivos para varrer', () => {
    expect(FILES.length).toBeGreaterThan(10);
  });

  it('nenhum arquivo do cliente carrega fonte, imagem, script ou estilo de outro domínio', () => {
    const offenders = FILES.flatMap((file) =>
      [...fs.readFileSync(file, 'utf8').matchAll(/https?:\/\/[^\s"'`)<>]+/g)]
        .map((match) => match[0])
        .filter((url) => !ALLOWED.some((pattern) => pattern.test(url)))
        .map((url) => `${path.relative(ROOT, file)}: ${url}`),
    );
    expect(offenders).toEqual([]);
  });
});
