import { test, expect, type Page } from '@playwright/test';
import { MockBackend, type PermissionProfile } from './support/mock-backend';
import { installFieldReaders, type FieldReaders } from './support/mock-field-reading';

test.use({ serviceWorkers: 'block' });

// Spec 009, US3: consultar um cilindro lendo o código ("Ler cilindro"), com backend simulado e leitores simulados. Cobre o identificador
// ativo, o desativado, o cilindro inativo, o código que não existe ou é de outra organização, o auditor (só lê, sem ação de escrita) e o
// aparelho sem câmera nem NFC. A leitura real em aparelho Android é conferida na validação humana (quickstart.md).
interface Setup { backend: MockBackend; readers: FieldReaders }

async function entrar(page: Page, perfil: PermissionProfile, leitores: { camera?: boolean; nfc?: boolean } = { camera: true }): Promise<Setup> {
  const readers = await installFieldReaders(page, leitores);
  const backend = new MockBackend().asProfile(perfil);
  backend.loginResponses = [backend.authenticated()];
  backend.statusResponse = backend.activeStatus('aal1');
  await backend.install(page);
  await page.goto('/visao-geral');
  await page.getByLabel('E-mail').fill('admin-a@example.invalid');
  await page.getByLabel('Senha', { exact: true }).fill('Local-only-002!');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Visão geral' })).toBeVisible();
  return { backend, readers };
}

const leitor = (page: Page) => page.getByRole('dialog', { name: 'Ler cilindro' });

test.describe('Consulta por leitura', () => {
  test('lê um identificador ativo e abre o detalhe do cilindro certo, dentro do app', async ({ page }) => {
    const { backend, readers } = await entrar(page, 'cilindros-admin');
    await page.goto('/cilindros');
    await page.getByRole('button', { name: 'Ler cilindro' }).click();
    await expect(leitor(page)).toBeVisible();
    await readers.scan('QR-003');
    const serial = backend.cylinders.cylinders.find((c) => c.serial_number === 'CIL-003')!.serial_number;
    await expect(page.getByRole('heading', { level: 2, name: `Cilindro ${serial}` })).toBeVisible();
    await expect(page).toHaveURL(/\/cilindros\/[0-9a-f-]+$/);
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('o cilindro inativo abre o detalhe, que informa a situação', async ({ page }) => {
    const { backend, readers } = await entrar(page, 'cilindros-admin');
    const inativo = backend.cylinders.cylinders.find((c) => c.status === 'inactive')!;
    const identificador = backend.cylinders.identifiers.find((i) => i.cylinder_id === inativo.id && i.status === 'active')!;
    await page.goto('/cilindros');
    await page.getByRole('button', { name: 'Ler cilindro' }).click();
    await readers.scan(identificador.value);
    await expect(page.getByRole('heading', { level: 2, name: `Cilindro ${inativo.serial_number}` })).toBeVisible();
    await expect(page.getByText('Inativo').first()).toBeVisible();
  });

  test('o identificador desativado diz a quem valia, e o código inexistente ou de outra organização, a mesma frase', async ({ page }) => {
    const { readers } = await entrar(page, 'cilindros-admin');
    await page.goto('/cilindros');
    await page.getByRole('button', { name: 'Ler cilindro' }).click();
    await readers.scan('NFC-ANTIGA');
    await expect(leitor(page).getByText(/Este identificador foi desativado\. Valia para o cilindro CIL-006\./)).toBeVisible();
    await readers.scan('QR-NAO-EXISTE');
    await expect(leitor(page).getByText('Cilindro não encontrado.')).toBeVisible();
    // O valor QR-B-1 só existe no Tenant B: para este tenant a resposta é a mesma de código inexistente.
    await readers.scan('QR-B-1');
    await expect(leitor(page).getByText('Cilindro não encontrado.')).toBeVisible();
    await expect(page).toHaveURL(/\/cilindros$/);
  });

  test('o auditor lê e abre o cilindro, mas não recebe nenhuma ação de escrita', async ({ page }) => {
    const { readers } = await entrar(page, 'cilindros-auditor');
    await page.goto('/cilindros');
    await expect(page.getByRole('link', { name: 'Cadastrar cilindro' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Ler cilindro' }).click();
    await readers.scan('QR-003');
    await expect(page.getByRole('heading', { level: 2, name: /^Cilindro CIL-003$/ })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Ler cilindro' })).toBeVisible();
    for (const name of ['Inativar cilindro', 'Reativar cilindro']) await expect(page.getByRole('button', { name })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Editar', exact: true })).toHaveCount(0);
  });

  test('aparelho sem câmera nem NFC: o botão não aparece e a busca por texto segue completa', async ({ page }) => {
    await entrar(page, 'cilindros-admin', {});
    await page.goto('/cilindros');
    await expect(page.getByLabel('Buscar por identificador ou número de série')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Ler cilindro' })).toHaveCount(0);
    await page.getByLabel('Buscar por identificador ou número de série').fill('QR-003');
    await page.getByRole('button', { name: 'Buscar', exact: true }).click();
    await expect(page.getByRole('link', { name: 'CIL-003' })).toBeVisible();
  });

  test('sem permissão de ver cilindros a leitura não é oferecida', async ({ page }) => {
    await entrar(page, 'cadastros-admin');
    await page.goto('/cilindros');
    await expect(page.getByRole('main')).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'Cilindros da organização' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Ler cilindro' })).toHaveCount(0);
  });
});
