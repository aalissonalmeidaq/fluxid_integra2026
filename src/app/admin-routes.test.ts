import { describe, expect, it } from 'vitest';
import { SCREENS } from '@/domain/navigation/screens';
import { ADMIN_ROUTES } from './admin-routes';

// Os caminhos fixos têm tratamento próprio no App (`/visao-geral` e `/perfil`; a raiz `/` é a landing, Spec 011); todos os demais do catálogo precisam de rota administrativa.
// Os caminhos de cilindros (Spec 006) também têm tratamento próprio: o App os resolve por src/app/cylinders/cylinder-routes.ts.
// Os de clientes, geocercas, veículos e motoristas (Spec 007) são resolvidos por src/app/registry/registry-routes.ts.
// O de viagens (Spec 008) é resolvido por src/app/trips/trip-routes.ts; os de lacres e alertas (Spec 012), por src/app/seals/seal-routes.ts.
// Os de rastreamento, "Minha viagem" e relatórios (Spec 015) são resolvidos por src/app/tracking/tracking-routes.ts e src/app/reports/report-routes.ts.
const FIXED = ['/visao-geral', '/minha-viagem', '/perfil', '/cilindros', '/estoque/entrada', '/clientes', '/geocercas', '/veiculos', '/motoristas', '/viagens', '/lacres', '/alertas', '/rastreamento', '/relatorios'];

describe('rotas administrativas × catálogo de telas', () => {
  it('todo caminho do catálogo existe em ADMIN_ROUTES ou nas rotas fixas', () => {
    for (const screen of SCREENS) expect(FIXED.includes(screen.path) || screen.path in ADMIN_ROUTES, screen.path).toBe(true);
  });

  it('toda rota administrativa está no catálogo, com as mesmas exigências', () => {
    expect(Object.keys(ADMIN_ROUTES).sort()).toEqual(SCREENS.filter((screen) => !FIXED.includes(screen.path)).map((screen) => screen.path).sort());
    for (const [path, route] of Object.entries(ADMIN_ROUTES)) {
      const screen = SCREENS.find((candidate) => candidate.path === path);
      expect(route.tenantScoped, path).toEqual(screen?.tenantScoped);
    }
  });

  it('Lacres da plataforma (Spec 013) exige platform.manage, sem tenant ativo', () => {
    expect(SCREENS.find((screen) => screen.path === '/admin/lacres')).toMatchObject({
      label: 'Lacres da plataforma', requires: { scope: 'global', code: 'platform.manage' }, tenantScoped: false,
    });
    const ids = SCREENS.map((screen) => screen.id);
    expect(ids.indexOf('lacres-plataforma')).toBe(ids.indexOf('organizacoes') + 1);
  });

  it('mantém a tabela atual de exigências (RN-002: nenhuma regra de acesso muda)', () => {
    expect(Object.fromEntries(Object.entries(ADMIN_ROUTES).map(([path, route]) => [path, route.tenantScoped]))).toEqual({
      '/admin/tenants': false, '/admin/membros': true, '/admin/papeis': true,
      '/admin/auditoria': true, '/admin/auditoria-global': false, '/admin/lacres': false,
    });
  });
});
