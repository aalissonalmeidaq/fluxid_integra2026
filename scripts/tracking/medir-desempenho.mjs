// Ensaio de desempenho da Spec 015 (T103; RF-007h, CS-001, CS-006, CS-016) contra o Supabase LOCAL, pelas mesmas Edge Functions do
// aplicativo. Só roda com endereço local: grava dados sintéticos na empresa de demonstração e não deve tocar outro ambiente.
//
// 1. Fila de 480 posições: a pessoa motorista envia 480 posições acumuladas (8 horas a uma por minuto) em lotes de até 100; todas
//    precisam ser gravadas uma única vez, e reenviar o lote não duplica nada.
// 2. Atualização em até 10 s: o gestor escuta o canal privado `tracking:<empresa>`; para cada posição enviada mede-se o tempo do envio
//    até o aviso chegar e a consulta da viagem mostrar a nova posição. Meta: p95 ≤ 10 s.
// 3. Exportação de 10.000 linhas: grava 10.000 alertas encerrados num dia isolado (um dia novo por execução; o histórico de lacres
//    não aceita exclusão, então eles ficam até o próximo `db reset`), pede o CSV e mede do pedido até `ready`. Meta: ≤ 30 s.
//
// Pré-requisitos: `npx supabase start` com as funções carregadas e a viagem indicada em `planned` ou `loading` (padrão: viagem 3 da
// demonstração, depois de `npm run demo:restaurar` ou `npx supabase db reset`). A viagem é iniciada pelo próprio ensaio.
//
// Uso: FLUXID_PUBLISHABLE_KEY=<chave publicável local> node scripts/tracking/medir-desempenho.mjs
// Opcionais: SUPABASE_URL, FLUXID_ADMIN_EMAIL/FLUXID_ADMIN_PASSWORD, FLUXID_DRIVER_EMAIL/FLUXID_DRIVER_PASSWORD, FLUXID_TRIP_ID,
// FLUXID_DB_CONTAINER, AMOSTRAS (padrão 20).
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const URL_BASE = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const KEY = process.env.FLUXID_PUBLISHABLE_KEY ?? '';
const ORG = process.env.FLUXID_ORGANIZATION_ID ?? '5478e9e3-155b-482f-b843-3513e0938dd6';
const TRIP = process.env.FLUXID_TRIP_ID ?? '63eaa065-88c0-4b53-9378-a4a178ebe520';
const DB = process.env.FLUXID_DB_CONTAINER ?? 'supabase_db_fluxid';
const SAMPLES = Number(process.env.AMOSTRAS ?? 20);
// Contas da demonstração local, lidas da fonte única (src/domain/demo/acessos-demonstracao.json): nenhuma senha escrita aqui.
const DEMO = JSON.parse(readFileSync(new URL('../../src/domain/demo/acessos-demonstracao.json', import.meta.url), 'utf8'));
const demoAccount = (email) => {
  const account = DEMO.accounts.find((item) => item.email === email);
  return { email, password: account?.password ?? '' };
};
const ADMIN = process.env.FLUXID_ADMIN_EMAIL
  ? { email: process.env.FLUXID_ADMIN_EMAIL, password: process.env.FLUXID_ADMIN_PASSWORD ?? '' } : demoAccount('tenant_admin@demo.fluxid.invalid');
const DRIVER = process.env.FLUXID_DRIVER_EMAIL
  ? { email: process.env.FLUXID_DRIVER_EMAIL, password: process.env.FLUXID_DRIVER_PASSWORD ?? '' } : demoAccount('driver@demo.fluxid.invalid');

if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(URL_BASE)) throw new Error('O ensaio só roda contra o Supabase local.');
if (!KEY) throw new Error('Informe FLUXID_PUBLISHABLE_KEY (npx supabase status).');

const call = async (fn, body, token) => {
  const response = await fetch(`${URL_BASE}/functions/v1/${fn}`, {
    method: 'POST', headers: { 'content-type': 'application/json', apikey: KEY, ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json().catch(() => ({})) };
};
const ok = (result, label) => {
  if (result.status !== 200) throw new Error(`${label}: HTTP ${result.status} ${JSON.stringify(result.body)}`);
  return result.body;
};
const sql = (text) => execFileSync('docker', ['exec', '-i', DB, 'psql', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '-tAq'], { input: text, encoding: 'utf8' }).trim();
const percentile = (values, p) => { const sorted = [...values].sort((a, b) => a - b); return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)]; };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const results = [];
const record = (name, value, goal, pass) => { results.push({ name, value, goal, pass }); console.log(`${pass ? 'OK  ' : 'FALHOU'} ${name}: ${value} (meta: ${goal})`); };

async function login(credentials) {
  const body = ok(await call('session-login', credentials), `entrada de ${credentials.email}`);
  return body.session.access_token;
}

// ---- Preparação: viagem em andamento e sessão de coleta da pessoa motorista ----
const adminToken = await login(ADMIN);
const driverToken = await login(DRIVER);
const detail = () => call('query-trips', { operation: 'get_trip', organization_id: ORG, trip_id: TRIP }, adminToken).then((r) => ok(r, 'get_trip'));
const trip = () => detail().then((body) => body.trip);
let current = await trip();
if (current.status === 'planned') {
  ok(await call('manage-trips', { operation: 'start_loading', organization_id: ORG, request_id: randomUUID(), trip_id: TRIP, expected_version: current.version }, adminToken), 'start_loading');
  current = await trip();
}
if (current.status === 'loading') {
  // Conferência de carregamento de cada cilindro, como no aplicativo.
  for (const item of (await detail()).items) {
    if (item.item_status === 'pending' || item.checked_at == null) {
      const checked = await call('manage-trips', { operation: 'check_item', organization_id: ORG, request_id: randomUUID(), trip_id: TRIP, item_id: item.id }, adminToken);
      if (checked.status !== 200 && checked.body.code !== 'ALREADY_CHECKED') ok(checked, 'check_item');
    }
  }
  current = await trip();
  ok(await call('manage-trips', { operation: 'start_trip', organization_id: ORG, request_id: randomUUID(), trip_id: TRIP, expected_version: current.version }, adminToken), 'start_trip');
  current = await trip();
}
if (current.status !== 'in_progress') throw new Error(`A viagem precisa estar em andamento; está em ${current.status}.`);
const installation = randomUUID();
const started = ok(await call('manage-tracking', {
  operation: 'start_tracking_session', organization_id: ORG, request_id: randomUUID(), trip_id: TRIP, device_installation_id: installation,
  platform: 'android_native', capability: 'full', notifications_denied: false,
}, driverToken), 'start_tracking_session');
const trackingSession = started.session.id;
let sequence = 0;
const position = (observedAt) => ({
  client_position_id: randomUUID(), sequence_no: (sequence += 1), observed_at: observedAt,
  latitude: -7.2306 + sequence * 0.00001, longitude: -39.3133 + sequence * 0.00001, accuracy_m: 12,
});
const ingest = (positions) => call('manage-tracking', {
  operation: 'ingest_driver_positions', organization_id: ORG, request_id: randomUUID(), tracking_session_id: trackingSession,
  device_installation_id: installation, positions,
}, driverToken).then((r) => ok(r, 'ingest_driver_positions'));

// ---- 1. Fila de 480 posições ----
// O servidor só aceita posição posterior ao início da viagem: as 480 cabem entre o início e agora, na ordem em que foram coletadas.
const tripStart = Date.parse(current.started_at ?? new Date().toISOString());
const span = Math.max(Date.now() - tripStart - 1000, 480);
const backlog = Array.from({ length: 480 }, (_, index) => position(new Date(tripStart + Math.floor(((index + 1) / 481) * span)).toISOString()));
const backlogStart = performance.now();
let stored = 0;
for (let index = 0; index < backlog.length; index += 100) {
  stored += (await ingest(backlog.slice(index, index + 100))).results.filter((item) => item.status === 'stored').length;
}
const backlogMs = Math.round(performance.now() - backlogStart);
let duplicates = 0;
for (let index = 0; index < backlog.length; index += 100) {
  duplicates += (await ingest(backlog.slice(index, index + 100))).results.filter((item) => item.status === 'duplicate').length;
}
const inDatabase = Number(sql(`select count(*) from public.mobile_positions where tracking_session_id = '${trackingSession}';`));
record('480 posições acumuladas gravadas uma vez', `${stored} gravadas, ${inDatabase} no banco, em ${backlogMs} ms`, '480 e 480', stored === 480 && inDatabase === 480);
record('reenvio do lote de 480 não duplica', `${duplicates} duplicadas reconhecidas`, '480', duplicates === 480);

// ---- 2. Atualização em até 10 s ----
const realtime = createClient(URL_BASE, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
await realtime.realtime.setAuth(adminToken);
let notify = null;
const channel = realtime.channel(`tracking:${ORG}`, { config: { private: true } })
  .on('broadcast', { event: 'tracking' }, ({ payload }) => { if (payload?.trip_id === TRIP && payload?.kind === 'position') notify?.(); });
await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('O canal de tempo real não confirmou a inscrição.')), 15000);
  channel.subscribe((status) => { if (status === 'SUBSCRIBED') { clearTimeout(timer); resolve(); } });
});
const latencies = [];
for (let sample = 0; sample < SAMPLES; sample += 1) {
  const item = position(new Date().toISOString());
  const heard = new Promise((resolve) => { notify = resolve; });
  const sentAt = performance.now();
  await ingest([item]);
  await Promise.race([heard, sleep(15000)]);
  // Depois do aviso, a tela consulta a viagem: a nova posição precisa estar lá.
  let visible = false;
  for (let attempt = 0; attempt < 20 && !visible; attempt += 1) {
    const view = ok(await call('query-tracking', { operation: 'get_trip_tracking', organization_id: ORG, trip_id: TRIP }, adminToken), 'get_trip_tracking');
    visible = JSON.stringify(view).includes(item.observed_at.slice(0, 19));
    if (!visible) await sleep(250);
  }
  latencies.push(visible ? Math.round(performance.now() - sentAt) : Number.POSITIVE_INFINITY);
  await sleep(500);
}
notify = null;
await realtime.removeChannel(channel);
const p95 = percentile(latencies, 95);
record(`atualização visível ao gestor (p95 de ${SAMPLES})`, `${p95} ms (p50 ${percentile(latencies, 50)} ms)`, '≤ 10000 ms', p95 <= 10000);

ok(await call('manage-tracking', { operation: 'end_tracking_session', organization_id: ORG, request_id: randomUUID(), tracking_session_id: trackingSession, reason: 'completed' }, driverToken), 'end_tracking_session');

// ---- 3. Exportação de 10.000 linhas ----
// O histórico de lacres só aceita inclusão: os alertas sintéticos ficam até o próximo `db reset`. Cada execução usa um dia novo.
const day = sql(`select coalesce(max(opened_at::date) + 1, date '2026-01-15') from public.seal_alerts
  where organization_id = '${ORG}' and context @> '{"ensaio_desempenho": true}';`);
const EXPORT_DAY = { from: `${day}T00:00:00.000Z`, to: `${day}T23:59:59.000Z` };
const device = sql(`select id from public.seal_devices where organization_id = '${ORG}' order by device_code limit 1;`);
const admin = sql(`select id from auth.users where email = '${ADMIN.email}';`);
sql(`insert into public.seal_alerts (organization_id, device_id, kind, severity, source, status, context, opened_at, closed_at, closed_by, close_note)
  select '${ORG}', '${device}', 'low_battery', 'medium', 'system', 'closed', '{"ensaio_desempenho": true}',
         timestamptz '${day} 03:00:00+00' + make_interval(secs => g), timestamptz '${day} 03:00:00+00' + make_interval(secs => g + 30),
         '${admin}', 'Ensaio de desempenho'
    from generate_series(1, 10000) g;`);
const summaryStart = performance.now();
const summary = ok(await call('report-export', { operation: 'query_report_summary', organization_id: ORG, report_type: 'alerts', filters: EXPORT_DAY }, adminToken), 'query_report_summary');
const summaryMs = Math.round(performance.now() - summaryStart);
record('consulta do relatório de 10.000 alertas', `${summary.row_count} linhas em ${summaryMs} ms`, '10000 linhas, ≤ 30000 ms', Number(summary.row_count) === 10000 && summaryMs <= 30000);
const exportStart = performance.now();
const requested = ok(await call('report-export', {
  operation: 'request_report_export', organization_id: ORG, request_id: randomUUID(), report_type: 'alerts', filters: EXPORT_DAY, snapshot_at: summary.snapshot_at,
}, adminToken), 'request_report_export');
const exportId = requested.export.id;
let view = ok(await call('report-export', { operation: 'process_report_export', organization_id: ORG, export_id: exportId }, adminToken), 'process_report_export').export;
while (view && !['ready', 'failed', 'expired'].includes(view.status) && performance.now() - exportStart < 60000) {
  await sleep(500);
  view = ok(await call('report-export', { operation: 'get_report_export', organization_id: ORG, export_id: exportId }, adminToken), 'get_report_export').export;
}
const exportMs = Math.round(performance.now() - exportStart);
record('exportação de 10.000 linhas até ficar pronta', `${view?.status} com ${view?.row_count ?? '?'} linhas em ${exportMs} ms`, 'ready, ≤ 30000 ms',
  view?.status === 'ready' && exportMs <= 30000);

for (const token of [adminToken, driverToken]) await call('session-logout', {}, token);

console.log(`\n${results.filter((r) => r.pass).length} de ${results.length} metas atendidas.`);
process.exitCode = results.every((r) => r.pass) ? 0 : 1;
