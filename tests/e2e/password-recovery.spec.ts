import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { MockBackend } from './support/mock-backend';

test.use({ serviceWorkers: 'block' });

test.describe('Recuperação de acesso (US2)', () => {
  test('solicita recuperação com confirmação genérica e sem enumerar a conta', async ({ page }) => {
    const backend = new MockBackend();
    await backend.install(page);
    await page.goto('/');

    await page.getByRole('button', { name: /esqueci minha senha/i }).click();
    await page.getByLabel('E-mail').fill('inexistente@example.invalid');
    await page.getByRole('button', { name: /enviar instruções/i }).click();

    const status = page.getByRole('status').filter({ hasText: /se existir uma conta/i });
    await expect(status).toContainText(/se existir uma conta/i);
    await expect(status).toBeFocused();
    expect(backend.calls.filter((call) => call.path === '/functions/v1/password-recovery')).toHaveLength(1);
  });

  test('link inválido ou expirado não altera senha e oferece nova solicitação', async ({ page }) => {
    const backend = new MockBackend();
    backend.recoveryUpdateOk = false;
    await backend.install(page);
    await page.goto('/recuperar-senha/confirmar');

    await page.getByLabel('Nova senha', { exact: true }).fill('Senha-Nova-Forte-1!');
    await page.getByLabel('Confirmar nova senha').fill('Senha-Nova-Forte-1!');
    await page.getByRole('button', { name: /definir nova senha/i }).click();

    const alert = page.getByRole('alert');
    await expect(alert).toContainText(/link inválido ou expirado/i);
    await expect(alert).toBeFocused();
    await page.getByRole('button', { name: /solicitar novo link/i }).click();
    await expect(page.getByRole('heading', { name: 'Recuperar acesso' })).toBeVisible();
  });

  test('sessão de recuperação válida define a nova senha uma única vez', async ({ page }) => {
    const backend = new MockBackend();
    backend.loginResponses = [backend.authenticated()];
    backend.statusResponse = backend.activeStatus();
    await backend.install(page);
    await page.goto('/');
    await page.getByLabel('E-mail').fill('admin-a@fluxid.local');
    await page.getByLabel('Senha', { exact: true }).fill('Senha-E2E-Forte-1!');
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Fundação Técnica Ativa' })).toBeVisible();

    await page.goto('/recuperar-senha/confirmar');
    // Com a página recarregada, a sessão é restaurada e o formulário pode ser remontado; preencher antes disso perde o campo.
    await expect(page.getByRole('button', { name: 'Sair' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Definir nova senha' })).toBeVisible();
    await page.getByLabel('Nova senha', { exact: true }).fill('Senha-Nova-Forte-1!');
    await page.getByLabel('Confirmar nova senha').fill('Senha-Nova-Forte-1!');
    await page.getByRole('button', { name: /definir nova senha/i }).click();

    await expect(page.getByRole('status').filter({ hasText: /senha atualizada/i })).toBeVisible();
    const updates = backend.calls.filter((call) => call.path === '/auth/v1/user');
    expect(updates.some((call) => JSON.stringify(call.body).includes('Senha-Nova-Forte-1!'))).toBe(true);
  });

  test('fluxos de solicitação e conclusão não têm violações críticas ou graves', async ({ page }) => {
    const backend = new MockBackend();
    await backend.install(page);
    await page.goto('/');
    await page.getByRole('button', { name: /esqueci minha senha/i }).click();
    const requestScan = await new AxeBuilder({ page }).analyze();
    expect(requestScan.violations.filter((item) => ['critical', 'serious'].includes(item.impact ?? ''))).toEqual([]);

    await page.goto('/recuperar-senha/confirmar');
    const confirmScan = await new AxeBuilder({ page }).analyze();
    expect(confirmScan.violations.filter((item) => ['critical', 'serious'].includes(item.impact ?? ''))).toEqual([]);
  });
});
