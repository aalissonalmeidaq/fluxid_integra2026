import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// O catálogo de componentes é um build separado, só de desenvolvimento e CI (RF-011): não entra no pacote de produção,
// no cache offline da PWA nem no carregamento inicial do shell.
const ROOT = path.resolve(import.meta.dirname, '../..');

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

// Varre os arquivos do projeto de forma síncrona: com a suíte inteira e a cobertura (v8) ligadas passa dos 5 s padrão.
describe('Catálogo fora do pacote de produção', { timeout: 30_000 }, () => {
  it('nenhum arquivo de src/ nem o index.html referencia o catálogo', () => {
    const arquivos = [path.join(ROOT, 'index.html'), ...walk(path.join(ROOT, 'src')).filter((file) => /\.(tsx?|css|html)$/.test(file))];
    const ofensores = arquivos
      .filter((file) => !/\.test\.tsx?$/.test(file))
      .filter((file) => /catalogo\//.test(fs.readFileSync(file, 'utf8').replace(/specs\/003-design-system-telas/g, '')))
      .map((file) => path.relative(ROOT, file));
    expect(ofensores).toEqual([]);
  });

  it('o vite.config.ts do aplicativo não inclui o catálogo', () => {
    expect(fs.readFileSync(path.join(ROOT, 'vite.config.ts'), 'utf8')).not.toMatch(/catalogo/i);
  });

  it('o catálogo tem configuração própria e gera a saída fora de dist/', () => {
    const config = path.join(ROOT, 'vite.catalogo.config.ts');
    expect(fs.existsSync(config)).toBe(true);
    const texto = fs.readFileSync(config, 'utf8');
    expect(texto).toMatch(/outDir:\s*['"](\.\.\/)?dist-catalogo['"]/);
    expect(fs.existsSync(path.join(ROOT, 'catalogo', 'index.html'))).toBe(true);
  });

  it('dist-catalogo/ é ignorado pelo Git', () => {
    expect(fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8')).toMatch(/^dist-catalogo\/?$/m);
  });
});
