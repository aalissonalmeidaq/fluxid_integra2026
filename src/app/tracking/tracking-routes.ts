// Resolve as rotas do rastreamento da Spec 015 sem biblioteca de roteamento (como as viagens e os lacres): /rastreamento,
// /rastreamento/viagens/:id, /rastreamento/ocorrencias/:id, /rastreamento/historico, /rastreamento/regra (alterar a regra exige
// proximity_rule.manage, conferida no servidor) e /rastreamento/avisos (categorias de aviso por e-mail). A permissão devolvida é só para a tela decidir o que mostrar; a decisão final é sempre
// do servidor. O resolvedor não importa nenhuma página: a área registra o `React.lazy` de cada tela em src/pages/tracking/tracking-area.tsx.

export type TrackingRoute =
  | { kind: 'active_trips' }
  | { kind: 'trip'; id: string }
  | { kind: 'rule' }
  | { kind: 'email' }
  | { kind: 'history' }
  | { kind: 'occurrence'; id: string }
  | { kind: 'driver_trips' }
  | { kind: 'not_found' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function resolveTrackingRoute(pathname: string): TrackingRoute | null {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  const [, head = '', section, id, ...tail] = path.split('/');
  // "Minha viagem": a coleta da pessoa motorista. Fica fora de /rastreamento porque depende só do vínculo, não de tracking.read.
  if (head === 'minha-viagem') return section === undefined ? { kind: 'driver_trips' } : { kind: 'not_found' };
  if (head !== 'rastreamento') return null;
  if (section === undefined) return { kind: 'active_trips' };
  if (section === 'regra') return id === undefined ? { kind: 'rule' } : { kind: 'not_found' };
  // US6: liberação das categorias de aviso por e-mail (notification_category.manage, conferida na tela e no servidor).
  if (section === 'avisos') return id === undefined ? { kind: 'email' } : { kind: 'not_found' };
  // O assunto e o período do histórico vêm da consulta da URL (?subject=&id=&from=&to=), não do caminho.
  if (section === 'historico') return id === undefined ? { kind: 'history' } : { kind: 'not_found' };
  if ((section !== 'viagens' && section !== 'ocorrencias') || id === undefined || tail.length > 0 || !UUID.test(id)) return { kind: 'not_found' };
  return section === 'viagens' ? { kind: 'trip', id } : { kind: 'occurrence', id };
}

export function requiredTrackingPermission(route: TrackingRoute): string | null {
  if (route.kind === 'driver_trips') return null;
  return route.kind === 'email' ? 'notification_category.manage' : 'tracking.read';
}
