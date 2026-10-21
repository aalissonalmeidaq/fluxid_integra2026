// @vitest-environment node
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

// Spec 014, História 4 (RF-009, MS-005): VITE_DEMO_ACCESS é lida no build. Desligada, nenhum arquivo publicado traz e-mail de
// demonstração; ausente, os e-mails existem só num pedaço carregado sob demanda, nunca no pacote de entrada.
const ROOT = path.resolve(import.meta.dirname, '../..');
const saidas: string[] = [];

function construir(valor: string | undefined): string {
  const destino = fs.mkdtempSync(path.join(os.tmpdir(), 'fluxid-demo-build-'));
  saidas.push(destino);
  const env: NodeJS.ProcessEnv = { ...process.env };
  if (valor === undefined) delete env.VITE_DEMO_ACCESS;
  else env.VITE_DEMO_ACCESS = valor;
  execFileSync('npx', ['vite', 'build', '--outDir', destino, '--emptyOutDir', '--logLevel', 'error'], { cwd: ROOT, env, shell: true, stdio: 'ignore' });
  return destino;
}

function arquivosCom(destino: string, padrao: RegExp): string[] {
  const todos = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true })
    .flatMap((entrada) => (entrada.isDirectory() ? todos(path.join(dir, entrada.name)) : [path.join(dir, entrada.name)]));
  return todos(destino).filter((arquivo) => /\.(js|html|json|webmanifest|css)$/.test(arquivo) && padrao.test(fs.readFileSync(arquivo, 'utf8')))
    .map((arquivo) => path.relative(destino, arquivo).replace(/\\/g, '/'));
}

describe('VITE_DEMO_ACCESS no pacote publicado', { timeout: 300_000 }, () => {
  afterAll(() => {
    for (const destino of saidas) fs.rmSync(destino, { recursive: true, force: true });
  });

  it('desligada: nenhum e-mail nem senha de demonstração em dist/', () => {
    const destino = construir('false');
    expect(arquivosCom(destino, /@demo\.fluxid\.invalid|FluxID-Demo-\d{2}!/)).toEqual([]);
  });

  it('ausente: as credenciais existem só num pedaço sob demanda, fora do pacote de entrada e do index.html', () => {
    const destino = construir(undefined);
    const comCredenciais = arquivosCom(destino, /@demo\.fluxid\.invalid/);
    expect(comCredenciais.length).toBeGreaterThan(0);
    for (const arquivo of comCredenciais) {
      expect(arquivo).toMatch(/^assets\/.+\.js$/);
      expect(arquivo).not.toMatch(/^assets\/index-/);
    }
  });
});
