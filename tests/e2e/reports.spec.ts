import { readFile } from 'node:fs/promises';
import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { REPORT_DOWNLOAD_PATH } from './support/mock-reports';
import { entrar, semRolagemHorizontal } from './support/trips-scenario';

test.use({ serviceWorkers: 'block' });

// Spec 015 (T075; US5, CS-007, CS-010, CS-012, CS-015): os seis relatórios abrem com a leitura de cada tipo; quem só consulta não
// exporta e a tela explica; quem exporta baixa um CSV com o mesmo recorte da tabela e a observação perigosa neutralizada. Axe sem
// violação crítica ou grave e sem rolagem horizontal em 360, 768 e 1920 px.
const TIPOS = [
  ['trips', 'Viagens'], ['telemetry_availability', 'Disponibilidade de telemetria'], ['proximity', 'Ocorrências de proximidade'],
  ['alerts', 'Alertas'], ['deliveries', 'Entregas'], ['custody', 'Histórico de custódia'],
] as const;

async function abrirMenu(page: Page): Promise<void> {
  const menu = page.getByRole('button', { name: 'Menu' });
  if (await menu.isVisible()) await menu.click();
}

test.describe('Relatórios essenciais', () => {
  test('quem só consulta abre os seis relatórios pelo menu, sem exportação', async ({ page }) => {
    await entrar(page, 'relatorios-consulta');
    await abrirMenu(page);
    await page.getByRole('link', { name: 'Relatórios' }).first().click();
    const lista = page.getByRole('list', { name: 'Relatórios disponíveis' });
    await expect(lista.getByRole('link')).toHaveCount(6);
    await expect(page.getByText('Sua conta consulta, mas não exporta relatórios.')).toBeVisible();
    for (const [tipo, rotulo] of TIPOS) {
      await page.goto(`/relatorios/${tipo}`);
      await expect(page.getByRole('heading', { level: 2, name: rotulo })).toBeVisible();
      await expect(page.getByRole('table', { name: 'Linhas do relatório' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Exportar CSV' })).toHaveCount(0);
      await expect(page.getByText('Sua conta pode consultar este relatório, mas não exportar.')).toBeVisible();
    }
  });

  test('o gestor exporta: o CSV tem o mesmo recorte da tabela e neutraliza fórmula', async ({ page, browserName }) => {
    const backend = await entrar(page, 'rastreamento-gestor');
    await page.goto('/relatorios/proximity');
    const tabela = page.getByRole('table', { name: 'Linhas do relatório' });
    await expect(tabela).toContainText('TRK-A-1');
    await expect(tabela).toContainText('TRK-A-2');
    await page.getByRole('button', { name: 'Exportar CSV' }).click();
    await expect(page.getByText(/Arquivo pronto: 2 linhas/)).toBeVisible();
    const baixar = page.getByRole('button', { name: 'Baixar CSV' });
    let csv: string;
    if (browserName === 'webkit') {
      // O WebKit do Playwright no Windows não emite `download` nem entrega o corpo de resposta simulada com anexo: confere-se o pedido
      // ao endereço assinado e o arquivo que o backend serve nele.
      const [pedido] = await Promise.all([page.waitForRequest((r) => r.url().includes(REPORT_DOWNLOAD_PATH)), baixar.click()]);
      const id = new URL(pedido.url()).pathname.slice(REPORT_DOWNLOAD_PATH.length).replace(/\.csv$/, '');
      csv = backend.reports.csvOf(id) ?? '';
    } else {
      const [download] = await Promise.all([page.waitForEvent('download'), baixar.click()]);
      csv = await readFile(await download.path(), 'utf8');
    }
    const linhas = (csv.charCodeAt(0) === 0xfeff ? csv.slice(1) : csv).split('\r\n').filter(Boolean);
    expect(linhas).toHaveLength(3);
    expect(linhas[0]).toBe('Empresa;Relatório;Gerado em;Critérios;Fuso horário;Cilindro;Observação');
    expect(linhas[1]).toContain(';TRK-A-1;');
    expect(linhas[1]).toContain(`"'=HYPERLINK(""http://x"")"`);
    expect(linhas[2]).toContain(';TRK-A-2;Carga conferida.');
  });

  test('sem a leitura do tipo, o relatório não abre', async ({ page }) => {
    await entrar(page, 'rastreamento-gestor');
    await page.goto('/relatorios/custody');
    await expect(page.getByText('Acesso negado')).toBeVisible();
  });

  test('acessibilidade e sem rolagem horizontal em 360, 768 e 1920 px', async ({ page, browserName }, testInfo) => {
    test.skip(browserName !== 'chromium' || testInfo.project.name !== 'desktop-chromium', 'As larguras são aplicadas dentro do teste; uma execução basta.');
    await entrar(page, 'rastreamento-gestor');
    for (const largura of [360, 768, 1920]) {
      await page.setViewportSize({ width: largura, height: 900 });
      for (const caminho of ['/relatorios', '/relatorios/proximity']) {
        await page.goto(caminho);
        await expect(page.getByRole('heading', { level: 2 }).first()).toBeVisible();
        if (caminho !== '/relatorios') await expect(page.getByRole('table', { name: 'Linhas do relatório' })).toBeVisible();
        const resultado = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag22aa']).analyze();
        expect(resultado.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious'), `${caminho} ${largura}px`).toEqual([]);
        expect(await semRolagemHorizontal(page), `${caminho} ${largura}px`).toBe(true);
      }
    }
  });
});
