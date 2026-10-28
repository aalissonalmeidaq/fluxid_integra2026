// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { publishableKey, supabaseUrl } from '../support/auth-harness';
import { bindTestDevice, createTestCylinder, createTestDevice, loadSealFixtures, sql } from '../support/seal-db';

// Spec 015, T091 (US6; RF-034, RF-035), contra o Supabase local real: a função email-notifications reclama com o segredo do Vault, envia
// pelo provedor falso e relata; chamar de novo não reenvia; a recusa do provedor fica visível como falha e não muda nem duplica o alerta.
// A preparação (categorias, escolha e alertas) é feita direto no banco local; nada aqui roda contra a nuvem. Exige a função carregada
// (`npx supabase stop` e `npx supabase start`) e `EMAIL_PROVIDER=fake` em supabase/functions/.env.
const ORG_A = '20000000-0000-0000-0000-00000000000a';
const ADMIN_A = '10000000-0000-0000-0000-000000000002';
const run = Date.now().toString(36);

const invoke = async (headers: Record<string, string>) => {
  const response = await fetch(`${supabaseUrl}/functions/v1/email-notifications`, {
    method: 'POST', headers: { apikey: publishableKey, 'content-type': 'application/json', ...headers }, body: '{}',
  });
  return { status: response.status, body: await response.json().catch(() => null) as Record<string, unknown> | null };
};
const outbox = (alert: string) => sql(`select string_agg(status || ':' || coalesce(last_error_code, '-'), ',' order by transition)
  from public.email_notification_outbox where occurrence_id = '${alert}';`);

describe('Envio dos avisos por e-mail ao vivo (Spec 015)', () => {
  let secret = '';
  let device = '';

  beforeAll(() => {
    loadSealFixtures();
    secret = sql(`select decrypted_secret from vault.decrypted_secrets where name = 'email_notifications_secret';`);
    const created = createTestDevice(ORG_A, `k-email-${run}`, ADMIN_A);
    device = created.device_id;
    bindTestDevice(device, createTestCylinder(ORG_A, `EML-${run}`), ADMIN_A);
    // Categoria liberada e escolha do administrador A (que lê lacres), como as RPCs gravariam.
    sql(`insert into public.email_notification_categories (organization_id, category, enabled, version) values ('${ORG_A}', 'seal_high_critical', true, 1)
      on conflict (organization_id, category) do update set enabled = true;
      insert into public.email_notification_preferences (organization_id, user_id, category, enabled) values ('${ORG_A}', '${ADMIN_A}', 'seal_high_critical', true)
      on conflict (organization_id, user_id, category) do update set enabled = true;`);
  }, 60_000);

  afterAll(() => {
    sql(`update public.email_notification_categories set enabled = false where organization_id = '${ORG_A}';
      update public.email_notification_preferences set enabled = false where organization_id = '${ORG_A}' and user_id = '${ADMIN_A}';`);
  });

  it('sem o segredo, a função recusa', async () => {
    expect((await invoke({})).status).toBe(401);
    expect((await invoke({ 'x-email-notifications-secret': 'errado' })).status).toBe(401);
  });

  it('alerta alto: um aviso enviado pelo provedor falso; chamar de novo não reenvia', async () => {
    const alert = sql(`select private.open_seal_alert('${device}', 'seal_open', 'high', 'device', '{}', false);`);
    expect(outbox(alert)).toBe('pending:-');
    const first = await invoke({ 'x-email-notifications-secret': secret });
    expect(first.status, JSON.stringify(first.body)).toBe(200);
    expect(outbox(alert)).toBe('sent:-');
    expect(sql(`select provider_message_ref like 'fake-%' from public.email_notification_outbox where occurrence_id = '${alert}';`)).toBe('t');
    await invoke({ 'x-email-notifications-secret': secret });
    expect(sql(`select count(*) from public.email_notification_outbox where occurrence_id = '${alert}';`)).toBe('1');
    expect(outbox(alert)).toBe('sent:-');
  });

  it('recusa do provedor: falha visível, e o alerta continua igual e único', async () => {
    const alert = sql(`select private.open_seal_alert('${device}', 'seal_broken', 'critical', 'device', '{}', false);`);
    const before = sql(`select status || '|' || updated_at || '|' || context::text from public.seal_alerts where id = '${alert}';`);
    const response = await invoke({ 'x-email-notifications-secret': secret, 'x-email-fake-outcome': 'rejected' });
    expect(response.status).toBe(200);
    expect(outbox(alert)).toBe('failed:DELIVERY_REJECTED');
    expect(sql(`select status || '|' || updated_at || '|' || context::text from public.seal_alerts where id = '${alert}';`)).toBe(before);
    expect(sql(`select count(*) from public.seal_alerts where device_id = '${device}' and kind = 'seal_broken';`)).toBe('1');
    // Relatar de novo (outra chamada) não ressuscita o item com falha.
    await invoke({ 'x-email-notifications-secret': secret });
    expect(outbox(alert)).toBe('failed:DELIVERY_REJECTED');
  });

  it('provedor indisponível agenda nova tentativa sem enviar', async () => {
    const alert = sql(`select private.open_seal_alert('${device}', 'geofence_violation', 'high', 'system', '{}', false);`);
    await invoke({ 'x-email-notifications-secret': secret, 'x-email-fake-outcome': 'unavailable' });
    expect(outbox(alert)).toBe('retry:PROVIDER_UNAVAILABLE');
    expect(sql(`select next_attempt_at > now() from public.email_notification_outbox where occurrence_id = '${alert}';`)).toBe('t');
  });
});
