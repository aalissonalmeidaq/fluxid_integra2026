import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import type { MockBackend } from './support/mock-backend';
import { entrar, planejar, semRolagemHorizontal } from './support/trips-scenario';

test.use({ serviceWorkers: 'block' });

// Spec 015 (T039; RF-007a a RF-007g, CS-013, CS-014): a motorista abre a viagem em andamento num celular de 360 px. No navegador, a coleta
// só acontece com a tela aberta e o painel diz isso; a posição entra na fila e é enviada quando há conexão; sem conexão a fila fica
// guardada e sai ao reconectar, sem duplicar; localização negada não bloqueia a viagem; sessão expirada pede nova entrada.
const LOCAL = { latitude: -7.23, longitude: -39.31, accuracy: 12 };

async function viagemDaMotorista(page: Page, opcoes: { localizacao: boolean }): Promise<{ backend: MockBackend; id: string }> {
  await page.setViewportSize({ width: 360, height: 800 });
  if (opcoes.localizacao) {
    await page.context().grantPermissions(['geolocation']);
    await page.context().setGeolocation(LOCAL);
  }
  const backend = await entrar(page, 'viagens-admin');
  const { id } = planejar(backend, [['CIL-008']], { iniciar: true });
  backend.tracking.driverTrips.add(id);
  await page.goto(`/viagens/${id}`);
  return { backend, id };
}

const painel = (page: Page) => page.getByRole('region', { name: 'Localização da viagem' });

test.describe('Coleta da localização pela motorista (360 px)', () => {
  test('ativa no navegador: só com a tela aberta, posição na fila e enviada ao reconectar', async ({ page }) => {
    const { backend } = await viagemDaMotorista(page, { localizacao: true });
    await expect(painel(page).getByText('Só com esta tela aberta')).toBeVisible();
    await expect(painel(page).getByText(/aplicativo FluxID para Android/)).toBeVisible();
    await expect(painel(page).getByText('1 posição aguardando envio.')).toBeVisible();
    // Sem conexão a fila fica; ao reconectar, sai uma única vez, com o horário original.
    await page.context().setOffline(true);
    await page.context().setOffline(false);
    await expect(painel(page).getByText('Nenhuma posição aguardando envio.')).toBeVisible();
    expect(backend.tracking.received).toHaveLength(1);
    expect(backend.tracking.received[0]).toMatchObject({ latitude: LOCAL.latitude, longitude: LOCAL.longitude, sequence_no: 1 });
    expect(backend.tracking.capabilities).toEqual([]);
    expect(await semRolagemHorizontal(page)).toBe(true);
    const resultado = await new AxeBuilder({ page }).include('main').withTags(['wcag2a', 'wcag2aa', 'wcag22aa']).analyze();
    expect(resultado.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')).toEqual([]);
  });

  test('sem conexão, a posição fica guardada no aparelho e o painel mostra a pendência', async ({ page }) => {
    const { backend } = await viagemDaMotorista(page, { localizacao: true });
    await expect(painel(page).getByText('1 posição aguardando envio.')).toBeVisible();
    await page.context().setOffline(true);
    await page.reload().catch(() => undefined);
    expect(backend.tracking.received).toHaveLength(0);
  });

  test('localização negada: a viagem continua e há como permitir de novo', async ({ page }) => {
    // O navegador sem interface não mostra o pedido de permissão; a recusa da pessoa é simulada na própria API de geolocalização.
    await page.addInitScript(() => {
      const denied = { code: 1, PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3, message: 'User denied Geolocation' };
      const fake = {
        watchPosition: (_ok: unknown, error?: (e: typeof denied) => void) => { setTimeout(() => error?.(denied), 0); return 1; },
        clearWatch: () => undefined,
        getCurrentPosition: (_ok: unknown, error?: (e: typeof denied) => void) => { setTimeout(() => error?.(denied), 0); },
      };
      Object.defineProperty(Navigator.prototype, 'geolocation', { configurable: true, get: () => fake });
    });
    await viagemDaMotorista(page, { localizacao: false });
    await expect(painel(page).getByText('Localização negada')).toBeVisible();
    await expect(painel(page).getByText(/A viagem continua/)).toBeVisible();
    await expect(painel(page).getByRole('button', { name: 'Permitir localização' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Concluir viagem' })).toBeVisible();
  });

  test('sessão expirada no envio: pausa e pede para entrar de novo, sem perder a fila', async ({ page }) => {
    const { backend } = await viagemDaMotorista(page, { localizacao: true });
    backend.tracking.ingestStatus = 401;
    await expect(painel(page).getByText('1 posição aguardando envio.')).toBeVisible();
    await page.context().setOffline(true);
    await page.context().setOffline(false);
    await expect(painel(page).getByText('Entre de novo', { exact: true })).toBeVisible();
    await expect(painel(page).getByText('1 posição aguardando envio.')).toBeVisible();
  });

  test('quem não é a motorista da viagem não vê o painel', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.context().grantPermissions(['geolocation']);
    const backend = await entrar(page, 'viagens-admin');
    const { id } = planejar(backend, [['CIL-008']], { iniciar: true });
    await page.goto(`/viagens/${id}`);
    await expect(page.getByRole('heading', { name: /Viagem/ }).first()).toBeVisible();
    await expect(painel(page)).toHaveCount(0);
  });
});
