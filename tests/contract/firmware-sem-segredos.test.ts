// @vitest-environment node
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// Spec 012 (T113; CA-012): o firmware da pasta firmware/ não traz chave de dispositivo, senha nem endereço real do Supabase.
// O job `firmware` do CI repete esta varredura antes de compilar; aqui ela roda junto com `npm test`.
const ROOT = path.resolve(import.meta.dirname, '../..');
const FIRMWARE = path.join(ROOT, 'firmware');
const IGNORAR = new Set(['.pio', 'certificados']);

// Só o que o git versionaria (rastreado ou novo e não ignorado): o include/secrets.h local da bancada fica de fora, como no CI.
function arquivos(dir: string): string[] {
  const saida = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z', path.relative(ROOT, dir)], { cwd: ROOT, encoding: 'utf8' });
  return saida.split('\0').filter(Boolean).map((relativo) => path.join(ROOT, relativo))
    .filter((caminho) => !caminho.split(path.sep).some((parte) => IGNORAR.has(parte)) && fs.existsSync(caminho));
}

describe('firmware sem segredos (CA-012)', () => {
  const todos = arquivos(FIRMWARE);

  it('há código do firmware para varrer', () => {
    expect(todos.some((f) => f.endsWith('main.cpp'))).toBe(true);
  });

  it('o secrets.h local nunca é versionado e o modelo só tem marcadores', () => {
    const versionado = execFileSync('git', ['ls-files', 'firmware/include/secrets.h'], { cwd: ROOT, encoding: 'utf8' }).trim();
    expect(versionado).toBe('');
    const modelo = fs.readFileSync(path.join(FIRMWARE, 'include/secrets.example.h'), 'utf8');
    for (const linha of modelo.split('\n').filter((l) => l.startsWith('#define FLUXID_'))) expect(linha).toMatch(/"[^"]*<[^"]+>[^"]*"$/);
  });

  it('nenhum arquivo tem chave de dispositivo, endereço real, chave secreta ou privada', () => {
    for (const arquivo of todos) {
      const texto = fs.readFileSync(arquivo, 'utf8');
      const nome = path.relative(ROOT, arquivo);
      expect(texto, nome).not.toMatch(/fxk_[A-Za-z0-9_-]{20,}/);
      expect(texto, nome).not.toMatch(/[a-z0-9]{20}\.supabase\.co/);
      expect(texto, nome).not.toMatch(/sb_secret_|-----BEGIN [A-Z ]*PRIVATE KEY-----/);
    }
  });

  it('o transporte nunca desliga a conferência do certificado', () => {
    for (const arquivo of todos.filter((f) => /\.(cpp|h)$/.test(f))) expect(fs.readFileSync(arquivo, 'utf8'), path.relative(ROOT, arquivo)).not.toMatch(/setInsecure\s*\(/);
  });
});
