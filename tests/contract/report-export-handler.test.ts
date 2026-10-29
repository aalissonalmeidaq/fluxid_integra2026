// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createReportExportHandler, REPORT_OPERATIONS, type ReportGateway } from '../../supabase/functions/report-export/handler';

// Spec 015 (T081; US5, RF-027, RF-028, RF-030, RF-031): borda dos relatórios. Consultas e pedidos passam pela tabela de operações (ator e
// sessão do token, filtros só com chaves canônicas). Processar gera o CSV seguro, grava num caminho temporário e só publica o arquivo
// completo; qualquer falha marca o job como falho e apaga o temporário. Baixar reautoriza no banco e devolve URL assinada curta. O
// conteúdo e a URL nunca vão para a auditoria. O banco e o Storage são falsos.
const USER = '10000000-0000-4000-8000-000000000005';
const SESSION = '60000000-0000-4000-8000-0000001570a5';
const ORG = '20000000-0000-4000-8000-00000000000a';
const EXPORT = 'a17d0000-0000-4000-8000-000000000001';
const REQUEST = 'a17c0000-0000-4000-8000-000000000001';
const FILTERS = { from: '2026-10-22T08:00:00Z', to: '2026-10-22T18:00:00Z' };
const CLAIMED = {
  code: 'CLAIMED', export: { id: EXPORT, status: 'processing' },
  columns: [{ key: 'serial_number', label: 'Cilindro' }, { key: 'close_note', label: 'Observação' }],
  rows: [{ serial_number: 'REP-A-1', close_note: '=1+1' }],
  context: { organization: 'Tenant A', report_type: 'Ocorrências de proximidade', generated_at: '2026-10-22T15:00:00Z', criteria: 'De … até …' },
};

function gateway(rpc: (name: string, args: Record<string, unknown>) => Record<string, unknown>) {
  const files = new Map<string, string>();
  const value = {
    authenticate: vi.fn(async () => ({ userId: USER, sessionId: SESSION, aal: 'aal1' as const })),
    rpc: vi.fn(async (name: string, args: Record<string, unknown>) => rpc(name, args)),
    audit: vi.fn(async () => undefined),
    upload: vi.fn(async (path: string, content: string) => { files.set(path, content); }),
    move: vi.fn(async (from: string, to: string) => { files.set(to, files.get(from)!); files.delete(from); }),
    remove: vi.fn(async (path: string) => { files.delete(path); }),
    signedUrl: vi.fn(async (path: string, seconds: number) => `https://storage.example.invalid/${path}?ttl=${seconds}`),
  } satisfies ReportGateway;
  return { gateway: value, files };
}
const post = (body: unknown, token = 'jwt') => new Request('http://local/fn', {
  method: 'POST', headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), 'content-type': 'application/json' }, body: JSON.stringify(body),
});

describe('report-export: consultas e pedido', () => {
  it('resumo e linhas levam tipo e filtros canônicos; filtro desconhecido é recusado na borda', async () => {
    const { gateway: gw } = gateway(() => ({ code: 'FOUND' }));
    const handler = createReportExportHandler(gw);
    expect((await handler(post({ operation: 'query_report_summary', organization_id: ORG, report_type: 'proximity', filters: FILTERS }))).status).toBe(200);
    expect(gw.rpc).toHaveBeenCalledWith('query_report_summary', expect.objectContaining({ p_actor: USER, p_session: SESSION, p_type: 'proximity', p_filters: FILTERS }));
    expect((await handler(post({ operation: 'query_report_summary', organization_id: ORG, report_type: 'proximity', filters: { ...FILTERS, lat: 1 } }))).status).toBe(400);
    expect((await handler(post({ operation: 'query_report_rows', organization_id: ORG, report_type: 'faturamento', filters: FILTERS }))).status).toBe(400);
  });

  it('pedir exportação exige request_id', async () => {
    const { gateway: gw } = gateway(() => ({ code: 'REQUESTED', export: { id: EXPORT, status: 'queued' } }));
    expect((await createReportExportHandler(gw)(post({ operation: 'request_report_export', organization_id: ORG, report_type: 'proximity', filters: FILTERS }))).status).toBe(400);
    expect((await createReportExportHandler(gw)(post({ operation: 'request_report_export', organization_id: ORG, request_id: REQUEST, report_type: 'proximity',
      filters: FILTERS }))).status).toBe(200);
  });

  it('nenhuma operação de exclusão existe', () => {
    for (const name of Object.keys(REPORT_OPERATIONS)) expect(name).not.toMatch(/delete|remove/);
  });
});

describe('report-export: processar', () => {
  it('gera o CSV seguro, grava no temporário, publica o arquivo completo e conclui', async () => {
    const { gateway: gw, files } = gateway((name) => (name === 'claim_report_export' ? CLAIMED : { code: 'READY', export: { id: EXPORT, status: 'ready' } }));
    const response = await createReportExportHandler(gw)(post({ operation: 'process_report_export', organization_id: ORG, export_id: EXPORT }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ code: 'READY' });
    const temporary = gw.upload.mock.calls[0]![0];
    expect(temporary).toMatch(new RegExp(`^${ORG}/${USER}/tmp/`));
    const [, final] = gw.move.mock.calls[0]!;
    expect(final).toMatch(new RegExp(`^${ORG}/${USER}/[0-9a-f-]{36}\\.csv$`));
    expect(files.has(temporary)).toBe(false);
    expect(files.get(final)).toContain("'=1+1");
    expect(gw.rpc).toHaveBeenLastCalledWith('complete_report_export', expect.objectContaining({ p_export: EXPORT, p_storage_path: final, p_row_count: 1 }));
  });

  it('falha no Storage: job falho, temporário apagado, nada publicado', async () => {
    const { gateway: gw, files } = gateway((name) => (name === 'claim_report_export' ? CLAIMED : { code: 'FAILED' }));
    gw.move.mockRejectedValueOnce(new Error('storage'));
    const response = await createReportExportHandler(gw)(post({ operation: 'process_report_export', organization_id: ORG, export_id: EXPORT }));
    expect(response.status).toBe(500);
    expect(gw.rpc).toHaveBeenCalledWith('fail_report_export', expect.objectContaining({ p_export: EXPORT, p_code: 'EXPORT_FAILED' }));
    expect(gw.remove).toHaveBeenCalled();
    expect(files.size).toBe(0);
  });

  it('sem autorização no claim: nenhum arquivo e a negação é devolvida', async () => {
    const { gateway: gw } = gateway(() => ({ code: 'ACCESS_DENIED' }));
    const response = await createReportExportHandler(gw)(post({ operation: 'process_report_export', organization_id: ORG, export_id: EXPORT }));
    expect(response.status).toBe(403);
    expect(gw.upload).not.toHaveBeenCalled();
  });

  it('job já processado: devolve o estado sem gerar de novo', async () => {
    const { gateway: gw } = gateway(() => ({ code: 'ALREADY_CLAIMED', export: { id: EXPORT, status: 'ready' } }));
    const response = await createReportExportHandler(gw)(post({ operation: 'process_report_export', organization_id: ORG, export_id: EXPORT }));
    expect(response.status).toBe(200);
    expect(gw.upload).not.toHaveBeenCalled();
  });
});

describe('report-export: baixar', () => {
  it('reautoriza no banco e devolve URL assinada de 60 s, sem a URL na auditoria', async () => {
    const { gateway: gw } = gateway(() => ({ code: 'AUTHORIZED', storage_path: `${ORG}/${USER}/arquivo.csv` }));
    const response = await createReportExportHandler(gw)(post({ operation: 'download_report_export', organization_id: ORG, export_id: EXPORT, request_id: REQUEST }));
    expect(await response.json()).toEqual({ code: 'AUTHORIZED', url: `https://storage.example.invalid/${ORG}/${USER}/arquivo.csv?ttl=60`, expires_in: 60 });
    expect(gw.rpc).toHaveBeenCalledWith('authorize_report_download', { p_actor: USER, p_session: SESSION, p_organization: ORG, p_request: REQUEST, p_export: EXPORT });
    expect(JSON.stringify(gw.audit.mock.calls)).not.toContain('https://');
  });

  it.each([['EXPORT_EXPIRED', 410], ['ACCESS_DENIED', 403], ['NOT_FOUND', 404]] as const)('%s vira %i', async (code, status) => {
    const { gateway: gw } = gateway(() => ({ code }));
    expect((await createReportExportHandler(gw)(post({ operation: 'download_report_export', organization_id: ORG, export_id: EXPORT, request_id: REQUEST }))).status).toBe(status);
    expect(gw.signedUrl).not.toHaveBeenCalled();
  });

  it('sem token: 401; id inválido: 400', async () => {
    const { gateway: gw } = gateway(() => ({ code: 'AUTHORIZED' }));
    expect((await createReportExportHandler(gw)(post({ operation: 'download_report_export', organization_id: ORG, export_id: EXPORT, request_id: REQUEST }, ''))).status).toBe(401);
    expect((await createReportExportHandler(gw)(post({ operation: 'download_report_export', organization_id: ORG, export_id: 'x', request_id: REQUEST }))).status).toBe(400);
  });
});
