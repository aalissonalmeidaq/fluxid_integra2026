import { test, expect } from '@playwright/test';
import { MockBackend } from './support/mock-backend';
import { ORG_A, ORG_B } from './support/mock-registry';
import { ativarDispositivo, novoDispositivo } from './support/mock-seals-operacoes';
import { entrar } from './support/trips-scenario';

test.use({ serviceWorkers: 'block' });

// Spec 012, US5 (T095): vínculo do lacre com o cilindro, com backend simulado. Spec 013 (RF-018): o cadastro manual saiu; o lacre chega
// pelo Master já destinado ao tenant (aqui, semeado no backend), "liga" pelo backend (a mensagem de ativação), é vinculado pelo detalhe do
// cilindro e desvinculado pelo dispositivo, com justificativa. O Tenant B não vê o dispositivo do A. As regras de verdade estão no pgTAP e
// nas `.live`.

const cilindro = (backend: MockBackend, serial: string) => backend.cylinders.cylinders.find((c) => c.organization_id === ORG_A && c.serial_number === serial)!;

test.describe('Cadastro e vínculo do lacre', () => {
  test('lacre destinado pelo Master: ativar, vincular pelo cilindro e desvincular pelo dispositivo', async ({ page }) => {
    const backend = await entrar(page, 'lacres-admin');
    const device = novoDispositivo(backend.seals, ORG_A, 'Lacre do pátio');
    Object.assign(device, { approved_at: backend.seals.now().toISOString() });
    const codigo = String(device.device_code);
    await page.goto('/lacres');
    const tabela = page.getByRole('table', { name: 'Lacres da organização' });
    await expect(tabela.getByRole('link', { name: /Lacre do pátio/ })).toBeVisible();
    await expect(tabela.getByText('Nunca comunicou')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Cadastrar dispositivo' })).toHaveCount(0);

    // O lacre liga e avisa a ativação (o que a borda gravaria).
    ativarDispositivo(backend.seals, String(device.device_id));

    const cil = cilindro(backend, 'CIL-006');
    await page.goto(`/cilindros/${cil.id}`);
    const bloco = page.getByRole('region', { name: 'Lacre' });
    await expect(bloco.getByText('Este cilindro não tem lacre vinculado.')).toBeVisible();
    await bloco.getByRole('button', { name: 'Vincular lacre' }).click();
    const vincular = page.getByRole('dialog', { name: 'Vincular lacre · CIL-006' });
    await vincular.getByLabel(new RegExp(`Lacre do pátio \\(${codigo}\\)`)).check();
    await vincular.getByRole('button', { name: 'Vincular' }).click();
    await expect(vincular).toHaveCount(0);
    await expect(bloco.getByText(/Lacre vinculado/)).toBeVisible();
    await expect(bloco.getByText('Funcionando')).toBeVisible();

    await page.goto(`/lacres/${String(device.device_id)}`);
    await expect(page.getByRole('heading', { level: 2, name: 'Lacre do pátio' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'CIL-006' })).toHaveAttribute('href', `/cilindros/${cil.id}`);
    await page.getByRole('button', { name: 'Desvincular' }).click();
    const desvincular = page.getByRole('dialog', { name: 'Desvincular o lacre' });
    await desvincular.getByRole('button', { name: 'Desvincular o lacre' }).click();
    await expect(desvincular.getByText('Explique o motivo com pelo menos 5 caracteres.')).toBeVisible();
    await desvincular.getByLabel('Justificativa').fill('Troca do lacre na revisão.');
    await desvincular.getByRole('button', { name: 'Desvincular o lacre' }).click();
    await expect(page.getByText('Lacre desvinculado do cilindro.')).toBeVisible();
    await expect(page.getByRole('list', { name: 'Vínculos anteriores' })).toContainText('CIL-006');

    const desvinculo = backend.seals.rows('bindings').find((b) => b.device_id === device.device_id)!;
    expect(desvinculo.unbound_at).not.toBeNull();
  });

  test('quem só vê lacres não cadastra nem vincula', async ({ page }) => {
    const backend = await entrar(page, 'lacres-auditor');
    await page.goto('/lacres');
    await expect(page.getByRole('heading', { level: 2, name: 'Lacres' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Cadastrar dispositivo' })).toHaveCount(0);
    await page.goto(`/cilindros/${cilindro(backend, 'CIL-006').id}`);
    await expect(page.getByRole('region', { name: 'Lacre' }).getByText('Este cilindro não tem lacre vinculado.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Vincular lacre' })).toHaveCount(0);
  });

  test('o Tenant B não vê o dispositivo do Tenant A', async ({ page }) => {
    const backend = new MockBackend().asProfile('lacres-dois-tenants');
    const vinculo = (organization: string, nome: string) => ({
      id: organization === ORG_A ? '30000000-0000-0000-0000-00000000000a' : '30000000-0000-0000-0000-00000000000b', organization_id: organization, status: 'active',
      organizations: { id: organization, kind: 'tenant', status: 'active', display_name: nome },
    });
    backend.tenantMemberships = [vinculo(ORG_A, 'Tenant A'), vinculo(ORG_B, 'Tenant B')];
    backend.loginResponses = [backend.authenticated()];
    backend.statusResponse = backend.activeStatus('aal2');
    const idDoA = String(novoDispositivo(backend.seals, ORG_A, 'Lacre do Tenant A').device_id);
    await backend.install(page);
    await page.goto('/lacres');
    await page.getByLabel('E-mail').fill('admin-a@example.invalid');
    await page.getByLabel('Senha', { exact: true }).fill('Local-only-002!');
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    await page.getByRole('button', { name: 'Entrar em Tenant B' }).click();
    // Recarregar pode pedir a organização de novo: escolhe sempre o Tenant B.
    const irPara = async (caminho: string) => {
      await page.goto(caminho);
      const escolher = page.getByRole('button', { name: 'Entrar em Tenant B' });
      if (await escolher.waitFor({ timeout: 5_000 }).then(() => true, () => false)) await escolher.click();
    };

    await irPara('/lacres');
    await expect(page.getByText('Nenhum lacre encontrado')).toBeVisible();
    await expect(page.getByText('Lacre do Tenant A')).toHaveCount(0);
    await irPara(`/lacres/${idDoA}`);
    await expect(page.getByText('Lacre não encontrado')).toBeVisible();
    await expect(page.getByText('Lacre do Tenant A')).toHaveCount(0);
  });
});
