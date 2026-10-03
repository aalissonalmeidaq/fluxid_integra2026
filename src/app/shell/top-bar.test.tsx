import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthContext, type AuthContextValue } from '../auth/auth-context';
import { TenantContext, type TenantContextValue } from '../tenant/tenant-context';
import { TopBar } from './top-bar';

// RF-021, RF-027: barra superior com o logotipo (h1) só abaixo de 768 px, organização ativa, instalar PWA e menu da pessoa.
const OPCAO_A = { organizationId: 'org-1', displayName: 'Gases Norte', kind: 'tenant' as const };
const OPCAO_B = { organizationId: 'org-2', displayName: 'Gases Sul', kind: 'tenant' as const };

function tenant(over: Partial<TenantContextValue> = {}): TenantContextValue {
  return {
    status: 'ready', selection: { kind: 'selected', option: OPCAO_A }, options: [OPCAO_A], activeOrganizationId: 'org-1',
    switching: false, select: vi.fn(), beginSwitch: vi.fn(), cancelSwitch: vi.fn(), reload: vi.fn(), ...over,
  };
}

const auth: AuthContextValue = { state: { status: 'authenticated', aal: 'aal1' }, login: vi.fn(), logout: vi.fn(async () => undefined), confirmMfa: vi.fn(), mfa: null };

function renderBar(ctx: TenantContextValue = tenant()) {
  return render(
    <AuthContext.Provider value={auth}>
      <TenantContext.Provider value={ctx}><TopBar menuToggle={<button type="button">Menu</button>} /></TenantContext.Provider>
    </AuthContext.Provider>,
  );
}

function larguraDaJanela(larga: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: larga && /min-width/.test(query), media: query, addEventListener: () => undefined, removeEventListener: () => undefined }));
}

describe('TopBar', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('abaixo de 768 px mostra o botão do menu e o logotipo como h1', () => {
    larguraDaJanela(false);
    renderBar();
    expect(screen.getByRole('button', { name: 'Menu' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: /FluxID/ })).toBeInTheDocument();
  });

  it('a partir de 768 px a barra não repete o logotipo nem tem h1', () => {
    larguraDaJanela(true);
    renderBar();
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument();
    expect(screen.queryByRole('img', { name: 'FluxID' })).not.toBeInTheDocument();
  });

  it('mostra a organização ativa e, com mais de um vínculo, "Trocar organização"', () => {
    larguraDaJanela(true);
    const beginSwitch = vi.fn();
    renderBar(tenant({ options: [OPCAO_A, OPCAO_B], beginSwitch }));
    expect(screen.getByText('Gases Norte')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Trocar organização' }));
    expect(beginSwitch).toHaveBeenCalledTimes(1);
  });

  it('com um só vínculo não oferece a troca', () => {
    larguraDaJanela(true);
    renderBar();
    expect(screen.queryByRole('button', { name: 'Trocar organização' })).not.toBeInTheDocument();
  });

  it('perfil global sem tenant ativo mostra só o que existe', () => {
    larguraDaJanela(true);
    renderBar(tenant({ selection: { kind: 'none' }, options: [], activeOrganizationId: null }));
    expect(screen.queryByText(/organização ativa/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Minha conta' })).toBeInTheDocument();
  });

  it('mostra "Instalar App" só quando instalável', () => {
    larguraDaJanela(true);
    renderBar();
    expect(screen.queryByRole('button', { name: 'Instalar App' })).not.toBeInTheDocument();
    act(() => { window.dispatchEvent(Object.assign(new Event('beforeinstallprompt'), { prompt: async () => undefined, userChoice: Promise.resolve({ outcome: 'dismissed' }) })); });
    expect(screen.getByRole('button', { name: 'Instalar App' })).toBeInTheDocument();
  });

  it('tem o botão do menu da pessoa fechado por padrão', () => {
    larguraDaJanela(true);
    renderBar();
    expect(screen.getByRole('button', { name: 'Minha conta' })).toHaveAttribute('aria-expanded', 'false');
  });
});
