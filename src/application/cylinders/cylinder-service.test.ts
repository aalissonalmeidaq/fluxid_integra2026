import { describe, expect, it, vi } from 'vitest';
import { CylinderService, type CylinderTransport } from './cylinder-service';

const ORG = '20000000-0000-4000-8000-00000000000a';
const CYL = '72000000-0000-4000-8000-0000000000a1';

function transportReturning(status: number, body: unknown): CylinderTransport & { call: ReturnType<typeof vi.fn> } {
  return { call: vi.fn(async () => ({ status, body })) };
}

const service = (transport: CylinderTransport, online = true) => new CylinderService(transport, () => online);

const itemWire = {
  id: CYL, serial_number: 'AB-1', status: 'active', stock_status: 'out_of_stock', hydro_status: 'a_vencer', active_identifier_count: 0, version: 3,
  type: { id: 't1', gas: 'Oxigênio', capacity_value: 10, capacity_unit: 'l', classification: 'medicinal', active: true },
};

describe('CylinderService: consultas', () => {
  it('lista envia a operação, a organização e os filtros ao query-cylinders', async () => {
    const transport = transportReturning(200, { code: 'LISTED', items: [itemWire], total: 1, next: null });
    const outcome = await service(transport).list(ORG, { search: ' QR-1 ', status: 'all', stockStatus: 'in_stock', hydroStatus: 'vencido', cursor: 'c1', limit: 25 });
    expect(transport.call).toHaveBeenCalledWith('query-cylinders', {
      operation: 'list', organization_id: ORG, search: 'QR-1', status: 'all', stock_status: 'in_stock', hydro_status: 'vencido', cursor: 'c1', limit: 25,
    });
    expect(outcome.kind).toBe('success');
    if (outcome.kind === 'success') {
      expect(outcome.value.total).toBe(1);
      expect(outcome.value.items[0]).toMatchObject({ id: CYL, serialNumber: 'AB-1', stockStatus: 'out_of_stock', hydroStatus: 'a_vencer', activeIdentifierCount: 0, version: 3 });
      expect(outcome.value.items[0]?.type).toMatchObject({ gas: 'Oxigênio', capacityValue: 10, capacityUnit: 'l' });
    }
  });

  it('a custódia vai como filtro e volta no item, com a unidade quando está no cliente (Spec 008)', async () => {
    const site = { id: 's1', name: 'Unidade Centro', customer_id: 'c1' };
    const transport = transportReturning(200, { code: 'LISTED', items: [{ ...itemWire, custody_status: 'at_customer', custody_site: site }, { ...itemWire, id: 'x', custody_status: 'em_lugar_nenhum', custody_site: { id: 1 } }], total: 2, next: null });
    const outcome = await service(transport).list(ORG, { custody: 'at_customer' });
    expect(transport.call).toHaveBeenCalledWith('query-cylinders', { operation: 'list', organization_id: ORG, custody: 'at_customer' });
    if (outcome.kind !== 'success') throw new Error('esperava sucesso');
    expect(outcome.value.items[0]).toMatchObject({ custodyStatus: 'at_customer', custodySite: { id: 's1', customerId: 'c1', name: 'Unidade Centro' } });
    // Valor desconhecido nunca é presumido como lugar: cai no padrão da organização, sem unidade.
    expect(outcome.value.items[1]).toMatchObject({ custodyStatus: 'in_organization', custodySite: null });
  });

  it('lista sem filtros não envia campos vazios', async () => {
    const transport = transportReturning(200, { code: 'LISTED', items: [], total: 0, next: null });
    await service(transport).list(ORG, {});
    expect(transport.call).toHaveBeenCalledWith('query-cylinders', { operation: 'list', organization_id: ORG });
  });

  it('descarta itens malformados da resposta', async () => {
    const transport = transportReturning(200, { code: 'LISTED', items: [itemWire, { id: 5 }], total: 2, next: 'p2' });
    const outcome = await service(transport).list(ORG, {});
    expect(outcome.kind === 'success' && outcome.value.items).toHaveLength(1);
    expect(outcome.kind === 'success' && outcome.value.next).toBe('p2');
  });

  it('detalhe devolve cilindro, identificadores, testes e situação do teste', async () => {
    const transport = transportReturning(200, {
      code: 'FOUND', hydro_status: 'em_dia',
      cylinder: { ...itemWire, manufacturer: null, manufacture_year: 2020, working_pressure_bar: 200, notes: null, inactivation_reason: null, hydro_last_result: 'approved', hydro_next_due_on: '2027-01-01', created_at: '2026-10-05T10:00:00Z' },
      identifiers: [{ id: 'i1', kind: 'qr_code', value: 'QR-1', status: 'active', created_at: '2026-10-05T10:00:00Z', deactivated_at: null, deactivation_justification: null, transferred: false }],
      tests: [{ id: 't1', performed_on: '2026-09-01', result: 'approved', report_number: null, executor: 'Lab', next_due_on: '2027-09-01', notes: null, rectifies_test_id: null, rectification_justification: null, created_at: '2026-09-01T10:00:00Z', superseded: false }],
    });
    const outcome = await service(transport).get(ORG, CYL);
    expect(transport.call).toHaveBeenCalledWith('query-cylinders', { operation: 'get', organization_id: ORG, cylinder_id: CYL });
    expect(outcome.kind).toBe('success');
    if (outcome.kind === 'success') {
      expect(outcome.value.hydroStatus).toBe('em_dia');
      expect(outcome.value.cylinder).toMatchObject({ manufactureYear: 2020, workingPressureBar: 200, hydroNextDueOn: '2027-01-01' });
      expect(outcome.value.identifiers[0]).toMatchObject({ kind: 'qr_code', value: 'QR-1', status: 'active' });
      expect(outcome.value.tests[0]).toMatchObject({ performedOn: '2026-09-01', executor: 'Lab', superseded: false });
    }
  });

  it('histórico envia ordem, filtros e cursor', async () => {
    const transport = transportReturning(200, { code: 'LISTED', events: [{ id: 'e1', sequence: 2, event_type: 'stock_in', actor_name: 'Ana', occurred_at: '2026-10-05T10:00:00Z', justification: null, data: {}, references_event_id: null }], next: null });
    const outcome = await service(transport).history(ORG, CYL, { eventType: 'stock_in', order: 'asc', from: '2026-10-01', limit: 10 });
    expect(transport.call).toHaveBeenCalledWith('query-cylinders', { operation: 'history', organization_id: ORG, cylinder_id: CYL, event_type: 'stock_in', order: 'asc', from: '2026-10-01', limit: 10 });
    expect(outcome.kind === 'success' && outcome.value.events[0]).toMatchObject({ sequence: 2, eventType: 'stock_in', actorName: 'Ana' });
  });

  it('falha de rede em consulta vira "unavailable"', async () => {
    const transport: CylinderTransport = { call: vi.fn(async () => { throw new Error('rede'); }) };
    expect((await service(transport).list(ORG, {})).kind).toBe('unavailable');
  });

  it('sem conexão não chama o servidor', async () => {
    const transport = transportReturning(200, {});
    expect((await service(transport, false).list(ORG, {})).kind).toBe('offline');
    expect(transport.call).not.toHaveBeenCalled();
  });
});

describe('CylinderService: busca por identificador', () => {
  it('encontra o cilindro pelo identificador', async () => {
    const transport = transportReturning(200, { code: 'FOUND', cylinder: { id: CYL, serial_number: 'AB-1', status: 'active', stock_status: 'out_of_stock', hydro_status: 'vencido' }, identifier: { id: 'i1', kind: 'nfc_tag', value: 'NFC-1' } });
    const outcome = await service(transport).lookup(ORG, ' nfc-1 \n');
    expect(transport.call).toHaveBeenCalledWith('query-cylinders', { operation: 'lookup', organization_id: ORG, identifier_value: 'nfc-1' });
    expect(outcome.kind === 'success' && outcome.value.cylinder.hydroStatus).toBe('vencido');
  });

  it('identificador desativado informa a quem pertencia, sem tratá-lo como cilindro ativo', async () => {
    const transport = transportReturning(404, { code: 'NOT_FOUND', deactivated: true, cylinder: { id: CYL, serial_number: 'AB-1' } });
    const outcome = await service(transport).lookup(ORG, 'NFC-1');
    expect(outcome).toMatchObject({ kind: 'not_found', deactivatedOwner: { id: CYL, serialNumber: 'AB-1' } });
  });
});

describe('CylinderService: comandos', () => {
  it('cadastrar envia os campos em snake_case e devolve o id', async () => {
    const transport = transportReturning(200, { code: 'CREATED', cylinder_id: CYL, version: 1 });
    const outcome = await service(transport).create(ORG, {
      cylinderTypeId: 't1', serialNumber: 'AB-1', manufacturer: null, manufactureYear: 2020, workingPressureBar: 200, notes: null,
      identifier: { kind: 'qr_code', value: 'QR-1' },
    });
    expect(transport.call).toHaveBeenCalledWith('manage-cylinders', {
      operation: 'create', organization_id: ORG, cylinder_type_id: 't1', serial_number: 'AB-1', manufacturer: null, manufacture_year: 2020,
      working_pressure_bar: 200, notes: null, identifier: { kind: 'qr_code', value: 'QR-1' },
    });
    expect(outcome).toEqual({ kind: 'success', value: { cylinderId: CYL, version: 1 } });
  });

  it('entrada no estoque envia a chave de operação e o identificador', async () => {
    const transport = transportReturning(200, { code: 'STOCKED', replayed: false, event_sequence: 4, hydro_status: 'vencido', warning: 'hydro_expired', cylinder: { id: CYL, serial_number: 'AB-1', stock_status: 'in_stock' } });
    const outcome = await service(transport).stockIn(ORG, ' qr-1\n', 'key-1');
    expect(transport.call).toHaveBeenCalledWith('manage-cylinders', { operation: 'stock_in', organization_id: ORG, identifier_value: 'qr-1', operation_key: 'key-1' });
    expect(outcome).toMatchObject({ kind: 'success', value: { replayed: false, warning: 'hydro_expired', eventSequence: 4, hydroStatus: 'vencido' } });
  });

  it('a repetição devolve a mesma resposta marcada como repetida', async () => {
    const transport = transportReturning(200, { code: 'STOCKED', replayed: true, event_sequence: 4, hydro_status: 'em_dia', warning: null, cylinder: { id: CYL, serial_number: 'AB-1', stock_status: 'in_stock' } });
    const outcome = await service(transport).stockIn(ORG, 'QR-1', 'key-1');
    expect(outcome.kind === 'success' && outcome.value.replayed).toBe(true);
  });

  it.each([
    ['AUTH_REQUIRED', 401, 'access_denied'],
    ['ACCESS_DENIED', 403, 'access_denied'],
    ['MFA_REQUIRED', 403, 'mfa_required'],
    ['NOT_FOUND', 404, 'not_found'],
    ['VALIDATION_FAILED', 400, 'invalid'],
    ['JUSTIFICATION_REQUIRED', 400, 'justification_required'],
    ['SERIAL_CONFLICT', 409, 'serial_conflict'],
    ['IDENTIFIER_CONFLICT', 409, 'identifier_conflict'],
    ['IDENTIFIER_UNAVAILABLE', 409, 'identifier_unavailable'],
    ['VERSION_CONFLICT', 409, 'version_conflict'],
    ['CYLINDER_INACTIVE', 409, 'cylinder_inactive'],
    ['ALREADY_IN_STOCK', 409, 'already_in_stock'],
    ['ALREADY_INACTIVE', 409, 'already_inactive'],
    ['IDEMPOTENCY_PAYLOAD_CONFLICT', 409, 'idempotency_conflict'],
    ['CYLINDER_IN_TRIP', 409, 'cylinder_in_trip'],
  ])('%s (HTTP %i) vira %s', async (code, status, kind) => {
    const outcome = await service(transportReturning(status, { code })).inactivate(ORG, { cylinderId: CYL, reason: 'lost', justification: 'motivo ok' });
    expect(outcome.kind).toBe(kind);
  });

  it('cilindro em viagem aberta traz a viagem (Spec 008, RF-024a), na inativação e na entrada no estoque', async () => {
    const body = { code: 'CYLINDER_IN_TRIP', trip_id: 'trip-1', trip_number: 7 };
    const inactivated = await service(transportReturning(409, body)).inactivate(ORG, { cylinderId: CYL, reason: 'lost', justification: 'motivo ok' });
    expect(inactivated).toEqual({ kind: 'cylinder_in_trip', trip: { id: 'trip-1', number: 7 } });
    const stocked = await service(transportReturning(409, body)).stockIn(ORG, 'QR-1', '11111111-1111-4111-8111-111111111111');
    expect(stocked).toEqual({ kind: 'cylinder_in_trip', trip: { id: 'trip-1', number: 7 } });
  });

  it('erros de validação trazem os campos; conflitos trazem o cilindro dono', async () => {
    const invalid = await service(transportReturning(400, { code: 'VALIDATION_FAILED', fields: [{ field: 'serial_number', message: 'Obrigatório' }] }))
      .update(ORG, { cylinderId: CYL, expectedVersion: 1, cylinderTypeId: 't1', serialNumber: '', manufacturer: null, manufactureYear: null, workingPressureBar: null, notes: null });
    expect(invalid).toMatchObject({ kind: 'invalid', fields: { serial_number: 'Obrigatório' } });
    const conflict = await service(transportReturning(409, { code: 'SERIAL_CONFLICT', cylinder_id: CYL }))
      .update(ORG, { cylinderId: 'outro', expectedVersion: 1, cylinderTypeId: 't1', serialNumber: 'AB-1', manufacturer: null, manufactureYear: null, workingPressureBar: null, notes: null });
    expect(conflict).toMatchObject({ kind: 'serial_conflict', ownerCylinderId: CYL });
  });

  it('falha de rede ou erro 5xx em comando vira "unknown" (resultado desconhecido, repetir com a mesma chave)', async () => {
    const thrown: CylinderTransport = { call: vi.fn(async () => { throw new Error('rede'); }) };
    expect((await service(thrown).stockIn(ORG, 'QR-1', 'k')).kind).toBe('unknown');
    expect((await service(transportReturning(500, { code: 'INTERNAL_ERROR' })).stockIn(ORG, 'QR-1', 'k')).kind).toBe('unknown');
    expect((await service(transportReturning(200, null)).stockIn(ORG, 'QR-1', 'k')).kind).toBe('unknown');
  });

  it('comandos sem conexão não chamam o servidor e não guardam nada', async () => {
    const transport = transportReturning(200, {});
    const offline = service(transport, false);
    expect((await offline.stockIn(ORG, 'QR-1', 'k')).kind).toBe('offline');
    expect((await offline.inactivate(ORG, { cylinderId: CYL, reason: 'lost', justification: 'motivo ok' })).kind).toBe('offline');
    expect(transport.call).not.toHaveBeenCalled();
  });

  it('as demais operações usam os nomes do contrato', async () => {
    const transport = transportReturning(200, { code: 'OK', version: 2 });
    const svc = service(transport);
    await svc.reactivate(ORG, { cylinderId: CYL, justification: 'foi engano' });
    await svc.addIdentifier(ORG, { cylinderId: CYL, kind: 'nfc_tag', value: 'N1' });
    await svc.deactivateIdentifier(ORG, { identifierId: 'i1', justification: 'etiqueta perdida' });
    await svc.transferIdentifier(ORG, { value: 'N1', targetCylinderId: CYL, justification: 'reaproveitada' });
    await svc.registerTest(ORG, { cylinderId: CYL, performedOn: '2026-10-01', result: 'approved', reportNumber: null, executor: 'Lab', nextDueOn: '2027-10-01', notes: null });
    await svc.rectifyTest(ORG, { testId: 't1', performedOn: '2026-10-01', result: 'approved', reportNumber: null, executor: 'Lab', nextDueOn: '2027-10-01', notes: null, justification: 'data errada' });
    await svc.saveType(ORG, { gas: 'Hélio', capacityValue: 7, capacityUnit: 'm3', classification: 'medicinal' });
    const operations = transport.call.mock.calls.map((call) => (call[1] as { operation: string }).operation);
    expect(operations).toEqual(['reactivate', 'add_identifier', 'deactivate_identifier', 'transfer_identifier', 'register_test', 'rectify_test', 'save_type']);
    expect(transport.call.mock.calls[3]?.[1]).toMatchObject({ confirmed: true, target_cylinder_id: CYL, value: 'N1' });
  });

  it('nenhuma operação de exclusão existe no serviço (RF-005, CA-003)', () => {
    const names = Object.getOwnPropertyNames(CylinderService.prototype);
    expect(names.filter((name) => /delete|remove|destroy|erase|apagar|excluir/i.test(name))).toEqual([]);
  });
});
