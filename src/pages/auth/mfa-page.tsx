import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/app/auth/auth-context';
import type { MfaBegin } from '@/application/identity/mfa-service';

const BUTTON_CLASS =
  'inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg px-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-slate-900';

export function MfaPage(): React.JSX.Element {
  const { mfa, confirmMfa, logout } = useAuth();
  const [setup, setSetup] = useState<MfaBegin | null>(null);
  const [code, setCode] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const codeRef = useRef<HTMLInputElement>(null);
  const pendingRef = useRef(false);

  const prepare = useCallback(async () => {
    if (!mfa) { setSetup({ kind: 'unavailable' }); return; }
    setSetup(null);
    setSetup(await mfa.begin());
  }, [mfa]);

  useEffect(() => {
    // A preparação consulta o Auth (sistema externo) e só então atualiza o estado.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void prepare();
  }, [prepare]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (pendingRef.current || !mfa || !setup || setup.kind === 'unavailable') return;
    if (!code.trim()) {
      setFieldError('Informe o código de 6 dígitos do aplicativo autenticador.');
      codeRef.current?.focus();
      return;
    }
    setFieldError(null);
    setFormError(null);
    pendingRef.current = true;
    setPending(true);
    try {
      const result = await mfa.verify(setup.factorId, code);
      if (result === 'verified') {
        // A liberação depende da confirmação do servidor de que a sessão alcançou AAL2.
        if (!(await confirmMfa())) setFormError('Não foi possível verificar agora. Tente novamente em instantes.');
        return;
      }
      setFormError(result === 'invalid_code'
        ? 'Código incorreto. Confira o aplicativo autenticador e tente novamente.'
        : 'Não foi possível verificar agora. Tente novamente em instantes.');
      setCode('');
      codeRef.current?.focus();
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  }

  return (
    <div className="flex items-center justify-center px-1 py-6 text-slate-900">
      <section className="w-full max-w-md rounded-xl border border-slate-300 bg-white p-6 shadow-sm" aria-labelledby="mfa-title">
        <h2 id="mfa-title" className="text-xl font-semibold">Verificação em duas etapas</h2>

        {setup === null && <p role="status" className="mt-4 text-sm">Preparando a verificação…</p>}

        {setup?.kind === 'unavailable' && (
          <div role="alert" className="mt-4 rounded-lg border border-rose-400 bg-rose-50 p-3 text-sm text-rose-950">
            <p>Não foi possível preparar a verificação agora.</p>
            <button type="button" onClick={() => void prepare()} className={`${BUTTON_CLASS} mt-3 border border-rose-700`}>
              Tentar novamente
            </button>
          </div>
        )}

        {setup && setup.kind !== 'unavailable' && (
          <form onSubmit={(event) => void handleSubmit(event)} noValidate className="mt-4 space-y-4">
            {setup.kind === 'enroll' ? (
              <div className="space-y-3 text-sm">
                <p>Leia o QR Code com um aplicativo autenticador e informe o código gerado.</p>
                <img src={setup.qrCode} alt="QR Code para configurar o aplicativo autenticador" width={192} height={192} className="mx-auto h-48 w-48 max-w-full" />
                <p>
                  <span className="block font-medium">Chave para digitar manualmente</span>
                  <code className="mt-1 block break-all rounded bg-slate-100 p-2 font-mono">{setup.secret}</code>
                </p>
              </div>
            ) : (
              <p className="text-sm">Informe o código de 6 dígitos do seu aplicativo autenticador.</p>
            )}

            <div>
              <label htmlFor="mfa-code" className="block text-sm font-medium">Código de 6 dígitos</label>
              <input
                ref={codeRef}
                id="mfa-code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                onChange={(event) => setCode(event.target.value)}
                aria-invalid={fieldError ? 'true' : undefined}
                aria-describedby={fieldError ? 'mfa-code-error' : undefined}
                className="mt-1 block min-h-11 w-full rounded-lg border border-slate-400 bg-white px-3 text-base tracking-widest focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 aria-[invalid=true]:border-rose-700"
              />
              {fieldError && <p id="mfa-code-error" className="mt-1 text-sm text-rose-800">{fieldError}</p>}
            </div>

            {formError && <p role="alert" className="rounded-lg border border-rose-400 bg-rose-50 p-3 text-sm text-rose-950">{formError}</p>}
            {pending && <p role="status" className="text-sm">Verificando…</p>}

            <div className="flex flex-wrap gap-3">
              <button type="submit" disabled={pending} className={`${BUTTON_CLASS} bg-slate-900 text-white disabled:cursor-not-allowed disabled:bg-slate-500`}>
                Verificar
              </button>
              <button type="button" onClick={() => void logout()} className={`${BUTTON_CLASS} border border-slate-400`}>
                Sair
              </button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}
