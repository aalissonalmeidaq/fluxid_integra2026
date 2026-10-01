import {test,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {MockBackend} from './support/mock-backend';
test.use({serviceWorkers:'block'});

test.describe('Administração global de organizações',()=>{
  test('lista e cria tenant com justificativa em 360 px',async({page})=>{
    await page.setViewportSize({width:360,height:740});
    const backend=new MockBackend(); backend.loginResponses=[backend.authenticated()]; backend.statusResponse=backend.activeStatus('aal2'); await backend.install(page);
    await page.goto('/'); await page.getByLabel('E-mail').fill('master@example.invalid'); await page.getByLabel('Senha', { exact: true }).fill('Local-only-001!'); await page.getByRole('button',{name:'Entrar'}).click();
    await expect(page.getByRole('button',{name:'Sair'})).toBeVisible();
    await page.goto('/admin/tenants');
    await expect(page.getByRole('heading',{name:'Organizações'})).toBeVisible();
    await expect(page.getByRole('heading',{name:'Tenant A',exact:true})).toBeVisible();
    await page.getByRole('button',{name:/nova organização/i}).click();
    await page.getByLabel('Razão social').fill('Empresa Nova Ltda.');
    await page.getByLabel('Nome de exibição').fill('Empresa Nova');
    await page.getByLabel('Justificativa').fill('Contrato aprovado pela área responsável');
    await page.getByRole('button',{name:'Criar organização'}).click();
    await expect(page.getByRole('status').filter({hasText:/criada com sucesso/i})).toBeVisible();
    await expect(page.locator('body')).not.toHaveCSS('overflow-x','scroll');
  });
  test('dashboard não possui violações críticas ou graves',async({page})=>{
    const backend=new MockBackend();backend.loginResponses=[backend.authenticated()];backend.statusResponse=backend.activeStatus('aal2');await backend.install(page);
    await page.goto('/');await page.getByLabel('E-mail').fill('master@example.invalid');await page.getByLabel('Senha', { exact: true }).fill('Local-only-001!');await page.getByRole('button',{name:'Entrar'}).click();await expect(page.getByRole('button',{name:'Sair'})).toBeVisible();await page.goto('/admin/tenants');await expect(page.getByRole('heading',{name:'Organizações'})).toBeVisible();
    const scan=await new AxeBuilder({page}).analyze();expect(scan.violations.filter(v=>['critical','serious'].includes(v.impact??''))).toEqual([]);
  });
});
