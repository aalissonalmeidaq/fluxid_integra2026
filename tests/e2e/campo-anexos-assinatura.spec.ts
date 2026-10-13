import { test, expect, type Page } from '@playwright/test';
import { assinar } from './support/mock-camera';
import { cortarRede, lerFila, religarRede } from './support/mock-offline';
import { entrar, planejar } from './support/trips-scenario';

test.use({ serviceWorkers: 'block' });

// O driver WebKit do Playwright não entrega ao simulado o conteúdo binário de um arquivo enviado em multipart (só os campos): os testes que dependem de o servidor
// simulado receber a assinatura rodam no Chromium. O desenho, o limpar e o vazio rodam nos dois.
const SEM_ARQUIVO_NO_WEBKIT = 'O driver WebKit do Playwright não entrega o arquivo de um envio multipart ao servidor simulado.';

// Spec 010, US4 (RF-020, RF-022, RF-023, CA-003, CA-004): assinatura opcional, protegida como o nome do recebedor (`trip.recipient`), enviada depois do registro e
// nunca no histórico nem na auditoria. O traço é feito com o ponteiro, como o dedo ou a caneta.
const LARGURAS = [360, 768, 1920] as const;
const AREA = 'Área de assinatura. Opcional; a entrega pode ser concluída sem assinatura.';

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

    test('assina, limpa e assina de novo; a assinatura em branco não é guardada e a entrega vale sem ela', async ({ page, browserName }) => {
      const backend = await entrar(page);
      const andamento = planejar(backend, [['CIL-006'], ['CIL-007']], { iniciar: true });
      const dialogo = await abrirEntrega(page, andamento.id);
      const area = dialogo.getByLabel(AREA);
      await expect(dialogo.getByRole('group', { name: 'Assinatura de quem recebeu (opcional)' })).toBeVisible();
      await expect(dialogo.getByText(/A entrega vale sem assinatura/)).toBeVisible();
      await area.scrollIntoViewIfNeeded();

      await assinar(page, area);
      await expect(dialogo.getByText('Assinatura registrada.')).toBeAttached();
      await dialogo.getByRole('button', { name: 'Limpar assinatura' }).click();
      await expect(dialogo.getByRole('button', { name: 'Limpar assinatura' })).toBeDisabled();
      await assinar(page, area);
      await expect(dialogo.getByRole('button', { name: 'Limpar assinatura' })).toBeEnabled();
      // Nada sobe antes de salvar.
      expect(backend.trips.attachments).toHaveLength(0);
      await dialogo.getByRole('button', { name: 'Registrar entrega' }).click();
      await expect(dialogo).toHaveCount(0);
      test.skip(browserName === 'webkit', SEM_ARQUIVO_NO_WEBKIT);
      await expect.poll(() => backend.trips.attachments.length).toBe(1);
      expect(backend.trips.attachments[0]).toMatchObject({ kind: 'signature', position: 0, content_type: 'image/png' });
      expect(backend.trips.attachments[0]!.bytes.subarray(0, 4)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    });
  });
}

test.describe('entrega sem assinatura e assinatura em branco', () => {
  test('um toque sem querer não vira assinatura, e a entrega é registrada do mesmo jeito', async ({ page }) => {
    const backend = await entrar(page);
    const andamento = planejar(backend, [['CIL-006']], { iniciar: true });
    const dialogo = await abrirEntrega(page, andamento.id);
    const area = dialogo.getByLabel(AREA);
    await area.scrollIntoViewIfNeeded();
    const caixa = (await area.boundingBox())!;
    await page.mouse.move(caixa.x + 20, caixa.y + 20);
    await page.mouse.down();
    await page.mouse.move(caixa.x + 21, caixa.y + 21);
    await page.mouse.up();
    await expect(dialogo.getByText('Assinatura vazia: nada foi guardado.')).toBeAttached();
    await expect(dialogo.getByRole('button', { name: 'Limpar assinatura' })).toBeDisabled();
    await dialogo.getByRole('button', { name: 'Registrar entrega' }).click();
    await expect(dialogo).toHaveCount(0);
    await expect(page.getByText('Entrega registrada').first()).toBeVisible();
    await page.waitForTimeout(500);
    expect(backend.trips.attachments).toHaveLength(0);
    expect(backend.trips.deliveries).toHaveLength(1);
  });
});

test.describe('assinar sem conexão', () => {
  test('a assinatura fica no aparelho e chega como anexo depois do registro; o histórico mostra só "com assinatura"', async ({ page, context, browserName }) => {
    test.skip(browserName === 'webkit', SEM_ARQUIVO_NO_WEBKIT);
    const backend = await entrar(page, 'viagens-gestor');
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
    await assinar(page, dialogo.getByLabel(AREA));
    await expect(dialogo.getByRole('button', { name: 'Limpar assinatura' })).toBeEnabled();
    await dialogo.getByRole('button', { name: 'Registrar entrega' }).click();
    await expect(dialogo).toHaveCount(0);
    expect(backend.trips.attachments).toHaveLength(0);
    expect((await lerFila(page)).length).toBe(2);

    await religarRede(context, page);
    await expect.poll(() => backend.trips.attachments.length).toBe(1);
    expect(backend.trips.deliveries).toHaveLength(1);

    // O histórico e a auditoria dizem só que houve assinatura (sim ou não), nunca a imagem, o caminho ou o nome do arquivo.
    const eventos = backend.trips.events.filter((evento) => evento.event_type === 'evidence_attached');
    expect(eventos).toHaveLength(1);
    expect(JSON.stringify(eventos)).not.toMatch(/png|storage|signature\.png|assinatura\.png|path/i);
    expect(eventos[0]!.data).toMatchObject({ photo_count: 0, has_signature: true });
    await page.reload();
    await expect(page.getByText('com assinatura').first()).toBeVisible();
    await expect(page.getByAltText('Assinatura de quem recebeu')).toBeVisible();
  });

  test('quem não tem trip.recipient vê "com assinatura", mas nunca a imagem', async ({ page, browserName }) => {
    test.skip(browserName === 'webkit', SEM_ARQUIVO_NO_WEBKIT);
    const backend = await entrar(page, 'viagens-gestor');
    const andamento = planejar(backend, [['CIL-006']], { iniciar: true });
    const dialogo = await abrirEntrega(page, andamento.id);
    await assinar(page, dialogo.getByLabel(AREA));
    await expect(dialogo.getByRole('button', { name: 'Limpar assinatura' })).toBeEnabled();
    await dialogo.getByRole('button', { name: 'Registrar entrega' }).click();
    await expect(dialogo).toHaveCount(0);
    await expect.poll(() => backend.trips.attachments.length).toBe(1);

    backend.asProfile('viagens-estoquista');
    await page.reload();
    await expect(page.getByText('com assinatura').first()).toBeVisible();
    await expect(page.getByAltText('Assinatura de quem recebeu')).toHaveCount(0);
    await expect(page.getByText('Recebedor Fictício')).toHaveCount(0);
  });
});
