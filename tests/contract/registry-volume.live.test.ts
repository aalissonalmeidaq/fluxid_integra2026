// @vitest-environment node
import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { callFunction, endAllSessions, login, logout, type FunctionResponse } from '../support/auth-harness';

// Spec 007, RNF-001 e RNF-003: desempenho com o volume de referência (10 mil clientes, 50 mil unidades, 50 mil geocercas, 5 mil veículos
// e 5 mil motoristas em uma organização), contra o Supabase local real. Mede, pelas Edge Functions (Auth, sessão governada, RPC e
// índices), a busca de cada lista (p95 ≤ 1 s), a primeira página e a consulta "geocercas que contêm um ponto" (p95 ≤ 200 ms). A
// medição da primeira página no navegador, em 4G, está em tests/e2e/desempenho-lista-registro.spec.ts.
const F = '20000000-0000-0000-0000-00000000000f';
const SQL_DIR = join(__dirname, '..', 'support', 'sql');
const SAMPLES = 40;
const admin = { email: 'cyl-f-admin@example.invalid', password: 'Local-only-018!' };

const runSql = (file: string): void => {
  execSync(`npx supabase db query --local --file "${join(SQL_DIR, file)}"`, { stdio: 'pipe', timeout: 180_000 });
};
const percentile = (values: number[], p: number): number => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)] ?? 0;
};

async function measure(accessToken: string, calls: Array<Record<string, unknown>>, fn = 'query-registry'): Promise<{ times: number[]; responses: FunctionResponse[] }> {
  const times: number[] = [];
  const responses: FunctionResponse[] = [];
  for (const body of calls) {
    const start = performance.now();
    const response = await callFunction(fn, body, accessToken);
    times.push(performance.now() - start);
    responses.push(response);
  }
  return { times, responses };
}

const pad = (n: number, size: number): string => String(n).padStart(size, '0');

describe('Volume de referência da Spec 007', () => {
  let accessToken = '';

  beforeAll(async () => {
    await endAllSessions(admin);
    runSql('registry-volume-limpar.sql');
    runSql('registry-volume-semear.sql');
    const result = await login(admin);
    expect(result.status, JSON.stringify(result.body)).toBe(200);
    accessToken = result.body.session.access_token as string;
  }, 300_000);

  afterAll(async () => {
    if (accessToken) await logout(accessToken);
    runSql('registry-volume-limpar.sql');
  }, 180_000);

  const report = (label: string, times: number[]): number => {
    const p95 = percentile(times, 95);
    console.log(`[volume] ${label}: mediana ${percentile(times, 50).toFixed(0)} ms, p95 ${p95.toFixed(0)} ms, máx ${Math.max(...times).toFixed(0)} ms (${times.length} chamadas)`);
    return p95;
  };

  it('conta e pagina o volume inteiro, com total exato', async () => {
    const customers = await callFunction('query-registry', { operation: 'list_customers', organization_id: F, status: 'all', search: 'cliente volume' }, accessToken);
    expect(customers.status).toBe(200);
    expect(customers.body.total).toBe(10_000);
    expect(customers.body.items).toHaveLength(25);
    expect(customers.body.next).not.toBeNull();
    expect((await callFunction('query-registry', { operation: 'list_sites', organization_id: F, status: 'all', search: 'unidade volume' }, accessToken)).body.total).toBe(50_000);
    expect((await callFunction('query-registry', { operation: 'list_geofences', organization_id: F, status: 'all', search: 'geocerca' }, accessToken)).body.total).toBe(50_000);
    expect((await callFunction('query-registry', { operation: 'list_vehicles', organization_id: F, status: 'all', search: 'vol' }, accessToken)).body.total).toBe(5_000);
    expect((await callFunction('query-registry', { operation: 'list_drivers', organization_id: F, status: 'all', search: 'motorista volume' }, accessToken)).body.total).toBe(5_000);
  });

  it('busca de cliente por nome, por unidade e por cidade: p95 ≤ 1 s (RNF-001)', async () => {
    const calls = [
      ...Array.from({ length: SAMPLES }, (_, index) => ({ operation: 'list_customers', organization_id: F, status: 'all', search: `cliente volume ${pad(1 + ((index * 241) % 10_000), 5)}` })),
      ...Array.from({ length: SAMPLES }, (_, index) => ({ operation: 'list_customers', organization_id: F, status: 'all', search: `unidade volume ${pad(1 + ((index * 1237) % 50_000), 6)}` })),
      { operation: 'list_customers', organization_id: F, status: 'all', search: 'campinas' },
    ];
    await measure(accessToken, calls.slice(0, 3));
    const { times, responses } = await measure(accessToken, calls);
    expect(responses.every((response) => response.status === 200 && response.body.total >= 1)).toBe(true);
    expect(report('clientes', times)).toBeLessThanOrEqual(1000);
  });

  const searches: Array<[string, (index: number) => Record<string, unknown>]> = [
    ['unidades por nome', (index) => ({ operation: 'list_sites', organization_id: F, status: 'all', search: `unidade volume ${pad(1 + ((index * 977) % 50_000), 6)}` })],
    ['geocercas por nome', (index) => ({ operation: 'list_geofences', organization_id: F, status: 'all', search: `geocerca ${pad(1 + ((index * 811) % 50_000), 6)}` })],
    ['veículos por placa', (index) => ({ operation: 'list_vehicles', organization_id: F, status: 'all', search: `VOL${pad(1 + ((index * 113) % 5_000), 4)}` })],
    ['motoristas por nome', (index) => ({ operation: 'list_drivers', organization_id: F, status: 'all', search: `motorista volume ${pad(1 + ((index * 127) % 5_000), 5)}` })],
    ['motoristas pelo documento completo', (index) => ({ operation: 'list_drivers', organization_id: F, status: 'all', search: pad(1 + ((index * 131) % 5_000), 11) })],
  ];
  for (const [label, build] of searches) {
    it(`busca de ${label}: p95 ≤ 1 s (RNF-001)`, async () => {
      const { times, responses } = await measure(accessToken, Array.from({ length: SAMPLES }, (_, index) => build(index)));
      expect(responses.every((response) => response.status === 200 && response.body.total >= 1), JSON.stringify(responses.find((response) => response.status !== 200 || response.body.total < 1)?.body)).toBe(true);
      expect(report(label, times)).toBeLessThanOrEqual(1000);
    }, 120_000);
  }

  it('primeira página de cada lista: p95 ≤ 1 s no servidor', async () => {
    const operations = ['list_customers', 'list_sites', 'list_geofences', 'list_vehicles', 'list_drivers'];
    const calls = operations.flatMap((operation) => Array.from({ length: 10 }, () => ({ operation, organization_id: F, status: 'active', limit: 25 })));
    const { times, responses } = await measure(accessToken, calls);
    expect(responses.every((response) => response.status === 200 && response.body.items.length === 25)).toBe(true);
    expect(report('primeira página', times)).toBeLessThanOrEqual(1000);
  });

  it('geocercas que contêm um ponto, com 50 mil geocercas: p95 ≤ 200 ms (RNF-003)', async () => {
    // Pontos sobre o centro de unidades espalhadas pela grade: cada um cai dentro de pelo menos uma geocerca.
    const calls = Array.from({ length: SAMPLES }, (_, index) => {
      let n = 1 + ((index * 1237) % 50_000);
      // As unidades de cliente inativo (a cada 25 clientes) têm geocerca inativa e não entram na consulta: pula para uma ativa.
      while ((Math.floor((n - 1) / 5) + 1) % 25 === 0) n += 5;
      return { operation: 'geofences_containing_point', organization_id: F, latitude: -23.8 + Math.floor(n / 250) * 0.002, longitude: -46.9 + (n % 250) * 0.002 };
    });
    await measure(accessToken, calls.slice(0, 5));
    const { times, responses } = await measure(accessToken, calls);
    expect(responses.every((response) => response.status === 200 && response.body.geofences.length >= 1)).toBe(true);
    expect(report('geocercas que contêm um ponto', times)).toBeLessThanOrEqual(200);
  });
});
