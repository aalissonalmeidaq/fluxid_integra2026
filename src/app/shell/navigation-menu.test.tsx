import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { AuthContext, type AuthContextValue } from '../auth/auth-context';
import { PermissionsContext, type PermissionsContextValue } from '../navigation/permissions-context';
import type { AuthState } from '@/domain/identity/session';
import type { ActorPermissions } from '@/domain/navigation/visible-screens';
import { NavigationMenu } from './navigation-menu';

const authValue = (state: AuthState): AuthContextValue => ({
  state, login: vi.fn(), logout: vi.fn(), confirmMfa: vi.fn(), mfa: null,
});

const ADMIN: ActorPermissions = { tenant: ['audit.read', 'tenant.manage', 'profile.read'], global: [] };
const OPERATOR: ActorPermissions = { tenant: ['profile.read'], global: [] };
const MASTER: ActorPermissions = { tenant: [], global: ['audit.read', 'platform.manage', 'profile.read', 'tenant.manage'] };

interface Options {
  auth?: AuthState;
  permissions?: Partial<PermissionsContextValue>;
  open?: boolean;
  onClose?: () => void;
  toggle?: React.RefObject<HTMLButtonElement | null>;
}

function renderMenu({ auth = { status: 'authenticated', aal: 'aal1' }, permissions = {}, open = true, onClose = vi.fn(), toggle }: Options = {}) {
  const value: PermissionsContextValue = { status: 'ready', permissions: ADMIN, retry: vi.fn(), ...permissions };
  const element = (isOpen: boolean) => (
    <AuthContext.Provider value={authValue(auth)}>
      <PermissionsContext.Provider value={value}>
        <button ref={toggle} type="button">Menu</button>
        <button type="button">Fora do menu</button>
        <NavigationMenu open={isOpen} onClose={onClose} {...(toggle ? { toggleRef: toggle } : {})} />
      </PermissionsContext.Provider>
    </AuthContext.Provider>
  );
  const view = render(element(open));
  return { ...view, setOpen: (isOpen: boolean) => view.rerender(element(isOpen)), value, onClose };
}

const itemLabels = () => within(screen.getByRole('navigation', { name: 'Navegação principal' })).getAllByRole('link').map((link) => link.textContent?.replace(' (página atual)', ''));

afterEach(() => { window.history.pushState({}, '', '/'); });

describe('NavigationMenu: estrutura e itens por perfil (RF-005, RF-006, RF-009, CA-001)', () => {
  it('é um nav com nome acessível, lista, itens e links com o caminho do catálogo', () => {
    renderMenu();
    const nav = screen.getByRole('navigation', { name: 'Navegação principal' });
    expect(within(nav).getByRole('list')).toBeInTheDocument();
    expect(within(nav).getAllByRole('listitem').length).toBeGreaterThan(0);
    expect(within(nav).getByRole('link', { name: /^Início/ })).toHaveAttribute('href', '/');
    expect(within(nav).getByRole('link', { name: 'Meu perfil' })).toHaveAttribute('href', '/perfil');
    expect(within(nav).getByRole('link', { name: 'Papéis e permissões' })).toHaveAttribute('href', '/admin/papeis');
  });

  it('administrador de tenant vê as telas do tenant', () => {
    renderMenu({ permissions: { permissions: ADMIN } });
    expect(itemLabels()).toEqual(['Início', 'Meu perfil', 'Pessoas do tenant', 'Papéis e permissões', 'Auditoria do tenant']);
  });

  it('operador vê só Início e Meu perfil', () => {
    renderMenu({ permissions: { permissions: OPERATOR } });
    expect(itemLabels()).toEqual(['Início', 'Meu perfil']);
  });

  it('Master vê as telas globais e nenhuma do tenant', () => {
    renderMenu({ permissions: { permissions: MASTER } });
    expect(itemLabels()).toEqual(['Início', 'Meu perfil', 'Organizações', 'Auditoria da plataforma']);
  });

  it('o item atual tem aria-current="page" e o texto "(página atual)"', () => {
    window.history.pushState({}, '', '/admin/papeis');
    renderMenu();
    const atual = screen.getByRole('link', { name: 'Papéis e permissões (página atual)' });
    expect(atual).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: /^Início/ })).not.toHaveAttribute('aria-current');
  });

  it('cada link tem alvo mínimo de 44 px e quebra texto longo dentro do item', () => {
    renderMenu();
    for (const link of within(screen.getByRole('navigation')).getAllByRole('link')) {
      expect(link.className).toContain('min-h-alvo');
      expect(link.className).toContain('min-w-0');
      expect(link.className).toContain('break-words');
    }
  });
});

describe('NavigationMenu: sessão (RN-004)', () => {
  it.each<[string, AuthState]>([
    ['sem sessão', { status: 'signed_out' }],
    ['verificando a sessão', { status: 'checking' }],
    ['sessão limitada à verificação em duas etapas', { status: 'mfa_required' }],
  ])('não renderiza %s', (_nome, auth) => {
    renderMenu({ auth });
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});

describe('NavigationMenu: estados (RF-007, RF-018 a RF-020, CA-006)', () => {
  it('carregando mostra só Início e Meu perfil e uma região de status anunciada', () => {
    renderMenu({ permissions: { status: 'loading', permissions: null } });
    expect(itemLabels()).toEqual(['Início', 'Meu perfil']);
    const status = screen.getAllByRole('status');
    expect(status).toHaveLength(1);
    expect(status[0]).toHaveTextContent('Carregando telas…');
  });

  it('nunca mostra item restrito em loading ou error, mesmo que o contexto traga permissões', () => {
    const { unmount } = renderMenu({ permissions: { status: 'loading', permissions: ADMIN } });
    expect(itemLabels()).toEqual(['Início', 'Meu perfil']);
    unmount();
    renderMenu({ permissions: { status: 'error', permissions: ADMIN } });
    expect(itemLabels()).toEqual(['Início', 'Meu perfil']);
  });

  it('a tela restrita atual também não aparece antes da confirmação', () => {
    window.history.pushState({}, '', '/admin/papeis');
    renderMenu({ permissions: { status: 'loading', permissions: null } });
    expect(screen.queryByRole('link', { name: /Papéis e permissões/ })).not.toBeInTheDocument();
  });

  it('erro mostra o aviso e "Tentar de novo", que refaz a consulta', () => {
    const retry = vi.fn();
    renderMenu({ permissions: { status: 'error', permissions: null, retry } });
    expect(itemLabels()).toEqual(['Início', 'Meu perfil']);
    expect(screen.getByRole('alert')).toHaveTextContent('Parte das telas não pôde ser listada.');
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('offline com cache mostra as últimas telas e avisa que podem estar desatualizadas', () => {
    renderMenu({ permissions: { status: 'offline', permissions: ADMIN } });
    expect(itemLabels()).toEqual(['Início', 'Meu perfil', 'Pessoas do tenant', 'Papéis e permissões', 'Auditoria do tenant']);
    expect(screen.getByRole('status')).toHaveTextContent('Sem conexão. As telas podem estar desatualizadas.');
  });

  it('offline sem cache mostra só Início e Meu perfil e o mesmo aviso', () => {
    renderMenu({ permissions: { status: 'offline', permissions: null } });
    expect(itemLabels()).toEqual(['Início', 'Meu perfil']);
    expect(screen.getByRole('status')).toHaveTextContent('Sem conexão. As telas podem estar desatualizadas.');
  });

  it('pronto não mostra aviso nem região de status', () => {
    renderMenu();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it.each(['loading', 'error', 'offline'] as const)('o estado %s não move o foco nem bloqueia o teclado', (status) => {
    renderMenu({ permissions: { status, permissions: null } });
    expect(document.body).toHaveFocus();
    const first = screen.getAllByRole('link')[0];
    first?.focus();
    expect(first).toHaveFocus();
  });
});

describe('NavigationMenu: painel recolhido (RF-012 a RF-014, RA-005, RA-006)', () => {
  it('fechado fica com hidden e fora da ordem de Tab; aberto não', () => {
    const { setOpen } = renderMenu({ open: false });
    const nav = document.querySelector('nav');
    expect(nav).toHaveAttribute('hidden');
    expect(screen.queryByRole('link', { name: /^Início/ })).not.toBeInTheDocument();
    setOpen(true);
    expect(nav).not.toHaveAttribute('hidden');
    expect(screen.getByRole('link', { name: /^Início/ })).toBeInTheDocument();
  });

  it('a partir de 768 px o menu é uma coluna sempre visível, mesmo fechado', () => {
    const listeners = new Set<() => void>();
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query === '(min-width: 768px)', media: query,
      addEventListener: (_: string, listener: () => void) => listeners.add(listener),
      removeEventListener: (_: string, listener: () => void) => listeners.delete(listener),
    }));
    try {
      renderMenu({ open: false });
      expect(document.querySelector('nav')).not.toHaveAttribute('hidden');
      expect(screen.getByRole('link', { name: /^Início/ })).toBeInTheDocument();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('abrir leva o foco ao primeiro item', () => {
    const { setOpen } = renderMenu({ open: false });
    setOpen(true);
    expect(screen.getByRole('link', { name: /^Início/ })).toHaveFocus();
  });

  it('já iniciar aberto não rouba o foco da página', () => {
    renderMenu({ open: true });
    expect(document.body).toHaveFocus();
  });

  it('Escape fecha e devolve o foco ao botão', () => {
    const toggle = { current: null } as React.RefObject<HTMLButtonElement | null>;
    const { onClose, setOpen } = renderMenu({ open: false, toggle });
    setOpen(true);
    fireEvent.keyDown(screen.getByRole('link', { name: /^Início/ }), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(toggle.current).toHaveFocus();
  });

  it('Escape com o painel fechado não faz nada', () => {
    const toggle = { current: null } as React.RefObject<HTMLButtonElement | null>;
    const { onClose } = renderMenu({ open: false, toggle });
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('tocar ou clicar fora do painel aberto o fecha e devolve o foco ao botão', () => {
    const toggle = { current: null } as React.RefObject<HTMLButtonElement | null>;
    const { onClose } = renderMenu({ open: true, toggle });
    fireEvent.click(screen.getByRole('button', { name: 'Fora do menu' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(toggle.current).toHaveFocus();
  });

  it('clicar dentro do painel ou no próprio botão não o fecha por esse caminho', () => {
    const toggle = { current: null } as React.RefObject<HTMLButtonElement | null>;
    const { onClose } = renderMenu({ open: true, toggle });
    fireEvent.click(screen.getByRole('link', { name: 'Meu perfil' }));
    fireEvent.click(screen.getByRole('button', { name: 'Menu' }));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('fora do painel com ele fechado não faz nada', () => {
    const { onClose } = renderMenu({ open: false });
    fireEvent.click(screen.getByRole('button', { name: 'Fora do menu' }));
    expect(onClose).not.toHaveBeenCalled();
  });
});
