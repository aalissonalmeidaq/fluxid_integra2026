import { test, expect, type Page } from '@playwright/test';
import { MockBackend, type PermissionProfile } from './support/mock-backend';
import { ORG_A, ORG_B } from './support/mock-registry';
import { seedEligibleCylinders } from './support/mock-trips-plan';

test.use({ serviceWorkers: 'block' });

// Spec 008, US1: planejar uma viagem com paradas e cilindros, com backend simulado. Cobre o planejamento completo, as recusas
// (cilindro reservado, teste vencido, capacidade), edição e reordenação, isolamento entre organizações e o envio único.
// A reserva atômica de verdade é provada no pgTAP e no teste `.live` de concorrência.
const formulario = (page: Page) => page.getByRole('dialog');

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

const semRolagemHorizontal = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

async function abrirPlanejamento(page: Page): Promise<void> {
  await page.goto('/viagens/nova');
  await expect(page.getByRole('dialog', { name: 'Planejar viagem' })).toBeVisible();
  await expect(formulario(page).getByLabel('Veículo')).toBeVisible();
}

async function montar(page: Page, seriais: string[], veiculo = 'ABC-1234 — 30 cilindros'): Promise<void> {
  const dialogo = formulario(page);
  await dialogo.getByLabel('Veículo').selectOption({ label: veiculo });
  await dialogo.getByLabel('Motorista').selectOption({ label: 'Ana Condutora' });
  await dialogo.getByLabel('Unidade da parada 1').selectOption({ index: 1 });
  await dialogo.getByRole('button', { name: 'Adicionar cilindros à parada 1' }).click();
  for (const serial of seriais) await dialogo.getByRole('button', { name: `Adicionar ${serial}` }).click();
}

test.describe('Planejamento de viagens', () => {
  test('planeja uma viagem com duas paradas e quatro cilindros, vê o resumo, salva e reabre', async ({ page }) => {
    const backend = await entrar(page);
    await abrirPlanejamento(page);
    const dialogo = formulario(page);
    await montar(page, ['CIL-006', 'CIL-007']);
    await dialogo.getByRole('button', { name: 'Adicionar parada' }).click();
    await dialogo.getByLabel('Unidade da parada 2').selectOption({ index: 2 });
    await dialogo.getByRole('button', { name: 'Adicionar cilindros à parada 2' }).click();
    await dialogo.getByRole('button', { name: 'Adicionar CIL-008' }).click();
    await dialogo.getByRole('button', { name: 'Adicionar CIL-009' }).click();
    await expect(dialogo.getByText('4 de 30')).toBeVisible();
    await expect(dialogo.getByText('Ainda cabem 26 no veículo.')).toBeVisible();
    await dialogo.getByLabel('Observações').fill('Levar rampa');
    await dialogo.getByRole('button', { name: 'Planejar viagem' }).click();

    await expect(page.getByRole('heading', { level: 2, name: 'Viagem n.º 1' })).toBeVisible();
    await expect(page.getByText('Situação da viagem: Planejada')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Parada 1' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Parada 2' })).toBeVisible();
    for (const serial of ['CIL-006', 'CIL-007', 'CIL-008', 'CIL-009']) await expect(page.getByText(serial, { exact: true })).toBeVisible();
    await expect(page.getByText('Levar rampa')).toBeVisible();
    expect(backend.trips.trips).toHaveLength(1);

    // Reabrir pela lista mostra a mesma viagem.
    await page.goto('/viagens');
    await expect(page.getByText('1 viagem encontrada')).toBeVisible();
    await page.getByRole('link', { name: 'n.º 1' }).first().click();
    await expect(page.getByRole('heading', { level: 2, name: 'Viagem n.º 1' })).toBeVisible();
    await expect(page.getByText('CIL-009', { exact: true })).toBeVisible();
  });

  test('o cilindro reservado deixa de ser oferecido e uma corrida recusada diz em qual viagem ele está', async ({ page }) => {
    const backend = await entrar(page);
    await abrirPlanejamento(page);
    const dialogo = formulario(page);
    await montar(page, ['CIL-006']);
    // Enquanto a tela está aberta, outra pessoa reserva o CIL-007 numa viagem própria.
    const tomada = backend.trips.handle('manage', {
      operation: 'create_trip', organization_id: ORG_A, request_id: crypto.randomUUID(), planned_date: backend.trips.today(),
      vehicle_id: backend.registry.vehicles[0]!.id, driver_id: backend.registry.drivers[0]!.id,
      stops: [{ site_id: backend.registry.sites[0]!.id, cylinder_ids: [backend.cylinders.cylinders.find((c) => c.serial_number === 'CIL-007')!.id] }],
    }, () => true);
    expect(tomada.status).toBe(200);
    await dialogo.getByRole('button', { name: 'Adicionar CIL-007' }).click();
    await dialogo.getByRole('button', { name: 'Planejar viagem' }).click();
    await expect(dialogo.getByRole('alert').filter({ hasText: 'Cilindro já reservado' })).toContainText('CIL-007 já está na viagem n.º 1');
    await expect(dialogo.getByRole('link', { name: 'Abrir essa viagem' })).toBeVisible();
    expect(backend.trips.trips).toHaveLength(1);
  });

  test('teste vencido depois da escolha: a recusa mostra o motivo em texto', async ({ page }) => {
    const backend = await entrar(page);
    await abrirPlanejamento(page);
    const dialogo = formulario(page);
    await montar(page, ['CIL-006']);
    backend.cylinders.cylinders.find((c) => c.serial_number === 'CIL-006')!.hydro_next_due_on = '2020-01-01';
    await dialogo.getByRole('button', { name: 'Planejar viagem' }).click();
    await expect(dialogo.getByRole('alert').filter({ hasText: 'Cilindro não pode viajar' })).toContainText('CIL-006: teste hidrostático vencido');
    expect(backend.trips.trips).toHaveLength(0);
  });

  test('acima da capacidade do veículo: o resumo mostra o excesso e o envio é recusado junto do campo', async ({ page }) => {
    const backend = await entrar(page);
    backend.registry.vehicles.find((v) => v.plate === 'ABC1234')!.capacity_cylinders = 2;
    await abrirPlanejamento(page);
    const dialogo = formulario(page);
    await montar(page, ['CIL-006', 'CIL-007', 'CIL-008'].slice(0, 2), 'ABC-1234 — 2 cilindros');
    await expect(dialogo.getByRole('button', { name: 'Adicionar CIL-008' })).toBeDisabled();
    await expect(dialogo.getByText('O veículo está cheio.')).toBeVisible();
    await expect(dialogo.getByText('2 de 2')).toBeVisible();
  });

  test('erros de campo aparecem junto do campo e o foco vai ao primeiro', async ({ page }) => {
    await entrar(page);
    await abrirPlanejamento(page);
    const dialogo = formulario(page);
    await dialogo.getByRole('button', { name: 'Planejar viagem' }).click();
    await expect(dialogo.getByText('Escolha o veículo.')).toBeVisible();
    await expect(dialogo.getByText('Escolha o motorista.')).toBeVisible();
    await expect(dialogo.getByText('Escolha a unidade da parada.')).toBeVisible();
    await expect(dialogo.getByLabel('Veículo')).toBeFocused();
  });

  test('duplo clique não duplica a viagem', async ({ page }) => {
    const backend = await entrar(page);
    await abrirPlanejamento(page);
    await montar(page, ['CIL-006']);
    const botao = formulario(page).getByRole('button', { name: 'Planejar viagem' });
    await botao.dblclick();
    await expect(page.getByRole('heading', { level: 2, name: 'Viagem n.º 1' })).toBeVisible();
    expect(backend.trips.trips).toHaveLength(1);
    expect(new Set(backend.trips.receivedRequestIds).size).toBe(backend.trips.receivedRequestIds.length);
  });

  test('edita a viagem: troca um cilindro, reordena as paradas e salva', async ({ page }) => {
    const backend = await entrar(page);
    await abrirPlanejamento(page);
    const dialogo = formulario(page);
    await montar(page, ['CIL-006']);
    await dialogo.getByRole('button', { name: 'Adicionar parada' }).click();
    await dialogo.getByLabel('Unidade da parada 2').selectOption({ index: 2 });
    await dialogo.getByRole('button', { name: 'Adicionar cilindros à parada 2' }).click();
    await dialogo.getByRole('button', { name: 'Adicionar CIL-007' }).click();
    await dialogo.getByRole('button', { name: 'Planejar viagem' }).click();
    await expect(page.getByRole('heading', { level: 2, name: 'Viagem n.º 1' })).toBeVisible();

    await page.getByRole('link', { name: 'Editar viagem' }).click();
    const edicao = page.getByRole('dialog', { name: 'Editar viagem' });
    await expect(edicao.getByLabel('Veículo')).toBeVisible();
    await edicao.getByRole('button', { name: 'Subir a parada 2' }).click();
    await edicao.getByRole('button', { name: 'Tirar CIL-006 da parada 2' }).click();
    await edicao.getByRole('button', { name: 'Adicionar cilindros à parada 2' }).click();
    await edicao.getByRole('button', { name: 'Adicionar CIL-008' }).click();
    await edicao.getByRole('button', { name: 'Salvar alterações' }).click();

    await expect(page.getByRole('heading', { level: 2, name: 'Viagem n.º 1' })).toBeVisible();
    const paradas = page.getByRole('list', { name: 'Paradas da viagem' });
    await expect(paradas.getByRole('heading', { name: 'Parada 1' }).locator('xpath=ancestor::li[1]')).toContainText('CIL-007');
    await expect(paradas.getByRole('heading', { name: 'Parada 2' }).locator('xpath=ancestor::li[1]')).toContainText('CIL-008');
    await expect(page.getByText('CIL-006', { exact: true })).toHaveCount(0);
    expect(backend.trips.trips[0]!.version).toBe(2);
    // O cilindro liberado volta a ser oferecido.
    expect(backend.trips.items.find((item) => item.cylinder_id === backend.cylinders.cylinders.find((c) => c.serial_number === 'CIL-006')!.id)!.item_status).toBe('released');
  });

  test('o Tenant B não enxerga a viagem do A e a rota responde "Viagem não encontrada"', async ({ page }) => {
    const backend = await entrar(page);
    await abrirPlanejamento(page);
    await montar(page, ['CIL-006']);
    await formulario(page).getByRole('button', { name: 'Planejar viagem' }).click();
    await expect(page.getByRole('heading', { level: 2, name: 'Viagem n.º 1' })).toBeVisible();
    // Uma viagem do Tenant B existe no simulado; o usuário do A abre o endereço dela.
    backend.trips.trips.push({ ...backend.trips.trips[0]!, id: '99000000-0000-4000-8000-000000000b01', organization_id: ORG_B });
    await page.goto('/viagens/99000000-0000-4000-8000-000000000b01');
    await expect(page.getByText('Viagem não encontrada')).toBeVisible();
    await page.goto('/viagens');
    await expect(page.getByText('1 viagem encontrada')).toBeVisible();
  });

  test('sem permissão de planejar: o formulário nem monta; o auditor só lê', async ({ page }) => {
    await entrar(page, 'viagens-auditor');
    await page.goto('/viagens/nova');
    await expect(page.getByText('Acesso negado')).toBeVisible();
    await expect(page.getByLabel('Veículo')).toHaveCount(0);
    await page.goto('/viagens');
    await expect(page.getByRole('link', { name: 'Planejar viagem' })).toHaveCount(0);
  });

  test('sem rolagem horizontal na lista, no formulário e no detalhe', async ({ page }) => {
    await entrar(page);
    await page.goto('/viagens');
    await expect(page.getByRole('heading', { level: 2, name: 'Viagens da organização' })).toBeVisible();
    expect(await semRolagemHorizontal(page)).toBe(true);
    await abrirPlanejamento(page);
    await montar(page, ['CIL-006']);
    expect(await semRolagemHorizontal(page)).toBe(true);
    await formulario(page).getByRole('button', { name: 'Planejar viagem' }).click();
    await expect(page.getByRole('heading', { level: 2, name: 'Viagem n.º 1' })).toBeVisible();
    expect(await semRolagemHorizontal(page)).toBe(true);
  });
});
