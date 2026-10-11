import { test, expect, type Page } from '@playwright/test';
import { MockBackend, type PermissionProfile } from './support/mock-backend';
import { ORG_A } from './support/mock-registry';
import { seedEligibleCylinders } from './support/mock-trips-plan';

test.use({ serviceWorkers: 'block' });

// Spec 008, US5: concluir, cancelar e devolver ao estoque, com backend simulado. Cobre a conclusão com todas as paradas encerradas, a recusa
// com parada aberta, o cancelamento de uma planejada (cilindros elegíveis de novo), o cancelamento em andamento com a exceção e o retorno
// ao estoque. As transições e os efeitos de verdade são provados no pgTAP.
async function entrar(page: Page, perfil: PermissionProfile = 'viagens-admin'): Promise<MockBackend> {
  const backend = new MockBackend().asProfile(perfil);
  backend.loginResponses = [backend.authenticated()];
  backend.statusResponse = backend.activeStatus('aal2');
  seedEligibleCylinders(backend.trips);
  await backend.install(page);
  await page.goto('/');
  await page.getByLabel('E-mail').fill('admin-a@example.invalid');
  await page.getByLabel('Senha', { exact: true }).fill('Local-only-002!');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Visão geral' })).toBeVisible();
  return backend;
}

type Chamar = (operation: string, extra: Record<string, unknown>) => { status: number; json: Record<string, unknown> };

function planejar(backend: MockBackend, paradas: string[][], iniciar = false): { id: string; chamar: Chamar } {
  const idDe = (serial: string) => backend.cylinders.cylinders.find((c) => c.serial_number === serial)!.id;
  const resposta = backend.trips.handle('manage', {
    operation: 'create_trip', organization_id: ORG_A, request_id: crypto.randomUUID(), planned_date: backend.trips.today(),
    vehicle_id: backend.registry.vehicles.find((v) => v.plate === 'ABC1234')!.id, driver_id: backend.registry.drivers.find((d) => d.full_name === 'Ana Condutora')!.id,
    stops: paradas.map((seriais, index) => ({ site_id: backend.registry.sites[index]!.id, cylinder_ids: seriais.map(idDe) })),
  }, () => true);
  const id = String(resposta.json.trip_id);
  const chamar: Chamar = (operation, extra) => backend.trips.handle('manage', { operation, organization_id: ORG_A, request_id: crypto.randomUUID(), trip_id: id, ...extra }, () => true);
  if (iniciar) {
    chamar('start_loading', { expected_version: 1 });
    for (const item of backend.trips.itemsOf(id)) chamar('check_item', { item_id: item.id });
    expect(chamar('start_trip', { expected_version: 2 }).status).toBe(200);
  }
  return { id, chamar };
}

function entregar(backend: MockBackend, id: string, chamar: Chamar, posicao: number, naoEntregue?: string): void {
  const parada = backend.trips.stopsOf(id).find((s) => s.position === posicao)!;
  chamar('arrive_stop', { stop_id: parada.id });
  const itens = backend.trips.itemsOf(id).filter((item) => item.stop_id === parada.id);
  const resposta = chamar('register_delivery', {
    stop_id: parada.id, delivered_at: new Date(Date.now() - 60_000).toISOString(), recipient_name: 'Recebedor Fictício',
    results: itens.map((item) => {
      const serial = backend.cylinders.cylinders.find((c) => c.id === item.cylinder_id)!.serial_number;
      return serial === naoEntregue ? { item_id: item.id, delivered: false, reason: 'Cliente sem espaço para receber' } : { item_id: item.id, delivered: true };
    }),
  });
  expect(resposta.status, JSON.stringify(resposta.json)).toBe(200);
}

const semRolagemHorizontal = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

test.describe('Encerramento da viagem', () => {
  test('conclui a viagem quando todas as paradas estão encerradas; antes disso o botão explica o que falta', async ({ page }) => {
    const backend = await entrar(page);
    const { id, chamar } = planejar(backend, [['CIL-006'], ['CIL-007']], true);
    await page.goto(`/viagens/${id}`);
    const concluir = page.getByRole('button', { name: 'Concluir viagem' });
    await expect(concluir).toBeDisabled();
    await expect(page.getByText('Falta encerrar 2 paradas: registre a entrega ou a divergência.')).toBeVisible();
    entregar(backend, id, chamar, 1);
    await page.reload();
    await expect(page.getByText('Falta encerrar 1 parada: registre a entrega ou a divergência.')).toBeVisible();
    entregar(backend, id, chamar, 2);
    await page.reload();
    await expect(concluir).toBeEnabled();
    await concluir.click();
    await expect(page.getByText('Situação da viagem: Concluída')).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: 'Viagem concluída.' })).toHaveCount(1);
    // Encerrada: sem ações de edição nem de operação.
    for (const nome of ['Concluir viagem', 'Cancelar viagem', 'Editar viagem']) await expect(page.getByRole('button', { name: nome }).or(page.getByRole('link', { name: nome }))).toHaveCount(0);
    expect(backend.trips.trips[0]!.status).toBe('completed');
  });

  test('cilindro não entregue exige uma decisão: devolver ao estoque libera a conclusão', async ({ page }) => {
    const backend = await entrar(page);
    const { id, chamar } = planejar(backend, [['CIL-006', 'CIL-007']], true);
    entregar(backend, id, chamar, 1, 'CIL-007');
    await page.goto(`/viagens/${id}`);
    await expect(page.getByText('Situação da parada: Com divergência')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Concluir viagem' })).toBeDisabled();
    await expect(page.getByText('1 cilindro ainda sem decisão: corrija a entrega ou devolva ao estoque.')).toBeVisible();

    await page.getByRole('button', { name: 'Devolver CIL-007 ao estoque' }).click();
    const dialogo = page.getByRole('dialog', { name: 'Devolver CIL-007 ao estoque' });
    await dialogo.getByRole('button', { name: 'Devolver ao estoque' }).click();
    await expect(dialogo.getByText(/Explique o motivo com pelo menos 5 caracteres/)).toBeVisible();
    await dialogo.getByLabel('Justificativa').fill('Cliente não aceitou o cilindro');
    await dialogo.getByRole('button', { name: 'Devolver ao estoque' }).click();
    await expect(dialogo).toHaveCount(0);
    await expect(page.getByText('Situação do cilindro na viagem: Devolvido ao estoque')).toBeVisible();
    expect(backend.cylinders.cylinders.find((c) => c.serial_number === 'CIL-007')!.stock_status).toBe('in_stock');
    await page.getByRole('button', { name: 'Concluir viagem' }).click();
    await expect(page.getByText('Situação da viagem: Concluída')).toBeVisible();
  });

  test('cancela uma viagem planejada e os cilindros voltam a ser elegíveis', async ({ page }) => {
    const backend = await entrar(page);
    const { id } = planejar(backend, [['CIL-006', 'CIL-007']]);
    await page.goto(`/viagens/${id}`);
    await page.getByRole('button', { name: 'Cancelar viagem' }).click();
    const dialogo = page.getByRole('dialog', { name: 'Cancelar a viagem n.º 1' });
    await dialogo.getByRole('button', { name: 'Cancelar viagem' }).click();
    await expect(dialogo.getByText(/Explique o motivo com pelo menos 5 caracteres/)).toBeVisible();
    await dialogo.getByLabel('Justificativa').fill('Cliente desistiu da entrega');
    await dialogo.getByRole('button', { name: 'Cancelar viagem' }).click();
    await expect(dialogo).toHaveCount(0);
    await expect(page.getByText('Situação da viagem: Cancelada')).toBeVisible();
    // O motivo aparece no cabeçalho da viagem e, para quem tem trip.history, também como justificativa do evento.
    await expect(page.getByText('Cliente desistiu da entrega').first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Cancelar viagem' })).toHaveCount(0);
    // CIL-006 e CIL-007 aparecem de novo na busca de cilindros elegíveis de uma nova viagem.
    await page.goto('/viagens/nova');
    const form = page.getByRole('dialog', { name: 'Planejar viagem' });
    await form.getByLabel('Unidade da parada 1').selectOption({ index: 1 });
    await form.getByRole('button', { name: 'Adicionar cilindros à parada 1' }).click();
    await expect(form.getByRole('button', { name: 'Adicionar CIL-006' })).toBeVisible();
    await expect(form.getByRole('button', { name: 'Adicionar CIL-007' })).toBeVisible();
  });

  test('cancela em andamento com a exceção: o que já saiu fica em trânsito até voltar ao estoque', async ({ page }) => {
    const backend = await entrar(page);
    const { id, chamar } = planejar(backend, [['CIL-006'], ['CIL-007']], true);
    entregar(backend, id, chamar, 1);
    await page.goto(`/viagens/${id}`);
    await page.getByRole('button', { name: 'Cancelar viagem' }).click();
    const dialogo = page.getByRole('dialog');
    await expect(dialogo.getByText(/continuam em trânsito até você registrar o retorno ao estoque/)).toBeVisible();
    await dialogo.getByLabel('Justificativa').fill('Cliente suspendeu as entregas');
    await dialogo.getByRole('button', { name: 'Cancelar viagem' }).click();
    await expect(page.getByText('Situação da viagem: Cancelada')).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: '1 cilindro continua em trânsito até o retorno ao estoque.' })).toHaveCount(1);
    await expect(page.getByText('Custódia: Em trânsito')).toBeVisible();

    await page.getByRole('button', { name: 'Devolver CIL-007 ao estoque' }).click();
    await page.getByRole('dialog').getByLabel('Justificativa').fill('Volta ao depósito');
    await page.getByRole('dialog').getByRole('button', { name: 'Devolver ao estoque' }).click();
    await expect(page.getByText('Situação do cilindro na viagem: Devolvido ao estoque')).toBeVisible();
    expect(backend.cylinders.cylinders.find((c) => c.serial_number === 'CIL-007')!.stock_status).toBe('in_stock');
  });

  test('o gestor sem a exceção cancela planejada, mas não em andamento nem devolve ao estoque', async ({ page }) => {
    const backend = await entrar(page, 'viagens-gestor');
    const planejada = planejar(backend, [['CIL-006']]);
    const andamento = planejar(backend, [['CIL-007']], true);
    await page.goto(`/viagens/${planejada.id}`);
    await expect(page.getByRole('button', { name: 'Cancelar viagem' })).toBeVisible();
    await page.goto(`/viagens/${andamento.id}`);
    await expect(page.getByRole('heading', { level: 2, name: 'Viagem n.º 2' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Cancelar viagem' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Devolver/ })).toHaveCount(0);
  });

  test('o auditor não vê nenhuma ação de encerramento', async ({ page }) => {
    const backend = await entrar(page, 'viagens-auditor');
    const { id } = planejar(backend, [['CIL-006']], true);
    await page.goto(`/viagens/${id}`);
    await expect(page.getByRole('heading', { level: 2, name: 'Viagem n.º 1' })).toBeVisible();
    for (const nome of ['Concluir viagem', 'Cancelar viagem']) await expect(page.getByRole('button', { name: nome })).toHaveCount(0);
  });

  test('sem rolagem horizontal com o diálogo de cancelamento aberto', async ({ page }) => {
    const backend = await entrar(page);
    const { id } = planejar(backend, [['CIL-006']]);
    await page.goto(`/viagens/${id}`);
    await page.getByRole('button', { name: 'Cancelar viagem' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    expect(await semRolagemHorizontal(page)).toBe(true);
  });
});
