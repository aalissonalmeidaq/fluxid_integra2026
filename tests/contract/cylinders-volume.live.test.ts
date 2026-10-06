// @vitest-environment node
import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { callFunction, login, logout, type FunctionResponse } from '../support/auth-harness';

// Spec 006, RNF-001 e RNF-002a: desempenho com 50 mil cilindros em uma organização, contra o Supabase local real. Mede, pelas Edge
// Functions (Auth, sessão governada, RPC e índices), a busca por identificador e a primeira página da lista. A medição da lista
// em conexão 4G, no navegador, está em tests/e2e/desempenho-lista-cilindros.spec.ts.
const F = '20000000-0000-0000-0000-00000000000f';
const SQL_DIR = join(__dirname, '..', 'support', 'sql');
const TOTAL = 50_000;
const SAMPLES = 40;

const runSql = (file: string): void => {
  execSync(`npx supabase db query --local --file "${join(SQL_DIR, file)}"`, { stdio: 'pipe', timeout: 120_000 });
};

const percentile = (values: number[], p: number): number => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)] ?? 0;
};

async function measure(accessToken: string, calls: Array<Record<string, unknown>>): Promise<{ times: number[]; responses: FunctionResponse[] }> {
  const times: number[] = [];
  const responses: FunctionResponse[] = [];
  for (const body of calls) {
    const start = performance.now();
    const response = await callFunction('query-cylinders', body, accessToken);
    times.push(performance.now() - start);
    responses.push(response);
  }
  return { times, responses };
}

describe(`Volume: ${TOTAL} cilindros em uma organização`, () => {
  let accessToken = '';

  beforeAll(async () => {
    runSql('cilindros-volume-limpar.sql');
    runSql('cilindros-volume-semear.sql');
    const result = await login({ email: 'cyl-f-admin@example.invalid', password: 'Local-only-018!' });
    expect(result.status, JSON.stringify(result.body)).toBe(200);
    accessToken = result.body.session.access_token as string;
  }, 180_000);

  afterAll(async () => {
    if (accessToken) await logout(accessToken);
    runSql('cilindros-volume-limpar.sql');
  }, 120_000);

  it('a lista conta e pagina os 50 mil cilindros ativos e inativos com total exato', async () => {
    const active = await callFunction('query-cylinders', { operation: 'list', organization_id: F, status: 'active', search: 'VOL-' }, accessToken);
    expect(active.status).toBe(200);
    expect(active.body.total).toBe(TOTAL - TOTAL / 20);
    const all = await callFunction('query-cylinders', { operation: 'list', organization_id: F, status: 'all', search: 'VOL-' }, accessToken);
    expect(all.body.total).toBe(TOTAL);
    expect(all.body.items).toHaveLength(25);
    expect(all.body.next).not.toBeNull();
  });

  it('busca por identificador: p95 ≤ 1 s (RNF-001)', async () => {
    const calls = Array.from({ length: SAMPLES }, (_, index) => ({
      operation: 'lookup', organization_id: F, identifier_value: `qr-vol-${String(1 + ((index * 1237) % TOTAL)).padStart(6, '0')}`,
    }));
    await measure(accessToken, calls.slice(0, 3));
    const { times, responses } = await measure(accessToken, calls);
    expect(responses.every((response) => response.status === 200)).toBe(true);
    const p95 = percentile(times, 95);
    console.log(`[volume] lookup: mediana ${percentile(times, 50).toFixed(0)} ms, p95 ${p95.toFixed(0)} ms, máx ${Math.max(...times).toFixed(0)} ms (${SAMPLES} chamadas, ${TOTAL} cilindros)`);
    expect(p95).toBeLessThanOrEqual(1000);
  });

  it('busca por identificador pela lista (igualdade normalizada): p95 ≤ 1 s', async () => {
    const calls = Array.from({ length: SAMPLES }, (_, index) => ({
      operation: 'list', organization_id: F, status: 'all', search: ` qr-vol-${String(1 + ((index * 977) % TOTAL)).padStart(6, '0')} `,
    }));
    const { times, responses } = await measure(accessToken, calls);
    expect(responses.every((response) => response.status === 200 && response.body.total >= 1)).toBe(true);
    const p95 = percentile(times, 95);
    console.log(`[volume] list por identificador: mediana ${percentile(times, 50).toFixed(0)} ms, p95 ${p95.toFixed(0)} ms`);
    expect(p95).toBeLessThanOrEqual(1000);
  });

  it('primeira página da lista (sem filtro e com filtros): p95 ≤ 2 s no servidor (RNF-002)', async () => {
    const variants: Array<Record<string, unknown>> = [
      { operation: 'list', organization_id: F },
      { operation: 'list', organization_id: F, status: 'all' },
      { operation: 'list', organization_id: F, stock_status: 'in_stock' },
      { operation: 'list', organization_id: F, hydro_status: 'vencido' },
      { operation: 'list', organization_id: F, hydro_status: 'a_vencer', stock_status: 'out_of_stock' },
      { operation: 'list', organization_id: F, search: 'VOL-0420' },
      { operation: 'list', organization_id: F, sort: 'serial_desc' },
    ];
    const calls = Array.from({ length: SAMPLES }, (_, index) => ({ ...variants[index % variants.length], limit: 25 }));
    const { times, responses } = await measure(accessToken, calls);
    expect(responses.every((response) => response.status === 200)).toBe(true);
    const p95 = percentile(times, 95);
    console.log(`[volume] primeira página: mediana ${percentile(times, 50).toFixed(0)} ms, p95 ${p95.toFixed(0)} ms, máx ${Math.max(...times).toFixed(0)} ms`);
    expect(p95).toBeLessThanOrEqual(2000);
  });

  it('paginação por cursor no meio da lista continua rápida (p95 ≤ 2 s) e sem repetir itens', async () => {
    let cursor: string | null = null;
    const seen = new Set<string>();
    const times: number[] = [];
    for (let page = 0; page < 10; page += 1) {
      const start = performance.now();
      const response: FunctionResponse = await callFunction('query-cylinders', { operation: 'list', organization_id: F, status: 'all', limit: 100, ...(cursor ? { cursor } : {}) }, accessToken);
      times.push(performance.now() - start);
      expect(response.status).toBe(200);
      for (const item of response.body.items as Array<{ id: string }>) {
        expect(seen.has(item.id)).toBe(false);
        seen.add(item.id);
      }
      cursor = response.body.next as string | null;
    }
    expect(seen.size).toBe(1000);
    expect(percentile(times, 95)).toBeLessThanOrEqual(2000);
  });
});
