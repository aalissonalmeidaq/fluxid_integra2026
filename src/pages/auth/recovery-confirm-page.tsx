import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useConnectivity } from '@/app/connectivity-context';
import { PasswordRecoveryService } from '@/application/identity/password-recovery-service';

export function RecoveryConfirmPage(): React.JSX.Element {
  const { client } = useConnectivity();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const alertRef = useRef<HTMLParagraphElement>(null);
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

  return <section className="mx-auto w-full max-w-md rounded-xl border border-slate-300 bg-white p-6" aria-labelledby="confirm-title">
    <h2 id="confirm-title" className="text-xl font-semibold">Definir nova senha</h2>
    <form className="mt-4 space-y-4" onSubmit={(event) => void submit(event)}>
      <div><label htmlFor="new-password" className="block text-sm font-medium">Nova senha</label><input id="new-password" type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-slate-400 px-3" /></div>
      <div><label htmlFor="confirm-password" className="block text-sm font-medium">Confirmar nova senha</label><input id="confirm-password" type="password" autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-slate-400 px-3" /></div>
      {message && <p role="status" className="rounded-lg bg-emerald-50 p-3">{message}</p>}
      {error && <p ref={alertRef} tabIndex={-1} role="alert" className="rounded-lg bg-rose-50 p-3 outline-none">{error}</p>}
      <button type="submit" className="min-h-11 w-full rounded-lg bg-slate-900 px-4 text-white">Definir nova senha</button>
      {error && <button type="button" onClick={() => { window.location.href = '/?recovery=1'; }} className="min-h-11 w-full rounded-lg border border-slate-500 px-4">Solicitar novo link</button>}
    </form>
  </section>;
}
