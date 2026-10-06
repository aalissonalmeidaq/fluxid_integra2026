// @vitest-environment node
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { HYDROSTATIC_EXPIRING_DAYS } from '../../src/domain/cylinders/hydrostatic-status';

// RF-021: o limite de 30 dias de "a vencer" é único para todo o produto, documentado e não espalhado pelas telas.
const ROOT = join(__dirname, '..', '..');

function walk(dir: string, found: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, found);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name)) found.push(path);
  }
  return found;
}

describe('limite de "a vencer" (RF-021)', () => {
  it('a constante do TypeScript é igual à função SQL', () => {
    const migrations = join(ROOT, 'supabase', 'migrations');
    const source = readdirSync(migrations)
      .filter((name) => name.endsWith('.sql'))
      .map((name) => readFileSync(join(migrations, name), 'utf8'))
      .join('\n');
    const match = /function private\.hydrostatic_expiring_days\(\)\s+returns integer[\s\S]*?select\s+(\d+)\s*\$\$/.exec(source);
    expect(match, 'private.hydrostatic_expiring_days() não encontrada nas migrations').not.toBeNull();
    expect(Number(match?.[1])).toBe(HYDROSTATIC_EXPIRING_DAYS);
  });

  it('o SQL usa a função, e não um número solto, para decidir "a vencer"', () => {
    const migrations = join(ROOT, 'supabase', 'migrations');
    const hydro = readFileSync(join(migrations, '20261005150050_cylinders_hydro_helpers.sql'), 'utf8');
    expect(hydro).toMatch(/private\.hydrostatic_expiring_days\(\)/);
    expect(hydro.replace(/--.*$/gm, '')).not.toMatch(/<=\s*30\b/);
  });

  it('nenhuma tela ou serviço define o limite: só o domínio', () => {
    const files = [...walk(join(ROOT, 'src', 'pages', 'cylinders')), ...walk(join(ROOT, 'src', 'application', 'cylinders'))];
    for (const file of files) {
      const text = readFileSync(file, 'utf8').replace(/\/\/.*$/gm, '');
      expect(text, relative(ROOT, file)).not.toMatch(/\b30\s*(dias|days)\b/i);
      expect(text, relative(ROOT, file)).not.toMatch(/(<=|<|>=|>)\s*30\b/);
      expect(text, relative(ROOT, file)).not.toMatch(/EXPIRING_DAYS\s*=/);
    }
  });

  it('o domínio define a constante uma única vez', () => {
    const definitions = walk(join(ROOT, 'src')).filter((file) => /HYDROSTATIC_EXPIRING_DAYS\s*=\s*\d+/.test(readFileSync(file, 'utf8')));
    expect(definitions.map((file) => relative(ROOT, file).replace(/\\/g, '/'))).toEqual(['src/domain/cylinders/hydrostatic-status.ts']);
  });
});
