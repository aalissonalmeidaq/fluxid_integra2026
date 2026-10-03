import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { MockBackend } from './support/mock-backend';

test.use({ serviceWorkers: 'block' });

// PNG 1x1 válido (assinatura, IHDR, IDAT e IEND), sem animação.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><script>alert(1)</script></svg>');

async function enter(page: Page, backend: MockBackend, path = '/perfil'): Promise<void> {
  backend.loginResponses = [backend.authenticated()];
  backend.statusResponse = backend.activeStatus('aal1');
  await backend.install(page);
  await page.goto('/');
  await page.getByLabel('E-mail').fill('operador-a@example.invalid');
  await page.getByLabel('Senha', { exact: true }).fill('Local-only-002!');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Minha conta' })).toBeVisible();
  await page.goto(path);
}

const upload = (page: Page, file: { name: string; mimeType: string; buffer: Buffer }) => page.getByLabel('Escolher nova foto').setInputFiles(file);

test.describe('Perfil e avatar', () => {
  test('atualiza o nome e envia uma foto válida em 360 px', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    const backend = new MockBackend();
    await enter(page, backend);
    await expect(page.getByRole('heading', { name: 'Meu perfil' })).toBeVisible();
    await expect(page.getByLabel('Nome de exibição')).toHaveValue('Ana Souza');
    await expect(page.getByText('Nenhuma foto definida.')).toBeVisible();

    await page.getByLabel('Nome de exibição').fill('Ana Maria Souza');
    await page.getByRole('button', { name: 'Salvar nome' }).click();
    await expect(page.getByRole('status').filter({ hasText: /perfil atualizado/i })).toBeVisible();

    await upload(page, { name: 'foto.png', mimeType: 'image/png', buffer: PNG });
    await expect(page.getByRole('status').filter({ hasText: /foto atualizada/i })).toBeVisible();
    await expect(page.getByRole('img', { name: /foto de perfil de ana maria souza/i })).toBeVisible();
    expect(backend.avatarUploads).toEqual([{ contentType: 'image/png', size: PNG.length }]);
    await expect(page.locator('html')).toHaveJSProperty('scrollWidth', 360);
  });

  test('a foto é servida por URL assinada e curta, nunca por URL pública', async ({ page }) => {
    const backend = new MockBackend();
    backend.profile.avatar_path = '10000000-0000-0000-0000-000000000004/90000000-0000-0000-0000-000000000009.png';
    await enter(page, backend);
    const image = page.getByRole('img', { name: /foto de perfil/i });
    await expect(image).toBeVisible();
    const source = await image.getAttribute('src');
    expect(source).toContain('/storage/v1/object/sign/avatars/');
    expect(source).toContain('token=');
    expect(source).not.toContain('/object/public/');
  });

  test.describe('arquivos recusados antes do envio', () => {
    test('SVG não é aceito e nada é enviado', async ({ page }) => {
      const backend = new MockBackend();
      await enter(page, backend);
      await upload(page, { name: 'foto.svg', mimeType: 'image/svg+xml', buffer: SVG });
      await expect(page.getByRole('alert').filter({ hasText: /formato não aceito/i })).toBeVisible();
      expect(backend.avatarUploads).toEqual([]);
    });

    test('extensão enganosa não é aceita', async ({ page }) => {
      const backend = new MockBackend();
      await enter(page, backend);
      await upload(page, { name: 'foto.svg', mimeType: 'image/png', buffer: PNG });
      await expect(page.getByRole('alert').filter({ hasText: /formato não aceito/i })).toBeVisible();
      expect(backend.avatarUploads).toEqual([]);
    });

    test('conteúdo que não é imagem, mesmo com nome e tipo permitidos, não é aceito', async ({ page }) => {
      const backend = new MockBackend();
      await enter(page, backend);
      await upload(page, { name: 'foto.png', mimeType: 'image/png', buffer: SVG });
      await expect(page.getByRole('alert').filter({ hasText: /não parece uma imagem válida/i })).toBeVisible();
      expect(backend.avatarUploads).toEqual([]);
    });

    test('arquivo acima de 2 MB não é aceito', async ({ page }) => {
      const backend = new MockBackend();
      await enter(page, backend);
      const big = Buffer.concat([PNG, Buffer.alloc(2 * 1024 * 1024)]);
      await upload(page, { name: 'foto.png', mimeType: 'image/png', buffer: big });
      await expect(page.getByRole('alert').filter({ hasText: /maior que 2 mb/i })).toBeVisible();
      expect(backend.avatarUploads).toEqual([]);
    });
  });

  test('respostas do servidor são anunciadas sem simular sucesso', async ({ page }) => {
    const backend = new MockBackend();
    backend.avatarBehavior = 'rate';
    await enter(page, backend);
    await upload(page, { name: 'foto.png', mimeType: 'image/png', buffer: PNG });
    await expect(page.getByRole('alert').filter({ hasText: /muitas trocas/i })).toBeVisible();
    await expect(page.getByText(/foto atualizada/i)).toHaveCount(0);
  });

  test('remove a foto e volta às iniciais', async ({ page }) => {
    const backend = new MockBackend();
    backend.profile.avatar_path = '10000000-0000-0000-0000-000000000004/90000000-0000-0000-0000-000000000009.png';
    await enter(page, backend);
    await page.getByRole('button', { name: 'Remover foto' }).click();
    await expect(page.getByRole('status').filter({ hasText: /foto removida/i })).toBeVisible();
    await expect(page.getByRole('img', { name: /foto de perfil/i })).toHaveCount(0);
    await expect(page.getByText('Nenhuma foto definida.')).toBeVisible();
  });

  test('a página exige sessão: sem login mostra a entrada e não consulta o perfil', async ({ page }) => {
    const backend = new MockBackend();
    await backend.install(page);
    await page.goto('/perfil');
    await expect(page.getByRole('heading', { name: 'Bem-vindo de volta' })).toBeVisible();
    expect(backend.calls.filter((call) => call.path === '/rest/v1/profiles')).toEqual([]);
  });

  test('não possui violações críticas ou graves de acessibilidade, com e sem erro na tela', async ({ page }) => {
    const backend = new MockBackend();
    await enter(page, backend);
    await expect(page.getByRole('heading', { name: 'Meu perfil' })).toBeVisible();
    const blocking = async () => (await new AxeBuilder({ page }).analyze()).violations.filter((item) => ['critical', 'serious'].includes(item.impact ?? ''));
    expect(await blocking()).toEqual([]);
    await upload(page, { name: 'foto.svg', mimeType: 'image/svg+xml', buffer: SVG });
    await expect(page.getByRole('alert')).toBeVisible();
    expect(await blocking()).toEqual([]);
  });

  test('funciona só pelo teclado', async ({ page }) => {
    const backend = new MockBackend();
    await enter(page, backend);
    await page.getByLabel('Nome de exibição').focus();
    await page.getByLabel('Nome de exibição').fill('Ana Teclado');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('status').filter({ hasText: /perfil atualizado/i })).toBeVisible();
    await expect(page.getByLabel('Nome de exibição')).toHaveValue('Ana Teclado');
  });
});
