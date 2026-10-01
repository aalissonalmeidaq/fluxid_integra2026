import { test, expect, type Locator, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { MockBackend, type PermissionProfile } from './support/mock-backend';

test.use({ serviceWorkers: 'block' });

// Spec 004: menu de navegação por permissão. O backend simulado responde `query-permissions` como o servidor responderia;
// a paridade com o servidor real é provada em tests/integration/navigation-permissions.live.test.ts.
const A = '20000000-0000-0000-0000-00000000000a';
const B = '20000000-0000-0000-0000-00000000000b';
const PERMISSIONS_PATH = '/functions/v1/query-permissions';

const vinculo = (organizationId: string, nome: string) => ({
  id: `30000000-0000-0000-0000-00000000000${organizationId.slice(-1)}`,
  organization_id: organizationId,
  status: 'active',
  organizations: { id: organizationId, kind: 'tenant', status: 'active', display_name: nome },
});

interface EntrarOpcoes { aal?: 'aal1' | 'aal2'; caminho?: string }

async function entrar(page: Page, backend: MockBackend, { aal = 'aal2', caminho = '/' }: EntrarOpcoes = {}): Promise<void> {
  backend.loginResponses = [backend.authenticated()];
  backend.statusResponse = backend.activeStatus(aal);
  await backend.install(page);
  await page.goto('/');
  await page.getByLabel('E-mail').fill('admin-a@example.invalid');
  await page.getByLabel('Senha', { exact: true }).fill('Local-only-002!');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Sair' })).toBeVisible();
  if (caminho !== '/') await page.goto(caminho);
}

const menu = (page: Page): Locator => page.getByRole('navigation', { name: 'Navegação principal' });
const normalizar = (texto: string) => texto.replace(/\s*\(página atual\)\s*$/, '').trim();
const itens = async (page: Page): Promise<string[]> => (await menu(page).getByRole('link').allTextContents()).map(normalizar);
const consultas = (backend: MockBackend) => backend.calls.filter((call) => call.path === PERMISSIONS_PATH);
const semRolagemHorizontal = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

async function abrirMenuSeRecolhido(page: Page): Promise<void> {
  const botao = page.getByRole('button', { name: 'Menu' });
  if (await botao.isVisible()) {
    if ((await botao.getAttribute('aria-expanded')) !== 'true') await botao.click();
  }
  await expect(menu(page)).toBeVisible();
}

const BASE = ['Início', 'Meu perfil'];
const ADMINISTRADOR = [...BASE, 'Pessoas do tenant', 'Papéis e permissões', 'Auditoria do tenant'];
const GLOBAL = [...BASE, 'Organizações', 'Auditoria da plataforma'];

test.describe('US1: só as telas que a pessoa pode usar (CA-001, MS-001)', () => {
  const perfis: Array<[PermissionProfile, string[]]> = [
    ['administrador', ADMINISTRADOR],
    ['operador', BASE],
    ['master', GLOBAL],
    ['admin-fluxid', GLOBAL],
    ['sem-vinculo', BASE],
  ];

  for (const [perfil, esperados] of perfis) {
    test(`${perfil}: o menu mostra exatamente os itens esperados em 1920 px`, async ({ page }) => {
      await page.setViewportSize({ width: 1920, height: 1080 });
      const backend = new MockBackend().asProfile(perfil);
      if (perfil !== 'administrador' && perfil !== 'operador') backend.tenantMemberships = [];
      await entrar(page, backend);
      await expect(menu(page)).toBeVisible();
      await expect.poll(() => itens(page)).toEqual(esperados);
    });
  }

  test('sem sessão não há menu nem consulta de permissões', async ({ page }) => {
    const backend = new MockBackend();
    await backend.install(page);
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Entrar no FluxID' })).toBeVisible();
    await expect(page.getByRole('navigation')).toHaveCount(0);
    expect(consultas(backend)).toHaveLength(0);
  });

  test('o link "Meu perfil" saiu do cabeçalho e está no menu', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await entrar(page, new MockBackend());
    await expect(page.getByRole('banner').getByRole('link', { name: 'Meu perfil' })).toHaveCount(0);
    await expect(menu(page).getByRole('link', { name: 'Meu perfil' })).toBeVisible();
  });
});

test.describe('US2: celular e desktop, só com teclado (CA-004, CA-005, MS-003, MS-004)', () => {
  test('em 360 px o menu inicia fechado, abre pelo botão, percorre com Tab e fecha com Escape devolvendo o foco', async ({ page, browserName }) => {
    test.skip(browserName === 'webkit', 'O WebKit do Playwright no Windows não encaminha Tab ao foco da página.');
    await page.setViewportSize({ width: 360, height: 740 });
    await entrar(page, new MockBackend());
    const botao = page.getByRole('button', { name: 'Menu' });
    await expect(botao).toBeVisible();
    await expect(botao).toHaveAttribute('aria-expanded', 'false');
    await expect(menu(page)).toBeHidden();

    await botao.focus();
    await page.keyboard.press('Enter');
    await expect(botao).toHaveAttribute('aria-expanded', 'true');
    await expect(menu(page)).toBeVisible();
    await expect.poll(() => itens(page)).toEqual(ADMINISTRADOR);
    await expect(menu(page).getByRole('link').first()).toBeFocused();

    for (let indice = 1; indice < ADMINISTRADOR.length; indice += 1) {
      await page.keyboard.press('Tab');
      await expect(menu(page).getByRole('link').nth(indice)).toBeFocused();
    }

    await page.keyboard.press('Escape');
    await expect(menu(page)).toBeHidden();
    await expect(botao).toHaveAttribute('aria-expanded', 'false');
    await expect(botao).toBeFocused();
  });

  test('em 360 px tocar fora do painel o fecha e devolve o foco ao botão', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await entrar(page, new MockBackend());
    await abrirMenuSeRecolhido(page);
    await page.getByRole('contentinfo').click();
    await expect(menu(page)).toBeHidden();
    await expect(page.getByRole('button', { name: 'Menu' })).toBeFocused();
  });

  test('o link de pular continua sendo o primeiro Tab, antes do botão do menu', async ({ page, browserName }) => {
    test.skip(browserName === 'webkit', 'O WebKit do Playwright no Windows não encaminha Tab ao foco da página.');
    await page.setViewportSize({ width: 360, height: 740 });
    await entrar(page, new MockBackend());
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'Pular para o conteúdo principal' })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Menu' })).toBeFocused();
  });

  for (const largura of [768, 1920]) {
    test(`em ${largura} px o menu é uma coluna visível e o botão não existe`, async ({ page }) => {
      await page.setViewportSize({ width: largura, height: 1000 });
      await entrar(page, new MockBackend());
      await expect(menu(page)).toBeVisible();
      await expect(page.getByRole('button', { name: 'Menu' })).toHaveCount(0);
      const caixaMenu = await menu(page).boundingBox();
      const caixaMain = await page.getByRole('main').boundingBox();
      expect(caixaMenu && caixaMain && caixaMenu.x + caixaMenu.width <= caixaMain.x + 1).toBe(true);
    });
  }

  test('sem rolagem horizontal de 320 a 1920 px, com zoom de 200% e em paisagem, e o texto longo quebra dentro do item', async ({ page }) => {
    await entrar(page, new MockBackend());
    const tamanhos = [[320, 640], [360, 740], [640, 480], [740, 360], [768, 1024], [1024, 768], [1920, 1080]] as const;
    for (const [largura, altura] of tamanhos) {
      await page.setViewportSize({ width: largura, height: altura });
      await abrirMenuSeRecolhido(page);
      expect(await semRolagemHorizontal(page), `${largura}x${altura}`).toBe(true);
      const transbordam = await menu(page).getByRole('link').evaluateAll((links) => links.filter((link) => link.scrollWidth > link.clientWidth + 1).length);
      expect(transbordam, `${largura}x${altura}: itens com texto cortado`).toBe(0);
    }
    // Zoom de 200% em uma janela de 1280 px equivale a 640 px de largura em CSS.
    await page.setViewportSize({ width: 640, height: 400 });
    await page.addStyleTag({ content: 'body { zoom: 2; }' });
    await abrirMenuSeRecolhido(page);
    expect(await semRolagemHorizontal(page)).toBe(true);
  });

  test('o foco nos itens é visível, com anel de 3:1 ou mais, e os controles têm 44 px', async ({ page, browserName }) => {
    test.skip(browserName === 'webkit', 'O WebKit do Playwright no Windows não encaminha Tab ao foco da página.');
    await page.setViewportSize({ width: 360, height: 740 });
    await entrar(page, new MockBackend());
    await abrirMenuSeRecolhido(page);
    for (const link of await menu(page).getByRole('link').all()) {
      const caixa = await link.boundingBox();
      expect(caixa?.height ?? 0).toBeGreaterThanOrEqual(44);
    }
    await page.keyboard.press('Tab');
    const anel = await page.evaluate(() => {
      const elemento = document.activeElement as HTMLElement;
      const estilo = getComputedStyle(elemento);
      const partes = (estilo.outlineColor.match(/[\d.]+/g) ?? ['0', '0', '0']).map(Number);
      const canal = (valor: number) => { const v = valor / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
      const luminancia = 0.2126 * canal(partes[0] ?? 0) + 0.7152 * canal(partes[1] ?? 0) + 0.0722 * canal(partes[2] ?? 0);
      return { estilo: estilo.outlineStyle, largura: parseFloat(estilo.outlineWidth), contrasteComBranco: 1.05 / (luminancia + 0.05) };
    });
    expect(anel.estilo).not.toBe('none');
    expect(anel.largura).toBeGreaterThanOrEqual(2);
    expect(anel.contrasteComBranco).toBeGreaterThanOrEqual(3);
  });

  for (const [largura, altura, abrir] of [[360, 740, true], [768, 1024, false], [1920, 1080, false]] as const) {
    test(`sem violações críticas ou graves do axe em ${largura} px`, async ({ page }) => {
      await page.setViewportSize({ width: largura, height: altura });
      await entrar(page, new MockBackend());
      if (abrir) await abrirMenuSeRecolhido(page);
      await expect(menu(page)).toBeVisible();
      const { violations } = await new AxeBuilder({ page }).analyze();
      expect(violations.filter((violacao) => violacao.impact === 'critical' || violacao.impact === 'serious')).toEqual([]);
    });
  }

  test('com movimento reduzido o menu não tem animação nem transição', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 360, height: 740 });
    await entrar(page, new MockBackend());
    await abrirMenuSeRecolhido(page);
    const efetivos = await menu(page).evaluate((nav) => [nav, ...nav.querySelectorAll('*')].map((elemento) => {
      const estilo = getComputedStyle(elemento);
      return { animacao: estilo.animationName, transicao: estilo.transitionDuration, duracao: estilo.animationDuration };
    }));
    for (const efeito of efetivos) {
      expect(efeito.animacao === 'none' || efeito.duracao === '0s').toBe(true);
      expect(efeito.transicao.split(',').every((valor) => valor.trim() === '0s')).toBe(true);
    }
  });

  for (const [largura, altura] of [[360, 740], [768, 1024], [1920, 1080]] as const) {
    test(`ativar um item em ${largura} px leva o foco ao título da tela de destino e o menu inicia fechado`, async ({ page }) => {
      await page.setViewportSize({ width: largura, height: altura });
      await entrar(page, new MockBackend());
      await abrirMenuSeRecolhido(page);
      await menu(page).getByRole('link', { name: 'Meu perfil' }).click();
      await expect(page).toHaveURL(/\/perfil$/);
      const titulo = page.getByRole('heading', { name: 'Meu perfil', level: 2 });
      await expect(titulo).toBeVisible();
      await expect(titulo).toBeFocused();
      if (largura < 768) {
        await expect(menu(page)).toBeHidden();
        await expect(page.getByRole('button', { name: 'Menu' })).toHaveAttribute('aria-expanded', 'false');
      } else {
        await expect(menu(page).getByRole('link', { name: /Meu perfil/ })).toHaveAttribute('aria-current', 'page');
      }
    });
  }
});

test.describe('US3: o servidor continua decidindo (CA-003, MS-002)', () => {
  const telasRestritas = ['/admin/papeis', '/admin/membros', '/admin/auditoria', '/admin/tenants', '/admin/auditoria-global'];

  test('operador técnico abre cada tela restrita pela URL e vê "Acesso negado", sem dado do tenant', async ({ page }) => {
    const backend = new MockBackend().asProfile('operador');
    backend.accessDenied = true;
    backend.auditDenied = true;
    await entrar(page, backend);
    for (const caminho of telasRestritas) {
      await page.goto(caminho);
      await expect(page.getByText(/Acesso negado/).first(), caminho).toBeVisible();
      await expect(page.getByText('Operador A'), caminho).toHaveCount(0);
      await expect(page.getByText('Tenant A Sintético'), caminho).toHaveCount(0);
    }
    const dados = backend.calls.filter((call) => /manage-|query-audit/.test(call.path));
    expect(dados.length).toBeGreaterThan(0);
  });

  test('administrador que perde tenant.manage depois de o menu carregar recebe "Acesso negado" ao acionar Pessoas', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    const backend = new MockBackend();
    await entrar(page, backend);
    await expect.poll(() => itens(page)).toEqual(ADMINISTRADOR);

    backend.permissionsByOrganization[A] = ['profile.read'];
    backend.accessDenied = true;
    await menu(page).getByRole('link', { name: 'Pessoas do tenant' }).click();
    await expect(page.getByText(/Acesso negado/).first()).toBeVisible();
    await expect(page.getByText('Operador A')).toHaveCount(0);
    await expect.poll(() => itens(page)).toEqual(BASE);
  });

  test('item inserido no menu pelo DOM não concede acesso: o clique continua resultando em "Acesso negado"', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    const backend = new MockBackend().asProfile('operador');
    backend.accessDenied = true;
    await entrar(page, backend);
    await expect.poll(() => itens(page)).toEqual(BASE);

    await menu(page).evaluate((nav) => {
      const item = document.createElement('li');
      item.innerHTML = '<a href="/admin/papeis">Papéis e permissões</a>';
      nav.querySelector('ul')?.appendChild(item);
    });
    await menu(page).getByRole('link', { name: 'Papéis e permissões' }).click();
    await expect(page.getByText(/Acesso negado/).first()).toBeVisible();
    await expect(page.getByRole('checkbox')).toHaveCount(0);
  });

  test('sessão limitada à verificação em duas etapas não vê o menu e só o vê depois do segundo fator', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    const backend = new MockBackend().asProfile('master');
    backend.tenantMemberships = [];
    backend.loginResponses = [backend.authenticated('MFA_REQUIRED')];
    backend.statusResponse = backend.activeStatus('aal2', false);
    await backend.install(page);
    await page.goto('/');
    await page.getByLabel('E-mail').fill('global@e2e.invalid');
    await page.getByLabel('Senha', { exact: true }).fill('Senha-E2E-Global-1');
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();

    await expect(page.getByRole('heading', { name: 'Verificação em duas etapas' })).toBeVisible();
    await expect(page.getByRole('navigation')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Menu' })).toHaveCount(0);
    expect(consultas(backend)).toHaveLength(0);

    await page.getByLabel(/código de 6 dígitos/i).fill('123456');
    await page.getByRole('button', { name: 'Verificar' }).click();
    await expect(page.getByRole('heading', { name: 'Fundação Técnica Ativa' })).toBeVisible();
    await expect(menu(page)).toBeVisible();
    await expect.poll(() => itens(page)).toEqual(GLOBAL);
  });

  test('administrador em AAL1 vê Pessoas do tenant e, ao abri-la, é conduzido à verificação, sem dado algum antes disso', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    const backend = new MockBackend();
    await entrar(page, backend, { aal: 'aal1' });
    await expect.poll(() => itens(page)).toContain('Pessoas do tenant');
    await menu(page).getByRole('link', { name: 'Pessoas do tenant' }).click();
    await expect(page.getByRole('heading', { name: 'Verificação em duas etapas' })).toBeVisible();
    await expect(page.getByText('Operador A')).toHaveCount(0);
    expect(backend.calls.filter((call) => call.path === '/functions/v1/manage-membership')).toHaveLength(0);
  });
});

test.describe('US4: trocar de organização e ver o menu certo (CA-002, MS-005)', () => {
  const doisTenants = (backend: MockBackend) => {
    backend.tenantMemberships = [vinculo(A, 'Tenant A'), vinculo(B, 'Tenant B')];
    return backend;
  };

  test('a troca de A para B remove os itens do tenant anterior, mostra o carregamento e termina só com Início e Meu perfil', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    const backend = doisTenants(new MockBackend().asProfile('dois-tenants'));
    await entrar(page, backend, { caminho: '/admin/membros' });
    await page.getByRole('button', { name: 'Entrar em Tenant A' }).click();
    await expect(page.getByRole('rowheader', { name: 'Operador A' })).toBeVisible();
    await expect.poll(() => itens(page)).toEqual(ADMINISTRADOR);

    backend.delayByPath[PERMISSIONS_PATH] = 1_500;
    await page.getByRole('button', { name: 'Trocar organização' }).click();
    await page.getByRole('button', { name: 'Entrar em Tenant B' }).click();
    await expect(menu(page).getByRole('status')).toContainText('Carregando telas…');
    expect(await itens(page)).toEqual(BASE);

    await expect(menu(page).getByRole('status')).toHaveCount(0);
    expect(await itens(page)).toEqual(BASE);
    expect(consultas(backend).map((call) => (call.body as { organization_id?: string }).organization_id)).toContain(B);
  });

  test('perfil global troca de tenant e mantém Organizações e Auditoria da plataforma', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    const backend = doisTenants(new MockBackend().asProfile('master'));
    await entrar(page, backend, { caminho: '/admin/membros' });
    await page.getByRole('button', { name: 'Entrar em Tenant A' }).click();
    await expect.poll(() => itens(page)).toEqual(GLOBAL);

    await page.getByRole('button', { name: 'Trocar organização' }).click();
    await page.getByRole('button', { name: 'Entrar em Tenant B' }).click();
    await expect(page.getByText('Organização ativa:')).toBeVisible();
    await expect.poll(() => itens(page)).toEqual(GLOBAL);
  });

  test('pessoa sem vínculo ativo vê só Início e Meu perfil e a consulta é feita sem organization_id', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    const backend = new MockBackend().asProfile('sem-vinculo');
    backend.tenantMemberships = [];
    await entrar(page, backend);
    await expect.poll(() => itens(page)).toEqual(BASE);
    const corpos = consultas(backend).map((call) => call.body as Record<string, unknown>);
    expect(corpos.length).toBeGreaterThan(0);
    expect(corpos.every((corpo) => !('organization_id' in corpo))).toBe(true);
  });

  test('sessão expirada ao recarregar remove o menu e não deixa permissão nem cache na aba', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    const backend = new MockBackend();
    await entrar(page, backend);
    await expect.poll(() => itens(page)).toEqual(ADMINISTRADOR);
    expect(await page.evaluate(() => Object.keys(sessionStorage).filter((chave) => chave.startsWith('fluxid.menu.')).length)).toBeGreaterThan(0);

    backend.statusResponse = { status: 401, body: { code: 'SESSION_EXPIRED', reason: 'inactivity' } };
    await page.reload();
    await expect(page.getByRole('alert')).toContainText(/inatividade/i);
    await expect(page.getByRole('navigation')).toHaveCount(0);
    expect(await page.evaluate(() => Object.keys(sessionStorage).filter((chave) => chave.startsWith('fluxid.menu.')))).toEqual([]);
  });
});

test.describe('US5: carregamento, erro e offline (CA-006)', () => {
  const semItemRestrito = async (page: Page) => expect(await itens(page)).toEqual(BASE);
  const axeSemGraves = async (page: Page) => {
    const { violations } = await new AxeBuilder({ page }).analyze();
    expect(violations.filter((violacao) => violacao.impact === 'critical' || violacao.impact === 'serious')).toEqual([]);
  };

  test('consulta lenta: só Início e Meu perfil, carregamento anunciado uma vez, sem mover o foco', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    const backend = new MockBackend();
    backend.delayByPath[PERMISSIONS_PATH] = 1_500;
    await entrar(page, backend);
    await expect(menu(page).getByRole('status')).toHaveCount(1);
    await expect(menu(page).getByRole('status')).toContainText('Carregando telas…');
    await semItemRestrito(page);
    const foco = await page.evaluate(() => document.activeElement?.tagName);
    expect(foco).toBe('BODY');
    await axeSemGraves(page);
    await expect.poll(() => itens(page)).toEqual(ADMINISTRADOR);
  });

  test('falha da consulta: aviso e "Tentar de novo", que refaz a consulta', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    const backend = new MockBackend();
    backend.permissionsStatus = 500;
    await entrar(page, backend);
    await expect(menu(page).getByRole('alert')).toContainText('Parte das telas não pôde ser listada.');
    await semItemRestrito(page);
    expect(await page.evaluate(() => document.activeElement?.tagName)).toBe('BODY');
    await axeSemGraves(page);

    backend.permissionsStatus = 200;
    await menu(page).getByRole('button', { name: 'Tentar de novo' }).click();
    await expect.poll(() => itens(page)).toEqual(ADMINISTRADOR);
  });

  test('consulta que nunca responde cai para erro em 5 segundos sem bloquear a navegação', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    const backend = new MockBackend();
    backend.delayByPath[PERMISSIONS_PATH] = 30_000;
    await entrar(page, backend);
    await expect(menu(page).getByRole('status')).toContainText('Carregando telas…');
    await expect(menu(page).getByRole('alert')).toContainText('Parte das telas não pôde ser listada.', { timeout: 8_000 });
    await semItemRestrito(page);
    await menu(page).getByRole('link', { name: 'Meu perfil' }).click();
    await expect(page).toHaveURL(/\/perfil$/);
  });

  test('perda de rede com as últimas telas conhecidas: mostra-as com o aviso de desatualizadas', async ({ page, context, browserName }) => {
    test.skip(browserName === 'webkit', 'O driver WebKit do Playwright no Windows apresenta falha de IPC ao combinar setOffline com service worker.');
    await page.setViewportSize({ width: 1920, height: 1080 });
    await entrar(page, new MockBackend());
    await expect.poll(() => itens(page)).toEqual(ADMINISTRADOR);
    await context.setOffline(true);
    try {
      await expect(menu(page).getByRole('status')).toContainText('Sem conexão. As telas podem estar desatualizadas.');
      expect(await itens(page)).toEqual(ADMINISTRADOR);
      expect(await page.evaluate(() => document.activeElement?.tagName)).toBe('BODY');
      await axeSemGraves(page);
    } finally {
      await context.setOffline(false);
    }
    await expect(menu(page).getByRole('status')).toHaveCount(0);
  });

  test('tenant suspenso ou vínculo bloqueado depois de o menu carregar: a consulta seguinte corrige o menu sem mostrar item restrito', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    const backend = new MockBackend();
    await page.clock.install();
    await entrar(page, backend);
    await expect.poll(() => itens(page)).toEqual(ADMINISTRADOR);
    backend.permissionsByOrganization[A] = [];
    await page.clock.fastForward(61_000);
    await expect.poll(() => itens(page)).toEqual(BASE);
  });
});

test.describe('US5: aplicativo instalado, recarregando offline (RNF-002)', () => {
  test.use({ serviceWorkers: 'allow' });

  test('o menu abre offline com Início e Meu perfil e, havendo cache da mesma sessão e tenant, com as últimas telas', async ({ page, context, browserName }) => {
    test.skip(browserName === 'webkit', 'O driver WebKit do Playwright no Windows apresenta falha de IPC ao combinar setOffline com service worker.');
    await page.setViewportSize({ width: 1920, height: 1080 });
    const backend = new MockBackend();
    await backend.install(page);
    await page.goto('/');
    await page.evaluate(async () => { await navigator.serviceWorker.ready; });
    await page.reload();
    await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);

    backend.loginResponses = [backend.authenticated()];
    backend.statusResponse = backend.activeStatus('aal2');
    await page.getByLabel('E-mail').fill('admin-a@example.invalid');
    await page.getByLabel('Senha', { exact: true }).fill('Local-only-002!');
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    await expect.poll(() => itens(page)).toEqual(ADMINISTRADOR);

    await context.setOffline(true);
    try {
      await page.reload();
      await expect(menu(page)).toBeVisible();
      const lista = await itens(page);
      expect(lista.slice(0, 2)).toEqual(BASE);
      // Com o cache da mesma sessão e tenant as últimas telas aparecem; sem ele, só as duas primeiras (nunca item além do cache).
      expect([BASE, ADMINISTRADOR]).toContainEqual(lista);
      await expect(menu(page).getByRole('status')).toContainText('Sem conexão. As telas podem estar desatualizadas.');
    } finally {
      await context.setOffline(false);
    }
  });
});

test.describe('US6: mudança de permissão refletida (CA-006)', () => {
  test('em até 60 segundos o item Auditoria do tenant aparece e some, e o servidor já recusa a tela no momento da retirada', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    const backend = new MockBackend();
    backend.permissionsByOrganization[A] = ['profile.read', 'tenant.manage'];
    await page.clock.install();
    await entrar(page, backend);
    await expect.poll(() => itens(page)).toEqual([...BASE, 'Pessoas do tenant', 'Papéis e permissões']);

    backend.permissionsByOrganization[A] = ['audit.read', 'profile.read', 'tenant.manage'];
    await page.clock.fastForward(61_000);
    await expect.poll(() => itens(page)).toContain('Auditoria do tenant');

    backend.permissionsByOrganization[A] = ['profile.read', 'tenant.manage'];
    backend.auditDenied = true;
    await page.goto('/admin/auditoria');
    await expect(page.getByText(/Acesso negado/).first()).toBeVisible();
    await expect.poll(() => itens(page)).not.toContain('Auditoria do tenant');
  });

  test('recarregar a página também reflete a mudança, sem novo login', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    const backend = new MockBackend();
    await entrar(page, backend);
    await expect.poll(() => itens(page)).toEqual(ADMINISTRADOR);
    backend.permissionsByOrganization[A] = ['profile.read'];
    await page.reload();
    await expect.poll(() => itens(page)).toEqual(BASE);
  });
});
