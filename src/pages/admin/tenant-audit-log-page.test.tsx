import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { AuditEventView, AuditOutcome, AuditService } from '@/application/identity/audit-service';
import { AuditLogView } from './tenant-audit-log-page';

const TENANT = '20000000-0000-0000-0000-00000000000a';

const event = (id: number, over: Partial<AuditEventView> = {}): AuditEventView => ({
  id, organizationId: TENANT, actor: { id: 'u1', displayName: 'Administrador A' }, action: 'role.create', targetType: 'role', targetId: `r${id}`,
  result: 'success', reasonCode: null, justification: null, origin: 'database', occurredAt: '2026-09-30T12:00:00+00:00', metadata: {}, ...over,
});
const page = (events: AuditEventView[], next: { occurredAt: string; id: number } | null = null): AuditOutcome => ({ kind: 'success', value: { events, next } });

function fakeService(responses: AuditOutcome[] = [page([event(3), event(2, { action: 'invitation.send', result: 'denied', reasonCode: 'permission_denied', targetType: 'invitation' }), event(1)])]) {
  const query = vi.fn();
  responses.forEach((response) => query.mockResolvedValueOnce(response));
  query.mockResolvedValue(page([]));
  return { query } as unknown as AuditService & { query: ReturnType<typeof vi.fn> };
}

const renderView = (service: ReturnType<typeof fakeService> | null = fakeService(), scope: 'tenant' | 'global' = 'tenant') => {
  render(<AuditLogView scope={scope} organizationId={scope === 'tenant' ? TENANT : null} service={service} />);
  return service;
};

const table = () => screen.getByRole('table', { name: /eventos de auditoria/i });
// A tabela só existe depois da carga assíncrona: aguarda antes de consultá-la.
const findTable = () => screen.findByRole('table', { name: /eventos de auditoria/i });

describe('AuditLogPage: leitura', () => {
  it('apresenta carregamento e depois os eventos com ator, ação, alvo e resultado em texto', async () => {
    const service = renderView()!;
    expect(screen.getByRole('status')).toHaveTextContent(/carregando/i);
    const rows = await within(await findTable()).findAllByRole('row');
    expect(rows).toHaveLength(4);
    expect(service.query).toHaveBeenCalledWith({ scope: 'tenant', organizationId: TENANT }, {}, undefined, 50);
    const first = within(rows[1]!);
    expect(first.getByText('Administrador A')).toBeInTheDocument();
    expect(first.getByText('role.create')).toBeInTheDocument();
    expect(first.getByText(/role.*r3/i)).toBeInTheDocument();
    expect(first.getByText('Sucesso')).toBeInTheDocument();
    expect(within(rows[2]!).getByText('Negado')).toBeInTheDocument();
    expect(within(rows[2]!).getByText(/permission_denied/)).toBeInTheDocument();
  });

  it('formata a data e a hora no padrão brasileiro e expõe o instante para tecnologias assistivas', async () => {
    renderView();
    const time = (await within(await findTable()).findAllByRole('time'))[0]!;
    expect(time).toHaveAttribute('datetime', '2026-09-30T12:00:00+00:00');
    expect(time.textContent).toMatch(/\d{2}\/\d{2}\/\d{4}/);
  });

  it('usa legenda na tabela, cabeçalhos de coluna e uma lista equivalente para telas pequenas', async () => {
    renderView();
    await within(await findTable()).findAllByRole('row');
    expect(within(table()).getAllByRole('columnheader').map((header) => header.textContent)).toEqual(['Data e hora', 'Ator', 'Ação', 'Alvo', 'Resultado', 'Detalhes']);
    expect(screen.getByRole('list', { name: /eventos em lista/i })).toBeInTheDocument();
  });

  it('mostra metadados permitidos como texto legível e nunca JSON bruto', async () => {
    renderView(fakeService([page([event(1, { metadata: { permissions: ['audit.read', 'tenant.manage'], version: 2 } })])]));
    const row = (await within(await findTable()).findAllByRole('row'))[1]!;
    expect(within(row).getByText(/audit\.read, tenant\.manage/)).toBeInTheDocument();
    expect(row.textContent).not.toContain('{');
  });

  it('apresenta estado vazio', async () => {
    renderView(fakeService([page([])]));
    expect(await screen.findByText(/nenhum evento encontrado/i)).toBeInTheDocument();
  });

  it.each([
    ['access_denied', /acesso negado/i],
    ['mfa_required', /segundo fator/i],
    ['invalid', /revise os filtros/i],
    ['unavailable', /não foi possível carregar/i],
  ] as const)('anuncia %s como alerta e não exibe eventos', async (kind, message) => {
    renderView(fakeService([{ kind }]));
    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('sem conexão informa a indisponibilidade', async () => {
    renderView(null);
    expect(await screen.findByRole('alert')).toHaveTextContent(/conexão indisponível/i);
  });
});

describe('AuditLogPage: escopo', () => {
  it('no escopo da plataforma consulta sem organização e muda o título', async () => {
    const service = renderView(fakeService(), 'global')!;
    expect(await screen.findByRole('heading', { level: 2, name: 'Auditoria da plataforma' })).toBeInTheDocument();
    expect(service.query).toHaveBeenCalledWith({ scope: 'global' }, {}, undefined, 50);
  });

  it('no escopo do tenant o título indica o tenant e o leitor só consulta, sem ações de edição', async () => {
    renderView();
    expect(await screen.findByRole('heading', { level: 2, name: 'Auditoria do tenant' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /excluir|editar|apagar|alterar/i })).not.toBeInTheDocument();
  });

  it('sem o identificador do tenant não consulta e informa o motivo', async () => {
    const service = fakeService();
    render(<AuditLogView scope="tenant" organizationId={null} service={service} />);
    expect(await screen.findByRole('alert')).toHaveTextContent(/organização não informada/i);
    expect(service.query).not.toHaveBeenCalled();
  });
});

describe('AuditLogPage: filtros', () => {
  it('filtra por ação, resultado e período e recomeça do primeiro evento', async () => {
    const service = renderView()!;
    await within(await findTable()).findAllByRole('row');
    fireEvent.change(screen.getByLabelText('Ação'), { target: { value: 'role.create' } });
    fireEvent.change(screen.getByLabelText('Resultado'), { target: { value: 'denied' } });
    fireEvent.change(screen.getByLabelText('De'), { target: { value: '2026-01-01T00:00' } });
    fireEvent.change(screen.getByLabelText('Até'), { target: { value: '2026-01-31T23:59' } });
    fireEvent.change(screen.getByLabelText('Tipo de alvo'), { target: { value: 'role' } });
    fireEvent.click(screen.getByRole('button', { name: 'Filtrar' }));
    await waitFor(() => expect(service.query).toHaveBeenCalledTimes(2));
    const [scope, filters, cursor, limit] = service.query.mock.calls[1]!;
    expect(scope).toEqual({ scope: 'tenant', organizationId: TENANT });
    expect(filters).toMatchObject({ action: 'role.create', result: 'denied', targetType: 'role' });
    expect(new Date(filters.from).toISOString()).toBe(filters.from);
    expect(new Date(filters.to).getTime()).toBeGreaterThan(new Date(filters.from).getTime());
    expect(cursor).toBeUndefined();
    expect(limit).toBe(50);
  });

  it('valida o período invertido e a ação no cliente, sem chamar o servidor', async () => {
    const service = renderView()!;
    await within(await findTable()).findAllByRole('row');
    fireEvent.change(screen.getByLabelText('De'), { target: { value: '2026-02-01T00:00' } });
    fireEvent.change(screen.getByLabelText('Até'), { target: { value: '2026-01-01T00:00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Filtrar' }));
    expect(service.query).toHaveBeenCalledTimes(1);
    const to = screen.getByLabelText('Até');
    expect(to).toHaveAttribute('aria-invalid', 'true');
    expect(document.getElementById(to.getAttribute('aria-describedby')!.split(' ')[0]!)).toHaveTextContent(/posterior à data inicial/i);

    fireEvent.change(screen.getByLabelText('De'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('Até'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('Ação'), { target: { value: 'ação inválida!' } });
    fireEvent.click(screen.getByRole('button', { name: 'Filtrar' }));
    expect(service.query).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('Ação')).toHaveAttribute('aria-invalid', 'true');
  });

  it('limpar filtros volta à consulta completa', async () => {
    const service = renderView()!;
    await within(await findTable()).findAllByRole('row');
    fireEvent.change(screen.getByLabelText('Ação'), { target: { value: 'role.create' } });
    fireEvent.click(screen.getByRole('button', { name: 'Limpar filtros' }));
    await waitFor(() => expect(service.query).toHaveBeenCalledTimes(2));
    expect(service.query.mock.calls[1]![1]).toEqual({});
    expect(screen.getByLabelText('Ação')).toHaveValue('');
  });
});

describe('AuditLogPage: paginação', () => {
  it('carrega mais eventos pelo cursor, sem repetir os já exibidos', async () => {
    const next = { occurredAt: '2026-09-30T12:00:00+00:00', id: 2 };
    const service = renderView(fakeService([page([event(3), event(2)], next), page([event(2), event(1)])]))!;
    await within(await findTable()).findAllByRole('row');
    fireEvent.click(screen.getByRole('button', { name: 'Carregar mais eventos' }));
    await waitFor(() => expect(within(table()).getAllByRole('row')).toHaveLength(4));
    expect(service.query.mock.calls[1]![2]).toEqual(next);
    expect(screen.queryByRole('button', { name: 'Carregar mais eventos' })).not.toBeInTheDocument();
  });

  it('não oferece carregar mais quando não há próxima página', async () => {
    renderView();
    await within(await findTable()).findAllByRole('row');
    expect(screen.queryByRole('button', { name: 'Carregar mais eventos' })).not.toBeInTheDocument();
  });

  it('mantém os eventos já carregados e anuncia a falha ao carregar mais', async () => {
    const next = { occurredAt: '2026-09-30T12:00:00+00:00', id: 2 };
    renderView(fakeService([page([event(3), event(2)], next), { kind: 'unavailable' }]));
    await within(await findTable()).findAllByRole('row');
    fireEvent.click(screen.getByRole('button', { name: 'Carregar mais eventos' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/não foi possível carregar mais/i);
    expect(within(table()).getAllByRole('row')).toHaveLength(3);
  });

  it('impede carregar mais duas vezes ao mesmo tempo', async () => {
    let release!: (value: AuditOutcome) => void;
    const first = page([event(3)], { occurredAt: '2026-09-30T12:00:00+00:00', id: 3 });
    const query = vi.fn().mockResolvedValueOnce(first).mockImplementationOnce(() => new Promise<AuditOutcome>((resolve) => { release = resolve; }));
    const service = { query } as unknown as AuditService & { query: ReturnType<typeof vi.fn> };
    renderView(service);
    await within(await findTable()).findAllByRole('row');
    const button = screen.getByRole('button', { name: 'Carregar mais eventos' });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(service.query).toHaveBeenCalledTimes(2);
    release(page([]));
    await waitFor(() => expect(screen.queryByRole('button', { name: /carregando mais/i })).not.toBeInTheDocument());
  });
});

describe('AuditLogPage: acessibilidade', () => {
  it('usa rótulos visíveis e alvos de toque de 44 px', async () => {
    renderView();
    await within(await findTable()).findAllByRole('row');
    for (const label of ['De', 'Até', 'Ação', 'Resultado', 'Tipo de alvo']) expect(screen.getByLabelText(label).className).toMatch(/min-h-11/);
    for (const name of ['Filtrar', 'Limpar filtros']) expect(screen.getByRole('button', { name }).className).toMatch(/min-h-11/);
  });

  it('anuncia a quantidade de eventos exibidos em uma região de status', async () => {
    renderView();
    await within(await findTable()).findAllByRole('row');
    expect(screen.getByRole('status')).toHaveTextContent(/3 eventos/i);
  });
});
