import { test, expect, type Page } from '@playwright/test';
import { MockBackend } from './support/mock-backend';

// Cobre a fase de conexão da inicialização e, com sessão autenticada e tenant ativo, a sincronização:
// push antes de pull, outbox idempotente, conflito, retomada e isolamento Tenant A/B (US9).
const SUPABASE = 'http://127.0.0.1:54321';

type Behavior = 'ok' | 'down' | 'incompatible' | 'slow';

async function mockSupabase(page: Page, behavior: Behavior, delayMs = 0) {
  await page.route(`${SUPABASE}/**`, async (route) => {
    if (behavior === 'down') return route.abort('connectionrefused');
    if (behavior === 'slow') await new Promise((resolve) => setTimeout(resolve, delayMs));
    if (route.request().url().endsWith('/functions/v1/public-compatibility')) {
      return route.fulfill({
        json: { contractVersion: behavior === 'incompatible' ? '0.0' : '002.1' },
        headers: { 'access-control-allow-origin': '*' },
      });
    }
    return route.fulfill({ status: 200, json: { status: 'ok' }, headers: { 'access-control-allow-origin': '*' } });
  });
}

// O service worker da PWA responde antes da interceptação de rede do Playwright no WebKit; bloqueá-lo
// mantém o backend simulado como única origem das respostas.
test.use({ serviceWorkers: 'block' });

test.describe('Inicialização da PWA: conexão (US9)', () => {
  test('libera o aplicativo e identifica a conexão após verificação saudável', async ({ page }) => {
    await mockSupabase(page, 'ok');
    await page.goto('/');
    await expect(page.getByRole('main')).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: /conectado/i })).toBeVisible();
  });

  test('exibe a tela de inicialização enquanto verifica a conexão', async ({ page }) => {
    await mockSupabase(page, 'slow', 300);
    await page.goto('/');
    await expect(page.getByRole('status').filter({ hasText: /conectando/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Bem-vindo de volta' })).toBeVisible({ timeout: 10_000 });
  });

  test('mantém o shell com indicador de offline quando nenhum destino responde', async ({ page }) => {
    await mockSupabase(page, 'down');
    await page.goto('/');
    await expect(page.getByRole('main')).toBeVisible();
    await expect(page.getByText(/sem conexão/i).first()).toBeVisible();
  });

  test('bloqueia sem simular conexão quando o contrato do destino é incompatível', async ({ page }) => {
    await mockSupabase(page, 'incompatible');
    await page.goto('/');
    await expect(page.getByRole('alert').filter({ hasText: /bloqueada/i })).toBeVisible();
    await expect(page.getByText(/^Conectado/)).toHaveCount(0);
  });
});
// --- Sincronização com outbox real (IndexedDB do navegador) ---------------------------------------------------------
const TENANT_A = '20000000-0000-0000-0000-00000000000a';
const TENANT_B = '20000000-0000-0000-0000-00000000000b';
const NOW = '2026-09-30T12:00:00.000Z';

const outboxItem = (id: string, organizationId: string, over: Record<string, unknown> = {}) => ({
  id, idempotency_key: `key-${id}`, organization_id: organizationId, actor_id: 'actor-1', device_id: 'device-1',
  operation: 'future-domain.operation', payload: {}, version: 1, dependencies: [], local_timestamp: NOW, server_timestamp: null,
  status: 'pending', attempt_count: 0, failure_reason: null, created_at: NOW, updated_at: NOW, ...over,
});

// Semeia a outbox antes de a aplicação abrir a base local, uma única vez por contexto de navegação.
async function seedOutbox(page: Page, items: unknown[]): Promise<void> {
  await page.addInitScript((seed) => {
    if (localStorage.getItem('e2e-outbox-seeded')) return;
    localStorage.setItem('e2e-outbox-seeded', '1');
    const request = indexedDB.open('fluxid-local', 1);
    request.onupgradeneeded = () => {
      for (const name of ['local_outbox', 'local_sync_cursors', 'local_sync_conflicts']) {
        const store = request.result.createObjectStore(name, { keyPath: 'id' });
        store.createIndex('organization_id', 'organization_id', { unique: false });
      }
    };
    request.onsuccess = () => {
      const transaction = request.result.transaction('local_outbox', 'readwrite');
      for (const item of seed as unknown[]) transaction.objectStore('local_outbox').put(item);
      transaction.oncomplete = () => request.result.close();
    };
  }, items);
}

interface StoredItem { id: string; status: string; attempt_count: number; organization_id: string }
const outboxState = (page: Page): Promise<StoredItem[]> => page.evaluate(() => new Promise<StoredItem[]>((resolve, reject) => {
  const request = indexedDB.open('fluxid-local', 1);
  request.onerror = () => reject(request.error);
  request.onsuccess = () => {
    const read = request.result.transaction('local_outbox', 'readonly').objectStore('local_outbox').getAll();
    read.onerror = () => reject(read.error);
    read.onsuccess = () => {
      request.result.close();
      resolve((read.result as StoredItem[]).map(({ id, status, attempt_count, organization_id }) => ({ id, status, attempt_count, organization_id })).sort((a, b) => a.id.localeCompare(b.id)));
    };
  };
}));

const syncCalls = (backend: MockBackend) => backend.calls
  .filter((call) => call.path === '/functions/v1/sync-command')
  .map((call) => call.body as { organization_id: string; idempotency_key: string });

const tenantMembership = (organizationId: string, name: string) => ({
  id: `30000000-0000-0000-0000-00000000000${organizationId.slice(-1)}`, organization_id: organizationId, status: 'active',
  organizations: { id: organizationId, kind: 'tenant', status: 'active', display_name: name },
});

async function login(page: Page, backend: MockBackend, aal: 'aal1' | 'aal2' = 'aal1'): Promise<void> {
  backend.loginResponses = [backend.authenticated()];
  backend.statusResponse = backend.activeStatus(aal);
  await backend.install(page);
  await page.goto('/');
  await page.getByLabel('E-mail').fill('admin-a@example.invalid');
  await page.getByLabel('Senha', { exact: true }).fill('Local-only-002!');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
}

test.describe('Inicialização da PWA: sincronização com outbox (US9)', () => {
  test('sem pendência libera a área sem chamar o endpoint de sincronização', async ({ page }) => {
    const backend = new MockBackend();
    await login(page, backend);
    await expect(page.getByRole('button', { name: 'Minha conta' })).toBeVisible();
    expect(syncCalls(backend)).toEqual([]);
  });

  test('envia a pendência uma vez, com a chave idempotente, e a confirma antes de liberar a área', async ({ page }) => {
    const backend = new MockBackend();
    await seedOutbox(page, [outboxItem('item-1', TENANT_A)]);
    await login(page, backend);
    await expect(page.getByRole('button', { name: 'Minha conta' })).toBeVisible();
    expect(syncCalls(backend)).toEqual([expect.objectContaining({ organization_id: TENANT_A, idempotency_key: 'key-item-1' })]);
    expect(await outboxState(page)).toEqual([expect.objectContaining({ id: 'item-1', status: 'synced' })]);
  });

  test('isolamento A/B: com o tenant A ativo a pendência do tenant B não é enviada nem alterada', async ({ page }) => {
    const backend = new MockBackend();
    await seedOutbox(page, [outboxItem('item-a', TENANT_A), outboxItem('item-b', TENANT_B)]);
    await login(page, backend);
    await expect(page.getByRole('button', { name: 'Minha conta' })).toBeVisible();
    expect(syncCalls(backend).map((call) => call.organization_id)).toEqual([TENANT_A]);
    expect(await outboxState(page)).toEqual([
      expect.objectContaining({ id: 'item-a', status: 'synced' }),
      expect.objectContaining({ id: 'item-b', status: 'pending', attempt_count: 0 }),
    ]);
  });

  test('perda de conexão bloqueia com recuperação, preserva a pendência e reenvia a mesma chave ao tentar de novo', async ({ page }) => {
    const backend = new MockBackend();
    backend.syncBehavior = 'network';
    await seedOutbox(page, [outboxItem('item-1', TENANT_A)]);
    await login(page, backend);
    await expect(page.getByRole('alert').filter({ hasText: /falha de conexão/i })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Minha conta' })).toHaveCount(0);
    expect(await outboxState(page)).toEqual([expect.objectContaining({ id: 'item-1', status: 'pending', attempt_count: 1 })]);
    expect(syncCalls(backend)).toHaveLength(1);

    backend.syncBehavior = 'ok';
    await page.getByRole('button', { name: /tentar novamente/i }).click();
    await expect(page.getByRole('button', { name: 'Minha conta' })).toBeVisible();
    expect(syncCalls(backend).map((call) => call.idempotency_key)).toEqual(['key-item-1', 'key-item-1']);
    expect(await outboxState(page)).toEqual([expect.objectContaining({ id: 'item-1', status: 'synced' })]);
  });

  test('erro do servidor não entra em laço de repetição e mantém a área bloqueada e recuperável', async ({ page }) => {
    const backend = new MockBackend();
    backend.syncBehavior = 'server';
    await seedOutbox(page, [outboxItem('item-1', TENANT_A)]);
    await login(page, backend);
    await expect(page.getByRole('alert').filter({ hasText: /falha de conexão/i })).toBeVisible();
    expect(syncCalls(backend)).toHaveLength(1);
    expect(await outboxState(page)).toEqual([expect.objectContaining({ status: 'pending', attempt_count: 1 })]);
  });

  test('conflito de versão preserva o item, bloqueia a área e não simula confirmação', async ({ page }) => {
    const backend = new MockBackend();
    backend.syncBehavior = 'conflict';
    await seedOutbox(page, [outboxItem('item-1', TENANT_A)]);
    await login(page, backend);
    await expect(page.getByRole('alert').filter({ hasText: /conflito encontrado/i })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Minha conta' })).toHaveCount(0);
    expect(await outboxState(page)).toEqual([expect.objectContaining({ id: 'item-1', status: 'conflict' })]);
  });

  test('retoma um envio interrompido por fechamento da PWA sem duplicar nem perder o item', async ({ page }) => {
    const backend = new MockBackend();
    await seedOutbox(page, [outboxItem('item-1', TENANT_A, { status: 'syncing', attempt_count: 1 })]);
    await login(page, backend);
    await expect(page.getByRole('button', { name: 'Minha conta' })).toBeVisible();
    expect(syncCalls(backend)).toHaveLength(1);
    expect(await outboxState(page)).toEqual([expect.objectContaining({ id: 'item-1', status: 'synced' })]);
  });

  test('sessão recusada pelo servidor mostra sessão expirada e conduz a uma nova entrada', async ({ page }) => {
    const backend = new MockBackend();
    backend.syncBehavior = 'expired';
    await seedOutbox(page, [outboxItem('item-1', TENANT_A)]);
    await login(page, backend);
    await expect(page.getByRole('alert').filter({ hasText: /sessão expirada/i })).toBeVisible();
    await page.getByRole('button', { name: /tentar novamente/i }).click();
    await expect(page.getByLabel('E-mail')).toBeVisible();
    expect(await outboxState(page)).toEqual([expect.objectContaining({ id: 'item-1', status: 'failed' })]);
  });

  test('a troca de tenant sincroniza o novo contexto sem reenviar nem misturar as pendências', async ({ page }) => {
    const backend = new MockBackend();
    backend.tenantMemberships = [tenantMembership(TENANT_A, 'Tenant A'), tenantMembership(TENANT_B, 'Tenant B')];
    await seedOutbox(page, [outboxItem('item-a', TENANT_A), outboxItem('item-b', TENANT_B)]);
    await login(page, backend, 'aal2');
    await expect(page.getByRole('button', { name: 'Minha conta' })).toBeVisible();
    await page.goto('/admin/membros');
    await page.getByRole('button', { name: 'Entrar em Tenant A' }).click();
    await expect(page.getByRole('rowheader', { name: 'Operador A' })).toBeVisible();
    expect(syncCalls(backend).map((call) => call.organization_id)).toEqual([TENANT_A]);

    await page.getByRole('button', { name: 'Trocar organização' }).click();
    await page.getByRole('button', { name: 'Entrar em Tenant B' }).click();
    await expect(page.getByRole('rowheader', { name: 'Operador B' })).toBeVisible();
    expect(syncCalls(backend).map((call) => call.organization_id)).toEqual([TENANT_A, TENANT_B]);
    expect(await outboxState(page)).toEqual([
      expect.objectContaining({ id: 'item-a', status: 'synced' }),
      expect.objectContaining({ id: 'item-b', status: 'synced' }),
    ]);
  });
});