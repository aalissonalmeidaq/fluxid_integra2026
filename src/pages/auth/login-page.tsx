import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/app/auth/auth-context';
import type { ActiveSessionSummary, LoginOutcome } from '@/application/identity/session-service';
import { Alert, Button, Card, Loading, Logo, TextField } from '@/design-system';
import { ActiveSessionsDialog } from './active-sessions-dialog';
import { RecoveryRequestPage } from './recovery-request-page';

const OUTCOME_MESSAGES: Partial<Record<LoginOutcome['kind'], string>> = {
  invalid_credentials: 'E-mail ou senha incorretos. Confira os dados e tente novamente.',
  account_unavailable: 'Acesso indisponível para esta conta. Fale com o administrador da sua organização.',
  rate_limited: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.',
  unavailable: 'Não foi possível entrar agora. Verifique a conexão e tente novamente.',
  invalid_request: 'Informe um e-mail e uma senha válidos.',
};

function noticeMessage(notice: 'session_expired' | 'session_revoked', reason?: 'timebox' | 'inactivity'): string {
  if (notice === 'session_revoked') return 'Sua sessão foi encerrada. Entre novamente para continuar.';
  if (reason === 'inactivity') return 'Sua sessão expirou por inatividade (mais de 30 minutos). Entre novamente para continuar.';
  if (reason === 'timebox') return 'Sua sessão expirou pelo tempo máximo de 8 horas. Entre novamente para continuar.';
  return 'Sua sessão expirou. Entre novamente para continuar.';
}

// Autenticação por e-mail e senha, conforme a Spec 002. Login social, SSO e cadastro público estão fora do escopo.
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
    <Card as="section" aria-labelledby="login-title" className="mx-auto flex w-full max-w-compacto flex-col gap-4">
      <div className="flex justify-center">
        <Logo variant="vertical" width={120} decorative />
      </div>
      <h2 id="login-title" className="text-h3 font-semibold text-navy">Entrar no FluxID</h2>

      {alertNotice && (
        <Alert ref={noticeRef} tabIndex={-1} variant="erro">
          {noticeMessage(alertNotice, reason)}
        </Alert>
      )}

      {notice === 'signed_out' && <Alert variant="sucesso">Você saiu com segurança.</Alert>}

      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        <TextField
          ref={emailRef}
          label="E-mail"
          type="email"
          autoComplete="username"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          error={fieldErrors.email}
        />
        <TextField
          ref={passwordRef}
          label="Senha"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          error={fieldErrors.password}
        />

        {formError && <Alert variant="erro">{formError}</Alert>}

        {pending && !limit && <Loading variant="botao" label="Entrando…" />}

        <Button ref={submitRef} type="submit" disabled={pending} className="w-full">
          {pending ? 'Entrando…' : 'Entrar'}
        </Button>

        <Button variant="secundario" onClick={() => setRecovering(true)} className="w-full">
          Esqueci minha senha
        </Button>
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
    </Card>
  );
}
