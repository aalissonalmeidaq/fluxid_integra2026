import { test, expect, type Page } from '@playwright/test';
import { MockBackend, type PermissionProfile } from './support/mock-backend';
import { ORG_A } from './support/mock-registry';
import { seedEligibleCylinders } from './support/mock-trips-plan';

test.use({ serviceWorkers: 'block' });

// Spec 008, US3: chegada e entrega por parada, divergência e correção, com backend simulado. Cobre a entrega completa (recebedor,
// horário, posição), a divergência com justificativa, a correção por novo registro, o recebedor restrito ao auditor e o uso só com
// teclado. O banco de verdade (geocerca, eventos sem dado pessoal, imutabilidade) é provado no pgTAP.
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

// Planeja, carrega, confere tudo e inicia direto no simulado (esses passos têm o seu E2E) e devolve a viagem em andamento.
function emAndamento(backend: MockBackend, paradas: string[][]): string {
  const idDe = (serial: string) => backend.cylinders.cylinders.find((c) => c.serial_number === serial)!.id;
  const resposta = backend.trips.handle('manage', {
    operation: 'create_trip', organization_id: ORG_A, request_id: crypto.randomUUID(), planned_date: backend.trips.today(),
    vehicle_id: backend.registry.vehicles.find((v) => v.plate === 'ABC1234')!.id, driver_id: backend.registry.drivers.find((d) => d.full_name === 'Ana Condutora')!.id,
    stops: paradas.map((seriais, index) => ({ site_id: backend.registry.sites[index]!.id, cylinder_ids: seriais.map(idDe) })),
  }, () => true);
  const id = String(resposta.json.trip_id);
  const chamar = (operation: string, extra: Record<string, unknown>) => backend.trips.handle('manage', { operation, organization_id: ORG_A, request_id: crypto.randomUUID(), trip_id: id, ...extra }, () => true);
  chamar('start_loading', { expected_version: 1 });
  for (const item of backend.trips.itemsOf(id)) chamar('check_item', { item_id: item.id });
  expect(chamar('start_trip', { expected_version: 2 }).status).toBe(200);
  return id;
}

const semRolagemHorizontal = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

test.describe('Entrega por parada', () => {
  test('chegada e entrega completa na parada 1, com recebedor, horário e posição', async ({ page }) => {
    const backend = await entrar(page);
    const id = emAndamento(backend, [['CIL-006', 'CIL-007'], ['CIL-008']]);
    await page.goto(`/viagens/${id}`);
    await expect(page.getByText('Situação da viagem: Em andamento')).toBeVisible();

    await page.getByRole('button', { name: /Registrar chegada à parada 1/ }).click();
    await expect(page.getByText('Situação da parada: No local')).toBeVisible();
    await page.getByRole('button', { name: 'Registrar entrega da parada 1' }).click();
    const dialogo = page.getByRole('dialog', { name: 'Registrar entrega · Parada 1' });
    await expect(dialogo.getByLabel('Nome de quem recebeu')).toBeFocused();
    await dialogo.getByLabel('Nome de quem recebeu').fill('Recebedor Fictício');
    await dialogo.getByLabel('Função (opcional)').fill('Enfermeira');
    await dialogo.getByLabel('Latitude').fill('-23,5505');
    await dialogo.getByLabel('Longitude').fill('-46,6333');
    await dialogo.getByRole('button', { name: 'Registrar entrega' }).click();

    await expect(dialogo).toHaveCount(0);
    await expect(page.getByText('Situação da parada: Entregue')).toBeVisible();
    await expect(page.getByText(/recebido por Recebedor Fictício \(Enfermeira\)/)).toBeVisible();
    await expect(page.getByText('Posição informada na entrega.')).toBeVisible();
    await expect(page.getByText('Situação do cilindro na viagem: Entregue')).toHaveCount(2);
    await expect(page.getByText('Custódia: No cliente')).toHaveCount(2);
    // O bloqueio é independente da entrega: continua bloqueado (lógico).
    await expect(page.getByText('Bloqueio: Bloqueado (lógico)')).toHaveCount(3);
    expect(backend.trips.deliveries).toHaveLength(1);
    expect(JSON.stringify(backend.trips.events)).not.toContain('Recebedor Fictício');
  });

  test('divergência na parada 2 com justificativa e correção posterior', async ({ page }) => {
    const backend = await entrar(page);
    const id = emAndamento(backend, [['CIL-006'], ['CIL-007', 'CIL-008']]);
    await page.goto(`/viagens/${id}`);
    await page.getByRole('button', { name: /Registrar chegada à parada 2/ }).click();
    await page.getByRole('button', { name: 'Registrar entrega da parada 2' }).click();
    const dialogo = page.getByRole('dialog', { name: 'Registrar entrega · Parada 2' });
    await dialogo.getByLabel('Nome de quem recebeu').fill('Outra Pessoa Fictícia');
    await dialogo.getByRole('radiogroup', { name: 'Resultado de CIL-008' }).getByRole('radio', { name: 'Não entregue' }).check();
    await dialogo.getByRole('button', { name: 'Registrar entrega' }).click();
    await expect(dialogo.getByText(/Explique por que não foi entregue/)).toBeVisible();
    await expect(dialogo.getByLabel('Por que CIL-008 não foi entregue')).toBeFocused();
    await dialogo.getByLabel('Por que CIL-008 não foi entregue').fill('Cliente sem espaço para receber');
    await dialogo.getByRole('button', { name: 'Registrar entrega' }).click();

    await expect(dialogo).toHaveCount(0);
    await expect(page.getByText('Situação da parada: Com divergência')).toBeVisible();
    await expect(page.getByText('Situação do cilindro na viagem: Não entregue')).toBeVisible();
    await expect(page.getByText('Motivo: Cliente sem espaço para receber')).toBeVisible();
    await expect(page.getByText('Custódia: Em trânsito')).toHaveCount(2);

    await page.getByRole('button', { name: 'Corrigir a entrega da parada 2' }).click();
    const correcao = page.getByRole('dialog', { name: 'Corrigir entrega · Parada 2' });
    await expect(correcao.getByText(/Registro anterior/)).toBeVisible();
    await expect(correcao.getByText(/recebido por Outra Pessoa Fictícia/)).toBeVisible();
    await expect(correcao.getByRole('radiogroup', { name: 'Resultado de CIL-007' })).toHaveCount(0);
    await correcao.getByRole('button', { name: 'Registrar correção' }).click();
    await expect(correcao).toHaveCount(0);
    await expect(page.getByText('Situação da parada: Entregue')).toBeVisible();
    await expect(page.getByText('Entrega registrada (corrigida)')).toBeVisible();
    await expect(page.getByText('1 correção registrada; os registros anteriores ficam no histórico.')).toBeVisible();
    expect(backend.trips.deliveries).toHaveLength(2);
    expect(backend.trips.deliveries.find((d) => d.supersedes_id === null)!.recipient_name).toBe('Outra Pessoa Fictícia');
  });

  test('chegada fora da ordem é registrada e destacada', async ({ page }) => {
    const backend = await entrar(page);
    const id = emAndamento(backend, [['CIL-006'], ['CIL-007']]);
    await page.goto(`/viagens/${id}`);
    await page.getByRole('button', { name: /Registrar chegada à parada 2/ }).click();
    await expect(page.getByText('Chegada fora da ordem')).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: 'fora da ordem planejada' })).toHaveCount(1);
    await expect(page.getByRole('heading', { name: 'Parada 1' })).toBeVisible();
  });

  test('posição fora da geocerca é aceita e destacada em texto', async ({ page }) => {
    const backend = await entrar(page);
    const id = emAndamento(backend, [['CIL-006']]);
    backend.registry.geofences.push({ id: 'g1', organization_id: ORG_A, site_id: backend.registry.sites[0]!.id, name: 'Cerca', shape: 'circle', center: { lat: -23.55, lng: -46.633 }, radius_m: 200, vertices: [], status: 'active', version: 1 });
    await page.goto(`/viagens/${id}`);
    await page.getByRole('button', { name: /Registrar chegada à parada 1/ }).click();
    await page.getByRole('button', { name: 'Registrar entrega da parada 1' }).click();
    const dialogo = page.getByRole('dialog');
    await dialogo.getByLabel('Nome de quem recebeu').fill('Recebedor Fictício');
    await dialogo.getByLabel('Latitude').fill('-23,7');
    await dialogo.getByLabel('Longitude').fill('-46,9');
    await dialogo.getByRole('button', { name: 'Registrar entrega' }).click();
    await expect(page.getByText('Posição fora da geocerca da unidade.')).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: 'fora da geocerca' })).toHaveCount(1);
  });

  test('o auditor vê que a entrega existe, mas o recebedor aparece como "(restrito)"', async ({ page }) => {
    const backend = await entrar(page, 'viagens-auditor');
    const id = emAndamento(backend, [['CIL-006']]);
    const parada = backend.trips.stops[0]!;
    parada.status = 'delivered';
    backend.trips.items[0]!.item_status = 'delivered';
    backend.trips.deliveries.push({
      id: 'd1', organization_id: ORG_A, stop_id: parada.id, delivered_at: '2026-10-09T15:00:00.000Z', recipient_name: 'Nome-sigiloso-do-recebedor', recipient_role: 'Funcao-sigilosa', latitude: null, longitude: null,
      at_site_address: false, outside_geofence: null, results: [], supersedes_id: null, recorded_by_name: 'Ana', recorded_at: '2026-10-09T15:01:00.000Z',
    });
    await page.goto(`/viagens/${id}`);
    await expect(page.getByText(/recebido por \(restrito\)/)).toBeVisible();
    await expect(page.getByText('Nome-sigiloso-do-recebedor')).toHaveCount(0);
    await expect(page.getByText('Funcao-sigilosa')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Registrar (chegada|entrega)|Corrigir/ })).toHaveCount(0);
  });

  test('só com teclado: chegada, diálogo, motivo obrigatório, Escape e envio com Enter', async ({ page }) => {
    const backend = await entrar(page);
    const id = emAndamento(backend, [['CIL-006']]);
    await page.goto(`/viagens/${id}`);
    const chegada = page.getByRole('button', { name: /Registrar chegada à parada 1/ });
    await chegada.focus();
    await page.keyboard.press('Enter');
    const entrega = page.getByRole('button', { name: 'Registrar entrega da parada 1' });
    await expect(entrega).toBeVisible();
    await entrega.focus();
    await page.keyboard.press('Enter');
    const dialogo = page.getByRole('dialog', { name: 'Registrar entrega · Parada 1' });
    await expect(dialogo.getByLabel('Nome de quem recebeu')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(dialogo).toHaveCount(0);
    await expect(entrega).toBeFocused();
    await page.keyboard.press('Enter');
    await page.getByLabel('Nome de quem recebeu').fill('Recebedor Fictício');
    await page.getByLabel('Nome de quem recebeu').press('Enter');
    await expect(page.getByText('Situação da parada: Entregue')).toBeVisible();
  });

  test('sem rolagem horizontal com o diálogo de entrega aberto', async ({ page }) => {
    const backend = await entrar(page);
    const id = emAndamento(backend, [['CIL-006', 'CIL-007']]);
    await page.goto(`/viagens/${id}`);
    await page.getByRole('button', { name: /Registrar chegada à parada 1/ }).click();
    await page.getByRole('button', { name: 'Registrar entrega da parada 1' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    expect(await semRolagemHorizontal(page)).toBe(true);
  });
});
