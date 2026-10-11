import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { entrar, entregar, planejar, semRolagemHorizontal } from './support/trips-scenario';

test.use({ serviceWorkers: 'block' });

// Spec 008, US7: acessibilidade das telas de viagem (WCAG 2.2 AA). Axe sem violação crítica ou grave e sem rolagem horizontal em 360,
// 768 e 1920 px na lista, no formulário, no detalhe e em cada diálogo; teclado; foco devolvido ao disparador; no máximo um
// `role="status"` por tela; e movimento reduzido. As larguras são aplicadas dentro do teste, por isso ele roda uma vez (desktop).
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

async function emTodasAsLarguras(page: Page, nome: string, aposAjustar: () => Promise<void>): Promise<void> {
  for (const largura of LARGURAS) {
    await page.setViewportSize({ width: largura, height: 900 });
    await aposAjustar();
    await verificar(page, `${nome} em ${largura}px`);
  }
}

test.describe('Acessibilidade das viagens', () => {
  test.beforeEach(({ browserName }, testInfo) => {
    test.skip(browserName !== 'chromium' || testInfo.project.name.startsWith('mobile'), 'As larguras são aplicadas dentro do teste; uma execução basta.');
    // Cada teste de larguras roda a análise do axe vezes demais para o limite padrão quando a máquina está ocupada.
    test.setTimeout(120_000);
  });

  test('lista, formulário e detalhe não têm violação grave nem rolagem horizontal em 360, 768 e 1920 px', async ({ page }) => {
    const backend = await entrar(page);
    const planejada = planejar(backend, [['CIL-006', 'CIL-007']]);
    const carregando = planejar(backend, [['CIL-008']], { placa: 'GHI1J23', motorista: 'Bruno Condutor', unidades: [1] });
    carregando.chamar('start_loading', { expected_version: 1 });
    const emRota = planejar(backend, [['CIL-009']], { unidades: [2], iniciar: true });
    void emRota;

    await emTodasAsLarguras(page, 'lista de viagens', async () => {
      await page.goto('/viagens');
      await expect(page.getByRole('link', { name: 'n.º 1' })).toBeVisible();
    });
    await emTodasAsLarguras(page, 'formulário de planejamento', async () => {
      await page.goto('/viagens/nova');
      await expect(page.getByRole('dialog', { name: 'Planejar viagem' })).toBeVisible();
    });
    await emTodasAsLarguras(page, 'detalhe da viagem planejada', async () => {
      await page.goto(`/viagens/${planejada.id}`);
      await expect(page.getByRole('heading', { level: 2, name: 'Viagem n.º 1' })).toBeVisible();
    });
    await emTodasAsLarguras(page, 'detalhe da viagem em carregamento', async () => {
      await page.goto(`/viagens/${carregando.id}`);
      await expect(page.getByRole('heading', { level: 2, name: 'Viagem n.º 2' })).toBeVisible();
    });
    await emTodasAsLarguras(page, 'detalhe da viagem em andamento, com histórico', async () => {
      await page.goto(`/viagens/${emRota.id}`);
      await expect(page.getByRole('heading', { level: 2, name: 'Viagem n.º 3' })).toBeVisible();
      await expect(page.getByRole('list', { name: 'Eventos do histórico da viagem' })).toBeVisible();
    });
  });

  test('cada diálogo não tem violação grave nem rolagem horizontal em 360, 768 e 1920 px', async ({ page }) => {
    const backend = await entrar(page);
    const carregando = planejar(backend, [['CIL-006', 'CIL-007']]);
    carregando.chamar('start_loading', { expected_version: 1 });
    const andamento = planejar(backend, [['CIL-008', 'CIL-009'], ['CIL-010']], { placa: 'GHI1J23', motorista: 'Bruno Condutor', unidades: [1, 2], iniciar: true });
    entregar(backend, andamento.id, andamento.chamar, 1, 'Recebedor Fictício', 'CIL-009');
    andamento.chamar('arrive_stop', { stop_id: backend.trips.stopsOf(andamento.id).find((parada) => parada.position === 2)!.id });

    const casos: { nome: string; viagem: string; abrir: string; dialogo: string }[] = [
      { nome: 'retirar da viagem', viagem: carregando.id, abrir: 'Retirar CIL-007 da viagem', dialogo: 'Retirar CIL-007 da viagem' },
      { nome: 'cancelar a viagem', viagem: carregando.id, abrir: 'Cancelar viagem', dialogo: 'Cancelar a viagem n.º 1' },
      { nome: 'registrar entrega', viagem: andamento.id, abrir: 'Registrar entrega da parada 2', dialogo: 'Registrar entrega · Parada 2' },
      { nome: 'registrar desbloqueio', viagem: andamento.id, abrir: 'Registrar desbloqueio de CIL-008', dialogo: 'Registrar desbloqueio · CIL-008' },
      { nome: 'devolver ao estoque', viagem: andamento.id, abrir: 'Devolver CIL-009 ao estoque', dialogo: 'Devolver CIL-009 ao estoque' },
    ];
    for (const caso of casos) {
      await emTodasAsLarguras(page, `diálogo "${caso.nome}"`, async () => {
        await page.goto(`/viagens/${caso.viagem}`);
        const gatilho = page.getByRole('button', { name: caso.abrir });
        await gatilho.scrollIntoViewIfNeeded();
        await gatilho.click();
        await expect(page.getByRole('dialog', { name: caso.dialogo })).toBeVisible();
      });
    }
  });

  test('só pelo teclado: abre o diálogo, Escape fecha e o foco volta ao disparador', async ({ page }) => {
    const backend = await entrar(page);
    const { id } = planejar(backend, [['CIL-006']]);
    await page.goto(`/viagens/${id}`);
    const gatilho = page.getByRole('button', { name: 'Cancelar viagem' });
    await gatilho.focus();
    await page.keyboard.press('Enter');
    const dialogo = page.getByRole('dialog', { name: 'Cancelar a viagem n.º 1' });
    await expect(dialogo).toBeVisible();
    // O foco entra no diálogo e fica preso nele.
    for (let passo = 0; passo < 8; passo += 1) {
      await page.keyboard.press('Tab');
      expect(await page.evaluate(() => document.activeElement?.closest('[role="dialog"]') !== null)).toBe(true);
    }
    await page.keyboard.press('Escape');
    await expect(dialogo).toHaveCount(0);
    await expect(gatilho).toBeFocused();
  });

  test('só pelo teclado: conferir a carga e iniciar a viagem', async ({ page }) => {
    const backend = await entrar(page);
    const { id, chamar } = planejar(backend, [['CIL-006']]);
    chamar('start_loading', { expected_version: 1 });
    await page.goto(`/viagens/${id}`);
    const conferir = page.getByRole('button', { name: 'Conferir CIL-006' });
    await conferir.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('status').filter({ hasText: 'Cilindro CIL-006 conferido.' })).toHaveCount(1);
    const iniciar = page.getByRole('button', { name: 'Iniciar viagem' });
    await expect(iniciar).toBeEnabled();
    await iniciar.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByText('Situação da viagem: Em andamento')).toBeVisible();
  });

  test('no máximo um role="status" por tela', async ({ page }) => {
    const backend = await entrar(page);
    const { id, chamar } = planejar(backend, [['CIL-006']], { iniciar: true });
    entregar(backend, id, chamar, 1);
    for (const caminho of ['/viagens', `/viagens/${id}`, '/viagens/nova']) {
      await page.goto(caminho);
      await page.waitForLoadState('networkidle');
      // Fora o estado de conexão da barra superior (do shell), a tela de viagens tem uma só região de status.
      // A lista atrás do formulário fica inerte e não é exposta a leitor de tela.
      expect(await page.getByRole('main').locator('[role="status"]:not([inert] *)').count(), caminho).toBeLessThanOrEqual(1);
    }
  });

  test('movimento reduzido: o diálogo abre sem transição', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const backend = await entrar(page);
    const { id } = planejar(backend, [['CIL-006']]);
    await page.goto(`/viagens/${id}`);
    await page.getByRole('button', { name: 'Cancelar viagem' }).click();
    const dialogo = page.getByRole('dialog', { name: 'Cancelar a viagem n.º 1' });
    await expect(dialogo).toBeVisible();
    const duracoes = await dialogo.evaluate((no) => {
      const estilo = getComputedStyle(no);
      return { animacao: estilo.animationDuration, transicao: estilo.transitionDuration };
    });
    for (const valor of Object.values(duracoes)) {
      expect(valor.split(',').every((parte) => parseFloat(parte) <= 0.01), `duração ${valor}`).toBe(true);
    }
  });
});
