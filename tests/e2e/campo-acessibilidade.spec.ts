import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { installFieldReaders, type FieldReaders } from './support/mock-field-reading';
import { allowLocation } from './support/mock-geolocation';
import { entrar, planejar, semRolagemHorizontal } from './support/trips-scenario';

test.use({ serviceWorkers: 'block' });

// Spec 009, US4: acessibilidade da leitura e da posição (WCAG 2.2 AA). Axe sem violação crítica ou grave e sem rolagem horizontal em 360, 768
// e 1920 px, com zoom de 200% (reflow) e em paisagem; só com teclado; resultado anunciado em uma região de status; movimento reduzido; e o
// desligamento da câmera por inatividade. As larguras são aplicadas dentro do teste, por isso ele roda uma vez (desktop Chromium).
const LARGURAS = [360, 768, 1920] as const;

async function semViolacoes(page: Page, contexto: string): Promise<void> {
  const resultado = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag22aa']).analyze();
  const bloqueantes = resultado.violations.filter((violacao) => violacao.impact === 'critical' || violacao.impact === 'serious');
  const evidencia = bloqueantes.map((violacao) => `${violacao.impact}: ${violacao.id} em ${violacao.nodes.map((no) => no.target.join(', ')).join('; ')}`).join('\n');
  expect(bloqueantes, `${contexto}\n${evidencia}`).toEqual([]);
}
async function verificar(page: Page, contexto: string): Promise<void> {
  await semViolacoes(page, contexto);
  expect(await semRolagemHorizontal(page), `${contexto}: rolagem horizontal`).toBe(true);
}
// O shell troca de layout com a largura e remonta o conteúdo, então cada janela é aberta DEPOIS de ajustar a largura.
async function emTodasAsLarguras(page: Page, nome: string, preparar: () => Promise<void>): Promise<void> {
  for (const largura of LARGURAS) {
    await page.setViewportSize({ width: largura, height: 900 });
    await preparar();
    await verificar(page, `${nome} em ${largura}px`);
  }
}

interface Cenario { page: Page; readers: FieldReaders; carregando: string; andamento: string }
async function montar(page: Page): Promise<Cenario> {
  const readers = await installFieldReaders(page, { camera: true, nfc: true });
  await allowLocation(page, { latitude: -23.55, longitude: -46.633, accuracy: 12 });
  const backend = await entrar(page);
  const carregando = planejar(backend, [['CIL-006', 'CIL-007']]);
  carregando.chamar('start_loading', { expected_version: 1 });
  const andamento = planejar(backend, [['CIL-008'], ['CIL-009']], { placa: 'GHI1J23', motorista: 'Bruno Condutor', unidades: [1, 2], iniciar: true });
  return { page, readers, carregando: carregando.id, andamento: andamento.id };
}

const leitor = (page: Page) => page.getByRole('dialog', { name: 'Ler cilindro' });

test.describe('Acessibilidade da leitura e da posição', () => {
  test.beforeEach(({ browserName }, testInfo) => {
    test.skip(browserName !== 'chromium' || testInfo.project.name.startsWith('mobile'), 'As larguras são aplicadas dentro do teste; uma execução basta.');
    test.setTimeout(150_000);
  });

  test('o leitor, o campo de código, a posição e a consulta não têm violação grave nem rolagem horizontal em 360, 768 e 1920 px', async ({ page }) => {
    const { carregando, andamento } = await montar(page);

    await emTodasAsLarguras(page, 'conferência com o campo de código', async () => {
      await page.goto(`/viagens/${carregando}`);
      await expect(page.getByRole('heading', { name: 'Conferência da carga' })).toBeVisible();
      await expect(page.getByLabel('Código do cilindro')).toBeVisible();
    });
    await emTodasAsLarguras(page, 'leitor aberto na conferência', async () => {
      await page.goto(`/viagens/${carregando}`);
      await page.getByRole('button', { name: 'Ler cilindro' }).click();
      await expect(leitor(page)).toBeVisible();
    });
    await emTodasAsLarguras(page, 'chegada com a posição lida', async () => {
      await page.goto(`/viagens/${andamento}`);
      await page.getByRole('button', { name: 'Chegada com a posição da parada 1 (Matriz)' }).click();
      await page.getByRole('button', { name: 'Usar minha posição' }).click();
      await expect(page.getByText('Origem: GPS')).toBeVisible();
    });
    await emTodasAsLarguras(page, 'consulta por leitura', async () => {
      await page.goto('/cilindros');
      await page.getByRole('button', { name: 'Ler cilindro' }).click();
      await expect(leitor(page)).toBeVisible();
    });
  });

  test('a entrega com leitura e posição não tem violação grave nem rolagem horizontal em 360, 768 e 1920 px', async ({ page }) => {
    const { andamento } = await montar(page);
    await page.goto(`/viagens/${andamento}`);
    await page.getByRole('button', { name: /Registrar chegada à parada 1/ }).click();
    await expect(page.getByText('Situação da parada: No local')).toBeVisible();
    await emTodasAsLarguras(page, 'entrega com leitura e posição', async () => {
      await page.goto(`/viagens/${andamento}`);
      await page.getByRole('button', { name: 'Registrar entrega da parada 1' }).click();
      const dialogo = page.getByRole('dialog', { name: 'Registrar entrega · Parada 1' });
      await expect(dialogo).toBeVisible();
      await dialogo.getByRole('button', { name: 'Usar minha posição' }).click();
      await expect(dialogo.getByText('Origem: GPS')).toBeVisible();
    });
  });

  test('só com teclado: abre o leitor, o foco fica dentro, o resultado é anunciado e Escape devolve o foco ao botão', async ({ page }) => {
    const { readers, carregando } = await montar(page);
    await page.goto(`/viagens/${carregando}`);
    const botao = page.getByRole('button', { name: 'Ler cilindro' });
    await expect(botao).toBeVisible();
    await botao.focus();
    await page.keyboard.press('Enter');
    await expect(leitor(page)).toBeVisible();
    for (let i = 0; i < 8; i += 1) {
      await page.keyboard.press('Tab');
      expect(await page.evaluate(() => Boolean(document.activeElement?.closest('[role="dialog"]'))), `Tab ${i + 1} saiu da janela`).toBe(true);
    }
    await readers.scan('QR-006');
    const status = leitor(page).getByRole('status');
    await expect(status).toHaveCount(1);
    await expect(status).toContainText('Cilindro CIL-006 conferido.');
    await page.keyboard.press('Escape');
    await expect(leitor(page)).toHaveCount(0);
    await expect(botao).toBeFocused();
  });

  test('a posição por teclado: ler, ver a origem e a precisão em texto e registrar a chegada sem usar o mouse', async ({ page }) => {
    const { andamento } = await montar(page);
    await page.goto(`/viagens/${andamento}`);
    await page.getByRole('button', { name: 'Chegada com a posição da parada 1 (Matriz)' }).focus();
    await page.keyboard.press('Enter');
    await page.getByRole('button', { name: 'Usar minha posição' }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByText('Origem: GPS')).toBeVisible();
    await page.getByRole('button', { name: 'Registrar chegada com a posição' }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByText('Situação da parada: No local')).toBeVisible();
  });

  test('zoom de 200% (320 px) e paisagem (740 por 360 px) sem rolagem horizontal e sem violação grave', async ({ page }) => {
    const { carregando } = await montar(page);
    for (const [largura, altura] of [[320, 700], [740, 360]] as const) {
      await page.setViewportSize({ width: largura, height: altura });
      await page.goto(`/viagens/${carregando}`);
      await page.getByRole('button', { name: 'Ler cilindro' }).click();
      await expect(leitor(page)).toBeVisible();
      await verificar(page, `leitor em ${largura}x${altura}`);
    }
  });

  test('movimento reduzido: o leitor abre sem nenhuma animação', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const { carregando } = await montar(page);
    await page.goto(`/viagens/${carregando}`);
    await page.getByRole('button', { name: 'Ler cilindro' }).click();
    await expect(leitor(page)).toBeVisible();
    expect(await page.evaluate(() => document.getAnimations().filter((animation) => animation.playState === 'running').length)).toBe(0);
  });

  test('o leitor parado por 2 minutos desliga, avisa em texto e "Continuar lendo" liga de novo', async ({ page }) => {
    const { carregando } = await montar(page);
    await page.goto(`/viagens/${carregando}`);
    await page.clock.install();
    await page.getByRole('button', { name: 'Ler cilindro' }).click();
    await expect(leitor(page)).toBeVisible();
    await page.clock.runFor(1_000);
    await page.clock.fastForward('02:05');
    await expect(leitor(page).getByRole('status')).toContainText('A leitura foi pausada por inatividade.');
    await expect(leitor(page)).toBeVisible();
    await leitor(page).getByRole('button', { name: 'Continuar lendo' }).click();
    await expect(leitor(page).getByRole('button', { name: 'Continuar lendo' })).toHaveCount(0);
    await expect(leitor(page).getByRole('status')).not.toContainText('pausada por inatividade');
  });
});
