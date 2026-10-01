import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AuthContext, type AuthContextValue } from '@/app/auth/auth-context';
import type { MfaBegin, MfaService, MfaVerification } from '@/application/identity/mfa-service';
import { MfaPage } from './mfa-page';

function renderMfa(begin: MfaBegin, verification: MfaVerification = 'verified', confirmed = true) {
  const mfa = { begin: vi.fn(async () => begin), verify: vi.fn(async () => verification) } as unknown as MfaService;
  const confirmMfa = vi.fn(async () => confirmed);
  const logout = vi.fn(async () => undefined);
  const value: AuthContextValue = { state: { status: 'mfa_required' }, login: vi.fn(), logout, confirmMfa, mfa };
  render(<AuthContext.Provider value={value}><MfaPage /></AuthContext.Provider>);
  return { mfa, confirmMfa, logout };
}

const ENROLL: MfaBegin = { kind: 'enroll', factorId: 'f1', qrCode: 'data:image/svg+xml;utf8,<svg/>', secret: 'JBSWY3DPEHPK3PXP' };
const CHALLENGE: MfaBegin = { kind: 'challenge', factorId: 'f9' };

const enterCode = (code: string) => {
  fireEvent.change(screen.getByLabelText(/código de 6 dígitos/i), { target: { value: code } });
  fireEvent.click(screen.getByRole('button', { name: 'Verificar' }));
};

describe('MfaPage', () => {
  it('informa o carregamento enquanto prepara a verificação', async () => {
    renderMfa(CHALLENGE);
    expect(screen.getByRole('status')).toHaveTextContent(/preparando/i);
    await screen.findByLabelText(/código de 6 dígitos/i);
  });

  it('na matrícula mostra QR com texto alternativo e a chave para digitação manual', async () => {
    renderMfa(ENROLL);
    const qr = await screen.findByRole('img', { name: /qr code/i });
    expect(qr).toHaveAttribute('src', ENROLL.kind === 'enroll' ? ENROLL.qrCode : '');
    expect(screen.getByText('JBSWY3DPEHPK3PXP')).toBeInTheDocument();
    expect(screen.getByText(/chave para digitar manualmente/i)).toBeInTheDocument();
  });

  it('com fator já verificado apenas pede o código, sem QR', async () => {
    renderMfa(CHALLENGE);
    await screen.findByLabelText(/código de 6 dígitos/i);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('o campo de código usa entrada numérica e autocompletar de código único', async () => {
    renderMfa(CHALLENGE);
    const input = await screen.findByLabelText(/código de 6 dígitos/i);
    expect(input).toHaveAttribute('autocomplete', 'one-time-code');
    expect(input).toHaveAttribute('inputmode', 'numeric');
    expect(input.className).toMatch(/min-h-11/);
  });

  it('libera o acesso somente depois da confirmação da fronteira confiável', async () => {
    const { mfa, confirmMfa } = renderMfa(CHALLENGE);
    await screen.findByLabelText(/código de 6 dígitos/i);
    enterCode('123 456');
    await waitFor(() => expect(confirmMfa).toHaveBeenCalledTimes(1));
    expect(mfa.verify).toHaveBeenCalledWith('f9', '123 456');
  });

  it('não libera o acesso quando o servidor não confirma AAL2', async () => {
    renderMfa(CHALLENGE, 'verified', false);
    await screen.findByLabelText(/código de 6 dígitos/i);
    enterCode('123456');
    expect(await screen.findByRole('alert')).toHaveTextContent(/não foi possível verificar agora/i);
  });

  it('mostra mensagem genérica para código incorreto, limpa o campo e devolve o foco', async () => {
    const { confirmMfa } = renderMfa(CHALLENGE, 'invalid_code');
    await screen.findByLabelText(/código de 6 dígitos/i);
    enterCode('000000');
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/código incorreto/i);
    expect(confirmMfa).not.toHaveBeenCalled();
    const input = screen.getByLabelText(/código de 6 dígitos/i);
    expect(input).toHaveValue('');
    expect(input).toHaveFocus();
  });

  it('valida campo vazio sem chamar o serviço', async () => {
    const { mfa } = renderMfa(CHALLENGE);
    await screen.findByLabelText(/código de 6 dígitos/i);
    fireEvent.click(screen.getByRole('button', { name: 'Verificar' }));
    expect(mfa.verify).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/código de 6 dígitos/i)).toHaveAttribute('aria-invalid', 'true');
  });

  it('informa indisponibilidade ao preparar e permite tentar de novo', async () => {
    const { mfa } = renderMfa({ kind: 'unavailable' });
    expect(await screen.findByRole('alert')).toHaveTextContent(/não foi possível preparar/i);
    fireEvent.click(screen.getByRole('button', { name: /tentar novamente/i }));
    await waitFor(() => expect(mfa.begin).toHaveBeenCalledTimes(2));
  });

  it('oferece sair sem concluir a verificação', async () => {
    const { logout } = renderMfa(CHALLENGE);
    await screen.findByLabelText(/código de 6 dígitos/i);
    fireEvent.click(screen.getByRole('button', { name: /sair/i }));
    expect(logout).toHaveBeenCalledTimes(1);
  });
});
