import { describe, expect, it } from 'vitest';
import { SCREENS, screenByPath } from './screens';

describe('catálogo de telas', () => {
  it('mantém a ordem e os identificadores do modelo de dados', () => {
    expect(SCREENS.map((screen) => screen.id)).toEqual(['inicio', 'perfil', 'membros', 'papeis', 'auditoria', 'organizacoes', 'auditoria-global']);
  });

  it('não repete identificador nem caminho', () => {
    expect(new Set(SCREENS.map((screen) => screen.id)).size).toBe(SCREENS.length);
    expect(new Set(SCREENS.map((screen) => screen.path)).size).toBe(SCREENS.length);
  });

  it('Início e Meu perfil não exigem permissão (RN-003)', () => {
    expect(SCREENS.filter((screen) => !screen.requires).map((screen) => screen.id)).toEqual(['inicio', 'perfil']);
  });

  it('declara a exigência de cada tela restrita como no servidor', () => {
    const requires = Object.fromEntries(SCREENS.map((screen) => [screen.id, screen.requires]));
    expect(requires).toMatchObject({
      membros: { scope: 'tenant', code: 'tenant.manage' },
      papeis: { scope: 'tenant', code: 'tenant.manage' },
      auditoria: { scope: 'tenant', code: 'audit.read' },
      organizacoes: { scope: 'global', code: 'platform.manage' },
      'auditoria-global': { scope: 'global', code: 'audit.read' },
    });
  });

  it('segue a tabela de rotas atual: tenant ativo e segundo fator', () => {
    const flags = Object.fromEntries(SCREENS.map((screen) => [screen.path, [screen.tenantScoped, screen.requireAal2]]));
    expect(flags).toEqual({
      '/': [false, false], '/perfil': [false, false],
      '/admin/membros': [true, true], '/admin/papeis': [true, true], '/admin/auditoria': [true, false],
      '/admin/tenants': [false, true], '/admin/auditoria-global': [false, true],
    });
  });

  it('encontra a tela pelo caminho', () => {
    expect(screenByPath('/admin/papeis')?.label).toBe('Papéis e permissões');
    expect(screenByPath('/nao-existe')).toBeUndefined();
  });
});
