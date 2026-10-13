import { test, expect, type Page } from '@playwright/test';
import { cortarRede, lerFila, religarRede } from './support/mock-offline';
import { tirarFoto } from './support/mock-camera';
import { entrar, planejar } from './support/trips-scenario';

test.use({ serviceWorkers: 'block' });

// O driver WebKit do Playwright não entrega ao simulado o conteúdo binário de um arquivo enviado em multipart (só os campos), então os testes que dependem de o
// servidor simulado receber a foto rodam no Chromium. A captura, o limite, o refazer e o remover rodam nos dois.
const SEM_ARQUIVO_NO_WEBKIT = 'O driver WebKit do Playwright não entrega o arquivo de um envio multipart ao servidor simulado.';

// Spec 010, US3 (RF-018 a RF-023, CA-003, MS-004): até 3 fotos por entrega, reduzidas e sem metadados, enviadas depois do registro, visíveis a quem pode ver; foto
// acrescentada depois dentro do prazo. A câmera é simulada com imagens de verdade; as regras de banco estão no pgTAP.
const LARGURAS = [360, 768, 1920] as const;

async function abrirEntrega(page: Page, id: string) {
  await page.goto(`/viagens/${id}`);
  await page.getByRole('button', { name: /Registrar chegada à parada 1/ }).click();
  await expect(page.getByText(/Situação da parada: No local/)).toBeVisible();
  await page.getByRole('button', { name: 'Registrar entrega da parada 1' }).click();
  const dialogo = page.getByRole('dialog', { name: 'Registrar entrega · Parada 1' });
  await dialogo.getByLabel('Nome de quem recebeu').fill('Recebedor Fictício');
  return dialogo;
}

for (const largura of LARGURAS) {
  test.describe(`largura ${largura} px`, () => {
    test.use({ viewport: { width: largura, height: 900 } });

    test('tira 3 fotos, recusa a quarta, refaz e remove antes de salvar', async ({ page }) => {
      const backend = await entrar(page);
      const andamento = planejar(backend, [['CIL-006']], { iniciar: true });
      const dialogo = await abrirEntrega(page, andamento.id);

      await expect(dialogo.getByRole('group', { name: 'Fotos da entrega (opcional)' })).toBeVisible();
      await expect(dialogo.getByText('0 de 3')).toBeVisible();
      for (const [indice, cor] of ['tomato', 'seagreen', 'goldenrod'].entries()) {
        await tirarFoto(dialogo, cor);
        await expect(dialogo.getByText(`${indice + 1} de 3`)).toBeVisible();
      }
      await expect(dialogo.getByRole('button', { name: 'Tirar foto' })).toBeDisabled();
      await expect(dialogo.getByText('Limite de 3 fotos por entrega.')).toBeVisible();
      await expect(dialogo.getByAltText('Foto 3 da entrega')).toBeVisible();

      await dialogo.getByRole('button', { name: 'Remover a foto 2' }).click();
      await expect(dialogo.getByText('2 de 3')).toBeVisible();
      await dialogo.getByRole('button', { name: 'Refazer a foto 1' }).click();
      await tirarFoto(dialogo, 'orchid');
      await expect(dialogo.getByText('2 de 3')).toBeVisible();
      await expect(dialogo.getByRole('button', { name: 'Tirar foto' })).toBeEnabled();
      // Nada subiu antes de salvar.
      expect(backend.trips.attachments).toHaveLength(0);
    });
  });
}

test.describe('envio das fotos', () => {
  test('com conexão: o registro chega e as fotos seguem em seguida, visíveis no detalhe com texto e miniatura', async ({ page, browserName }) => {
    test.skip(browserName === 'webkit', SEM_ARQUIVO_NO_WEBKIT);
    const backend = await entrar(page);
    const andamento = planejar(backend, [['CIL-006']], { iniciar: true });
    const dialogo = await abrirEntrega(page, andamento.id);
    await tirarFoto(dialogo, 'tomato');
    await expect(dialogo.getByText('1 de 3')).toBeVisible();
    await tirarFoto(dialogo, 'seagreen');
    await expect(dialogo.getByText('2 de 3')).toBeVisible();
    await dialogo.getByRole('button', { name: 'Registrar entrega' }).click();
    await expect(dialogo).toHaveCount(0);

    await expect.poll(() => backend.trips.attachments.length).toBe(2);
    // O registro vem antes das fotos.
    const pedidos = backend.trips.receivedRequestIds;
    const entrega = pedidos.findIndex((id) => !id.startsWith('anexo:') && backend.trips.deliveries.length > 0 && id === pedidos.filter((outro) => !outro.startsWith('anexo:')).at(-1));
    expect(entrega).toBeGreaterThanOrEqual(0);
    expect(pedidos.findIndex((id) => id.startsWith('anexo:'))).toBeGreaterThan(entrega);
    expect(backend.trips.attachments.every((anexo) => anexo.bytes[0] === 0xff && anexo.bytes[1] === 0xd8)).toBe(true);
    // Sem metadados de localização: nenhum segmento EXIF.
    expect(backend.trips.attachments.every((anexo) => !anexo.bytes.includes(Buffer.from('Exif')))).toBe(true);

    await page.reload();
    await expect(page.getByText('2 fotos')).toBeVisible();
    await expect(page.getByAltText('Foto 1 da entrega')).toBeVisible();
    // O aparelho já não guarda as fotos: foram confirmadas.
    expect(await page.evaluate(async () => {
      const aberto = await new Promise<IDBDatabase>((resolve, reject) => { const p = indexedDB.open('fluxid-local'); p.onsuccess = () => resolve(p.result); p.onerror = () => reject(p.error); });
      const total = await new Promise<number>((resolve, reject) => { const p = aberto.transaction('local_attachments').objectStore('local_attachments').count(); p.onsuccess = () => resolve(p.result); p.onerror = () => reject(p.error); });
      aberto.close();
      return total;
    })).toBe(0);
  });

  test('sem conexão: registra a entrega com 3 fotos no aparelho, e ao voltar a conexão o registro chega antes das fotos, sem duplicar', async ({ page, context, browserName }) => {
    test.skip(browserName === 'webkit', SEM_ARQUIVO_NO_WEBKIT);
    const backend = await entrar(page);
    const andamento = planejar(backend, [['CIL-006']], { iniciar: true });
    await page.goto(`/viagens/${andamento.id}`);
    await expect(page.getByRole('button', { name: /Registrar chegada à parada 1/ })).toBeEnabled();
    await expect.poll(async () => page.evaluate(async () => (await indexedDB.databases()).some((banco) => banco.name === 'fluxid-local'))).toBe(true);
    await page.waitForTimeout(600);
    await cortarRede(context, page);
    await page.getByRole('button', { name: /Registrar chegada à parada 1/ }).click();
    await expect(page.getByText('Situação da parada: No local, pendente de envio')).toBeVisible();
    await page.getByRole('button', { name: 'Registrar entrega da parada 1' }).click();
    const dialogo = page.getByRole('dialog', { name: 'Registrar entrega · Parada 1' });
    await dialogo.getByLabel('Nome de quem recebeu').fill('Recebedor Fictício');
    for (const [indice, cor] of ['tomato', 'seagreen', 'goldenrod'].entries()) {
      await tirarFoto(dialogo, cor);
      await expect(dialogo.getByText(`${indice + 1} de 3`)).toBeVisible();
    }
    await dialogo.getByRole('button', { name: 'Registrar entrega' }).click();
    await expect(dialogo).toHaveCount(0);
    await expect(page.getByRole('status').filter({ hasText: 'As fotos serão enviadas em seguida.' })).toHaveCount(1);
    expect(backend.trips.attachments).toHaveLength(0);
    expect((await lerFila(page)).map((item) => item.operation).sort()).toEqual(['trip.arrive_stop', 'trip.deliver']);

    await religarRede(context, page);
    await expect.poll(() => backend.trips.attachments.length).toBe(3);
    // O registro da entrega chegou antes de qualquer foto.
    const pedidos = backend.trips.receivedRequestIds;
    const primeiraFoto = pedidos.findIndex((id) => id.startsWith('anexo:'));
    expect(backend.trips.deliveries).toHaveLength(1);
    expect(primeiraFoto).toBeGreaterThan(0);
    expect(pedidos.slice(0, primeiraFoto).filter((id) => !id.startsWith('anexo:')).length).toBeGreaterThanOrEqual(2);
    // Um anexo por foto, nenhum repetido.
    expect(new Set(backend.trips.attachments.map((anexo) => anexo.id)).size).toBe(3);
    expect(backend.trips.events.filter((evento) => evento.event_type === 'delivery_registered')).toHaveLength(1);
  });
});

test.describe('acrescentar foto depois', () => {
  test('dentro do prazo aparece o botão e a foto chega marcada como acrescentada depois; fora do prazo o botão some', async ({ page, browserName }) => {
    test.skip(browserName === 'webkit', SEM_ARQUIVO_NO_WEBKIT);
    const backend = await entrar(page);
    const andamento = planejar(backend, [['CIL-006']], { iniciar: true });
    const dialogo = await abrirEntrega(page, andamento.id);
    await dialogo.getByRole('button', { name: 'Registrar entrega' }).click();
    await expect(dialogo).toHaveCount(0);
    await expect(page.getByText('Entrega registrada').first()).toBeVisible();

    await page.getByRole('button', { name: /Acrescentar foto ou assinatura/ }).click();
    const depois = page.getByRole('dialog', { name: /Acrescentar à entrega da parada 1/ });
    await tirarFoto(depois, 'orchid');
    await depois.getByRole('button', { name: 'Guardar anexos' }).click();
    await expect(depois).toHaveCount(0);
    await expect.poll(() => backend.trips.attachments.length).toBe(1);
    expect(backend.trips.attachments[0]).toMatchObject({ added_later: true, kind: 'photo' });
    await page.reload();
    await expect(page.getByText('1 foto')).toBeVisible();
    await expect(page.getByText('Acrescentado depois')).toBeVisible();

    // Viagem concluída há mais de 7 dias: o botão não aparece.
    andamento.chamar('complete_trip', { expected_version: backend.trips.trips[0]!.version });
    backend.trips.trips[0]!.completed_at = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
    await page.reload();
    await expect(page.getByRole('button', { name: /Acrescentar foto ou assinatura/ })).toHaveCount(0);
  });
});
