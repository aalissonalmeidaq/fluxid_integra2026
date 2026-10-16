import { test, expect, type Page } from '@playwright/test';
import { MockBackend } from '../support/mock-backend';

// Linha de base visual da landing page (Spec 011) em 360, 768 e 1440 px: a abertura (primeira tela) e a página inteira. Só Chromium, e as
// capturas de referência são geradas no Linux (contêiner oficial do Playwright ou CI), porque a renderização da fonte difere por sistema.
// Nunca versione `*-win32.png`. Veja specs/003-design-system-telas/quickstart.md.
// O movimento é reduzido e a imagem do mascote é esperada, para a captura ser reproduzível e mostrar a página completa.
test.use({ serviceWorkers: 'block', locale: 'pt-BR', timezoneId: 'America/Sao_Paulo', colorScheme: 'light', reducedMotion: 'reduce' });

const LARGURAS = [
  { nome: '360', largura: 360, altura: 740 },
  { nome: '768', largura: 768, altura: 1024 },
  { nome: '1440', largura: 1440, altura: 900 },
] as const;

async function abrir(page: Page): Promise<void> {
  await new MockBackend().install(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: /Saiba onde está cada cilindro/ })).toBeVisible();
  // As imagens sob demanda só carregam perto da tela: percorre a página para que todas estejam prontas na captura.
  const { altura, janela } = await page.evaluate(() => ({ altura: document.documentElement.scrollHeight, janela: window.innerHeight }));
  for (let y = 0; y <= altura; y += Math.max(300, janela - 100)) {
    await page.mouse.wheel(0, Math.max(300, janela - 100));
    await page.waitForTimeout(100);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  // Só as imagens visíveis: o mascote da seção "sem sinal" fica oculto abaixo de 768 px e nunca carrega.
  await page.waitForFunction(() => [...document.images].filter((imagem) => imagem.offsetParent !== null).every((imagem) => imagem.complete && imagem.naturalWidth > 0));
  await page.evaluate(() => document.fonts.ready);
}

for (const { nome, largura, altura } of LARGURAS) {
  test.describe(`Landing page (${nome} px)`, () => {
    test.use({ viewport: { width: largura, height: altura } });

    test('abertura', async ({ page }) => {
      await abrir(page);
      await expect(page).toHaveScreenshot(`landing-abertura-${nome}.png`);
    });

    test('página inteira', async ({ page }) => {
      await abrir(page);
      await expect(page).toHaveScreenshot(`landing-pagina-${nome}.png`, { fullPage: true });
    });
  });
}
