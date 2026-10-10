import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { CylinderService } from '@/application/cylinders/cylinder-service';
import type { CylinderDetail, CylinderTypeView } from '@/application/cylinders/cylinder-views';
import { CylinderDetailView, type DetailAbilities } from './cylinder-detail-page';

const ORG = '20000000-0000-4000-8000-00000000000a';
const CYL = '72000000-0000-4000-8000-0000000000a1';
const TYPE: CylinderTypeView = { id: 't1', gas: 'Oxigênio', capacityValue: 10, capacityUnit: 'l', classification: 'medicinal', active: true };

const NONE: DetailAbilities = { write: false, deactivate: false, identifier: false, test: false, history: false };
const ALL: DetailAbilities = { write: true, deactivate: true, identifier: true, test: true, history: true };

const detail = (over: Partial<CylinderDetail> = {}, cylinder: Partial<CylinderDetail['cylinder']> = {}): CylinderDetail => ({
  cylinder: {
    id: CYL, serialNumber: 'AB-1', type: TYPE, manufacturer: 'Fábrica X', manufactureYear: 2020, workingPressureBar: 200, notes: 'Observação do casco',
    status: 'active', inactivationReason: null, stockStatus: 'in_stock', custodyStatus: 'in_organization', custodySite: null, hydroLastResult: 'approved', hydroNextDueOn: '2027-01-01', version: 3, createdAt: '2026-10-05T13:30:00Z', ...cylinder,
  },
  identifiers: [
    { id: 'i1', kind: 'qr_code', value: 'QR-1', status: 'active', createdAt: '2026-10-05T13:30:00Z', deactivatedAt: null, deactivationJustification: null, transferred: false },
    { id: 'i2', kind: 'nfc_tag', value: 'NFC-OLD', status: 'deactivated', createdAt: '2026-10-01T13:30:00Z', deactivatedAt: '2026-10-04T13:30:00Z', deactivationJustification: 'Etiqueta danificada', transferred: false },
  ],
  tests: [
    { id: 'tb', performedOn: '2026-09-01', result: 'approved', reportNumber: 'L-9', executor: 'Laboratório X', nextDueOn: '2027-09-01', notes: null, rectifiesTestId: 'ta', rectificationJustification: 'Data digitada errada', createdAt: '2026-09-02T10:00:00Z', superseded: false },
    { id: 'ta', performedOn: '2026-09-01', result: 'approved', reportNumber: null, executor: 'Laboratório X', nextDueOn: '2026-12-01', notes: null, rectifiesTestId: null, rectificationJustification: null, createdAt: '2026-09-01T10:00:00Z', superseded: true },
  ],
  hydroStatus: 'em_dia',
  ...over,
});

function fakeService(overrides: Record<string, unknown> = {}) {
  return { get: vi.fn(async () => ({ kind: 'success' as const, value: detail() })), history: vi.fn(async () => ({ kind: 'success' as const, value: { events: [], next: null } })), ...overrides } as unknown as CylinderService & { get: ReturnType<typeof vi.fn> };
}

const renderDetail = (service: ReturnType<typeof fakeService> | null, can: DetailAbilities = ALL) =>
  render(<CylinderDetailView organizationId={ORG} service={service} online cylinderId={CYL} can={can} />);

describe('detalhe do cilindro (história 2)', () => {
  it('mostra carregamento e depois cada bloco com nome acessível', async () => {
    renderDetail(fakeService());
    expect(screen.getByRole('status')).toHaveTextContent(/carregando/i);
    expect(await screen.findByRole('region', { name: 'Dados do cilindro' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Identificadores' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Testes hidrostáticos' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Cilindro AB-1' })).toBeInTheDocument();
  });

  it('mostra os dados cadastrais e as três situações separadas', async () => {
    renderDetail(fakeService());
    const data = await screen.findByRole('region', { name: 'Dados do cilindro' });
    for (const text of ['AB-1', 'Oxigênio · 10 L · Medicinal', 'Fábrica X', '2020', '200 bar', 'Observação do casco']) {
      expect(within(data).getByText(text)).toBeInTheDocument();
    }
    expect(screen.getAllByText('Ativo').length).toBeGreaterThan(0);
    expect(screen.getByText('Em estoque')).toBeInTheDocument();
    expect(screen.getByText('Em dia')).toBeInTheDocument();
  });

  it('lista identificadores ativos e desativados, com a justificativa da desativação', async () => {
    renderDetail(fakeService());
    const block = await screen.findByRole('region', { name: 'Identificadores' });
    expect(within(block).getByText('QR-1')).toBeInTheDocument();
    expect(within(block).getByText('QR Code')).toBeInTheDocument();
    expect(within(block).getByText('NFC-OLD')).toBeInTheDocument();
    expect(within(block).getByText('Desativado')).toBeInTheDocument();
    expect(within(block).getByText(/Etiqueta danificada/)).toBeInTheDocument();
  });

  it('lista os testes: o original continua visível e marcado como substituído pela retificação', async () => {
    renderDetail(fakeService());
    const block = await screen.findByRole('region', { name: 'Testes hidrostáticos' });
    expect(within(block).getAllByText('Laboratório X')).toHaveLength(2);
    expect(within(block).getByText(/substituído por retificação/i)).toBeInTheDocument();
    expect(within(block).getByText(/Data digitada errada/)).toBeInTheDocument();
    expect(within(block).getByText('01/09/2027')).toBeInTheDocument();
  });

  it('sem identificadores ativos e sem testes: avisos e textos vazios', async () => {
    renderDetail(fakeService({ get: vi.fn(async () => ({ kind: 'success', value: detail({ identifiers: [], tests: [], hydroStatus: 'sem_teste' }, { hydroLastResult: null, hydroNextDueOn: null }) })) }));
    const ids = await screen.findByRole('region', { name: 'Identificadores' });
    expect(within(ids).getAllByText('Sem identificador').length).toBeGreaterThan(0);
    expect(within(ids).getByText(/nenhum identificador/i)).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Testes hidrostáticos' })).getByText(/nenhum teste registrado/i)).toBeInTheDocument();
  });

  it('"Editar" só aparece a quem pode e só para cilindro ativo', async () => {
    const { unmount } = renderDetail(fakeService(), ALL);
    expect(await screen.findByRole('link', { name: 'Editar' })).toHaveAttribute('href', `/cilindros/${CYL}/editar`);
    unmount();
    const semPermissao = renderDetail(fakeService(), NONE);
    await screen.findByRole('region', { name: 'Dados do cilindro' });
    expect(screen.queryByRole('link', { name: 'Editar' })).not.toBeInTheDocument();
    semPermissao.unmount();
    renderDetail(fakeService({ get: vi.fn(async () => ({ kind: 'success', value: detail({}, { status: 'inactive', inactivationReason: 'lost', stockStatus: 'out_of_stock' }) })) }), ALL);
    await screen.findByRole('region', { name: 'Dados do cilindro' });
    expect(screen.queryByRole('link', { name: 'Editar' })).not.toBeInTheDocument();
    expect(screen.getByText(/inativo.*perdido/i)).toBeInTheDocument();
  });

  it('o bloco "Histórico" aparece só a quem tem cylinder.history e é somente leitura', async () => {
    const service = fakeService();
    const { unmount } = renderDetail(service, ALL);
    expect(await screen.findByRole('region', { name: 'Histórico' })).toBeInTheDocument();
    await waitFor(() => expect(service.history).toHaveBeenCalled());
    unmount();
    const semHistorico = fakeService();
    renderDetail(semHistorico, { ...ALL, history: false });
    await screen.findByRole('region', { name: 'Dados do cilindro' });
    expect(screen.queryByRole('region', { name: 'Histórico' })).not.toBeInTheDocument();
    expect(semHistorico.history).not.toHaveBeenCalled();
  });

  it('não existe nenhuma ação de excluir (RF-005)', async () => {
    renderDetail(fakeService(), ALL);
    await screen.findByRole('region', { name: 'Dados do cilindro' });
    expect(screen.queryByRole('button', { name: /exclu|apag|remov|delet/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /exclu|apag|remov|delet/i })).not.toBeInTheDocument();
  });

  it('cilindro desconhecido ou de outra organização: "não encontrado"', async () => {
    renderDetail(fakeService({ get: vi.fn(async () => ({ kind: 'not_found' })) }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/cilindro não encontrado/i);
  });

  it('falha de carregamento: erro com nova tentativa', async () => {
    const get = vi.fn().mockResolvedValueOnce({ kind: 'unavailable' }).mockResolvedValueOnce({ kind: 'success', value: detail() });
    renderDetail(fakeService({ get }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/não foi possível carregar/i);
    fireEvent.click(screen.getByRole('button', { name: /tentar novamente/i }));
    expect(await screen.findByRole('region', { name: 'Dados do cilindro' })).toBeInTheDocument();
  });

  it('sem serviço: conexão indisponível', async () => {
    renderDetail(null);
    expect(await screen.findByRole('alert')).toHaveTextContent(/conexão indisponível/i);
  });
});

describe('testes hidrostáticos no detalhe (história 4)', () => {
  const withTests = (over: Record<string, unknown> = {}) => fakeService({
    registerTest: vi.fn(async () => ({ kind: 'success', value: { testId: 't9' } })),
    rectifyTest: vi.fn(async () => ({ kind: 'success', value: { testId: 't10' } })),
    ...over,
  }) as unknown as ReturnType<typeof fakeService> & Record<'registerTest' | 'rectifyTest', ReturnType<typeof vi.fn>>;

  it('"Registrar teste" e "Retificar" só aparecem a quem tem cylinder.test, e só em cilindro ativo', async () => {
    const { unmount } = renderDetail(withTests(), ALL);
    expect(await screen.findByRole('button', { name: 'Registrar teste' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retificar teste de 01/09/2026' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /retificar/i })).toHaveLength(1);
    unmount();
    const semPermissao = renderDetail(withTests(), { ...ALL, test: false });
    await screen.findByRole('region', { name: 'Dados do cilindro' });
    expect(screen.queryByRole('button', { name: 'Registrar teste' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /retificar/i })).not.toBeInTheDocument();
    semPermissao.unmount();
    renderDetail(withTests({ get: vi.fn(async () => ({ kind: 'success', value: detail({}, { status: 'inactive', inactivationReason: 'lost' }) })) }), ALL);
    await screen.findByRole('region', { name: 'Dados do cilindro' });
    expect(screen.queryByRole('button', { name: 'Registrar teste' })).not.toBeInTheDocument();
  });

  it('registra o teste, recarrega o detalhe e anuncia o resultado', async () => {
    const service = withTests();
    renderDetail(service, ALL);
    fireEvent.click(await screen.findByRole('button', { name: 'Registrar teste' }));
    fireEvent.change(screen.getByLabelText('Data de realização'), { target: { value: '2026-10-01' } });
    fireEvent.change(screen.getByLabelText('Resultado'), { target: { value: 'rejected' } });
    fireEvent.change(screen.getByLabelText('Executor'), { target: { value: 'Laboratório Z' } });
    fireEvent.submit(screen.getByLabelText('Executor').closest('form') as HTMLFormElement);
    await waitFor(() => expect(service.registerTest).toHaveBeenCalledTimes(1));
    expect(service.registerTest).toHaveBeenCalledWith(ORG, expect.objectContaining({ cylinderId: CYL, performedOn: '2026-10-01', result: 'rejected', executor: 'Laboratório Z' }));
    expect(await screen.findByText('Teste hidrostático registrado.')).toBeInTheDocument();
    await waitFor(() => expect(service.get).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole('heading', { name: 'Registrar teste hidrostático' })).not.toBeInTheDocument();
  });

  it('retifica com justificativa e mantém o original visível', async () => {
    const service = withTests();
    renderDetail(service, ALL);
    fireEvent.click(await screen.findByRole('button', { name: 'Retificar teste de 01/09/2026' }));
    fireEvent.change(screen.getByLabelText('Próxima data'), { target: { value: '2027-12-01' } });
    fireEvent.change(screen.getByLabelText('Justificativa da retificação'), { target: { value: 'Próxima data digitada errada' } });
    fireEvent.submit(screen.getByLabelText('Executor').closest('form') as HTMLFormElement);
    await waitFor(() => expect(service.rectifyTest).toHaveBeenCalledTimes(1));
    expect(service.rectifyTest).toHaveBeenCalledWith(ORG, expect.objectContaining({ testId: 'tb', nextDueOn: '2027-12-01', justification: 'Próxima data digitada errada' }));
    expect(await screen.findByText(/retificação registrada.*original continua/i)).toBeInTheDocument();
  });
});

describe('símbolo do identificador no detalhe (RF-044, CA-011)', () => {
  it('oferece "Mostrar código" só ao identificador ativo QR Code e gera o símbolo', async () => {
    renderDetail(fakeService(), NONE);
    const buttons = await screen.findAllByRole('button', { name: 'Mostrar código' });
    expect(buttons).toHaveLength(1);
    fireEvent.click(buttons[0]!);
    expect(await screen.findByRole('img', { name: 'QR Code do valor QR-1' })).toBeInTheDocument();
  });
});
