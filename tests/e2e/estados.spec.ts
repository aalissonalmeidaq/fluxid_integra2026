import { test, expect, type Page } from '@playwright/test';
import { MockBackend } from './support/mock-backend';

test.use({ serviceWorkers: 'block' });

const ORG = '20000000-0000-0000-0000-00000000000a';
const BACKEND = 'http://127.0.0.1:54321/**';

// A rota simulada responde mesmo com o contexto offline; por isso a perda de rede também aborta as requisições ao backend.
async function perderRede(page: Page): Promise<() => Promise<void>> {
  const abortar = (rota: import('@playwright/test').Route) => rota.abort('internetdisconnected');
  await page.context().setOffline(true);
  await page.route(BACKEND, abortar);
  return async () => {
    await page.unroute(BACKEND, abortar);
    await page.context().setOffline(false);
  };
}

async function enter(page: Page, backend: MockBackend, path: string, aal: 'aal1' | 'aal2' = 'aal1'): Promise<void> {
  backend.loginResponses = [backend.authenticated()];
  backend.statusResponse = backend.activeStatus(aal);
  await backend.install(page);
  await page.goto('/');
  await page.getByLabel('E-mail').fill('admin-a@example.invalid');
  await page.getByLabel('Senha', { exact: true }).fill('Local-only-002!');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Minha conta' })).toBeVisible();
  await page.goto(path);
}

// Spec 003, história 7: vocabulário único de carregamento, erro, offline e sincronização (RF-021 a RF-023, CA-009).
test.describe('Estados de interface', () => {
  test('operação sensível sem rede mostra erro de conexão e nenhuma confirmação de sucesso', async ({ page }) => {
    await enter(page, new MockBackend(), '/perfil');
    const nome = page.getByLabel('Nome de exibição');
    await expect(nome).toHaveValue('Ana Souza');
    await nome.fill('Ana Maria Souza');
    await perderRede(page);
    await page.getByRole('button', { name: 'Salvar nome' }).click();
    // O texto exato vem da camada de aplicação da Spec 002 (fora do escopo desta spec); o que importa aqui é o erro anunciado.
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: /perfil atualizado/i })).toHaveCount(0);
  });

  test('na volta da rede o indicador volta ao normal sem apagar o texto digitado', async ({ page }) => {
    await enter(page, new MockBackend(), '/perfil');
    const nome = page.getByLabel('Nome de exibição');
    await expect(nome).toHaveValue('Ana Souza');
    await nome.fill('Texto ainda não salvo');
    const restaurar = await perderRede(page);
    await expect(page.getByText(/modo offline em operação/i)).toBeVisible();
    await restaurar();
    await expect(page.getByText(/modo offline em operação/i)).toHaveCount(0);
    await expect(nome).toHaveValue('Texto ainda não salvo');
  });

  test('o carregamento é anunciado uma vez e não bloqueia o teclado', async ({ page, browserName }) => {
    const backend = new MockBackend();
    await enter(page, backend, '/');
    backend.delayByPath['/rest/v1/profiles'] = 2000;
    await page.goto('/perfil');
    const carregando = page.getByRole('status').filter({ hasText: /carregando perfil/i });
    await expect(carregando).toHaveCount(1);
    await expect(carregando).toHaveAttribute('aria-live', 'polite');
    if (browserName !== 'webkit') {
      await page.keyboard.press('Tab');
      expect(await page.evaluate(() => document.activeElement?.tagName)).not.toBe('BODY');
    }
    await expect(page.getByLabel('Nome de exibição')).toBeVisible({ timeout: 10_000 });
  });

  test('com movimento reduzido nenhuma animação roda durante o carregamento', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const backend = new MockBackend();
    await enter(page, backend, '/');
    backend.delayByPath['/rest/v1/profiles'] = 2000;
    await page.goto('/perfil');
    await expect(page.getByRole('status').filter({ hasText: /carregando perfil/i })).toBeVisible();
    const emExecucao = await page.evaluate(() => document.getAnimations().filter((animacao) => animacao.playState === 'running').length);
    expect(emExecucao).toBe(0);
  });

  test('diálogo aberto com a rede perdida informa o erro, sem confirmação falsa e com o foco no aviso', async ({ page }) => {
    await enter(page, new MockBackend(), `/admin/membros?organization_id=${ORG}`, 'aal2');
    await expect(page.getByRole('rowheader', { name: /Operador A/ })).toBeVisible();
    await page.getByRole('button', { name: 'Bloquear Operador A' }).click();
    await page.getByLabel('Justificativa da alteração').fill('Afastamento temporário aprovado');
    await perderRede(page);
    await page.getByRole('button', { name: 'Confirmar bloqueio' }).click();
    const aviso = page.getByRole('alert').filter({ hasText: /não foi possível concluir/i });
    await expect(aviso).toBeVisible();
    await expect(aviso).toBeFocused();
    await expect(page.getByRole('status').filter({ hasText: /vínculo atualizado/i })).toHaveCount(0);
    await expect(page.getByText('Bloqueado', { exact: true })).toHaveCount(0);
  });
});
