import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { entrar, semRolagemHorizontal } from './support/trips-scenario';

test.use({ serviceWorkers: 'block' });

// Spec 015 (US6; RF-032): o administrador libera uma categoria de aviso por e-mail e a pessoa escolhe recebê-la em Meu perfil; o que não
// foi liberado fica desabilitado com o motivo. Axe sem violação crítica ou grave e sem rolagem horizontal em 360 e 1920 px.
test.describe('Avisos por e-mail', () => {
  test('libera a categoria e escolhe receber no perfil', async ({ page }) => {
    const backend = await entrar(page, 'rastreamento-gestor');
    await page.goto('/rastreamento/avisos');
    const grupo = page.getByRole('group', { name: 'Categorias liberadas para a empresa' });
    await grupo.getByRole('checkbox', { name: /Afastamento confirmado/ }).check();
    await page.getByRole('button', { name: 'Salvar categorias' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Categorias salvas' })).toBeVisible();
    expect(backend.tracking.emailReleased).toEqual(['proximity_confirmed']);

    await page.goto('/perfil');
    const recuperado = page.getByRole('checkbox', { name: /Lacre recuperado/ });
    await expect(recuperado).toBeDisabled();
    await page.getByRole('checkbox', { name: /Afastamento confirmado/ }).check();
    await page.getByRole('button', { name: 'Salvar escolhas' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Escolhas salvas.' })).toBeVisible();
    expect(backend.tracking.emailChosen).toEqual(['proximity_confirmed']);
  });

  test('acessibilidade e sem rolagem horizontal em 360 e 1920 px', async ({ page, browserName }, testInfo) => {
    test.skip(browserName !== 'chromium' || testInfo.project.name !== 'desktop-chromium', 'As larguras são aplicadas dentro do teste; uma execução basta.');
    const backend = await entrar(page, 'rastreamento-gestor');
    backend.tracking.emailReleased = ['proximity_confirmed', 'seal_high_critical'];
    for (const largura of [360, 1920]) {
      await page.setViewportSize({ width: largura, height: 900 });
      for (const [caminho, controle] of [['/rastreamento/avisos', 'Salvar categorias'], ['/perfil', 'Salvar escolhas']] as const) {
        await page.goto(caminho);
        await expect(page.getByRole('button', { name: controle })).toBeVisible();
        const resultado = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag22aa']).analyze();
        expect(resultado.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious'), `${caminho} ${largura}px`).toEqual([]);
        expect(await semRolagemHorizontal(page), `${caminho} ${largura}px`).toBe(true);
      }
    }
  });
});
