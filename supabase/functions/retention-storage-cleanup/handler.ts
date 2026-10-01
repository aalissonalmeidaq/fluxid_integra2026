import { json, preflight, sha256Hex } from '../_shared/http.ts';

export interface CleanupItem { bucket: string; path: string }

export interface CleanupGateway {
  // Segredo configurado no servidor; ausente ou vazio faz a função falhar fechada.
  secret(): string | undefined;
  takeBatch(limit: number): Promise<CleanupItem[]>;
  removeObjects(bucket: string, paths: string[]): Promise<void>;
  complete(paths: string[]): Promise<number>;
}

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

// Comparação em tempo constante sobre os resumos dos dois valores, para o tamanho e o prefixo não vazarem.
async function sameSecret(provided: string, expected: string): Promise<boolean> {
  const [left, right] = await Promise.all([sha256Hex(provided), sha256Hex(expected)]);
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

function parseLimit(body: unknown): number {
  const limit = body && typeof body === 'object' ? (body as Record<string, unknown>).limit : undefined;
  return Number.isInteger(limit) ? Math.min(Math.max(Number(limit), 1), MAX_LIMIT) : DEFAULT_LIMIT;
}

// Remove do Storage os objetos enfileirados pela anonimização e só então conclui os itens. Um item que falha permanece na
// fila para a próxima execução; a resposta informa apenas contagens, nunca caminhos (AUD-009).
export function createRetentionCleanupHandler(gateway: CleanupGateway) {
  return async (request: Request): Promise<Response> => {
    if (request.method === 'OPTIONS') return preflight();
    if (request.method !== 'POST') return json({ code: 'METHOD_NOT_ALLOWED' }, 405);

    const expected = gateway.secret();
    if (!expected) return json({ code: 'SERVICE_UNAVAILABLE' }, 503);
    const provided = request.headers.get('x-retention-secret') ?? '';
    if (!provided || !(await sameSecret(provided, expected))) return json({ code: 'AUTH_REQUIRED' }, 401);

    const limit = parseLimit(await request.json().catch(() => null));
    let batch: CleanupItem[];
    try {
      batch = await gateway.takeBatch(limit);
    } catch {
      return json({ code: 'SERVICE_UNAVAILABLE' }, 503);
    }

    const byBucket = new Map<string, string[]>();
    for (const { bucket, path } of batch) byBucket.set(bucket, [...(byBucket.get(bucket) ?? []), path]);

    let removed = 0;
    let failed = 0;
    for (const [bucket, paths] of byBucket) {
      try {
        await gateway.removeObjects(bucket, paths);
        await gateway.complete(paths);
        removed += paths.length;
      } catch {
        failed += paths.length;
      }
    }
    return json({ code: 'CLEANUP_DONE', removed, failed });
  };
}
