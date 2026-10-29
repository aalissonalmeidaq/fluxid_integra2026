import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { semearRastreamento, TRACKING_OCCURRENCE_A } from './support/mock-tracking';
import { entrar, semRolagemHorizontal } from './support/trips-scenario';

test.use({ serviceWorkers: 'block' });

// Spec 015 (US4, RF-022, CS-008, CS-010): o gestor abre a ocorrência de afastamento, vê as três evidências e o aviso de que nada muda a
// custódia nem a trava, reconhece e encerra com observação só com o teclado. Axe sem violação crítica ou grave e sem rolagem horizontal.
async function gestor(page: Page) {
  const backend = await entrar(page, 'rastreamento-gestor');
  semearRastreamento(backend.tracking);
  return backend;
}

test.describe('Tratar uma ocorrência de proximidade', () => {
  test('reconhecer e encerrar com observação, só com o teclado', async ({ page }) => {
    const backend = await gestor(page);
    await page.goto(`/rastreamento/ocorrencias/${TRACKING_OCCURRENCE_A}`);
    await expect(page.getByRole('heading', { level: 2, name: 'Afastamento confirmado · TRK-A-1' })).toBeVisible();
    await expect(page.getByRole('list', { name: 'Comparações que confirmaram' }).getByRole('listitem')).toHaveCount(3);
    await expect(page.getByText(/não muda a custódia do cilindro nem o estado da trava/)).toBeVisible();

    const reconhecer = page.getByRole('button', { name: 'Reconhecer' });
    await reconhecer.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByText(/Reconhecida por Gestora Fictícia/)).toBeVisible();

    const encerrar = page.getByRole('button', { name: 'Encerrar ocorrência' });
    await encerrar.focus();
    await page.keyboard.press('Enter');
    const dialogo = page.getByRole('dialog', { name: 'Encerrar ocorrência' });
    await expect(dialogo.getByLabel('Observação')).toBeFocused();
    await page.keyboard.type('Motorista parou para abastecer; carga conferida.');
    await dialogo.getByRole('button', { name: 'Encerrar' }).focus();
    await page.keyboard.press('Enter');
    await expect(dialogo).toHaveCount(0);
    await expect(page.getByText('Motorista parou para abastecer; carga conferida.')).toBeVisible();
    expect((backend.tracking.occurrences[TRACKING_OCCURRENCE_A]!.occurrence as { status: string }).status).toBe('closed');
  });

  test('acessibilidade e sem rolagem horizontal em 360, 768 e 1920 px', async ({ page }) => {
    await gestor(page);
    for (const largura of [360, 768, 1920]) {
      await page.setViewportSize({ width: largura, height: 900 });
      await page.goto(`/rastreamento/ocorrencias/${TRACKING_OCCURRENCE_A}`);
      await expect(page.getByRole('list', { name: 'Comparações que confirmaram' })).toBeVisible();
      const resultado = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag22aa']).analyze();
      expect(resultado.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious'), `${largura}px`).toEqual([]);
      expect(await semRolagemHorizontal(page), `${largura}px`).toBe(true);
    }
  });
});
