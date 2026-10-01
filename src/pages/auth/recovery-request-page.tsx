import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useConnectivity } from '@/app/connectivity-context';
import { PasswordRecoveryService } from '@/application/identity/password-recovery-service';

export function RecoveryRequestPage({ onBack }: { onBack: () => void }): React.JSX.Element {
  const { config, result } = useConnectivity();
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const noticeRef = useRef<HTMLParagraphElement>(null);
  const endpoint = config?.endpoints.find((item) => item.kind === result.selectedEndpoint);
  const service = useMemo(() => endpoint ? new PasswordRecoveryService({
    async request(value) {
      const response = await fetch(`${endpoint.url}/functions/v1/password-recovery`, {
        method: 'POST', headers: { 'content-type': 'application/json', apikey: endpoint.publishableKey }, body: JSON.stringify({ email: value }),
      });
      const body = await response.json().catch(() => ({})) as { code?: string };
      return { status: response.status, code: body.code };
    },
    updatePassword: async () => ({ ok: false }),
  }) : null, [endpoint]);

  useEffect(() => { if (message) noticeRef.current?.focus(); }, [message]);

  async function submit(event: React.FormEvent) {
    event.preventDefault(); setError(null); setMessage(null);
    if (!service) { setError('Não foi possível solicitar agora. Verifique a conexão e tente novamente.'); return; }
    setPending(true);
    const outcome = await service.request(email);
    setPending(false);
    if (outcome === 'invalid') { setError('Informe um e-mail válido.'); return; }
    if (outcome === 'unavailable') { setError('Não foi possível solicitar agora. Verifique a conexão e tente novamente.'); return; }
    setMessage('Se existir uma conta para este e-mail, enviaremos as instruções de recuperação.');
  }

  return <section className="mx-auto w-full max-w-md rounded-xl border border-slate-300 bg-white p-6" aria-labelledby="recovery-title">
    <h2 id="recovery-title" className="text-xl font-semibold">Recuperar acesso</h2>
    <p className="mt-2 text-sm">Informe seu e-mail. A resposta não confirma se a conta existe.</p>
    <form className="mt-4 space-y-4" onSubmit={(event) => void submit(event)} noValidate>
      <div><label htmlFor="recovery-email" className="block text-sm font-medium">E-mail</label>
        <input id="recovery-email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-slate-400 px-3" /></div>
      {message && <p ref={noticeRef} tabIndex={-1} role="status" className="rounded-lg bg-emerald-50 p-3 outline-none">{message}</p>}
      {error && <p role="alert" className="rounded-lg bg-rose-50 p-3">{error}</p>}
      <button type="submit" disabled={pending} className="min-h-11 w-full rounded-lg bg-slate-900 px-4 text-white">{pending ? 'Enviando…' : 'Enviar instruções'}</button>
      <button type="button" onClick={onBack} className="min-h-11 w-full rounded-lg border border-slate-500 px-4">Voltar para entrar</button>
    </form>
  </section>;
}
