import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useConnectivity } from '@/app/connectivity-context';
import { PasswordRecoveryService } from '@/application/identity/password-recovery-service';
import { Alert, Button, Card, TextField } from '@/design-system';

export function RecoveryRequestPage({ onBack }: { onBack: () => void }): React.JSX.Element {
  const { config, result } = useConnectivity();
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const noticeRef = useRef<HTMLDivElement>(null);
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

  return (
    <Card as="section" aria-labelledby="recovery-title" className="mx-auto flex w-full max-w-compacto flex-col gap-4">
      <h2 id="recovery-title" className="text-h3 font-semibold text-navy">Recuperar acesso</h2>
      <p className="text-corpo">Informe seu e-mail. A resposta não confirma se a conta existe.</p>
      <form className="flex flex-col gap-4" onSubmit={(event) => void submit(event)} noValidate>
        <TextField label="E-mail" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} />
        {message && <Alert ref={noticeRef} tabIndex={-1} variant="sucesso">{message}</Alert>}
        {error && <Alert variant="erro">{error}</Alert>}
        <Button type="submit" disabled={pending} className="w-full">{pending ? 'Enviando…' : 'Enviar instruções'}</Button>
        <Button variant="secundario" onClick={onBack} className="w-full">Voltar para entrar</Button>
      </form>
    </Card>
  );
}
