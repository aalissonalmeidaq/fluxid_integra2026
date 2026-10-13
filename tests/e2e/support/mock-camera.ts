import type { Locator, Page } from '@playwright/test';

// Câmera simulada para os E2E de fotos e assinatura (Spec 010). A foto é uma imagem de verdade (JPEG desenhado num canvas do próprio navegador, diferente a cada
// chamada), entregue ao campo de arquivo como se viesse da câmera; o resto do caminho (redução, recodificação, resumo, envio) é o do aplicativo.
export async function tirarFoto(escopo: Locator | Page, cor: string = 'steelblue'): Promise<void> {
  const campo = escopo.locator('input[type="file"][capture]').first();
  await campo.evaluate(async (input, tinta) => {
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 480;
    const contexto = canvas.getContext('2d')!;
    contexto.fillStyle = tinta;
    contexto.fillRect(0, 0, canvas.width, canvas.height);
    // Ruído leve: cada foto tem bytes próprios (o resumo SHA-256 não se repete entre fotos).
    for (let i = 0; i < 60; i += 1) {
      contexto.fillStyle = `rgb(${Math.floor(Math.random() * 255)}, ${Math.floor(Math.random() * 255)}, ${Math.floor(Math.random() * 255)})`;
      contexto.fillRect(Math.random() * 600, Math.random() * 440, 40, 40);
    }
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));
    const arquivo = new File([blob!], 'camera.jpg', { type: 'image/jpeg' });
    const transferencia = new DataTransfer();
    transferencia.items.add(arquivo);
    (input as HTMLInputElement).files = transferencia.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, cor);
}

// Assina na área de desenho: um traço com o ponteiro (mouse, que o navegador trata como ponteiro como o dedo e a caneta).
export async function assinar(page: Page, area: Locator): Promise<void> {
  await area.scrollIntoViewIfNeeded();
  const caixa = (await area.boundingBox())!;
  await page.mouse.move(caixa.x + caixa.width * 0.15, caixa.y + caixa.height * 0.5);
  await page.mouse.down();
  for (let passo = 1; passo <= 12; passo += 1) {
    await page.mouse.move(caixa.x + caixa.width * (0.15 + passo * 0.06), caixa.y + caixa.height * (0.5 + Math.sin(passo) * 0.25), { steps: 2 });
  }
  await page.mouse.up();
}
