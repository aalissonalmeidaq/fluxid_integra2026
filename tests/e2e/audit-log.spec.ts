import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { MockBackend } from './support/mock-backend';

test.use({ serviceWorkers: 'block' });

const A = '20000000-0000-0000-0000-00000000000a';
const B = '20000000-0000-0000-0000-00000000000b';

const membership = (organizationId: string, name: string) => ({
  id: `30000000-0000-0000-0000-00000000000${organizationId.slice(-1)}`, organization_id: organizationId, status: 'active',
  organizations: { id: organizationId, kind: 'tenant', status: 'active', display_name: name },
});

async function enter(page: Page, backend: MockBackend, path = '/admin/auditoria', aal: 'aal1' | 'aal2' = 'aal1'): Promise<void> {
  backend.loginResponses = [backend.authenticated()];
  backend.statusResponse = backend.activeStatus(aal);
  await backend.install(page);
  await page.goto('/');
  await page.getByLabel('E-mail').fill('admin-a@example.invalid');
  await page.getByLabel('Senha', { exact: true }).fill('Local-only-002!');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Sair' })).toBeVisible();
  await page.goto(path);
}

test.describe('Consulta de auditoria', () => {
  test('em 360 px mostra os eventos como cartões, pagina por cursor e não gera rolagem horizontal', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    const backend = new MockBackend();
    await enter(page, backend);
    await expect(page.getByRole('heading', { level: 2, name: 'Auditoria do tenant' })).toBeVisible();
    const rows = page.getByRole('table', { name: 'Eventos de auditoria' }).getByRole('row');
    // Uma única árvore: a linha de cabeçalho (só para tecnologia assistiva) mais os 50 eventos, apresentados como cartões.
    await expect(rows).toHaveCount(51);
    await expect(rows.nth(1)).toHaveCSS('display', 'block');
    await expect(page.getByRole('status').filter({ hasText: /50 eventos exibidos/ })).toBeVisible();
    await page.getByRole('button', { name: 'Carregar mais eventos' }).click();
    await expect(rows).toHaveCount(61);
    await expect(page.getByRole('button', { name: 'Carregar mais eventos' })).toHaveCount(0);
    await expect(page.locator('html')).toHaveJSProperty('scrollWidth', 360);
  });

  test('em tela larga mostra a tabela com legenda, colunas e resultado em texto', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    const backend = new MockBackend();
    await enter(page, backend);
    const table = page.getByRole('table', { name: 'Eventos de auditoria' });
    await expect(table).toBeVisible();
    await expect(table.getByRole('columnheader')).toHaveText(['Data e hora', 'Ator', 'Ação', 'Alvo', 'Resultado', 'Detalhes']);
    await expect(table.getByRole('row')).toHaveCount(51);
    await expect(table.getByText('Negado').first()).toBeVisible();
    await expect(table.getByText('Sucesso').first()).toBeVisible();
    await expect(page.getByRole('list', { name: 'Eventos em lista' })).toHaveCount(0);
  });

  test('filtra por resultado e por ação dentro do tenant', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    const backend = new MockBackend();
    await enter(page, backend);
    await page.getByLabel('Resultado').selectOption('denied');
    await page.getByRole('button', { name: 'Filtrar' }).click();
    const rows = page.getByRole('table', { name: 'Eventos de auditoria' }).getByRole('row');
    await expect(rows).toHaveCount(21);
    await expect(page.getByRole('table').getByText('Sucesso')).toHaveCount(0);

    await page.getByRole('button', { name: 'Limpar filtros' }).click();
    await expect(rows).toHaveCount(51);
    await page.getByLabel('Ação').fill('role.create');
    await page.getByRole('button', { name: 'Filtrar' }).click();
    await expect(page.getByRole('table').getByText('invitation.send')).toHaveCount(0);
    await expect(page.getByRole('status').filter({ hasText: /eventos? exibidos?/ })).toBeVisible();
  });

  test('valida filtros inválidos com mensagem acessível e sem consultar o servidor', async ({ page }) => {
    const backend = new MockBackend();
    await enter(page, backend);
    await expect(page.getByRole('heading', { level: 2, name: 'Auditoria do tenant' })).toBeVisible();
    const queries = () => backend.calls.filter((call) => call.path === '/functions/v1/query-audit').length;
    // A carga inicial envia a consulta depois de o título aparecer; medir antes dela conta a chamada como se fosse do filtro.
    await expect.poll(queries).toBeGreaterThan(0);
    await expect(page.getByRole('status').filter({ hasText: /carregando/i })).toHaveCount(0);
    const before = queries();
    await page.getByLabel('Ação').fill('ação inválida!');
    await page.getByRole('button', { name: 'Filtrar' }).click();
    await expect(page.getByLabel('Ação')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByText(/letras minúsculas, números, ponto ou sublinhado/i)).toBeVisible();
    expect(backend.calls.filter((call) => call.path === '/functions/v1/query-audit').length).toBe(before);
  });

  test('sem permissão mostra acesso negado e nenhum evento', async ({ page }) => {
    const backend = new MockBackend();
    backend.auditDenied = true;
    await enter(page, backend);
    await expect(page.getByRole('alert').filter({ hasText: /acesso negado/i })).toBeVisible();
    await expect(page.getByRole('list', { name: 'Eventos em lista' })).toHaveCount(0);
    await expect(page.getByRole('table')).toHaveCount(0);
  });

  test('a troca de tenant mostra somente a auditoria do tenant escolhido', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    const backend = new MockBackend();
    backend.tenantMemberships = [membership(A, 'Tenant A'), membership(B, 'Tenant B')];
    await enter(page, backend);
    await page.getByRole('button', { name: 'Entrar em Tenant B' }).click();
    const table = page.getByRole('table', { name: 'Eventos de auditoria' });
    await expect(table.getByRole('row')).toHaveCount(4);
    await expect(table.getByText('alvo-100')).toBeVisible();

    await page.getByRole('button', { name: 'Trocar organização' }).click();
    await page.getByRole('button', { name: 'Entrar em Tenant A' }).click();
    await expect(table.getByRole('row')).toHaveCount(51);
    await expect(table.getByText('alvo-100')).toHaveCount(0);
    const scopes = backend.calls.filter((call) => call.path === '/functions/v1/query-audit').map((call) => (call.body as { organization_id?: string }).organization_id);
    expect(scopes).toEqual([B, A]);
  });

  test('a auditoria da plataforma exige segundo fator e consulta sem organização', async ({ page }) => {
    const backend = new MockBackend();
    await enter(page, backend, '/admin/auditoria-global', 'aal1');
    await expect(page.getByRole('heading', { level: 2, name: 'Auditoria da plataforma' })).toHaveCount(0);
    expect(backend.calls.filter((call) => call.path === '/functions/v1/query-audit')).toEqual([]);
  });

  test('com AAL2 a auditoria da plataforma consulta o escopo global', async ({ page }) => {
    const backend = new MockBackend();
    await enter(page, backend, '/admin/auditoria-global', 'aal2');
    await expect(page.getByRole('heading', { level: 2, name: 'Auditoria da plataforma' })).toBeVisible();
    const auditCalls = () => backend.calls.filter((call) => call.path === '/functions/v1/query-audit');
    // A consulta sai depois de o título aparecer; espera a chamada em vez de lê-la no mesmo instante.
    await expect.poll(() => auditCalls().length).toBe(1);
    const calls = auditCalls();
    expect(calls[0]!.body).toMatchObject({ scope: 'global' });
    expect(calls[0]!.body).not.toHaveProperty('organization_id');
  });

  test('não possui violações críticas ou graves de acessibilidade, nem com erro de filtro', async ({ page }) => {
    const backend = new MockBackend();
    await enter(page, backend);
    await expect(page.getByRole('heading', { level: 2, name: 'Auditoria do tenant' })).toBeVisible();
    await expect(page.getByRole('table', { name: 'Eventos de auditoria' })).toBeVisible();
    const blocking = async () => (await new AxeBuilder({ page }).analyze()).violations.filter((item) => ['critical', 'serious'].includes(item.impact ?? ''));
    expect(await blocking()).toEqual([]);
    await page.getByLabel('Ação').fill('ação inválida!');
    await page.getByRole('button', { name: 'Filtrar' }).click();
    await expect(page.getByLabel('Ação')).toHaveAttribute('aria-invalid', 'true');
    expect(await blocking()).toEqual([]);
  });

  test('funciona só pelo teclado', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    const backend = new MockBackend();
    await enter(page, backend);
    await expect(page.getByRole('table', { name: 'Eventos de auditoria' })).toBeVisible();
    await page.getByLabel('Resultado').focus();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    // Enter em um select não envia o formulário: percorre até o botão Filtrar, como faria quem usa só o teclado.
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Filtrar' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('table').getByText('Sucesso')).toHaveCount(0);
  });
});
