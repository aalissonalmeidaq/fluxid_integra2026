// @vitest-environment node
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MANAGE_OPERATIONS } from '../../supabase/functions/manage-cylinders/handler';
import { QUERY_OPERATIONS } from '../../supabase/functions/query-cylinders/handler';

// RF-005 e CA-003: nenhum cilindro, identificador, teste ou evento é excluído, pela tela ou pelo servidor.
const ROOT = join(__dirname, '..', '..');
const FORBIDDEN_NAME = /delete|remove|destroy|purge|truncate|erase|apagar|excluir|remover/i;

function walk(dir: string, found: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, found);
    else if (/\.(ts|tsx|sql)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name)) found.push(path);
  }
  return found;
}

describe('nenhuma operação de exclusão (CA-003)', () => {
  it('as funções de comando e de consulta não têm operação de exclusão', () => {
    const names = [...Object.keys(MANAGE_OPERATIONS), ...Object.keys(QUERY_OPERATIONS)];
    expect(names.filter((name) => FORBIDDEN_NAME.test(name))).toEqual([]);
    const rpcs = [...Object.values(MANAGE_OPERATIONS), ...Object.values(QUERY_OPERATIONS)].map((operation) => operation.rpc);
    expect(rpcs.filter((name) => FORBIDDEN_NAME.test(name))).toEqual([]);
  });

  it('o código do cliente e das funções não apaga dados de cilindros', () => {
    const files = [
      ...walk(join(ROOT, 'src', 'pages', 'cylinders')), ...walk(join(ROOT, 'src', 'application', 'cylinders')),
      ...walk(join(ROOT, 'src', 'domain', 'cylinders')), ...walk(join(ROOT, 'supabase', 'functions', 'manage-cylinders')),
      ...walk(join(ROOT, 'supabase', 'functions', 'query-cylinders')), join(ROOT, 'supabase', 'functions', '_shared', 'cylinders.ts'),
    ];
    for (const file of files) {
      const text = readFileSync(file, 'utf8');
      expect(text, relative(ROOT, file)).not.toMatch(/\.delete\(|method:\s*['"]DELETE['"]|\bdelete from\b/i);
      // Textos de botões e links da interface.
      if (/\.tsx$/.test(file)) expect(text, relative(ROOT, file)).not.toMatch(/>\s*(Excluir|Apagar|Remover|Deletar)\b/);
    }
  });

  it('as migrations de cilindros não concedem DELETE nem TRUNCATE e recusam exclusão por gatilho', () => {
    const migrations = join(ROOT, 'supabase', 'migrations');
    const sql = readdirSync(migrations).filter((name) => name.includes('cylinders')).map((name) => readFileSync(join(migrations, name), 'utf8')).join('\n');
    expect(sql).not.toMatch(/grant\s+(all|delete|truncate)[^;]*public\.cylinder/i);
    expect(sql).not.toMatch(/on delete cascade/i);
    expect(sql).toMatch(/revoke all on public\.cylinder_types, public\.cylinders, public\.cylinder_identifiers, public\.cylinder_tests, public\.cylinder_events\s+from anon, authenticated/);
    for (const table of ['cylinders', 'cylinder_types', 'cylinder_identifiers']) {
      expect(sql, table).toMatch(new RegExp(`${table}_no_delete before delete on public\\.${table}`));
      expect(sql, table).toMatch(new RegExp(`${table}_no_truncate before truncate on public\\.${table}`));
    }
    for (const table of ['cylinder_events', 'cylinder_tests']) {
      expect(sql, table).toMatch(new RegExp(`${table}_immutable before update or delete on public\\.${table}`));
    }
  });

  it('as RPCs de cilindros não executam DELETE nas tabelas de cilindros', () => {
    const migrations = join(ROOT, 'supabase', 'migrations');
    const sql = readdirSync(migrations).filter((name) => name.includes('cylinders')).map((name) => readFileSync(join(migrations, name), 'utf8')).join('\n')
      .replace(/--.*$/gm, '');
    expect(sql).not.toMatch(/\bdelete\s+from\s+public\.cylinder/i);
    expect(sql).not.toMatch(/\btruncate\s+(table\s+)?public\.cylinder/i);
  });
});
