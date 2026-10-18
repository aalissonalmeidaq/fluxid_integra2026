import { test, expect, type Page } from '@playwright/test';
import { MockBackend } from './support/mock-backend';
import { ORG_A, ORG_B } from './support/mock-registry';
import { ativarDispositivo } from './support/mock-seals-operacoes';
import { entrar } from './support/trips-scenario';

test.use({ serviceWorkers: 'block' });

// Spec 012, US5 (T095): cadastro do dispositivo e vínculo com o cilindro, com backend simulado. Cadastrar mostra a chave uma única vez;
// o lacre "liga" pelo backend (a mensagem de ativação); vincular pelo detalhe do cilindro e desvincular pelo dispositivo, com
// justificativa. O Tenant B não vê o dispositivo do A. As regras de verdade (chave, isolamento por RLS) estão no pgTAP e nas `.live`.

const cilindro = (backend: MockBackend, serial: string) => backend.cylinders.cylinders.find((c) => c.organization_id === ORG_A && c.serial_number === serial)!;

async function cadastrar(page: Page, nome: string): Promise<string> {
  await page.goto('/lacres');
  await page.getByRole('button', { name: 'Cadastrar dispositivo' }).click();
  const formulario = page.getByRole('dialog', { name: 'Cadastrar dispositivo' });
  await formulario.getByLabel('Nome do lacre').fill(nome);
  await formulario.getByRole('button', { name: 'Cadastrar' }).click();

  const chave = page.getByRole('dialog', { name: 'Chave do dispositivo' });
  await expect(chave.getByText('A chave não aparece de novo.')).toBeVisible();
  const codigo = (await chave.locator('code').first().textContent()) ?? '';
  await expect(chave.getByText(/^fxk_e2e-/)).toBeVisible();
  await chave.getByRole('button', { name: 'Copiar a chave' }).click();
  await expect(chave.getByText(/^(Chave copiada\.|Não foi possível copiar)/)).toBeVisible();
  // Concluir só depois de confirmar que guardou a chave.
  await expect(chave.getByRole('button', { name: 'Concluir' })).toBeDisabled();
  await chave.getByLabel('Já guardei a chave para gravar no lacre').check();
  await chave.getByRole('button', { name: 'Concluir' }).click();
  await expect(chave).toHaveCount(0);
  await expect(page.getByText(/^fxk_e2e-/)).toHaveCount(0);
  return codigo;
}

test.describe('Cadastro e vínculo do lacre', () => {
  test('cadastrar, ativar, vincular pelo cilindro e desvincular pelo dispositivo', async ({ page }) => {
    const backend = await entrar(page, 'lacres-admin');
    const codigo = await cadastrar(page, 'Lacre do pátio');
    const tabela = page.getByRole('table', { name: 'Lacres da organização' });
    await expect(tabela.getByRole('link', { name: /Lacre do pátio/ })).toBeVisible();
    await expect(tabela.getByText('Nunca comunicou')).toBeVisible();

    // O lacre liga e avisa a ativação (o que a borda gravaria).
    const device = backend.seals.rows('devices').find((d) => d.device_code === codigo)!;
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
    const doA = backend.seals.handle('manage', { operation: 'create_device', organization_id: ORG_A, request_id: crypto.randomUUID(), label: 'Lacre do Tenant A' }, () => true);
    const idDoA = String(doA.json.device_id);
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
