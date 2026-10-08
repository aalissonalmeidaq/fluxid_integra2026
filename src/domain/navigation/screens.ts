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
  requireAal2: boolean;
}

export const SCREENS: readonly Screen[] = [
  { id: 'inicio', label: 'Visão geral', path: '/', tenantScoped: false, requireAal2: false },
  { id: 'cilindros', label: 'Cilindros', path: '/cilindros', requires: { scope: 'tenant', code: 'cylinder.read' }, tenantScoped: true, requireAal2: false },
  { id: 'entrada-estoque', label: 'Entrada no estoque', path: '/estoque/entrada', requires: { scope: 'tenant', code: 'cylinder.stock_in' }, tenantScoped: true, requireAal2: false },
  { id: 'clientes', label: 'Clientes', path: '/clientes', requires: { scope: 'tenant', code: 'customer.read' }, tenantScoped: true, requireAal2: false },
  { id: 'geocercas', label: 'Geocercas', path: '/geocercas', requires: { scope: 'tenant', code: 'geofence.read' }, tenantScoped: true, requireAal2: false },
  { id: 'veiculos', label: 'Veículos', path: '/veiculos', requires: { scope: 'tenant', code: 'vehicle.read' }, tenantScoped: true, requireAal2: false },
  { id: 'motoristas', label: 'Motoristas', path: '/motoristas', requires: { scope: 'tenant', code: 'driver.read' }, tenantScoped: true, requireAal2: false },
  { id: 'perfil', label: 'Meu perfil', path: '/perfil', tenantScoped: false, requireAal2: false },
  { id: 'membros', label: 'Pessoas do tenant', path: '/admin/membros', requires: { scope: 'tenant', code: 'tenant.manage' }, tenantScoped: true, requireAal2: true },
  { id: 'papeis', label: 'Papéis e permissões', path: '/admin/papeis', requires: { scope: 'tenant', code: 'tenant.manage' }, tenantScoped: true, requireAal2: true },
  { id: 'auditoria', label: 'Auditoria do tenant', path: '/admin/auditoria', requires: { scope: 'tenant', code: 'audit.read' }, tenantScoped: true, requireAal2: false },
  { id: 'organizacoes', label: 'Organizações', path: '/admin/tenants', requires: { scope: 'global', code: 'platform.manage' }, tenantScoped: false, requireAal2: true },
  { id: 'auditoria-global', label: 'Auditoria da plataforma', path: '/admin/auditoria-global', requires: { scope: 'global', code: 'audit.read' }, tenantScoped: false, requireAal2: true },
];

export const screenByPath = (path: string): Screen | undefined => SCREENS.find((screen) => screen.path === path);
