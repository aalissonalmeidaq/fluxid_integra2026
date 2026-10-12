import { describe, expect, it, vi } from 'vitest';
import type { CylinderTransport } from '../cylinders/cylinder-service';
import { FieldService } from './field-service';

// RF-002, RF-003, RF-016, RF-022: o serviço de campo resolve o código lido pelo servidor, sem guardar nada e sem chamar a rede offline.
const ORG = '20000000-0000-4000-8000-00000000000a';
const CYL = '72000000-0000-4000-8000-0000000000a1';

const transport = (status: number, body: unknown): CylinderTransport & { call: ReturnType<typeof vi.fn> } => ({ call: vi.fn(async () => ({ status, body })) });
const found = {
  code: 'FOUND', matched: 1,
  cylinder: { id: CYL, serial_number: 'AB-1', status: 'active', stock_status: 'in_stock', hydro_status: 'em_dia' },
  identifier: { id: 'i1', kind: 'nfc_tag' },
};

describe('resolveIdentifier', () => {
  it('chama a operação resolve com os candidatos e o tipo esperado', async () => {
    const t = transport(200, found);
    await new FieldService(t).resolveIdentifier(ORG, [{ value: '04A23B1C', origin: 'serial' }, { value: '04:A2:3B:1C', origin: 'serial_colon' }], 'nfc_tag');
    expect(t.call).toHaveBeenCalledWith('query-cylinders', { operation: 'resolve', organization_id: ORG, candidates: ['04A23B1C', '04:A2:3B:1C'], expected_kind: 'nfc_tag' });
  });

  it('sem tipo esperado, não manda o campo', async () => {
    const t = transport(200, found);
    await new FieldService(t).resolveIdentifier(ORG, [{ value: 'QR-1', origin: 'scanned' }]);
    expect(t.call.mock.calls[0]![1]).not.toHaveProperty('expected_kind');
  });

  it('FOUND devolve o cilindro, o identificador e o índice do candidato que casou', async () => {
    const outcome = await new FieldService(transport(200, found)).resolveIdentifier(ORG, [{ value: 'x', origin: 'scanned' }]);
    expect(outcome).toEqual({
      kind: 'found',
      value: {
        cylinder: { id: CYL, serialNumber: 'AB-1', status: 'active', stockStatus: 'in_stock', hydroStatus: 'em_dia' },
        identifier: { id: 'i1', kind: 'nfc_tag' }, matchedIndex: 1, trip: null,
      },
    });
  });

  it('traz a viagem quando o servidor a devolve (só a quem tem trip.read)', async () => {
    const outcome = await new FieldService(transport(200, { ...found, trip: { id: 't1', number: 7, status: 'planned' } })).resolveIdentifier(ORG, [{ value: 'x', origin: 'scanned' }]);
    expect(outcome).toMatchObject({ kind: 'found', value: { trip: { id: 't1', number: 7, status: 'planned' } } });
  });

  it('NOT_FOUND vira "não encontrado", sem nenhum dado', async () => {
    expect(await new FieldService(transport(404, { code: 'NOT_FOUND' })).resolveIdentifier(ORG, [{ value: 'x', origin: 'scanned' }])).toEqual({ kind: 'not_found' });
  });

  it('identificador desativado traz o cilindro mínimo a que valia', async () => {
    const outcome = await new FieldService(transport(404, { code: 'NOT_FOUND', deactivated: true, cylinder: { id: CYL, serial_number: 'AB-1' } }))
      .resolveIdentifier(ORG, [{ value: 'x', origin: 'scanned' }]);
    expect(outcome).toEqual({ kind: 'deactivated', cylinder: { id: CYL, serialNumber: 'AB-1' } });
  });

  it.each([
    [400, 'VALIDATION_FAILED', 'invalid'],
    [403, 'ACCESS_DENIED', 'access_denied'],
    [401, 'AUTH_REQUIRED', 'session_expired'],
  ])('%i %s vira "%s"', async (status, code, kind) => {
    expect(await new FieldService(transport(status, { code })).resolveIdentifier(ORG, [{ value: 'x', origin: 'scanned' }])).toEqual({ kind });
  });

  it('erro do servidor ou resposta estranha vira "indisponível"', async () => {
    expect(await new FieldService(transport(500, { code: 'INTERNAL_ERROR' })).resolveIdentifier(ORG, [{ value: 'x', origin: 'scanned' }])).toEqual({ kind: 'unavailable' });
    expect(await new FieldService(transport(200, { code: 'FOUND' })).resolveIdentifier(ORG, [{ value: 'x', origin: 'scanned' }])).toEqual({ kind: 'unavailable' });
  });

  it('falha de rede vira "indisponível"', async () => {
    const t: CylinderTransport = { call: vi.fn(async () => { throw new Error('rede'); }) };
    expect(await new FieldService(t).resolveIdentifier(ORG, [{ value: 'x', origin: 'scanned' }])).toEqual({ kind: 'unavailable' });
  });

  it('sem conexão, nem chama o servidor', async () => {
    const t = transport(200, found);
    expect(await new FieldService(t, () => false).resolveIdentifier(ORG, [{ value: 'x', origin: 'scanned' }])).toEqual({ kind: 'offline' });
    expect(t.call).not.toHaveBeenCalled();
  });

  it('sem candidatos, nem chama o servidor', async () => {
    const t = transport(200, found);
    expect(await new FieldService(t).resolveIdentifier(ORG, [])).toEqual({ kind: 'invalid' });
    expect(t.call).not.toHaveBeenCalled();
  });

  it('nunca guarda a resposta no aparelho', async () => {
    const set = vi.fn();
    vi.stubGlobal('localStorage', { setItem: set });
    vi.stubGlobal('sessionStorage', { setItem: set });
    await new FieldService(transport(200, found)).resolveIdentifier(ORG, [{ value: 'x', origin: 'scanned' }]);
    expect(set).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
