import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { MockBackend } from './support/mock-backend';

test.use({ serviceWorkers: 'block' });

const A = '20000000-0000-0000-0000-00000000000a';
const B = '20000000-0000-0000-0000-00000000000b';

const membership = (organizationId: string, name: string, over: { status?: string; orgStatus?: string } = {}) => ({
  id: `30000000-0000-0000-0000-00000000000${organizationId.slice(-1)}`,
  organization_id: organizationId,
  status: over.status ?? 'active',
  organizations: { id: organizationId, kind: 'tenant', status: over.orgStatus ?? 'active', display_name: name },
});

async function enter(page: Page, backend: MockBackend, path = '/admin/membros'): Promise<void> {
  backend.loginResponses = [backend.authenticated()];
  backend.statusResponse = backend.activeStatus('aal2');
  await backend.install(page);
  await page.goto('/');
  await page.getByLabel('E-mail').fill('admin-a@example.invalid');
  await page.getByLabel('Senha', { exact: true }).fill('Local-only-002!');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Minha conta' })).toBeVisible();
  await page.goto(path);
}

const membersRequests = (backend: MockBackend) =>
  backend.calls.filter((call) => call.path === '/functions/v1/manage-membership' && (call.body as { operation?: string })?.operation === 'list')
    .map((call) => (call.body as { organization_id: string }).organization_id);

test.describe('Seleção e troca do tenant ativo', () => {
  test('com dois vínculos exige a escolha e mostra somente os dados do tenant escolhido', async ({ page }) => {
    const backend = new MockBackend();
    backend.tenantMemberships = [membership(A, 'Tenant A'), membership(B, 'Tenant B')];
    await enter(page, backend);
    await expect(page.getByRole('heading', { name: 'Escolha a organização' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Pessoas do tenant' })).toHaveCount(0);
    expect(membersRequests(backend)).toEqual([]);

    await page.getByRole('button', { name: 'Entrar em Tenant B' }).click();
    await expect(page.getByRole('rowheader', { name: 'Operador B' })).toBeVisible();
    await expect(page.getByRole('rowheader', { name: 'Operador A' })).toHaveCount(0);
    await expect(page.getByText('Organização ativa:')).toBeVisible();
    await expect(page.getByText('Tenant B', { exact: true })).toBeVisible();
    expect(membersRequests(backend)).toEqual([B]);
  });

  test('a troca remove dados do contexto anterior antes de liberar o novo e não vaza entre tenants', async ({ page }) => {
    const backend = new MockBackend();
    backend.tenantMemberships = [membership(A, 'Tenant A'), membership(B, 'Tenant B')];
    await enter(page, backend);
    await page.getByRole('button', { name: 'Entrar em Tenant A' }).click();
    await expect(page.getByRole('rowheader', { name: 'Operador A' })).toBeVisible();

    await page.getByRole('button', { name: 'Trocar organização' }).click();
    await expect(page.getByRole('heading', { name: 'Escolha a organização' })).toBeVisible();
    await expect(page.getByRole('rowheader', { name: 'Operador A' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Entrar em Tenant A' })).toBeDisabled();
    // Nenhum dado da organização anterior fica visível além da marcação de organização atual na lista de escolha (CA-007).
    await expect(page.getByRole('main').getByText('Operador A')).toHaveCount(0);

    await page.getByRole('button', { name: 'Entrar em Tenant B' }).click();
    await expect(page.getByRole('rowheader', { name: 'Operador B' })).toBeVisible();
    await expect(page.getByRole('rowheader', { name: 'Operador A' })).toHaveCount(0);
    await expect(page.getByRole('main').getByText('Operador A')).toHaveCount(0);
    expect(membersRequests(backend)).toEqual([A, B]);
  });

  test('cancelar a troca mantém o tenant e os dados atuais', async ({ page }) => {
    const backend = new MockBackend();
    backend.tenantMemberships = [membership(A, 'Tenant A'), membership(B, 'Tenant B')];
    await enter(page, backend);
    await page.getByRole('button', { name: 'Entrar em Tenant A' }).click();
    await page.getByRole('button', { name: 'Trocar organização' }).click();
    await page.getByRole('button', { name: 'Cancelar' }).click();
    await expect(page.getByRole('rowheader', { name: 'Operador A' })).toBeVisible();
  });

  test('com um único vínculo seleciona sozinho e ignora o identificador da URL', async ({ page }) => {
    const backend = new MockBackend();
    await enter(page, backend, `/admin/membros?organization_id=${B}`);
    await expect(page.getByRole('rowheader', { name: 'Operador A' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Escolha a organização' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Trocar organização' })).toHaveCount(0);
    expect(membersRequests(backend)).toEqual([A]);
  });

  test('vínculo bloqueado ou tenant suspenso não são opções elegíveis', async ({ page }) => {
    const backend = new MockBackend();
    backend.tenantMemberships = [membership(A, 'Tenant A', { status: 'blocked' }), membership(B, 'Tenant B', { orgStatus: 'suspended' })];
    await enter(page, backend);
    await expect(page.getByRole('alert').filter({ hasText: /nenhum acesso ativo/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Pessoas do tenant' })).toHaveCount(0);
    expect(membersRequests(backend)).toEqual([]);
  });

  test('funciona só pelo teclado e é utilizável em 360 px', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    const backend = new MockBackend();
    backend.tenantMemberships = [membership(A, 'Tenant A'), membership(B, 'Tenant B')];
    await enter(page, backend);
    await expect(page.getByRole('heading', { name: 'Escolha a organização' })).toBeFocused();
    await page.getByRole('button', { name: 'Entrar em Tenant A' }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('rowheader', { name: 'Operador A' })).toBeVisible();
    await expect(page.locator('html')).toHaveJSProperty('scrollWidth', 360);
  });

  test('a tela de escolha não possui violações críticas ou graves', async ({ page }) => {
    const backend = new MockBackend();
    backend.tenantMemberships = [membership(A, 'Tenant A'), membership(B, 'Tenant B')];
    await enter(page, backend);
    await expect(page.getByRole('heading', { name: 'Escolha a organização' })).toBeVisible();
    const scan = await new AxeBuilder({ page }).analyze();
    expect(scan.violations.filter((item) => ['critical', 'serious'].includes(item.impact ?? ''))).toEqual([]);
  });
});
