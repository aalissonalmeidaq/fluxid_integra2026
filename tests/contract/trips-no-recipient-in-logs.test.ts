// @vitest-environment node
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createManageTripsHandler } from '../../supabase/functions/manage-trips/handler';
import { createQueryTripsHandler } from '../../supabase/functions/query-trips/handler';
import type { OperationsGateway } from '../../supabase/functions/_shared/operations';

// Spec 008 (RF-017, RF-032, CA-007): o nome e a função do recebedor nunca aparecem em log, evento, auditoria, URL, mensagem de erro ou
// cache. Aqui se prova o lado do código: os manipuladores não registram corpo nem resposta, e nenhum log nem gravação de evento ou
// auditoria recebe `recipient_name` ou `recipient_role`. O lado do banco é provado em supabase/tests/008_history_audit.test.sql.
const ROOT = path.resolve(import.meta.dirname, '../..');
const NAME = 'Nome-sigiloso-do-recebedor';
const ROLE = 'Funcao-sigilosa-do-recebedor';

const gateway = (result: Record<string, unknown>): OperationsGateway & { audit: ReturnType<typeof vi.fn> } => ({
  authenticate: vi.fn(async () => ({ userId: '10000000-0000-4000-8000-000000000002', sessionId: '60000000-0000-4000-8000-0000000800a2', aal: 'aal1' as const })),
  rpc: vi.fn(async () => result),
  audit: vi.fn(async () => undefined),
}) as never;
const post = (body: unknown) => new Request('http://local/fn', { method: 'POST', headers: { authorization: 'Bearer jwt', 'content-type': 'application/json' }, body: JSON.stringify(body) });
const delivery = {
  operation: 'register_delivery', organization_id: '20000000-0000-4000-8000-00000000000a', request_id: 'a0000000-0000-4000-8000-000000000001', trip_id: '99000000-0000-4000-8000-000000000001',
  stop_id: '9a000000-0000-4000-8000-000000000001', delivered_at: '2026-10-09T15:30:00Z', recipient_name: NAME, recipient_role: ROLE, results: [{ item_id: '9b000000-0000-4000-8000-000000000001', delivered: true }],
};

afterEach(() => vi.restoreAllMocks());

describe('os manipuladores não registram corpo nem resposta', () => {
  it.each(['log', 'info', 'warn', 'error', 'debug'] as const)('console.%s nunca recebe o nome nem a função', async (method) => {
    const spy = vi.spyOn(console, method).mockImplementation(() => undefined);
    for (const result of [{ code: 'DELIVERED', delivery_id: 'x', stop_status: 'delivered' }, { code: 'ACCESS_DENIED' }, { code: 'VALIDATION_FAILED' }]) {
      await createManageTripsHandler(gateway(result))(post(delivery));
    }
    const failing: OperationsGateway = { ...gateway({}), rpc: vi.fn(async () => { throw new Error('rpc_failed'); }) };
    await createManageTripsHandler(failing)(post(delivery));
    await createQueryTripsHandler(gateway({ code: 'FOUND', deliveries: [{ recipient_name: NAME }] }))(post({ operation: 'get_trip', organization_id: delivery.organization_id, trip_id: delivery.trip_id }));
    expect(JSON.stringify(spy.mock.calls)).not.toMatch(/sigiloso|sigilosa/);
  });

  it('a auditoria da borda leva só ação, resultado e motivo', async () => {
    for (const result of [{ code: 'ACCESS_DENIED' }]) {
      const gw = gateway(result);
      await createManageTripsHandler(gw)(post(delivery));
      expect(JSON.stringify(gw.audit.mock.calls)).not.toMatch(/sigiloso|sigilosa/);
      expect(Object.keys(gw.audit.mock.calls[0]![0] as object).sort()).toEqual(['action', 'actorId', 'reason', 'result']);
    }
  });

  it('a resposta de erro não repete o corpo enviado', async () => {
    for (const result of [{ code: 'VALIDATION_FAILED' }, { code: 'INVALID_TRANSITION', from: 'pending', to: 'delivered' }, { code: 'STOP_CLOSED' }]) {
      const response = await createManageTripsHandler(gateway(result))(post(delivery));
      expect(JSON.stringify(await response.json())).not.toMatch(/sigiloso|sigilosa/);
    }
  });
});

describe('varredura do código-fonte', () => {
  const read = (relative: string): string => fs.readFileSync(path.join(ROOT, relative), 'utf8');
  const walk = (dir: string): string[] => fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((entry) => {
    const child = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(child);
    return /\.(ts|tsx|sql)$/.test(entry.name) && !/\.test\.|support|fixtures/.test(child) ? [child.split(path.sep).join('/')] : [];
  });

  it('nenhum console.* das funções, do serviço e das telas de viagem menciona o recebedor', () => {
    const files = [...walk('supabase/functions/manage-trips'), ...walk('supabase/functions/query-trips'), ...walk('src/application/trips'), ...walk('src/pages/trips')];
    for (const file of files) {
      for (const line of read(file).split('\n')) {
        if (/console\.(log|info|warn|error|debug)/.test(line)) expect(line, file).not.toMatch(/recipient|recebedor/i);
      }
    }
  });

  it('as migrations de viagem nunca passam o nome ou a função do recebedor a evento ou auditoria', () => {
    const migrations = fs.readdirSync(path.join(ROOT, 'supabase/migrations')).filter((name) => /_trips_/.test(name));
    expect(migrations.length).toBeGreaterThan(5);
    for (const name of migrations) {
      const text = read(`supabase/migrations/${name}`);
      // Cada chamada de append_trip_event, append_cylinder_event e write_audit_event, até o ponto e vírgula, não cita o recebedor.
      for (const call of text.match(/perform private\.(append_trip_event|append_cylinder_event|write_audit_event)\([\s\S]*?\);/g) ?? []) {
        expect(call, name).not.toMatch(/p_recipient|v_name|v_role|recipient_name|recipient_role|p_latitude|p_longitude/);
      }
    }
  });

  it('o nome do recebedor só existe como coluna de trip_deliveries', () => {
    const owners = fs.readdirSync(path.join(ROOT, 'supabase/migrations')).filter((name) => /_trips_/.test(name))
      .filter((name) => /recipient_name/.test(read(`supabase/migrations/${name}`)));
    expect(owners.sort()).toEqual(['20261009120000_trips_schema.sql', '20261009120310_trips_plan_read.sql', '20261009120500_trips_delivery.sql']);
  });

  it('nenhum estado do cliente nem URL guarda o nome do recebedor', () => {
    for (const file of walk('src')) {
      const text = read(file);
      if (!/recipient/i.test(text)) continue;
      expect(text, file).not.toMatch(/(localStorage|sessionStorage|indexedDB|history\.(push|replace)State|URLSearchParams|searchParams)[^;\n]*recipient/i);
    }
  }, 30_000);
});
