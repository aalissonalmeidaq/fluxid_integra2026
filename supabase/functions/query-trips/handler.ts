import { json, UUID_PATTERN } from '../_shared/http.ts';
import { createOperationsHandler, type OperationSpec, type OperationsGateway, type Rule } from '../_shared/operations.ts';

export type { OperationsGateway } from '../_shared/operations.ts';

// Consultas somente leitura das viagens da Fase 4 (contracts/operacoes-servidor.md). Sem auditoria de sucesso; negações são
// auditadas. O nome do recebedor só sai a quem tem `trip.recipient`: isso é garantido na RPC, nunca aqui.
const search: Rule = { t: 'text', max: 200, nullable: true, optional: true };
const cursor: Rule = { t: 'text', max: 400, nullable: true, optional: true };
const limit: Rule = { t: 'int', min: 1, max: 100, optional: true };
const STATUSES = ['open', 'planned', 'loading', 'in_progress', 'completed', 'cancelled', 'all'] as const;

export const QUERY_OPERATIONS: Record<string, OperationSpec> = {
  list_trips: {
    rpc: 'list_trips',
    fields: {
      search: [search, 'p_search'],
      status: [{ t: 'enum', values: STATUSES, optional: true }, 'p_status'],
      from: [{ t: 'date', optional: true }, 'p_from'],
      to: [{ t: 'date', optional: true }, 'p_to'],
      vehicle_id: [{ t: 'uuid', optional: true }, 'p_vehicle'],
      driver_id: [{ t: 'uuid', optional: true }, 'p_driver'],
      customer_id: [{ t: 'uuid', optional: true }, 'p_customer'],
      custody: [{ t: 'enum', values: ['in_organization', 'in_transit', 'at_customer'], optional: true }, 'p_custody'],
      sort: [{ t: 'enum', values: ['number_desc', 'number_asc', 'date_desc', 'date_asc'], optional: true }, 'p_sort'],
      cursor: [cursor, 'p_cursor'],
      limit: [limit, 'p_limit'],
    },
  },
  get_trip: { rpc: 'get_trip', fields: { trip_id: [{ t: 'uuid' }, 'p_trip'] } },
  // Spec 010: a viagem para guardar no aparelho e operar offline (identificadores ativos normalizados; nunca recebedor, coordenadas nem anexos).
  get_trip_offline: { rpc: 'query_trip_offline', fields: { trip_id: [{ t: 'uuid' }, 'p_trip'] } },
  // Spec 010: a trilha de sincronização da viagem (resultado de cada operação vinda da fila), só para quem pode ver o histórico; nenhum dado sensível.
  list_sync_events: { rpc: 'query_sync_events', fields: { trip_id: [{ t: 'uuid' }, 'p_trip'], limit: [limit, 'p_limit'], before: [{ t: 'int', min: 1, optional: true }, 'p_before'] } },
  trip_options: { rpc: 'trip_options', fields: { search: [search, 'p_search'] } },
  trip_history: {
    rpc: 'trip_history',
    fields: {
      trip_id: [{ t: 'uuid' }, 'p_trip'],
      event_type: [{ t: 'text', max: 40, nullable: true, optional: true }, 'p_event_type'],
      from: [{ t: 'date', optional: true }, 'p_from'],
      to: [{ t: 'date', optional: true }, 'p_to'],
      order: [{ t: 'enum', values: ['asc', 'desc'], optional: true }, 'p_order'],
      cursor: [cursor, 'p_cursor'],
      limit: [limit, 'p_limit'],
    },
  },
  trips_of_cylinder: {
    rpc: 'trips_of_cylinder',
    fields: { cylinder_id: [{ t: 'uuid' }, 'p_cylinder'], cursor: [cursor, 'p_cursor'], limit: [limit, 'p_limit'] },
  },
  trips_of_site: {
    rpc: 'trips_of_site',
    fields: { site_id: [{ t: 'uuid' }, 'p_site'], cursor: [cursor, 'p_cursor'], limit: [limit, 'p_limit'] },
  },
  list_eligible_cylinders: {
    rpc: 'list_eligible_cylinders',
    fields: {
      search: [search, 'p_search'],
      cylinder_type_id: [{ t: 'uuid', optional: true }, 'p_type'],
      cursor: [cursor, 'p_cursor'],
      limit: [limit, 'p_limit'],
    },
  },
};

// URL assinada de um anexo (Spec 010, RF-022): a vida é de 60 segundos e o caminho nunca sai da borda.
export const ATTACHMENT_URL_TTL_SECONDS = 60;
export interface AttachmentStorage {
  signUrl(path: string, ttlSeconds: number): Promise<string | null>;
}

const bearer = (request: Request) => request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1] ?? null;
const isObject = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

// `get_attachment_url` e a junção dos anexos ao `get_trip` ficam aqui, na borda: a RPC confere a permissão do tipo (foto: trip.read, assinatura: trip.recipient) e
// devolve o caminho, que só é usado para assinar a URL. Anexo de outra organização, sem permissão ou inexistente responde igual: "não encontrado".
export function createQueryTripsHandler(source: OperationsGateway, storage?: AttachmentStorage) {
  return async (request: Request): Promise<Response> => {
    // Uma só autenticação por pedido: o detalhe da viagem e a consulta dos anexos, que correm juntos, compartilham a mesma resposta do Auth.
    const identities = new Map<string, ReturnType<OperationsGateway['authenticate']>>();
    const gateway: OperationsGateway = {
      ...source,
      authenticate: (token) => {
        let pending = identities.get(token);
        if (!pending) { pending = source.authenticate(token); identities.set(token, pending); }
        return pending;
      },
      rpc: (name, args) => source.rpc(name, args),
      audit: (event) => source.audit(event),
    };
    const base = createOperationsHandler(gateway, QUERY_OPERATIONS, { prefix: 'trip' });
    if (request.method !== 'POST') return base(request);
    const body = await request.clone().json().catch(() => null) as unknown;
    const operation = isObject(body) && typeof body.operation === 'string' ? body.operation : '';
    if (operation === 'get_attachment_url') return attachmentUrl(gateway, storage, request, body as Record<string, unknown>);
    if (operation !== 'get_trip') return base(request);
    // Os anexos são pedidos ao mesmo tempo que o detalhe: a junção não soma a espera da segunda consulta.
    const [response, attached] = await Promise.all([base(request), attachmentsOf(gateway, request, body as Record<string, unknown>)]);
    return response.status === 200 ? mergeAttachments(response, attached) : response;
  };
}

async function attachmentUrl(gateway: OperationsGateway, storage: AttachmentStorage | undefined, request: Request, body: Record<string, unknown>): Promise<Response> {
  const token = bearer(request);
  if (!token) return json({ code: 'AUTH_REQUIRED' }, 401);
  const identity = await gateway.authenticate(token).catch(() => null);
  if (!identity) return json({ code: 'AUTH_REQUIRED' }, 401);
  const organization = body.organization_id;
  const attachment = body.attachment_id;
  if (typeof organization !== 'string' || !UUID_PATTERN.test(organization) || typeof attachment !== 'string' || !UUID_PATTERN.test(attachment)) {
    return json({ code: 'VALIDATION_FAILED', fields: [{ field: 'attachment_id', message: 'Identificador inválido.' }] }, 400);
  }
  try {
    const target = await gateway.rpc('query_attachment_target', { p_actor: identity.userId, p_session: identity.sessionId, p_organization: organization, p_attachment: attachment });
    if (target.code !== 'OK' || typeof target.storage_path !== 'string') return json({ code: 'NOT_FOUND' }, 404);
    const url = storage ? await storage.signUrl(target.storage_path, ATTACHMENT_URL_TTL_SECONDS) : null;
    if (!url) return json({ code: 'SERVICE_UNAVAILABLE' }, 503);
    return json({ code: 'FOUND', url, expires_at: new Date(Date.now() + ATTACHMENT_URL_TTL_SECONDS * 1000).toISOString() });
  } catch {
    return json({ code: 'SERVICE_UNAVAILABLE' }, 503);
  }
}

// Consulta os anexos da viagem (contagem de fotos, assinatura e a lista que a pessoa pode ver, sem caminho). Falha ou negação devolve nulo: o detalhe segue sem eles.
async function attachmentsOf(gateway: OperationsGateway, request: Request, body: Record<string, unknown>): Promise<Record<string, unknown> | null> {
  try {
    const token = bearer(request);
    const identity = token ? await gateway.authenticate(token) : null;
    if (!identity) return null;
    const attached = await gateway.rpc('query_trip_attachments', {
      p_actor: identity.userId, p_session: identity.sessionId, p_organization: body.organization_id, p_trip: body.trip_id,
    });
    return attached.code === 'OK' && Array.isArray(attached.deliveries) ? attached : null;
  } catch {
    return null;
  }
}

// Junta ao detalhe da viagem, por entrega, o que veio da consulta dos anexos. Nunca atrasa nem derruba a leitura da viagem.
async function mergeAttachments(response: Response, attached: Record<string, unknown> | null): Promise<Response> {
  if (!attached) return response;
  try {
    const detail = await response.clone().json() as Record<string, unknown>;
    if (!Array.isArray(detail.deliveries)) return response;
    const byDelivery = new Map<string, Record<string, unknown>>();
    for (const entry of attached.deliveries as Record<string, unknown>[]) if (typeof entry.delivery_id === 'string') byDelivery.set(entry.delivery_id, entry);
    const deliveries = (detail.deliveries as Record<string, unknown>[]).map((delivery) => {
      const found = typeof delivery.id === 'string' ? byDelivery.get(delivery.id) : undefined;
      return { ...delivery, photo_count: found?.photo_count ?? 0, has_signature: found?.has_signature ?? false, attachments: found?.attachments ?? [] };
    });
    return json({ ...detail, deliveries }, 200);
  } catch {
    return response;
  }
}
