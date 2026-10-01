import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { MockBackend } from './support/mock-backend';
test.use({ serviceWorkers: 'block' });

async function enter(page: import('@playwright/test').Page, backend: MockBackend): Promise<void> {
  backend.loginResponses=[backend.authenticated()];backend.statusResponse=backend.activeStatus('aal2');await backend.install(page);
  await page.goto('/');await page.getByLabel('E-mail').fill('admin-a@example.invalid');await page.getByLabel('Senha', { exact: true }).fill('Local-only-002!');await page.getByRole('button',{name:'Entrar'}).click();await expect(page.getByRole('button',{name:'Sair'})).toBeVisible();
  await page.goto('/admin/membros?organization_id=20000000-0000-0000-0000-00000000000a');
}

test.describe('Convites e vínculos do tenant',()=>{
  test('convida e bloqueia vínculo em 360 px',async({page})=>{
    await page.setViewportSize({width:360,height:740});const backend=new MockBackend();await enter(page,backend);
    await expect(page.getByRole('heading',{name:'Pessoas do tenant'})).toBeVisible();await expect(page.getByRole('rowheader',{name:'Operador A'})).toBeVisible();
    // Em 360 px a tabela vira cartões, com nomes longos sem estouro e ações de 44 px (CA-003, CA-005).
    await expect(page.getByRole('row').nth(1)).toHaveCSS('display','block');
    for (const acao of await page.getByRole('button',{name:/^(Bloquear|Inativar|Reativar) /}).all()) { const caixa=await acao.boundingBox(); expect(caixa?.height??0).toBeGreaterThanOrEqual(44); }
    await expect(page.locator('html')).toHaveJSProperty('scrollWidth',360);
    await page.getByRole('button',{name:'Convidar pessoa'}).click();await page.getByLabel('E-mail do convite').fill('nova@example.invalid');await page.getByLabel('Papel inicial').selectOption('50000000-0000-0000-0000-000000000004');await page.getByLabel('Justificativa do convite').fill('Acesso aprovado pelo administrador');await page.getByRole('button',{name:'Enviar convite'}).click();await expect(page.getByRole('status').filter({hasText:/convite enviado/i})).toBeVisible();
    await page.getByRole('button',{name:'Bloquear Operador A'}).click();await page.getByLabel('Justificativa da alteração').fill('Afastamento temporário aprovado');await page.getByRole('button',{name:'Confirmar bloqueio'}).click();await expect(page.getByText('Bloqueado',{exact:true})).toBeVisible();
    await expect(page.locator('html')).toHaveJSProperty('scrollWidth',360);
  });
  test('não possui violações críticas ou graves',async({page})=>{const backend=new MockBackend();await enter(page,backend);const scan=await new AxeBuilder({page}).analyze();expect(scan.violations.filter(v=>['critical','serious'].includes(v.impact??''))).toEqual([]);});
});
