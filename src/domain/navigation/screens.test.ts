import { describe, expect, it } from 'vitest';
import { SCREENS, screenByPath } from './screens';

describe('catálogo de telas', () => {
  it('mantém a ordem e os identificadores do modelo de dados', () => {
    expect(SCREENS.map((screen) => screen.id)).toEqual(['inicio', 'minha-viagem', 'cilindros', 'entrada-estoque', 'clientes', 'geocercas', 'veiculos', 'motoristas', 'viagens', 'lacres', 'alertas', 'rastreamento', 'relatorios', 'perfil', 'membros', 'papeis', 'auditoria', 'organizacoes', 'lacres-plataforma', 'auditoria-global']);
  });

  it('não repete identificador nem caminho', () => {
    expect(new Set(SCREENS.map((screen) => screen.id)).size).toBe(SCREENS.length);
    expect(new Set(SCREENS.map((screen) => screen.path)).size).toBe(SCREENS.length);
  });

  it('Visão geral e Meu perfil não exigem permissão (RN-003)', () => {
    expect(SCREENS.filter((screen) => !screen.requires && !screen.driverOnly).map((screen) => screen.id)).toEqual(['inicio', 'perfil']);
  });

  // Spec 015 (validação humana): o papel Motorista não tem permissões; "Minha viagem" depende só do vínculo de motorista.
  it('Minha viagem é a única tela só de motorista e não exige permissão', () => {
    expect(SCREENS.filter((screen) => screen.driverOnly).map((screen) => [screen.id, screen.path, screen.requires])).toEqual([['minha-viagem', '/minha-viagem', undefined]]);
  });

  it('declara a exigência de cada tela restrita como no servidor', () => {
    const requires = Object.fromEntries(SCREENS.map((screen) => [screen.id, screen.requires]));
    expect(requires).toMatchObject({
      membros: { scope: 'tenant', code: 'tenant.manage' },
      papeis: { scope: 'tenant', code: 'tenant.manage' },
      auditoria: { scope: 'tenant', code: 'audit.read' },
      cilindros: { scope: 'tenant', code: 'cylinder.read' },
      'entrada-estoque': { scope: 'tenant', code: 'cylinder.stock_in' },
      clientes: { scope: 'tenant', code: 'customer.read' },
      geocercas: { scope: 'tenant', code: 'geofence.read' },
      veiculos: { scope: 'tenant', code: 'vehicle.read' },
      motoristas: { scope: 'tenant', code: 'driver.read' },
      viagens: { scope: 'tenant', code: 'trip.read' },
      rastreamento: { scope: 'tenant', code: 'tracking.read' },
      relatorios: { scope: 'tenant', code: 'trip.read', anyOf: ['tracking.read', 'seal.read', 'cylinder.history'] },
      lacres: { scope: 'tenant', code: 'seal.read' },
      alertas: { scope: 'tenant', code: 'seal.read' },
      organizacoes: { scope: 'global', code: 'platform.manage' },
      'lacres-plataforma': { scope: 'global', code: 'platform.manage' },
      'auditoria-global': { scope: 'global', code: 'audit.read' },
    });
  });

  it('segue a tabela de rotas atual: tenant ativo (sem segundo fator, Spec 013, RF-021)', () => {
    const flags = Object.fromEntries(SCREENS.map((screen) => [screen.path, screen.tenantScoped]));
    expect(flags).toEqual({
      '/visao-geral': false, '/minha-viagem': true, '/perfil': false, '/cilindros': true, '/estoque/entrada': true,
      '/clientes': true, '/geocercas': true, '/veiculos': true, '/motoristas': true, '/viagens': true,
      '/lacres': true, '/alertas': true, '/rastreamento': true, '/relatorios': true,
      '/admin/membros': true, '/admin/papeis': true, '/admin/auditoria': true,
      '/admin/tenants': false, '/admin/lacres': false, '/admin/auditoria-global': false,
    });
  });

  it('encontra a tela pelo caminho', () => {
    expect(screenByPath('/admin/papeis')?.label).toBe('Papéis e permissões');
    expect(screenByPath('/nao-existe')).toBeUndefined();
  });
});
