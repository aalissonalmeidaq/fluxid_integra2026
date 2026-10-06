import { describe, expect, it } from 'vitest';
import { requiredPermission, resolveCylinderRoute } from './cylinder-routes';

const ID = '72000000-0000-4000-8000-0000000000a1';

describe('resolveCylinderRoute', () => {
  it('resolve as telas de cilindros', () => {
    expect(resolveCylinderRoute('/cilindros')).toEqual({ kind: 'list' });
    expect(resolveCylinderRoute('/cilindros/novo')).toEqual({ kind: 'new' });
    expect(resolveCylinderRoute(`/cilindros/${ID}`)).toEqual({ kind: 'detail', id: ID });
    expect(resolveCylinderRoute(`/cilindros/${ID}/editar`)).toEqual({ kind: 'edit', id: ID });
    expect(resolveCylinderRoute('/estoque/entrada')).toEqual({ kind: 'stock_in' });
  });

  it('tolera a barra final', () => {
    expect(resolveCylinderRoute('/cilindros/')).toEqual({ kind: 'list' });
    expect(resolveCylinderRoute('/estoque/entrada/')).toEqual({ kind: 'stock_in' });
  });

  it('identificador que não é UUID vira "não encontrado", sem chamada ao servidor', () => {
    expect(resolveCylinderRoute('/cilindros/abc')).toEqual({ kind: 'not_found' });
    expect(resolveCylinderRoute('/cilindros/abc/editar')).toEqual({ kind: 'not_found' });
    expect(resolveCylinderRoute(`/cilindros/${ID}/excluir`)).toEqual({ kind: 'not_found' });
    expect(resolveCylinderRoute(`/cilindros/${ID}/editar/mais`)).toEqual({ kind: 'not_found' });
  });

  it('devolve null para caminhos que não são de cilindros', () => {
    expect(resolveCylinderRoute('/')).toBeNull();
    expect(resolveCylinderRoute('/perfil')).toBeNull();
    expect(resolveCylinderRoute('/cilindrosx')).toBeNull();
    expect(resolveCylinderRoute('/estoque')).toBeNull();
  });
});

describe('requiredPermission (decisão final é do servidor)', () => {
  it('cada tela declara a permissão da ação', () => {
    expect(requiredPermission({ kind: 'list' })).toBe('cylinder.read');
    expect(requiredPermission({ kind: 'detail', id: ID })).toBe('cylinder.read');
    expect(requiredPermission({ kind: 'new' })).toBe('cylinder.write');
    expect(requiredPermission({ kind: 'edit', id: ID })).toBe('cylinder.write');
    expect(requiredPermission({ kind: 'stock_in' })).toBe('cylinder.stock_in');
    expect(requiredPermission({ kind: 'not_found' })).toBe('cylinder.read');
  });
});
