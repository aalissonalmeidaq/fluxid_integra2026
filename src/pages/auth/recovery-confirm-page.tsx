import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useConnectivity } from '@/app/connectivity-context';
import { PasswordRecoveryService } from '@/application/identity/password-recovery-service';
import { Alert, Button, TextField } from '@/design-system';
import { AuthLayout } from './auth-layout';

export function RecoveryConfirmPage(): React.JSX.Element {
  const { client } = useConnectivity();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const alertRef = useRef<HTMLDivElement>(null);
  const service = useMemo(() => new PasswordRecoveryService({
    request: async () => ({ status: 503 }),
    async updatePassword(value) {
      if (!client) return { ok: false };
      const { error: updateError } = await client.auth.updateUser({ password: value });
      return { ok: !updateError };
    },
  }), [client]);

  useEffect(() => { if (error) alertRef.current?.focus(); }, [error]);

  async function submit(event: React.FormEvent) {
    event.preventDefault(); setError(null); setMessage(null);
    const outcome = await service.complete(password, confirmation);
    if (outcome === 'completed') { setMessage('Senha atualizada. Você já pode entrar com a nova senha.'); return; }
    setError(outcome === 'invalid_password' ? 'Use ao menos 12 caracteres e confirme a mesma senha.' : 'Link inválido ou expirado. Solicite um novo link.');
  }

  return (
    <AuthLayout>
    <section aria-labelledby="confirm-title" className="mx-auto flex w-full max-w-compacto flex-col gap-4">
      <h2 id="confirm-title" className="text-h3 font-semibold text-navy">Definir nova senha</h2>
      <form className="flex flex-col gap-4" onSubmit={(event) => void submit(event)}>
        <TextField label="Nova senha" type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} />
        <TextField label="Confirmar nova senha" type="password" autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} />
        {message && <Alert variant="sucesso">{message}</Alert>}
        {error && <Alert ref={alertRef} tabIndex={-1} variant="erro">{error}</Alert>}
        <Button type="submit" className="w-full">Definir nova senha</Button>
        {error && <Button variant="secundario" onClick={() => { window.location.href = '/?recovery=1'; }} className="w-full">Solicitar novo link</Button>}
      </form>
    </section>
    </AuthLayout>
  );
}
