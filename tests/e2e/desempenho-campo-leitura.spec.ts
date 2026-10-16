import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { tirarFoto, assinar } from './support/mock-camera';
import { installFieldReaders, type FieldReaders } from './support/mock-field-reading';

// Spec 009, RNF-001 e RNF-002: do código reconhecido até o cilindro conferido na tela, até 1 s (p95), e a leitura de posição em até
// 15 s sem travar a tela, em conexão 4G. Roda só com E2E_AO_VIVO=1 (npm run test:desempenho:campo), contra o Supabase local real e as
// funções carregadas, com a rede no perfil "Slow 4G" (150 ms de latência, 1,6 Mbps de descida e 750 kbps de subida). A câmera e o GPS são
// simulados: o que se mede é a rede, o servidor (`resolve` e `check_item`) e a renderização. A latência da câmera real fica para o aparelho.
const SEMENTE = join(import.meta.dirname, '..', 'support', 'tmp', 'campo-medicao.json');
const LIMITE_CONFERENCIA_MS = 1000;
const LIMITE_POSICAO_MS = 15_000;

const percentil = (valores: number[], p: number): number => {
  const ordenados = [...valores].sort((a, b) => a - b);
  return ordenados[Math.min(ordenados.length - 1, Math.ceil((p / 100) * ordenados.length) - 1)] ?? 0;
};

test.describe('Leitura de campo em 4G', () => {
  test.describe.configure({ mode: 'serial' });
  let context: BrowserContext;
  let page: Page;
  let readers: FieldReaders;
  let semente: { tripId: string; identifiers: string[]; serials: string[] };

  test.beforeAll(async ({ browser }) => {
    execSync('npx vitest run --config vitest.live.config.ts tests/integration/medicao-campo-semear.live.test.ts', {
      stdio: 'pipe', timeout: 600_000, env: { ...process.env, E2E_SEMEAR_CAMPO: '1' },
    });
    semente = JSON.parse(readFileSync(SEMENTE, 'utf8'));
    context = await browser.newContext({ baseURL: test.info().project.use.baseURL, serviceWorkers: 'block' });
    await context.grantPermissions(['geolocation']);
    await context.setGeolocation({ latitude: -23.55, longitude: -46.633, accuracy: 15 });
    page = await context.newPage();
    readers = await installFieldReaders(page, { camera: true });
    await page.goto('/visao-geral');
    await page.getByLabel('E-mail').fill('reg-g-admin@example.invalid');
    await page.getByLabel('Senha', { exact: true }).fill('Local-only-020!');
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    await expect(page.getByRole('heading', { level: 2, name: 'Visão geral' })).toBeVisible({ timeout: 30_000 });
  });

  test.afterAll(async () => {
    try {
      await page.getByRole('button', { name: 'Minha conta' }).click();
      await page.getByRole('button', { name: 'Sair' }).click();
      await expect(page.getByLabel('E-mail')).toBeVisible({ timeout: 10_000 });
    } catch { /* a medição já terminou; o encerramento é só limpeza */ }
    await context?.close();
  });

  async function limitar(): Promise<void> {
    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 });
  }

  test(`conferência: p95 ≤ ${LIMITE_CONFERENCIA_MS} ms do código reconhecido ao cilindro conferido (10 leituras)`, async () => {
    await page.goto(`/viagens/${semente.tripId}`);
    await expect(page.getByRole('heading', { name: 'Conferência da carga' })).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Ler cilindro' }).click();
    const leitor = page.getByRole('dialog', { name: 'Ler cilindro' });
    await expect(leitor).toBeVisible();
    await limitar();
    const tempos: number[] = [];
    for (let n = 0; n < semente.identifiers.length; n += 1) {
      const inicio = await page.evaluate(() => performance.now());
      await readers.scan(semente.identifiers[n]!);
      await expect(leitor.getByText(`Cilindro ${semente.serials[n]} conferido.`)).toBeVisible({ timeout: 15_000 });
      const fim = await page.evaluate(() => performance.now());
      tempos.push(fim - inicio);
    }
    const p95 = percentil(tempos, 95);
    console.log(`[4g] tempos de cada leitura (ms): ${tempos.map((valor) => valor.toFixed(0)).join(', ')}`);
    console.log(`[4g] leitura até conferido: mediana ${percentil(tempos, 50).toFixed(0)} ms, p95 ${p95.toFixed(0)} ms, máx ${Math.max(...tempos).toFixed(0)} ms (10 leituras, Slow 4G)`);
    expect(p95).toBeLessThanOrEqual(LIMITE_CONFERENCIA_MS);
  });

  test(`posição: leitura em até ${LIMITE_POSICAO_MS / 1000} s e a tela continua respondendo`, async () => {
    await page.goto(`/viagens/${semente.tripId}`);
    await expect(page.getByRole('heading', { name: 'Conferência da carga' })).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Iniciar viagem' }).click();
    await page.getByRole('button', { name: /Chegada com a posição da parada 1/ }).click();
    const inicio = await page.evaluate(() => performance.now());
    await page.getByRole('button', { name: 'Usar minha posição' }).click();
    await expect(page.getByText('Origem: GPS')).toBeVisible({ timeout: LIMITE_POSICAO_MS });
    const fim = await page.evaluate(() => performance.now());
    console.log(`[4g] leitura de posição até a tela: ${(fim - inicio).toFixed(0)} ms (GPS simulado)`);
    expect(fim - inicio).toBeLessThanOrEqual(LIMITE_POSICAO_MS);
  });
});

// ----- Fila offline em 4G (Spec 010, RNF-001 a RNF-004) -----
// Registrar na fila sem rede em até 1 s (p95), enviar uma viagem de 10 cilindros e 3 paradas em até 30 s, enviar uma entrega com 3 fotos e assinatura em até 60 s (com o
// registro antes dos anexos) e uma fila no limite (200 operações pendentes e 50 MB de anexos) que lista e avisa sem degradar. Mesma rede "Slow 4G". A câmera e o desenho são
// simulados; o que se mede é a fila, a rede e o servidor.
const SEMENTE_FILA = join(import.meta.dirname, '..', 'support', 'tmp', 'campo-fila-medicao.json');
const LIMITE_REGISTRO_MS = 1000;
const LIMITE_ENVIO_VIAGEM_MS = 30_000;
const LIMITE_ENVIO_ENTREGA_MS = 60_000;
const LIMITE_LISTA_CHEIA_MS = 5000;

test.describe('Fila offline em 4G', () => {
  test.describe.configure({ mode: 'serial' });
  let context: BrowserContext;
  let page: Page;
  let cdp: Awaited<ReturnType<BrowserContext['newCDPSession']>>;
  let semente: { carregamento: { tripId: string; serials: string[] }; andamento: { tripId: string }; entrega: { tripId: string } };

  const contar = (loja: 'local_outbox' | 'local_attachments' | 'local_trips'): Promise<number> => page.evaluate(async (nome) => {
    const aberto = await new Promise<IDBDatabase>((resolve, reject) => { const p = indexedDB.open('fluxid-local'); p.onsuccess = () => resolve(p.result); p.onerror = () => reject(p.error); });
    const total = await new Promise<number>((resolve, reject) => { const p = aberto.transaction(nome).objectStore(nome).count(); p.onsuccess = () => resolve(p.result); p.onerror = () => reject(p.error); });
    aberto.close();
    return total;
  }, loja);
  // Sem rede: `setOffline` do contexto (o aplicativo vê `offline` e a fila assume). Com rede: o perfil "Slow 4G".
  const rede = async (offline: boolean): Promise<void> => {
    await context.setOffline(offline);
    if (!offline) await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 });
  };
  // A tela Sincronização carrega sob demanda: precisa já estar na memória quando a rede cair (no aplicativo instalado vem do cache).
  async function precarregar(): Promise<void> {
    await page.evaluate(() => { window.history.pushState(null, '', '/sincronizacao'); window.dispatchEvent(new PopStateEvent('popstate')); });
    await expect(page.getByRole('heading', { level: 2, name: 'Sincronização' })).toBeVisible({ timeout: 30_000 });
    await page.goBack();
  }
  async function abrir(tripId: string, esperar: string): Promise<void> {
    await page.goto(`/viagens/${tripId}`);
    await expect(page.getByRole('button', { name: new RegExp(esperar) }).first()).toBeVisible({ timeout: 30_000 });
    await expect.poll(() => contar('local_trips'), { timeout: 30_000 }).toBeGreaterThan(0);
    await precarregar();
    // A volta da tela Sincronização remonta a viagem: espera a tela pronta antes de a rede cair.
    await expect(page.getByRole('button', { name: new RegExp(esperar) }).first()).toBeVisible({ timeout: 30_000 });
  }

  test.beforeAll(async ({ browser }) => {
    execSync('npx vitest run --config vitest.live.config.ts tests/integration/medicao-campo-fila-semear.live.test.ts', {
      stdio: 'pipe', timeout: 900_000, env: { ...process.env, E2E_SEMEAR_FILA: '1' },
    });
    semente = JSON.parse(readFileSync(SEMENTE_FILA, 'utf8'));
    context = await browser.newContext({ baseURL: test.info().project.use.baseURL, serviceWorkers: 'block' });
    page = await context.newPage();
    cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable');
    await page.goto('/visao-geral');
    await page.getByLabel('E-mail').fill('reg-g-admin@example.invalid');
    await page.getByLabel('Senha', { exact: true }).fill('Local-only-020!');
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    await expect(page.getByRole('heading', { level: 2, name: 'Visão geral' })).toBeVisible({ timeout: 30_000 });
  });

  test.afterAll(async () => {
    await context?.close();
  });

  test(`registrar na fila sem rede: p95 ≤ ${LIMITE_REGISTRO_MS} ms (10 conferências)`, async () => {
    await abrir(semente.carregamento.tripId, 'Conferir');
    await rede(true);
    const tempos: number[] = [];
    for (const serie of semente.carregamento.serials) {
      const antes = await page.getByText('Conferido, pendente de envio').count();
      const inicio = await page.evaluate(() => performance.now());
      await page.getByRole('button', { name: `Conferir ${serie}`, exact: true }).click();
      await expect.poll(() => page.getByText('Conferido, pendente de envio').count(), { timeout: 10_000 }).toBeGreaterThan(antes);
      tempos.push((await page.evaluate(() => performance.now())) - inicio);
    }
    const p95 = percentil(tempos, 95);
    console.log(`[4g] registrar na fila sem rede: mediana ${percentil(tempos, 50).toFixed(0)} ms, p95 ${p95.toFixed(0)} ms, máx ${Math.max(...tempos).toFixed(0)} ms (10 conferências)`);
    expect(p95).toBeLessThanOrEqual(LIMITE_REGISTRO_MS);
    expect(await contar('local_outbox')).toBe(10);
  });

  test(`enviar a viagem (10 conferências, 3 chegadas e 3 entregas) em até ${LIMITE_ENVIO_VIAGEM_MS / 1000} s`, async () => {
    // Primeiro, as 10 conferências do teste anterior seguem ao voltar a conexão.
    await rede(false);
    const inicioConferencias = Date.now();
    await expect.poll(() => contar('local_outbox'), { timeout: LIMITE_ENVIO_VIAGEM_MS + 15_000, intervals: [250] }).toBe(0);
    const conferencias = Date.now() - inicioConferencias;
    // Depois, a viagem em andamento: 3 chegadas e 3 entregas na fila, enviadas ao voltar a conexão.
    await abrir(semente.andamento.tripId, 'Registrar chegada à parada 1');
    await rede(true);
    for (const parada of [1, 2, 3]) {
      await page.getByRole('button', { name: new RegExp(`Registrar chegada à parada ${parada}`) }).first().click();
      await expect(page.getByRole('button', { name: `Registrar entrega da parada ${parada}` })).toBeVisible();
      await page.getByRole('button', { name: `Registrar entrega da parada ${parada}` }).click();
      const dialogo = page.getByRole('dialog', { name: `Registrar entrega · Parada ${parada}` });
      await dialogo.getByLabel('Nome de quem recebeu').fill('Recebedor Fictício');
      await dialogo.getByRole('button', { name: 'Registrar entrega' }).click();
      await expect(dialogo).toHaveCount(0);
    }
    await expect.poll(() => contar('local_outbox'), { timeout: 10_000 }).toBe(6);
    await rede(false);
    const inicioViagem = Date.now();
    await expect.poll(() => contar('local_outbox'), { timeout: LIMITE_ENVIO_VIAGEM_MS + 15_000, intervals: [250] }).toBe(0);
    const viagem = Date.now() - inicioViagem;
    console.log(`[4g] envio: 10 conferências em ${conferencias} ms, 3 chegadas e 3 entregas em ${viagem} ms (soma ${conferencias + viagem} ms para 16 operações)`);
    expect(conferencias + viagem).toBeLessThanOrEqual(LIMITE_ENVIO_VIAGEM_MS);
  });

  test(`enviar a entrega com 3 fotos e assinatura em até ${LIMITE_ENVIO_ENTREGA_MS / 1000} s, com o registro antes dos anexos`, async () => {
    await abrir(semente.entrega.tripId, 'Registrar chegada à parada 1');
    await rede(true);
    await page.getByRole('button', { name: /Registrar chegada à parada 1/ }).first().click();
    await page.getByRole('button', { name: 'Registrar entrega da parada 1' }).click();
    const dialogo = page.getByRole('dialog', { name: 'Registrar entrega · Parada 1' });
    await dialogo.getByLabel('Nome de quem recebeu').fill('Recebedor Fictício');
    for (const [indice, cor] of ['tomato', 'seagreen', 'goldenrod'].entries()) {
      await tirarFoto(dialogo, cor);
      await expect(dialogo.getByText(`${indice + 1} de 3`)).toBeVisible();
    }
    await assinar(page, dialogo.getByLabel('Área de assinatura. Opcional; a entrega pode ser concluída sem assinatura.'));
    await expect(dialogo.getByRole('button', { name: 'Limpar assinatura' })).toBeEnabled();
    await dialogo.getByRole('button', { name: 'Registrar entrega' }).click();
    await expect(dialogo).toHaveCount(0);
    expect(await contar('local_attachments')).toBe(4);

    await rede(false);
    const inicio = Date.now();
    let registroEm: number | null = null;
    let anexosEm: number | null = null;
    while (Date.now() - inicio < LIMITE_ENVIO_ENTREGA_MS + 15_000 && anexosEm === null) {
      if (registroEm === null && (await contar('local_outbox')) === 0) registroEm = Date.now() - inicio;
      if (registroEm !== null && (await contar('local_attachments')) === 0) anexosEm = Date.now() - inicio;
      await page.waitForTimeout(200);
    }
    console.log(`[4g] envio da entrega com 3 fotos e assinatura: registro em ${registroEm} ms, anexos em ${anexosEm} ms`);
    expect(registroEm).not.toBeNull();
    expect(anexosEm).not.toBeNull();
    expect(registroEm!).toBeLessThanOrEqual(anexosEm!);
    expect(anexosEm!).toBeLessThanOrEqual(LIMITE_ENVIO_ENTREGA_MS);
  });

  test(`fila no limite (200 operações e 50 MB de anexos): a lista abre em até ${LIMITE_LISTA_CHEIA_MS / 1000} s e avisa`, async () => {
    await abrir(semente.carregamento.tripId, 'Conferir');
    await rede(true);
    await page.evaluate(async () => {
      const aberto = await new Promise<IDBDatabase>((resolve, reject) => { const p = indexedDB.open('fluxid-local'); p.onsuccess = () => resolve(p.result); p.onerror = () => reject(p.error); });
      const base = { organization_id: '20000000-0000-0000-0000-000000000020', device_id: 'aparelho', version: 1, dependencies: [], server_timestamp: null, attempt_count: 0, failure_reason: null };
      const agora = new Date().toISOString();
      const dono = await new Promise<{ actor_id: string; endpoint_id: string } | null>((resolve) => {
        const p = aberto.transaction('local_trips').objectStore('local_trips').getAll();
        p.onsuccess = () => resolve((p.result[0] as { actor_id: string; endpoint_id: string } | undefined) ?? null);
      });
      await new Promise<void>((resolve, reject) => {
        const transacao = aberto.transaction(['local_outbox', 'local_attachments'], 'readwrite');
        for (let n = 0; n < 200; n += 1) {
          transacao.objectStore('local_outbox').put({
            ...base, actor_id: dono!.actor_id, endpoint_id: dono!.endpoint_id, id: `carga-${n}`, idempotency_key: `carga-${n}`, operation: 'trip.check_item', payload: { trip_id: 'T', item_id: `i${n}` },
            local_timestamp: agora, trip_id: 'viagem-carga', queued_at: agora, status: 'failed', created_at: agora, updated_at: agora,
          });
        }
        // 34 fotos de 1,5 MB: 51 MB.
        for (let n = 0; n < 34; n += 1) {
          const bytes = new Uint8Array(1_572_864);
          bytes[0] = 0xff;
          transacao.objectStore('local_attachments').put({
            ...base, actor_id: dono!.actor_id, endpoint_id: dono!.endpoint_id, id: `anexo-${n}`, trip_id: 'viagem-carga', outbox_item_id: null, delivery_id: null, kind: 'photo', position: 1, bytes: bytes.buffer,
            sha256: 'a'.repeat(64), size_bytes: 1_572_864, content_type: 'image/jpeg', captured_at: agora, added_later: false, status: 'pending', created_at: agora,
          });
        }
        transacao.oncomplete = () => resolve();
        transacao.onerror = () => reject(transacao.error);
      });
      aberto.close();
    });
    const inicio = await page.evaluate(() => performance.now());
    await page.evaluate(() => { window.history.pushState(null, '', '/sincronizacao'); window.dispatchEvent(new PopStateEvent('popstate')); });
    await expect(page.getByText('Fila cheia')).toBeVisible({ timeout: LIMITE_LISTA_CHEIA_MS });
    await expect(page.getByRole('list', { name: 'Registros da viagem' }).getByRole('listitem')).toHaveCount(200, { timeout: LIMITE_LISTA_CHEIA_MS });
    const duracao = (await page.evaluate(() => performance.now())) - inicio;
    console.log(`[4g] tela Sincronização com 200 operações e 51 MB de anexos: ${duracao.toFixed(0)} ms`);
    await expect(page.getByText('Sem espaço para novas fotos').first()).toBeVisible();
    expect(duracao).toBeLessThanOrEqual(LIMITE_LISTA_CHEIA_MS);
  });
});
