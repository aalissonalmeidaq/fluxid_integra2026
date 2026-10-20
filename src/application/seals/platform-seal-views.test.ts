import { describe, expect, it } from 'vitest';
import { ENROLLMENT_REFRESH_MS, failureText, newPendingCodes, toEnrollmentPage, toEnrollmentView } from './platform-seal-views';

// Spec 013 (T019): a vista do pedido para a tela do Master (contracts/operacoes-plataforma.md e contracts/telas.md). O servidor nunca
// manda a chave nem o resumo do endereço; a vista recusa o que não reconhece.
const raw = {
  id: 'e1', device_code: 'DSP-APR13001', status: 'pending', conflict: true, conflict_at: '2026-10-19T12:00:00Z', conflict_calls: 2,
  first_seen_at: '2026-10-19T11:00:00Z', last_seen_at: '2026-10-19T12:00:00Z', calls: 7, signal_dbm: -58, wifi_ssid: 'Rede-Ficticia',
  firmware_version: '3.0.0', organization: null, device_id: null, last_organization: { id: 'org-a', name: 'Tenant A' }, networks_cleared: false,
  forget_networks: 'all', forget_networks_requested_at: '2026-10-19T12:01:00Z', decided_at: null, decision_note: null, origin: 'enrollment',
  updated_at: '2026-10-19 12:01:00.123456+00',
};

describe('toEnrollmentView', () => {
  it('converte o pedido, com o sinal em texto', () => {
    expect(toEnrollmentView(raw)).toEqual({
      id: 'e1', deviceCode: 'DSP-APR13001', status: 'pending', conflict: true, conflictAt: '2026-10-19T12:00:00Z', conflictCalls: 2,
      firstSeenAt: '2026-10-19T11:00:00Z', lastSeenAt: '2026-10-19T12:00:00Z', calls: 7, signalDbm: -58, signal: 'forte', wifiSsid: 'Rede-Ficticia',
      firmwareVersion: '3.0.0', organization: null, deviceId: null, lastOrganization: { id: 'org-a', name: 'Tenant A' }, networksCleared: false,
      forgetNetworks: 'all', forgetRequestedAt: '2026-10-19T12:01:00Z', decidedAt: null, decisionNote: null, origin: 'enrollment',
      updatedAt: '2026-10-19 12:01:00.123456+00',
    });
  });

  it('recusa situação desconhecida ou campos essenciais ausentes', () => {
    expect(toEnrollmentView({ ...raw, status: 'blocked' })).toBeNull();
    expect(toEnrollmentView({ ...raw, id: undefined })).toBeNull();
    expect(toEnrollmentView({ ...raw, updated_at: undefined })).toBeNull();
  });
});

describe('toEnrollmentPage', () => {
  it('traz os itens, as contagens por aba e os descartados pelo limite', () => {
    const page = toEnrollmentPage({ code: 'LISTED', items: [raw], total: 1, counts: { pending: 1, approved: 2, refused: 0, expired: 0, returned: 3 },
      conflicts: 1, rate_limited_last_24h: 4 });
    expect(page).toMatchObject({ total: 1, counts: { pending: 1, approved: 2, returned: 3 }, conflicts: 1, rateLimitedLast24h: 4 });
    expect(page?.items).toHaveLength(1);
  });

  it('item irreconhecível invalida a página', () => {
    expect(toEnrollmentPage({ code: 'LISTED', items: [{ id: 'x' }], total: 1, counts: {}, conflicts: 0, rate_limited_last_24h: 0 })).toBeNull();
  });
});

describe('pedidos novos para o anúncio', () => {
  it('só os códigos aguardando que não estavam na lista anterior', () => {
    const before = [toEnrollmentView(raw)!];
    const after = [toEnrollmentView(raw)!, toEnrollmentView({ ...raw, id: 'e2', device_code: 'DSP-NOVO0001' })!,
      toEnrollmentView({ ...raw, id: 'e3', device_code: 'DSP-OPER0001', status: 'approved' })!];
    expect(newPendingCodes(before, after)).toEqual(['DSP-NOVO0001']);
    expect(newPendingCodes(null, after)).toEqual([]);
  });

  it('a lista atualiza a cada 30 s', () => {
    expect(ENROLLMENT_REFRESH_MS).toBe(30_000);
  });
});

describe('textos das recusas', () => {
  it.each([
    ['networks_not_cleared', /redes do tenant anterior/],
    ['enrollment_conflict', /Outro aparelho com este código/],
    ['stale', /mudou/],
    ['cylinder_in_trip', /viagem em andamento/],
    ['not_configured', /senha.*não foi configurada/],
    ['mfa_required', /Entre de novo/],
    ['offline', /Sem conexão/],
  ] as const)('%s', (kind, text) => {
    expect(failureText(kind)).toMatch(text);
  });
});
