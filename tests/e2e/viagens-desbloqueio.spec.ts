import { test, expect, type Page } from '@playwright/test';
import { MockBackend, type PermissionProfile } from './support/mock-backend';
import { ORG_A } from './support/mock-registry';
import { seedEligibleCylinders } from './support/mock-trips-plan';

test.use({ serviceWorkers: 'block' });

// Spec 008, US4: o desbloqueio como ato independente da entrega, com backend simulado. Cobre o desbloqueio normal de um cilindro
// entregue (o outro segue bloqueado), o excepcional recusado sem segundo fator e aceito com ele, e o auditor sem a ação. A
// sessão do navegador já tem `aal2`; é o servidor simulado (`backend.trips.aal`) que decide o segundo fator, como o banco real.
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

// Viagem em andamento com a parada 1 entregue (CIL-006 e CIL-007) e a parada 2 ainda em trânsito (CIL-008).
function preparar(backend: MockBackend): string {
  const idDe = (serial: string) => backend.cylinders.cylinders.find((c) => c.serial_number === serial)!.id;
  const resposta = backend.trips.handle('manage', {
    operation: 'create_trip', organization_id: ORG_A, request_id: crypto.randomUUID(), planned_date: backend.trips.today(),
    vehicle_id: backend.registry.vehicles.find((v) => v.plate === 'ABC1234')!.id, driver_id: backend.registry.drivers.find((d) => d.full_name === 'Ana Condutora')!.id,
    stops: [{ site_id: backend.registry.sites[0]!.id, cylinder_ids: [idDe('CIL-006'), idDe('CIL-007')] }, { site_id: backend.registry.sites[1]!.id, cylinder_ids: [idDe('CIL-008')] }],
  }, () => true);
  const id = String(resposta.json.trip_id);
  const chamar = (operation: string, extra: Record<string, unknown>) => backend.trips.handle('manage', { operation, organization_id: ORG_A, request_id: crypto.randomUUID(), trip_id: id, ...extra }, () => true);
  chamar('start_loading', { expected_version: 1 });
  for (const item of backend.trips.itemsOf(id)) chamar('check_item', { item_id: item.id });
  chamar('start_trip', { expected_version: 2 });
  const parada1 = backend.trips.stopsOf(id).find((s) => s.position === 1)!;
  chamar('arrive_stop', { stop_id: parada1.id });
  const entrega = chamar('register_delivery', {
    stop_id: parada1.id, delivered_at: new Date(Date.now() - 60_000).toISOString(), recipient_name: 'Recebedor Fictício',
    results: backend.trips.itemsOf(id).filter((item) => item.stop_id === parada1.id).map((item) => ({ item_id: item.id, delivered: true })),
  });
  expect(entrega.status, JSON.stringify(entrega.json)).toBe(200);
  return id;
}

test.describe('Desbloqueio como ato independente', () => {
  test('desbloqueia um cilindro entregue e o outro continua bloqueado, sem mexer na entrega', async ({ page }) => {
    const backend = await entrar(page);
    const id = preparar(backend);
    await page.goto(`/viagens/${id}`);
    await expect(page.getByText('Bloqueio: Bloqueado (lógico)')).toHaveCount(3);

    await page.getByRole('button', { name: 'Registrar desbloqueio de CIL-006' }).click();
    const dialogo = page.getByRole('dialog', { name: 'Registrar desbloqueio · CIL-006' });
    await expect(dialogo.getByText(/comandada e confirmada pelo dispositivo na Fase 6/)).toBeVisible();
    await dialogo.getByRole('button', { name: 'Registrar desbloqueio' }).click();

    await expect(dialogo).toHaveCount(0);
    await expect(page.getByText('Bloqueio: Desbloqueado')).toHaveCount(1);
    await expect(page.getByText('Bloqueio: Bloqueado (lógico)')).toHaveCount(2);
    await expect(page.getByRole('status').filter({ hasText: 'A situação da entrega não mudou.' })).toHaveCount(1);
    // A entrega e a custódia seguem como estavam.
    await expect(page.getByText('Situação da parada: Entregue')).toBeVisible();
    await expect(page.getByText('Custódia: No cliente')).toHaveCount(2);
    await expect(page.getByRole('button', { name: 'Registrar desbloqueio de CIL-006' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Registrar desbloqueio de CIL-007' })).toBeVisible();
    expect(backend.trips.unlocks).toHaveLength(1);
    expect(backend.trips.unlocks[0]!.exceptional).toBe(false);
  });

  test('o excepcional é recusado sem o segundo fator e aceito com ele, sempre com justificativa', async ({ page }) => {
    const backend = await entrar(page);
    const id = preparar(backend);
    backend.trips.aal = 'aal1';
    await page.goto(`/viagens/${id}`);
    await page.getByRole('button', { name: 'Registrar desbloqueio de CIL-008' }).click();
    const dialogo = page.getByRole('dialog', { name: 'Desbloqueio excepcional · CIL-008' });
    await dialogo.getByRole('button', { name: 'Registrar desbloqueio excepcional' }).click();
    await expect(dialogo.getByText(/Explique em 5 a 500 caracteres/)).toBeVisible();
    await dialogo.getByLabel('Justificativa').fill('Cilindro precisa voltar ao depósito');
    await dialogo.getByRole('button', { name: 'Registrar desbloqueio excepcional' }).click();
    await expect(dialogo.getByRole('alert')).toContainText('exige a verificação em duas etapas');
    expect(backend.trips.unlocks).toHaveLength(0);
    await expect(dialogo).toBeVisible();

    backend.trips.aal = 'aal2';
    await dialogo.getByRole('button', { name: 'Registrar desbloqueio excepcional' }).click();
    await expect(dialogo).toHaveCount(0);
    await expect(page.getByRole('status').filter({ hasText: 'Desbloqueio excepcional de CIL-008 registrado' })).toHaveCount(1);
    expect(backend.trips.unlocks).toHaveLength(1);
    expect(backend.trips.unlocks[0]).toMatchObject({ exceptional: true, aal: 'aal2' });
    // O cilindro continua em trânsito: só o bloqueio mudou.
    await expect(page.getByText('Custódia: Em trânsito')).toBeVisible();
    await expect(page.getByText('Bloqueio: Desbloqueado')).toHaveCount(1);
  });

  test('o gestor sem a exceção desbloqueia o entregue, mas não vê a ação do que está em trânsito', async ({ page }) => {
    const backend = await entrar(page, 'viagens-gestor');
    const id = preparar(backend);
    await page.goto(`/viagens/${id}`);
    await expect(page.getByRole('button', { name: 'Registrar desbloqueio de CIL-006' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Registrar desbloqueio de CIL-008' })).toHaveCount(0);
  });

  test('o auditor não vê a ação de desbloqueio', async ({ page }) => {
    const backend = await entrar(page, 'viagens-auditor');
    const id = preparar(backend);
    await page.goto(`/viagens/${id}`);
    await expect(page.getByRole('heading', { level: 2, name: 'Viagem n.º 1' })).toBeVisible();
    await expect(page.getByText('Bloqueio: Bloqueado (lógico)')).toHaveCount(3);
    await expect(page.getByRole('button', { name: /Registrar desbloqueio/ })).toHaveCount(0);
  });

  test('só com teclado: abre o diálogo, Escape fecha e devolve o foco ao botão', async ({ page }) => {
    const backend = await entrar(page);
    const id = preparar(backend);
    await page.goto(`/viagens/${id}`);
    const botao = page.getByRole('button', { name: 'Registrar desbloqueio de CIL-006' });
    await botao.focus();
    await page.keyboard.press('Enter');
    const dialogo = page.getByRole('dialog', { name: 'Registrar desbloqueio · CIL-006' });
    await expect(dialogo.getByLabel('Justificativa (opcional)')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(dialogo).toHaveCount(0);
    await expect(botao).toBeFocused();
  });
});
