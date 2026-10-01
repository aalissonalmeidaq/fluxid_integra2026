import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { MockBackend, threeSessions } from './support/mock-backend';

// Autenticação e sessão (US1) com backend simulado por rede. O comportamento real de Auth, RLS,
// limite de sessões e MFA é provado em tests/**/*.live.test.ts e supabase/tests.
async function open(page: Page, backend: MockBackend) {
  await backend.install(page);
  await page.goto('/');
}

const signIn = async (page: Page, email = 'ana@e2e.invalid', password = 'Senha-E2E-Forte-1') => {
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
};

// O service worker da PWA responde antes da interceptação de rede do Playwright no WebKit; bloqueá-lo
// mantém o backend simulado como única origem das respostas.
test.use({ serviceWorkers: 'block' });

test.describe('Autenticação e sessão (US1)', () => {
  test('exige login antes de exibir conteúdo protegido, entra e sai com segurança', async ({ page }) => {
    const backend = new MockBackend();
    backend.loginResponses = [backend.authenticated()];
    backend.statusResponse = backend.activeStatus();
    await open(page, backend);

    await expect(page.getByRole('heading', { name: 'Entrar no FluxID' })).toBeVisible();
    await expect(page.getByText('Fundação Técnica Ativa')).toHaveCount(0);

    await signIn(page);
    await expect(page.getByRole('heading', { name: 'Fundação Técnica Ativa' })).toBeVisible();

    await page.getByRole('button', { name: 'Sair' }).click();
    await expect(page.getByRole('heading', { name: 'Entrar no FluxID' })).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: /você saiu/i })).toBeVisible();
    await expect(page.getByText('Fundação Técnica Ativa')).toHaveCount(0);
  });

  test('credenciais inválidas mostram mensagem genérica e devolvem o foco à senha', async ({ page }) => {
    const backend = new MockBackend();
    backend.loginResponses = [{ status: 401, body: { code: 'INVALID_CREDENTIALS' } }];
    await open(page, backend);
    await signIn(page);

    await expect(page.getByRole('alert')).toContainText(/e-mail ou senha incorretos/i);
    await expect(page.getByLabel('Senha', { exact: true })).toBeFocused();
    await expect(page.getByLabel('Senha', { exact: true })).toHaveValue('');
    await expect(page.getByText('Fundação Técnica Ativa')).toHaveCount(0);
  });

  test('perfil global conclui a verificação em duas etapas antes de acessar', async ({ page }) => {
    const backend = new MockBackend();
    backend.loginResponses = [backend.authenticated('MFA_REQUIRED')];
    backend.statusResponse = backend.activeStatus('aal2', false);
    await open(page, backend);
    await signIn(page, 'global@e2e.invalid', 'Senha-E2E-Global-1');

    await expect(page.getByRole('heading', { name: 'Verificação em duas etapas' })).toBeVisible();
    await expect(page.getByRole('img', { name: /qr code/i })).toBeVisible();
    await expect(page.getByText('JBSWY3DPEHPK3PXP')).toBeVisible();
    await expect(page.getByText('Fundação Técnica Ativa')).toHaveCount(0);

    await page.getByLabel(/código de 6 dígitos/i).fill('123456');
    await page.getByRole('button', { name: 'Verificar' }).click();
    await expect(page.getByRole('heading', { name: 'Fundação Técnica Ativa' })).toBeVisible();
  });

  test('código MFA incorreto não libera o acesso e mantém mensagem genérica', async ({ page }) => {
    const backend = new MockBackend();
    backend.loginResponses = [backend.authenticated('MFA_REQUIRED')];
    backend.verifyOk = false;
    await open(page, backend);
    await signIn(page, 'global@e2e.invalid', 'Senha-E2E-Global-1');

    await page.getByLabel(/código de 6 dígitos/i).fill('000000');
    await page.getByRole('button', { name: 'Verificar' }).click();
    await expect(page.getByRole('alert')).toContainText(/código incorreto/i);
    await expect(page.getByLabel(/código de 6 dígitos/i)).toBeFocused();
    await expect(page.getByText('Fundação Técnica Ativa')).toHaveCount(0);
  });

  test('quarta sessão lista as três ativas e só entra após encerramento explícito', async ({ page }) => {
    const backend = new MockBackend();
    backend.loginResponses = [
      { status: 409, body: { code: 'SESSION_LIMIT_REACHED', sessions: threeSessions } },
      backend.authenticated(),
    ];
    backend.statusResponse = backend.activeStatus();
    await open(page, backend);
    await signIn(page);

    const dialog = page.getByRole('dialog', { name: /limite de sessões/i });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('radio')).toHaveCount(3);
    await expect(page.getByText('Fundação Técnica Ativa')).toHaveCount(0);

    const confirm = dialog.getByRole('button', { name: /encerrar sessão selecionada/i });
    await expect(confirm).toBeDisabled();
    await dialog.getByRole('radio').nth(1).check();
    await confirm.click();

    await expect(page.getByRole('heading', { name: 'Fundação Técnica Ativa' })).toBeVisible();
    const retry = backend.calls.filter((call) => call.path === '/functions/v1/session-login').at(-1)?.body as Record<string, string>;
    expect(retry.revoke_session_id).toBe(threeSessions[1]!.session_id);
  });

  test('o diálogo do limite é operável por teclado, cancela com Esc e devolve o foco', async ({ page, browserName }) => {
    test.skip(browserName === 'webkit', 'O driver WebKit do Playwright no Windows não encaminha teclas ao foco da página neste cenário.');
    const backend = new MockBackend();
    backend.loginResponses = [{ status: 409, body: { code: 'SESSION_LIMIT_REACHED', sessions: threeSessions } }];
    await open(page, backend);
    await signIn(page);

    const dialog = page.getByRole('dialog', { name: /limite de sessões/i });
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(page.getByRole('button', { name: 'Entrar', exact: true })).toBeFocused();
  });

  test('sessão expirada ao reabrir conduz ao login com aviso acessível e foco no aviso', async ({ page }) => {
    const backend = new MockBackend();
    backend.loginResponses = [backend.authenticated()];
    backend.statusResponse = backend.activeStatus();
    await open(page, backend);
    await signIn(page);
    await expect(page.getByRole('heading', { name: 'Fundação Técnica Ativa' })).toBeVisible();

    backend.statusResponse = { status: 401, body: { code: 'SESSION_EXPIRED', reason: 'inactivity' } };
    await page.reload();

    const alert = page.getByRole('alert');
    await expect(alert).toContainText(/inatividade/i);
    await expect(alert).toContainText(/entre novamente/i);
    await expect(alert).toBeFocused();
    await expect(page.getByText('Fundação Técnica Ativa')).toHaveCount(0);
  });

  test('sessão restaurada e ativa mantém o acesso após recarregar', async ({ page }) => {
    const backend = new MockBackend();
    backend.loginResponses = [backend.authenticated()];
    backend.statusResponse = backend.activeStatus();
    await open(page, backend);
    await signIn(page);
    await expect(page.getByRole('heading', { name: 'Fundação Técnica Ativa' })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Fundação Técnica Ativa' })).toBeVisible();
  });

  test('não há violações críticas ou graves de acessibilidade no login, no MFA e no diálogo', async ({ page }) => {
    const backend = new MockBackend();
    backend.loginResponses = [{ status: 409, body: { code: 'SESSION_LIMIT_REACHED', sessions: threeSessions } }];
    await open(page, backend);
    await page.getByRole('heading', { name: 'Entrar no FluxID' }).waitFor();

    const scan = async (label: string) => {
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag22aa']).analyze();
      const blocking = results.violations.filter((violation) => violation.impact === 'critical' || violation.impact === 'serious');
      expect(blocking.map((violation) => `${violation.id}: ${violation.nodes.map((node) => node.target.join(' ')).join('; ')}`), label).toEqual([]);
    };

    await scan('login');
    await signIn(page);
    await page.getByRole('dialog').waitFor();
    await scan('diálogo de sessões');
  });

  test('o formulário cabe em 360 px sem rolagem horizontal', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 640 });
    const backend = new MockBackend();
    await open(page, backend);
    await page.getByRole('heading', { name: 'Entrar no FluxID' }).waitFor();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  // CA-006 e MS-004: o percurso de entrada e de recuperação opera só pelo teclado, em qualquer largura de referência.
  test('entra e abre a recuperação só pelo teclado, com o link de pular como primeiro item', async ({ page, browserName }) => {
    test.skip(browserName === 'webkit', 'O WebKit não encaminha Tab no Windows.');
    const backend = new MockBackend();
    backend.loginResponses = [backend.authenticated()];
    backend.statusResponse = backend.activeStatus();
    await open(page, backend);
    await page.getByRole('heading', { name: 'Entrar no FluxID' }).waitFor();

    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'Pular para o conteúdo principal' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('main')).toBeFocused();

    await page.keyboard.press('Tab');
    await expect(page.getByLabel('E-mail')).toBeFocused();
    await page.keyboard.type('ana@e2e.invalid');
    await page.keyboard.press('Tab');
    await expect(page.getByLabel('Senha', { exact: true })).toBeFocused();
    await page.keyboard.type('Senha-E2E-Forte-1');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { name: 'Fundação Técnica Ativa' })).toBeVisible();
  });

  test('chega à recuperação de acesso e volta só pelo teclado', async ({ page, browserName }) => {
    test.skip(browserName === 'webkit', 'O WebKit não encaminha Tab no Windows.');
    await open(page, new MockBackend());
    await page.getByRole('heading', { name: 'Entrar no FluxID' }).waitFor();
    await page.getByRole('button', { name: 'Esqueci minha senha' }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { name: 'Recuperar acesso' })).toBeVisible();
    await page.getByRole('button', { name: 'Voltar para entrar' }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { name: 'Entrar no FluxID' })).toBeVisible();
  });
});
