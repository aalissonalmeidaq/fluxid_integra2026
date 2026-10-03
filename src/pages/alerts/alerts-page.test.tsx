import { render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TenantContext, type TenantContextValue } from '@/app/tenant/tenant-context';
import { AlertsPage } from './alerts-page';

// Página de alertas (dados de exemplo): lista os alertas e mostra o detalhe do escolhido, com a organização ativa.
const OPCAO = { organizationId: 'org-1', displayName: 'Gases Norte', kind: 'tenant' as const };
const TENANT: TenantContextValue = {
  status: 'ready', selection: { kind: 'selected', option: OPCAO }, options: [OPCAO], activeOrganizationId: 'org-1',
  switching: false, select: vi.fn(), beginSwitch: vi.fn(), cancelSwitch: vi.fn(), reload: vi.fn(),
};

async function abrir(busca: string, tenant: TenantContextValue = TENANT) {
  window.history.pushState({}, '', `/alertas${busca}`);
  render(<TenantContext.Provider value={tenant}><AlertsPage /></TenantContext.Provider>);
  await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
}

describe('AlertsPage', () => {
  afterEach(() => window.history.pushState({}, '', '/'));

  it('tem o título "Alertas" como h2 e a marca "Exemplo"', async () => {
    await abrir('');
    expect(screen.getByRole('heading', { level: 2, name: 'Alertas' })).toBeInTheDocument();
    expect(screen.getAllByText('Exemplo').length).toBeGreaterThan(0);
  });

  it('lista os alertas e destaca os novos', async () => {
    await abrir('');
    const lista = screen.getByRole('list', { name: 'Lista de alertas' });
    expect(within(lista).getAllByRole('listitem')).toHaveLength(4);
    expect(within(lista).getAllByText('Novo')).toHaveLength(2);
  });

  it('mostra o detalhe do alerta escolhido pela URL: identificação, organização, cilindro, ocorrência, tipo, gravidade e situação', async () => {
    await abrir('?alerta=EX-A-02');
    const detalhe = screen.getByRole('region', { name: 'Detalhe do alerta' });
    expect(detalhe).toHaveTextContent('EX-A-02');
    expect(detalhe).toHaveTextContent('Gases Norte');
    expect(detalhe).toHaveTextContent('EX-0733');
    expect(detalhe).toHaveTextContent('Geocerca');
    expect(detalhe).toHaveTextContent(/saiu da geocerca/i);
    expect(detalhe).toHaveTextContent('Atenção');
    expect(detalhe).toHaveTextContent('Aberto');
    expect(screen.getByRole('link', { name: /Saída da geocerca/ })).toHaveAttribute('aria-current', 'true');
  });

  it('sem alerta na URL mostra o primeiro', async () => {
    await abrir('');
    expect(screen.getByRole('region', { name: 'Detalhe do alerta' })).toHaveTextContent('EX-A-01');
  });

  it('identificador desconhecido mostra aviso em vez de detalhe vazio', async () => {
    await abrir('?alerta=nao-existe');
    expect(screen.getByRole('region', { name: 'Detalhe do alerta' })).toHaveTextContent(/não encontrado/i);
  });

  it('sem organização ativa não inventa organização', async () => {
    await abrir('?alerta=EX-A-01', { ...TENANT, selection: { kind: 'none' }, options: [], activeOrganizationId: null });
    expect(screen.getByRole('region', { name: 'Detalhe do alerta' })).toHaveTextContent(/organizaçãos*não selecionada/i);
  });
});
