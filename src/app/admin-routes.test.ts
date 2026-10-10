import { describe, expect, it } from 'vitest';
import { SCREENS } from '@/domain/navigation/screens';
import { ADMIN_ROUTES } from './admin-routes';

// Os caminhos fixos têm tratamento próprio no App (`/` e `/perfil`); todos os demais do catálogo precisam de rota administrativa.
// Os caminhos de cilindros (Spec 006) também têm tratamento próprio: o App os resolve por src/app/cylinders/cylinder-routes.ts.
// Os de clientes, geocercas, veículos e motoristas (Spec 007) são resolvidos por src/app/registry/registry-routes.ts.
// O de viagens (Spec 008) é resolvido por src/app/trips/trip-routes.ts.
const FIXED = ['/', '/perfil', '/cilindros', '/estoque/entrada', '/clientes', '/geocercas', '/veiculos', '/motoristas', '/viagens'];

describe('rotas administrativas × catálogo de telas', () => {
  it('todo caminho do catálogo existe em ADMIN_ROUTES ou nas rotas fixas', () => {
    for (const screen of SCREENS) expect(FIXED.includes(screen.path) || screen.path in ADMIN_ROUTES, screen.path).toBe(true);
  });

  it('toda rota administrativa está no catálogo, com as mesmas exigências', () => {
    expect(Object.keys(ADMIN_ROUTES).sort()).toEqual(SCREENS.filter((screen) => !FIXED.includes(screen.path)).map((screen) => screen.path).sort());
    for (const [path, route] of Object.entries(ADMIN_ROUTES)) {
      const screen = SCREENS.find((candidate) => candidate.path === path);
      expect([route.tenantScoped, route.requireAal2], path).toEqual([screen?.tenantScoped, screen?.requireAal2]);
    }
  });

  it('mantém a tabela atual de exigências (RN-002: nenhuma regra de acesso muda)', () => {
    expect(Object.fromEntries(Object.entries(ADMIN_ROUTES).map(([path, route]) => [path, [route.tenantScoped, route.requireAal2]]))).toEqual({
      '/admin/tenants': [false, true], '/admin/membros': [true, true], '/admin/papeis': [true, true],
      '/admin/auditoria': [true, false], '/admin/auditoria-global': [false, true],
    });
  });
});
