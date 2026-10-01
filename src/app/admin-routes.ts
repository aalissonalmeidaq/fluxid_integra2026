import type React from 'react';
import { TenantsDashboardPage } from '@/pages/admin/tenants-dashboard-page';
import { TenantMembersPage } from '@/pages/admin/tenant-members-page';
import { TenantRolesPage } from '@/pages/admin/tenant-roles-page';
import { PlatformAuditLogPage, TenantAuditLogPage } from '@/pages/admin/tenant-audit-log-page';
import { screenByPath } from '@/domain/navigation/screens';

// Cada área declara o que exige: segundo fator (AAL2) e tenant ativo confirmado, lidos do catálogo de telas (fonte única do menu
// e das rotas). A decisão final é sempre do servidor. A leitura da auditoria do tenant não é ação crítica e dispensa AAL2.
interface AdminRoute { Page: () => React.JSX.Element; tenantScoped: boolean; requireAal2: boolean }
const ADMIN_PAGES: Record<string, () => React.JSX.Element> = {
  '/admin/tenants': TenantsDashboardPage,
  '/admin/membros': TenantMembersPage,
  '/admin/papeis': TenantRolesPage,
  '/admin/auditoria': TenantAuditLogPage,
  '/admin/auditoria-global': PlatformAuditLogPage,
};
export const ADMIN_ROUTES: Record<string, AdminRoute> = Object.fromEntries(Object.entries(ADMIN_PAGES).map(([path, Page]) => {
  const screen = screenByPath(path);
  if (!screen) throw new Error('screen_not_in_catalog:' + path);
  return [path, { Page, tenantScoped: screen.tenantScoped, requireAal2: screen.requireAal2 }];
}));
