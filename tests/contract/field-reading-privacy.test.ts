// @vitest-environment node
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createQueryCylindersHandler } from '../../supabase/functions/query-cylinders/handler';
import type { CylinderGateway } from '../../supabase/functions/_shared/cylinders';

// Spec 009 (RF-017, RF-019, CA-004): o valor lido (código, número de série de etiqueta) nunca aparece em log, em auditoria, em corpo de
// erro nem na URL. Aqui se prova o lado do código da consulta `resolve`; o lado do banco está em supabase/tests/009_resolve_identifier.test.sql.
const ROOT = path.resolve(import.meta.dirname, '../..');
const ORG = '20000000-0000-4000-8000-00000000000a';
const VALOR_LIDO = 'SERIE-SIGILOSA-04A23B1C';
const LIDO_COM_DOIS_PONTOS = '04:A2:3B:1C:SIGILOSO';

const gateway = (result: Record<string, unknown>, rpc?: () => Promise<Record<string, unknown>>): CylinderGateway & { audit: ReturnType<typeof vi.fn> } => ({
  authenticate: vi.fn(async () => ({ userId: '10000000-0000-4000-8000-000000000002', sessionId: '60000000-0000-4000-8000-0000000900a2' })),
  rpc: vi.fn(rpc ?? (async () => result)),
  audit: vi.fn(async () => undefined),
}) as never;
const post = (body: unknown) => new Request('http://local/fn', { method: 'POST', headers: { authorization: 'Bearer jwt', 'content-type': 'application/json' }, body: JSON.stringify(body) });
const resolve = { operation: 'resolve', organization_id: ORG, candidates: [VALOR_LIDO, LIDO_COM_DOIS_PONTOS] };

afterEach(() => vi.restoreAllMocks());

describe('resolve: o valor lido não vaza', () => {
  it.each(['log', 'info', 'warn', 'error', 'debug'] as const)('console.%s nunca recebe o valor lido', async (method) => {
    const spy = vi.spyOn(console, method).mockImplementation(() => undefined);
    for (const result of [{ code: 'FOUND' }, { code: 'NOT_FOUND' }, { code: 'ACCESS_DENIED' }, { code: 'VALIDATION_FAILED' }]) {
      await createQueryCylindersHandler(gateway(result))(post(resolve));
    }
    const failing = gateway({}, async () => { throw new Error('rpc_failed'); });
    await createQueryCylindersHandler(failing)(post(resolve));
    expect(JSON.stringify(spy.mock.calls)).not.toMatch(/SIGILOS/);
  });

  it('nenhuma auditoria feita pela borda carrega o valor lido', async () => {
    for (const result of [{ code: 'ACCESS_DENIED' }, { code: 'AUTH_REQUIRED' }]) {
      const gw = gateway(result);
      await createQueryCylindersHandler(gw)(post(resolve));
      expect(JSON.stringify(gw.audit.mock.calls)).not.toMatch(/SIGILOS/);
    }
    const failing = gateway({}, async () => { throw new Error('rpc_failed'); });
    await createQueryCylindersHandler(failing)(post(resolve));
    expect(JSON.stringify(failing.audit.mock.calls)).not.toMatch(/SIGILOS/);
  });

  it('os corpos de erro e de "não encontrado" não repetem o valor lido', async () => {
    for (const result of [{ code: 'NOT_FOUND' }, { code: 'ACCESS_DENIED' }, { code: 'VALIDATION_FAILED' }]) {
      const response = await createQueryCylindersHandler(gateway(result))(post(resolve));
      expect(JSON.stringify(await response.json())).not.toMatch(/SIGILOS/);
    }
    const invalid = await createQueryCylindersHandler(gateway({ code: 'FOUND' }))(post({ ...resolve, candidates: [`${VALOR_LIDO}\n`] }));
    expect(invalid.status).toBe(400);
    expect(JSON.stringify(await invalid.json())).not.toMatch(/SIGILOS/);
  });
});

describe('o código das funções não registra nada', () => {
  const files = ['supabase/functions/query-cylinders/handler.ts', 'supabase/functions/query-cylinders/index.ts', 'supabase/functions/_shared/operations.ts', 'supabase/functions/_shared/cylinders.ts'];

  it.each(files)('%s não usa console', (file) => {
    expect(fs.readFileSync(path.join(ROOT, file), 'utf8')).not.toMatch(/\bconsole\./);
  });
});
