// Resolve as rotas dos cadastros da Fase 3 (Spec 007) sem biblioteca de roteamento: o App navega por âncoras e
// `window.location.pathname`. A permissão devolvida é só para a tela decidir o que mostrar; a decisão final é sempre do
// servidor (RN-002). O resolvedor não importa nenhuma página: cada história registra o `React.lazy` da sua tela em
// src/pages/registry/registry-area.tsx (RF-047).

export type RegistryAreaName = 'customers' | 'geofences' | 'vehicles' | 'drivers';

export type RegistryRoute =
  | { area: 'customers'; kind: 'list' }
  | { area: 'customers'; kind: 'new' }
  | { area: 'customers'; kind: 'detail'; id: string }
  | { area: 'customers'; kind: 'edit'; id: string }
  | { area: 'customers'; kind: 'site_new'; customerId: string }
  | { area: 'customers'; kind: 'site_detail'; customerId: string; siteId: string }
  | { area: 'customers'; kind: 'site_edit'; customerId: string; siteId: string }
  | { area: 'geofences'; kind: 'list' }
  | { area: 'geofences'; kind: 'new' }
  | { area: 'geofences'; kind: 'detail'; id: string }
  | { area: 'geofences'; kind: 'edit'; id: string }
  | { area: 'vehicles'; kind: 'list' }
  | { area: 'vehicles'; kind: 'new' }
  | { area: 'vehicles'; kind: 'detail'; id: string }
  | { area: 'vehicles'; kind: 'edit'; id: string }
  | { area: 'drivers'; kind: 'list' }
  | { area: 'drivers'; kind: 'new' }
  | { area: 'drivers'; kind: 'detail'; id: string }
  | { area: 'drivers'; kind: 'edit'; id: string }
  | { area: RegistryAreaName; kind: 'not_found' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const AREAS: Record<string, RegistryAreaName> = { '/clientes': 'customers', '/geocercas': 'geofences', '/veiculos': 'vehicles', '/motoristas': 'drivers' };

// Rotas simples de uma área: lista, novo, detalhe e edição.
function simpleRoute(area: Exclude<RegistryAreaName, 'customers'>, rest: string[]): RegistryRoute {
  const [first, second, ...tail] = rest;
  if (first === undefined) return { area, kind: 'list' };
  // O cadastro é /novo, e /nova para geocerca (feminino); a unidade da geocerca vem pelo parâmetro ?unidade.
  const newWord = area === 'geofences' ? 'nova' : 'novo';
  if (first === newWord && second === undefined) return { area, kind: 'new' };
  if (!UUID.test(first) || tail.length > 0) return { area, kind: 'not_found' };
  if (second === undefined) return { area, kind: 'detail', id: first };
  if (second === 'editar') return { area, kind: 'edit', id: first };
  return { area, kind: 'not_found' };
}

function customerRoute(rest: string[]): RegistryRoute {
  const [first, second, third, fourth, fifth] = rest;
  if (first === undefined) return { area: 'customers', kind: 'list' };
  if (first === 'novo') return rest.length === 1 ? { area: 'customers', kind: 'new' } : { area: 'customers', kind: 'not_found' };
  if (!UUID.test(first)) return { area: 'customers', kind: 'not_found' };
  if (second === undefined) return { area: 'customers', kind: 'detail', id: first };
  if (second === 'editar' && third === undefined) return { area: 'customers', kind: 'edit', id: first };
  if (second === 'unidades' && third === 'nova' && fourth === undefined) return { area: 'customers', kind: 'site_new', customerId: first };
  if (second === 'unidades' && third !== undefined && UUID.test(third)) {
    if (fourth === undefined) return { area: 'customers', kind: 'site_detail', customerId: first, siteId: third };
    if (fourth === 'editar' && fifth === undefined) return { area: 'customers', kind: 'site_edit', customerId: first, siteId: third };
  }
  return { area: 'customers', kind: 'not_found' };
}

// Devolve a rota da área de cadastros, ou nulo quando o caminho não é de nenhuma delas.
export function resolveRegistryRoute(pathname: string): RegistryRoute | null {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  const [, head = '', ...rest] = path.split('/');
  const area = AREAS[`/${head}`];
  if (area === undefined) return null;
  return area === 'customers' ? customerRoute(rest) : simpleRoute(area, rest);
}

const READ: Record<RegistryAreaName, string> = { customers: 'customer.read', geofences: 'geofence.read', vehicles: 'vehicle.read', drivers: 'driver.read' };
const WRITE: Record<RegistryAreaName, string> = { customers: 'customer.write', geofences: 'geofence.write', vehicles: 'vehicle.write', drivers: 'driver.write' };

// Permissão da ação da rota: criar e editar exigem `*.write`; ver exige `*.read`.
export function requiredPermission(route: RegistryRoute): string {
  switch (route.kind) {
    case 'new':
    case 'edit':
    case 'site_new':
    case 'site_edit':
      return WRITE[route.area];
    default:
      return READ[route.area];
  }
}
