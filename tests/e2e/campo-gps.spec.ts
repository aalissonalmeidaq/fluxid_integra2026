import { test, expect, type Page } from '@playwright/test';
import { MockBackend, type PermissionProfile } from './support/mock-backend';
import { allowLocation, denyLocation, moveTo } from './support/mock-geolocation';
import { ORG_A } from './support/mock-registry';
import { seedEligibleCylinders } from './support/mock-trips-plan';

test.use({ serviceWorkers: 'block' });

// Spec 009, US2: chegada e entrega com a posição do aparelho, com backend simulado e geolocalização controlada pelo Playwright. Cobre a
// leitura do GPS na chegada e na entrega (origem e precisão em texto), a geocerca, a precisão ruim que só avisa, a confirmação antes de
// substituir coordenadas digitadas, a permissão negada com as alternativas manuais e a posição que continua opcional. A leitura real em
// aparelho Android é conferida na validação humana (quickstart.md).
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

const cerca = (backend: MockBackend) => backend.registry.geofences.push({
  id: 'g1', organization_id: ORG_A, site_id: backend.registry.sites[0]!.id, name: 'Cerca', shape: 'circle', center: { lat: -23.55, lng: -46.633 }, radius_m: 200, vertices: [], status: 'active', version: 1,
});
const DENTRO = { latitude: -23.55, longitude: -46.633, accuracy: 12 };
const FORA = { latitude: -23.5, longitude: -46.6, accuracy: 12 };

async function abrirChegada(page: Page, id: string): Promise<void> {
  await page.goto(`/viagens/${id}`);
  await page.getByRole('button', { name: /Chegada com a posição da parada 1/ }).click();
}

test.describe('Chegada com a posição', () => {
  test('lê o GPS e registra a chegada com a origem e a precisão em texto, dentro da geocerca', async ({ page }) => {
    const backend = await entrar(page);
    cerca(backend);
    const id = emAndamento(backend, [['CIL-006'], ['CIL-007']]);
    await allowLocation(page, DENTRO);
    await abrirChegada(page, id);
    await page.getByRole('button', { name: 'Usar minha posição' }).click();
    await expect(page.getByText('Origem: GPS')).toBeVisible();
    await expect(page.getByText(/precisão cerca de 12 m/).first()).toBeVisible();
    await page.getByRole('button', { name: 'Registrar chegada com a posição' }).click();
    await expect(page.getByText('Situação da parada: No local')).toBeVisible();
    await expect(page.getByText('Posição lida pelo GPS, precisão cerca de 12 m (boa).')).toBeVisible();
    await expect(page.getByText('Dentro da geocerca da unidade.')).toBeVisible();
    const arrival = backend.trips.stopsOf(id)[0]!.arrival!;
    expect(arrival).toMatchObject({ position_source: 'gps', accuracy_m: 12, outside_geofence: false });
  });

  test('fora da geocerca a chegada é aceita e destacada em texto', async ({ page }) => {
    const backend = await entrar(page);
    cerca(backend);
    const id = emAndamento(backend, [['CIL-006'], ['CIL-007']]);
    await allowLocation(page, FORA);
    await abrirChegada(page, id);
    await page.getByRole('button', { name: 'Usar minha posição' }).click();
    await expect(page.getByText('Origem: GPS')).toBeVisible();
    await page.getByRole('button', { name: 'Registrar chegada com a posição' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'fora da geocerca' })).toHaveCount(1);
    await expect(page.getByText('Fora da geocerca da unidade.', { exact: true })).toBeVisible();
  });

  test('precisão ruim avisa em texto e não impede o registro', async ({ page }) => {
    const backend = await entrar(page);
    const id = emAndamento(backend, [['CIL-006'], ['CIL-007']]);
    await allowLocation(page, { ...DENTRO, accuracy: 450 });
    await abrirChegada(page, id);
    await page.getByRole('button', { name: 'Usar minha posição' }).click();
    await expect(page.getByText('Precisão baixa (cerca de 450 m). Você pode salvar mesmo assim.')).toBeVisible();
    await page.getByRole('button', { name: 'Registrar chegada com a posição' }).click();
    await expect(page.getByText('Posição lida pelo GPS, precisão cerca de 450 m (baixa).')).toBeVisible();
  });

  test('permissão negada: explica, e a chegada segue por coordenadas digitadas ou sem posição', async ({ page }) => {
    const backend = await entrar(page);
    const id = emAndamento(backend, [['CIL-006'], ['CIL-007']]);
    await denyLocation(page);
    await abrirChegada(page, id);
    await page.getByRole('button', { name: 'Usar minha posição' }).click();
    await expect(page.getByText(/A permissão de localização foi negada|Não foi possível obter a posição agora/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Tentar de novo' })).toBeVisible();
    await page.getByLabel('Latitude').fill('-23,5505');
    await page.getByLabel('Longitude').fill('-46,6333');
    await page.getByRole('button', { name: 'Registrar chegada com a posição' }).click();
    await expect(page.getByText('Situação da parada: No local')).toBeVisible();
    expect(backend.trips.stopsOf(id)[0]!.arrival).toMatchObject({ position_source: 'typed', accuracy_m: null });
  });

  test('a posição é opcional: a chegada de um toque segue sem nenhuma posição', async ({ page }) => {
    const backend = await entrar(page);
    const id = emAndamento(backend, [['CIL-006'], ['CIL-007']]);
    await page.goto(`/viagens/${id}`);
    await page.getByRole('button', { name: /Registrar chegada à parada 1/ }).click();
    await expect(page.getByText('Situação da parada: No local')).toBeVisible();
    expect(backend.trips.stopsOf(id)[0]!.arrival ?? null).toBeNull();
  });
});

test.describe('Entrega com a posição', () => {
  async function abrirEntrega(page: Page, backend: MockBackend): Promise<void> {
    const id = emAndamento(backend, [['CIL-006', 'CIL-007'], ['CIL-008']]);
    await page.goto(`/viagens/${id}`);
    await page.getByRole('button', { name: /Registrar chegada à parada 1/ }).click();
    await expect(page.getByText('Situação da parada: No local')).toBeVisible();
    await page.getByRole('button', { name: 'Registrar entrega da parada 1' }).click();
  }

  test('lê o GPS na entrega, mostra a origem e a precisão e guarda no registro', async ({ page }) => {
    const backend = await entrar(page);
    await allowLocation(page, DENTRO);
    await abrirEntrega(page, backend);
    const dialogo = page.getByRole('dialog', { name: 'Registrar entrega · Parada 1' });
    await dialogo.getByRole('button', { name: 'Usar minha posição' }).click();
    await expect(dialogo.getByText('Origem: GPS')).toBeVisible();
    await dialogo.getByLabel('Nome de quem recebeu').fill('Recebedor Fictício');
    await dialogo.getByRole('button', { name: 'Registrar entrega' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByText('Posição lida pelo GPS, precisão cerca de 12 m (boa).')).toBeVisible();
    expect(backend.trips.deliveries.at(-1)).toMatchObject({ position_source: 'gps', accuracy_m: 12 });
  });

  test('coordenadas digitadas pedem confirmação antes de serem substituídas pelo GPS', async ({ page }) => {
    const backend = await entrar(page);
    await allowLocation(page, DENTRO);
    await abrirEntrega(page, backend);
    const dialogo = page.getByRole('dialog', { name: 'Registrar entrega · Parada 1' });
    await dialogo.getByLabel('Latitude').fill('-23,5');
    await dialogo.getByLabel('Longitude').fill('-46,6');
    await expect(dialogo.getByText('Origem: informada')).toBeVisible();
    await dialogo.getByRole('button', { name: 'Usar minha posição' }).click();
    await expect(dialogo.getByText('Substituir as coordenadas digitadas pela posição lida pelo aparelho?')).toBeVisible();
    await dialogo.getByRole('button', { name: 'Manter as digitadas' }).click();
    await expect(dialogo.getByLabel('Latitude')).toHaveValue('-23,5');
    await dialogo.getByRole('button', { name: 'Usar minha posição' }).click();
    await dialogo.getByRole('button', { name: 'Substituir' }).click();
    await expect(dialogo.getByText('Origem: GPS')).toBeVisible();
    await expect(dialogo.getByLabel('Latitude')).toHaveValue('-23.550000');
  });

  test('"no endereço da unidade" substitui a posição e a permissão negada mantém o formulário', async ({ page }) => {
    const backend = await entrar(page);
    await denyLocation(page);
    await abrirEntrega(page, backend);
    const dialogo = page.getByRole('dialog', { name: 'Registrar entrega · Parada 1' });
    await dialogo.getByLabel('Nome de quem recebeu').fill('Recebedor Fictício');
    await dialogo.getByRole('button', { name: 'Usar minha posição' }).click();
    await expect(dialogo.getByRole('button', { name: 'Tentar de novo' })).toBeVisible();
    await expect(dialogo.getByLabel('Nome de quem recebeu')).toHaveValue('Recebedor Fictício');
    await dialogo.getByLabel('Entrega no endereço da unidade').check();
    await expect(dialogo.getByText('Origem: endereço da unidade')).toBeVisible();
    await dialogo.getByRole('button', { name: 'Registrar entrega' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(backend.trips.deliveries.at(-1)).toMatchObject({ position_source: 'site_address', accuracy_m: null });
  });

  test('a entrega sem nenhuma posição continua valendo (posição opcional)', async ({ page }) => {
    const backend = await entrar(page);
    await abrirEntrega(page, backend);
    const dialogo = page.getByRole('dialog', { name: 'Registrar entrega · Parada 1' });
    await dialogo.getByLabel('Nome de quem recebeu').fill('Recebedor Fictício');
    await dialogo.getByRole('button', { name: 'Registrar entrega' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(backend.trips.deliveries.at(-1)).toMatchObject({ position_source: null });
  });

  test('segue o mesmo caminho depois de mudar a posição do aparelho (nova leitura)', async ({ page }) => {
    const backend = await entrar(page);
    await allowLocation(page, DENTRO);
    await abrirEntrega(page, backend);
    const dialogo = page.getByRole('dialog', { name: 'Registrar entrega · Parada 1' });
    await dialogo.getByRole('button', { name: 'Usar minha posição' }).click();
    await expect(dialogo.getByLabel('Latitude')).toHaveValue('-23.550000');
    await moveTo(page, { latitude: -23.56, longitude: -46.64, accuracy: 8 });
    await dialogo.getByRole('button', { name: 'Usar minha posição' }).click();
    await expect(dialogo.getByLabel('Latitude')).toHaveValue('-23.560000');
    await expect(dialogo.getByText(/precisão cerca de 8 m/)).toBeVisible();
  });
});
