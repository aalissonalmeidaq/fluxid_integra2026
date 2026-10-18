import { afterEach, describe, expect, it, vi } from 'vitest';
import { SealService, type Raw, type SealTransport } from './seal-service';

// Spec 012 (T026): o esqueleto do serviço do lacre converte as respostas em estados de tela, não chama o servidor offline e não guarda
// nada no aparelho (RF-043).
class Probe extends SealService {
  read(body: Raw) { return this.run('query-seals', false, body, (p) => (typeof p.code === 'string' ? p.code : null)); }
  write(body: Raw) { return this.run('manage-seals', true, body, (p) => (typeof p.code === 'string' ? p.code : null)); }
}
const transport = (status: number, body: unknown): SealTransport & { call: ReturnType<typeof vi.fn> } => ({ call: vi.fn(async () => ({ status, body })) });

afterEach(() => { localStorage.clear(); sessionStorage.clear(); });

describe('SealService', () => {
  it('sucesso tipado', async () => {
    const t = transport(200, { code: 'FOUND' });
    expect(await new Probe(t).read({ operation: 'x' })).toEqual({ kind: 'success', value: 'FOUND' });
    expect(t.call).toHaveBeenCalledWith('query-seals', { operation: 'x' });
  });

  it('offline não chama o servidor', async () => {
    const t = transport(200, { code: 'OK' });
    expect(await new Probe(t, () => false).write({})).toEqual({ kind: 'offline' });
    expect(t.call).not.toHaveBeenCalled();
  });

  it.each([
    [401, {}, 'session_expired'], [403, { code: 'MFA_REQUIRED' }, 'mfa_required'], [404, { code: 'NOT_FOUND' }, 'not_found'],
    [409, { code: 'SEAL_ALREADY_BOUND' }, 'seal_already_bound'], [409, { code: 'CYLINDER_ALREADY_BOUND' }, 'cylinder_already_bound'],
    [409, { code: 'CYLINDER_IN_TRIP' }, 'cylinder_in_trip'], [409, { code: 'WIFI_LIST_FULL' }, 'wifi_list_full'],
    [400, { code: 'WIFI_RISK_NOT_CONFIRMED' }, 'wifi_risk_not_confirmed'], [400, { code: 'JUSTIFICATION_REQUIRED' }, 'justification_required'],
    [400, { code: 'NOTE_REQUIRED' }, 'note_required'], [409, { code: 'ALERT_CLOSED' }, 'alert_closed'],
  ])('HTTP %i %j vira %s', async (status, body, kind) => {
    expect((await new Probe(transport(status, body)).write({})).kind).toBe(kind);
  });

  it('geocercas do lacre: círculo, polígono, esperada, dentro e distância', async () => {
    const t = transport(200, {
      code: 'FOUND', has_position: true, expected_reason: 'watch', expected_site_name: 'Unidade', geofence_access: true, radius_nearby_m: 2000,
      geofences: [
        { id: 'g1', name: 'Pátio', site_name: 'Unidade', expected: true, shape: 'circle', center: { latitude: -7.25, longitude: -39.3 }, radius_m: 150, vertices: null, inside: true, distance_m: 0 },
        { id: 'g2', name: 'Depósito', site_name: 'Outra', expected: false, shape: 'polygon', center: null, radius_m: null,
          vertices: [{ latitude: -7.258, longitude: -39.3 }, { latitude: -7.258, longitude: -39.299 }, { latitude: -7.257, longitude: -39.299 }], inside: false, distance_m: 1049 },
      ],
    });
    const result = await new SealService(t).sealGeofences('org-a', 'd1');
    expect(t.call).toHaveBeenCalledWith('query-seals', { operation: 'seal_geofence_view', organization_id: 'org-a', device_id: 'd1' });
    expect(result).toMatchObject({ kind: 'success', value: { hasPosition: true, expectedReason: 'watch', geofences: [
      { name: 'Pátio', expected: true, inside: true, shape: { kind: 'circle', radiusM: 150 } },
      { name: 'Depósito', inside: false, distanceM: 1049, shape: { kind: 'polygon' } },
    ] } });
  });

  it('erros de campo do servidor chegam por nome', async () => {
    const result = await new Probe(transport(400, { code: 'VALIDATION_FAILED', fields: [{ field: 'justification', message: 'Explique.' }] })).write({});
    expect(result).toEqual({ kind: 'invalid', fields: { justification: 'Explique.' } });
  });

  it('código desconhecido, 5xx ou resposta sem formato: desconhecido na escrita, indisponível na leitura', async () => {
    expect((await new Probe(transport(500, { code: 'X' })).write({})).kind).toBe('unknown');
    expect((await new Probe(transport(500, { code: 'X' })).read({})).kind).toBe('unavailable');
    expect((await new Probe(transport(200, { nada: 1 })).write({})).kind).toBe('unknown');
  });

  it('falha de rede depois de enviar: resultado desconhecido', async () => {
    const t: SealTransport = { call: vi.fn(async () => { throw new Error('rede'); }) };
    expect((await new Probe(t).write({})).kind).toBe('unknown');
  });

  it('nada fica no armazenamento do navegador', async () => {
    await new Probe(transport(200, { code: 'FOUND' })).read({});
    expect(localStorage.length + sessionStorage.length).toBe(0);
  });
});
