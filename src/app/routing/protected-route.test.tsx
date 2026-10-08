import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AuthContext, type AuthContextValue } from '@/app/auth/auth-context';
import type { AuthState } from '@/domain/identity/session';
import { ProtectedRoute } from './protected-route';

function renderRoute(state: AuthState, props: Partial<React.ComponentProps<typeof ProtectedRoute>> = {}) {
  const mfa = { begin: vi.fn(async () => ({ kind: 'challenge' as const, factorId: 'f' })), verify: vi.fn() };
  const value: AuthContextValue = {
    state, login: vi.fn(), logout: vi.fn(), confirmMfa: vi.fn(), mfa: mfa as never,
  };
  return render(
    <AuthContext.Provider value={value}>
      <ProtectedRoute {...props}><p>Conteúdo protegido</p></ProtectedRoute>
    </AuthContext.Provider>,
  );
}

describe('ProtectedRoute', () => {
  it('não exibe dados protegidos enquanto a sessão é verificada e anuncia o carregamento', () => {
    renderRoute({ status: 'checking' });
    expect(screen.queryByText('Conteúdo protegido')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(/verificando sua sessão/i);
    expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true');
  });

  it('conduz ao login quando não há sessão, sem exibir dados', () => {
    renderRoute({ status: 'signed_out' });
    expect(screen.queryByText('Conteúdo protegido')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /bem-vindo de volta/i })).toBeInTheDocument();
  });

  it.each([
    [{ status: 'signed_out', notice: 'session_expired', reason: 'inactivity' }, /inatividade/i],
    [{ status: 'signed_out', notice: 'session_revoked' }, /encerrada/i],
  ] as const)('com sessão expirada ou revogada orienta o login e move o foco ao aviso (%j)', (state, text) => {
    renderRoute(state as AuthState);
    expect(screen.queryByText('Conteúdo protegido')).not.toBeInTheDocument();
    const notice = screen.getByRole('alert');
    expect(notice).toHaveTextContent(text);
    expect(notice).toHaveFocus();
  });

  it('exige a verificação em duas etapas quando o login ficou em AAL1 limitado', () => {
    renderRoute({ status: 'mfa_required' });
    expect(screen.queryByText('Conteúdo protegido')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /verificação em duas etapas/i })).toBeInTheDocument();
  });

  it('em mfa_required a verificação usa a moldura pública: painel de marca, um só h1 e nenhum menu', () => {
    renderRoute({ status: 'mfa_required' });
    expect(screen.getByText('Cada cilindro, uma identidade.')).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
  });

  it('a verificação exigida de quem já entrou continua sem o painel de marca (dentro do shell autenticado)', () => {
    renderRoute({ status: 'authenticated', aal: 'aal1' } as AuthState, { requireAal2: true });
    expect(screen.getByRole('heading', { name: /verificação em duas etapas/i })).toBeInTheDocument();
    expect(screen.queryByText('Cada cilindro, uma identidade.')).not.toBeInTheDocument();
  });

  it('libera o conteúdo para sessão autenticada autorizada', () => {
    renderRoute({ status: 'authenticated', aal: 'aal1' });
    expect(screen.getByText('Conteúdo protegido')).toBeInTheDocument();
  });

  it('nega por padrão quando a autorização atual não comprova o acesso, com foco no aviso', () => {
    renderRoute({ status: 'authenticated', aal: 'aal1' }, { allowed: false });
    expect(screen.queryByText('Conteúdo protegido')).not.toBeInTheDocument();
    const denied = screen.getByRole('alert');
    expect(denied).toHaveTextContent(/acesso negado/i);
    expect(denied).toHaveFocus();
  });

  it('exige AAL2 em rotas globais ou críticas e conduz ao desafio adicional', () => {
    renderRoute({ status: 'authenticated', aal: 'aal1' }, { requireAal2: true });
    expect(screen.queryByText('Conteúdo protegido')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /verificação em duas etapas/i })).toBeInTheDocument();
  });

  it('libera a rota crítica somente com AAL2', () => {
    renderRoute({ status: 'authenticated', aal: 'aal2' }, { requireAal2: true });
    expect(screen.getByText('Conteúdo protegido')).toBeInTheDocument();
  });

  it('a mensagem de acesso negado não revela detalhes internos de segurança', () => {
    renderRoute({ status: 'authenticated', aal: 'aal1' }, { allowed: false });
    expect(screen.getByRole('alert').textContent).not.toMatch(/permiss(ão|ao) [a-z_.]+\.[a-z]+|tenant|rls|policy/i);
  });
});
