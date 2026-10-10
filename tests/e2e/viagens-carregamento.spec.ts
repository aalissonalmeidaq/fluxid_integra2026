import { test, expect, type Page } from '@playwright/test';
import { MockBackend, type PermissionProfile } from './support/mock-backend';
import { ORG_A } from './support/mock-registry';
import { seedEligibleCylinders } from './support/mock-trips-plan';

test.use({ serviceWorkers: 'block' });

// Spec 008, US2: conferir o carregamento e iniciar a viagem, com backend simulado. Cobre a conferência manual, o início bloqueado
// enquanto falta conferir, a retirada com exceção, a CNH vencida e o uso só com teclado. As revalidações de verdade e a concorrência
// de veículo e motorista são provadas no pgTAP e nos testes `.live`.
async function entrar(page: Page, perfil: PermissionProfile = 'viagens-admin'): Promise<MockBackend> {
  const backend = new MockBackend().asProfile(perfil);
  backend.loginResponses = [backend.authenticated()];
  backend.statusResponse = backend.activeStatus('aal1');
  seedEligibleCylinders(backend.trips);
  await backend.install(page);
  await page.goto('/');
  await page.getByLabel('E-mail').fill('admin-a@example.invalid');
  await page.getByLabel('Senha', { exact: true }).fill('Local-only-002!');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Visão geral' })).toBeVisible();
  return backend;
}

// Planeja direto no simulado (o planejamento tem o seu E2E) e devolve o id da viagem.
function planejar(backend: MockBackend, seriais: string[], motorista = 'Ana Condutora'): string {
  const cilindros = seriais.map((serial) => backend.cylinders.cylinders.find((c) => c.serial_number === serial)!.id);
  const resposta = backend.trips.handle('manage', {
    operation: 'create_trip', organization_id: ORG_A, request_id: crypto.randomUUID(), planned_date: backend.trips.today(),
    vehicle_id: backend.registry.vehicles.find((v) => v.plate === 'ABC1234')!.id, driver_id: backend.registry.drivers.find((d) => d.full_name === motorista)!.id,
    stops: [{ site_id: backend.registry.sites[0]!.id, cylinder_ids: cilindros.slice(0, 2) }, { site_id: backend.registry.sites[1]!.id, cylinder_ids: cilindros.slice(2) }],
  }, () => true);
  expect(resposta.status, JSON.stringify(resposta.json)).toBe(200);
  return String(resposta.json.trip_id);
}

async function carregando(page: Page, id: string): Promise<void> {
  await page.goto(`/viagens/${id}`);
  await page.getByRole('button', { name: 'Iniciar carregamento' }).click();
  await expect(page.getByRole('heading', { name: 'Conferência da carga' })).toBeVisible();
}

const semRolagemHorizontal = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

test.describe('Carregamento e início da viagem', () => {
  test('confere dois de três, vê o início bloqueado com o motivo, confere o terceiro e inicia', async ({ page }) => {
    const backend = await entrar(page);
    const id = planejar(backend, ['CIL-006', 'CIL-007', 'CIL-008']);
    await carregando(page, id);
    await expect(page.getByText('0 de 3 conferidos')).toBeVisible();

    await page.getByRole('button', { name: 'Conferir CIL-006' }).click();
    await expect(page.getByText('1 de 3 conferidos')).toBeVisible();
    await page.getByRole('button', { name: 'Conferir CIL-007' }).click();
    await expect(page.getByText('2 de 3 conferidos')).toBeVisible();

    const iniciar = page.getByRole('button', { name: 'Iniciar viagem' });
    await expect(iniciar).toBeDisabled();
    await expect(page.getByText('Falta 1 cilindro para conferir.').or(page.getByText('Faltam 1 cilindro para conferir.'))).toBeVisible();

    await page.getByRole('button', { name: 'Conferir CIL-008' }).click();
    await expect(page.getByText('3 de 3 conferidos')).toBeVisible();
    await expect(iniciar).toBeEnabled();
    await iniciar.click();

    await expect(page.getByText('Situação da viagem: Em andamento')).toBeVisible();
    await expect(page.getByText('Situação do cilindro na viagem: Em trânsito')).toHaveCount(3);
    await expect(page.getByText('Bloqueio: Bloqueado (lógico)')).toHaveCount(3);
    await expect(page.getByText('Custódia: Em trânsito')).toHaveCount(3);
    await expect(page.getByText(/Fase 6/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Iniciar viagem' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Conferência da carga' })).toHaveCount(0);
    expect(backend.trips.trips[0]!.status).toBe('in_progress');
  });

  test('desfaz a conferência e desfaz o carregamento enquanto nada foi conferido', async ({ page }) => {
    const backend = await entrar(page);
    const id = planejar(backend, ['CIL-006', 'CIL-007', 'CIL-008']);
    await carregando(page, id);
    await page.getByRole('button', { name: 'Conferir CIL-006' }).click();
    await expect(page.getByText('1 de 3 conferidos')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Desfazer carregamento' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Desfazer a conferência de CIL-006' }).click();
    await expect(page.getByText('0 de 3 conferidos')).toBeVisible();
    await page.getByRole('button', { name: 'Desfazer carregamento' }).click();
    await expect(page.getByText('Situação da viagem: Planejada')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Iniciar carregamento' })).toBeVisible();
  });

  test('retira um cilindro com justificativa e o início leva só o que foi conferido', async ({ page }) => {
    const backend = await entrar(page);
    const id = planejar(backend, ['CIL-006', 'CIL-007', 'CIL-008']);
    await carregando(page, id);
    const retirar = page.getByRole('button', { name: 'Retirar CIL-007 da viagem' });
    await retirar.click();
    const dialogo = page.getByRole('dialog', { name: 'Retirar CIL-007 da viagem' });
    await dialogo.getByRole('button', { name: 'Retirar da viagem' }).click();
    await expect(dialogo.getByText(/Explique o motivo com pelo menos 5 caracteres/)).toBeVisible();
    await dialogo.getByLabel('Justificativa').fill('Cilindro avariado no pátio');
    await dialogo.getByRole('button', { name: 'Retirar da viagem' }).click();
    await expect(dialogo).toHaveCount(0);
    await expect(page.getByText('0 de 2 conferidos')).toBeVisible();
    await page.getByRole('button', { name: 'Conferir CIL-006' }).click();
    await page.getByRole('button', { name: 'Conferir CIL-008' }).click();
    await page.getByRole('button', { name: 'Iniciar viagem' }).click();
    await expect(page.getByText('Situação da viagem: Em andamento')).toBeVisible();
    await expect(page.getByText('Situação do cilindro na viagem: Retirado')).toBeVisible();
    await expect(page.getByText('Motivo: Cilindro avariado no pátio')).toBeVisible();
    expect(backend.trips.items.filter((item) => item.item_status === 'in_transit')).toHaveLength(2);
  });

  test('quem não tem a exceção não vê a retirada', async ({ page }) => {
    const backend = await entrar(page, 'viagens-gestor');
    const id = planejar(backend, ['CIL-006', 'CIL-007', 'CIL-008']);
    await carregando(page, id);
    await expect(page.getByRole('button', { name: 'Conferir CIL-006' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Retirar/ })).toHaveCount(0);
  });

  test('o auditor só vê: nenhum botão de operação', async ({ page }) => {
    const backend = await entrar(page, 'viagens-auditor');
    const id = planejar(backend, ['CIL-006', 'CIL-007', 'CIL-008']);
    await page.goto(`/viagens/${id}`);
    await expect(page.getByRole('heading', { level: 2, name: 'Viagem n.º 1' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Iniciar carregamento' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Editar viagem' })).toHaveCount(0);
  });

  test('CNH vencida impede iniciar, explica e nada muda', async ({ page }) => {
    const backend = await entrar(page);
    const id = planejar(backend, ['CIL-006', 'CIL-007', 'CIL-008'], 'Carla Condutora');
    await page.goto(`/viagens/${id}`);
    await expect(page.getByText(/CNH do motorista está vencida: a viagem não poderá ser iniciada/)).toBeVisible();
    await page.getByRole('button', { name: 'Iniciar carregamento' }).click();
    for (const serial of ['CIL-006', 'CIL-007', 'CIL-008']) await page.getByRole('button', { name: `Conferir ${serial}` }).click();
    await page.getByRole('button', { name: 'Iniciar viagem' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'CNH vencida' })).toContainText('A CNH do motorista venceu');
    await expect(page.getByText('Situação da viagem: Carregando')).toBeVisible();
    expect(backend.cylinders.cylinders.filter((c) => ['CIL-006', 'CIL-007', 'CIL-008'].includes(c.serial_number)).every((c) => c.stock_status === 'in_stock')).toBe(true);
  });

  test('o veículo ocupado por outra viagem carregando é recusado, com a viagem que o ocupa', async ({ page }) => {
    const backend = await entrar(page);
    const primeira = planejar(backend, ['CIL-006', 'CIL-007', 'CIL-008']);
    const segunda = planejar(backend, ['CIL-009', 'CIL-010', 'CIL-011']);
    await carregando(page, primeira);
    await page.goto(`/viagens/${segunda}`);
    await page.getByRole('button', { name: 'Iniciar carregamento' }).click();
    const alerta = page.getByRole('alert').filter({ hasText: 'Em outra viagem' });
    await expect(alerta).toContainText('O veículo já está na viagem n.º 1');
    await expect(alerta.getByRole('link', { name: 'Abrir a viagem n.º 1' })).toHaveAttribute('href', `/viagens/${primeira}`);
    await expect(page.getByText('Situação da viagem: Planejada')).toBeVisible();
  });

  test('só com teclado: conferir com Enter, retirar pelo diálogo e Escape devolve o foco', async ({ page }) => {
    const backend = await entrar(page);
    const id = planejar(backend, ['CIL-006', 'CIL-007', 'CIL-008']);
    await page.goto(`/viagens/${id}`);
    const comecar = page.getByRole('button', { name: 'Iniciar carregamento' });
    await comecar.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { name: 'Conferência da carga' })).toBeVisible();
    const conferir = page.getByRole('button', { name: 'Conferir CIL-006' });
    await conferir.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByText('1 de 3 conferidos')).toBeVisible();
    const retirar = page.getByRole('button', { name: 'Retirar CIL-007 da viagem' });
    await retirar.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog', { name: 'Retirar CIL-007 da viagem' })).toBeVisible();
    await expect(page.getByLabel('Justificativa')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(retirar).toBeFocused();
  });

  test('resultado de ação vai a uma única região de status e a tela não rola na horizontal', async ({ page }) => {
    const backend = await entrar(page);
    const id = planejar(backend, ['CIL-006', 'CIL-007', 'CIL-008']);
    await carregando(page, id);
    await page.getByRole('button', { name: 'Conferir CIL-006' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Cilindro CIL-006 conferido.' })).toHaveCount(1);
    expect(await page.locator('main [role="status"]').count()).toBeLessThanOrEqual(1);
    expect(await semRolagemHorizontal(page)).toBe(true);
  });
});
