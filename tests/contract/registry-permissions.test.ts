// @vitest-environment node
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { SCREENS } from '../../src/domain/navigation/screens';
import { requiredPermission, resolveRegistryRoute } from '../../src/app/registry/registry-routes';

// Spec 007 (RF-049, contracts/permissoes-e-papeis.md): os códigos de permissão são os mesmos na migration, no catálogo de telas, nas
// rotas e nas RPCs; nenhuma operação de comando é acessível só por `*.read`; os papéis padrão seguem o contrato.
const ROOT = path.resolve(import.meta.dirname, '../..');
const MIGRATIONS = path.join(ROOT, 'supabase', 'migrations');
const registryMigrations = fs.readdirSync(MIGRATIONS).filter((name) => /_registry_/.test(name)).sort();
const read = (name: string): string => fs.readFileSync(path.join(MIGRATIONS, name), 'utf8');
const permissionsSql = read(registryMigrations.find((name) => name.endsWith('_registry_permissions.sql')) as string);

const CODES = [...permissionsSql.matchAll(/\(\s*'40000000-[0-9-]+',\s*'((?:customer|geofence|vehicle|driver)\.[a-z_]+)'/g)].map((match) => match[1] as string);

describe('catálogo de permissões da Fase 3', () => {
  it('a migration cria exatamente as 20 permissões do contrato', () => {
    expect(CODES).toHaveLength(20);
    expect(new Set(CODES).size).toBe(20);
    for (const area of ['customer', 'geofence', 'vehicle', 'driver']) {
      for (const action of ['read', 'write', 'deactivate', 'history']) expect(CODES).toContain(`${area}.${action}`);
    }
    for (const extra of ['customer.document', 'customer.anonymize', 'driver.document', 'driver.anonymize']) expect(CODES).toContain(extra);
  });

  it('só as duas de anonimização são críticas', () => {
    const critical = [...permissionsSql.matchAll(/'((?:customer|geofence|vehicle|driver)\.[a-z_]+)', '[^']*', 'tenant', 'tenant_delegable', (true|false)\)/g)].filter((match) => match[2] === 'true').map((match) => match[1]);
    expect(critical.sort()).toEqual(['customer.anonymize', 'driver.anonymize']);
  });

  it('o catálogo de telas usa códigos que existem na migration', () => {
    const screens = SCREENS.filter((screen) => ['clientes', 'geocercas', 'veiculos', 'motoristas'].includes(screen.id));
    expect(screens.map((screen) => screen.requires?.code).sort()).toEqual(['customer.read', 'driver.read', 'geofence.read', 'vehicle.read']);
    for (const screen of screens) expect(CODES).toContain(screen.requires?.code);
  });

  it('as rotas pedem apenas códigos do catálogo, e as de ação pedem escrita', () => {
    const paths = ['/clientes', '/clientes/novo', '/geocercas', '/geocercas/nova', '/veiculos', '/veiculos/novo', '/motoristas', '/motoristas/novo'];
    for (const route of paths) {
      const resolved = resolveRegistryRoute(route);
      expect(resolved, route).not.toBeNull();
      const code = requiredPermission(resolved!);
      expect(CODES, route).toContain(code);
      expect(code.endsWith(route.endsWith('novo') || route.endsWith('nova') ? '.write' : '.read'), route).toBe(true);
    }
  });
});

describe('RPCs: cada função confere a permissão certa', () => {
  const blocks = registryMigrations.flatMap((name) => {
    const text = read(name);
    return [...text.matchAll(/create function public\.(\w+)\(([\s\S]*?)\n(?=create function|revoke all|grant execute|\s*$)/g)].map((match) => ({ file: name, fn: match[1] as string, body: match[0] }));
  });

  it('há RPCs para conferir', () => {
    expect(blocks.length).toBeGreaterThan(40);
  });

  it('toda RPC chama a autorização com um código do catálogo (ou da sessão, no caso do histórico e da revelação)', () => {
    // `check_registry_permission` recebe o código como argumento (consulta de CEP): quem a chama é a função, não a RPC.
    for (const block of blocks.filter((item) => item.fn !== 'check_registry_permission')) {
      const used = [...block.body.matchAll(/cylinder_authorize\([^;]*?,\s*'([a-z]+\.[a-z_]+)'\)/g)].map((match) => match[1] as string);
      const dynamic = /cylinder_authorize\([^;]*?(v_permission|v_area)/.test(block.body);
      expect(used.length > 0 || dynamic, `${block.fn} não confere permissão`).toBe(true);
      for (const code of used) expect(CODES, `${block.fn}: ${code}`).toContain(code);
    }
  });

  it('nenhuma operação de comando é acessível só por `*.read`', () => {
    const commands = blocks.filter((block) => /^(create|update|inactivate|reactivate|change|link|unlink|anonymize)_/.test(block.fn));
    expect(commands.length).toBeGreaterThan(15);
    for (const block of commands) {
      const used = [...block.body.matchAll(/cylinder_authorize\([^;]*?,\s*'([a-z]+\.[a-z_]+)'\)/g)].map((match) => match[1] as string);
      expect(used.length, block.fn).toBeGreaterThan(0);
      for (const code of used) expect(code.endsWith('.read'), `${block.fn} usa ${code}`).toBe(false);
    }
  });

  it('consultas de lista e detalhe pedem leitura, exceto os usuários vinculáveis (que pedem escrita de motorista)', () => {
    const reads = blocks.filter((block) => /^(list|get)_/.test(block.fn));
    for (const block of reads) {
      const used = [...block.body.matchAll(/cylinder_authorize\([^;]*?,\s*'([a-z]+\.[a-z_]+)'\)/g)].map((match) => match[1] as string);
      expect(used, block.fn).toEqual([block.fn === 'list_linkable_users' ? 'driver.write' : expect.stringMatching(/\.read$/)]);
    }
  });

  it('as RPCs só são concedidas ao service_role', () => {
    for (const name of registryMigrations) {
      const text = read(name);
      for (const grant of text.matchAll(/grant execute on function([\s\S]*?);/g)) expect(grant[0], name).toMatch(/to service_role;$/);
    }
  });
});

describe('papéis padrão', () => {
  const roleBlock = (role: string): string[] => {
    const match = new RegExp(`r\\.code = '${role}' and p\\.code in \\(([^)]*)\\)`).exec(permissionsSql);
    return [...(match?.[1] ?? '').matchAll(/'([a-z]+\.[a-z_]+)'/g)].map((item) => item[1] as string).filter((code) => /^(customer|geofence|vehicle|driver)\./.test(code)).sort();
  };

  it('administrador recebe todas as da Fase 3 por padrão de nome', () => {
    expect(permissionsSql).toMatch(/r\.code = 'tenant_admin' and \(p\.code in \([\s\S]*?\)\s*or p\.code ~ '\^\(customer\|geofence\|vehicle\|driver\)\\\.'\)/);
  });

  it('estoquista, técnico e auditor seguem o contrato e nenhum deles tem documento nem anonimização', () => {
    expect(roleBlock('stock_operator')).toEqual(['customer.read', 'driver.read', 'geofence.read', 'vehicle.read']);
    expect(roleBlock('technical_operator')).toEqual(['customer.read', 'vehicle.read']);
    expect(roleBlock('tenant_auditor')).toEqual(['customer.history', 'customer.read', 'driver.history', 'driver.read', 'geofence.history', 'geofence.read', 'vehicle.history', 'vehicle.read']);
    for (const role of ['stock_operator', 'technical_operator', 'tenant_auditor']) {
      for (const code of roleBlock(role)) expect(code, role).not.toMatch(/\.(document|anonymize|write|deactivate)$/);
    }
  });

  it('o papel motorista não recebe nada da Fase 3', () => {
    expect(permissionsSql).not.toMatch(/r\.code = 'driver' and p\.code in/);
  });
});
