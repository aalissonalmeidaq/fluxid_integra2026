import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { tirarFoto } from './support/mock-camera';
import { cortarRede, religarRede } from './support/mock-offline';
import { entrar, planejar, semRolagemHorizontal } from './support/trips-scenario';

test.use({ serviceWorkers: 'block' });

// Spec 010, US5 (RF-029, CA-007, MS-006): acessibilidade da fila (WCAG 2.2 AA). Axe sem violação grave ou crítica e sem rolagem horizontal na tela Sincronização, no
// painel do conflito, no bloco de fotos, na assinatura e no indicador, em 360, 768 e 1920 px, com zoom de 200% e em paisagem; operação por teclado onde há
// alternativa (a assinatura tem: não assinar); mudanças anunciadas em regiões de status; movimento reduzido. As larguras são aplicadas dentro do teste.
const LARGURAS = [360, 768, 1920] as const;

async function semViolacoes(page: Page, contexto: string): Promise<void> {
  const resultado = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag22aa']).analyze();
  const bloqueantes = resultado.violations.filter((violacao) => violacao.impact === 'critical' || violacao.impact === 'serious');
  const evidencia = bloqueantes.map((violacao) => `${violacao.impact}: ${violacao.id} em ${violacao.nodes.map((no) => no.target.join(', ')).join('; ')}`).join('\n');
  expect(bloqueantes, `${contexto}\n${evidencia}`).toEqual([]);
}
async function verificar(page: Page, contexto: string): Promise<void> {
  await semViolacoes(page, contexto);
  expect(await semRolagemHorizontal(page), `${contexto}: rolagem horizontal`).toBe(true);
}

// A tela Sincronização é carregada sob demanda; com o service worker bloqueado aqui, ela precisa já estar carregada quando a rede cair (no aplicativo instalado vem do cache).
async function precarregarSincronizacao(page: Page): Promise<void> {
  await page.evaluate(() => { window.history.pushState(null, '', '/sincronizacao'); window.dispatchEvent(new PopStateEvent('popstate')); });
  await expect(page.getByRole('heading', { level: 2, name: 'Sincronização' })).toBeVisible();
  await page.goBack();
}

// Guarda a viagem no aparelho e deixa a tela Sincronização já carregada (o service worker está bloqueado aqui).
async function montar(page: Page) {
  const backend = await entrar(page);
  const carregando = planejar(backend, [['CIL-006', 'CIL-007']]);
  carregando.chamar('start_loading', { expected_version: 1 });
  const andamento = planejar(backend, [['CIL-008']], { placa: 'GHI1J23', motorista: 'Bruno Condutor', unidades: [1], iniciar: true });
  await page.goto(`/viagens/${carregando.id}`);
  await expect(page.getByRole('button', { name: 'Conferir CIL-006' })).toBeEnabled();
  await expect.poll(async () => page.evaluate(async () => {
    const aberto = await new Promise<IDBDatabase>((resolve, reject) => { const p = indexedDB.open('fluxid-local'); p.onsuccess = () => resolve(p.result); p.onerror = () => reject(p.error); });
    const total = await new Promise<number>((resolve, reject) => { const p = aberto.transaction('local_trips').objectStore('local_trips').count(); p.onsuccess = () => resolve(p.result); p.onerror = () => reject(p.error); });
    aberto.close();
    return total;
  })).toBeGreaterThan(0);
  await precarregarSincronizacao(page);
  return { backend, carregando, andamento };
}

test.describe('Acessibilidade da fila offline', () => {
  test.beforeEach(({ browserName }, testInfo) => {
    test.skip(browserName !== 'chromium' || testInfo.project.name.startsWith('mobile'), 'As larguras são aplicadas dentro do teste; uma execução basta.');
    test.setTimeout(180_000);
  });

  test('indicador e tela Sincronização (vazia e com pendências) não têm violação grave nem rolagem horizontal em 360, 768 e 1920 px', async ({ page, context }) => {
    const { carregando } = await montar(page);
    for (const largura of LARGURAS) {
      await page.setViewportSize({ width: largura, height: 900 });
      await page.goto('/sincronizacao');
      await expect(page.getByText('Nada pendente. Tudo foi enviado.')).toBeVisible();
      await verificar(page, `Sincronização vazia em ${largura}px`);
    }
    await page.goto(`/viagens/${carregando.id}`);
    await expect(page.getByRole('button', { name: 'Conferir CIL-006' })).toBeEnabled();
    await precarregarSincronizacao(page);
    await cortarRede(context, page);
    await page.getByRole('button', { name: 'Conferir CIL-006' }).click();
    await page.getByRole('button', { name: 'Conferir CIL-007' }).click();
    for (const largura of LARGURAS) {
      await page.setViewportSize({ width: largura, height: 900 });
      const indicador = page.getByRole('button', { name: 'Abrir sincronização: Sem conexão, 2 pendentes' });
      await expect(indicador).toBeVisible();
      await verificar(page, `indicador com pendências em ${largura}px`);
      await indicador.click();
      await expect(page.getByRole('list', { name: 'Registros da viagem' })).toBeVisible();
      await verificar(page, `Sincronização com pendências em ${largura}px`);
      await page.goBack();
    }
  });

  test('o painel do conflito não tem violação grave, prende o foco e o Escape o devolve', async ({ page, context }) => {
    const { carregando } = await montar(page);
    await page.goto(`/viagens/${carregando.id}`);
    await expect(page.getByRole('button', { name: 'Conferir CIL-006' })).toBeEnabled();
    await cortarRede(context, page);
    await page.getByRole('button', { name: 'Conferir CIL-006' }).click();
    carregando.chamar('cancel_trip', { expected_version: 2, justification: 'Cancelada pelo despacho' });
    await religarRede(context, page);
    // Espera a fila sincronizar e acusar o conflito antes de navegar: com a máquina carregada (CI), sair da página logo depois de
    // religar a rede interrompia o envio, e o conflito não chegava à tela de Sincronização no prazo.
    await expect(page.getByRole('button', { name: /^Abrir sincronização: .*conflito/ })).toBeVisible({ timeout: 30_000 });
    for (const largura of LARGURAS) {
      // O shell troca de layout com a largura e remonta o conteúdo, então cada janela é aberta DEPOIS de ajustar a largura.
      await page.setViewportSize({ width: largura, height: 900 });
      await page.goto('/sincronizacao');
      const abrir = page.getByRole('button', { name: /Ver conflito/ });
      // O conflito só aparece depois que a fila sincroniza ao religar a rede; com a máquina carregada (CI) isso passa dos 5 s padrão.
      await expect(abrir).toBeVisible({ timeout: 20_000 });
      await abrir.focus();
      await page.keyboard.press('Enter');
      const painel = page.getByRole('dialog', { name: 'Conflito na sincronização' });
      await expect(painel).toBeVisible();
      await verificar(page, `painel do conflito em ${largura}px`);
      await page.keyboard.press('Escape');
      await expect(painel).toHaveCount(0);
      await expect(abrir).toBeFocused();
    }
  });

  test('o bloco de fotos e a assinatura não têm violação grave; só com teclado, a entrega se conclui sem assinar', async ({ page }) => {
    const { andamento } = await montar(page);
    for (const largura of LARGURAS) {
      await page.setViewportSize({ width: largura, height: 900 });
      await page.goto(`/viagens/${andamento.id}`);
      await page.getByRole('button', { name: /Registrar chegada à parada 1/ }).click().catch(() => undefined);
      await page.getByRole('button', { name: 'Registrar entrega da parada 1' }).click();
      const dialogo = page.getByRole('dialog', { name: 'Registrar entrega · Parada 1' });
      await expect(dialogo.getByRole('group', { name: 'Fotos da entrega (opcional)' })).toBeVisible();
      await tirarFoto(dialogo, 'tomato');
      await expect(dialogo.getByText('1 de 3')).toBeVisible();
      await verificar(page, `fotos e assinatura em ${largura}px`);
      // A assinatura é opcional e a alternativa de teclado é não assinar: a entrega se conclui só com teclado.
      await dialogo.getByLabel('Nome de quem recebeu').fill('Recebedor Fictício');
      await dialogo.getByRole('button', { name: 'Registrar entrega' }).focus();
      await page.keyboard.press('Enter');
      await expect(dialogo).toHaveCount(0);
      break;
    }
  });

  test('zoom de 200% (320 px) e paisagem (740 por 360 px) sem rolagem horizontal e sem violação grave', async ({ page }) => {
    const { carregando } = await montar(page);
    for (const [largura, altura] of [[320, 700], [740, 360]] as const) {
      await page.setViewportSize({ width: largura, height: altura });
      await page.goto('/sincronizacao');
      await expect(page.getByRole('heading', { level: 2, name: 'Sincronização' })).toBeVisible();
      await verificar(page, `Sincronização em ${largura}x${altura}`);
      await page.goto(`/viagens/${carregando.id}`);
      await expect(page.getByRole('button', { name: 'Conferir CIL-006' })).toBeVisible();
      await verificar(page, `conferência com a fila em ${largura}x${altura}`);
    }
  });

  test('as mudanças da fila são anunciadas em regiões de status e o movimento reduzido não anima nada', async ({ page, context }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const { carregando } = await montar(page);
    await page.goto(`/viagens/${carregando.id}`);
    await expect(page.getByRole('button', { name: 'Conferir CIL-006' })).toBeEnabled();
    await cortarRede(context, page);
    await page.getByRole('button', { name: 'Conferir CIL-006' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Cilindro CIL-006 registrado neste aparelho. Pendente de envio.' })).toHaveCount(1);
    await expect(page.getByRole('status').filter({ hasText: 'Sem conexão, 1 pendente' })).toHaveCount(1);
    expect(await page.evaluate(() => document.getAnimations().filter((animacao) => animacao.playState === 'running').length)).toBe(0);
  });
});
