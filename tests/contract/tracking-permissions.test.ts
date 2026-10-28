// @vitest-environment node
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Spec 015 (RF-037, RF-009a, T008): as quatro permissões novas e os papéis padrão da migration são os do contrato, sem
// implicação automática entre elas.
const ROOT = join(__dirname, '..', '..');
const contract = readFileSync(join(ROOT, 'specs', '015-rastreamento-proximidade-relatorios', 'contracts', 'permissoes-e-papeis.md'), 'utf8');
const migrationsDir = join(ROOT, 'supabase', 'migrations');
const MIGRATION = '20261022090000_tracking_permissions.sql';
const migrationFiles = readdirSync(migrationsDir).filter((name) => name.endsWith('.sql')).sort();
const migration = migrationFiles.includes(MIGRATION) ? readFileSync(join(migrationsDir, MIGRATION), 'utf8') : '';
const allSql = migrationFiles.map((name) => readFileSync(join(migrationsDir, name), 'utf8')).join('\n');

const NEW_CODE = /(tracking\.read|report\.export|notification_category\.manage|proximity_rule\.manage)/;

const CONTRACT_PERMISSIONS = [...contract.matchAll(/^\| `([a-z_]+\.[a-z_]+)` \| `\.\.\.(\d+)` \| [^|]+\| (\*\*sim\*\*|não) \|/gm)]
  .map((match) => ({ code: match[1]!, suffix: match[2]!, critical: match[3] !== 'não' }));

const MIGRATION_PERMISSIONS = [...migration.matchAll(/\('40000000-0000-0000-0000-0000000000(\d+)', '([a-z_]+\.[a-z_]+)', '[^']*', 'tenant', 'tenant_delegable', (true|false)\)/g)]
  .map((match) => ({ code: match[2]!, suffix: match[1]!, critical: match[3] === 'true' }));

const contractRole = (role: string): string[] => {
  const row = contract.split('\n').find((line) => line.startsWith(`| \`${role}\` |`)) ?? '';
  return [...(row.split('|')[2] ?? '').matchAll(/`([a-z_]+\.[a-z_]+)`/g)].map((match) => match[1]!).sort();
};

// A definição vigente de `bootstrap_tenant_roles` é a da última migration que a recria.
const bootstrap = (() => {
  const start = allSql.lastIndexOf('create or replace function private.bootstrap_tenant_roles');
  return start === -1 ? '' : allSql.slice(start, allSql.indexOf('end $$;', start));
})();
const migrationRole = (role: string): string[] => {
  const block = bootstrap.match(new RegExp(String.raw`r\.code = '${role}' and \(?p\.code in \(([^)]*)\)`))?.[1] ?? '';
  return [...block.matchAll(/'([a-z_]+\.[a-z_]+)'/g)].map((match) => match[1]!).filter((code) => NEW_CODE.test(code)).sort();
};

describe('permissões de rastreamento, relatórios e avisos (RF-037)', () => {
  it('as quatro permissões do contrato existem na migration, com o mesmo id e a mesma criticidade', () => {
    expect(CONTRACT_PERMISSIONS).toHaveLength(4);
    expect(MIGRATION_PERMISSIONS).toEqual(CONTRACT_PERMISSIONS);
  });

  it('só proximity_rule.manage é crítica', () => {
    expect(MIGRATION_PERMISSIONS.filter((permission) => permission.critical).map((permission) => permission.code)).toEqual(['proximity_rule.manage']);
  });

  it.each(['tenant_admin', 'logistics_manager', 'tenant_auditor', 'stock_operator', 'technical_operator'])(
    'o papel %s recebe exatamente as permissões do contrato', (role) => {
      expect(migrationRole(role)).toEqual(contractRole(role));
    });

  it('o motorista não recebe nenhuma das permissões novas', () => {
    expect(contractRole('driver')).toEqual([]);
    expect(bootstrap).not.toMatch(/r\.code = 'driver'/);
  });

  it('o administrador não recebe as permissões novas por expressão de prefixo, só pela lista explícita', () => {
    const prefixes = bootstrap.match(/p\.code ~ '\^\(([^)]*)\)/)?.[1] ?? '';
    for (const prefix of prefixes.split('|')) expect(['tracking', 'report', 'notification_category', 'proximity_rule']).not.toContain(prefix);
  });

  it('nenhuma função concede uma permissão nova a partir de outra (sem implicação automática)', () => {
    const implications = [...allSql.matchAll(/'(tracking\.read|report\.export|notification_category\.manage|proximity_rule\.manage)'\s+(or|and)\s+[^;]*?'(tracking\.read|report\.export|notification_category\.manage|proximity_rule\.manage|trip\.read|seal\.read|tenant\.manage)'/g)];
    expect(implications.map((match) => match[0])).toEqual([]);
  });

  it('o Master recebe as quatro permissões e os tenants existentes são atualizados', () => {
    expect(migration).toMatch(/r\.code = 'master_fluxid' and r\.organization_id is null/);
    expect(migration).toMatch(/select private\.bootstrap_tenant_roles\(id\) from public\.organizations where kind = 'tenant'/);
  });
});
