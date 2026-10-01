import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/app/auth/auth-context';
import type { MfaBegin } from '@/application/identity/mfa-service';
import { Alert, Button, Card, Loading, TextField } from '@/design-system';

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
    <Card as="section" aria-labelledby="mfa-title" className="mx-auto flex w-full max-w-compacto flex-col gap-4">
      <h2 id="mfa-title" className="text-h3 font-semibold text-navy">Verificação em duas etapas</h2>

      {setup === null && <Loading label="Preparando a verificação…" />}

      {setup?.kind === 'unavailable' && (
        <Alert variant="erro">
          <p>Não foi possível preparar a verificação agora.</p>
          <Button variant="secundario" onClick={() => void prepare()} className="mt-2">
            Tentar novamente
          </Button>
        </Alert>
      )}

      {setup && setup.kind !== 'unavailable' && (
        <form onSubmit={(event) => void handleSubmit(event)} noValidate className="flex flex-col gap-4">
          {setup.kind === 'enroll' ? (
            <div className="flex flex-col gap-4 text-corpo">
              <p>Leia o QR Code com um aplicativo autenticador e informe o código gerado.</p>
              <img src={setup.qrCode} alt="QR Code para configurar o aplicativo autenticador" width={192} height={192} className="mx-auto max-w-full" />
              <p>
                <span className="block font-medium">Chave para digitar manualmente</span>
                <code className="mt-1 block break-all rounded-controle bg-cinza-gelo p-2">{setup.secret}</code>
              </p>
            </div>
          ) : (
            <p className="text-corpo">Informe o código de 6 dígitos do seu aplicativo autenticador.</p>
          )}

          <TextField
            ref={codeRef}
            label="Código de 6 dígitos"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            error={fieldError ?? undefined}
            className="tracking-widest"
          />

          {formError && <Alert variant="erro">{formError}</Alert>}
          {pending && <Loading variant="botao" label="Verificando…" />}

          <div className="flex flex-wrap gap-4">
            <Button type="submit" disabled={pending}>
              Verificar
            </Button>
            <Button variant="secundario" onClick={() => void logout()}>
              Sair
            </Button>
          </div>
        </form>
      )}
    </Card>
  );
}
