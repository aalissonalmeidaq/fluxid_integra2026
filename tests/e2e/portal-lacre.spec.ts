import { test, expect, type Page, type Route } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
import path from 'node:path';

// Spec 013, US1 (T075; RF-002, RF-003; contracts/portal-do-lacre.md; princípio V): a página do portal de configuração, a mesma que o
// firmware embute, testada no navegador com as rotas do lacre simuladas. Roda em 360, 768 e 1920 px. As regras do núcleo (validação,
// escape, tempos) estão em firmware/test/test_portal.
const PAGINA = readFileSync(path.resolve(import.meta.dirname, '../../firmware/portal/index.html'), 'utf8');
const LACRE = 'http://192.168.4.1';
const MALICIOSO = '<img src=x onerror=alert(1)>';

interface Lacre {
  redes: { ssid: string; sinal: string; rssi: number; aberta: boolean }[];
  situacoes: Record<string, unknown>[];
  // RF-024: o que /situacao responde antes de qualquer teste (a conexao atual do lacre). As `situacoes` valem depois do POST /testar.
  inicial?: Record<string, unknown>;
  ocupado?: boolean;
  testes: string[];
}

async function abrir(page: Page, lacre: Lacre): Promise<void> {
  await page.route(`${LACRE}/**`, async (route: Route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/redes') return route.fulfill({ json: { codigo: 'DSP-7KQ2M9XT', redes: lacre.redes } });
    if (url.pathname === '/testar') {
      lacre.testes.push(route.request().postData() ?? '');
      return route.fulfill(lacre.ocupado ? { status: 409, json: { situacao: 'ocupado' } } : { status: 202, json: { situacao: 'testando' } });
    }
    if (url.pathname === '/situacao') {
      if (lacre.testes.length === 0) return route.fulfill({ json: lacre.inicial ?? { situacao: 'ocioso', motivo: null, aprovacao: null, conexao: { rede: null, fluxid: false, aprovacao: null } } });
      return route.fulfill({ json: lacre.situacoes.length > 1 ? lacre.situacoes.shift() : lacre.situacoes[0] });
    }
    return route.fulfill({ contentType: 'text/html; charset=utf-8', body: PAGINA });
  });
  await page.goto(`${LACRE}/`);
}

const redesPadrao = () => [
  { ssid: 'Rede-Deposito', sinal: 'forte', rssi: -52, aberta: false },
  { ssid: MALICIOSO, sinal: 'médio', rssi: -70, aberta: false },
  { ssid: 'Visitantes', sinal: 'fraco', rssi: -82, aberta: true },
];
const novo = (situacoes: Record<string, unknown>[]): Lacre => ({ redes: redesPadrao(), situacoes, testes: [] });

test.describe('Portal de configuração do lacre', () => {
  // Spec 013 (RF-024): ao entrar na rede de configuração, a página mostra se o lacre já está conectado.
  const conexao = (rede: string | null, fluxid: boolean, aprovacao: string | null) =>
    ({ situacao: 'ocioso', motivo: null, aprovacao: null, conexao: { rede, fluxid, aprovacao } });

  test('ao abrir, mostra que o lacre está conectado à internet e aguardando vinculação a um tenant', async ({ page }) => {
    await abrir(page, { ...novo([]), inicial: conexao('FluxID', true, 'pendente') });
    const bloco = page.getByRole('region', { name: 'Conexão do lacre' });
    await expect(bloco.getByRole('status')).toHaveText(
      'Conectado à rede FluxID, com internet e acesso ao FluxID. Aguardando vinculação a um tenant pelo Master.');
  });

  test('ao abrir, mostra quando o lacre não está conectado ou ainda não chega ao FluxID', async ({ page }) => {
    const lacre = { ...novo([]), inicial: conexao(null, false, null) };
    await abrir(page, lacre);
    const status = page.getByRole('region', { name: 'Conexão do lacre' }).getByRole('status');
    await expect(status).toHaveText('O lacre ainda não está conectado a nenhuma rede Wi-Fi. Escolha a rede abaixo.');
    lacre.inicial = conexao('FluxID', false, null);
    await expect(status).toHaveText(/Conectado à rede FluxID, mas ainda sem resposta do FluxID/, { timeout: 10_000 });
    lacre.inicial = conexao('FluxID', true, 'aprovado');
    await expect(status).toHaveText(/O lacre está em operação/, { timeout: 10_000 });
  });

  test('o nome da rede atual aparece só como texto', async ({ page }) => {
    const alertas: string[] = [];
    page.on('dialog', (dialogo) => { alertas.push(dialogo.message()); void dialogo.dismiss(); });
    await abrir(page, { ...novo([]), inicial: conexao(MALICIOSO, true, 'pendente') });
    await expect(page.getByRole('region', { name: 'Conexão do lacre' }).getByRole('status')).toContainText(MALICIOSO);
    expect(await page.locator('img').count()).toBe(0);
    expect(alertas).toEqual([]);
  });

  test('mostra o código e as redes com o sinal em texto; nome malicioso aparece como texto', async ({ page }) => {
    const alertas: string[] = [];
    page.on('dialog', (dialogo) => { alertas.push(dialogo.message()); void dialogo.dismiss(); });
    await abrir(page, novo([{ situacao: 'ocioso', motivo: null, aprovacao: null }]));
    await expect(page.getByRole('heading', { level: 1, name: 'Configurar o lacre FluxID' })).toBeVisible();
    await expect(page.getByText('DSP-7KQ2M9XT')).toBeVisible();
    await expect(page.getByRole('radio', { name: /Rede-Deposito/ })).toBeVisible();
    await expect(page.getByText('Sinal forte')).toBeVisible();
    await expect(page.getByText('Sinal fraco · aberta')).toBeVisible();
    await expect(page.getByText(MALICIOSO, { exact: true })).toBeVisible();
    expect(await page.locator('img').count()).toBe(0);
    expect(alertas).toEqual([]);
  });

  test('só com teclado: escolhe a rede, digita a senha, testa e o status anuncia o pedido de aprovação', async ({ page }) => {
    const lacre = novo([{ situacao: 'testando', motivo: null, aprovacao: null }, { situacao: 'conectado', motivo: null, aprovacao: 'pendente' }]);
    await abrir(page, lacre);
    await page.getByRole('radio', { name: /Rede-Deposito/ }).focus();
    await page.keyboard.press('Space');
    await page.getByLabel('Senha da rede').focus();
    await page.keyboard.type('senha-ficticia-123');
    await page.keyboard.press('Enter');
    const status = page.locator('#situacao');
    await expect(status).toHaveText(/Testando a rede/);
    await expect(status).toHaveText('Conectado à internet e ao FluxID. O lacre aguarda a vinculação a um tenant pelo Master. Código DSP-7KQ2M9XT.', { timeout: 10_000 });
    expect(lacre.testes[0]).toContain('ssid=Rede-Deposito');
    // A senha só foi no pedido e não volta para a página.
    await expect(page.getByLabel('Senha da rede')).toHaveValue('');
    expect(await page.content()).not.toContain('senha-ficticia-123');
  });

  test('lacre já aprovado que reabriu o portal: a mensagem diz que voltou a operar', async ({ page }) => {
    await abrir(page, novo([{ situacao: 'conectado', motivo: null, aprovacao: 'aprovado' }]));
    await page.getByRole('radio', { name: /Rede-Deposito/ }).check();
    await page.getByLabel('Senha da rede').fill('senha-ficticia-123');
    await page.getByRole('button', { name: 'Testar e guardar a rede' }).click();
    await expect(page.locator('#situacao')).toHaveText(/O lacre voltou a operar com a nova rede/, { timeout: 10_000 });
  });

  for (const [motivo, texto] of [
    ['wifi_auth', /Senha errada/],
    ['wifi_not_found', /Rede fora do alcance/],
    ['wifi_no_internet', /não deu acesso ao FluxID/],
  ] as const) {
    test(`falha ${motivo}: o motivo em linguagem simples e nada guardado`, async ({ page }) => {
      await abrir(page, novo([{ situacao: 'falhou', motivo, aprovacao: null }]));
      await page.getByRole('radio', { name: /Rede-Deposito/ }).check();
      await page.getByLabel('Senha da rede').fill('senha-ficticia-123');
      await page.getByRole('button', { name: 'Testar e guardar a rede' }).click();
      await expect(page.locator('#situacao')).toHaveText(texto, { timeout: 10_000 });
      await expect(page.getByRole('button', { name: 'Testar e guardar a rede' })).toBeEnabled();
    });
  }

  test('teste em andamento por outra pessoa: avisa e não insiste', async ({ page }) => {
    const lacre = { ...novo([{ situacao: 'testando', motivo: null, aprovacao: null }]), ocupado: true };
    await abrir(page, lacre);
    await page.getByRole('radio', { name: /Rede-Deposito/ }).check();
    await page.getByLabel('Senha da rede').fill('senha-ficticia-123');
    await page.getByRole('button', { name: 'Testar e guardar a rede' }).click();
    await expect(page.locator('#situacao')).toHaveText(/Já há um teste de rede em andamento/);
  });

  test('rede oculta e rede aberta; validação junto do campo antes de enviar', async ({ page }) => {
    const lacre = novo([{ situacao: 'conectado', motivo: null, aprovacao: 'pendente' }]);
    await abrir(page, lacre);
    await page.getByRole('button', { name: 'Testar e guardar a rede' }).click();
    await expect(page.getByText('Escolha uma rede.')).toBeVisible();
    await page.getByRole('radio', { name: 'Outra rede (oculta)' }).check();
    await page.getByLabel('Nome da rede').fill('x'.repeat(33));
    await page.getByRole('button', { name: 'Testar e guardar a rede' }).click();
    await expect(page.getByText('Informe o nome da rede com até 32 caracteres.')).toBeVisible();
    await page.getByLabel('Nome da rede').fill('Rede-Escondida');
    await page.getByLabel('Senha da rede').fill('curta');
    await page.getByRole('button', { name: 'Testar e guardar a rede' }).click();
    await expect(page.getByText('A senha da rede tem de 8 a 63 caracteres.')).toBeVisible();
    expect(lacre.testes).toHaveLength(0);
    await page.getByRole('radio', { name: /Visitantes/ }).check();
    await expect(page.getByLabel('Senha da rede')).toBeHidden();
    await page.getByRole('button', { name: 'Testar e guardar a rede' }).click();
    await expect(page.locator('#situacao')).toHaveText(/aguarda a vinculação a um tenant/, { timeout: 10_000 });
    expect(lacre.testes[0]).toContain('aberta=1');
  });

  test('sem violação crítica ou grave de acessibilidade e sem rolagem horizontal', async ({ page }) => {
    await abrir(page, novo([{ situacao: 'ocioso', motivo: null, aprovacao: null }]));
    await expect(page.getByRole('radio', { name: /Rede-Deposito/ })).toBeVisible();
    const largura = page.viewportSize()?.width ?? 0;
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(largura);
    const scan = await new AxeBuilder({ page }).analyze();
    expect(scan.violations.filter((v) => ['critical', 'serious'].includes(v.impact ?? ''))).toEqual([]);
  });
});
