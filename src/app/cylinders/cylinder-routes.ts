// Resolve as rotas de cilindros (Spec 006) sem biblioteca de roteamento: o App navega por âncoras e `window.location.pathname`.
// A permissão devolvida é só para a tela decidir o que mostrar; a decisão final é sempre do servidor (RN-002).

export type CylinderRoute =
  | { kind: 'list' }
  | { kind: 'new' }
  | { kind: 'detail'; id: string }
  | { kind: 'edit'; id: string }
  | { kind: 'stock_in' }
  | { kind: 'not_found' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function resolveCylinderRoute(pathname: string): CylinderRoute | null {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  if (path === '/estoque/entrada') return { kind: 'stock_in' };
  if (path === '/cilindros') return { kind: 'list' };
  if (!path.startsWith('/cilindros/')) return null;
  const parts = path.slice('/cilindros/'.length).split('/');
  const [first, second, ...rest] = parts;
  if (first === 'novo' && second === undefined) return { kind: 'new' };
  if (first === undefined || !UUID.test(first) || rest.length > 0) return { kind: 'not_found' };
  if (second === undefined) return { kind: 'detail', id: first };
  if (second === 'editar') return { kind: 'edit', id: first };
  return { kind: 'not_found' };
}

export function requiredPermission(route: CylinderRoute): string {
  switch (route.kind) {
    case 'new':
    case 'edit':
      return 'cylinder.write';
    case 'stock_in':
      return 'cylinder.stock_in';
    default:
      return 'cylinder.read';
  }
}
