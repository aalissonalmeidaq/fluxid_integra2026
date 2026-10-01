import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { AppShell } from './app-shell';
import { AuthContext, type AuthContextValue } from '../auth/auth-context';
import { ConnectivityContext, initialResult, type ConnectivityContextValue } from '../connectivity-context';
import { TenantContext, type TenantContextValue } from '../tenant/tenant-context';
import type { AuthState } from '@/domain/identity/session';

const auth = (state: AuthState, logout = vi.fn(async () => undefined)): AuthContextValue => ({
  state,
  login: vi.fn(),
  logout,
  confirmMfa: vi.fn(),
  mfa: null,
});

const tenant: TenantContextValue = {
  status: 'ready',
  selection: { kind: 'selected', option: { organizationId: 'org-1', displayName: 'Gases Norte', kind: 'tenant' } },
  options: [{ organizationId: 'org-1', displayName: 'Gases Norte', kind: 'tenant' }],
  activeOrganizationId: 'org-1',
  switching: false,
  select: vi.fn(),
  beginSwitch: vi.fn(),
  cancelSwitch: vi.fn(),
  reload: vi.fn(),
};

function connectivity(state: ConnectivityContextValue['result']['state'], reconnect = vi.fn(async () => undefined)): ConnectivityContextValue {
  return { result: { ...initialResult, state }, client: null, config: null, reconnect, reportOperationalError: vi.fn() };
}

function renderShell(options: { authState?: AuthState; conn?: ConnectivityContextValue; logout?: () => Promise<void> } = {}) {
  const { authState = { status: 'signed_out' }, conn = connectivity('connected'), logout } = options;
  return render(
    <ConnectivityContext.Provider value={conn}>
      <AuthContext.Provider value={auth(authState, logout as never)}>
        <TenantContext.Provider value={tenant}>
          <AppShell>
            <h2>Conteúdo da rota</h2>
          </AppShell>
        </TenantContext.Provider>
      </AuthContext.Provider>
    </ConnectivityContext.Provider>,
  );
}

describe('AppShell', () => {
  it('o link de pular é o primeiro item da ordem de Tab e leva o foco ao main', () => {
    renderShell();
    const primeiro = document.body.querySelector<HTMLElement>('a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])');
    const link = screen.getByRole('link', { name: 'Pular para o conteúdo principal' });
    expect(primeiro).toBe(link);
    fireEvent.click(link);
    expect(screen.getByRole('main')).toHaveFocus();
  });

  it('tem um único main com id main-content e o conteúdo da rota dentro dele', () => {
    renderShell();
    const mains = screen.getAllByRole('main');
    expect(mains).toHaveLength(1);
    expect(mains[0]).toHaveAttribute('id', 'main-content');
    expect(mains[0]).toHaveAttribute('tabindex', '-1');
    expect(within(mains[0]!).getByRole('heading', { name: 'Conteúdo da rota' })).toBeInTheDocument();
  });

  it('o cabeçalho exibe o logotipo horizontal como título principal', () => {
    renderShell();
    const banner = screen.getByRole('banner');
    const h1 = within(banner).getByRole('heading', { level: 1, name: 'FluxID' });
    expect(within(h1).getByRole('img', { name: 'FluxID' })).toBeInTheDocument();
  });

  it('exibe o rodapé institucional', () => {
    renderShell();
    expect(screen.getByRole('contentinfo')).toHaveTextContent('FluxID');
  });

  it('deslogado não mostra organização, menu nem sair', () => {
    renderShell();
    expect(screen.queryByText(/organização ativa/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { hidden: true, name: 'Meu perfil' })).not.toBeInTheDocument();
    expect(screen.queryByRole('navigation', { hidden: true })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Menu' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sair' })).not.toBeInTheDocument();
  });

  it('autenticado mostra organização ativa e sair; o perfil fica no menu, não no cabeçalho', async () => {
    const logout = vi.fn(async () => undefined);
    renderShell({ authState: { status: 'authenticated', aal: 'aal2' }, logout });
    expect(screen.getByText('Gases Norte')).toBeInTheDocument();
    expect(within(screen.getByRole('banner')).queryByRole('link', { hidden: true, name: 'Meu perfil' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { hidden: true, name: 'Meu perfil' })).toHaveAttribute('href', '/perfil');
    fireEvent.click(screen.getByRole('button', { name: 'Sair' }));
    expect(logout).toHaveBeenCalledTimes(1);
  });

  it('com sessão limitada à verificação em duas etapas não há menu', () => {
    renderShell({ authState: { status: 'mfa_required' } });
    expect(screen.queryByRole('navigation', { hidden: true })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Menu' })).not.toBeInTheDocument();
  });

  it('o menu começa fechado e o botão do menu vem depois do link de pular na ordem de Tab', () => {
    renderShell({ authState: { status: 'authenticated', aal: 'aal1' } });
    const focusable = [...document.body.querySelectorAll<HTMLElement>('a[href], button')].filter((element) => !element.closest('[hidden]'));
    expect(focusable[0]).toBe(screen.getByRole('link', { name: 'Pular para o conteúdo principal' }));
    expect(focusable[1]).toBe(screen.getByRole('button', { name: 'Menu' }));
    expect(screen.getByRole('button', { name: 'Menu' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('navigation', { name: 'Navegação principal' })).not.toBeInTheDocument();
  });

  it('o botão abre o menu com o foco no primeiro item, e Escape fecha devolvendo o foco ao botão', () => {
    renderShell({ authState: { status: 'authenticated', aal: 'aal1' } });
    const toggle = screen.getByRole('button', { name: 'Menu' });
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(toggle).toHaveAttribute('aria-controls', screen.getByRole('navigation', { name: 'Navegação principal' }).id);
    expect(within(screen.getByRole('navigation')).getAllByRole('link')[0]).toHaveFocus();
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveFocus();
  });

  it('ativar um item do menu deixa o aviso para a próxima tela, que leva o foco ao título (RF-013)', () => {
    sessionStorage.clear();
    const view = renderShell({ authState: { status: 'authenticated', aal: 'aal1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Menu' }));
    const link = screen.getByRole('link', { name: /Meu perfil/ });
    link.addEventListener('click', (event) => event.preventDefault());
    fireEvent.click(link);
    expect(sessionStorage.getItem('fluxid.menu-navegacao')).not.toBeNull();
    view.unmount();

    renderShell({ authState: { status: 'authenticated', aal: 'aal1' } });
    expect(screen.getByRole('heading', { name: 'Conteúdo da rota' })).toHaveFocus();
    expect(sessionStorage.getItem('fluxid.menu-navegacao')).toBeNull();
  });

  it('carregar a tela sem passar pelo menu não move o foco', () => {
    sessionStorage.clear();
    renderShell({ authState: { status: 'authenticated', aal: 'aal1' } });
    expect(document.body).toHaveFocus();
  });

  it('o menu fica ao lado do único main, fora dele', () => {
    renderShell({ authState: { status: 'authenticated', aal: 'aal1' } });
    const nav = screen.getByRole('navigation', { hidden: true });
    expect(screen.getAllByRole('main')).toHaveLength(1);
    expect(screen.getByRole('main').contains(nav)).toBe(false);
  });

  it('offline mostra o botão de reconectar na barra de conexão, inclusive deslogado', () => {
    const reconnect = vi.fn(async () => undefined);
    renderShell({ conn: connectivity('offline', reconnect) });
    const bar = screen.getByTestId('connection-bar');
    fireEvent.click(within(bar).getByRole('button', { name: /reconectar/i }));
    expect(reconnect).toHaveBeenCalledTimes(1);
  });

  it('avisa quando o dispositivo perde a rede e some ao voltar', () => {
    renderShell();
    expect(screen.queryByText(/modo offline em operação/i)).not.toBeInTheDocument();
    act(() => {
      window.dispatchEvent(new Event('offline'));
    });
    expect(screen.getByText(/modo offline em operação/i).closest('[role="status"]')).not.toBeNull();
    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    expect(screen.queryByText(/modo offline em operação/i)).not.toBeInTheDocument();
  });

  it('o idioma do documento é pt-BR', () => {
    renderShell();
    expect(document.documentElement.lang).toBe('pt-BR');
  });
});
