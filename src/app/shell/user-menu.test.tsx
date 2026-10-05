import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ProfileOutcome, ProfileService } from '@/application/identity/profile-service';
import { AuthContext, type AuthContextValue } from '../auth/auth-context';
import { TenantContext, type TenantContextValue } from '../tenant/tenant-context';
import { UserMenu } from './user-menu';

// RF-022, RA-005, RA-006: menu da pessoa em padrão de botão de divulgação, com nome lido só ao abrir.
const OPCAO = { organizationId: 'org-1', displayName: 'Gases Norte', kind: 'tenant' as const };

function tenant(over: Partial<TenantContextValue> = {}): TenantContextValue {
  return {
    status: 'ready', selection: { kind: 'selected', option: OPCAO }, options: [OPCAO], activeOrganizationId: 'org-1',
    switching: false, select: vi.fn(), beginSwitch: vi.fn(), cancelSwitch: vi.fn(), reload: vi.fn(), ...over,
  };
}

function servico(load: () => Promise<ProfileOutcome>): ProfileService {
  return { load: vi.fn(load) } as unknown as ProfileService;
}

const ANA: ProfileOutcome = { kind: 'success', value: { displayName: 'Ana Souza', locale: 'pt-BR', avatarUrl: null } };

function renderMenu(service: ProfileService | null, ctx: TenantContextValue = tenant(), logout = vi.fn(async () => undefined)) {
  const auth: AuthContextValue = { state: { status: 'authenticated', aal: 'aal1' }, login: vi.fn(), logout, confirmMfa: vi.fn(), mfa: null };
  render(
    <AuthContext.Provider value={auth}>
      <TenantContext.Provider value={ctx}>
        <div><button type="button">Fora</button><UserMenu service={service} /></div>
      </TenantContext.Provider>
    </AuthContext.Provider>,
  );
  return { logout };
}

const botao = () => screen.getByRole('button', { name: 'Minha conta' });

describe('UserMenu', () => {
  it('é um botão de divulgação, sem role="menu", com aria-expanded e aria-controls', () => {
    renderMenu(servico(async () => ANA));
    expect(botao()).toHaveAttribute('aria-expanded', 'false');
    expect(botao()).toHaveAttribute('aria-controls');
    fireEvent.click(botao());
    expect(botao()).toHaveAttribute('aria-expanded', 'true');
    expect(document.getElementById(botao().getAttribute('aria-controls') as string)).not.toBeNull();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('só lê o nome ao abrir e o mostra com a organização ativa, "Meu perfil" e "Sair"', async () => {
    const service = servico(async () => ANA);
    renderMenu(service);
    expect(service.load).not.toHaveBeenCalled();
    fireEvent.click(botao());
    expect(await screen.findByText('Ana Souza')).toBeInTheDocument();
    expect(service.load).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Gases Norte')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Meu perfil' })).toHaveAttribute('href', '/perfil');
    expect(screen.getByRole('button', { name: 'Sair' })).toBeInTheDocument();
  });

  it('"Sair" chama o logout existente', () => {
    const { logout } = renderMenu(servico(async () => ANA));
    fireEvent.click(botao());
    fireEvent.click(screen.getByRole('button', { name: 'Sair' }));
    expect(logout).toHaveBeenCalledTimes(1);
  });

  it('falha ou demora na leitura mostra "Minha conta" sem bloquear as ações', async () => {
    renderMenu(servico(async () => ({ kind: 'unavailable' })));
    fireEvent.click(botao());
    expect(screen.getByRole('link', { name: 'Meu perfil' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sair' })).toBeEnabled();
    await waitFor(() => expect(screen.getAllByText('Minha conta').length).toBeGreaterThan(0));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('sem serviço de perfil (sem conexão) mostra "Minha conta" e mantém as ações', () => {
    renderMenu(null);
    fireEvent.click(botao());
    expect(screen.getByRole('link', { name: 'Meu perfil' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sair' })).toBeInTheDocument();
  });

  it('Escape fecha e devolve o foco ao botão', () => {
    renderMenu(servico(async () => ANA));
    fireEvent.click(botao());
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(botao()).toHaveAttribute('aria-expanded', 'false');
    expect(botao()).toHaveFocus();
  });

  it('o clique fora fecha e devolve o foco ao botão', () => {
    renderMenu(servico(async () => ANA));
    fireEvent.click(botao());
    fireEvent.click(screen.getByRole('button', { name: 'Fora' }));
    expect(botao()).toHaveAttribute('aria-expanded', 'false');
    expect(botao()).toHaveFocus();
  });

  it('Tab percorre os itens na ordem: Meu perfil e Sair', () => {
    renderMenu(servico(async () => ANA));
    fireEvent.click(botao());
    const focaveis = Array.from(document.querySelectorAll<HTMLElement>('a[href], button')).map((elemento) => elemento.textContent?.trim());
    expect(focaveis.slice(focaveis.indexOf('Minha conta'))).toEqual(['Minha conta', 'Meu perfil', 'Sair']);
  });

  it('nome longo trunca com reticências, sem perder o nome acessível', async () => {
    const longo = 'Maria Aparecida de Souza e Albuquerque Montenegro Vasconcelos Filgueiras';
    renderMenu(servico(async () => ({ kind: 'success', value: { displayName: longo, locale: 'pt-BR', avatarUrl: null } })));
    fireEvent.click(botao());
    const nome = await screen.findByText(longo);
    expect(nome.className).toMatch(/truncate/);
    expect(nome).toHaveAttribute('title', longo);
  });

  it('perfil global sem tenant ativo não mostra organização', async () => {
    renderMenu(servico(async () => ANA), tenant({ selection: { kind: 'none' }, options: [], activeOrganizationId: null }));
    fireEvent.click(botao());
    await screen.findByText('Ana Souza');
    expect(screen.queryByText(/organização/i)).not.toBeInTheDocument();
  });
});
