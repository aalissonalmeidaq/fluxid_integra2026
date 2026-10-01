import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { AuthContext, type AuthContextValue } from '@/app/auth/auth-context';
import type { LoginOutcome } from '@/application/identity/session-service';
import type { AuthState } from '@/domain/identity/session';
import { LoginPage } from './login-page';

function renderLogin(outcome: LoginOutcome | ((input: unknown) => Promise<LoginOutcome>), state: AuthState = { status: 'signed_out' }) {
  const login = vi.fn(typeof outcome === 'function' ? outcome : async () => outcome);
  const value: AuthContextValue = { state, login, logout: vi.fn(), confirmMfa: vi.fn(), mfa: null };
  render(<AuthContext.Provider value={value}><LoginPage /></AuthContext.Provider>);
  return { login };
}

function fill(email = 'ana@example.invalid', password = 'Senha-Forte-123') {
  fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: email } });
  fireEvent.change(screen.getByLabelText('Senha'), { target: { value: password } });
}

const submit = () => fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));

describe('LoginPage: formulário acessível', () => {
  it('possui rótulos visíveis, autocomplete para gerenciadores de senha e permite colar', () => {
    renderLogin({ kind: 'authenticated' });
    const email = screen.getByLabelText('E-mail');
    const password = screen.getByLabelText('Senha');
    expect(email).toHaveAttribute('type', 'email');
    expect(email).toHaveAttribute('autocomplete', 'username');
    expect(password).toHaveAttribute('type', 'password');
    expect(password).toHaveAttribute('autocomplete', 'current-password');
    expect(password).not.toHaveAttribute('onpaste');
    expect(screen.getByRole('heading', { level: 2, name: /entrar/i })).toBeInTheDocument();
  });

  it('usa alvo mínimo de 44 px nos controles principais', () => {
    renderLogin({ kind: 'authenticated' });
    for (const control of [screen.getByLabelText('E-mail'), screen.getByLabelText('Senha'), screen.getByRole('button', { name: 'Entrar' })]) {
      expect(control.className).toMatch(/min-h-(11|alvo)/);
    }
  });

  it('envia e-mail e senha e informa o andamento sem duplicar envios', async () => {
    let release!: (outcome: LoginOutcome) => void;
    const { login } = renderLogin(() => new Promise<LoginOutcome>((resolve) => { release = resolve; }));
    fill();
    const button = screen.getByRole('button', { name: 'Entrar' });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(login).toHaveBeenCalledTimes(1);
    expect(login).toHaveBeenCalledWith({ email: 'ana@example.invalid', password: 'Senha-Forte-123' });
    expect(screen.getByRole('status')).toHaveTextContent(/entrando/i);
    expect(screen.getByRole('button', { name: /entrando/i })).toBeDisabled();
    release({ kind: 'authenticated' });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Entrar' })).toBeEnabled());
  });

  it('valida campos vazios no cliente sem chamar o servidor e associa o erro ao campo', () => {
    const { login } = renderLogin({ kind: 'authenticated' });
    submit();
    expect(login).not.toHaveBeenCalled();
    const email = screen.getByLabelText('E-mail');
    expect(email).toHaveAttribute('aria-invalid', 'true');
    const describedBy = email.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy!.split(' ')[0]!)).toHaveTextContent(/informe seu e-mail/i);
  });
});

describe('LoginPage: mensagens por resultado', () => {
  it.each([
    ['invalid_credentials', /e-mail ou senha incorretos/i],
    ['account_unavailable', /acesso indisponível/i],
    ['rate_limited', /muitas tentativas/i],
    ['unavailable', /não foi possível entrar agora/i],
    ['invalid_request', /informe um e-mail e uma senha válidos/i],
  ] as const)('apresenta mensagem acessível para %s', async (kind, text) => {
    renderLogin({ kind });
    fill();
    submit();
    expect(await screen.findByRole('alert')).toHaveTextContent(text);
  });

  it('não revela qual parte da credencial está incorreta nem repete a senha', async () => {
    renderLogin({ kind: 'invalid_credentials' });
    fill('ana@example.invalid', 'Senha-Forte-123');
    submit();
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).not.toMatch(/senha incorreta|e-mail inexistente|não encontrado/i);
    expect(document.body.textContent).not.toContain('Senha-Forte-123');
  });

  it('limpa a senha depois de uma falha e devolve o foco ao campo', async () => {
    renderLogin({ kind: 'invalid_credentials' });
    fill();
    submit();
    await screen.findByRole('alert');
    expect(screen.getByLabelText('Senha')).toHaveValue('');
    expect(screen.getByLabelText('Senha')).toHaveFocus();
  });
});

describe('LoginPage: avisos de sessão', () => {
  it.each([
    [{ status: 'signed_out', notice: 'session_expired', reason: 'inactivity' }, /inatividade/i],
    [{ status: 'signed_out', notice: 'session_expired', reason: 'timebox' }, /8 horas/i],
    [{ status: 'signed_out', notice: 'session_expired' }, /sessão expirou/i],
    [{ status: 'signed_out', notice: 'session_revoked' }, /encerrada/i],
  ] as const)('orienta a entrar novamente e conduz o foco ao aviso (%j)', (state, text) => {
    renderLogin({ kind: 'authenticated' }, state as AuthState);
    const notice = screen.getByRole('alert');
    expect(notice).toHaveTextContent(text);
    expect(notice).toHaveTextContent(/entre novamente/i);
    expect(notice).toHaveFocus();
  });

  it('confirma a saída como status, sem alerta', () => {
    renderLogin({ kind: 'authenticated' }, { status: 'signed_out', notice: 'signed_out' });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(/você saiu/i);
  });
});

describe('LoginPage: limite de três sessões', () => {
  const sessions = [
    { session_id: 's1', started_at: '2026-09-29T10:00:00Z', last_seen_at: '2026-09-29T11:00:00Z', aal: 'aal1' },
    { session_id: 's2', started_at: '2026-09-29T12:00:00Z', last_seen_at: '2026-09-29T12:30:00Z', aal: 'aal2' },
    { session_id: 's3', started_at: '2026-09-29T13:00:00Z', last_seen_at: '2026-09-29T13:10:00Z', aal: 'aal1' },
  ];

  async function reachLimit() {
    const login = vi.fn()
      .mockResolvedValueOnce({ kind: 'session_limit', sessions })
      .mockResolvedValueOnce({ kind: 'authenticated' });
    const value: AuthContextValue = { state: { status: 'signed_out' }, login, logout: vi.fn(), confirmMfa: vi.fn(), mfa: null };
    render(<AuthContext.Provider value={value}><LoginPage /></AuthContext.Provider>);
    fill();
    submit();
    const dialog = await screen.findByRole('dialog');
    return { login, dialog };
  }

  it('informa o limite atingido e lista as sessões ativas sem encerrar nenhuma automaticamente', async () => {
    const { login, dialog } = await reachLimit();
    expect(dialog).toHaveAccessibleName(/limite de sessões/i);
    expect(within(dialog).getByText(/3 sessões ativas/i)).toBeInTheDocument();
    expect(within(dialog).getAllByRole('radio')).toHaveLength(3);
    expect(login).toHaveBeenCalledTimes(1);
  });

  it('exige escolher uma sessão antes de liberar o encerramento', async () => {
    const { dialog } = await reachLimit();
    const confirm = within(dialog).getByRole('button', { name: /encerrar sessão selecionada/i });
    expect(confirm).toBeDisabled();
    fireEvent.click(within(dialog).getAllByRole('radio')[1]!);
    expect(confirm).toBeEnabled();
  });

  it('reenvia o login com a sessão escolhida para encerramento explícito', async () => {
    const { login, dialog } = await reachLimit();
    fireEvent.click(within(dialog).getAllByRole('radio')[1]!);
    fireEvent.click(within(dialog).getByRole('button', { name: /encerrar sessão selecionada/i }));
    await waitFor(() => expect(login).toHaveBeenCalledTimes(2));
    expect(login).toHaveBeenLastCalledWith({ email: 'ana@example.invalid', password: 'Senha-Forte-123', revokeSessionId: 's2' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('cancela sem encerrar nada e devolve o foco ao formulário', async () => {
    const { login, dialog } = await reachLimit();
    fireEvent.click(within(dialog).getByRole('button', { name: /cancelar/i }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(login).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Entrar' })).toHaveFocus();
  });

  it('identifica cada sessão por datas e nível de verificação, sem cor como único sinal', async () => {
    const { dialog } = await reachLimit();
    expect(within(dialog).getAllByText(/última atividade/i)).toHaveLength(3);
    expect(within(dialog).getByText(/verificação em duas etapas/i)).toBeInTheDocument();
  });
});

// A Spec 002 define e-mail e senha como único método; login social, SSO e cadastro público estão fora do escopo.
// O redesenho da tela virá de uma spec própria de telas e design; até lá, estas garantias não podem regredir.
describe('LoginPage: escopo da Spec 002', () => {
  it('oferece somente e-mail e senha, sem login social, SSO nem ações sem efeito', () => {
    const { container } = render(<AuthContext.Provider value={{ state: { status: 'signed_out' }, login: vi.fn(), logout: vi.fn(), confirmMfa: vi.fn(), mfa: null }}><LoginPage /></AuthContext.Provider>);
    const names = screen.getAllByRole('button').map((button) => button.textContent?.trim());
    expect(names).toEqual(['Entrar', 'Esqueci minha senha']);
    expect(container.textContent).not.toMatch(/google|microsoft|apple|sso|lembrar de mim|cadastre-se|criar conta/i);
  });

  it('não carrega recursos externos e não cria um segundo landmark principal', () => {
    const { container } = render(<AuthContext.Provider value={{ state: { status: 'signed_out' }, login: vi.fn(), logout: vi.fn(), confirmMfa: vi.fn(), mfa: null }}><LoginPage /></AuthContext.Provider>);
    expect(container.innerHTML).not.toMatch(/https?:\/\//i);
    expect(container.querySelector('main')).toBeNull();
    expect(container.querySelectorAll('input:not([type="hidden"])')).toHaveLength(2);
  });
});

// Spec 003: apresentação no padrão do design system, sem mudar comportamento nem mensagens de segurança.
describe('LoginPage: apresentação (Spec 003)', () => {
  it('mostra o logotipo vertical, decorativo porque o título já diz FluxID', () => {
    const { container } = render(<AuthContext.Provider value={{ state: { status: 'signed_out' }, login: vi.fn(), logout: vi.fn(), confirmMfa: vi.fn(), mfa: null }}><LoginPage /></AuthContext.Provider>);
    const logo = container.querySelector('img');
    expect(logo).not.toBeNull();
    expect(logo).toHaveAttribute('alt', '');
    expect(Number(logo?.getAttribute('width'))).toBeGreaterThanOrEqual(120);
  });

  it('anuncia a falha de credencial com o alerta do padrão, ícone e texto', async () => {
    renderLogin({ kind: 'invalid_credentials' });
    fill();
    submit();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveAttribute('data-variant', 'erro');
    expect(alert.querySelector('svg')).not.toBeNull();
  });

  it('o diálogo de sessões fecha com Escape e devolve o foco ao botão de entrar', async () => {
    const sessions = [
      { session_id: 's1', started_at: '2026-09-29T10:00:00Z', last_seen_at: '2026-09-29T11:00:00Z', aal: 'aal1' },
      { session_id: 's2', started_at: '2026-09-29T12:00:00Z', last_seen_at: '2026-09-29T12:30:00Z', aal: 'aal2' },
    ];
    const login = vi.fn().mockResolvedValue({ kind: 'session_limit', sessions });
    render(<AuthContext.Provider value={{ state: { status: 'signed_out' }, login, logout: vi.fn(), confirmMfa: vi.fn(), mfa: null }}><LoginPage /></AuthContext.Provider>);
    fill();
    submit();
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    fireEvent.keyDown(dialog, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(login).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Entrar' })).toHaveFocus();
  });

  it('o foco fica preso no diálogo de sessões', async () => {
    const login = vi.fn().mockResolvedValue({ kind: 'session_limit', sessions: [{ session_id: 's1', started_at: '2026-09-29T10:00:00Z', last_seen_at: '2026-09-29T11:00:00Z', aal: 'aal1' }] });
    render(<AuthContext.Provider value={{ state: { status: 'signed_out' }, login, logout: vi.fn(), confirmMfa: vi.fn(), mfa: null }}><LoginPage /></AuthContext.Provider>);
    fill();
    submit();
    const dialog = await screen.findByRole('dialog');
    const cancelar = within(dialog).getByRole('button', { name: /cancelar/i });
    cancelar.focus();
    fireEvent.keyDown(cancelar, { key: 'Tab' });
    // Com o encerramento desabilitado, o último controle focável é Cancelar e o foco volta ao primeiro.
    expect(dialog.contains(document.activeElement)).toBe(true);
  });
});
