// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest';
import { supabaseUrl } from '../support/auth-harness';
import { bindTestDevice, createTestCylinder, createTestDevice, loadSealFixtures, sql } from '../support/seal-db';
import { SealSimulator } from '../support/seal-simulator';

// Spec 012, US2 (T072), contra o Supabase local real: uma viagem com três cilindros com lacre e um sem lacre começa (na mesma ordem da
// start_trip da Spec 008); saem três comandos de travar; cada lacre simulado recebe o seu na próxima comunicação; o sem lacre fica só
// com o bloqueio lógico; a trava só aparece "travada" depois da confirmação (RF-023, RF-027, RN-001, MS-003).
const ORG_A = '20000000-0000-0000-0000-00000000000a';
const ADMIN_A = '10000000-0000-0000-0000-000000000002';
const run = Date.now().toString(36).toUpperCase();
const devices: { device_id: string; device_code: string; key: string }[] = [];
let tripId = '';

describe('Lacre: trava no início da viagem (Spec 012, US2)', () => {
  beforeAll(() => {
    loadSealFixtures();
    const cylinders = [1, 2, 3, 4].map((i) => createTestCylinder(ORG_A, `TRIPLOCK-${run}-${i}`));
    for (let i = 0; i < 3; i += 1) {
      const key = `k-trip-${run}-${i}`;
      const device = createTestDevice(ORG_A, key, ADMIN_A);
      bindTestDevice(device.device_id, cylinders[i]!, ADMIN_A);
      devices.push({ ...device, key });
    }
    const vehicle = sql(`insert into public.vehicles (organization_id, plate, vehicle_type, capacity_cylinders) values ('${ORG_A}', 'L${run.slice(-2).replace(/[0-9]/g, (d) => "ABCDEFGHIJ"[Number(d)]!)}1A23', 'truck', 10) returning id;`);
    const driver = sql(`insert into public.drivers (organization_id, full_name, cpf_display, cnh_display, cnh_category, cnh_valid_until)
      values ('${ORG_A}', 'Motorista Lacre ${run}', 'x', 'x', 'D', current_date + 365) returning id;`);
    const customer = sql(`insert into public.customers (organization_id, person_type, document_display, legal_name, segment)
      values ('${ORG_A}', 'legal', '11222333000181', 'Cliente Trava ${run}', 'hospital') returning id;`);
    const site = sql(`insert into public.customer_sites (organization_id, customer_id, name, postal_code, street, number, city, state)
      values ('${ORG_A}', '${customer}', 'Unidade ${run}', '01001000', 'Praça da Sé', '1', 'São Paulo', 'SP') returning id;`);
    tripId = sql(`insert into public.trips (organization_id, number, planned_date, vehicle_id, driver_id, status, created_by)
      values ('${ORG_A}', (select coalesce(max(number), 0) + 1000 from public.trips where organization_id = '${ORG_A}'), current_date, '${vehicle}', '${driver}', 'loading', '${ADMIN_A}') returning id;`);
    const stop = sql(`insert into public.trip_stops (organization_id, trip_id, site_id, position) values ('${ORG_A}', '${tripId}', '${site}', 1) returning id;`);
    for (const cylinder of cylinders) {
      sql(`insert into public.trip_items (organization_id, trip_id, stop_id, cylinder_id, item_status, checked_at, created_by)
        values ('${ORG_A}', '${tripId}', '${stop}', '${cylinder}', 'checked', now(), '${ADMIN_A}');`);
    }
    // Início, na ordem da start_trip: primeiro a viagem, depois os itens.
    sql(`update public.trips set status = 'in_progress', started_at = now(), started_by = '${ADMIN_A}' where id = '${tripId}';
         update public.trip_items set item_status = 'in_transit', lock_status = 'locked' where trip_id = '${tripId}' and item_status = 'checked';`);
  });

  it('três comandos de travar, nenhum para o cilindro sem lacre, e a viagem começa sem esperar', () => {
    expect(sql(`select count(*) from public.seal_commands where trip_id = '${tripId}' and kind = 'lock' and origin = 'trip_start'`)).toBe('3');
    expect(sql(`select count(*) from public.trip_items where trip_id = '${tripId}' and seal_command_id is null`)).toBe('1');
    expect(sql(`select status from public.trips where id = '${tripId}'`)).toBe('in_progress');
  });

  it('cada lacre recebe o próprio comando e só depois da confirmação a trava fica "travada"', async () => {
    for (const device of devices) {
      const sim = new SealSimulator({ url: supabaseUrl, deviceCode: device.device_code, key: device.key });
      sim.position({ latitude: -7.2, longitude: -39.3 });
      const first = await sim.send();
      expect(first.status).toBe(200);
      const command = first.body.command as { id: string; kind: string };
      expect(command.kind).toBe('lock');
      expect(sql(`select trip_id from public.seal_commands where id = '${command.id}'`)).toBe(tripId);
      expect(sql(`select lock_state from public.seal_devices where id = '${device.device_id}'`)).toBe('none');
      sim.position({ latitude: -7.2, longitude: -39.3 });
      expect((await sim.send()).status).toBe(200);
      expect(sim.valve).toBe('closed');
      expect(sql(`select lock_state from public.seal_devices where id = '${device.device_id}'`)).toBe('locked');
      expect(sql(`select status from public.seal_commands where id = '${command.id}'`)).toBe('confirmed');
    }
  }, 60_000);
});
