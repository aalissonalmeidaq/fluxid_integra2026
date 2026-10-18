// Resolve as rotas do lacre da Spec 012 sem biblioteca de roteamento (como as viagens): /lacres, /lacres/:id, /alertas e
// /alertas/:id. A permissão devolvida é só para a tela decidir o que mostrar; a decisão final é sempre do servidor. O resolvedor não
// importa nenhuma página: a área registra o `React.lazy` de cada tela em src/pages/seals/seals-area.tsx (contracts/telas-e-rotas.md).

export type SealRoute =
  | { kind: 'seal_list' }
  | { kind: 'seal_detail'; id: string }
  | { kind: 'alert_list' }
  | { kind: 'alert_detail'; id: string }
  | { kind: 'not_found' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function resolveSealRoute(pathname: string): SealRoute | null {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  const [, head = '', id, ...tail] = path.split('/');
  if (head !== 'lacres' && head !== 'alertas') return null;
  const area = head === 'lacres' ? 'seal' : 'alert';
  if (id === undefined) return { kind: `${area}_list` };
  if (tail.length > 0 || !UUID.test(id)) return { kind: 'not_found' };
  return { kind: `${area}_detail`, id };
}

export function requiredSealPermission(_route: SealRoute): string {
  return 'seal.read';
}
