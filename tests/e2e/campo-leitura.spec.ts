import { test, expect, type Page } from '@playwright/test';
import { MockBackend, type PermissionProfile } from './support/mock-backend';
import { installFieldReaders, type FieldReaders } from './support/mock-field-reading';
import { ORG_A } from './support/mock-registry';
import { seedEligibleCylinders } from './support/mock-trips-plan';

test.use({ serviceWorkers: 'block' });

// Spec 009, US1: conferir e entregar lendo os cilindros, com backend simulado e leitores simulados (sem câmera, NFC nem GPS de
// verdade). Cobre a leitura pela câmera e por NFC, o código digitado, as recusas, a ausência de suporte e a entrega com o método por
// cilindro. A leitura real em aparelho Android é conferida na validação humana (quickstart.md).
interface Setup { backend: MockBackend; readers: FieldReaders }

async function entrar(page: Page, opcoes: { camera?: boolean; nfc?: boolean } = { camera: true, nfc: true }, perfil: PermissionProfile = 'viagens-admin'): Promise<Setup> {
  const readers = await installFieldReaders(page, opcoes);
  const backend = new MockBackend().asProfile(perfil);
  backend.loginResponses = [backend.authenticated()];
  backend.statusResponse = backend.activeStatus('aal1');
  seedEligibleCylinders(backend.trips);
  // Etiqueta NFC no CIL-008, com o número de série cadastrado em hexadecimal (formato que a leitura resolve).
  const cil008 = backend.cylinders.cylinders.find((c) => c.serial_number === 'CIL-008')!;
  backend.cylinders.identifiers.push({
    id: '73000000-0000-4000-8000-000000000990', organization_id: ORG_A, cylinder_id: cil008.id, kind: 'nfc_tag', value: '04A23B1C', status: 'active',
    created_at: '2026-10-01T10:00:00Z', deactivated_at: null, deactivation_justification: null, transferred: false,
  });
  await backend.install(page);
  await page.goto('/');
  await page.getByLabel('E-mail').fill('admin-a@example.invalid');
  await page.getByLabel('Senha', { exact: true }).fill('Local-only-002!');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Visão geral' })).toBeVisible();
  return { backend, readers };
}

const idDe = (backend: MockBackend, serial: string): string => backend.cylinders.cylinders.find((c) => c.serial_number === serial)!.id;

function planejar(backend: MockBackend, seriais: string[]): string {
  const resposta = backend.trips.handle('manage', {
    operation: 'create_trip', organization_id: ORG_A, request_id: crypto.randomUUID(), planned_date: backend.trips.today(),
    vehicle_id: backend.registry.vehicles.find((v) => v.plate === 'ABC1234')!.id, driver_id: backend.registry.drivers.find((d) => d.full_name === 'Ana Condutora')!.id,
    stops: [{ site_id: backend.registry.sites[0]!.id, cylinder_ids: seriais.map((serial) => idDe(backend, serial)) }],
  }, () => true);
  expect(resposta.status, JSON.stringify(resposta.json)).toBe(200);
  return String(resposta.json.trip_id);
}

async function carregando(page: Page, id: string): Promise<void> {
  await page.goto(`/viagens/${id}`);
  await page.getByRole('button', { name: 'Iniciar carregamento' }).click();
  await expect(page.getByRole('heading', { name: 'Conferência da carga' })).toBeVisible();
}

const metodos = (backend: MockBackend, id: string): (string | null | undefined)[] =>
  backend.trips.itemsOf(id).map((item) => (item as { check_source?: string | null }).check_source).sort();
const conferidos = (backend: MockBackend, id: string): number => backend.trips.itemsOf(id).filter((item) => item.item_status === 'checked').length;

// O resultado fica à vista e é anunciado em uma região de status; aqui basta ver o texto no leitor aberto.
const leitor = (page: Page) => page.getByRole('dialog', { name: 'Ler cilindro' });

test.describe('Conferência por leitura', () => {
  test('confere pela câmera, por NFC e pelo código digitado, e o servidor guarda o método', async ({ page }) => {
    const { backend, readers } = await entrar(page);
    const id = planejar(backend, ['CIL-006', 'CIL-007', 'CIL-008']);
    await carregando(page, id);
    await expect(page.getByText('0 de 3 conferidos')).toBeVisible();

    await page.getByRole('button', { name: 'Ler cilindro' }).click();
    await expect(leitor(page)).toBeVisible();
    await readers.scan('QR-006');
    await expect(leitor(page).getByText('Cilindro CIL-006 conferido.')).toBeVisible();
    await expect(leitor(page).getByText('1 de 3 conferidos')).toBeVisible();

    await leitor(page).getByRole('button', { name: 'NFC' }).click();
    await readers.tapNfc({ serialNumber: '04:a2:3b:1c' });
    await expect(leitor(page).getByText('Cilindro CIL-008 conferido.')).toBeVisible();
    await leitor(page).getByRole('button', { name: 'Fechar' }).click();
    await expect(page.getByText('2 de 3 conferidos')).toBeVisible();

    await page.getByLabel('Código do cilindro').fill('QR-007');
    await page.getByRole('button', { name: 'Conferir código' }).click();
    await expect(page.getByText('3 de 3 conferidos')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Iniciar viagem' })).toBeEnabled();
    expect(metodos(backend, id)).toEqual(['camera', 'nfc', 'typed']);
  });

  test('o mesmo código lido duas vezes seguidas conta uma só', async ({ page }) => {
    const { backend, readers } = await entrar(page);
    const id = planejar(backend, ['CIL-006', 'CIL-007']);
    await carregando(page, id);
    await page.getByRole('button', { name: 'Ler cilindro' }).click();
    await readers.scan('QR-006');
    await expect(leitor(page).getByText('Cilindro CIL-006 conferido.')).toBeVisible();
    await readers.scan('QR-006');
    await page.waitForTimeout(700);
    await expect(leitor(page).getByText('1 de 2 conferidos')).toBeVisible();
    expect(conferidos(backend, id)).toBe(1);
  });

  test('recusa o cilindro de outra viagem, o inexistente e o de outra organização, sem conferir nada', async ({ page }) => {
    const { backend, readers } = await entrar(page);
    const id = planejar(backend, ['CIL-006', 'CIL-007']);
    await carregando(page, id);
    await page.getByRole('button', { name: 'Ler cilindro' }).click();

    await readers.scan('QR-009');
    await expect(leitor(page).getByText(/Cilindro CIL-009 não pertence a esta viagem/)).toBeVisible();
    await readers.scan('QR-NAO-EXISTE');
    await expect(leitor(page).getByText('Cilindro não encontrado.')).toBeVisible();
    // O valor QR-B-1 só existe no Tenant B: para este tenant a resposta é a mesma de código inexistente.
    await readers.scan('QR-B-1');
    await expect(leitor(page).getByText('Cilindro não encontrado.')).toBeVisible();
    expect(conferidos(backend, id)).toBe(0);
  });

  test('mais de um código no quadro: avisa e não confere nada', async ({ page }) => {
    const { backend, readers } = await entrar(page);
    const id = planejar(backend, ['CIL-006', 'CIL-007']);
    await carregando(page, id);
    await page.getByRole('button', { name: 'Ler cilindro' }).click();
    await readers.scan('QR-006', 'QR-007');
    await expect(leitor(page).getByText('Há mais de um código no quadro. Aponte para um só.')).toBeVisible();
    expect(conferidos(backend, id)).toBe(0);
  });

  test('etiqueta NFC com valor em outro formato: "não encontrado" com a dica; etiqueta ilegível: aviso próprio', async ({ page }) => {
    const { backend, readers } = await entrar(page, { camera: false, nfc: true });
    const id = planejar(backend, ['CIL-006', 'CIL-008']);
    await carregando(page, id);
    await page.getByRole('button', { name: 'Ler cilindro' }).click();
    await readers.tapNfc({ serialNumber: '99:99:99:99' });
    await expect(leitor(page).getByText('Cilindro não encontrado. Confira o formato do valor cadastrado.')).toBeVisible();
    await readers.tapUnreadableNfc();
    await expect(leitor(page).getByText('Não foi possível ler a etiqueta. Digite o código ou tente outra.')).toBeVisible();
    expect(conferidos(backend, id)).toBe(0);
  });
});

// Planeja, carrega, confere tudo e inicia direto no simulado (esses passos têm o seu E2E) e devolve a viagem em andamento.
function emAndamento(backend: MockBackend, seriais: string[]): string {
  const id = planejar(backend, seriais);
  const chamar = (operation: string, extra: Record<string, unknown>) => backend.trips.handle('manage', { operation, organization_id: ORG_A, request_id: crypto.randomUUID(), trip_id: id, ...extra }, () => true);
  chamar('start_loading', { expected_version: 1 });
  for (const item of backend.trips.itemsOf(id)) chamar('check_item', { item_id: item.id });
  expect(chamar('start_trip', { expected_version: 2 }).status).toBe(200);
  return id;
}

test.describe('Entrega por leitura', () => {
  test('o código lido marca o cilindro da parada, recusa o que não é dela e a entrega guarda o método por cilindro', async ({ page }) => {
    const { backend, readers } = await entrar(page);
    const id = emAndamento(backend, ['CIL-006', 'CIL-007']);
    await page.goto(`/viagens/${id}`);
    await page.getByRole('button', { name: /Registrar chegada à parada 1/ }).click();
    await expect(page.getByText('Situação da parada: No local')).toBeVisible();
    await page.getByRole('button', { name: 'Registrar entrega da parada 1' }).click();
    const dialogo = page.getByRole('dialog', { name: 'Registrar entrega · Parada 1' });

    await dialogo.getByRole('button', { name: 'Ler cilindro' }).click();
    const leitorEntrega = page.getByRole('dialog', { name: 'Ler cilindro' });
    await readers.scan('QR-009');
    await expect(leitorEntrega.getByText('Cilindro CIL-009 não está previsto nesta parada.')).toBeVisible();
    await readers.scan('QR-006');
    await expect(leitorEntrega.getByText('Cilindro CIL-006 marcado como entregue.')).toBeVisible();
    await leitorEntrega.getByRole('button', { name: 'Fechar' }).click();
    await expect(dialogo.getByText('Entregue por câmera')).toBeVisible();

    await dialogo.getByLabel('Nome de quem recebeu').fill('Recebedor Fictício');
    await dialogo.getByRole('button', { name: 'Registrar entrega' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    const entrega = backend.trips.deliveries.at(-1)!;
    expect((entrega.results as { item_id: string; source?: string }[]).map((result) => result.source).sort()).toEqual(['camera', 'manual']);
  });
});

test.describe('Sem suporte a câmera nem NFC', () => {
  test('o botão de leitura não aparece, o texto explica e o código digitado e o toque seguem completos', async ({ page }) => {
    const { backend } = await entrar(page, {});
    const id = planejar(backend, ['CIL-006', 'CIL-007']);
    await carregando(page, id);
    await expect(page.getByText('Leitura por câmera ou NFC indisponível neste aparelho. Digite o código ou use um leitor.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Ler cilindro' })).toHaveCount(0);

    await page.getByLabel('Código do cilindro').fill('QR-006');
    await page.getByRole('button', { name: 'Conferir código' }).click();
    await expect(page.getByText('1 de 2 conferidos')).toBeVisible();
    await page.getByRole('button', { name: 'Conferir CIL-007' }).click();
    await expect(page.getByText('2 de 2 conferidos')).toBeVisible();
    expect(metodos(backend, id)).toEqual(['manual', 'typed']);
  });
});
