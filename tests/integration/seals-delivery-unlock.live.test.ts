// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest';
import { supabaseUrl } from '../support/auth-harness';
import { bindTestDevice, createTestCylinder, createTestDevice, loadSealFixtures, sql } from '../support/seal-db';
import { SealSimulator } from '../support/seal-simulator';

// Spec 012, US3 (T080), contra o Supabase local real: dois cilindros com lacre travado são entregues na mesma parada; o lacre do primeiro
// manda a posição dentro da geocerca da unidade e o do segundo, fora. Só o primeiro recebe o destravamento na próxima comunicação, e a
// trava só fica "destravada" depois da confirmação (RF-024, RN-001, MS-004). A entrega é gravada como a register_delivery faz.
const ORG_A = '20000000-0000-0000-0000-00000000000a';
const ADMIN_A = '10000000-0000-0000-0000-000000000002';
const run = Date.now().toString(36).toUpperCase();
const inside = { latitude: -7.6, longitude: -39.6 };
const outside = { latitude: -7.61, longitude: -39.6 };
let tripId = '';
let stopId = '';
const items: string[] = [];
const devices: { device_id: string; device_code: string; key: string }[] = [];

describe('Lacre: destravar na entrega dentro da geocerca (Spec 012, US3)', () => {
  beforeAll(() => {
    loadSealFixtures();
    const cylinders = [1, 2].map((i) => createTestCylinder(ORG_A, `DLV-${run}-${i}`));
    for (let i = 0; i < 2; i += 1) {
      const key = `k-dlv-${run}-${i}`;
      const device = createTestDevice(ORG_A, key, ADMIN_A);
      bindTestDevice(device.device_id, cylinders[i]!, ADMIN_A);
      sql(`update public.seal_devices set lock_state = 'locked' where id = '${device.device_id}';`);
      devices.push({ ...device, key });
    }
    const customer = sql(`insert into public.customers (organization_id, person_type, document_display, legal_name, segment)
      values ('${ORG_A}', 'legal', '11222333000181', 'Cliente Entrega ${run}', 'hospital') returning id;`);
    const site = sql(`insert into public.customer_sites (organization_id, customer_id, name, postal_code, street, number, city, state)
      values ('${ORG_A}', '${customer}', 'Unidade ${run}', '01001000', 'Praça da Sé', '1', 'São Paulo', 'SP') returning id;`);
    sql(`insert into public.geofences (organization_id, site_id, name, shape, center, radius_m, area) values ('${ORG_A}', '${site}', 'Pátio ${run}', 'circle',
      extensions.st_setsrid(extensions.st_makepoint(${inside.longitude}, ${inside.latitude}), 4326)::extensions.geography, 150,
      extensions.st_buffer(extensions.st_setsrid(extensions.st_makepoint(${inside.longitude}, ${inside.latitude}), 4326)::extensions.geography, 150));`);
    const vehicle = sql(`insert into public.vehicles (organization_id, plate, vehicle_type, capacity_cylinders) values ('${ORG_A}', 'D${run.slice(-2).replace(/[0-9]/g, (d) => "ABCDEFGHIJ"[Number(d)]!)}2B34', 'truck', 10) returning id;`);
    const driver = sql(`insert into public.drivers (organization_id, full_name, cpf_display, cnh_display, cnh_category, cnh_valid_until)
      values ('${ORG_A}', 'Motorista Entrega ${run}', 'x', 'x', 'D', current_date + 365) returning id;`);
    tripId = sql(`insert into public.trips (organization_id, number, planned_date, vehicle_id, driver_id, status, started_at, started_by, created_by)
      values ('${ORG_A}', (select coalesce(max(number), 0) + 1000 from public.trips where organization_id = '${ORG_A}'), current_date, '${vehicle}', '${driver}',
      'in_progress', now(), '${ADMIN_A}', '${ADMIN_A}') returning id;`);
    stopId = sql(`insert into public.trip_stops (organization_id, trip_id, site_id, position, status, arrived_at, arrived_by)
      values ('${ORG_A}', '${tripId}', '${site}', 1, 'on_site', now(), '${ADMIN_A}') returning id;`);
    for (const cylinder of cylinders) {
      items.push(sql(`insert into public.trip_items (organization_id, trip_id, stop_id, cylinder_id, item_status, lock_status, checked_at, created_by)
        values ('${ORG_A}', '${tripId}', '${stopId}', '${cylinder}', 'in_transit', 'locked', now(), '${ADMIN_A}') returning id;`));
    }
  });

  it('só o lacre dentro da geocerca destrava, e só depois da confirmação', async () => {
    const sims = devices.map((d) => new SealSimulator({ url: supabaseUrl, deviceCode: d.device_code, key: d.key }));
    sims[0]!.position(inside);
    sims[1]!.position(outside);
    for (const sim of sims) expect((await sim.send()).status).toBe(200);

    // Entrega como a register_delivery: itens primeiro, depois o registro (posição do celular por GPS, dentro da cerca).
    sql(`update public.trip_items set item_status = 'delivered' where trip_id = '${tripId}';
      insert into public.trip_deliveries (organization_id, stop_id, request_id, delivered_at, recipient_name, latitude, longitude, results, recorded_by, position_source, position_read_at)
      values ('${ORG_A}', '${stopId}', gen_random_uuid(), now(), 'Recebedor Fictício', ${inside.latitude}, ${inside.longitude},
        '[{"item_id": "${items[0]}", "delivered": true}, {"item_id": "${items[1]}", "delivered": true}]'::jsonb, '${ADMIN_A}', 'gps', now());`);

    sims[0]!.position(inside);
    const first = await sims[0]!.send();
    expect((first.body.command as { kind: string }).kind).toBe('unlock');
    expect(sql(`select lock_state from public.seal_devices where id = '${devices[0]!.device_id}'`)).toBe('locked');
    sims[0]!.position(inside);
    await sims[0]!.send();
    expect(sims[0]!.valve).toBe('open');
    expect(sql(`select lock_state from public.seal_devices where id = '${devices[0]!.device_id}'`)).toBe('unlocked');

    sims[1]!.position(outside);
    expect((await sims[1]!.send()).body.command).toBeNull();
    expect(sql(`select seal_unlock_note from public.trip_items where id = '${items[1]}'`)).toBe('outside_geofence');
    expect(sql(`select lock_state from public.seal_devices where id = '${devices[1]!.device_id}'`)).toBe('locked');
  }, 60_000);
});
