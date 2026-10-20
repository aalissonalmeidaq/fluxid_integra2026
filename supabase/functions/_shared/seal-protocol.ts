// Contrato das mensagens do lacre (Spec 012, contracts/mensagens-do-lacre.md). Sem dependência de Deno: o Vitest importa este
// arquivo e os exemplos de tests/fixtures/seal-protocol são validados por ele. O corpo inteiro só é recusado quando não dá para
// responder item por item (sem lista, mais de 50, message_id inválido, protocolo); os demais problemas recusam só o item, para o
// resto do envio seguir (RF-004).

export const SEAL_PROTOCOLS = [1] as const;
export const BATCH_MAX = 50;
export const MESSAGE_TYPES = ['position', 'event', 'alert', 'command_result', 'activation', 'shutdown', 'network_change', 'auto_lock'] as const;
export type MessageType = (typeof MESSAGE_TYPES)[number];

const EVENT_CODES = ['boot', 'button', 'valve_moved', 'wifi_fallback_default', 'networks_forgotten'] as const;
const ALERT_CODES = ['low_battery', 'weak_signal', 'seal_open', 'seal_broken'] as const;
const RESULT_REASONS = ['wifi_not_found', 'wifi_auth', 'wifi_no_internet', 'actuator', 'unknown'] as const;
const SEAL_STATES = ['closed', 'open', 'broken', 'unknown'] as const;
const QUALITIES = ['gps', 'last_known'] as const;

const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,6})?)?(Z|[+-]\d{2}:\d{2})$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ItemProblem = 'invalid_field' | null;
export interface ParsedMessage {
  message_id: string;
  type: string;
  read_at: string | null;
  // Os campos aceitos do tipo, normalizados (sem campos extras); vazio quando o item foi recusado.
  data: Record<string, unknown>;
  problem: ItemProblem;
}
export interface ParsedRequest {
  protocol: number;
  firmware_version: string | null;
  watch_version: number;
  messages: ParsedMessage[];
}
export type RequestResult = { ok: true; value: ParsedRequest } | { ok: false; error: 'invalid_body' | 'unsupported_protocol' };

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isInt = (v: unknown, min: number, max: number): v is number => Number.isInteger(v) && (v as number) >= min && (v as number) <= max;
const isNum = (v: unknown, min: number, max: number): v is number => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
const isText = (v: unknown, min: number, max: number): v is string => typeof v === 'string' && v.length >= min && v.length <= max;
const oneOf = <T extends string>(v: unknown, values: readonly T[]): v is T => typeof v === 'string' && (values as readonly string[]).includes(v);
const isInstant = (v: unknown): v is string => typeof v === 'string' && INSTANT.test(v) && !Number.isNaN(Date.parse(v));
const bytes = (v: string) => new TextEncoder().encode(v).length;
const isSsid = (v: unknown): v is string => typeof v === 'string' && bytes(v) >= 1 && bytes(v) <= 32;

class Invalid extends Error {}
const need = (cond: boolean): void => { if (!cond) throw new Invalid(); };

function wifi(v: unknown): Record<string, unknown> {
  need(isObject(v));
  const w = v as Record<string, unknown>;
  need(isSsid(w.ssid) && oneOf(w.kind, ['default', 'list'] as const) && isInt(w.rssi, -127, 0));
  return { ssid: w.ssid, kind: w.kind, rssi: w.rssi };
}

function position(m: Record<string, unknown>): Record<string, unknown> {
  need(isNum(m.latitude, -90, 90) && isNum(m.longitude, -180, 180) && oneOf(m.quality, QUALITIES));
  need(m.accuracy_m === undefined || m.accuracy_m === null || isNum(m.accuracy_m, 0, 100000));
  // Bateria `null`: o lacre não tem a medição ligada (sem divisor na placa); nunca um valor inventado.
  need((m.battery_pct === null || isInt(m.battery_pct, 0, 100)) && isInt(m.signal_dbm, -127, 0) && oneOf(m.seal_state, SEAL_STATES));
  const out: Record<string, unknown> = {
    latitude: m.latitude, longitude: m.longitude, quality: m.quality, accuracy_m: m.accuracy_m ?? null,
    battery_pct: m.battery_pct, signal_dbm: m.signal_dbm, seal_state: m.seal_state,
  };
  if (m.wifi !== undefined && m.wifi !== null) out.wifi = wifi(m.wifi);
  need(m.available_networks === undefined || (Array.isArray(m.available_networks) && m.available_networks.length <= 30));
  if (Array.isArray(m.available_networks)) {
    out.available_networks = m.available_networks.map((item) => {
      need(isObject(item) && isSsid(item.ssid) && isInt(item.rssi, -127, 0));
      return { ssid: item.ssid, rssi: item.rssi };
    });
  }
  return out;
}

function fields(type: MessageType, m: Record<string, unknown>): Record<string, unknown> {
  switch (type) {
    case 'position':
    case 'shutdown':
      return position(m);
    case 'activation':
      need(oneOf(m.valve, ['open', 'closed'] as const));
      return { ...position(m), valve: m.valve };
    case 'auto_lock':
      need(isInstant(m.locked_at));
      return { ...position(m), locked_at: m.locked_at };
    case 'event':
      need(oneOf(m.code, EVENT_CODES) && (m.detail === undefined || m.detail === null || isText(m.detail, 0, 200)));
      return { code: m.code, detail: m.detail ?? null };
    case 'alert':
      need(oneOf(m.code, ALERT_CODES) && (m.value === undefined || m.value === null || isNum(m.value, -1000, 1000)));
      return { code: m.code, value: m.value ?? null };
    case 'command_result':
      need(typeof m.command_id === 'string' && UUID.test(m.command_id) && oneOf(m.result, ['executed', 'error'] as const));
      need(m.reason === undefined || m.reason === null || oneOf(m.reason, RESULT_REASONS));
      return { command_id: (m.command_id as string).toLowerCase(), result: m.result, reason: m.reason ?? null };
    case 'network_change':
      need(Array.isArray(m.saved) && m.saved.length <= 5 && m.saved.every(isSsid));
      return { wifi: wifi(m.wifi), saved: m.saved };
  }
}

function message(raw: unknown): ParsedMessage {
  if (!isObject(raw) || !isText(raw.message_id, 1, 64)) throw new Invalid();
  const base = { message_id: raw.message_id, type: typeof raw.type === 'string' ? raw.type : '', read_at: isInstant(raw.read_at) ? raw.read_at : null };
  if (!oneOf(raw.type, MESSAGE_TYPES) || base.read_at === null) return { ...base, data: {}, problem: 'invalid_field' };
  try {
    return { ...base, data: fields(raw.type, raw), problem: null };
  } catch (error) {
    if (error instanceof Invalid) return { ...base, data: {}, problem: 'invalid_field' };
    throw error;
  }
}

export function parseSealRequest(body: unknown): RequestResult {
  if (!isObject(body) || !Number.isInteger(body.protocol)) return { ok: false, error: 'invalid_body' };
  if (!(SEAL_PROTOCOLS as readonly number[]).includes(body.protocol as number)) return { ok: false, error: 'unsupported_protocol' };
  const messages = body.messages;
  if (!Array.isArray(messages) || messages.length < 1 || messages.length > BATCH_MAX) return { ok: false, error: 'invalid_body' };
  if (body.watch_version !== undefined && !isInt(body.watch_version, 0, 2_147_483_647)) return { ok: false, error: 'invalid_body' };
  if (body.firmware_version !== undefined && body.firmware_version !== null && !isText(body.firmware_version, 1, 40)) {
    return { ok: false, error: 'invalid_body' };
  }
  try {
    return {
      ok: true,
      value: {
        protocol: body.protocol as number,
        firmware_version: (body.firmware_version as string | undefined) ?? null,
        watch_version: (body.watch_version as number | undefined) ?? 0,
        messages: messages.map(message),
      },
    };
  } catch (error) {
    if (error instanceof Invalid) return { ok: false, error: 'invalid_body' };
    throw error;
  }
}

// Resposta 200 ao lacre: usada pelos testes de contrato e pelo simulador para garantir que o FluxID fala exatamente o contrato.
export function parseSealResponse(body: unknown): { ok: true } | { ok: false; error: string } {
  try {
    need(isObject(body));
    const b = body as Record<string, unknown>;
    need(isInstant(b.server_time) && Array.isArray(b.results) && isInt(b.report_interval_s, 30, 900));
    for (const item of b.results as unknown[]) {
      need(isObject(item));
      const r = item as Record<string, unknown>;
      need(isText(r.message_id, 1, 64) && oneOf(r.status, ['stored', 'duplicate', 'refused'] as const));
      need(r.status !== 'refused' || oneOf(r.reason, ['invalid_field', 'read_at_in_future', 'unknown_command', 'command_of_other_device'] as const));
    }
    if (b.command !== null) {
      need(isObject(b.command));
      const c = b.command as Record<string, unknown>;
      need(typeof c.id === 'string' && UUID.test(c.id) && isInstant(c.issued_at));
      need(oneOf(c.kind, ['lock', 'unlock', 'wifi_add', 'wifi_remove', 'wifi_reset'] as const));
      if (c.kind === 'wifi_add') need(isSsid(c.ssid) && typeof c.open === 'boolean' && (c.open || isText(c.password, 8, 63)));
      if (c.kind === 'wifi_remove') need(isSsid(c.ssid));
    }
    need(isObject(b.watch));
    const w = b.watch as Record<string, unknown>;
    need(typeof w.active === 'boolean' && isInt(w.version, 0, 2_147_483_647));
    if (w.fences !== undefined) {
      need(Array.isArray(w.fences));
      for (const f of w.fences as unknown[]) {
        need(isObject(f));
        const fence = f as Record<string, unknown>;
        if (fence.shape === 'circle') need(isNum(fence.lat, -90, 90) && isNum(fence.lng, -180, 180) && isNum(fence.radius_m, 1, 100000));
        else {
          need(fence.shape === 'polygon' && Array.isArray(fence.vertices) && fence.vertices.length >= 3 && fence.vertices.length <= 100);
          for (const v of fence.vertices as unknown[]) need(Array.isArray(v) && v.length === 2 && isNum(v[0], -90, 90) && isNum(v[1], -180, 180));
        }
      }
    }
    return { ok: true };
  } catch (error) {
    if (error instanceof Invalid) return { ok: false, error: 'invalid_response' };
    throw error;
  }
}
