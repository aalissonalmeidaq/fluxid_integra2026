import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { RegistryService } from '@/application/registry/registry-service';
import type { CustomerDetail, DriverDetail } from '@/application/registry/registry-views';
import { CustomerDetailView } from './customers/customer-detail-page';
import { DriverDetailView } from './drivers/driver-detail-page';

// Spec 007, história 8: o botão e o estado "anonimizado" nos detalhes (RF-058, RF-062). Valores fictícios.
const ORG = '20000000-0000-4000-8000-00000000000a';
const DRV = '86000000-0000-4000-8000-0000000000a1';
const CUS = '81000000-0000-4000-8000-0000000000a1';

const driver = (over: Partial<DriverDetail['driver']> = {}): DriverDetail => ({
  driver: { id: DRV, fullName: 'Carlos', cpfDisplay: '***.***.***-25', cnhDisplay: '********900', cnhCategory: 'B', cnhValidUntil: '2030-01-31', cnhStatus: 'em_dia', status: 'active', version: 3, linked: false, anonymizedAt: null, phone: '11987654321', ...over },
  linkedUser: null,
});
const customer = (over: Partial<CustomerDetail['customer']> = {}, contacts: CustomerDetail['contacts'] = []): CustomerDetail => ({
  customer: { id: CUS, personType: 'individual', documentDisplay: '***.***.***-35', legalName: 'Ana', tradeName: null, segment: 'other', status: 'inactive', anonymizedAt: null, segmentDetail: 'Consultório', notes: null, version: 4, createdAt: null, ...over },
  contacts, sites: [],
});
const history = vi.fn(async () => ({ kind: 'success', value: { events: [], next: null } }));

const fill = async (): Promise<HTMLElement> => {
  const dialog = await screen.findByRole('dialog');
  fireEvent.change(within(dialog).getByLabelText('Motivo'), { target: { value: 'data_subject_request' } });
  fireEvent.change(within(dialog).getByLabelText('Justificativa'), { target: { value: 'Pedido do titular' } });
  fireEvent.change(within(dialog).getByLabelText('Digite ANONIMIZAR para confirmar'), { target: { value: 'ANONIMIZAR' } });
  return dialog;
};

describe('anonimização nos detalhes (história 8)', () => {
  it('motorista ativo: o botão fica desabilitado com o motivo "inative antes"', async () => {
    const service = { history, getDriver: vi.fn(async () => ({ kind: 'success', value: driver() })), listLinkableUsers: vi.fn(async () => ({ kind: 'success', value: [] })) } as unknown as RegistryService;
    render(<DriverDetailView organizationId={ORG} service={service} online driverId={DRV} can={{ write: true, deactivate: true, document: true, history: true, anonymize: true }} />);
    const button = await screen.findByRole('button', { name: 'Anonimizar dados pessoais' });
    expect(button).toBeDisabled();
    expect(screen.getByText('Inative o motorista antes de anonimizar.')).toBeInTheDocument();
  });

  it('motorista inativo: anonimiza com a versão carregada, mostra o aviso com a data e bloqueia as ações', async () => {
    const getDriver = vi.fn().mockResolvedValueOnce({ kind: 'success', value: driver({ status: 'inactive' }) })
      .mockResolvedValue({ kind: 'success', value: driver({ status: 'inactive', anonymizedAt: '2026-10-07T15:00:00Z', fullName: 'Motorista anonimizado', cpfDisplay: 'anonimizado', cnhDisplay: 'anonimizado', phone: null, version: 4 }) });
    const anonymizeDriver = vi.fn(async () => ({ kind: 'success', value: { anonymizedAt: '2026-10-07T15:00:00Z' } }));
    const service = { history, getDriver, anonymizeDriver, listLinkableUsers: vi.fn(async () => ({ kind: 'success', value: [] })) } as unknown as RegistryService;
    render(<DriverDetailView organizationId={ORG} service={service} online driverId={DRV} can={{ write: true, deactivate: true, document: true, history: true, anonymize: true }} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Anonimizar dados pessoais' }));
    const dialog = await fill();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Anonimizar dados pessoais' }));
    await waitFor(() => expect(anonymizeDriver).toHaveBeenCalledWith(ORG, DRV, 3, { reason: 'data_subject_request', justification: 'Pedido do titular' }));
    expect(await screen.findByText('Dados pessoais anonimizados em 07/10/2026.')).toBeInTheDocument();
    expect(await screen.findByRole('heading', { level: 2, name: 'Motorista anonimizado' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Anonimizar dados pessoais' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reativar motorista' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Editar motorista' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Revelar/ })).not.toBeInTheDocument();
    expect(screen.getAllByText('Anonimizado').length).toBeGreaterThan(0);
  });

  it('sem a permissão de anonimizar o botão não aparece', async () => {
    const service = { history, getDriver: vi.fn(async () => ({ kind: 'success', value: driver({ status: 'inactive' }) })), listLinkableUsers: vi.fn() } as unknown as RegistryService;
    render(<DriverDetailView organizationId={ORG} service={service} online driverId={DRV} can={{ write: true, deactivate: true, document: true, history: true, anonymize: false }} />);
    await screen.findByRole('heading', { level: 2, name: 'Carlos' });
    expect(screen.queryByRole('button', { name: 'Anonimizar dados pessoais' })).not.toBeInTheDocument();
  });

  it('cliente pessoa física ativo: botão desabilitado com o motivo; cliente jurídico não oferece anonimizar o cliente', async () => {
    const active = { history, getCustomer: vi.fn(async () => ({ kind: 'success', value: customer({ status: 'active' }) })) } as unknown as RegistryService;
    const first = render(<CustomerDetailView organizationId={ORG} service={active} online customerId={CUS} can={{ write: true, deactivate: true, document: true, history: true, anonymize: true }} />);
    expect(await screen.findByRole('button', { name: 'Anonimizar dados pessoais' })).toBeDisabled();
    expect(screen.getByText('Inative o cliente antes de anonimizar.')).toBeInTheDocument();
    first.unmount();
    const legal = { history, getCustomer: vi.fn(async () => ({ kind: 'success', value: customer({ personType: 'legal', documentDisplay: '11222333000181', status: 'active' }) })) } as unknown as RegistryService;
    render(<CustomerDetailView organizationId={ORG} service={legal} online customerId={CUS} can={{ write: true, deactivate: true, document: true, history: true, anonymize: true }} />);
    await screen.findByRole('heading', { level: 2, name: 'Ana' });
    expect(screen.queryByRole('button', { name: 'Anonimizar dados pessoais' })).not.toBeInTheDocument();
  });

  it('cliente pessoa física inativo: anonimiza e mostra o nome fixo, o aviso e o contato anonimizado na lista', async () => {
    const contacts = [{ id: 'k1', name: 'Paula Contato', role: null, phone: null, email: null, isPrimary: true, anonymizedAt: null }];
    const after = customer({ legalName: 'Cliente anonimizado', anonymizedAt: '2026-10-07T15:00:00Z', documentDisplay: 'anonimizado', version: 5 }, [{ id: 'k1', name: 'Contato anonimizado', role: null, phone: null, email: null, isPrimary: false, anonymizedAt: '2026-10-07T15:00:00Z' }]);
    const getCustomer = vi.fn().mockResolvedValueOnce({ kind: 'success', value: customer({}, contacts) }).mockResolvedValue({ kind: 'success', value: after });
    const anonymizeCustomer = vi.fn(async () => ({ kind: 'success', value: { anonymizedAt: '2026-10-07T15:00:00Z' } }));
    const service = { history, getCustomer, anonymizeCustomer } as unknown as RegistryService;
    render(<CustomerDetailView organizationId={ORG} service={service} online customerId={CUS} can={{ write: true, deactivate: true, document: true, history: true, anonymize: true }} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Anonimizar dados pessoais' }));
    const dialog = await fill();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Anonimizar dados pessoais' }));
    await waitFor(() => expect(anonymizeCustomer).toHaveBeenCalledWith(ORG, CUS, 4, { reason: 'data_subject_request', justification: 'Pedido do titular' }));
    expect((await screen.findAllByText(/Dados pessoais anonimizados em 07\/10\/2026/)).length).toBeGreaterThan(0);
    expect(await screen.findByRole('heading', { level: 2, name: 'Cliente anonimizado' })).toBeInTheDocument();
    expect(screen.getByText('Contato anonimizado', { selector: 'p.font-semibold' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Editar cliente' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reativar cliente' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Revelar/ })).not.toBeInTheDocument();
  });

  it('contato: cada contato não anonimizado tem a própria ação, mesmo no cliente ativo, e o anonimizado não tem', async () => {
    const contacts = [
      { id: 'k1', name: 'Paula Contato', role: 'Compras', phone: null, email: null, isPrimary: true, anonymizedAt: null },
      { id: 'k2', name: 'Contato anonimizado', role: null, phone: null, email: null, isPrimary: false, anonymizedAt: '2026-10-01T10:00:00Z' },
    ];
    const anonymizeContact = vi.fn(async () => ({ kind: 'success', value: { anonymizedAt: '2026-10-07T15:00:00Z' } }));
    const service = { history, anonymizeContact, getCustomer: vi.fn(async () => ({ kind: 'success', value: customer({ personType: 'legal', status: 'active', documentDisplay: '11222333000181' }, contacts) })) } as unknown as RegistryService;
    render(<CustomerDetailView organizationId={ORG} service={service} online customerId={CUS} can={{ write: true, deactivate: true, document: true, history: true, anonymize: true }} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Anonimizar contato Paula Contato' }));
    expect(screen.queryByRole('button', { name: 'Anonimizar contato Contato anonimizado' })).not.toBeInTheDocument();
    const dialog = await fill();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Anonimizar dados pessoais' }));
    await waitFor(() => expect(anonymizeContact).toHaveBeenCalledWith(ORG, 'k1', { reason: 'data_subject_request', justification: 'Pedido do titular' }));
    expect(await screen.findByText(/Contato anonimizado em 07\/10\/2026/)).toBeInTheDocument();
  });
});
