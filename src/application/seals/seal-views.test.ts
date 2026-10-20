import { describe, expect, it, vi } from 'vitest';
import { SealService, type SealTransport } from './seal-service';
import { toPositionRow, toSealDetail, toSealSummary } from './seal-views';

// Spec 012 (T046): visões de leitura do lacre e consultas do serviço. Valor desconhecido nunca é presumido.
export const RAW_SUMMARY = {
  device_id: 'a1400000-0000-4000-8000-0000000000a1', device_code: 'DSP-READA001', label: 'Lacre A', status: 'active', health: 'ok',
  lock_state: 'locked', seal_state: 'closed', battery_pct: 87, signal_dbm: -61, last_seen_at: '2026-10-17T14:03:00Z', report_interval_s: 60,
  position: { latitude: -7.209194, longitude: -39.306367, accuracy_m: 6, quality: 'gps', read_at: '2026-10-17T14:02:00Z', last_seen_at: '2026-10-17T14:03:00Z' },
  pending_command: null, watch: null, violation: null,
};

describe('visões do lacre', () => {
  it('resumo com posição, saúde e trava', () => {
    expect(toSealSummary(RAW_SUMMARY)).toMatchObject({
      deviceCode: 'DSP-READA001', health: 'ok', lockState: 'locked', batteryPct: 87,
      position: { latitude: -7.209194, longitude: -39.306367, accuracyM: 6, quality: 'gps', readAt: '2026-10-17T14:02:00Z' },
      pendingCommand: null,
    });
  });

  it('comando pendente, vigilância e violação', () => {
    const raw = {
      ...RAW_SUMMARY,
      pending_command: { id: 'c1', kind: 'lock', status: 'pending', origin: 'trip_start', created_at: '2026-10-17T14:00:00Z' },
      watch: { site_id: 's1', site_name: 'Unidade A', started_at: '2026-10-17T10:00:00Z', suspended: false },
      violation: { id: 'v1', status: 'open', first_outside_at: '2026-10-17T13:00:00Z', distance_m: 120.5, returned_at: null },
    };
    expect(toSealSummary(raw)).toMatchObject({
      pendingCommand: { kind: 'lock', origin: 'trip_start' }, watch: { siteName: 'Unidade A' }, violation: { status: 'open', distanceM: 120.5 },
    });
  });

  it('valor desconhecido recusa a visão inteira', () => {
    expect(toSealSummary({ ...RAW_SUMMARY, health: 'dead' })).toBeNull();
    expect(toSealSummary({ ...RAW_SUMMARY, position: { ...RAW_SUMMARY.position, quality: 'wifi' } })).toBeNull();
    expect(toSealSummary(null)).toBeNull();
  });

  it('detalhe com redes (só nomes), vínculos, comandos e alertas', () => {
    const detail = toSealDetail({
      ...RAW_SUMMARY, seal_code: 'LCR-JKFL6VBR', activated_at: null, firmware_version: '2.0.0', version: 3,
      wifi_in_use: { ssid: 'Rede-Ficticia', kind: 'list', rssi: -60, at: '2026-10-17T14:00:00Z' }, wifi_saved: ['Rede-Ficticia'],
      bindings: [{ cylinder_id: 'c', serial_number: 'S-1', bound_at: '2026-10-16T10:00:00Z', unbound_at: null, unbind_reason: null }],
      commands: [{ id: 'x', kind: 'lock', origin: 'manual', status: 'confirmed', created_at: 't', delivered_at: 't', finished_at: 't', wifi_ssid: null }],
      alerts: [{ id: 'a', kind: 'no_comm', severity: 'medium', status: 'open', opened_at: 't', recovered_at: null }],
    });
    expect(detail).toMatchObject({ sealCode: 'LCR-JKFL6VBR', wifiInUse: { ssid: 'Rede-Ficticia' }, wifiSaved: ['Rede-Ficticia'], bindings: [{ serialNumber: 'S-1' }] });
    expect(JSON.stringify(detail)).not.toMatch(/password/);
  });

  it('linha do histórico de posições', () => {
    expect(toPositionRow({ latitude: 1, longitude: 2, accuracy_m: null, quality: 'last_known', seal_state: 'closed', battery_pct: 50,
      read_at: 'a', last_seen_at: 'b', repeat_count: 3 })).toMatchObject({ quality: 'last_known', repeatCount: 3 });
  });
});

describe('consultas do serviço', () => {
  const transport = (body: unknown): SealTransport & { call: ReturnType<typeof vi.fn> } => ({ call: vi.fn(async () => ({ status: 200, body })) });

  it('bloco do cilindro: com lacre, sem lacre e resposta desconhecida', async () => {
    expect(await new SealService(transport({ code: 'FOUND', seal: RAW_SUMMARY })).cylinderSeal('org', 'cyl'))
      .toMatchObject({ kind: 'success', value: { deviceCode: 'DSP-READA001' } });
    expect(await new SealService(transport({ code: 'FOUND', seal: null })).cylinderSeal('org', 'cyl')).toEqual({ kind: 'success', value: null });
    expect((await new SealService(transport({ code: 'FOUND', seal: { ...RAW_SUMMARY, lock_state: '?' } })).cylinderSeal('org', 'cyl')).kind).toBe('unavailable');
  });

  it('cada consulta envia a operação e os campos do contrato', async () => {
    const t = transport({ code: 'LISTED', items: [], total: 0 });
    await new SealService(t).listSeals('org', { health: 'no_comm', unbound: true });
    expect(t.call).toHaveBeenCalledWith('query-seals', expect.objectContaining({ operation: 'list_seals', organization_id: 'org', health: 'no_comm', unbound: true }));
    await new SealService(t).listPositions('org', { cylinderId: 'cyl' }, 20);
    expect(t.call).toHaveBeenLastCalledWith('query-seals', { operation: 'list_positions', organization_id: 'org', cylinder_id: 'cyl', limit: 20 });
  });

  it('viagem: linhas com e sem lacre', async () => {
    const t = transport({ code: 'FOUND', items: [
      { item_id: 'i1', cylinder_id: 'c1', serial_number: 'S-1', seal: RAW_SUMMARY },
      { item_id: 'i2', cylinder_id: 'c2', serial_number: 'S-2', seal: null },
    ] });
    const outcome = await new SealService(t).tripSeals('org', 'trip');
    expect(outcome).toMatchObject({ kind: 'success', value: [{ seal: { lockState: 'locked' } }, { seal: null }] });
  });
});

// Spec 013 (T037): o tenant vê a aprovação, o "pronto para vincular" e a origem do lacre; o serviço devolve à plataforma e lê o histórico.
describe('lacre destinado pelo Master (Spec 013)', () => {
  it('resumo com a data da aprovação, a origem e o pronto para vincular', () => {
    expect(toSealSummary({ ...RAW_SUMMARY, approved_at: '2026-10-19T10:00:00Z', origin: 'enrollment', ready_to_bind: true, inactive_reason: null })).toMatchObject({
      approvedAt: '2026-10-19T10:00:00Z', origin: 'enrollment', readyToBind: true, inactiveReason: null,
    });
    expect(toSealSummary({ ...RAW_SUMMARY, origin: 'manual', ready_to_bind: false })).toMatchObject({ origin: 'manual', readyToBind: false, approvedAt: null });
  });

  it('origem desconhecida recusa a visão', () => {
    expect(toSealSummary({ ...RAW_SUMMARY, origin: 'importado' })).toBeNull();
  });

  it('lista com o filtro de histórico e o de prontos para vincular', async () => {
    const t: SealTransport & { call: ReturnType<typeof vi.fn> } = { call: vi.fn(async () => ({ status: 200, body: { code: 'LISTED', items: [], total: 0 } })) };
    await new SealService(t).listSeals('org', { unbound: true, history: true });
    expect(t.call).toHaveBeenCalledWith('query-seals', expect.objectContaining({ operation: 'list_seals', unbound: true, history: true }));
  });

  it('devolver à plataforma: request_id, lacre e justificativa', async () => {
    const t: SealTransport & { call: ReturnType<typeof vi.fn> } = { call: vi.fn(async () => ({ status: 200, body: { code: 'RETURNED' } })) };
    expect(await new SealService(t).returnDevice('org', 'dev', 'Lacre com defeito', 'req')).toEqual({ kind: 'success', value: true });
    expect(t.call).toHaveBeenCalledWith('manage-seals', { operation: 'return_device', organization_id: 'org', request_id: 'req', device_id: 'dev', justification: 'Lacre com defeito' });
  });

  it('o serviço não oferece mais cadastro, chave nova nem desativação', () => {
    const service = new SealService({ call: vi.fn() });
    for (const removed of ['createDevice', 'rotateDeviceKey', 'deactivateDevice']) expect(removed in service).toBe(false);
  });
});
