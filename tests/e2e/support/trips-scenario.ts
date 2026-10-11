import { expect, type Page } from '@playwright/test';
import { MockBackend, type PermissionProfile } from './mock-backend';
import { ORG_A } from './mock-registry';
import { seedEligibleCylinders } from './mock-trips-plan';

// Cenário comum dos E2E de viagem (Spec 008): entrar com um perfil e montar viagens direto no backend simulado, sem passar pela tela, para
// que cada teste foque no que quer provar. As regras de verdade são provadas no pgTAP.

export async function entrar(page: Page, perfil: PermissionProfile = 'viagens-admin'): Promise<MockBackend> {
  const backend = new MockBackend().asProfile(perfil);
  backend.loginResponses = [backend.authenticated()];
  backend.statusResponse = backend.activeStatus('aal2');
  seedEligibleCylinders(backend.trips);
  await backend.install(page);
  await page.goto('/');
  await page.getByLabel('E-mail').fill('admin-a@example.invalid');
  await page.getByLabel('Senha', { exact: true }).fill('Local-only-002!');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Visão geral' })).toBeVisible();
  return backend;
}

export type Chamar = (operation: string, extra: Record<string, unknown>) => { status: number; json: Record<string, unknown> };

export interface PlanejarOpcoes {
  placa?: string;
  motorista?: string;
  // Posição, no cadastro, das unidades de cada parada (uma por parada). O padrão é 0, 1, 2…
  unidades?: number[];
  iniciar?: boolean;
}

export function planejar(backend: MockBackend, paradas: string[][], opcoes: PlanejarOpcoes = {}): { id: string; chamar: Chamar } {
  const idDe = (serial: string) => backend.cylinders.cylinders.find((c) => c.serial_number === serial)!.id;
  const resposta = backend.trips.handle('manage', {
    operation: 'create_trip', organization_id: ORG_A, request_id: crypto.randomUUID(), planned_date: backend.trips.today(),
    vehicle_id: backend.registry.vehicles.find((v) => v.plate === (opcoes.placa ?? 'ABC1234'))!.id,
    driver_id: backend.registry.drivers.find((d) => d.full_name === (opcoes.motorista ?? 'Ana Condutora'))!.id,
    stops: paradas.map((seriais, index) => ({ site_id: backend.registry.sites[opcoes.unidades?.[index] ?? index]!.id, cylinder_ids: seriais.map(idDe) })),
  }, () => true);
  expect(resposta.status, JSON.stringify(resposta.json)).toBe(200);
  const id = String(resposta.json.trip_id);
  const chamar: Chamar = (operation, extra) => backend.trips.handle('manage', { operation, organization_id: ORG_A, request_id: crypto.randomUUID(), trip_id: id, ...extra }, () => true);
  if (opcoes.iniciar) {
    chamar('start_loading', { expected_version: 1 });
    for (const item of backend.trips.itemsOf(id)) chamar('check_item', { item_id: item.id });
    expect(chamar('start_trip', { expected_version: 2 }).status).toBe(200);
  }
  return { id, chamar };
}

export function entregar(backend: MockBackend, id: string, chamar: Chamar, posicao: number, recebedor = 'Recebedor Fictício', naoEntregue?: string, instante?: Date): void {
  const parada = backend.trips.stopsOf(id).find((s) => s.position === posicao)!;
  chamar('arrive_stop', { stop_id: parada.id });
  const itens = backend.trips.itemsOf(id).filter((item) => item.stop_id === parada.id);
  const resposta = chamar('register_delivery', {
    stop_id: parada.id, delivered_at: (instante ?? new Date(Date.now() - 60_000)).toISOString(), recipient_name: recebedor,
    results: itens.map((item) => {
      const serial = backend.cylinders.cylinders.find((c) => c.id === item.cylinder_id)!.serial_number;
      return serial === naoEntregue ? { item_id: item.id, delivered: false, reason: 'Cliente sem espaço para receber' } : { item_id: item.id, delivered: true };
    }),
  });
  expect(resposta.status, JSON.stringify(resposta.json)).toBe(200);
}

export const semRolagemHorizontal = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
