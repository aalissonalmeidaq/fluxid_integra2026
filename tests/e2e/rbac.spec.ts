import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { MockBackend } from './support/mock-backend';

test.use({ serviceWorkers: 'block' });

const TENANT = '20000000-0000-0000-0000-00000000000a';

async function enter(page: Page, backend: MockBackend): Promise<void> {
  backend.loginResponses = [backend.authenticated()];
  backend.statusResponse = backend.activeStatus('aal2');
  await backend.install(page);
  await page.goto('/');
  await page.getByLabel('E-mail').fill('admin-a@example.invalid');
  await page.getByLabel('Senha', { exact: true }).fill('Local-only-002!');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Sair' })).toBeVisible();
  await page.goto(`/admin/papeis?organization_id=${TENANT}`);
}

test.describe('Papéis, permissões e atribuições do tenant', () => {
  test('cria papel personalizado e o atribui a uma pessoa em 360 px', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    const backend = new MockBackend();
    await enter(page, backend);
    await expect(page.getByRole('heading', { name: 'Papéis e permissões' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Administrador do tenant' })).toBeVisible();
    await expect(page.getByText('Papel preestabelecido: não pode ser alterado.').first()).toBeVisible();

    await page.getByRole('button', { name: 'Novo papel' }).click();
    await page.getByLabel('Nome do papel').fill('Auditor interno');
    await page.getByLabel('Descrição').fill('Consulta a auditoria');
    await page.getByRole('checkbox', { name: /audit\.read/ }).check();
    await expect(page.getByRole('checkbox', { name: /platform\.manage/ })).toBeDisabled();
    await page.getByLabel('Justificativa do papel').fill('Papel aprovado pela diretoria');
    await page.getByRole('button', { name: 'Salvar papel' }).click();
    await expect(page.getByRole('status').filter({ hasText: /papel salvo/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Auditor interno' })).toBeVisible();

    await page.getByRole('button', { name: 'Atribuir papel a Operador A' }).click();
    await page.getByLabel('Papel', { exact: true }).selectOption({ label: 'Auditor interno' });
    await page.getByLabel('Justificativa da alteração').fill('Atribuição aprovada pela gestão');
    await page.getByRole('button', { name: 'Confirmar atribuição' }).click();
    await expect(page.getByRole('status').filter({ hasText: /papel atribuído/i })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Remover Auditor interno de Operador A' })).toBeVisible();
    await expect(page.locator('html')).toHaveJSProperty('scrollWidth', 360);
  });

  test('permissão não delegável fica desabilitada e explicada em texto', async ({ page }) => {
    const backend = new MockBackend();
    await enter(page, backend);
    await page.getByRole('button', { name: 'Novo papel' }).click();
    await expect(page.getByRole('checkbox', { name: /platform\.manage/ })).toBeDisabled();
    await expect(page.getByText('não delegável')).toBeVisible();
  });

  test('sem autorização mostra acesso negado e nenhum papel', async ({ page }) => {
    const backend = new MockBackend();
    backend.accessDenied = true;
    await enter(page, backend);
    await expect(page.getByRole('alert').filter({ hasText: /acesso negado/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Administrador do tenant' })).toHaveCount(0);
  });

  test('não possui violações críticas ou graves de acessibilidade, inclusive com o formulário e o diálogo abertos', async ({ page }) => {
    const backend = new MockBackend();
    await enter(page, backend);
    await expect(page.getByRole('heading', { name: 'Papéis e permissões' })).toBeVisible();
    const blocking = async () => (await new AxeBuilder({ page }).analyze()).violations.filter((item) => ['critical', 'serious'].includes(item.impact ?? ''));
    expect(await blocking()).toEqual([]);
    await page.getByRole('button', { name: 'Novo papel' }).click();
    expect(await blocking()).toEqual([]);
    await page.getByRole('button', { name: 'Atribuir papel a Operador A' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    expect(await blocking()).toEqual([]);
  });

  test('o diálogo é operável só pelo teclado e devolve o foco ao acionador', async ({ page }) => {
    const backend = new MockBackend();
    await enter(page, backend);
    const trigger = page.getByRole('button', { name: 'Atribuir papel a Operador A' });
    await trigger.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByLabel('Papel', { exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });
});
