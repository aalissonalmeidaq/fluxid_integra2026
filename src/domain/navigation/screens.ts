// Catálogo das telas do aplicativo: fonte única de nome, caminho e exigência para o menu e para a tabela de rotas.
// O servidor continua sendo a única barreira de acesso; esta tabela só decide o que mostrar (RN-001, RN-002).
export type PermissionScope = 'tenant' | 'global';

export interface ScreenRequirement { scope: PermissionScope; code: string }

export interface Screen {
  id: string;
  label: string;
  path: string;
  requires?: ScreenRequirement;
  tenantScoped: boolean;
}

// A raiz "/" é da landing page pública (Spec 011); a Visão geral do sistema vive neste endereço.
export const VISAO_GERAL = '/visao-geral';

export const SCREENS: readonly Screen[] = [
  { id: 'inicio', label: 'Visão geral', path: VISAO_GERAL, tenantScoped: false },
  { id: 'cilindros', label: 'Cilindros', path: '/cilindros', requires: { scope: 'tenant', code: 'cylinder.read' }, tenantScoped: true },
  { id: 'entrada-estoque', label: 'Entrada no estoque', path: '/estoque/entrada', requires: { scope: 'tenant', code: 'cylinder.stock_in' }, tenantScoped: true },
  { id: 'clientes', label: 'Clientes', path: '/clientes', requires: { scope: 'tenant', code: 'customer.read' }, tenantScoped: true },
  { id: 'geocercas', label: 'Geocercas', path: '/geocercas', requires: { scope: 'tenant', code: 'geofence.read' }, tenantScoped: true },
  { id: 'veiculos', label: 'Veículos', path: '/veiculos', requires: { scope: 'tenant', code: 'vehicle.read' }, tenantScoped: true },
  { id: 'motoristas', label: 'Motoristas', path: '/motoristas', requires: { scope: 'tenant', code: 'driver.read' }, tenantScoped: true },
  { id: 'viagens', label: 'Viagens', path: '/viagens', requires: { scope: 'tenant', code: 'trip.read' }, tenantScoped: true },
  // Spec 012: lacres e alertas reais (a página de alertas deixa de ser exemplo e passa a exigir a permissão de ver lacres).
  { id: 'lacres', label: 'Lacres', path: '/lacres', requires: { scope: 'tenant', code: 'seal.read' }, tenantScoped: true },
  { id: 'alertas', label: 'Alertas', path: '/alertas', requires: { scope: 'tenant', code: 'seal.read' }, tenantScoped: true },
  { id: 'perfil', label: 'Meu perfil', path: '/perfil', tenantScoped: false },
  { id: 'membros', label: 'Pessoas do tenant', path: '/admin/membros', requires: { scope: 'tenant', code: 'tenant.manage' }, tenantScoped: true },
  { id: 'papeis', label: 'Papéis e permissões', path: '/admin/papeis', requires: { scope: 'tenant', code: 'tenant.manage' }, tenantScoped: true },
  { id: 'auditoria', label: 'Auditoria do tenant', path: '/admin/auditoria', requires: { scope: 'tenant', code: 'audit.read' }, tenantScoped: true },
  { id: 'organizacoes', label: 'Organizações', path: '/admin/tenants', requires: { scope: 'global', code: 'platform.manage' }, tenantScoped: false },
  // Spec 013: a fila de pedidos de aprovação dos lacres, só do Master.
  { id: 'lacres-plataforma', label: 'Lacres da plataforma', path: '/admin/lacres', requires: { scope: 'global', code: 'platform.manage' }, tenantScoped: false },
  { id: 'auditoria-global', label: 'Auditoria da plataforma', path: '/admin/auditoria-global', requires: { scope: 'global', code: 'audit.read' }, tenantScoped: false },
];

export const screenByPath = (path: string): Screen | undefined => SCREENS.find((screen) => screen.path === path);
