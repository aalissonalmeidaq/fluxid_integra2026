import { test, expect, type Page } from '@playwright/test';
import { MockBackend } from './support/mock-backend';

test.use({ serviceWorkers: 'block' });

// Spec 007: cadastro e edição abrem em modal por cima da lista ou do detalhe. O modal abre sem recarregar a página, a tela de trás
// continua montada, Escape e Voltar fecham, o endereço do modal vale como link direto e salvar mostra o resultado.
const CLIENTE = '81000000-0000-4000-8000-000000000001';
const VEICULO = '85000000-0000-4000-8000-000000000001';

async function entrar(page: Page): Promise<MockBackend> {
  const backend = new MockBackend().asProfile('cadastros-admin');
  backend.loginResponses = [backend.authenticated()];
  backend.statusResponse = backend.activeStatus('aal1');
  await backend.install(page);
  await page.goto('/');
  await page.getByLabel('E-mail').fill('admin-a@example.invalid');
  await page.getByLabel('Senha', { exact: true }).fill('Local-only-002!');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Visão geral' })).toBeVisible();
  return backend;
}

test.describe('Formulários de cadastro em modal', () => {
  test('abre por cima da lista sem recarregar, fecha com Escape e devolve o foco ao botão', async ({ page }) => {
    await entrar(page);
    await page.goto('/veiculos');
    const lista = page.getByRole('heading', { level: 2, name: 'Veículos da organização' });
    await expect(lista).toBeVisible();
    // Marca a página: se ela recarregasse, a marca sumiria.
    await page.evaluate(() => { (window as unknown as { marca: string }).marca = 'mesma-pagina'; });

    const abrir = page.getByRole('link', { name: 'Cadastrar veículo' }).first();
    // Pelo teclado: o Safari não dá foco a link clicado, e o foco devolvido é o do controle que abriu o modal.
    await abrir.focus();
    await page.keyboard.press('Enter');
    const modal = page.getByRole('dialog', { name: 'Cadastrar veículo' });
    await expect(modal).toBeVisible();
    await expect(page).toHaveURL(/\/veiculos\/novo$/);
    await expect(lista).toBeVisible();
    expect(await page.evaluate(() => (window as unknown as { marca?: string }).marca)).toBe('mesma-pagina');
    // A tela de trás não recebe foco nem leitura enquanto o modal está aberto.
    await expect(page.locator('[inert]').getByRole('heading', { level: 2, name: 'Veículos da organização' })).toHaveCount(1);

    await page.keyboard.press('Escape');
    await expect(modal).toHaveCount(0);
    await expect(page).toHaveURL(/\/veiculos$/);
    await expect(abrir).toBeFocused();
    expect(await page.evaluate(() => (window as unknown as { marca?: string }).marca)).toBe('mesma-pagina');
  });

  test('Cancelar e o botão Voltar do navegador fecham o modal', async ({ page }) => {
    await entrar(page);
    await page.goto('/motoristas');
    await page.getByRole('link', { name: 'Cadastrar motorista' }).first().click();
    const modal = page.getByRole('dialog', { name: 'Cadastrar motorista' });
    await expect(modal).toBeVisible();
    await modal.getByRole('button', { name: 'Cancelar' }).click();
    await expect(modal).toHaveCount(0);
    await expect(page).toHaveURL(/\/motoristas$/);

    await page.getByRole('link', { name: 'Cadastrar motorista' }).first().click();
    await expect(modal).toBeVisible();
    await page.goBack();
    await expect(modal).toHaveCount(0);
    await expect(page).toHaveURL(/\/motoristas$/);
  });

  test('o endereço do modal funciona como link direto: a lista aparece por trás e fechar leva à lista', async ({ page }) => {
    await entrar(page);
    await page.goto('/clientes/novo');
    await expect(page.getByRole('dialog', { name: 'Cadastrar cliente' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'Clientes da organização' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page).toHaveURL(/\/clientes$/);
  });

  test('editar abre o modal sobre o detalhe; salvar fecha e o detalhe mostra os dados novos', async ({ page }) => {
    await entrar(page);
    await page.goto(`/veiculos/${VEICULO}`);
    await expect(page.getByRole('heading', { level: 2, name: 'Veículo ABC-1234' })).toBeVisible();
    await page.getByRole('link', { name: 'Editar veículo' }).click();
    const modal = page.getByRole('dialog', { name: 'Editar veículo' });
    await expect(modal).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/veiculos/${VEICULO}/editar$`));
    await modal.getByLabel('Marca').fill('Marca Nova');
    await modal.getByRole('button', { name: 'Salvar alterações' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page).toHaveURL(new RegExp(`/veiculos/${VEICULO}$`));
    await expect(page.getByText('Marca Nova', { exact: true })).toBeVisible();
  });

  test('cadastrar abre o detalhe do que foi criado; o erro de validação fica no modal, com o foco no campo', async ({ page }) => {
    await entrar(page);
    await page.goto('/veiculos');
    await page.getByRole('link', { name: 'Cadastrar veículo' }).first().click();
    const modal = page.getByRole('dialog', { name: 'Cadastrar veículo' });
    await modal.getByRole('button', { name: 'Cadastrar veículo' }).click();
    await expect(modal).toBeVisible();
    await expect(modal.getByLabel('Placa')).toBeFocused();

    await modal.getByLabel('Placa').fill('MOD-1A23');
    await modal.getByLabel('Tipo de veículo').selectOption('van');
    await modal.getByLabel('Capacidade em cilindros').fill('12');
    await modal.getByRole('button', { name: 'Cadastrar veículo' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('heading', { level: 2, name: /Veículo MOD-?1A23/ })).toBeVisible();
  });

  test('o botão de salvar fica à vista num formulário longo e o modal cabe em 360 px sem rolagem horizontal', async ({ page }) => {
    await entrar(page);
    await page.goto(`/clientes/${CLIENTE}/unidades/nova`);
    const modal = page.getByRole('dialog', { name: 'Cadastrar unidade' });
    await expect(modal).toBeVisible();
    await expect(modal.getByRole('button', { name: 'Cadastrar unidade' })).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  });
});
