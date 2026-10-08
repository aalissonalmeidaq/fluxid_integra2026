// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createManageRegistryHandler } from '../../supabase/functions/manage-registry/handler';
import { createQueryRegistryHandler } from '../../supabase/functions/query-registry/handler';
import type { OperationsGateway } from '../../supabase/functions/_shared/operations';

// Spec 007, US4: operações de veículo nas duas funções (RF-019 a RF-023). O banco é sempre falso.

const USER = '10000000-0000-4000-8000-000000000002';
const SESSION = '60000000-0000-4000-8000-0000000700a2';
const ORG = '20000000-0000-4000-8000-00000000000a';
const VEHICLE = '85000000-0000-4000-8000-000000000001';

type Gateway = OperationsGateway & { rpc: ReturnType<typeof vi.fn>; audit: ReturnType<typeof vi.fn> };
const gateway = (result: Record<string, unknown> = { code: 'CREATED' }): Gateway => ({
  authenticate: vi.fn(async () => ({ userId: USER, sessionId: SESSION, aal: 'aal1' as const })),
  rpc: vi.fn(async () => result),
  audit: vi.fn(async () => undefined),
}) as never;
const post = (body: unknown) => new Request('http://local/fn', { method: 'POST', headers: { authorization: 'Bearer jwt', 'content-type': 'application/json' }, body: JSON.stringify(body) });
const body = (response: Response) => response.json() as Promise<Record<string, unknown>>;

const vehicle = { operation: 'create_vehicle', organization_id: ORG, plate: 'ABC-1234', vehicle_type: 'truck', capacity_cylinders: 30 };

describe('manage-registry: veículo', () => {
  it('cria o veículo e entrega os argumentos nomeados, com opcionais nulos', async () => {
    const gw = gateway({ code: 'CREATED', vehicle_id: VEHICLE, version: 1 });
    expect((await createManageRegistryHandler(gw)(post({ ...vehicle, brand: 'Marca', max_load_kg: 5000.5, licensing_due_on: '2027-01-31', manufacture_year: 2020 }))).status).toBe(200);
    expect(gw.rpc).toHaveBeenCalledWith('create_vehicle', {
      p_actor: USER, p_session: SESSION, p_organization: ORG, p_plate: 'ABC-1234', p_vehicle_type: 'truck', p_vehicle_type_detail: null, p_brand: 'Marca', p_model: null,
      p_manufacture_year: 2020, p_capacity_cylinders: 30, p_max_load_kg: 5000.5, p_licensing_due_on: '2027-01-31',
    });
  });

  it.each([
    ['tipo fora da lista', { vehicle_type: 'x' }, 'vehicle_type'],
    ['capacidade zero', { capacity_cylinders: 0 }, 'capacity_cylinders'],
    ['capacidade acima de 9999', { capacity_cylinders: 10000 }, 'capacity_cylinders'],
    ['data de licenciamento inválida', { licensing_due_on: '2027-02-30' }, 'licensing_due_on'],
    ['carga negativa', { max_load_kg: -1 }, 'max_load_kg'],
    ['marca longa', { brand: 'x'.repeat(61) }, 'brand'],
  ] as const)('recusa: %s', async (_nome, extra, campo) => {
    const gw = gateway();
    const response = await createManageRegistryHandler(gw)(post({ ...vehicle, ...extra }));
    expect(response.status).toBe(400);
    expect(((await body(response)).fields as Array<{ field: string }>).map((f) => f.field)).toContain(campo);
    expect(gw.rpc).not.toHaveBeenCalled();
  });

  it('edita com versão e justificativa; muda a situação com a versão esperada', async () => {
    const gw = gateway({ code: 'UPDATED', version: 2 });
    await createManageRegistryHandler(gw)(post({ ...vehicle, operation: 'update_vehicle', vehicle_id: VEHICLE, expected_version: 1, justification: 'Placa digitada errada' }));
    expect(gw.rpc).toHaveBeenCalledWith('update_vehicle', expect.objectContaining({ p_vehicle: VEHICLE, p_expected_version: 1, p_justification: 'Placa digitada errada' }));
    const status = gateway({ code: 'STATUS_CHANGED', version: 3 });
    expect((await createManageRegistryHandler(status)(post({ operation: 'change_vehicle_status', organization_id: ORG, vehicle_id: VEHICLE, expected_version: 2, status: 'maintenance' }))).status).toBe(200);
    expect(status.rpc).toHaveBeenCalledWith('change_vehicle_status', expect.objectContaining({ p_status: 'maintenance', p_justification: null }));
    expect((await createManageRegistryHandler(gateway())(post({ operation: 'change_vehicle_status', organization_id: ORG, vehicle_id: VEHICLE, expected_version: 2, status: 'deleted' }))).status).toBe(400);
  });

  it('placa repetida volta 409 com o veículo existente', async () => {
    const response = await createManageRegistryHandler(gateway({ code: 'PLATE_CONFLICT', vehicle_id: VEHICLE, plate: 'ABC1234' }))(post(vehicle));
    expect(response.status).toBe(409);
    expect(await body(response)).toEqual({ code: 'PLATE_CONFLICT', vehicle_id: VEHICLE, plate: 'ABC1234' });
  });
});

describe('query-registry: veículos', () => {
  it('lista com busca, situação, tipo e licenciamento', async () => {
    const gw = gateway({ code: 'LISTED', items: [], total: 0, next: null });
    await createQueryRegistryHandler(gw)(post({ operation: 'list_vehicles', organization_id: ORG, search: 'abc', status: 'maintenance', vehicle_type: 'van', licensing_status: 'a_vencer', sort: 'plate_desc', limit: 10 }));
    expect(gw.rpc.mock.calls[0]?.[1]).toMatchObject({ p_search: 'abc', p_status: 'maintenance', p_vehicle_type: 'van', p_licensing_status: 'a_vencer', p_sort: 'plate_desc', p_limit: 10 });
  });

  it.each([[{ status: 'todos' }], [{ vehicle_type: 'x' }], [{ licensing_status: 'x' }], [{ sort: 'x' }]])('filtro %j fora do contrato é recusado', async (extra) => {
    const gw = gateway();
    expect((await createQueryRegistryHandler(gw)(post({ operation: 'list_vehicles', organization_id: ORG, ...extra }))).status).toBe(400);
    expect(gw.rpc).not.toHaveBeenCalled();
  });

  it('get_vehicle exige UUID', async () => {
    const gw = gateway({ code: 'FOUND' });
    expect((await createQueryRegistryHandler(gw)(post({ operation: 'get_vehicle', organization_id: ORG, vehicle_id: 'x' }))).status).toBe(400);
    expect((await createQueryRegistryHandler(gw)(post({ operation: 'get_vehicle', organization_id: ORG, vehicle_id: VEHICLE }))).status).toBe(200);
  });
});
