import { fail, ORG_A, ORG_B, type Json, type Reply } from './mock-registry';
import type { SealMock } from './mock-seals';
import { novoDispositivo } from './mock-seals-operacoes';

// Operações do Master sobre os lacres da plataforma no backend simulado dos E2E (Spec 013, contracts/operacoes-plataforma.md). Os pedidos
// ficam em `mock.rows('enrollments')`, já no formato da vista do servidor; aprovar cria a linha do lacre no tenant de destino, onde as
// telas do tenant (mock-seals-operacoes.ts) a mostram como "Pronto para vincular". As regras de verdade estão no pgTAP e nas `.live`.

const TENANTS = [{ id: ORG_A, name: 'Tenant A' }, { id: ORG_B, name: 'Tenant B' }];
const STATUSES = ['pending', 'approved', 'refused', 'expired', 'returned'];
const ok = (json: Json): Reply => ({ status: 200, json });
const texto = (valor: unknown) => (typeof valor === 'string' ? valor.replace(/\s+/g, ' ').trim() : '');
const justificativaValida = (valor: unknown) => texto(valor).length >= 5 && texto(valor).length <= 500;

export interface PedidoDoCenario {
  device_code: string;
  status?: string;
  conflict?: boolean;
  calls?: number;
  signal_dbm?: number | null;
  last_organization?: { id: string; name: string } | null;
}

// Pedido pronto para o cenário, no formato que list_enrollments devolveria.
export function novoPedido(mock: SealMock, pedido: PedidoDoCenario): Json {
  const agora = mock.now().toISOString();
  const row: Json = {
    id: mock.nextId('e0'), device_code: pedido.device_code, status: pedido.status ?? 'pending', conflict: pedido.conflict ?? false,
    conflict_at: pedido.conflict ? agora : null, conflict_calls: pedido.conflict ? 1 : 0, first_seen_at: agora, last_seen_at: agora,
    calls: pedido.calls ?? 3, signal_dbm: pedido.signal_dbm === undefined ? -58 : pedido.signal_dbm, wifi_ssid: 'Rede-Deposito-Ficticia',
    firmware_version: '3.0.0', organization: null, device_id: null, last_organization: pedido.last_organization ?? null,
    networks_cleared: !pedido.last_organization, forget_networks: pedido.status === 'returned' ? 'all' : null, forget_networks_requested_at: null,
    decided_at: null, decision_note: pedido.status === 'returned' ? 'Devolvido pelo tenant' : null, origin: 'enrollment', updated_at: agora,
  };
  mock.rows('enrollments').push(row);
  return row;
}

export interface PlataformaSimulada {
  // A senha da rede de configuração "configurada no servidor" (falsa); nula responde NOT_CONFIGURED.
  portalPassword: string | null;
  handle(body: Json, canManage: boolean): Reply;
}

export function instalarPlataforma(mock: SealMock): PlataformaSimulada {
  const pedidos = () => mock.rows('enrollments');
  const toque = (row: Json) => { row.updated_at = new Date(Date.parse(String(row.updated_at)) + 1000).toISOString(); };
  const decidir = (body: Json, aceitos: string[], run: (row: Json) => Reply): Reply => {
    const row = pedidos().find((p) => p.id === body.enrollment_id);
    if (!row) return fail('NOT_FOUND', 404);
    if (!justificativaValida(body.justification)) return fail('JUSTIFICATION_REQUIRED', 400);
    if (body.expected_updated_at !== row.updated_at) return fail('STALE', 409);
    if (!aceitos.includes(String(row.status))) return fail('INVALID_STATE', 409);
    const reply = run(row);
    if (reply.status < 300) { row.decision_note = texto(body.justification); toque(row); }
    return reply;
  };
  const sim: PlataformaSimulada = {
    portalPassword: null,
    handle(body, canManage) {
      if (!canManage) return fail('ACCESS_DENIED', 403);
      switch (body.operation) {
        case 'list_enrollments': {
          const itens = pedidos().filter((p) => !body.status || p.status === body.status).filter((p) => body.conflict !== true || p.conflict === true);
          return ok({ code: 'LISTED', items: itens, total: itens.length, conflicts: pedidos().filter((p) => p.conflict).length, rate_limited_last_24h: 0,
            counts: Object.fromEntries(STATUSES.map((s) => [s, pedidos().filter((p) => p.status === s).length])) });
        }
        case 'list_tenants_for_seals': return ok({ code: 'LISTED', items: TENANTS });
        case 'approve_enrollment': return decidir(body, ['pending', 'returned', 'refused'], (row) => {
          if (row.conflict) return fail('ENROLLMENT_CONFLICT', 409);
          const tenant = TENANTS.find((t) => t.id === body.organization_id);
          if (!tenant) return fail('NOT_FOUND', 404);
          const last = row.last_organization as { id: string } | null;
          if (last && !row.networks_cleared && last.id !== tenant.id) return fail('NETWORKS_NOT_CLEARED', 409);
          const device = novoDispositivo(mock, tenant.id, `Lacre ${String(row.device_code)}`);
          Object.assign(device, { device_code: row.device_code, approved_at: mock.now().toISOString() });
          Object.assign(row, { status: 'approved', organization: tenant, device_id: device.device_id, last_organization: tenant, forget_networks: null });
          return ok({ code: 'APPROVED', device_id: device.device_id });
        });
        case 'refuse_enrollment': return decidir(body, ['pending'], (row) => { row.status = 'refused'; return ok({ code: 'REFUSED' }); });
        case 'replace_enrollment_key': return decidir(body, ['pending', 'refused', 'expired', 'returned'], (row) => {
          if (!row.conflict) return fail('INVALID_STATE', 409);
          Object.assign(row, { conflict: false, conflict_at: null, ...(body.keep_current ? {} : { status: 'pending' }) });
          return ok({ code: body.keep_current ? 'CONFLICT_CLEARED' : 'KEY_REPLACED' });
        });
        case 'withdraw_device': return decidir(body, ['approved'], (row) => {
          const device = mock.rows('devices').find((d) => d.device_id === row.device_id);
          if (device) Object.assign(device, { status: 'inactive', inactive_reason: 'withdrawn' });
          Object.assign(row, { status: 'pending', organization: null, device_id: null, forget_networks: body.forget_networks ?? 'extras', networks_cleared: false });
          return ok({ code: 'WITHDRAWN' });
        });
        case 'request_forget_networks': return decidir(body, ['pending', 'refused', 'expired', 'returned'], (row) => {
          if (!row.last_organization) return fail('INVALID_STATE', 409);
          row.forget_networks = 'all';
          return ok({ code: 'FORGET_REQUESTED' });
        });
        case 'reveal_portal_password':
          if (!justificativaValida(body.justification)) return fail('JUSTIFICATION_REQUIRED', 400);
          return sim.portalPassword === null ? fail('NOT_CONFIGURED', 409) : ok({ code: 'REVEALED', password: sim.portalPassword });
        default: return fail('VALIDATION_FAILED', 400);
      }
    },
  };
  return sim;
}
