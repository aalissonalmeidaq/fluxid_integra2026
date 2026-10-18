// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest';
import { supabaseUrl } from '../support/auth-harness';
import { bindTestDevice, createTestCylinder, createTestDevice, loadSealFixtures, sql } from '../support/seal-db';
import { SealSimulator } from '../support/seal-simulator';

// Spec 012, US4 (T087), contra o Supabase local real: um cilindro entregue e destravado dentro da geocerca de um cliente sai dela com
// duas posições com GPS; a violação abre, o comando de travar vai já na resposta do envio que a causou, o lacre confirma e o cilindro
// fica "travado por violação de geocerca". Outro lacre, que travou sozinho sem rede, volta com as leituras e o aviso (MS-005, MS-011).
const ORG_A = '20000000-0000-0000-0000-00000000000a';
const ADMIN_A = '10000000-0000-0000-0000-000000000002';
const run = Date.now().toString(36).toUpperCase();
const center = { latitude: -7.7, longitude: -39.7 };
const devices: { device_id: string; device_code: string; key: string }[] = [];

describe('Lacre: violação de geocerca e trava pelo próprio lacre (Spec 012, US4)', () => {
  beforeAll(() => {
    loadSealFixtures();
    const customer = sql(`insert into public.customers (organization_id, person_type, document_display, legal_name, segment)
      values ('${ORG_A}', 'legal', '11222333000181', 'Cliente Cerca ${run}', 'hospital') returning id;`);
    const site = sql(`insert into public.customer_sites (organization_id, customer_id, name, postal_code, street, number, city, state)
      values ('${ORG_A}', '${customer}', 'Unidade ${run}', '01001000', 'Praça da Sé', '1', 'São Paulo', 'SP') returning id;`);
    sql(`insert into public.geofences (organization_id, site_id, name, shape, center, radius_m, area) values ('${ORG_A}', '${site}', 'Pátio ${run}', 'circle',
      extensions.st_setsrid(extensions.st_makepoint(${center.longitude}, ${center.latitude}), 4326)::extensions.geography, 150,
      extensions.st_buffer(extensions.st_setsrid(extensions.st_makepoint(${center.longitude}, ${center.latitude}), 4326)::extensions.geography, 150));`);
    for (let i = 0; i < 2; i += 1) {
      const key = `k-geo-${run}-${i}`;
      const cylinder = createTestCylinder(ORG_A, `GEO-${run}-${i}`);
      const device = createTestDevice(ORG_A, key, ADMIN_A);
      bindTestDevice(device.device_id, cylinder, ADMIN_A);
      sql(`update public.seal_devices set lock_state = 'unlocked' where id = '${device.device_id}';
           insert into public.seal_watches (organization_id, cylinder_id, device_id, site_id) values ('${ORG_A}', '${cylinder}', '${device.device_id}', '${site}');`);
      devices.push({ ...device, key });
    }
  });

  it('saída da geocerca: violação, trava na mesma resposta, confirmação e "travado por violação"', async () => {
    const sim = new SealSimulator({ url: supabaseUrl, deviceCode: devices[0]!.device_code, key: devices[0]!.key });
    sim.position(center);
    const first = await sim.send();
    expect((first.body.watch as { active: boolean; fences: unknown[] }).active).toBe(true);
    expect(sim.watch.fences).toHaveLength(1);
    sim.position({ ...center, latitude: center.latitude + 0.005 });
    expect((await sim.send()).body.command).toBeNull();
    sim.position({ ...center, latitude: center.latitude + 0.006 });
    const caused = await sim.send();
    expect((caused.body.command as { kind: string }).kind).toBe('lock');
    expect(sql(`select count(*) from public.seal_violations where device_id = '${devices[0]!.device_id}' and status = 'open'`)).toBe('1');
    sim.position({ ...center, latitude: center.latitude + 0.006 });
    await sim.send();
    expect(sim.valve).toBe('closed');
    expect(sql(`select lock_state from public.seal_devices where id = '${devices[0]!.device_id}'`)).toBe('locked_violation');
    expect(sql(`select severity from public.seal_alerts where device_id = '${devices[0]!.device_id}' and kind = 'geofence_violation'`)).toBe('high');
  }, 60_000);

  it('trava pelo próprio lacre: registrada ao voltar, com alerta e sem novo comando', async () => {
    const sim = new SealSimulator({ url: supabaseUrl, deviceCode: devices[1]!.device_code, key: devices[1]!.key });
    const start = Date.now() - 5 * 60_000;
    sim.position({ ...center, latitude: center.latitude + 0.005 }, new Date(start).toISOString());
    sim.position({ ...center, latitude: center.latitude + 0.006 }, new Date(start + 60_000).toISOString());
    sim.autoLock({ ...center, latitude: center.latitude + 0.006 }, new Date(start + 180_000).toISOString());
    const back = await sim.send();
    expect(back.body.command).toBeNull();
    expect(sql(`select lock_state from public.seal_devices where id = '${devices[1]!.device_id}'`)).toBe('locked_comm_loss');
    expect(sql(`select count(*) from public.seal_alerts where device_id = '${devices[1]!.device_id}' and kind = 'comm_loss_lock'`)).toBe('1');
    expect(sql(`select count(*) from public.seal_commands where device_id = '${devices[1]!.device_id}'`)).toBe('0');
  }, 60_000);
});
