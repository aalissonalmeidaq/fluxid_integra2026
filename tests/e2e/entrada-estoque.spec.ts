import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { MockBackend, type PermissionProfile } from './support/mock-backend';

test.use({ serviceWorkers: 'block' });

// Spec 006, história 3: entrada no estoque por identificador, idempotente, com leitor tipo teclado, avisos, offline e sem
// guardar nada no aparelho (RF-029, RF-035, RF-036, CA-007, MS-002).
async function entrar(page: Page, perfil: PermissionProfile = 'cilindros-estoquista'): Promise<MockBackend> {
  const backend = new MockBackend().asProfile(perfil);
  backend.loginResponses = [backend.authenticated()];
  backend.statusResponse = backend.activeStatus('aal1');
  await backend.install(page);
  await page.goto('/');
  await page.getByLabel('E-mail').fill('estoquista@example.invalid');
  await page.getByLabel('Senha', { exact: true }).fill('Local-only-002!');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Visão geral' })).toBeVisible();
  await page.goto('/estoque/entrada');
  await expect(page.getByRole('heading', { level: 2, name: 'Entrada no estoque' })).toBeVisible();
  return backend;
}

const campo = (page: Page) => page.getByLabel('Identificador');

// Uma leitura como faz um leitor tipo teclado: digita o valor e envia Enter, sem tocar no mouse.
async function ler(page: Page, valor: string): Promise<void> {
  await page.keyboard.type(valor);
  await page.keyboard.press('Enter');
}

test.describe('Entrada no estoque', () => {
  test('o campo tem o foco inicial e 20 leituras seguidas são concluídas só com o teclado', async ({ page }) => {
    const backend = await entrar(page);
    await expect(campo(page)).toBeFocused();
    // Na massa simulada, os cilindros 6 a 26 estão fora do estoque; o 15 está inativo e fica de fora (20 leituras).
    for (const n of [...Array.from({ length: 9 }, (_, i) => 6 + i), ...Array.from({ length: 11 }, (_, i) => 16 + i)]) {
      await ler(page, `QR-${String(n).padStart(3, '0')}`);
      await expect(page.getByText(new RegExp(`Cilindro CIL-${String(n).padStart(3, '0')} está em estoque`))).toBeVisible();
      await expect(campo(page)).toHaveValue('');
      await expect(campo(page)).toBeFocused();
    }
    expect(backend.cylinders.cylinders.filter((c) => c.stock_status === 'in_stock' && c.organization_id.endsWith('a'))).toHaveLength(5 + 20);
    const entradas = backend.calls.filter((call) => call.path === '/functions/v1/manage-cylinders' && (call.body as { operation?: string }).operation === 'stock_in');
    expect(new Set(entradas.map((call) => (call.body as { operation_key: string }).operation_key)).size).toBe(20);
  });

  test('entrada repetida não duplica e outro identificador do mesmo cilindro em estoque é recusado', async ({ page }) => {
    const backend = await entrar(page);
    await ler(page, 'QR-029');
    await expect(page.getByText(/Cilindro CIL-029 está em estoque/)).toBeVisible();
    await ler(page, 'QR-029');
    await expect(page.getByRole('alert')).toContainText(/já está em estoque/i);
    expect(backend.cylinders.events.filter((event) => event.event_type === 'stock_in' && event.cylinder_id.endsWith('29'))).toHaveLength(1);
  });

  test('resultado desconhecido: "Tentar de novo" reaproveita a chave e não duplica', async ({ page }) => {
    const backend = await entrar(page);
    backend.cylinders.loseNextStockInResponse = true;
    await ler(page, 'QR-031');
    await expect(page.getByRole('alert')).toContainText(/não foi possível confirmar/i);
    await expect(campo(page)).toHaveValue('QR-031');
    await page.getByRole('button', { name: 'Tentar de novo' }).click();
    await expect(page.getByRole('status').filter({ hasText: /já tinha sido registrada.*nada foi duplicado/i })).toBeVisible();
    expect(backend.cylinders.events.filter((event) => event.event_type === 'stock_in' && event.cylinder_id.endsWith('31'))).toHaveLength(1);
    const chaves = backend.calls.filter((call) => (call.body as { operation?: string } | null)?.operation === 'stock_in').map((call) => (call.body as { operation_key: string }).operation_key);
    expect(chaves).toHaveLength(2);
    expect(chaves[0]).toBe(chaves[1]);
  });

  test('cilindro inativo, identificador desconhecido e identificador desativado têm mensagens claras', async ({ page }) => {
    await entrar(page);
    await ler(page, 'QR-015');
    await expect(page.getByRole('alert')).toContainText(/inativo e não pode entrar no estoque/i);
    await ler(page, 'QR-NAO-EXISTE');
    await expect(page.getByRole('alert')).toContainText(/cilindro não encontrado/i);
    await expect(page.getByRole('link', { name: 'Cadastrar cilindro' })).toBeVisible();
    await ler(page, 'NFC-ANTIGA');
    await expect(page.getByRole('alert')).toContainText(/foi desativado e pertencia ao cilindro CIL-006/i);
  });

  test('teste vencido ou reprovado não impede a entrada, mas o aviso é destacado', async ({ page }) => {
    await entrar(page);
    await ler(page, 'QR-010');
    // CIL-010 tem teste aprovado vencido (múltiplo de 5).
    const aviso = page.getByRole('status').filter({ hasText: /entrada registrada/i });
    await expect(aviso).toContainText(/teste hidrostático.*vencido/i);
    await ler(page, 'QR-021');
    await expect(page.getByRole('status').filter({ hasText: /entrada registrada/i })).toContainText(/teste hidrostático.*reprovado/i);
  });

  test('sem conexão a tela informa que a operação exige conexão e nada é gravado', async ({ page }) => {
    const backend = await entrar(page);
    await page.context().setOffline(true);
    await expect(page.getByText(/exige conexão/i).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Registrar entrada' })).toBeDisabled();
    const antes = backend.calls.length;
    await campo(page).fill('QR-040');
    await campo(page).press('Enter');
    expect(backend.calls.length).toBe(antes);
    expect(backend.cylinders.cylinders.find((c) => c.serial_number === 'CIL-040')?.stock_status).toBe('out_of_stock');
    // Nada de cilindro fica no aparelho.
    const armazenado = await page.evaluate(async () => {
      const chaves = [...Object.keys(localStorage), ...Object.keys(sessionStorage)];
      const nomesDeCache = await globalThis.caches.keys();
      return JSON.stringify({ chaves, nomesDeCache });
    });
    expect(armazenado.toLowerCase()).not.toMatch(/cilind|cylinder|qr-0/);
  });

  test('sem permissão de entrada, a tela nega o acesso', async ({ page }) => {
    const backend = new MockBackend().asProfile('cilindros-tecnico');
    backend.loginResponses = [backend.authenticated()];
    backend.statusResponse = backend.activeStatus('aal1');
    await backend.install(page);
    await page.goto('/');
    await page.getByLabel('E-mail').fill('tecnico@example.invalid');
    await page.getByLabel('Senha', { exact: true }).fill('Local-only-002!');
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    await expect(page.getByRole('heading', { level: 2, name: 'Visão geral' })).toBeVisible();
    await page.goto('/estoque/entrada');
    await expect(page.getByRole('alert')).toContainText(/não tem permissão/i);
    await expect(campo(page)).toHaveCount(0);
  });

  test('sem violação crítica ou grave no axe e sem rolagem horizontal', async ({ page }) => {
    await entrar(page);
    await ler(page, 'QR-006');
    await expect(page.getByText(/Cilindro CIL-006 está em estoque/)).toBeVisible();
    const resultado = await new AxeBuilder({ page }).analyze();
    expect(resultado.violations.filter((item) => item.impact === 'critical' || item.impact === 'serious')).toEqual([]);
    for (const largura of [320, 360, 768, 1920]) {
      await page.setViewportSize({ width: largura, height: 900 });
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), { message: `Rolagem horizontal a ${largura} px.` }).toBe(true);
    }
  });
});
