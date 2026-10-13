// @vitest-environment node
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createManageTripsHandler } from '../../supabase/functions/manage-trips/handler';
import type { OperationsGateway } from '../../supabase/functions/_shared/operations';

// Spec 009 (RF-015, RF-017, CA-004, CA-005): nenhuma coordenada aparece em log, auditoria em texto aberto, URL ou armazenamento do aparelho, e a
// localização só é lida a pedido, uma vez, sem observação contínua. O lado do banco (evento e auditoria só com origem e faixa de precisão) está
// em supabase/tests/009_position.test.sql.
const ROOT = path.resolve(import.meta.dirname, '../..');
const ORG = '20000000-0000-4000-8000-00000000000a';
const REQUEST = 'a0000000-0000-4000-8000-000000000001';
const TRIP = '99000000-0000-4000-8000-000000000001';
const STOP = '9a000000-0000-4000-8000-000000000001';
const ITEM = '9b000000-0000-4000-8000-000000000001';
const LAT = -23.5504876;
const LNG = -46.6333094;

const gateway = (result: Record<string, unknown>): OperationsGateway & { audit: ReturnType<typeof vi.fn> } => ({
  authenticate: vi.fn(async () => ({ userId: '10000000-0000-4000-8000-000000000002', sessionId: '60000000-0000-4000-8000-0000000900a2', aal: 'aal1' as const })),
  rpc: vi.fn(async () => result),
  audit: vi.fn(async () => undefined),
}) as never;
const post = (body: unknown) => new Request('http://local/fn', { method: 'POST', headers: { authorization: 'Bearer jwt', 'content-type': 'application/json' }, body: JSON.stringify(body) });

const arrive = { operation: 'arrive_stop', organization_id: ORG, request_id: REQUEST, trip_id: TRIP, stop_id: STOP, latitude: LAT, longitude: LNG, accuracy_m: 12, position_source: 'gps' };
const deliver = {
  operation: 'register_delivery', organization_id: ORG, request_id: REQUEST, trip_id: TRIP, stop_id: STOP, delivered_at: '2026-10-13T15:30:00Z', recipient_name: 'Recebedor Fictício',
  latitude: LAT, longitude: LNG, accuracy_m: 12, position_source: 'gps', results: [{ item_id: ITEM, delivered: true }],
};
const LEAK = /23\.5504876|46\.6333094|23,5504876|46,6333094/;

afterEach(() => vi.restoreAllMocks());

describe('os manipuladores não registram coordenadas', () => {
  it.each(['log', 'info', 'warn', 'error', 'debug'] as const)('console.%s nunca recebe as coordenadas', async (method) => {
    const spy = vi.spyOn(console, method).mockImplementation(() => undefined);
    for (const body of [arrive, deliver]) {
      for (const result of [{ code: 'ARRIVED' }, { code: 'DELIVERED' }, { code: 'ACCESS_DENIED' }, { code: 'VALIDATION_FAILED' }]) {
        await createManageTripsHandler(gateway(result))(post(body));
      }
      const failing: OperationsGateway = { ...gateway({}), rpc: vi.fn(async () => { throw new Error('rpc_failed'); }) };
      await createManageTripsHandler(failing)(post(body));
    }
    expect(JSON.stringify(spy.mock.calls)).not.toMatch(LEAK);
  });

  it('a auditoria feita pela borda (negações e falhas) nunca leva as coordenadas', async () => {
    for (const body of [arrive, deliver]) {
      for (const result of [{ code: 'ACCESS_DENIED' }, { code: 'AUTH_REQUIRED' }]) {
        const gw = gateway(result);
        await createManageTripsHandler(gw)(post(body));
        expect(JSON.stringify(gw.audit.mock.calls)).not.toMatch(LEAK);
      }
      const failing = gateway({});
      (failing.rpc as unknown as ReturnType<typeof vi.fn>) = vi.fn(async () => { throw new Error('rpc_failed'); });
      await createManageTripsHandler(failing)(post(body));
      expect(JSON.stringify(failing.audit.mock.calls)).not.toMatch(LEAK);
    }
  });

  it('os corpos de erro nunca repetem as coordenadas', async () => {
    for (const result of [{ code: 'ACCESS_DENIED' }, { code: 'VALIDATION_FAILED' }, { code: 'INVALID_TRANSITION', from: 'pending', to: 'on_site' }]) {
      const response = await createManageTripsHandler(gateway(result))(post(arrive));
      expect(JSON.stringify(await response.json())).not.toMatch(LEAK);
    }
  });
});

// Código do cliente e das funções: nada de console, de armazenamento no aparelho nem de observação contínua da posição.
const FOLDERS = ['src/domain/field', 'src/infrastructure/field', 'src/pages/field', 'src/application/field', 'src/pages/trips', 'supabase/functions/manage-trips', 'supabase/functions/query-trips'];
const sources = (folder: string): { file: string; text: string }[] => {
  const out: { file: string; text: string }[] = [];
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.(ts|tsx)$/.test(entry.name)) out.push({ file: path.relative(ROOT, full), text: fs.readFileSync(full, 'utf8') });
    }
  };
  walk(path.join(ROOT, folder));
  return out;
};
const files = FOLDERS.flatMap(sources);

describe('o código de campo e de viagens não guarda nem registra a posição', () => {
  it('há código para varrer', () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it.each(files.map((entry) => [entry.file, entry.text]))('%s não usa console', (_file, text) => {
    expect(text).not.toMatch(/\bconsole\./);
  });

  it.each(files.map((entry) => [entry.file, entry.text]))('%s não guarda nada em armazenamento do aparelho', (_file, text) => {
    expect(text).not.toMatch(/\b(localStorage|sessionStorage|indexedDB|IDBDatabase|caches\.open)\b/);
  });

  it('a posição nunca é observada de forma contínua: não existe watchPosition no código', () => {
    for (const entry of files) expect(entry.text, entry.file).not.toMatch(/\bwatchPosition\b/);
  });

  it('a posição nunca é lida de cache: maximumAge é sempre zero', () => {
    const reader = files.find((entry) => entry.file.endsWith('geolocation-reader.ts'))!;
    expect(reader.text).toMatch(/maximumAge: 0/);
    expect(reader.text).toMatch(/enableHighAccuracy: true/);
  });

  it('a posição vai ao servidor só pelas operações de chegada e de entrega, no corpo e nunca na URL', () => {
    const service = fs.readFileSync(path.join(ROOT, 'src/application/trips/trip-service.ts'), 'utf8');
    expect(service).not.toMatch(/\?latitude=|&latitude=|searchParams|location\.(search|hash)/);
  });
});
