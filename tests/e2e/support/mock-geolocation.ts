import type { Page } from '@playwright/test';

// Geolocalização controlada pelo Playwright na Spec 009: a posição, a precisão e a permissão vêm do contexto do navegador, e a tela usa a
// API de verdade (uma leitura por toque). O comportamento do GPS real, o consumo de bateria e a precisão em campo só se validam em aparelho
// Android com Chrome, na validação humana (quickstart.md).
export interface FakePosition {
  latitude: number;
  longitude: number;
  // Precisão em metros.
  accuracy?: number;
}

// Libera a localização e define a posição que o aparelho vai informar.
export async function allowLocation(page: Page, position: FakePosition): Promise<void> {
  await page.context().grantPermissions(['geolocation']);
  await page.context().setGeolocation({ latitude: position.latitude, longitude: position.longitude, accuracy: position.accuracy ?? 10 });
}

// Muda a posição informada nas próximas leituras (por exemplo, para ficar fora da geocerca ou com precisão ruim).
export async function moveTo(page: Page, position: FakePosition): Promise<void> {
  await page.context().setGeolocation({ latitude: position.latitude, longitude: position.longitude, accuracy: position.accuracy ?? 10 });
}

// A pessoa nega a localização: sem permissão concedida, o navegador recusa a leitura.
export async function denyLocation(page: Page): Promise<void> {
  await page.context().clearPermissions();
}
