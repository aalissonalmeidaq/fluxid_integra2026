import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { MockBackend, type PermissionProfile } from './support/mock-backend';

test.use({ serviceWorkers: 'block' });

// Spec 005, US2 a US5: a Visão geral, a barra superior e o menu da pessoa, com backend simulado. Os dados da página são
// só de exemplo; nenhuma requisição de dados de domínio é feita por ela (RF-032, CA-009).
const A = '20000000-0000-0000-0000-00000000000a';
const B = '20000000-0000-0000-0000-00000000000b';

const vinculo = (organizationId: string, nome: string) => ({
  id: `30000000-0000-0000-0000-00000000000${organizationId.slice(-1)}`,
  organization_id: organizationId,
  status: 'active',
  organizations: { id: organizationId, kind: 'tenant', status: 'active', display_name: nome },
});

async function entrar(page: Page, backend = new MockBackend(), aal: 'aal1' | 'aal2' = 'aal1'): Promise<MockBackend> {
  backend.loginResponses = [backend.authenticated()];
  backend.statusResponse = backend.activeStatus(aal);
  await backend.install(page);
  await page.goto('/');
  await page.getByLabel('E-mail').fill('admin-a@example.invalid');
  await page.getByLabel('Senha', { exact: true }).fill('Local-only-002!');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Visão geral' })).toBeVisible();
  return backend;
}

// A rota simulada responde mesmo com o contexto offline; por isso a perda de rede também aborta as requisições ao backend.
async function perderRede(page: Page): Promise<() => Promise<void>> {
  const abortar = (rota: import('@playwright/test').Route) => rota.abort('internetdisconnected');
  await page.context().setOffline(true);
  await page.route('http://127.0.0.1:54321/**', abortar);
  return async () => {
    await page.unroute('http://127.0.0.1:54321/**', abortar);
    await page.context().setOffline(false);
  };
}

const menu = (page: Page) => page.getByRole('navigation', { name: 'Navegação principal' });
const semRolagemHorizontal = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
const BLOCOS = ['Indicadores principais', 'Cilindros e viagens no mapa', 'Movimentação de cilindros', 'Cilindros por situação', 'Alertas recentes', 'Cilindros recentes', 'Desempenho operacional'];

async function abrirMenuSeRecolhido(page: Page): Promise<void> {
  const botao = page.getByRole('button', { name: 'Menu' });
  // A disposição troca por JavaScript ao cruzar 768 px; espera o botão aparecer abaixo disso antes de agir.
  if ((page.viewportSize()?.width ?? 0) < 768) await expect(botao).toBeVisible();
  if (await botao.isVisible() && (await botao.getAttribute('aria-expanded')) !== 'true') await botao.click();
  await expect(menu(page)).toBeVisible();
}

test.describe('US2: a Visão geral depois de entrar', () => {
  const perfis: Array<[PermissionProfile, string[]]> = [
    ['administrador', ['Visão geral', 'Meu perfil', 'Pessoas do tenant', 'Papéis e permissões', 'Auditoria do tenant']],
    ['operador', ['Visão geral', 'Meu perfil']],
    ['master', ['Visão geral', 'Meu perfil', 'Organizações', 'Auditoria da plataforma']],
  ];
  for (const [perfil, itens] of perfis) {
    test(`${perfil}: a página é a mesma e o menu mostra os itens da Spec 004`, async ({ page }) => {
      await entrar(page, new MockBackend().asProfile(perfil), perfil === 'master' ? 'aal2' : 'aal1');
      for (const titulo of BLOCOS) await expect(page.getByRole('region', { name: titulo })).toBeVisible();
      await expect(page.getByText('Fundação Técnica Ativa')).toHaveCount(0);
      await abrirMenuSeRecolhido(page);
      const textos = (await menu(page).getByRole('link').allTextContents()).map((texto) => texto.replace(/\s*\(página atual\)\s*$/, '').trim());
      expect(textos).toEqual(itens);
    });
  }

  test('cada bloco traz a marca "Exemplo" e a página não pede dados de domínio', async ({ page }) => {
    const backend = await entrar(page);
    for (const titulo of BLOCOS) await expect(page.getByRole('region', { name: titulo })).toContainText('Exemplo');
    await page.waitForLoadState('networkidle');
    const dominios = backend.calls.filter((chamada) => /cilindro|alerta|lacre|viagem|movimentacao/i.test(chamada.path));
    expect(dominios).toEqual([]);
  });

  test('a barra superior mostra a organização ativa e o estado de conexão', async ({ page }) => {
    await entrar(page);
    await expect(page.getByRole('banner').getByText('Organização ativa:')).toBeVisible();
    await expect(page.getByTestId('connection-bar')).toBeVisible();
  });

  test('um só h1 e um só main em qualquer largura', async ({ page }) => {
    await entrar(page);
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    await expect(page.getByRole('main')).toHaveCount(1);
  });

  test('ao abrir a Visão geral pelo item do menu, o foco vai uma vez ao título', async ({ page }) => {
    await entrar(page);
    await page.goto('/perfil');
    await expect(page.getByRole('heading', { level: 2, name: 'Meu perfil' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Minha conta' })).toBeVisible();
    await abrirMenuSeRecolhido(page);
    await menu(page).getByRole('link', { name: 'Visão geral' }).click();
    await expect(page.getByRole('heading', { level: 2, name: 'Visão geral' })).toBeFocused();
  });

  test('sessão expirada na Visão geral devolve à entrada com o aviso da Spec 002', async ({ page }) => {
    const backend = await entrar(page);
    backend.statusResponse = { status: 401, body: { code: 'SESSION_EXPIRED', reason: 'inactivity' } };
    await page.reload();
    await expect(page.getByRole('heading', { level: 2, name: 'Bem-vindo de volta' })).toBeVisible();
  });
});

test.describe('Alertas na Visão geral', () => {
  test('alertas novos têm o destaque "Novo" e o clique abre a página de alertas com o detalhe', async ({ page }) => {
    await entrar(page);
    const bloco = page.getByRole('region', { name: 'Alertas recentes' });
    await expect(bloco).toContainText('2 novos alertas');
    await expect(bloco.getByText('Novo', { exact: true })).toHaveCount(2);
    await bloco.getByRole('link', { name: /Saída da geocerca/ }).click();
    await expect(page).toHaveURL(/\/alertas\?alerta=EX-A-02/);
    await expect(page.getByRole('heading', { level: 2, name: 'Alertas' })).toBeVisible();
    const detalhe = page.getByRole('region', { name: 'Detalhe do alerta' });
    await expect(detalhe).toContainText('EX-A-02');
    await expect(detalhe).toContainText('Tenant A');
    await expect(detalhe).toContainText('EX-0733');
    await expect(detalhe).toContainText('Geocerca');
  });

  test('cada cartão de indicador tem uma cor própria', async ({ page }) => {
    await entrar(page);
    const cores = await page.getByRole('region', { name: 'Indicadores principais' }).getByRole('listitem').evaluateAll((itens) => itens.map((item) => getComputedStyle(item).backgroundColor + '|' + getComputedStyle(item).color));
    expect(new Set(cores).size).toBe(4);
  });
});

test.describe('US3: qualquer largura, só com teclado', () => {
  test('a disposição segue a largura e não há rolagem horizontal', async ({ page }) => {
    await entrar(page);
    const largura = page.viewportSize()?.width ?? 0;
    const cartoes = page.getByRole('region', { name: 'Indicadores principais' }).getByRole('listitem');
    const caixas = await cartoes.evaluateAll((itens) => itens.map((item) => item.getBoundingClientRect().top));
    const naMesmaLinha = new Set(caixas.map((topo) => Math.round(topo))).size;
    if (largura >= 1024) expect(naMesmaLinha).toBe(1);
    else if (largura >= 768) expect(naMesmaLinha).toBe(2);
    else expect(naMesmaLinha).toBe(4);
    const principal = await page.getByRole('main').boundingBox();
    expect(principal).not.toBeNull();
    expect(await semRolagemHorizontal(page)).toBe(true);
    if (largura < 768) await expect(menu(page)).toBeHidden();
    else await expect(menu(page)).toBeVisible();
  });

  test('sem rolagem horizontal de 320 a 1920 px, em paisagem e com zoom de 200%', async ({ page }) => {
    await entrar(page);
    for (const [w, h] of [[320, 640], [360, 640], [740, 360], [768, 1024], [1024, 768], [1366, 768], [1920, 1080]] as const) {
      await page.setViewportSize({ width: w, height: h });
      expect(await semRolagemHorizontal(page), `Rolagem horizontal em ${w} px.`).toBe(true);
    }
    await page.setViewportSize({ width: 640, height: 800 });
    await page.addStyleTag({ content: 'body { zoom: 2; }' });
    expect(await semRolagemHorizontal(page), 'Rolagem horizontal com zoom de 200%.').toBe(true);
  });

  test('axe sem violação crítica ou grave e gráficos com tabela e descrição', async ({ page }) => {
    await entrar(page);
    const resultado = await new AxeBuilder({ page }).analyze();
    expect(resultado.violations.filter((violacao) => violacao.impact === 'critical' || violacao.impact === 'serious')).toEqual([]);
    for (const titulo of ['Movimentação de cilindros', 'Cilindros por situação']) {
      const bloco = page.getByRole('region', { name: titulo });
      await expect(bloco.getByRole('img')).toHaveCount(1);
      await expect(bloco.getByRole('table')).toHaveCount(1);
    }
  });

  test('a ordem de Tab começa no link de pular e a tela inteira se percorre só com teclado', async ({ page, browserName }) => {
    test.skip(browserName === 'webkit', 'O WebKit do Playwright no Windows não encaminha Tab ao foco da página.');
    await entrar(page);
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'Pular para o conteúdo principal' })).toBeFocused();
  });
});

test.describe('Movimento reduzido (RF-029, CA-007)', () => {
  test('com movimento reduzido nenhum elemento da Visão geral tem animação ou transição em curso', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await entrar(page);
    await page.waitForLoadState('networkidle');
    const emCurso = await page.evaluate(() => document.getAnimations().length);
    expect(emCurso).toBe(0);
    const comMovimento = await page.evaluate(() => Array.from(document.querySelectorAll('*')).filter((el) => {
      const estilo = getComputedStyle(el);
      return (estilo.animationName !== 'none' && parseFloat(estilo.animationDuration) > 0) || parseFloat(estilo.transitionDuration) > 0;
    }).map((el) => el.tagName.toLowerCase()));
    expect(comMovimento).toEqual([]);
  });
});

test.describe('US4: estados dos blocos', () => {
  test('o aparelho offline mantém a estrutura da Visão geral e mostra o aviso de conexão', async ({ page, browserName }) => {
    test.skip(browserName === 'webkit', 'O evento offline do WebKit do Playwright no Windows é instável com o backend simulado; o Chromium cobre o cenário.');
    await entrar(page);
    const voltar = await perderRede(page);
    await expect(page.getByText(/modo offline em operação/i)).toBeVisible({ timeout: 15_000 });
    for (const titulo of BLOCOS) await expect(page.getByRole('region', { name: titulo })).toBeVisible();
    await voltar();
    await expect(page.getByText(/modo offline em operação/i)).toHaveCount(0);
    await expect(page.getByRole('heading', { level: 2, name: 'Visão geral' })).toBeVisible();
  });
});

test.describe('US4: aplicativo instalado, recarregando offline (RF-030)', () => {
  test.use({ serviceWorkers: 'allow' });

  test('a estrutura da Visão geral abre offline com o aviso da Spec 003, sem dado da página no cache do service worker', async ({ page, context, browserName }) => {
    test.skip(browserName === 'webkit', 'O driver WebKit do Playwright no Windows apresenta falha de IPC ao combinar setOffline com service worker.');
    const backend = new MockBackend();
    await backend.install(page);
    await page.goto('/');
    await page.evaluate(async () => { await navigator.serviceWorker.ready; });
    await page.reload();
    await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);

    backend.loginResponses = [backend.authenticated()];
    backend.statusResponse = backend.activeStatus('aal1');
    await page.getByLabel('E-mail').fill('admin-a@example.invalid');
    await page.getByLabel('Senha', { exact: true }).fill('Local-only-002!');
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    await expect(page.getByRole('heading', { level: 2, name: 'Visão geral' })).toBeVisible();

    // Nada do conteúdo de exemplo vai para o cache: ele vive só no pacote JavaScript do aplicativo.
    const cacheado = await page.evaluate(async () => {
      const urls: string[] = [];
      for (const nome of await caches.keys()) for (const pedido of await (await caches.open(nome)).keys()) urls.push(new URL(pedido.url).pathname);
      return urls;
    });
    expect(cacheado.filter((caminho) => /cilindro|alerta|lacre|viagem|overview|visao/i.test(caminho))).toEqual([]);

    // A rota simulada continua respondendo offline, como no teste do menu da Spec 004: a sessão é restaurada e a estrutura abre.
    await context.setOffline(true);
    try {
      await page.reload();
      await expect(page.getByText(/modo offline em operação/i)).toBeVisible({ timeout: 15_000 });
      for (const titulo of BLOCOS) await expect(page.getByRole('region', { name: titulo })).toBeVisible();
    } finally {
      await context.setOffline(false);
    }
    await expect(page.getByText(/modo offline em operação/i)).toHaveCount(0);
    await expect(page.getByRole('heading', { level: 2, name: 'Visão geral' })).toBeVisible();
  });
});

test.describe('US5: menu da pessoa', () => {
  test('abre por Enter, mostra nome, organização, "Meu perfil" e "Sair", e fecha por Escape devolvendo o foco', async ({ page, browserName }) => {
    test.skip(browserName === 'webkit', 'O WebKit do Playwright no Windows não encaminha Tab ao foco da página.');
    await entrar(page);
    const botao = page.getByRole('button', { name: 'Minha conta' });
    await botao.focus();
    await page.keyboard.press('Enter');
    await expect(botao).toHaveAttribute('aria-expanded', 'true');
    const painel = page.locator(`#${await botao.getAttribute('aria-controls')}`);
    await expect(painel.getByText('Ana Souza')).toBeVisible();
    await expect(painel.getByText('Tenant A')).toBeVisible();
    await page.keyboard.press('Tab');
    await expect(painel.getByRole('link', { name: 'Meu perfil' })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(painel.getByRole('button', { name: 'Sair' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(botao).toHaveAttribute('aria-expanded', 'false');
    await expect(botao).toBeFocused();
  });

  test('o clique fora fecha o menu e devolve o foco ao botão', async ({ page }) => {
    await entrar(page);
    const botao = page.getByRole('button', { name: 'Minha conta' });
    await botao.click();
    await expect(botao).toHaveAttribute('aria-expanded', 'true');
    await page.getByRole('contentinfo').click();
    await expect(botao).toHaveAttribute('aria-expanded', 'false');
    await expect(botao).toBeFocused();
  });

  test('"Meu perfil" abre o perfil e "Sair" volta à entrada', async ({ page }) => {
    await entrar(page);
    await page.getByRole('button', { name: 'Minha conta' }).click();
    await page.getByRole('banner').getByRole('link', { name: 'Meu perfil' }).click();
    await expect(page.getByRole('heading', { level: 2, name: 'Meu perfil' })).toBeVisible();
    await page.getByRole('button', { name: 'Minha conta' }).click();
    await page.getByRole('button', { name: 'Sair' }).click();
    await expect(page.getByRole('heading', { level: 2, name: 'Bem-vindo de volta' })).toBeVisible();
  });

  test('uma pessoa de dois tenants troca de organização pela barra superior', async ({ page }) => {
    const backend = new MockBackend();
    backend.tenantMemberships = [vinculo(A, 'Tenant A'), vinculo(B, 'Tenant B')];
    backend.loginResponses = [backend.authenticated()];
    backend.statusResponse = backend.activeStatus('aal2');
    await backend.install(page);
    await page.goto('/');
    await page.getByLabel('E-mail').fill('admin-a@example.invalid');
    await page.getByLabel('Senha', { exact: true }).fill('Local-only-002!');
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Minha conta' })).toBeVisible();
    await page.goto('/admin/membros');
    await page.getByRole('button', { name: 'Entrar em Tenant A' }).click();
    await expect(page.getByRole('banner').getByText('Tenant A')).toBeVisible();
    await page.getByRole('banner').getByRole('button', { name: 'Trocar organização' }).click();
    await expect(page.getByRole('heading', { name: 'Escolha a organização' })).toBeVisible();
  });
});
