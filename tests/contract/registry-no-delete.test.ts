// @vitest-environment node
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { MANAGE_OPERATIONS } from '../../supabase/functions/manage-registry/handler';
import { QUERY_OPERATIONS } from '../../supabase/functions/query-registry/handler';
import { RegistryService } from '../../src/application/registry/registry-service';

// Spec 007 (RF-033, CA-002): nenhuma operação de exclusão existe em lugar algum. A anonimização sobrescreve campos no próprio registro,
// e a única remoção de linha é a substituição dos contatos do cliente, dentro de update_customer.
const ROOT = path.resolve(import.meta.dirname, '../..');
const FORBIDDEN = /delete|remove|purge|drop|truncate|excluir|apagar/i;

const walk = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => (entry.isDirectory() ? walk(path.join(dir, entry.name)) : [path.join(dir, entry.name)]));
const read = (file: string): string => fs.readFileSync(file, 'utf8');

describe('nenhuma exclusão nas funções', () => {
  it('nomes de operação e de RPC não sugerem exclusão', () => {
    for (const [operation, spec] of [...Object.entries(MANAGE_OPERATIONS), ...Object.entries(QUERY_OPERATIONS)]) {
      expect(operation, operation).not.toMatch(FORBIDDEN);
      expect(spec.rpc, spec.rpc).not.toMatch(FORBIDDEN);
    }
  });

  it('as Edge Functions de cadastro não aceitam o método DELETE nem usam delete no banco', () => {
    const files = ['manage-registry', 'query-registry', 'lookup-postal-code', 'geocode-address'].flatMap((name) => walk(path.join(ROOT, 'supabase', 'functions', name)).filter((file) => file.endsWith('.ts')));
    for (const file of files) expect(read(file), file).not.toMatch(/\.delete\(|method:\s*['"]DELETE|'DELETE'/);
  });
});

describe('nenhuma exclusão no serviço do cliente', () => {
  it('nenhum método do serviço de cadastros sugere exclusão', () => {
    const methods = Object.getOwnPropertyNames(RegistryService.prototype);
    expect(methods.length).toBeGreaterThan(20);
    for (const method of methods) expect(method, method).not.toMatch(FORBIDDEN);
  });
});

describe('nenhuma exclusão nas telas', () => {
  const files = walk(path.join(ROOT, 'src', 'pages', 'registry')).filter((file) => file.endsWith('.tsx') && !/\.test\.tsx$/.test(file));

  it('há telas para varrer', () => {
    expect(files.length).toBeGreaterThan(15);
  });

  it('nenhuma tela oferece "Excluir" ou "Apagar" nem chama exclusão', () => {
    for (const file of files) {
      const source = read(file);
      expect(source, file).not.toMatch(/Excluir|Apagar|\.delete\(|deleteCustomer|deleteSite|deleteGeofence|deleteVehicle|deleteDriver/);
    }
  });

  it('o único "Remover" das telas tira item de uma lista ainda não salva (contato ou vértice)', () => {
    const offenders = files.filter((file) => /Remover/.test(read(file))).map((file) => path.basename(file));
    expect(offenders.sort()).toEqual(['contact-list-editor.tsx', 'geofence-shape-editor.tsx']);
  });
});

describe('nenhuma exclusão no banco', () => {
  const migrations = fs.readdirSync(path.join(ROOT, 'supabase', 'migrations')).filter((name) => /_registry_/.test(name));

  it('as migrations de cadastros só têm delete para os contatos do cliente', () => {
    expect(migrations.length).toBeGreaterThan(5);
    for (const name of migrations) {
      const deletes = [...read(path.join(ROOT, 'supabase', 'migrations', name)).matchAll(/delete\s+from\s+([a-z_.]+)/gi)].map((match) => match[1]);
      for (const table of deletes) expect(table, `${name}: ${table}`).toBe('public.customer_contacts');
    }
  });
});
