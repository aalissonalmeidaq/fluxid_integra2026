// @vitest-environment node
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// Spec 007 (RF-045, RF-046, CA-012): nenhum dado de cadastro, documento ou resposta de CEP fica no cache do service worker, e nada é
// enfileirado para depois. O service worker só guarda os arquivos do próprio app (precache); as chamadas às funções do Supabase
// passam direto pela rede e nunca recebem o app shell como resposta.
const ROOT = path.resolve(import.meta.dirname, '../..');
const config = fs.readFileSync(path.join(ROOT, 'vite.config.ts'), 'utf8');

describe('cache do service worker não guarda cadastros nem CEP', () => {
  it('não há cache em tempo de execução (runtimeCaching) para nenhuma rota', () => {
    expect(config).not.toMatch(/runtimeCaching/);
  });

  it('as funções do Supabase (cadastros, consulta de CEP e demais) estão fora do app shell', () => {
    expect(config).toMatch(/navigateFallbackDenylist:[^\]]*\\\/functions\\\/v1/);
    expect(config).toMatch(/navigateFallbackDenylist:[^\]]*\\\/rest\\\/v1/);
  });

  it('o precache vem só dos arquivos do app, sem dados', () => {
    const patterns = /globPatterns:\s*\[([^\]]*)\]/.exec(config)?.[1] ?? '';
    expect(patterns).not.toMatch(/json/);
    expect(patterns).not.toMatch(/functions|rest|api/);
  });

  it('o código do cliente de cadastros não usa armazenamento local nem fila de sincronização', () => {
    const dirs = ['src/application/registry', 'src/pages/registry', 'src/infrastructure/supabase'];
    const files = dirs.flatMap((dir) => {
      const walk = (current: string): string[] => fs.readdirSync(current, { withFileTypes: true }).flatMap((entry) => (entry.isDirectory() ? walk(path.join(current, entry.name)) : [path.join(current, entry.name)]));
      return walk(path.join(ROOT, dir)).filter((file) => /registry/.test(file) && /\.(ts|tsx)$/.test(file) && !/\.test\./.test(file));
    });
    expect(files.length).toBeGreaterThan(10);
    for (const file of files) {
      const source = fs.readFileSync(file, 'utf8');
      expect(source, file).not.toMatch(/localStorage|sessionStorage|indexedDB|IDBDatabase|caches\.(open|put)|sync-outbox|local-database|serviceWorker|navigator\.sendBeacon/);
    }
  });

  it('o build, quando existe, não precacheia nada de /functions nem de CEP', () => {
    const sw = path.join(ROOT, 'dist', 'sw.js');
    if (!fs.existsSync(sw)) return;
    const text = fs.readFileSync(sw, 'utf8');
    expect(text).not.toMatch(/functions\/v1/);
    expect(text).not.toMatch(/viacep/i);
  });
});
