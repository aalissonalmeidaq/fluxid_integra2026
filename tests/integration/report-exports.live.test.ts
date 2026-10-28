// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { callFunction, endAllSessions, login, logout, publishableKey, supabaseUrl, USERS } from '../support/auth-harness';
import { createEligibleCylinder, createWorld, GADMIN, manageTrips, planBody, requestId, TENANT_G } from '../support/trips-fixtures';

// Spec 015, T073 (US5; RF-028, RF-031, CS-012), contra o Supabase local real: o pedido vira job, o processamento publica um objeto
// privado completo com o mesmo recorte da consulta, e baixar reautoriza e devolve uma URL assinada de 60 segundos. Outro tenant não
// vê nem baixa; o bucket não é listável pelo cliente. Exige a função report-export carregada (`npx supabase stop` e `npx supabase start`).
const report = (token: string | undefined, body: Record<string, unknown>) => callFunction('report-export', body, token);
const TENANT_B = '20000000-0000-0000-0000-00000000000b';

const ok = (response: { status: number; body: unknown }, label: string): Record<string, unknown> => {
  if (response.status !== 200) throw new Error(`${label}: HTTP ${response.status} ${JSON.stringify(response.body)}`);
  return response.body as Record<string, unknown>;
};

describe('Exportação de relatórios ao vivo (Spec 015)', () => {
  let token = '';
  let otherTenant = '';
  const filters = { from: new Date(Date.now() - 24 * 3600_000).toISOString(), to: new Date(Date.now() + 24 * 3600_000).toISOString() };
  let snapshotAt = '';
  let rowCount = 0;
  let exportId = '';

  beforeAll(async () => {
    await endAllSessions(GADMIN);
    await endAllSessions(USERS.tenantBAdmin);
    const [a, b] = [await login(GADMIN), await login(USERS.tenantBAdmin)];
    expect([a.status, b.status]).toEqual([200, 200]);
    token = a.body.session.access_token as string;
    otherTenant = b.body.session.access_token as string;

    // Uma viagem planejada no período garante ao menos uma linha no relatório de viagens.
    const world = await createWorld(token);
    const cylinder = await createEligibleCylinder(token, world.typeId, 'REL');
    ok(await manageTrips(token, planBody(world, [{ cylinder_ids: [cylinder.id] }])), 'create_trip');
  }, 180_000);

  afterAll(async () => {
    for (const accessToken of [token, otherTenant]) if (accessToken) await logout(accessToken);
    await endAllSessions(GADMIN);
    await endAllSessions(USERS.tenantBAdmin);
  });

  it('exige sessão autenticada', async () => {
    expect((await report(undefined, { operation: 'query_report_summary', organization_id: TENANT_G, report_type: 'trips', filters })).status).toBe(401);
  });

  it('o resumo e as linhas descrevem o mesmo recorte, fixado num snapshot', async () => {
    const summary = ok(await report(token, { operation: 'query_report_summary', organization_id: TENANT_G, report_type: 'trips', filters }), 'summary');
    snapshotAt = String(summary.snapshot_at);
    rowCount = Number(summary.row_count);
    expect(rowCount).toBeGreaterThan(0);
    const rows = ok(await report(token, { operation: 'query_report_rows', organization_id: TENANT_G, report_type: 'trips', filters, snapshot_at: snapshotAt, limit: 200 }), 'rows');
    expect((rows.rows as unknown[]).length).toBe(Math.min(rowCount, 200));
  });

  it('filtro fora da lista canônica é recusado antes do banco', async () => {
    const response = await report(token, { operation: 'query_report_summary', organization_id: TENANT_G, report_type: 'trips', filters: { ...filters, sql: 'x' } });
    expect(response.status).toBe(400);
  });

  it('outro tenant não consulta o relatório da empresa', async () => {
    const response = await report(otherTenant, { operation: 'query_report_summary', organization_id: TENANT_G, report_type: 'trips', filters });
    expect([403, 404]).toContain(response.status);
  });

  it('o pedido vira job; processar publica o arquivo completo com o mesmo número de linhas', async () => {
    const request = requestId();
    const requested = ok(await report(token, { operation: 'request_report_export', organization_id: TENANT_G, request_id: request, report_type: 'trips', filters, snapshot_at: snapshotAt }), 'request');
    exportId = String((requested.export as { id: string }).id);
    // O mesmo pedido repetido devolve o mesmo job.
    const replay = ok(await report(token, { operation: 'request_report_export', organization_id: TENANT_G, request_id: request, report_type: 'trips', filters, snapshot_at: snapshotAt }), 'replay');
    expect((replay.export as { id: string }).id).toBe(exportId);

    const processed = ok(await report(token, { operation: 'process_report_export', organization_id: TENANT_G, export_id: exportId }), 'process');
    expect(processed.code).toBe('READY');
    expect(processed.export).toMatchObject({ status: 'ready', row_count: rowCount });
    // A resposta nunca traz o caminho do objeto.
    expect(JSON.stringify(processed)).not.toMatch(/report-exports|\.csv/);
    const status = ok(await report(token, { operation: 'get_report_export', organization_id: TENANT_G, export_id: exportId }), 'get');
    expect(status.export).toMatchObject({ status: 'ready', row_count: rowCount });
  });

  it('baixar reautoriza e entrega URL de 60 segundos com o CSV seguro', async () => {
    const download = ok(await report(token, { operation: 'download_report_export', organization_id: TENANT_G, export_id: exportId, request_id: requestId() }), 'download');
    expect(download).toMatchObject({ code: 'AUTHORIZED', expires_in: 60 });
    const url = String(download.url);
    const signed = new URL(url).searchParams.get('token') ?? '';
    const claims = JSON.parse(Buffer.from(signed.split('.')[1] ?? '', 'base64url').toString('utf8')) as { exp: number; iat: number };
    expect(claims.exp - claims.iat).toBe(60);

    // No ambiente local a URL assinada sai com o host interno do runtime (kong); o caminho e a assinatura são os mesmos.
    const file = await fetch(`${supabaseUrl}${new URL(url).pathname}${new URL(url).search}`);
    expect(file.status).toBe(200);
    const csv = new TextDecoder('utf-8', { ignoreBOM: true }).decode(await file.arrayBuffer());
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    const lines = csv.slice(1).split('\r\n').filter(Boolean);
    expect(lines).toHaveLength(rowCount + 1);
    expect(lines[0]).toMatch(/^Empresa;Relatório;Gerado em;Critérios;Fuso horário;/);
  });

  it('outro tenant não vê nem baixa a exportação', async () => {
    const seen = await report(otherTenant, { operation: 'get_report_export', organization_id: TENANT_G, export_id: exportId });
    expect([403, 404]).toContain(seen.status);
    const own = await report(otherTenant, { operation: 'download_report_export', organization_id: TENANT_B, export_id: exportId, request_id: requestId() });
    expect([403, 404]).toContain(own.status);
  });

  it('o bucket privado não é listável nem lido diretamente pelo cliente', async () => {
    const listed = await fetch(`${supabaseUrl}/storage/v1/object/list/report-exports`, {
      method: 'POST', headers: { apikey: publishableKey, authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ prefix: TENANT_G, limit: 100 }),
    });
    const body = await listed.json().catch(() => null) as unknown;
    expect(listed.status === 200 ? body : []).toEqual([]);
    const direct = await fetch(`${supabaseUrl}/storage/v1/object/public/report-exports/${TENANT_G}/x.csv`);
    expect(direct.status).not.toBe(200);
  });
});
