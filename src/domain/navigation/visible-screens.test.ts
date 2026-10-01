import { describe, expect, it } from 'vitest';
import { visibleScreens } from './visible-screens';

const labels = (permissions: Parameters<typeof visibleScreens>[0]) => visibleScreens(permissions).map((screen) => screen.label);

const BASE = ['Início', 'Meu perfil'];

describe('visibleScreens', () => {
  it('administrador de tenant vê as telas do tenant, em ordem', () => {
    expect(labels({ tenant: ['audit.read', 'profile.read', 'tenant.manage'], global: [] })).toEqual([
      'Início', 'Meu perfil', 'Pessoas do tenant', 'Papéis e permissões', 'Auditoria do tenant',
    ]);
  });

  it('operador vê só Início e Meu perfil', () => {
    expect(labels({ tenant: ['profile.read'], global: [] })).toEqual(BASE);
  });

  it('Master vê as telas globais e não as do tenant quando a lista do tenant está vazia', () => {
    expect(labels({ tenant: [], global: ['audit.read', 'platform.manage', 'profile.read', 'tenant.manage'] })).toEqual([
      'Início', 'Meu perfil', 'Organizações', 'Auditoria da plataforma',
    ]);
  });

  it('Administrador FluxID vê Organizações e Auditoria da plataforma, nada do tenant', () => {
    expect(labels({ tenant: [], global: ['audit.read', 'platform.manage', 'profile.read'] })).toEqual([
      'Início', 'Meu perfil', 'Organizações', 'Auditoria da plataforma',
    ]);
  });

  it('perfil global com permissões no tenant ativo soma os dois conjuntos, cada um só para o seu escopo', () => {
    expect(labels({ tenant: ['tenant.manage'], global: ['platform.manage'] })).toEqual([
      'Início', 'Meu perfil', 'Pessoas do tenant', 'Papéis e permissões', 'Organizações',
    ]);
  });

  it('permissão de um escopo não libera item de outro escopo', () => {
    expect(labels({ tenant: ['platform.manage'], global: [] })).toEqual(BASE);
    expect(labels({ tenant: [], global: ['tenant.manage'] })).toEqual(BASE);
  });

  it('pessoa com dois tenants: cada consulta decide o seu menu', () => {
    expect(labels({ tenant: ['tenant.manage', 'audit.read'], global: [] })).toContain('Pessoas do tenant');
    expect(labels({ tenant: [], global: [] })).toEqual(BASE);
  });

  it('conjunto vazio e consulta ausente mostram só os itens sem exigência', () => {
    expect(labels({ tenant: [], global: [] })).toEqual(BASE);
    expect(labels(null)).toEqual(BASE);
  });

  it('ignora códigos desconhecidos', () => {
    expect(labels({ tenant: ['inventado.admin', ''], global: ['root'] })).toEqual(BASE);
  });

  it('devolve caminhos e nomes iguais aos do modelo de dados', () => {
    const all = visibleScreens({ tenant: ['tenant.manage', 'audit.read'], global: ['platform.manage', 'audit.read'] });
    expect(all.map((screen) => [screen.label, screen.path])).toEqual([
      ['Início', '/'], ['Meu perfil', '/perfil'], ['Pessoas do tenant', '/admin/membros'], ['Papéis e permissões', '/admin/papeis'],
      ['Auditoria do tenant', '/admin/auditoria'], ['Organizações', '/admin/tenants'], ['Auditoria da plataforma', '/admin/auditoria-global'],
    ]);
  });
});
