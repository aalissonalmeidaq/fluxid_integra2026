import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PermissionsContext, type PermissionsContextValue } from '@/app/navigation/permissions-context';
import { AccessGate } from './access-gate';

const renderGate = (value: Partial<PermissionsContextValue>, permission = 'cylinder.write') =>
  render(
    <PermissionsContext.Provider value={{ status: 'ready', permissions: { tenant: [], global: [] }, retry: vi.fn(), ...value }}>
      <AccessGate permission={permission}><p>conteúdo protegido</p></AccessGate>
    </PermissionsContext.Provider>,
  );

describe('AccessGate: a permissão é confirmada no servidor antes de exibir a tela (Spec 004)', () => {
  it('enquanto a consulta de permissões carrega, não exibe o conteúdo nem nega', () => {
    renderGate({ status: 'loading', permissions: null });
    expect(screen.getByRole('status')).toHaveTextContent(/verificando/i);
    expect(screen.queryByText('conteúdo protegido')).not.toBeInTheDocument();
    expect(screen.queryByText(/acesso negado/i)).not.toBeInTheDocument();
  });

  it('com a permissão confirmada, exibe o conteúdo', () => {
    renderGate({ permissions: { tenant: ['cylinder.read', 'cylinder.write'], global: [] } });
    expect(screen.getByText('conteúdo protegido')).toBeInTheDocument();
  });

  it('sem a permissão, nega o acesso e NÃO renderiza o conteúdo', () => {
    renderGate({ permissions: { tenant: ['cylinder.read'], global: [] } });
    expect(screen.getByRole('alert')).toHaveTextContent(/não tem permissão/i);
    expect(screen.queryByText('conteúdo protegido')).not.toBeInTheDocument();
  });

  it('ser perfil global não concede a permissão do tenant', () => {
    renderGate({ permissions: { tenant: [], global: ['cylinder.write'] } });
    expect(screen.queryByText('conteúdo protegido')).not.toBeInTheDocument();
  });

  it('falha na consulta: erro com "Tentar de novo" e sem conteúdo', () => {
    const retry = vi.fn();
    renderGate({ status: 'error', permissions: null, retry });
    expect(screen.queryByText('conteúdo protegido')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /tentar novamente/i }));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('offline com as últimas permissões da mesma pessoa: exibe o conteúdo (a escrita exige conexão na própria tela)', () => {
    renderGate({ status: 'offline', permissions: { tenant: ['cylinder.write'], global: [] } });
    expect(screen.getByText('conteúdo protegido')).toBeInTheDocument();
  });

  it('offline sem permissões em cache: não exibe o conteúdo', () => {
    renderGate({ status: 'offline', permissions: null });
    expect(screen.queryByText('conteúdo protegido')).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(/sem conexão/i);
  });
});
