import { describe, expect, it } from 'vitest';
import { SCREENS } from '@/domain/navigation/screens';
import { requiredPermission, resolveRegistryRoute } from './registry-routes';

const A = '81000000-0000-4000-8000-000000000001';
const B = '82000000-0000-4000-8000-000000000001';

describe('resolveRegistryRoute: as 19 rotas de contracts/telas-e-rotas.md', () => {
  it.each([
    ['/clientes', { area: 'customers', kind: 'list' }],
    ['/clientes/novo', { area: 'customers', kind: 'new' }],
    [`/clientes/${A}`, { area: 'customers', kind: 'detail', id: A }],
    [`/clientes/${A}/editar`, { area: 'customers', kind: 'edit', id: A }],
    [`/clientes/${A}/unidades/nova`, { area: 'customers', kind: 'site_new', customerId: A }],
    [`/clientes/${A}/unidades/${B}`, { area: 'customers', kind: 'site_detail', customerId: A, siteId: B }],
    [`/clientes/${A}/unidades/${B}/editar`, { area: 'customers', kind: 'site_edit', customerId: A, siteId: B }],
    ['/geocercas', { area: 'geofences', kind: 'list' }],
    ['/geocercas/nova', { area: 'geofences', kind: 'new' }],
    [`/geocercas/${A}`, { area: 'geofences', kind: 'detail', id: A }],
    [`/geocercas/${A}/editar`, { area: 'geofences', kind: 'edit', id: A }],
    ['/veiculos', { area: 'vehicles', kind: 'list' }],
    ['/veiculos/novo', { area: 'vehicles', kind: 'new' }],
    [`/veiculos/${A}`, { area: 'vehicles', kind: 'detail', id: A }],
    [`/veiculos/${A}/editar`, { area: 'vehicles', kind: 'edit', id: A }],
    ['/motoristas', { area: 'drivers', kind: 'list' }],
    ['/motoristas/novo', { area: 'drivers', kind: 'new' }],
    [`/motoristas/${A}`, { area: 'drivers', kind: 'detail', id: A }],
    [`/motoristas/${A}/editar`, { area: 'drivers', kind: 'edit', id: A }],
  ] as const)('%s', (caminho, esperado) => {
    expect(resolveRegistryRoute(caminho)).toEqual(esperado);
  });

  it('o cadastro de geocerca é /geocercas/nova (a unidade vem pelo parâmetro ?unidade) e /geocercas/novo não existe', () => {
    expect(resolveRegistryRoute('/geocercas/nova')).toEqual({ area: 'geofences', kind: 'new' });
    expect(resolveRegistryRoute('/geocercas/novo')).toEqual({ area: 'geofences', kind: 'not_found' });
  });

  it('barra final é ignorada', () => {
    expect(resolveRegistryRoute('/clientes/')).toEqual({ area: 'customers', kind: 'list' });
    expect(resolveRegistryRoute(`/veiculos/${A}/`)).toEqual({ area: 'vehicles', kind: 'detail', id: A });
  });

  it.each([
    ['/clientes/abc'], ['/clientes/novo/x'], [`/clientes/${A}/x`], [`/clientes/${A}/unidades`], [`/clientes/${A}/unidades/abc`],
    [`/clientes/${A}/unidades/${B}/x`], [`/clientes/${A}/unidades/nova/x`], ['/veiculos/abc'], [`/veiculos/${A}/x`], [`/veiculos/${A}/editar/x`],
    ['/motoristas/abc/editar'], ['/geocercas/xyz'],
  ])('caminho inexistente %s vira not_found da própria área', (caminho) => {
    expect(resolveRegistryRoute(caminho)?.kind).toBe('not_found');
  });

  it.each(['/', '/perfil', '/cilindros', '/estoque/entrada', '/admin/membros', '/clientesx', '/cliente', '/veiculos-antigos'])(
    '%s não é rota de cadastros', (caminho) => {
      expect(resolveRegistryRoute(caminho)).toBeNull();
    });
});

describe('requiredPermission (a permissão da ação)', () => {
  it.each([
    ['/clientes', 'customer.read'], [`/clientes/${A}`, 'customer.read'], [`/clientes/${A}/unidades/${B}`, 'customer.read'],
    ['/clientes/novo', 'customer.write'], [`/clientes/${A}/editar`, 'customer.write'], [`/clientes/${A}/unidades/nova`, 'customer.write'],
    [`/clientes/${A}/unidades/${B}/editar`, 'customer.write'],
    ['/geocercas', 'geofence.read'], [`/geocercas/${A}`, 'geofence.read'], ['/geocercas/nova', 'geofence.write'], [`/geocercas/${A}/editar`, 'geofence.write'],
    ['/veiculos', 'vehicle.read'], ['/veiculos/novo', 'vehicle.write'], [`/veiculos/${A}/editar`, 'vehicle.write'],
    ['/motoristas', 'driver.read'], [`/motoristas/${A}`, 'driver.read'], ['/motoristas/novo', 'driver.write'], [`/motoristas/${A}/editar`, 'driver.write'],
  ] as const)('%s exige %s', (caminho, permissao) => {
    const rota = resolveRegistryRoute(caminho);
    expect(rota).not.toBeNull();
    if (rota) expect(requiredPermission(rota)).toBe(permissao);
  });
});

describe('coerência com o catálogo de telas e com a migration', () => {
  it('cada item do menu de cadastros leva à lista da área e exige a permissão de leitura da rota', () => {
    for (const id of ['clientes', 'geocercas', 'veiculos', 'motoristas']) {
      const tela = SCREENS.find((screen) => screen.id === id);
      expect(tela, id).toBeDefined();
      const rota = resolveRegistryRoute(tela?.path ?? '');
      expect(rota?.kind, id).toBe('list');
      if (rota) expect(requiredPermission(rota), id).toBe(tela?.requires?.code);
    }
  });
});
