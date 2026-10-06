import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { MockBackend, type PermissionProfile } from './support/mock-backend';

test.use({ serviceWorkers: 'block' });

// Spec 006: cadastro, lista, detalhe, testes, inativação e histórico de cilindros, com backend simulado. Cobre as larguras dos
// projetos do Playwright (360, 768 e 1920 px), teclado, acessibilidade e rolagem horizontal (CA-006, RF-033, RF-034).
async function entrar(page: Page, perfil: PermissionProfile = 'cilindros-admin'): Promise<MockBackend> {
  const backend = new MockBackend().asProfile(perfil);
  backend.loginResponses = [backend.authenticated()];
  backend.statusResponse = backend.activeStatus('aal1');
  await backend.install(page);
  await page.goto('/');
  await page.getByLabel('E-mail').fill('admin-a@example.invalid');
  await page.getByLabel('Senha', { exact: true }).fill('Local-only-002!');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Visão geral' })).toBeVisible();
  return backend;
}

const semRolagemHorizontal = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

async function abrirLista(page: Page): Promise<void> {
  await page.goto('/cilindros');
  await expect(page.getByRole('heading', { level: 2, name: 'Cilindros da organização' })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: /cilindros? encontrados?/ })).toBeVisible();
}

test.describe('Cilindros: fluxo completo', () => {
  test('cadastra, vê na lista, abre o detalhe, registra teste, inativa e lê o histórico', async ({ page }) => {
    await entrar(page);
    await abrirLista(page);
    await expect(page.getByRole('link', { name: 'CIL-001' })).toBeVisible();

    // Cadastro.
    await page.getByRole('link', { name: 'Cadastrar cilindro' }).click();
    await expect(page.getByRole('heading', { level: 2, name: 'Cadastrar cilindro' })).toBeVisible();
    await page.getByLabel('Tipo de cilindro').selectOption({ index: 1 });
    await page.getByLabel('Número de série').fill('NOVO-001');
    await page.getByLabel('Fabricante').fill('Fábrica E2E');
    await page.getByLabel('Tipo do identificador').selectOption('qr_code');
    await page.getByLabel('Valor do identificador').fill('QR-NOVO-001');
    await page.getByRole('button', { name: 'Cadastrar cilindro' }).click();
    await expect(page.getByRole('heading', { level: 2, name: 'Cilindro NOVO-001' })).toBeVisible();
    await expect(page.getByText('QR-NOVO-001')).toBeVisible();

    // Lista: o cilindro aparece, buscável pelo identificador.
    await abrirLista(page);
    await page.getByLabel('Buscar por identificador ou número de série').fill('qr-novo-001');
    await page.getByRole('button', { name: 'Buscar' }).click();
    await expect(page.getByRole('link', { name: 'NOVO-001' })).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: '1 cilindro encontrado' })).toBeVisible();
    await page.getByRole('link', { name: 'NOVO-001' }).click();

    // Teste hidrostático.
    await expect(page.getByRole('heading', { level: 2, name: 'Cilindro NOVO-001' })).toBeVisible();
    await page.getByRole('button', { name: 'Registrar teste' }).click();
    const hoje = new Date().toISOString().slice(0, 10);
    const daqui6Meses = new Date(Date.now() + 180 * 86_400_000).toISOString().slice(0, 10);
    await page.getByLabel('Data de realização').fill(hoje);
    await page.getByLabel('Resultado').selectOption('approved');
    await page.getByLabel('Executor').fill('Laboratório E2E');
    await page.getByLabel('Próxima data').fill(daqui6Meses);
    await page.getByRole('button', { name: 'Registrar teste', exact: true }).click();
    await expect(page.getByText('Teste hidrostático registrado.')).toBeVisible();
    await expect(page.getByText('Situação do teste: Em dia')).toBeVisible();

    // Inativação.
    await page.getByRole('button', { name: 'Inativar cilindro' }).click();
    const dialogo = page.getByRole('dialog', { name: 'Inativar cilindro' });
    await dialogo.getByLabel('Motivo da inativação').selectOption('lost');
    await dialogo.getByLabel('Justificativa').fill('Perdido durante a entrega');
    await dialogo.getByRole('button', { name: 'Confirmar inativação' }).click();
    await expect(page.getByText(/Cilindro inativado. Ele saiu do estoque/)).toBeVisible();
    await expect(page.getByText('Situação cadastral: Inativo')).toBeVisible();

    // Histórico: do mais recente ao mais antigo.
    const historico = page.getByRole('region', { name: 'Histórico' });
    const eventos = historico.getByRole('listitem');
    await expect(eventos.first()).toContainText('Cilindro inativado');
    await expect(eventos.last()).toContainText('Cilindro cadastrado');
    await expect(historico).toContainText('Teste hidrostático registrado');
    await expect(historico.getByRole('button', { name: /editar|excluir|apagar|remover/i })).toHaveCount(0);
  });

  test('o Tenant B não vê os cilindros do Tenant A e a lista pagina com filtros', async ({ page }) => {
    const backend = await entrar(page);
    await abrirLista(page);
    // Padrão: só ativos (40 cilindros, 2 inativos), em páginas de 25.
    await expect(page.getByRole('status').filter({ hasText: '38 cilindros encontrados' })).toBeVisible();
    await page.getByRole('button', { name: 'Mostrar mais cilindros' }).click();
    await expect(page.getByRole('link', { name: 'CIL-038' })).toBeVisible();
    await page.getByLabel('Situação cadastral').selectOption('inactive');
    await expect(page.getByRole('status').filter({ hasText: '2 cilindros encontrados' })).toBeVisible();
    await page.getByLabel('Situação cadastral').selectOption('active');
    await page.getByLabel('Situação de estoque').selectOption('in_stock');
    await expect(page.getByRole('status').filter({ hasText: '5 cilindros encontrados' })).toBeVisible();
    // Isolamento: o identificador QR-001 existe nos dois tenants, e a busca de A devolve só o de A.
    await page.getByLabel('Situação de estoque').selectOption('');
    await page.getByLabel('Buscar por identificador ou número de série').fill('QR-001');
    await page.getByRole('button', { name: 'Buscar' }).click();
    await expect(page.getByRole('link', { name: 'CIL-001' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'B-1' })).toHaveCount(0);
    expect(backend.cylinders.cylinders.filter((c) => c.organization_id === '20000000-0000-0000-0000-00000000000b')).toHaveLength(3);
  });

  test('o auditor consulta tudo e não encontra nenhuma ação de alteração', async ({ page }) => {
    await entrar(page, 'cilindros-auditor');
    await abrirLista(page);
    await expect(page.getByRole('link', { name: 'Cadastrar cilindro' })).toHaveCount(0);
    await page.getByRole('link', { name: 'CIL-001' }).click();
    await expect(page.getByRole('heading', { level: 2, name: 'Cilindro CIL-001' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Histórico' })).toBeVisible();
    for (const acao of ['Editar', 'Inativar cilindro', 'Registrar teste', 'Acrescentar identificador', 'Reutilizar identificador desativado']) {
      await expect(page.getByRole('button', { name: acao })).toHaveCount(0);
      await expect(page.getByRole('link', { name: acao, exact: true })).toHaveCount(0);
    }
  });

  test('sem permissão, abrir o cadastro nega o acesso e não mostra o formulário', async ({ page }) => {
    await entrar(page, 'cilindros-auditor');
    await page.goto('/cilindros/novo');
    await expect(page.getByRole('alert')).toContainText(/não tem permissão/i);
    await expect(page.getByLabel('Número de série')).toHaveCount(0);
  });
});

test.describe('Cilindros: teclado, acessibilidade e responsividade', () => {
  test('o cadastro é operável só com o teclado e o foco vai ao primeiro erro', async ({ page }) => {
    await entrar(page);
    await page.goto('/cilindros/novo');
    await expect(page.getByRole('heading', { level: 2, name: 'Cadastrar cilindro' })).toBeVisible();
    // Enviar vazio pelo teclado: foco no primeiro campo com erro.
    await page.getByLabel('Tipo de cilindro').focus();
    await page.getByRole('button', { name: 'Cadastrar cilindro' }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByText('Escolha o tipo de cilindro.')).toBeVisible();
    await expect(page.getByLabel('Tipo de cilindro')).toBeFocused();
    // Preencher percorrendo os campos com Tab.
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab'); // pula "Novo tipo"
    await page.keyboard.type('TECLADO-001');
    await page.getByLabel('Tipo do identificador').focus();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Tab');
    await page.keyboard.type('QR-TECLADO-001');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { level: 2, name: 'Cilindro TECLADO-001' })).toBeVisible();
  });

  test('sem violação crítica ou grave no axe e sem rolagem horizontal de 320 a 1920 px e com zoom de 200%', async ({ page }) => {
    await entrar(page);
    const telas = [
      { caminho: '/cilindros', titulo: 'Cilindros da organização' },
      { caminho: '/cilindros/novo', titulo: 'Cadastrar cilindro' },
      { caminho: '/cilindros/72000000-0000-4000-8000-000000000001', titulo: 'Cilindro CIL-001' },
    ];
    for (const tela of telas) {
      await page.goto(tela.caminho);
      await expect(page.getByRole('heading', { level: 2, name: tela.titulo })).toBeVisible();
      // Um só h1 (o logotipo) e um só main.
      await expect(page.locator('h1')).toHaveCount(1);
      await expect(page.locator('main')).toHaveCount(1);
      const resultado = await new AxeBuilder({ page }).analyze();
      expect(resultado.violations.filter((item) => item.impact === 'critical' || item.impact === 'serious'), tela.caminho).toEqual([]);
      for (const largura of [320, 360, 768, 1024, 1366, 1920]) {
        await page.setViewportSize({ width: largura, height: 900 });
        // O shell troca a disposição por JavaScript ao cruzar 768 px: espera o layout assentar antes de medir.
        await expect.poll(() => semRolagemHorizontal(page), { message: `Rolagem horizontal em ${tela.caminho} a ${largura} px.` }).toBe(true);
      }
      await page.setViewportSize({ width: 640, height: 900 });
      await page.addStyleTag({ content: 'body { zoom: 2; }' });
      await expect.poll(() => semRolagemHorizontal(page), { message: `Rolagem horizontal com zoom de 200% em ${tela.caminho}.` }).toBe(true);
      await page.reload();
    }
  });

  test('em 360 px a lista vira cartões, com alvos de 44 px e sem rolagem horizontal', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await entrar(page);
    await abrirLista(page);
    await expect(page.getByRole('row').nth(1)).toHaveCSS('display', 'block');
    await expect.poll(() => semRolagemHorizontal(page)).toBe(true);
    for (const campo of await page.locator('main select, main input:not([type=hidden]), main button').all()) {
      if (!(await campo.isVisible())) continue;
      const caixa = await campo.boundingBox();
      expect(caixa?.height ?? 0).toBeGreaterThanOrEqual(44);
    }
  });
});
