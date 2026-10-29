import { describe, expect, it } from 'vitest';
import { visibleScreens } from './visible-screens';

const labels = (permissions: Parameters<typeof visibleScreens>[0]) => visibleScreens(permissions).map((screen) => screen.label);

const BASE = ['Visão geral', 'Meu perfil'];

describe('visibleScreens', () => {
  it('administrador de tenant vê as telas da empresa, em ordem', () => {
    expect(labels({ tenant: ['audit.read', 'profile.read', 'tenant.manage'], global: [] })).toEqual([
      'Visão geral', 'Meu perfil', 'Pessoas da empresa', 'Papéis e permissões', 'Auditoria da empresa',
    ]);
  });

  it('operador vê só Visão geral e Meu perfil', () => {
    expect(labels({ tenant: ['profile.read'], global: [] })).toEqual(BASE);
  });

  it('Master vê as telas globais e não as da empresa quando a lista da empresa está vazia', () => {
    expect(labels({ tenant: [], global: ['audit.read', 'platform.manage', 'profile.read', 'tenant.manage'] })).toEqual([
      'Visão geral', 'Meu perfil', 'Organizações', 'Lacres da plataforma', 'Auditoria da plataforma',
    ]);
  });

  it('Administrador FluxID vê Organizações e Auditoria da plataforma, nada da empresa', () => {
    expect(labels({ tenant: [], global: ['audit.read', 'platform.manage', 'profile.read'] })).toEqual([
      'Visão geral', 'Meu perfil', 'Organizações', 'Lacres da plataforma', 'Auditoria da plataforma',
    ]);
  });

  it('perfil global com permissões na empresa ativa soma os dois conjuntos, cada um só para o seu escopo', () => {
    expect(labels({ tenant: ['tenant.manage'], global: ['platform.manage'] })).toEqual([
      'Visão geral', 'Meu perfil', 'Pessoas da empresa', 'Papéis e permissões', 'Organizações', 'Lacres da plataforma',
    ]);
  });

  it('permissão de um escopo não libera item de outro escopo', () => {
    expect(labels({ tenant: ['platform.manage'], global: [] })).toEqual(BASE);
    expect(labels({ tenant: [], global: ['tenant.manage'] })).toEqual(BASE);
  });

  it('pessoa com duas empresas: cada consulta decide o seu menu', () => {
    expect(labels({ tenant: ['tenant.manage', 'audit.read'], global: [] })).toContain('Pessoas da empresa');
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
      ['Visão geral', '/visao-geral'], ['Meu perfil', '/perfil'], ['Pessoas da empresa', '/admin/membros'], ['Papéis e permissões', '/admin/papeis'],
      ['Auditoria da empresa', '/admin/auditoria'], ['Organizações', '/admin/tenants'], ['Lacres da plataforma', '/admin/lacres'], ['Auditoria da plataforma', '/admin/auditoria-global'],
    ]);
  });

  // Spec 015 (T086): Relatórios aparece para quem lê pelo menos um dos tipos; report.export sozinho não abre a tela.
  it('Relatórios aparece com qualquer leitura da matriz e não só com report.export', () => {
    for (const code of ['trip.read', 'tracking.read', 'seal.read', 'cylinder.history']) {
      expect(visibleScreens({ tenant: [code], global: [] }).map((screen) => screen.id), code).toContain('relatorios');
    }
    expect(visibleScreens({ tenant: ['report.export'], global: [] }).map((screen) => screen.id)).not.toContain('relatorios');
  });

  // Spec 015 (validação humana): "Minha viagem" aparece só para quem é motorista vinculado, sem depender de permissão.
  it('Minha viagem aparece só para motorista, logo depois da Visão geral', () => {
    expect(visibleScreens({ tenant: [], global: [] }, { driver: true }).map((screen) => screen.label)).toEqual(['Visão geral', 'Minha viagem', 'Meu perfil']);
    expect(visibleScreens(null, { driver: true }).map((screen) => screen.label)).toContain('Minha viagem');
    expect(labels({ tenant: ['tracking.read', 'trip.read'], global: [] })).not.toContain('Minha viagem');
  });
});
