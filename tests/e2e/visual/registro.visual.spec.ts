import { test, expect, type Page } from '@playwright/test';
import { MockBackend } from '../support/mock-backend';
import { ORG_A } from '../support/mock-registry';

// CA-013 da Spec 007: linha de base visual das telas de cadastros (listas, formulários, detalhes e o diálogo de anonimização) em 360,
// 768 e 1920 px. Só Chromium, e as capturas de referência são geradas no Linux (contêiner oficial do Playwright ou CI), porque a
// renderização da fonte difere por sistema. Nunca versione `*-win32.png`. Veja specs/003-design-system-telas/quickstart.md.
test.use({ serviceWorkers: 'block', locale: 'pt-BR', timezoneId: 'America/Sao_Paulo', colorScheme: 'light' });

const AGORA = new Date('2026-10-07T15:30:00.000Z');
const LARGURAS = [
  { nome: '360', largura: 360, altura: 740 },
  { nome: '768', largura: 768, altura: 1024 },
  { nome: '1920', largura: 1920, altura: 1080 },
] as const;

const CLIENTE = '81000000-0000-4000-8000-000000000001';
const UNIDADE = '82000000-0000-4000-8000-000000000001';
const GEOCERCA = '84000000-0000-4000-8000-000000009001';
const VEICULO = '85000000-0000-4000-8000-000000000001';
const MOTORISTA = '86000000-0000-4000-8000-000000000001';
const MOTORISTA_INATIVO = '86000000-0000-4000-8000-000000000004';

// Datas absolutas: a massa do simulado nasce relativa a "hoje", o que mudaria as capturas de um dia para o outro.
const LICENCIAMENTO: Record<string, string | null> = { ABC1234: '2027-05-01', DEF5678: '2026-10-15', GHI1J23: '2026-10-01', JKL9012: null };
const CNH: Record<string, string> = { 'Ana Condutora': '2027-11-01', 'Bruno Condutor': '2026-10-17', 'Carla Condutora': '2026-09-17', 'Diego Inativo': '2027-11-01' };

async function entrar(page: Page): Promise<void> {
  await page.clock.setFixedTime(AGORA);
  const backend = new MockBackend().asProfile('cadastros-admin');
  backend.registry.now = () => AGORA;
  for (const evento of backend.registry.events) evento.occurred_at = '2026-10-01T10:00:00.000Z';
  for (const veiculo of backend.registry.vehicles.filter((item) => item.organization_id === ORG_A)) veiculo.licensing_due_on = LICENCIAMENTO[String(veiculo.plate)] ?? null;
  for (const motorista of backend.registry.drivers.filter((item) => item.organization_id === ORG_A)) motorista.cnh_valid_until = CNH[String(motorista.full_name)] ?? '2027-11-01';
  backend.registry.geofences.push({
    id: GEOCERCA, organization_id: ORG_A, site_id: UNIDADE, name: 'Portão principal', shape: 'circle', center: { lat: -23.55052, lng: -46.633308 }, radius_m: 200, vertices: [], status: 'active', version: 1,
  });
  backend.loginResponses = [backend.authenticated()];
  backend.statusResponse = backend.activeStatus('aal1');
  await backend.install(page);
  await page.goto('/');
  await page.getByLabel('E-mail').fill('admin-a@example.invalid');
  await page.getByLabel('Senha', { exact: true }).fill('Local-only-002!');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Visão geral' })).toBeVisible();
}

// Telas com modal aberto são capturadas na janela, como a pessoa vê: a captura de página inteira redimensiona a janela e o modal
// (fixo, com rolagem por dentro) deixaria de ser fiel.
async function capturar(page: Page, nome: string, paginaInteira = true): Promise<void> {
  await page.waitForLoadState('networkidle');
  // Nenhum bloco ainda carregando: cada um que termina de carregar muda a altura da página, e a captura é da página inteira.
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
  // Tira o foco do último controle usado, para o anel de foco não variar entre execuções.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.evaluate(async () => { await document.fonts.ready; });
  await expect(page).toHaveScreenshot(nome, { fullPage: paginaInteira, maxDiffPixelRatio: 0.001, animations: 'disabled', caret: 'hide' });
}

const TELAS: Array<{ nome: string; caminho: string; titulo: string; espera?: string }> = [
  { nome: 'clientes-lista', caminho: '/clientes', titulo: 'Clientes da organização', espera: 'Cliente Exemplo 01' },
  { nome: 'cliente-cadastro', caminho: '/clientes/novo', titulo: 'Cadastrar cliente' },
  { nome: 'cliente-detalhe', caminho: `/clientes/${CLIENTE}`, titulo: 'Cliente Exemplo 01' },
  { nome: 'unidade-cadastro', caminho: `/clientes/${CLIENTE}/unidades/nova`, titulo: 'Cadastrar unidade' },
  { nome: 'unidade-detalhe', caminho: `/clientes/${CLIENTE}/unidades/${UNIDADE}`, titulo: 'Matriz' },
  { nome: 'geocercas-lista', caminho: '/geocercas', titulo: 'Geocercas da organização', espera: 'Portão principal' },
  { nome: 'geocerca-cadastro', caminho: `/geocercas/nova?unidade=${UNIDADE}`, titulo: 'Cadastrar geocerca' },
  { nome: 'geocerca-detalhe', caminho: `/geocercas/${GEOCERCA}`, titulo: 'Portão principal' },
  { nome: 'veiculos-lista', caminho: '/veiculos', titulo: 'Veículos da organização', espera: 'ABC-1234' },
  { nome: 'veiculo-cadastro', caminho: '/veiculos/novo', titulo: 'Cadastrar veículo' },
  { nome: 'veiculo-detalhe', caminho: `/veiculos/${VEICULO}`, titulo: 'Veículo ABC-1234' },
  { nome: 'motoristas-lista', caminho: '/motoristas', titulo: 'Motoristas da organização', espera: 'Ana Condutora' },
  { nome: 'motorista-cadastro', caminho: '/motoristas/novo', titulo: 'Cadastrar motorista' },
  { nome: 'motorista-detalhe', caminho: `/motoristas/${MOTORISTA}`, titulo: 'Ana Condutora' },
];

for (const { nome, largura, altura } of LARGURAS) {
  test.describe(`cadastros em ${nome} px`, () => {
    test.use({ viewport: { width: largura, height: altura } });

    for (const tela of TELAS) {
      test(tela.nome, async ({ page }) => {
        await entrar(page);
        await page.goto(tela.caminho);
        await expect(page.getByRole('heading', { level: 2, name: tela.titulo })).toBeVisible();
        if (tela.espera) await expect(page.getByRole('link', { name: tela.espera }).first()).toBeVisible();
        if (tela.nome.endsWith('-detalhe')) await expect(page.getByRole('region', { name: 'Histórico' })).toContainText(/evento/);
        await capturar(page, `registro-${tela.nome}-${nome}.png`, !tela.nome.endsWith('-cadastro'));
      });
    }

    test('diálogo de anonimização', async ({ page }) => {
      await entrar(page);
      await page.goto(`/motoristas/${MOTORISTA_INATIVO}`);
      // O histórico carrega depois do detalhe e muda a altura da página; capturar antes dele deixaria a imagem instável.
      await expect(page.getByText(/eventos? exibidos?/)).toBeVisible();
      await page.getByRole('button', { name: 'Anonimizar dados pessoais' }).click();
      await expect(page.getByRole('dialog', { name: 'Anonimizar dados pessoais do motorista' })).toBeVisible();
      // O foco inicial vai para a motivo; esperar que ele chegue evita capturar antes de o foco assentar.
      await expect(page.getByRole('dialog', { name: 'Anonimizar dados pessoais do motorista' }).getByLabel('Motivo')).toBeFocused();
      await capturar(page, `registro-anonimizacao-dialogo-${nome}.png`, false);
    });

    test('diálogo de inativação com cascata', async ({ page }) => {
      await entrar(page);
      await page.goto(`/clientes/${CLIENTE}`);
      // O histórico carrega depois do detalhe e muda a altura da página; capturar antes dele deixaria a imagem instável.
      await expect(page.getByText(/eventos? exibidos?/)).toBeVisible();
      await page.getByRole('button', { name: 'Inativar cliente' }).click();
      await expect(page.getByRole('dialog', { name: 'Inativar cliente' })).toBeVisible();
      await capturar(page, `registro-inativacao-dialogo-${nome}.png`, false);
    });
  });
}
