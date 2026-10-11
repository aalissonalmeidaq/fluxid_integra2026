// @vitest-environment node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// RF-031: o catálogo de permissões e os papéis padrão da migration são os do contrato (contracts/permissoes-e-papeis.md).
const ROOT = join(__dirname, '..', '..');
const contract = readFileSync(join(ROOT, 'specs', '008-viagens-paradas-carga', 'contracts', 'permissoes-e-papeis.md'), 'utf8');
const migration = readFileSync(join(ROOT, 'supabase', 'migrations', '20261009120100_trips_permissions.sql'), 'utf8');

const CONTRACT_PERMISSIONS = [...contract.matchAll(/^\| `(trip\.\w+)` \| `\.\.\.(\d+)` \| [^|]+\| (sim|\*\*sim\*\*|não) \|/gm)]
  .map((match) => ({ code: match[1]!, suffix: String(Number(match[2])), critical: match[3] !== 'não' }));

const MIGRATION_PERMISSIONS = [...migration.matchAll(/\('40000000-0000-0000-0000-0000000000(\d+)', '(trip\.\w+)', '[^']*', 'tenant', 'tenant_delegable', (true|false)\)/g)]
  .map((match) => ({ code: match[2]!, suffix: String(Number(match[1])), critical: match[3] === 'true' }));

const rolePermissions = (role: string): string[] => {
  const row = contract.split('\n').find((line) => line.startsWith(`| \`${role}\` |`));
  return row ? [...(row.split('|')[2] ?? '').replace(/\([^)]*\)/g, '').matchAll(/`(trip\.\w+)`/g)].map((match) => match[1]!).sort() : [];
};
const migrationRolePermissions = (role: string): string[] => {
  const block = migration.match(new RegExp(String.raw`r\.code = '${role}' and p\.code in \(([^)]*)\)`))?.[1] ?? '';
  return [...block.matchAll(/'(trip\.\w+)'/g)].map((match) => match[1]!).sort();
};

describe('permissões de viagem (RF-031)', () => {
  it('as oito permissões do contrato existem na migration, com o mesmo id e a mesma criticidade', () => {
    expect(CONTRACT_PERMISSIONS).toHaveLength(8);
    expect(MIGRATION_PERMISSIONS).toEqual(CONTRACT_PERMISSIONS);
  });

  it('só trip.exception é crítica', () => {
    expect(MIGRATION_PERMISSIONS.filter((permission) => permission.critical).map((permission) => permission.code)).toEqual(['trip.exception']);
  });

  it.each(['logistics_manager', 'stock_operator', 'tenant_auditor'])('o papel %s tem as permissões de viagem do contrato', (role) => {
    expect(migrationRolePermissions(role)).toEqual(rolePermissions(role));
  });

  it('o auditor nunca tem escrita nem o nome do recebedor, e o motorista e o técnico nenhuma permissão de viagem', () => {
    const auditor = migrationRolePermissions('tenant_auditor');
    expect(auditor).toEqual(['trip.history', 'trip.read']);
    expect(migrationRolePermissions('driver')).toEqual([]);
    expect(migrationRolePermissions('technical_operator')).toEqual([]);
  });

  it('o administrador do tenant recebe todas as de viagem', () => {
    expect(migration).toContain("p.code ~ '^(customer|geofence|vehicle|driver|trip)\\.'");
  });
});
