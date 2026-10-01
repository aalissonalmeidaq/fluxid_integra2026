import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export interface SyncCommandResult {
  status: 'created' | 'replayed';
  result_code: string;
  result: Record<string, unknown>;
}

interface AuthenticatedActor { actorId: string }
interface ProcessInput {
  organizationId: string;
  idempotencyKey: string;
  actorId: string;
  operation: string;
  requestHash: string;
}

export interface SyncCommandGateway {
  authenticate(request: Request): Promise<AuthenticatedActor>;
  process(input: ProcessInput): Promise<SyncCommandResult>;
}

interface SyncCommandBody {
  organization_id: string;
  idempotency_key: string;
  operation: string;
  version: number;
  device_id: string;
  payload: Record<string, unknown>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const OPERATION = /^[a-z][a-z0-9_-]*\.[a-z][a-z0-9_-]*$/;

function json(body: unknown, status: number): Response {
  return Response.json(body, { status, headers: { 'cache-control': 'no-store' } });
}

function parseBody(value: unknown): SyncCommandBody {
  if (!value || typeof value !== 'object') throw new Error('invalid_sync_command');
  const body = value as Partial<SyncCommandBody>;
  if (!UUID.test(body.organization_id ?? '') || !UUID.test(body.idempotency_key ?? '') ||
      !OPERATION.test(body.operation ?? '') || !Number.isSafeInteger(body.version) ||
      (body.version ?? 0) < 1 || typeof body.device_id !== 'string' || body.device_id.length < 1 ||
      !body.payload || typeof body.payload !== 'object' || Array.isArray(body.payload)) {
    throw new Error('invalid_sync_command');
  }
  return body as SyncCommandBody;
}

function canonicalize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonicalize(item)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

async function sha256(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalize(value));
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
    .map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function createSyncCommandHandler(gateway: SyncCommandGateway) {
  return async (request: Request): Promise<Response> => {
    if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
    try {
      const actor = await gateway.authenticate(request);
      const body = parseBody(await request.json());
      const requestHash = await sha256(body);
      const result = await gateway.process({
        organizationId: body.organization_id,
        idempotencyKey: body.idempotency_key,
        actorId: actor.actorId,
        operation: body.operation,
        requestHash,
      });
      return json(result, 200);
    } catch (error) {
      const code = error instanceof Error ? error.message : 'sync_command_failed';
      if (code === 'tenant_actor_mismatch') return json({ error: code }, 403);
      if (code === 'idempotency_payload_conflict') return json({ error: code }, 409);
      if (code === 'invalid_sync_command') return json({ error: code }, 400);
      if (code === 'invalid_authentication') return json({ error: code }, 401);
      return json({ error: 'sync_command_failed' }, 500);
    }
  };
}

export function createSupabaseGateway(url: string, publishableKey: string, serviceRoleKey: string): SyncCommandGateway {
  return {
    async authenticate(request) {
      const authorization = request.headers.get('authorization');
      if (!authorization?.startsWith('Bearer ')) throw new Error('invalid_authentication');
      const client = createClient(url, publishableKey, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } });
      const { data, error } = await client.auth.getUser();
      if (error || !data.user) throw new Error('invalid_authentication');
      return { actorId: data.user.id };
    },
    async process(input) {
      const admin: SupabaseClient = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
      const { data, error } = await admin.rpc('process_sync_command', {
        requested_organization_id: input.organizationId,
        requested_idempotency_key: input.idempotencyKey,
        requested_actor_user_id: input.actorId,
        requested_operation: input.operation,
        requested_hash: input.requestHash,
      });
      if (error) throw new Error(error.message);
      return data as SyncCommandResult;
    },
  };
}

function environment(name: string, required = true): string {
  const runtime = globalThis as typeof globalThis & { Deno?: { env: { get(key: string): string | undefined } } };
  const value = runtime.Deno?.env.get(name);
  if (!value && required) throw new Error('server_configuration_error');
  return value ?? '';
}

export default {
  fetch(request: Request): Promise<Response> {
    const gateway = createSupabaseGateway(
      environment('SUPABASE_URL'),
      environment('SUPABASE_PUBLISHABLE_KEY', false) || environment('SUPABASE_ANON_KEY'),
      environment('SUPABASE_SERVICE_ROLE_KEY'),
    );
    return createSyncCommandHandler(gateway)(request);
  },
};
