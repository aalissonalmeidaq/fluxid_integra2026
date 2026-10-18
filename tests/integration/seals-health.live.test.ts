// @vitest-environment node
import crypto from 'node:crypto';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { supabaseUrl } from '../support/auth-harness';
import { ageDevice, bindTestDevice, createTestCylinder, createTestDevice, loadSealFixtures, sql } from '../support/seal-db';
import { SealSimulator } from '../support/seal-simulator';

// Spec 012, US6 (T058), contra o Supabase local real: um lacre avisa o desligamento, outro para de enviar sem avisar (sob vigilância de
// geocerca) e um terceiro fica no estoque. Sem ação humana, a verificação automática (a mesma função que o pg_cron chama a cada minuto)
// marca a saúde e abre os alertas; o possível extravio vira notificação push cifrada, entregue pela função seal-push (via pg_net) a um
// receptor de teste em até 30 s (RNF-001a, RNF-003, MS-006). Exige seal-gateway e seal-push carregadas e as chaves VAPID de
// desenvolvimento em supabase/functions/.env (quickstart.md).
const ORG_A = '20000000-0000-0000-0000-00000000000a';
const ADMIN_A = '10000000-0000-0000-0000-000000000002';
const run = Date.now().toString(36).toUpperCase();

// Receptor de push falso: chaves de um "navegador" e decifragem RFC 8291 (aes128gcm).
const browser = crypto.createECDH('prime256v1');
browser.generateKeys();
const authSecret = crypto.randomBytes(16);
const received: { title: string; body: string; url: string }[] = [];
const hkdf = (salt: Buffer, ikm: Buffer, info: Buffer, len: number) => Buffer.from(crypto.hkdfSync('sha256', ikm, salt, info, len));
function decrypt(body: Buffer): string {
  const salt = body.subarray(0, 16);
  const idlen = body[20]!;
  const serverKey = body.subarray(21, 21 + idlen);
  const cipher = body.subarray(21 + idlen);
  const ikm = hkdf(authSecret, browser.computeSecret(serverKey), Buffer.concat([Buffer.from('WebPush: info\0'), browser.getPublicKey(), serverKey]), 32);
  const decipher = crypto.createDecipheriv('aes-128-gcm', hkdf(salt, ikm, Buffer.from('Content-Encoding: aes128gcm\0'), 16), hkdf(salt, ikm, Buffer.from('Content-Encoding: nonce\0'), 12));
  decipher.setAuthTag(cipher.subarray(cipher.length - 16));
  const plain = Buffer.concat([decipher.update(cipher.subarray(0, cipher.length - 16)), decipher.final()]);
  return plain.subarray(0, plain.lastIndexOf(2)).toString('utf8');
}
const server = http.createServer((req, res) => {
  const chunks: Buffer[] = [];
  req.on('data', (c: Buffer) => chunks.push(c));
  req.on('end', () => {
    try { received.push(JSON.parse(decrypt(Buffer.concat(chunks))) as { title: string; body: string; url: string }); } catch { /* corpo inválido: o teste falha pela ausência */ }
    res.writeHead(201).end();
  });
});

const until = async (check: () => boolean, ms: number) => {
  const start = Date.now();
  while (!check() && Date.now() - start < ms) await new Promise((r) => setTimeout(r, 250));
  return check();
};

let watched = { device_id: '', device_code: '' };
let stock = { device_id: '', device_code: '' };
let off = { device_id: '', device_code: '' };
let cylWatched = '';

describe('Lacre: saúde, alertas e notificação sem ação humana (Spec 012, US6)', () => {
  beforeAll(async () => {
    loadSealFixtures();
    await new Promise<void>((resolve) => server.listen(0, '0.0.0.0', resolve));
    const port = (server.address() as AddressInfo).port;
    cylWatched = createTestCylinder(ORG_A, `HEALTH-W-${run}`);
    const cylStock = createTestCylinder(ORG_A, `HEALTH-S-${run}`);
    watched = createTestDevice(ORG_A, `k-w-${run}`, ADMIN_A);
    stock = createTestDevice(ORG_A, `k-s-${run}`, ADMIN_A);
    off = createTestDevice(ORG_A, `k-o-${run}`, ADMIN_A);
    bindTestDevice(watched.device_id, cylWatched, ADMIN_A);
    bindTestDevice(stock.device_id, cylStock, ADMIN_A);
    // Cilindro "no cliente", sob vigilância de geocerca (a abertura da vigilância pela entrega é da US4).
    const site = sql(`insert into public.customers (organization_id, person_type, document_display, legal_name, segment)
      values ('${ORG_A}', 'legal', '11222333000181', 'Cliente Lacre ${run}', 'hospital') returning id;`);
    const siteId = sql(`insert into public.customer_sites (organization_id, customer_id, name, postal_code, street, number, city, state)
      values ('${ORG_A}', '${site}', 'Unidade ${run}', '01001000', 'Praça da Sé', '1', 'São Paulo', 'SP') returning id;`);
    sql(`insert into public.geofences (organization_id, site_id, name, shape, center, radius_m, area) values ('${ORG_A}', '${siteId}', 'Pátio ${run}', 'circle',
      extensions.st_setsrid(extensions.st_makepoint(-39.3, -7.2), 4326)::extensions.geography, 150,
      extensions.st_buffer(extensions.st_setsrid(extensions.st_makepoint(-39.3, -7.2), 4326)::extensions.geography, 150));`);
    sql(`insert into public.seal_watches (organization_id, cylinder_id, device_id, site_id) values ('${ORG_A}', '${cylWatched}', '${watched.device_id}', '${siteId}');`);
    // Inscrição de notificação do administrador A apontando para o receptor de teste (fora do contrato https, só aqui).
    sql(`insert into public.push_subscriptions (organization_id, user_id, endpoint, p256dh, auth_secret) values ('${ORG_A}', '${ADMIN_A}',
      'http://host.docker.internal:${port}/push-${run}', '${browser.getPublicKey().toString('base64url')}', '${authSecret.toString('base64url')}');`);
  }, 60_000);

  afterAll(async () => {
    sql(`update public.push_subscriptions set revoked_at = now(), revoke_reason = 'user' where endpoint like '%/push-${run}' and revoked_at is null;`);
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('o aviso de desligamento muda a saúde na hora e abre o alerta de lacre desligado (fora de viagem e de vigilância)', async () => {
    const sim = new SealSimulator({ url: supabaseUrl, deviceCode: off.device_code, key: `k-o-${run}` });
    sim.shutdown({ latitude: -7.2, longitude: -39.3 });
    expect((await sim.send()).status).toBe(200);
    expect(sql(`select health from public.seal_devices where id = '${off.device_id}'`)).toBe('off');
    expect(sql(`select severity || ':' || requires_push from public.seal_alerts where device_id = '${off.device_id}' and kind = 'device_off'`)).toBe('medium:false');
  });

  it('silêncio: estoque vira alerta médio sem notificação; sob vigilância, possível extravio com notificação em até 30 s', async () => {
    for (const [device, key] of [[watched, `k-w-${run}`], [stock, `k-s-${run}`]] as const) {
      const sim = new SealSimulator({ url: supabaseUrl, deviceCode: device.device_code, key });
      sim.position({ latitude: -7.2, longitude: -39.3 });
      expect((await sim.send()).status).toBe(200);
      ageDevice(device.device_id, 120);
    }
    const openedAt = Date.now();
    sql('select private.run_seal_watchdog();');
    expect(sql(`select health from public.seal_devices where id = '${stock.device_id}'`)).toBe('no_comm');
    expect(sql(`select kind || ':' || severity || ':' || requires_push from public.seal_alerts where device_id = '${stock.device_id}'`)).toBe('no_comm:medium:false');
    expect(sql(`select kind || ':' || severity from public.seal_alerts where device_id = '${watched.device_id}'`)).toBe('possible_loss:high');

    expect(await until(() => received.some((m) => m.title.includes('possível extravio')), 30_000)).toBe(true);
    expect(Date.now() - openedAt).toBeLessThan(30_000);
    const message = received.find((m) => m.title.includes('possível extravio'))!;
    expect(message.body).toContain(`HEALTH-W-${run}`);
    expect(message.url).toMatch(/^\/alertas\/[0-9a-f-]{36}$/);
    expect(JSON.stringify(message)).not.toMatch(/-7\.2|-39\.3|Cliente Lacre/);
    expect(sql(`select count(*) from public.push_outbox o join public.seal_alerts a on a.id = o.alert_id where a.device_id = '${stock.device_id}'`)).toBe('0');
  }, 60_000);

  it('a volta com GPS devolve "funcionando", registra a volta no alerta e manda a notificação de retorno', async () => {
    const sim = new SealSimulator({ url: supabaseUrl, deviceCode: watched.device_code, key: `k-w-${run}` });
    sim.position({ latitude: -7.2, longitude: -39.3 });
    expect((await sim.send()).status).toBe(200);
    expect(sql(`select health from public.seal_devices where id = '${watched.device_id}'`)).toBe('ok');
    expect(sql(`select status || ':' || (recovered_at is not null) from public.seal_alerts where device_id = '${watched.device_id}' and kind = 'possible_loss'`)).toBe('open:true');
    expect(await until(() => received.some((m) => m.title.includes('voltou a comunicar')), 30_000)).toBe(true);
    expect(sql(`select count(*) from public.cylinders where id = '${cylWatched}' and status = 'active'`)).toBe('1');
  }, 60_000);
});
