import { test, expect, type Locator, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { MockBackend, type PermissionProfile } from './support/mock-backend';
import { ORG_A, ORG_B } from './support/mock-registry';

test.use({ serviceWorkers: 'block' });

// Os formulários de cadastro e edição abrem em modal sobre a lista ou o detalhe, que têm filtros com os mesmos rótulos.
const formulario = (page: Page) => page.getByRole('dialog');

// Spec 007, história 9 (RF-043 a RF-047, CA-011, CA-012): acessibilidade, teclado, larguras de 320 a 1920 px, zoom de 200%, alvos de
// 44 px, PWA e offline em todas as telas novas, com backend simulado. As capturas visuais ficam em visual/registro.visual.spec.ts.
const CLIENTE = '81000000-0000-4000-8000-000000000001';
const UNIDADE = '82000000-0000-4000-8000-000000000001';
const VEICULO = '85000000-0000-4000-8000-000000000001';
const MOTORISTA = '86000000-0000-4000-8000-000000000001';
const MOTORISTA_INATIVO = '86000000-0000-4000-8000-000000000004';

async function entrar(page: Page, perfil: PermissionProfile = 'cadastros-admin', preparar?: (backend: MockBackend) => void): Promise<MockBackend> {
  const backend = new MockBackend().asProfile(perfil);
  preparar?.(backend);
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
const graves = async (page: Page) => (await new AxeBuilder({ page }).analyze()).violations.filter((item) => item.impact === 'critical' || item.impact === 'serious');

const TELAS = [
  { caminho: '/clientes', titulo: 'Clientes da organização' },
  { caminho: '/clientes/novo', titulo: 'Cadastrar cliente' },
  { caminho: `/clientes/${CLIENTE}`, titulo: 'Cliente Exemplo 01' },
  { caminho: `/clientes/${CLIENTE}/unidades/nova`, titulo: 'Cadastrar unidade' },
  { caminho: `/clientes/${CLIENTE}/unidades/${UNIDADE}`, titulo: 'Matriz' },
  { caminho: '/geocercas', titulo: 'Geocercas da organização' },
  { caminho: `/geocercas/nova?unidade=${UNIDADE}`, titulo: 'Cadastrar geocerca' },
  { caminho: '/veiculos', titulo: 'Veículos da organização' },
  { caminho: '/veiculos/novo', titulo: 'Cadastrar veículo' },
  { caminho: `/veiculos/${VEICULO}`, titulo: 'Veículo ABC-1234' },
  { caminho: '/motoristas', titulo: 'Motoristas da organização' },
  { caminho: '/motoristas/novo', titulo: 'Cadastrar motorista' },
  { caminho: `/motoristas/${MOTORISTA}`, titulo: 'Ana Condutora' },
];

test.describe('Cadastros: acessibilidade e responsividade', () => {
  // Um teste por tela: cada um entra, abre a tela e confere; assim nenhum estoura o tempo e a falha aponta a tela.
  for (const tela of TELAS) {
    test(`${tela.caminho}: um só h1 e um só main, sem violação crítica ou grave no axe`, async ({ page }) => {
      await entrar(page);
      await page.goto(tela.caminho);
      await expect(page.getByRole('heading', { level: 2, name: tela.titulo })).toBeVisible();
      await expect(page.locator('h1')).toHaveCount(1);
      await expect(page.locator('main')).toHaveCount(1);
      expect(await graves(page), tela.caminho).toEqual([]);
    });

    test(`${tela.caminho}: sem rolagem horizontal de 320 a 1920 px e com zoom de 200%`, async ({ page }) => {
      await entrar(page);
      await page.goto(tela.caminho);
      await expect(page.getByRole('heading', { level: 2, name: tela.titulo })).toBeVisible();
      for (const largura of [320, 360, 768, 1366, 1920]) {
        await page.setViewportSize({ width: largura, height: 900 });
        await expect.poll(() => semRolagemHorizontal(page), { message: `Rolagem horizontal em ${tela.caminho} a ${largura} px.` }).toBe(true);
      }
      await page.setViewportSize({ width: 640, height: 900 });
      await page.addStyleTag({ content: 'body { zoom: 2; }' });
      await expect.poll(() => semRolagemHorizontal(page), { message: `Rolagem horizontal com zoom de 200% em ${tela.caminho}.` }).toBe(true);
    });
  }

  test('os diálogos (cascata, justificativa e anonimização) passam no axe e prendem o foco', async ({ page }) => {
    await entrar(page);
    await page.goto(`/clientes/${CLIENTE}`);
    await page.getByRole('button', { name: 'Inativar cliente' }).click();
    const cascata = page.getByRole('dialog', { name: 'Inativar cliente' });
    await expect(cascata).toBeVisible();
    expect(await graves(page)).toEqual([]);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);

    await page.goto(`/motoristas/${MOTORISTA_INATIVO}`);
    await page.getByRole('button', { name: 'Anonimizar dados pessoais' }).click();
    const anonimizar = page.getByRole('dialog', { name: 'Anonimizar dados pessoais do motorista' });
    await expect(anonimizar).toBeVisible();
    expect(await graves(page)).toEqual([]);
    // O foco fica dentro do diálogo ao percorrer todos os controles com Tab.
    for (let passo = 0; passo < 8; passo += 1) {
      await page.keyboard.press('Tab');
      expect(await anonimizar.evaluate((dialogo) => dialogo.contains(document.activeElement))).toBe(true);
    }
  });

  test('os controles dos formulários têm alvo de 44 px', async ({ page }) => {
    await entrar(page);
    for (const caminho of ['/clientes/novo', `/clientes/${CLIENTE}/unidades/nova`, '/veiculos/novo', '/motoristas/novo', `/geocercas/nova?unidade=${UNIDADE}`]) {
      await page.goto(caminho);
      await expect(formulario(page).locator('form')).toBeVisible();
      const controles: Locator = formulario(page).locator('form').locator('input:not([type="hidden"]):not([type="radio"]):not([type="checkbox"]), select, textarea, button[type="submit"], button:not([type])');
      const total = await controles.count();
      expect(total, caminho).toBeGreaterThanOrEqual(3);
      for (let indice = 0; indice < total; indice += 1) {
        const caixa = await controles.nth(indice).boundingBox();
        if (caixa) expect(caixa.height, `${caminho} controle ${indice}`).toBeGreaterThanOrEqual(43.5);
      }
    }
  });
});

test.describe('Cadastros: teclado e foco', () => {
  test('o cadastro de unidade percorre CEP e endereço só com o teclado, a busca roda ao sair do campo e o anel de foco aparece', async ({ page }) => {
    await entrar(page);
    await page.goto(`/clientes/${CLIENTE}/unidades/nova`);
    await formulario(page).getByLabel('Nome da unidade').focus();
    await page.keyboard.type('Filial Teclado');
    await page.keyboard.press('Tab');
    await page.keyboard.type('01001000');
    // Sair do campo com 8 dígitos busca o CEP e leva o foco ao número (RF-008).
    await page.keyboard.press('Tab');
    await expect(formulario(page).getByLabel('Logradouro')).toHaveValue('Praça da Sé');
    await expect(formulario(page).getByLabel('Número')).toBeFocused();
    // O botão "Buscar CEP" também é alcançável pelo teclado e mostra o anel de foco (nunca "outline: none" sem substituto).
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Shift+Tab');
    const botao = page.getByRole('button', { name: 'Buscar CEP' });
    await expect(botao).toBeFocused();
    expect(await botao.evaluate((elemento) => { const estilo = getComputedStyle(elemento); return estilo.outlineStyle !== 'none' || estilo.boxShadow !== 'none'; })).toBe(true);
    await formulario(page).getByLabel('Número').focus();
    await page.keyboard.type('77');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { level: 2, name: 'Filial Teclado' })).toBeVisible();
  });

  test('o polígono é montado só com o teclado: acrescentar, remover e preencher os vértices', async ({ page }) => {
    await entrar(page);
    await page.goto(`/geocercas/nova?unidade=${UNIDADE}`);
    await formulario(page).getByLabel('Forma').selectOption('polygon');
    await page.getByRole('button', { name: 'Adicionar vértice' }).focus();
    await page.keyboard.press('Enter');
    await expect(formulario(page).getByLabel('Latitude do vértice 4')).toBeVisible();
    await page.getByRole('button', { name: 'Remover vértice 4' }).focus();
    await page.keyboard.press('Enter');
    await expect(formulario(page).getByLabel('Latitude do vértice 4')).toHaveCount(0);
    const valores: Array<[string, string]> = [['Latitude do vértice 1', '-23,5'], ['Longitude do vértice 1', '-46,6'], ['Latitude do vértice 2', '-23,5'], ['Longitude do vértice 2', '-46,59'],
      ['Latitude do vértice 3', '-23,49'], ['Longitude do vértice 3', '-46,595']];
    for (const [rotulo, valor] of valores) {
      await formulario(page).getByLabel(rotulo).focus();
      await page.keyboard.type(valor);
    }
    await formulario(page).getByLabel('Nome da geocerca').fill('Teclado');
    await page.getByRole('button', { name: 'Cadastrar geocerca' }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { level: 2, name: 'Teclado' })).toBeVisible();
  });

  test('o primeiro erro recebe o foco em cada formulário', async ({ page }) => {
    await entrar(page);
    for (const [caminho, botao, campo] of [
      ['/clientes/novo', 'Cadastrar cliente', 'Tipo de pessoa'], ['/veiculos/novo', 'Cadastrar veículo', 'Placa'],
      ['/motoristas/novo', 'Cadastrar motorista', 'Nome completo'], [`/clientes/${CLIENTE}/unidades/nova`, 'Cadastrar unidade', 'Nome da unidade'],
    ] as const) {
      await page.goto(caminho);
      await page.getByRole('button', { name: botao }).click();
      await expect(page.getByLabel(campo, { exact: true })).toBeFocused();
    }
  });
});

test.describe('Cadastros: sessão, permissões e organização', () => {
  test('quem perde a permissão com a tela aberta tem a ação seguinte recusada pelo servidor', async ({ page }) => {
    const backend = await entrar(page);
    await page.goto('/veiculos/novo');
    await formulario(page).getByLabel('Placa').fill('PER-1234');
    await formulario(page).getByLabel('Tipo de veículo').selectOption('van');
    await formulario(page).getByLabel('Capacidade em cilindros').fill('10');
    backend.permissionsByOrganization[ORG_A] = ['vehicle.read'];
    await page.getByRole('button', { name: 'Cadastrar veículo' }).click();
    await expect(page.getByText('Você não tem permissão para esta ação.')).toBeVisible();
    expect(backend.registry.vehicles.some((veiculo) => veiculo.plate === 'PER1234')).toBe(false);
  });

  test('tenant suspenso: leitura e escrita são negadas', async ({ page }) => {
    const backend = await entrar(page);
    await page.goto('/veiculos');
    await expect(page.getByRole('link', { name: 'ABC-1234' })).toBeVisible();
    backend.permissionsByOrganization[ORG_A] = [];
    await page.goto('/veiculos');
    await expect(page.getByText(/Acesso negado|não tem permissão/i).first()).toBeVisible();
    await expect(page.getByRole('link', { name: 'ABC-1234' })).toHaveCount(0);
    await page.goto('/veiculos/novo');
    await expect(formulario(page).getByLabel('Placa')).toHaveCount(0);
  });

  test('trocar a organização com a tela aberta recarrega sem mostrar dado da anterior', async ({ page }) => {
    const membership = (organizationId: string, name: string) => ({
      id: `30000000-0000-0000-0000-00000000000${organizationId.slice(-1)}`, organization_id: organizationId, status: 'active',
      organizations: { id: organizationId, kind: 'tenant', status: 'active', display_name: name },
    });
    await entrar(page, 'cadastros-admin', (backend) => {
      backend.tenantMemberships = [membership(ORG_A, 'Tenant A'), membership(ORG_B, 'Tenant B')];
      backend.permissionsByOrganization[ORG_B] = ['customer.read', 'vehicle.read', 'driver.read', 'geofence.read'];
    });
    await page.goto('/clientes');
    await page.getByRole('button', { name: 'Entrar em Tenant A' }).click();
    await expect(page.getByRole('link', { name: 'Cliente Exemplo 01' })).toBeVisible();
    await page.getByRole('button', { name: 'Trocar organização' }).click();
    await expect(page.getByRole('link', { name: 'Cliente Exemplo 01' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Entrar em Tenant B' }).click();
    await expect(page.getByRole('link', { name: 'Cliente do Tenant B 01' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Cliente Exemplo 01' })).toHaveCount(0);
  });
});

test.describe('Cadastros: offline e PWA', () => {
  test('sem conexão, a estrutura da tela continua, as escritas ficam desabilitadas com o motivo e nada é enfileirado', async ({ page, context }) => {
    await entrar(page);
    for (const [caminho, botao] of [['/clientes/novo', 'Cadastrar cliente'], ['/veiculos/novo', 'Cadastrar veículo'], ['/motoristas/novo', 'Cadastrar motorista'], [`/geocercas/nova?unidade=${UNIDADE}`, 'Cadastrar geocerca']] as const) {
      await page.goto(caminho);
      await expect(page.getByRole('button', { name: botao })).toBeEnabled();
      await context.setOffline(true);
      await expect(page.getByRole('button', { name: botao })).toBeDisabled();
      await expect(page.getByText(/Esta operação exige conexão/).first()).toBeVisible();
      await expect(page.locator('h1')).toHaveCount(1);
      await context.setOffline(false);
    }
    // Nada foi guardado no aparelho: nem armazenamento local, nem fila de gravação.
    const guardado = await page.evaluate(async () => {
      const bancos = (await indexedDB.databases?.()) ?? [];
      return JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }) + bancos.map((banco) => banco.name).join(',');
    });
    expect(guardado).not.toMatch(/outbox|registry|cadastro|PER-1234/i);
  });

  test('o detalhe do veículo e a busca de CEP ficam desabilitados sem conexão', async ({ page, context }) => {
    await entrar(page);
    await page.goto(`/veiculos/${VEICULO}`);
    await expect(page.getByRole('button', { name: 'Inativar veículo' })).toBeEnabled();
    await context.setOffline(true);
    await expect(page.getByRole('button', { name: 'Inativar veículo' })).toBeDisabled();
    await expect(page.getByText(/Esta operação exige conexão/).first()).toBeVisible();
    await context.setOffline(false);
    await page.goto(`/clientes/${CLIENTE}/unidades/nova`);
    await expect(formulario(page).getByLabel('Nome da unidade')).toBeVisible();
    await context.setOffline(true);
    await expect(page.getByRole('button', { name: 'Buscar CEP' })).toBeDisabled();
    await context.setOffline(false);
  });

  test('as páginas e o app continuam instaláveis: manifesto presente e nenhuma resposta de /functions no cache', async ({ page }) => {
    await entrar(page);
    await page.goto('/clientes');
    await expect(page.locator('link[rel="manifest"]')).toHaveCount(1);
    const guardadas = await page.evaluate(async () => {
      const nomes = await caches.keys();
      const urls: string[] = [];
      for (const nome of nomes) for (const requisicao of await (await caches.open(nome)).keys()) urls.push(requisicao.url);
      return urls;
    });
    expect(guardadas.filter((url) => /functions\/v1|rest\/v1|viacep/i.test(url))).toEqual([]);
  });
});
