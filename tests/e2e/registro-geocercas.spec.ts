import { test, expect, type Page } from '@playwright/test';
import { MockBackend, type PermissionProfile } from './support/mock-backend';
import { ORG_B } from './support/mock-registry';

test.use({ serviceWorkers: 'block' });

// Os formulários de cadastro e edição abrem em modal sobre a lista ou o detalhe, que têm filtros com os mesmos rótulos.
const formulario = (page: Page) => page.getByRole('dialog');

// Spec 007, geocercas (história 3), com backend simulado: criação de círculo e polígono, "Testar um ponto", recusa de polígono
// que se cruza, aviso de sobreposição e isolamento entre organizações.
const SITE_A = '82000000-0000-4000-8000-000000000001';
const CUSTOMER_A = '81000000-0000-4000-8000-000000000001';

async function entrar(page: Page, perfil: PermissionProfile = 'cadastros-admin'): Promise<MockBackend> {
  const backend = new MockBackend().asProfile(perfil);
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

async function novoCirculo(page: Page, nome: string, lat: string, lng: string, raio: string): Promise<void> {
  await page.goto(`/geocercas/nova?unidade=${SITE_A}`);
  await expect(page.getByRole('heading', { level: 2, name: 'Cadastrar geocerca' })).toBeVisible();
  await formulario(page).getByLabel('Nome da geocerca').fill(nome);
  await formulario(page).getByLabel('Forma').selectOption('circle');
  await formulario(page).getByLabel('Latitude do centro').fill(lat);
  await formulario(page).getByLabel('Longitude do centro').fill(lng);
  await formulario(page).getByLabel('Raio (metros)').fill(raio);
  await page.getByRole('button', { name: 'Cadastrar geocerca' }).click();
}

test.describe('Geocercas: fluxo completo', () => {
  test('cria um círculo pelo detalhe da unidade e testa um ponto dentro e um fora', async ({ page }) => {
    await entrar(page);
    await page.goto(`/clientes/${CUSTOMER_A}/unidades/${SITE_A}`);
    await page.getByRole('link', { name: 'Criar a primeira geocerca' }).click();
    await formulario(page).getByLabel('Nome da geocerca').fill('Portão E2E');
    await formulario(page).getByLabel('Forma').selectOption('circle');
    await formulario(page).getByLabel('Latitude do centro').fill('-23,55');
    await formulario(page).getByLabel('Longitude do centro').fill('-46,633');
    await formulario(page).getByLabel('Raio (metros)').fill('200');
    await expect(page.getByRole('img', { name: /Círculo de 200 metros de raio/ })).toBeVisible();
    await page.getByRole('button', { name: 'Cadastrar geocerca' }).click();

    await expect(page.getByRole('heading', { level: 2, name: 'Portão E2E' })).toBeVisible();
    await expect(page.getByText('200 metros', { exact: true })).toBeVisible();

    await page.getByLabel('Latitude do ponto').fill('-23,5502');
    await page.getByLabel('Longitude do ponto').fill('-46,6331');
    await page.getByRole('button', { name: 'Testar ponto' }).click();
    await expect(page.getByText('O ponto está dentro da geocerca.', { exact: true })).toBeVisible();

    await page.getByLabel('Latitude do ponto').fill('-23,5');
    await page.getByLabel('Longitude do ponto').fill('-46,6');
    await page.getByRole('button', { name: 'Testar ponto' }).click();
    await expect(page.getByText('O ponto está fora da geocerca.', { exact: true })).toBeVisible();

    // A geocerca aparece no detalhe da unidade e na lista.
    await page.goto(`/clientes/${CUSTOMER_A}/unidades/${SITE_A}`);
    await expect(page.getByRole('link', { name: 'Portão E2E' })).toBeVisible();
    await page.goto('/geocercas');
    await expect(page.getByText('1 geocerca encontrada')).toBeVisible();
  });

  test('cria um polígono com vértices digitados, recusa o que se cruza e testa pontos', async ({ page }) => {
    await entrar(page);
    await page.goto(`/geocercas/nova?unidade=${SITE_A}`);
    await formulario(page).getByLabel('Nome da geocerca').fill('Pátio E2E');
    await formulario(page).getByLabel('Forma').selectOption('polygon');
    await page.getByRole('button', { name: 'Adicionar vértice' }).click();
    const preencher = async (pontos: string[][]): Promise<void> => {
      for (const [indice, [lat, lng]] of pontos.entries()) {
        await formulario(page).getByLabel(`Latitude do vértice ${indice + 1}`).fill(lat as string);
        await formulario(page).getByLabel(`Longitude do vértice ${indice + 1}`).fill(lng as string);
      }
    };
    // Gravata: as arestas se cruzam.
    await preencher([['0', '0'], ['1', '1'], ['0', '1'], ['1', '0']]);
    await page.getByRole('button', { name: 'Cadastrar geocerca' }).click();
    await expect(page.getByText(/As arestas do polígono se cruzam/)).toBeVisible();
    // Quadrado válido (-23,501 a -23,499).
    await preencher([['-23,501', '-46,601'], ['-23,501', '-46,599'], ['-23,499', '-46,599'], ['-23,499', '-46,601']]);
    await page.getByRole('button', { name: 'Cadastrar geocerca' }).click();
    await expect(page.getByRole('heading', { level: 2, name: 'Pátio E2E' })).toBeVisible();
    await page.getByLabel('Latitude do ponto').fill('-23,5');
    await page.getByLabel('Longitude do ponto').fill('-46,6');
    await page.getByRole('button', { name: 'Testar ponto' }).click();
    await expect(page.getByText('O ponto está dentro da geocerca.', { exact: true })).toBeVisible();
    await page.getByLabel('Longitude do ponto').fill('-46,58');
    await page.getByRole('button', { name: 'Testar ponto' }).click();
    await expect(page.getByText('O ponto está fora da geocerca.', { exact: true })).toBeVisible();
  });

  test('sobreposição avisa com o nome da outra geocerca e a nova fica salva', async ({ page }) => {
    const backend = await entrar(page);
    await novoCirculo(page, 'Doca 1', '-23,6', '-46,7', '300');
    await expect(page.getByRole('heading', { level: 2, name: 'Doca 1' })).toBeVisible();
    await novoCirculo(page, 'Doca 2', '-23,6', '-46,699', '300');
    await expect(page.getByText('Sobreposição')).toBeVisible();
    await expect(formulario(page).getByRole('link', { name: 'Doca 1' })).toBeVisible();
    await page.getByRole('link', { name: 'Abrir a geocerca' }).click();
    await expect(page.getByRole('heading', { level: 2, name: 'Doca 2' })).toBeVisible();
    expect(backend.registry.geofences.map((geofence) => geofence.name)).toEqual(['Doca 1', 'Doca 2']);
  });

  test('raio fora dos limites e nome repetido são recusados junto dos campos', async ({ page }) => {
    await entrar(page);
    await novoCirculo(page, 'Portão', '-23,55', '-46,63', '24');
    await expect(page.getByText('Informe um raio inteiro de 25 m a 5000 m.')).toBeVisible();
    await expect(page.getByLabel('Raio (metros)')).toBeFocused();
    await page.getByLabel('Raio (metros)').fill('25');
    await page.getByRole('button', { name: 'Cadastrar geocerca' }).click();
    await expect(page.getByRole('heading', { level: 2, name: 'Portão' })).toBeVisible();
    await novoCirculo(page, 'portão', '-23,56', '-46,64', '100');
    await expect(page.getByText('Já existe uma geocerca com este nome nesta unidade.')).toBeVisible();
  });

  test('edita a forma: de círculo para polígono', async ({ page }) => {
    await entrar(page);
    await novoCirculo(page, 'Mutável', '-23,55', '-46,63', '100');
    await page.getByRole('link', { name: 'Editar geocerca' }).click();
    await expect(page.getByRole('heading', { level: 2, name: 'Editar geocerca' })).toBeVisible();
    await formulario(page).getByLabel('Forma').selectOption('polygon');
    for (const [indice, [lat, lng]] of [['0', '0'], ['0', '1'], ['1', '1']].entries()) {
      await formulario(page).getByLabel(`Latitude do vértice ${indice + 1}`).fill(lat as string);
      await formulario(page).getByLabel(`Longitude do vértice ${indice + 1}`).fill(lng as string);
    }
    await page.getByRole('button', { name: 'Salvar alterações' }).click();
    await expect(page.getByRole('heading', { level: 2, name: 'Mutável' })).toBeVisible();
    await expect(page.getByText('Vértices', { exact: true })).toBeVisible();
  });

  test('o Tenant B não vê geocerca do Tenant A e a rota de outra organização responde "não encontrada"', async ({ page }) => {
    const backend = await entrar(page);
    await novoCirculo(page, 'Só do A', '-23,55', '-46,63', '100');
    await expect(page.getByRole('heading', { level: 2, name: 'Só do A' })).toBeVisible();
    backend.registry.geofences.push({
      id: '84000000-0000-4000-8000-000000009999', organization_id: ORG_B, site_id: '82000000-0000-4000-8000-000000000501', name: 'Só do B', shape: 'circle',
      center: { lat: 0, lng: 0 }, radius_m: 100, vertices: [], status: 'active', version: 1,
    });
    await page.goto('/geocercas');
    await expect(page.getByRole('link', { name: 'Só do A' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Só do B' })).toHaveCount(0);
    await page.goto('/geocercas/84000000-0000-4000-8000-000000009999');
    await expect(page.getByText('Geocerca não encontrada')).toBeVisible();
  });

  test('o auditor consulta e não encontra nenhuma ação de escrita', async ({ page }) => {
    await entrar(page, 'cadastros-auditor');
    await page.goto('/geocercas/nova?unidade=' + SITE_A);
    await expect(page.getByRole('alert')).toContainText(/não tem permissão/i);
    await expect(formulario(page).getByLabel('Nome da geocerca')).toHaveCount(0);
    await page.goto(`/clientes/${CUSTOMER_A}/unidades/${SITE_A}`);
    await expect(page.getByRole('heading', { level: 2, name: 'Matriz' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Criar a primeira geocerca' })).toHaveCount(0);
  });

  test('o formulário do círculo é operável só com o teclado', async ({ page }) => {
    await entrar(page);
    await page.goto(`/geocercas/nova?unidade=${SITE_A}`);
    await formulario(page).getByLabel('Nome da geocerca').focus();
    await page.keyboard.type('Teclado');
    await page.keyboard.press('Tab');
    await page.keyboard.press('ArrowDown');
    await expect(formulario(page).getByLabel('Forma')).toHaveValue('circle');
    await page.keyboard.press('Tab');
    await page.keyboard.type('-23,55');
    await page.keyboard.press('Tab');
    await page.keyboard.type('-46,63');
    await page.keyboard.press('Tab');
    await page.keyboard.type('150');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { level: 2, name: 'Teclado' })).toBeVisible();
  });

  test('a página em 360 px não rola na horizontal', async ({ page }) => {
    await entrar(page);
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto(`/geocercas/nova?unidade=${SITE_A}`);
    await formulario(page).getByLabel('Forma').selectOption('polygon');
    await expect(page.getByRole('button', { name: 'Adicionar vértice' })).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  });
});
