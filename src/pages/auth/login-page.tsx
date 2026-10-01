import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/app/auth/auth-context';
import type { ActiveSessionSummary, LoginOutcome } from '@/application/identity/session-service';
import { ActiveSessionsDialog } from './active-sessions-dialog';
import { RecoveryRequestPage } from './recovery-request-page';

const OUTCOME_MESSAGES: Partial<Record<LoginOutcome['kind'], string>> = {
  invalid_credentials: 'E-mail ou senha incorretos. Confira os dados e tente novamente.',
  account_unavailable: 'Acesso indisponível para esta conta. Fale com o administrador da sua organização.',
  rate_limited: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.',
  unavailable: 'Não foi possível entrar agora. Verifique a conexão e tente novamente.',
  invalid_request: 'Informe um e-mail e uma senha válidos.',
};

const INPUT_CLASS =
  'mt-1 block min-h-11 w-full rounded-lg border border-slate-400 bg-white px-3 text-base text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1766D9] aria-[invalid=true]:border-[#163B72]';

function noticeMessage(notice: 'session_expired' | 'session_revoked', reason?: 'timebox' | 'inactivity'): string {
  if (notice === 'session_revoked') return 'Sua sessão foi encerrada. Entre novamente para continuar.';
  if (reason === 'inactivity') return 'Sua sessão expirou por inatividade (mais de 30 minutos). Entre novamente para continuar.';
  if (reason === 'timebox') return 'Sua sessão expirou pelo tempo máximo de 8 horas. Entre novamente para continuar.';
  return 'Sua sessão expirou. Entre novamente para continuar.';
}

// Autenticação por e-mail e senha, conforme a Spec 002. Login social, SSO e cadastro público estão fora do escopo.
// O visual definitivo virá da spec de telas e design; esta tela segue o padrão das demais telas de identidade.
export function LoginPage(): React.JSX.Element {
  const [recovering, setRecovering] = useState(() => new URLSearchParams(window.location.search).get('recovery') === '1');
  const { state, login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [limit, setLimit] = useState<ActiveSessionSummary[] | null>(null);

  const pendingRef = useRef(false);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const submitRef = useRef<HTMLButtonElement>(null);
  const noticeRef = useRef<HTMLDivElement>(null);
  const hadLimit = useRef(false);

  const notice = state.status === 'signed_out' ? state.notice : undefined;
  const reason = state.status === 'signed_out' ? state.reason : undefined;
  const alertNotice = notice === 'session_expired' || notice === 'session_revoked' ? notice : undefined;

  useEffect(() => {
    if (alertNotice) noticeRef.current?.focus();
  }, [alertNotice]);

  useEffect(() => {
    if (!limit && hadLimit.current) submitRef.current?.focus();
    hadLimit.current = limit !== null;
  }, [limit]);

  if (recovering) return <RecoveryRequestPage onBack={() => setRecovering(false)} />;

  async function attempt(revokeSessionId?: string): Promise<void> {
    if (pendingRef.current) return;
    pendingRef.current = true;
    setPending(true);
    setFormError(null);
    try {
      const outcome = await login({ email: email.trim(), password, ...(revokeSessionId ? { revokeSessionId } : {}) });
      if (outcome.kind === 'session_limit') {
        setLimit(outcome.sessions);
        return;
      }
      setLimit(null);
      const message = OUTCOME_MESSAGES[outcome.kind];
      if (message) {
        setFormError(message);
        setPassword('');
        passwordRef.current?.focus();
      }
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const errors: { email?: string; password?: string } = {};
    if (!email.trim()) errors.email = 'Informe seu e-mail.';
    if (!password) errors.password = 'Informe sua senha.';
    setFieldErrors(errors);
    if (errors.email) {
      emailRef.current?.focus();
      return;
    }
    if (errors.password) {
      passwordRef.current?.focus();
      return;
    }
    void attempt();
  }

  return (
    <section className="mx-auto w-full max-w-md rounded-xl border border-slate-300 bg-white p-6" aria-labelledby="login-title">
      <h2 id="login-title" className="text-xl font-semibold">Entrar no FluxID</h2>

      {alertNotice && (
        <div
          ref={noticeRef}
          role="alert"
          tabIndex={-1}
          className="mt-4 rounded-lg border border-[#1766D9] bg-slate-50 p-3 text-sm text-[#163B72] outline-none focus-visible:ring-2 focus-visible:ring-[#1766D9]"
        >
          {noticeMessage(alertNotice, reason)}
        </div>
      )}

      {notice === 'signed_out' && (
        <p role="status" className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-950">
          Você saiu com segurança.
        </p>
      )}

      <form onSubmit={handleSubmit} noValidate className="mt-4 space-y-4">
        <div>
          <label htmlFor="login-email" className="block text-sm font-medium">E-mail</label>
          <input
            ref={emailRef}
            id="login-email"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            aria-invalid={fieldErrors.email ? 'true' : undefined}
            aria-describedby={fieldErrors.email ? 'login-email-error' : undefined}
            className={INPUT_CLASS}
          />
          {fieldErrors.email && <p id="login-email-error" className="mt-1 text-sm font-medium text-[#163B72]">{fieldErrors.email}</p>}
        </div>

        <div>
          <label htmlFor="login-password" className="block text-sm font-medium">Senha</label>
          <input
            ref={passwordRef}
            id="login-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            aria-invalid={fieldErrors.password ? 'true' : undefined}
            aria-describedby={fieldErrors.password ? 'login-password-error' : undefined}
            className={INPUT_CLASS}
          />
          {fieldErrors.password && <p id="login-password-error" className="mt-1 text-sm font-medium text-[#163B72]">{fieldErrors.password}</p>}
        </div>

        {formError && (
          <p role="alert" className="rounded-lg border border-[#163B72] bg-slate-50 p-3 text-sm font-medium text-[#163B72]">
            {formError}
          </p>
        )}

        {pending && !limit && <p role="status" className="text-sm">Entrando…</p>}

        <button
          ref={submitRef}
          type="submit"
          disabled={pending}
          className="min-h-11 w-full rounded-lg bg-[#1766D9] px-4 font-semibold text-white hover:bg-[#1249B8] disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1766D9] focus-visible:ring-offset-2"
        >
          {pending ? 'Entrando…' : 'Entrar'}
        </button>

        <button
          type="button"
          onClick={() => setRecovering(true)}
          className="min-h-11 w-full rounded-lg border border-slate-500 px-4 text-sm font-semibold text-[#163B72] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1766D9]"
        >
          Esqueci minha senha
        </button>
      </form>

      {limit && (
        <ActiveSessionsDialog
          sessions={limit}
          pending={pending}
          onConfirm={(sessionId) => void attempt(sessionId)}
          onCancel={() => {
            setLimit(null);
            setPassword('');
          }}
        />
      )}
    </section>
  );
}
