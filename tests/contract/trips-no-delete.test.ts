// @vitest-environment node
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MANAGE_OPERATIONS } from '../../supabase/functions/manage-trips/handler';
import { QUERY_OPERATIONS } from '../../supabase/functions/query-trips/handler';

// RF-033: nenhuma viagem, parada, item, entrega, desbloqueio ou evento é excluído, pela tela ou pelo servidor.
// "Retirar item" (`remove_item`) muda a situação do item e fica no histórico; não apaga linha alguma.
const ROOT = join(__dirname, '..', '..');
const FORBIDDEN_NAME = /delete|destroy|purge|truncate|erase|apagar|excluir/i;

function walk(dir: string, found: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, found);
    else if (/\.(ts|tsx|sql)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name)) found.push(path);
  }
  return found;
}

describe('nenhuma operação de exclusão de viagens (RF-033)', () => {
  it('as funções de comando e de consulta não têm operação de exclusão', () => {
    const operations = { ...MANAGE_OPERATIONS, ...QUERY_OPERATIONS };
    expect(Object.keys(operations).filter((name) => FORBIDDEN_NAME.test(name))).toEqual([]);
    expect(Object.values(operations).map((operation) => operation.rpc).filter((name) => FORBIDDEN_NAME.test(name))).toEqual([]);
  });

  it('o código do cliente e das funções não apaga dados de viagens', () => {
    const files = [
      ...walk(join(ROOT, 'src', 'pages', 'trips')), ...walk(join(ROOT, 'src', 'application', 'trips')), ...walk(join(ROOT, 'src', 'domain', 'trips')),
      ...walk(join(ROOT, 'supabase', 'functions', 'manage-trips')), ...walk(join(ROOT, 'supabase', 'functions', 'query-trips')),
      join(ROOT, 'src', 'infrastructure', 'supabase', 'trip-adapter.ts'),
    ];
    for (const file of files) {
      const text = readFileSync(file, 'utf8');
      expect(text, relative(ROOT, file)).not.toMatch(/method:\s*['"]DELETE['"]|\bdelete from\b/i);
      // `Map.delete` do controle de tentativas não é exclusão de dado.
      expect(text.replace(/\b\w+(\.current)?\.delete\(/g, ''), relative(ROOT, file)).not.toMatch(/\.delete\(/);
      if (/\.tsx$/.test(file)) expect(text, relative(ROOT, file)).not.toMatch(/>\s*(Excluir|Apagar|Deletar)\b/);
    }
  });

  it('nenhuma migration da Spec 008 apaga linhas das tabelas de viagem', () => {
    const dir = join(ROOT, 'supabase', 'migrations');
    for (const name of readdirSync(dir).filter((file) => /^202610091.*_trips_.*\.sql$/.test(file))) {
      const text = readFileSync(join(dir, name), 'utf8');
      expect(text, name).not.toMatch(/\bdelete\s+from\s+public\.trip/i);
      expect(text, name).not.toMatch(/\btruncate\s+(table\s+)?public\.trip/i);
    }
  });
});
