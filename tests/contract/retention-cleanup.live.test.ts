// @vitest-environment node
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// Limpeza de objetos da retenção contra o runtime real de Edge Functions (contracts/retention-cleanup.md).
// Prova o que os testes do handler não provam: que o gateway deixa passar uma chamada de agendador (apikey público e
// segredo, sem Authorization de usuário) e que
// a função continua fechada sem o segredo. O segredo local vem de RETENTION_JOB_SECRET ou de supabase/.env (não versionado).
const URL = 'http://127.0.0.1:54321/functions/v1/retention-storage-cleanup';
const KEY = import.meta.env.VITE_SUPABASE_LOCAL_PUBLISHABLE_KEY as string | undefined;

function localSecret(): string | undefined {
  if (process.env.RETENTION_JOB_SECRET) return process.env.RETENTION_JOB_SECRET;
  try {
    const file = fs.readFileSync(path.resolve(import.meta.dirname, '../../supabase/.env'), 'utf8');
    return /^RETENTION_JOB_SECRET=(.+)$/m.exec(file)?.[1]?.trim();
  } catch {
    return undefined;
  }
}

const SECRET = localSecret();

async function call(headers: Record<string, string>, method = 'POST', body: unknown = {}) {
  const response = await fetch(URL, { method, headers: { 'content-type': 'application/json', apikey: KEY ?? '', ...headers }, body: method === 'POST' ? JSON.stringify(body) : undefined });
  return { status: response.status, body: await response.json().catch(() => null) as Record<string, unknown> | null };
}

describe.skipIf(!KEY)('retention-storage-cleanup live', () => {
  it('sem o cabeçalho de segredo responde 401 e não expõe nada', async () => {
    const result = await call({});
    expect(result.status).toBe(401);
    expect(JSON.stringify(result.body)).not.toMatch(/path|bucket|removed/);
  });

  it('com segredo errado responde 401', async () => {
    expect((await call({ 'x-retention-secret': crypto.randomUUID() })).status).toBe(401);
  });

  it('rejeita métodos que não sejam POST', async () => {
    expect((await call({ 'x-retention-secret': SECRET ?? 'x' }, 'GET')).status).toBe(405);
  });

  it.skipIf(!SECRET)('com o segredo correto e sem JWT executa e devolve apenas contagens', async () => {
    const result = await call({ 'x-retention-secret': SECRET! }, 'POST', { limit: 5 });
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ code: 'CLEANUP_DONE' });
    expect(Number.isInteger(result.body?.removed)).toBe(true);
    expect(Number.isInteger(result.body?.failed)).toBe(true);
    expect(Object.keys(result.body ?? {}).sort()).toEqual(['code', 'failed', 'removed']);
  });

  it('sem segredo configurado neste ambiente, o teste do caminho feliz não roda e isso fica explícito', () => {
    // Se falhar aqui, defina RETENTION_JOB_SECRET em supabase/.env (ver quickstart) e reinicie o Supabase local.
    expect(SECRET, 'RETENTION_JOB_SECRET ausente: o caminho feliz ao vivo não foi exercitado').toBeTruthy();
  });
});
