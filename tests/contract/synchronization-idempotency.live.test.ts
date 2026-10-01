// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { OfflineOperationPolicy } from '../../src/infrastructure/synchronization/offline-operation-policy';

// Contrato do endpoint idempotente (T032). Exige o Supabase local em execução com o seed determinístico.
// A operação abaixo é exclusiva do harness: não integra a allowlist e não pode ser enfileirada pela PWA.
const SYNTHETIC_OPERATION = 'harness.synthetic';
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_LOCAL_URL ?? 'http://127.0.0.1:54321';
const PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_LOCAL_PUBLISHABLE_KEY ?? '';

const ORG_A = '20000000-0000-0000-0000-00000000000a';
const ORG_B = '20000000-0000-0000-0000-00000000000b';

interface CommandResponse {
  status: number;
  body: { status?: string; result_code?: string; result?: unknown; error?: string };
}

async function signIn(email: string, password: string): Promise<SupabaseClient> {
  const client = createClient(SUPABASE_URL, PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`Falha ao autenticar usuário sintético: ${error.message}`);
  return client;
}

async function sendCommand(
  client: SupabaseClient,
  organizationId: string,
  idempotencyKey: string,
  payload: Record<string, unknown> = { value: 'a' },
): Promise<CommandResponse> {
  const { data } = await client.auth.getSession();
  const response = await fetch(`${SUPABASE_URL}/functions/v1/sync-command`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      apikey: PUBLISHABLE_KEY,
      authorization: `Bearer ${data.session?.access_token ?? ''}`,
    },
    body: JSON.stringify({
      organization_id: organizationId,
      device_id: 'device-test',
      idempotency_key: idempotencyKey,
      operation: SYNTHETIC_OPERATION,
      payload,
      version: 1,
    }),
  });
  return { status: response.status, body: await response.json() };
}

describe('Contrato de idempotência da sincronização (T032)', () => {
  let clientA: SupabaseClient;
  let clientB: SupabaseClient;

  beforeAll(async () => {
    clientA = await signIn('admin-a@example.invalid', 'Local-only-002!');
    clientB = await signIn('admin-b@example.invalid', 'Local-only-003!');
  });

  it('processa a primeira chamada da operação sintética como criada', async () => {
    const { status, body } = await sendCommand(clientA, ORG_A, crypto.randomUUID());

    expect(status).toBe(200);
    expect(body.status).toBe('created');
  });

  it('retorna o mesmo resultado estável na repetição', async () => {
    const key = crypto.randomUUID();
    const first = await sendCommand(clientA, ORG_A, key);
    const second = await sendCommand(clientA, ORG_A, key);

    expect(second.status).toBe(200);
    expect(second.body.status).toBe('replayed');
    expect(second.body.result_code).toBe(first.body.result_code);
    expect(second.body.result).toEqual(first.body.result);
  });

  it('rejeita payload divergente para a mesma chave', async () => {
    const key = crypto.randomUUID();
    await sendCommand(clientA, ORG_A, key, { value: 'primeiro' });
    const { status, body } = await sendCommand(clientA, ORG_A, key, { value: 'segundo' });

    expect(status).toBe(409);
    expect(body.error).toBe('idempotency_payload_conflict');
  });

  it('nega tenant adulterado sem revelar dados do outro tenant', async () => {
    const { status, body } = await sendCommand(clientA, ORG_B, crypto.randomUUID());

    expect(status).toBe(403);
    expect(body).toEqual({ error: 'tenant_actor_mismatch' });
  });

  it('nega requisição sem autenticação válida', async () => {
    const anonymous = createClient(SUPABASE_URL, PUBLISHABLE_KEY, { auth: { persistSession: false } });
    const { status, body } = await sendCommand(anonymous, ORG_A, crypto.randomUUID());

    expect(status).toBe(401);
    expect(JSON.stringify(body)).not.toMatch(/token|secret/i);
  });

  it('isola a mesma chave entre tenants como operações independentes', async () => {
    const key = crypto.randomUUID();
    const a = await sendCommand(clientA, ORG_A, key);
    const b = await sendCommand(clientB, ORG_B, key);

    expect(a.body.status).toBe('created');
    expect(b.status).toBe(200);
    expect(b.body.status).toBe('created');
  });

  it('resolve concorrência real com uma única criação e as demais como replay', async () => {
    const key = crypto.randomUUID();
    const responses = await Promise.all(Array.from({ length: 5 }, () => sendCommand(clientA, ORG_A, key)));

    expect(responses.every((response) => response.status === 200)).toBe(true);
    expect(responses.filter((response) => response.body.status === 'created')).toHaveLength(1);
    expect(responses.filter((response) => response.body.status === 'replayed')).toHaveLength(4);
  });

  it('mantém a operação sintética fora da allowlist da PWA', () => {
    const policy = new OfflineOperationPolicy();

    expect(policy.isAllowed(SYNTHETIC_OPERATION)).toBe(false);
    expect(() => policy.assertAllowed(SYNTHETIC_OPERATION)).toThrow();
    expect(policy.allowedOperations()).toHaveLength(0);
  });
});
