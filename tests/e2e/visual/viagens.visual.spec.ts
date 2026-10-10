import { test, expect, type Page } from '@playwright/test';
import { MockBackend } from '../support/mock-backend';
import { ORG_A } from '../support/mock-registry';
import { seedEligibleCylinders } from '../support/mock-trips-plan';
import { entregar, planejar } from '../support/trips-scenario';

// Linha de base visual das telas de viagem (Spec 008, US7) em 360, 768 e 1920 px: lista, formulário, detalhe em cada situação e os
// diálogos. Só Chromium, e as capturas de referência são geradas no Linux (contêiner oficial do Playwright ou CI), porque a
// renderização da fonte difere por sistema. Nunca versione `*-win32.png`. Veja specs/003-design-system-telas/quickstart.md.
test.use({ serviceWorkers: 'block', locale: 'pt-BR', timezoneId: 'America/Sao_Paulo', colorScheme: 'light' });

const AGORA = new Date('2026-10-07T15:30:00.000Z');
const UM_MINUTO_ANTES = new Date(AGORA.getTime() - 60_000);
const LARGURAS = [
  { nome: '360', largura: 360, altura: 740 },
  { nome: '768', largura: 768, altura: 1024 },
  { nome: '1920', largura: 1920, altura: 1080 },
] as const;

// Datas absolutas: a massa do simulado nasce relativa a "hoje", o que mudaria as capturas de um dia para o outro.
const LICENCIAMENTO: Record<string, string | null> = { ABC1234: '2027-05-01', DEF5678: '2026-10-15', GHI1J23: '2027-03-01', JKL9012: null };
const CNH: Record<string, string> = { 'Ana Condutora': '2027-11-01', 'Bruno Condutor': '2027-08-17', 'Carla Condutora': '2026-09-17', 'Diego Inativo': '2027-11-01' };

interface Cenario { planejada: string; carregando: string; andamento: string; concluida: string; cancelada: string }

async function entrar(page: Page): Promise<{ backend: MockBackend; cenario: Cenario }> {
  await page.clock.setFixedTime(AGORA);
  const backend = new MockBackend().asProfile('viagens-admin');
  backend.registry.now = () => AGORA;
  backend.cylinders.now = () => AGORA;
  backend.trips.now = () => AGORA;
  for (const evento of backend.registry.events) evento.occurred_at = '2026-10-01T10:00:00.000Z';
  for (const veiculo of backend.registry.vehicles.filter((item) => item.organization_id === ORG_A)) veiculo.licensing_due_on = LICENCIAMENTO[String(veiculo.plate)] ?? null;
  for (const motorista of backend.registry.drivers.filter((item) => item.organization_id === ORG_A)) motorista.cnh_valid_until = CNH[String(motorista.full_name)] ?? '2027-11-01';
  seedEligibleCylinders(backend.trips);
  for (const cilindro of backend.cylinders.cylinders) { cilindro.hydro_next_due_on = cilindro.hydro_last_result === 'approved' && cilindro.stock_status === 'in_stock' ? '2027-04-01' : cilindro.hydro_next_due_on; }

  // Concluída e cancelada primeiro: ao encerrar, liberam o veículo e o motorista para as viagens seguintes.
  const concluida = planejar(backend, [['CIL-006']], { iniciar: true });
  entregar(backend, concluida.id, concluida.chamar, 1, 'Recebedor Fictício', undefined, UM_MINUTO_ANTES);
  concluida.chamar('complete_trip', { expected_version: 3 });
  const cancelada = planejar(backend, [['CIL-007']]);
  cancelada.chamar('cancel_trip', { expected_version: 1, justification: 'Cliente desistiu da entrega' });
  const planejada = planejar(backend, [['CIL-008', 'CIL-009']], { placa: 'GHI1J23', motorista: 'Bruno Condutor', unidades: [1] });
  const carregando = planejar(backend, [['CIL-010', 'CIL-011'], ['CIL-012']], { unidades: [0, 2] });
  carregando.chamar('start_loading', { expected_version: 1 });
  const checados = backend.trips.itemsOf(carregando.id).find((item) => item.item_status === 'planned');
  if (checados) carregando.chamar('check_item', { item_id: checados.id });
  // Em andamento: a parada 1 com um cilindro não entregue (divergência) e a 2 com a chegada já registrada.
  const andamento = planejar(backend, [['CIL-013', 'CIL-014'], ['CIL-016']], { placa: 'GHI1J23', motorista: 'Bruno Condutor', unidades: [0, 1], iniciar: true });
  entregar(backend, andamento.id, andamento.chamar, 1, 'Recebedor Fictício', 'CIL-014', UM_MINUTO_ANTES);
  const segunda = backend.trips.stopsOf(andamento.id).find((parada) => parada.position === 2)!;
  andamento.chamar('arrive_stop', { stop_id: segunda.id });

  backend.loginResponses = [backend.authenticated()];
  backend.statusResponse = backend.activeStatus('aal2');
  await backend.install(page);
  await page.goto('/');
  await page.getByLabel('E-mail').fill('admin-a@example.invalid');
  await page.getByLabel('Senha', { exact: true }).fill('Local-only-002!');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Visão geral' })).toBeVisible();
  return {
    backend,
    cenario: { planejada: planejada.id, carregando: carregando.id, andamento: andamento.id, concluida: concluida.id, cancelada: cancelada.id },
  };
}

// Telas com modal aberto são capturadas na janela, como a pessoa vê: a captura de página inteira redimensiona a janela e o modal
// (fixo, com rolagem por dentro) deixaria de ser fiel.
async function capturar(page: Page, nome: string, paginaInteira = true): Promise<void> {
  await page.waitForLoadState('networkidle');
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.evaluate(async () => { await document.fonts.ready; });
  await expect(page).toHaveScreenshot(nome, { fullPage: paginaInteira, maxDiffPixelRatio: 0.001, animations: 'disabled', caret: 'hide' });
}

const aguardarHistorico = (page: Page) => expect(page.getByRole('list', { name: 'Eventos do histórico da viagem' })).toBeVisible();

for (const { nome, largura, altura } of LARGURAS) {
  test.describe(`viagens em ${nome} px`, () => {
    test.use({ viewport: { width: largura, height: altura } });

    test('lista', async ({ page }) => {
      await entrar(page);
      await page.goto('/viagens');
      await expect(page.getByRole('heading', { level: 2, name: 'Viagens da organização' })).toBeVisible();
      await expect(page.getByRole('status').filter({ hasText: /viagens? encontradas?/ })).toBeVisible();
      await capturar(page, `viagens-lista-${nome}.png`);
    });

    test('lista com todas as situações', async ({ page }) => {
      await entrar(page);
      await page.goto('/viagens');
      await page.getByLabel('Situação da viagem').selectOption({ label: 'Todas' });
      await expect(page.getByRole('status').filter({ hasText: '5 viagens encontradas' })).toBeVisible();
      await capturar(page, `viagens-lista-todas-${nome}.png`);
    });

    test('formulário de planejamento', async ({ page }) => {
      await entrar(page);
      await page.goto('/viagens/nova');
      const formulario = page.getByRole('dialog', { name: 'Planejar viagem' });
      await expect(formulario).toBeVisible();
      await formulario.getByLabel('Unidade da parada 1').selectOption({ index: 1 });
      await formulario.getByRole('button', { name: 'Adicionar cilindros à parada 1' }).click();
      await expect(formulario.getByRole('button', { name: 'Adicionar CIL-017' })).toBeVisible();
      await capturar(page, `viagens-formulario-${nome}.png`, false);
    });

    for (const [chave, titulo, rotulo] of [
      ['planejada', 'Viagem n.º 3', 'planejada'], ['carregando', 'Viagem n.º 4', 'carregando'], ['andamento', 'Viagem n.º 5', 'andamento'],
      ['concluida', 'Viagem n.º 1', 'concluida'], ['cancelada', 'Viagem n.º 2', 'cancelada'],
    ] as const) {
      test(`detalhe ${rotulo}`, async ({ page }) => {
        const { cenario } = await entrar(page);
        await page.goto(`/viagens/${cenario[chave]}`);
        await expect(page.getByRole('heading', { level: 2, name: titulo })).toBeVisible();
        await aguardarHistorico(page);
        await capturar(page, `viagens-detalhe-${rotulo}-${nome}.png`);
      });
    }

    test('diálogo de registrar entrega', async ({ page }) => {
      const { cenario } = await entrar(page);
      await page.goto(`/viagens/${cenario.andamento}`);
      await aguardarHistorico(page);
      await page.getByRole('button', { name: 'Registrar entrega da parada 2' }).click();
      const dialogo = page.getByRole('dialog', { name: 'Registrar entrega · Parada 2' });
      await expect(dialogo).toBeVisible();
      await capturar(page, `viagens-dialogo-entrega-${nome}.png`, false);
    });

    test('diálogo de registrar desbloqueio', async ({ page }) => {
      const { cenario } = await entrar(page);
      await page.goto(`/viagens/${cenario.andamento}`);
      await aguardarHistorico(page);
      await page.getByRole('button', { name: 'Registrar desbloqueio de CIL-013' }).click();
      await expect(page.getByRole('dialog', { name: 'Registrar desbloqueio · CIL-013' })).toBeVisible();
      await capturar(page, `viagens-dialogo-desbloqueio-${nome}.png`, false);
    });

    test('diálogo de devolver ao estoque', async ({ page }) => {
      const { cenario } = await entrar(page);
      await page.goto(`/viagens/${cenario.andamento}`);
      await aguardarHistorico(page);
      await page.getByRole('button', { name: 'Devolver CIL-014 ao estoque' }).click();
      await expect(page.getByRole('dialog', { name: 'Devolver CIL-014 ao estoque' })).toBeVisible();
      await capturar(page, `viagens-dialogo-devolucao-${nome}.png`, false);
    });

    test('diálogo de cancelar a viagem', async ({ page }) => {
      const { cenario } = await entrar(page);
      await page.goto(`/viagens/${cenario.planejada}`);
      await aguardarHistorico(page);
      await page.getByRole('button', { name: 'Cancelar viagem' }).click();
      await expect(page.getByRole('dialog', { name: 'Cancelar a viagem n.º 3' })).toBeVisible();
      await capturar(page, `viagens-dialogo-cancelar-${nome}.png`, false);
    });
  });
}
