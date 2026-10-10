// Resolve as rotas das viagens da Fase 4 (Spec 008) sem biblioteca de roteamento: o App navega por âncoras e
// `window.location.pathname`. A permissão devolvida é só para a tela decidir o que mostrar; a decisão final é sempre do
// servidor (RN-002). O resolvedor não importa nenhuma página: a área registra o `React.lazy` de cada tela em
// src/pages/trips/trips-area.tsx (contracts/telas-e-rotas.md).

export type TripRoute =
  | { kind: 'list' }
  | { kind: 'new' }
  | { kind: 'detail'; id: string }
  | { kind: 'edit'; id: string }
  | { kind: 'not_found' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Devolve a rota de viagens, ou nulo quando o caminho não é de viagens.
export function resolveTripRoute(pathname: string): TripRoute | null {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  const [, head = '', first, second, ...tail] = path.split('/');
  if (head !== 'viagens') return null;
  if (first === undefined) return { kind: 'list' };
  if (tail.length > 0) return { kind: 'not_found' };
  if (first === 'nova') return second === undefined ? { kind: 'new' } : { kind: 'not_found' };
  if (!UUID.test(first)) return { kind: 'not_found' };
  if (second === undefined) return { kind: 'detail', id: first };
  if (second === 'editar') return { kind: 'edit', id: first };
  return { kind: 'not_found' };
}

// Permissão da ação da rota: planejar e editar exigem `trip.write`; ver exige `trip.read`.
export function requiredTripPermission(route: TripRoute): string {
  return route.kind === 'new' || route.kind === 'edit' ? 'trip.write' : 'trip.read';
}
