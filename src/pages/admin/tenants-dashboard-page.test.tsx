import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ConnectivityContext, initialResult, type ConnectivityContextValue } from '@/app/connectivity-context';
import type { AppConfig } from '@/config/environment';
import { TenantsDashboardPage } from './tenants-dashboard-page';

const call = vi.fn();
vi.mock('@/infrastructure/supabase/organization-adapter', () => ({ createOrganizationTransport: () => ({ call }) }));

const config = { endpoints: [{ kind: 'local', url: 'http://127.0.0.1:54321', publishableKey: 'sb_publishable_sintetica' }] } as unknown as AppConfig;
const organization = (id: string, name: string, status = 'active') => ({ id, legal_name: `${name} Ltda`, display_name: name, status, version: 1 });

function renderPage(over: Partial<ConnectivityContextValue> = {}) {
  const value: ConnectivityContextValue = {
    result: { ...initialResult, state: 'connected', selectedEndpoint: 'local' } as ConnectivityContextValue['result'],
    client: {} as ConnectivityContextValue['client'],
    config,
    reconnect: async () => {},
    reportOperationalError: () => {},
    ...over,
  };
  return render(<ConnectivityContext.Provider value={value}><TenantsDashboardPage /></ConnectivityContext.Provider>);
}

beforeEach(() => { call.mockReset(); });

describe('TenantsDashboardPage', () => {
  it('lista as organizações com o estado em português e ignora itens malformados', async () => {
    call.mockResolvedValue({ status: 200, body: { organizations: [organization('1', 'Alfa'), organization('2', 'Beta', 'suspended'), organization('3', 'Gama', 'inactive'), { id: 4 }] } });
    renderPage();
    const list = await screen.findByRole('list', { name: 'Organizações cadastradas' });
    expect(list.querySelectorAll('li')).toHaveLength(3);
    expect(screen.getByText('Ativa')).toBeInTheDocument();
    expect(screen.getByText('Suspensa')).toBeInTheDocument();
    expect(screen.getByText('Inativa')).toBeInTheDocument();
  });

  it('mostra o estado vazio quando não há organizações', async () => {
    call.mockResolvedValue({ status: 200, body: { organizations: [] } });
    renderPage();
    expect(await screen.findByText('Nenhuma organização cadastrada.')).toBeInTheDocument();
  });

  it.each([
    ['ACCESS_DENIED', 403, 'Acesso negado. Esta ação exige administração global.'],
    ['MFA_REQUIRED', 403, 'Confirme o segundo fator para administrar organizações.'],
    ['INTERNO', 500, 'Não foi possível acessar as organizações agora.'],
  ])('informa a falha %s com alerta e foco', async (code, status, message) => {
    call.mockResolvedValue({ status, body: { code } });
    renderPage();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(message);
    await waitFor(() => expect(alert).toHaveFocus());
  });

  it('sem conexão não tenta listar e avisa', async () => {
    renderPage({ client: null });
    expect(await screen.findByRole('alert')).toHaveTextContent('Conexão indisponível.');
    expect(call).not.toHaveBeenCalled();
  });

  it('cria uma organização, acrescenta na lista e confirma', async () => {
    call.mockResolvedValueOnce({ status: 200, body: { organizations: [] } });
    renderPage();
    await screen.findByText('Nenhuma organização cadastrada.');
    fireEvent.click(screen.getByRole('button', { name: 'Nova organização' }));
    fireEvent.change(screen.getByLabelText('Razão social'), { target: { value: '  Delta Ltda ' } });
    fireEvent.change(screen.getByLabelText('Nome de exibição'), { target: { value: 'Delta' } });
    fireEvent.change(screen.getByLabelText('Justificativa'), { target: { value: 'Cadastro inicial do cliente' } });
    call.mockResolvedValueOnce({ status: 201, body: { organization: organization('9', 'Delta') } });
    fireEvent.click(screen.getByRole('button', { name: 'Criar organização' }));

    await screen.findByText('Organização criada com sucesso.');
    expect(screen.getByRole('list', { name: 'Organizações cadastradas' })).toHaveTextContent('Delta');
    expect(call).toHaveBeenLastCalledWith({ operation: 'create', legal_name: 'Delta Ltda', display_name: 'Delta', justification: 'Cadastro inicial do cliente' });
    expect(screen.queryByRole('button', { name: 'Criar organização' })).not.toBeInTheDocument();
  });

  it('mantém o formulário e mostra o erro quando a criação falha', async () => {
    call.mockResolvedValueOnce({ status: 200, body: { organizations: [] } });
    renderPage();
    await screen.findByText('Nenhuma organização cadastrada.');
    fireEvent.click(screen.getByRole('button', { name: 'Nova organização' }));
    fireEvent.change(screen.getByLabelText('Razão social'), { target: { value: 'Delta Ltda' } });
    fireEvent.change(screen.getByLabelText('Nome de exibição'), { target: { value: 'Delta' } });
    fireEvent.change(screen.getByLabelText('Justificativa'), { target: { value: 'Cadastro inicial do cliente' } });
    call.mockResolvedValueOnce({ status: 409, body: { code: 'CONFLICT' } });
    fireEvent.click(screen.getByRole('button', { name: 'Criar organização' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('foi alterada por outra pessoa');
    expect(screen.getByRole('button', { name: 'Criar organização' })).toBeEnabled();
    expect(screen.queryByText('Nenhuma organização cadastrada.')).toBeInTheDocument();
  });
});
