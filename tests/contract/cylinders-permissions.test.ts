// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MANAGE_OPERATIONS } from '../../supabase/functions/manage-cylinders/handler';
import { QUERY_OPERATIONS } from '../../supabase/functions/query-cylinders/handler';
import { requiredPermission } from '../../src/app/cylinders/cylinder-routes';
import { SCREENS } from '../../src/domain/navigation/screens';

// RF-039: as permissões de cilindros e o mapeamento dos papéis padrão são os mesmos no catálogo de telas, nas rotas, nos
// contratos e nas migrations.
const ROOT = join(__dirname, '..', '..');
const migrationsDir = join(ROOT, 'supabase', 'migrations');
const sql = readdirSync(migrationsDir).filter((name) => name.endsWith('.sql')).map((name) => readFileSync(join(migrationsDir, name), 'utf8')).join('\n');

const PERMISSIONS = ['cylinder.read', 'cylinder.write', 'cylinder.deactivate', 'cylinder.identifier', 'cylinder.stock_in', 'cylinder.test', 'cylinder.history'];

const OPERATION_PERMISSION: Record<string, string> = {
  list: 'cylinder.read', get: 'cylinder.read', lookup: 'cylinder.read', catalog: 'cylinder.read', history: 'cylinder.history',
  create: 'cylinder.write', update: 'cylinder.write', save_type: 'cylinder.write',
  inactivate: 'cylinder.deactivate', reactivate: 'cylinder.deactivate',
  add_identifier: 'cylinder.identifier', deactivate_identifier: 'cylinder.identifier', transfer_identifier: 'cylinder.identifier',
  stock_in: 'cylinder.stock_in', register_test: 'cylinder.test', rectify_test: 'cylinder.test',
};

const ROLE_PERMISSIONS: Record<string, string[]> = {
  tenant_admin: PERMISSIONS,
  stock_operator: ['cylinder.read', 'cylinder.write', 'cylinder.stock_in', 'cylinder.history'],
  technical_operator: ['cylinder.read', 'cylinder.identifier', 'cylinder.test', 'cylinder.history'],
  tenant_auditor: ['cylinder.read', 'cylinder.history'],
};

describe('permissões de cilindros', () => {
  it('as 7 permissões são criadas pela migration como delegáveis do tenant', () => {
    for (const code of PERMISSIONS) expect(sql, code).toMatch(new RegExp(`'${code.replace('.', '\\.')}', '[^']+', 'tenant', 'tenant_delegable', false`));
  });

  it('cada operação do servidor é autorizada pela permissão do contrato (conferida dentro da RPC)', () => {
    const operations = { ...MANAGE_OPERATIONS, ...QUERY_OPERATIONS };
    expect(Object.keys(operations).sort()).toEqual(Object.keys(OPERATION_PERMISSION).sort());
    for (const [operation, spec] of Object.entries(operations)) {
      const start = sql.indexOf(`create function public.${spec.rpc}(`);
      expect(start, `RPC ${spec.rpc} não encontrada`).toBeGreaterThan(-1);
      const next = sql.indexOf('\ncreate function ', start + 10);
      const body = sql.slice(start, next === -1 ? undefined : next);
      const match = /cylinder_authorize\([^)]*?'(cylinder\.[a-z_]+)'\)/.exec(body);
      expect(match?.[1], `${operation} → ${spec.rpc}`).toBe(OPERATION_PERMISSION[operation]);
    }
  });

  it('o catálogo de telas exige cylinder.read e cylinder.stock_in, no escopo do tenant', () => {
    const byId = Object.fromEntries(SCREENS.map((screen) => [screen.id, screen]));
    expect(byId.cilindros?.requires).toEqual({ scope: 'tenant', code: 'cylinder.read' });
    expect(byId['entrada-estoque']?.requires).toEqual({ scope: 'tenant', code: 'cylinder.stock_in' });
    expect(byId.cilindros?.tenantScoped).toBe(true);
    expect(byId['entrada-estoque']?.tenantScoped).toBe(true);
  });

  it('as rotas pedem a permissão da ação', () => {
    expect(requiredPermission({ kind: 'list' })).toBe('cylinder.read');
    expect(requiredPermission({ kind: 'new' })).toBe('cylinder.write');
    expect(requiredPermission({ kind: 'stock_in' })).toBe('cylinder.stock_in');
  });

  it('o bootstrap dos papéis padrão concede exatamente o mapeamento do contrato', () => {
    const bootstrap = sql.slice(sql.indexOf('create or replace function private.bootstrap_tenant_roles'));
    for (const [role, expected] of Object.entries(ROLE_PERMISSIONS)) {
      const match = new RegExp(`r\\.code = '${role}' and p\\.code in \\(([^)]*)\\)`).exec(bootstrap);
      expect(match, role).not.toBeNull();
      const granted = [...(match?.[1] ?? '').matchAll(/'([a-z_.]+)'/g)].map((item) => item[1]).filter((code): code is string => code?.startsWith('cylinder.') ?? false);
      expect(granted.sort(), role).toEqual([...expected].sort());
    }
    expect(bootstrap).not.toMatch(/r\.code = 'driver' and p\.code/);
  });

  it('o contrato documentado lista as mesmas permissões e papéis', () => {
    const doc = readFileSync(join(ROOT, 'specs', '006-cilindros-e-estoque', 'contracts', 'permissoes-e-papeis.md'), 'utf8');
    for (const code of PERMISSIONS) expect(doc, code).toContain(`\`${code}\``);
    for (const role of ['tenant_admin', 'stock_operator', 'technical_operator', 'tenant_auditor']) expect(doc, role).toContain(role);
  });
});
