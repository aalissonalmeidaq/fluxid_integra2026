import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { MockBackend } from './support/mock-backend';
import { ORG_A } from './support/mock-registry';
import { novoDispositivo } from './support/mock-seals-operacoes';
import { novoPedido } from './support/mock-seals-plataforma';
import { entrar } from './support/trips-scenario';

test.use({ serviceWorkers: 'block' });

// Spec 013, US2 e US3 (T040, T062), com backend simulado: o Master aprova um lacre para o Tenant A em /admin/lacres; o administrador do A o
// vê como "Pronto para vincular", vincula pelo cilindro e devolve à plataforma, e o pedido volta à fila como "Devolvido". As regras de
// verdade (isolamento, redes, auditoria) estão no pgTAP e nas `.live`.

async function entrarComoMaster(page: Page): Promise<MockBackend> {
  const backend = new MockBackend().asProfile('master');
  backend.loginResponses = [backend.authenticated()];
  backend.statusResponse = backend.activeStatus('aal2');
  novoPedido(backend.seals, { device_code: 'DSP-E2EAPR01' });
  novoPedido(backend.seals, { device_code: 'DSP-E2EAPR02', conflict: true });
  novoPedido(backend.seals, { device_code: 'DSP-E2EDEV01', status: 'returned', last_organization: { id: ORG_A, name: 'Tenant A' } });
  await backend.install(page);
  await page.goto('/visao-geral');
  await page.getByLabel('E-mail').fill('master@example.invalid');
  await page.getByLabel('Senha', { exact: true }).fill('Local-only-001!');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Minha conta' })).toBeVisible();
  return backend;
}

test.describe('Lacres da plataforma (Master)', () => {
  test('aprova um lacre para o Tenant A, com o código em destaque e justificativa', async ({ page }) => {
    const backend = await entrarComoMaster(page);
    await page.goto('/admin/lacres');
    await expect(page.getByRole('heading', { level: 2, name: 'Lacres da plataforma' })).toBeVisible();
    await expect(page.getByRole('tab', { name: /Aguardando/ })).toHaveAttribute('aria-selected', 'true');
    const conflito = page.getByRole('row', { name: /DSP-E2EAPR02/ });
    await expect(conflito.getByText('Outro aparelho com este código', { exact: true })).toBeVisible();
    await expect(conflito.getByText(/Resolva o conflito antes de aprovar/)).toBeVisible();
    await expect(conflito.getByRole('button', { name: /^Aprovar/ })).toBeDisabled();

    await page.getByRole('row', { name: /DSP-E2EAPR01/ }).getByRole('button', { name: /^Aprovar/ }).click();
    const dialogo = page.getByRole('dialog', { name: 'Aprovar o lacre DSP-E2EAPR01' });
    await expect(dialogo.getByText('Confira se é o código do lacre em mãos')).toBeVisible();
    await dialogo.getByLabel('Empresa de destino').selectOption({ label: 'Tenant A' });
    await dialogo.getByLabel('Justificativa').fill('Lacre conferido na bancada');
    await dialogo.getByRole('button', { name: 'Aprovar e destinar' }).click();
    await expect(page.getByText('Lacre DSP-E2EAPR01 aprovado para Tenant A.')).toBeVisible();
    expect(backend.seals.rows('devices').some((d) => d.device_code === 'DSP-E2EAPR01' && d.organization_id === ORG_A)).toBe(true);

    await page.getByRole('tab', { name: /Devolvidos/ }).click();
    await expect(page.getByRole('row', { name: /DSP-E2EDEV01/ }).getByRole('button', { name: /Destinar de novo/ })).toBeVisible();
  });

  test('só com teclado: abas pelas setas e diálogo que devolve o foco', async ({ page }) => {
    await entrarComoMaster(page);
    await page.goto('/admin/lacres');
    const aguardando = page.getByRole('tab', { name: /Aguardando/ });
    await aguardando.focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('tab', { name: /Em operação/ })).toBeFocused();
    await page.keyboard.press('ArrowLeft');
    await expect(aguardando).toBeFocused();
    const recusar = page.getByRole('row', { name: /DSP-E2EAPR01/ }).getByRole('button', { name: /Recusar/ });
    await recusar.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog', { name: /Recusar o pedido/ })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(recusar).toBeFocused();
  });

  for (const largura of [360, 768, 1920]) {
    test(`sem rolagem horizontal e sem violação grave de acessibilidade em ${largura} px`, async ({ page }) => {
      await page.setViewportSize({ width: largura, height: 900 });
      await entrarComoMaster(page);
      await page.goto('/admin/lacres');
      await expect(page.getByRole('row', { name: /DSP-E2EAPR01/ })).toBeVisible();
      await expect(page.locator('html')).toHaveJSProperty('scrollWidth', largura);
      const scan = await new AxeBuilder({ page }).analyze();
      expect(scan.violations.filter((v) => ['critical', 'serious'].includes(v.impact ?? ''))).toEqual([]);
    });
  }

  test('sem conexão explica e não decide nada', async ({ page, context }) => {
    await entrarComoMaster(page);
    await page.goto('/admin/lacres');
    await expect(page.getByRole('row', { name: /DSP-E2EAPR01/ })).toBeVisible();
    await context.setOffline(true);
    await expect(page.getByText(/Sem conexão: a fila de pedidos aparece/)).toBeVisible();
    await context.setOffline(false);
  });
});

test.describe('Lacre destinado à empresa', () => {
  test('pronto para vincular, vinculado pelo cilindro e devolvido à plataforma', async ({ page }) => {
    const backend = await entrar(page, 'lacres-admin');
    const device = novoDispositivo(backend.seals, ORG_A, 'Lacre aprovado');
    Object.assign(device, { device_code: 'DSP-E2EAPR09', approved_at: backend.seals.now().toISOString() });
    const pedido = novoPedido(backend.seals, { device_code: 'DSP-E2EAPR09', status: 'approved' });
    Object.assign(pedido, { organization: { id: ORG_A, name: 'Tenant A' }, device_id: device.device_id });

    await page.goto('/lacres');
    const linha = page.getByRole('row', { name: /Lacre aprovado/ });
    await expect(linha.getByText('Pronto para vincular')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Cadastrar dispositivo' })).toHaveCount(0);

    const cilindro = backend.cylinders.cylinders.find((c) => c.organization_id === ORG_A && c.serial_number === 'CIL-006')!;
    await page.goto(`/cilindros/${cilindro.id}`);
    const bloco = page.getByRole('region', { name: 'Lacre' });
    await bloco.getByRole('button', { name: 'Vincular lacre' }).click();
    const vincular = page.getByRole('dialog', { name: 'Vincular lacre · CIL-006' });
    await vincular.getByLabel(/Lacre aprovado \(DSP-E2EAPR09\)/).check();
    await vincular.getByRole('button', { name: 'Vincular' }).click();
    await expect(bloco.getByText(/Lacre vinculado/)).toBeVisible();

    await page.goto(`/lacres/${String(device.device_id)}`);
    await expect(page.getByText('Aprovado pelo Master')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Gerar chave nova' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Devolver à plataforma' }).click();
    const devolver = page.getByRole('dialog', { name: /Devolver à plataforma/ });
    await devolver.getByLabel('Justificativa').fill('Lacre com defeito no sensor');
    await devolver.getByRole('button', { name: 'Devolver o lacre' }).click();
    await expect(page.getByText(/Lacre devolvido à plataforma/)).toBeVisible();
    expect(pedido.status).toBe('returned');
    expect(backend.seals.rows('bindings').find((b) => b.device_id === device.device_id)?.unbound_at).not.toBeNull();

    await page.goto('/lacres');
    await expect(page.getByRole('row', { name: /Lacre aprovado/ })).toHaveCount(0);
  });
});
