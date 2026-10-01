import React, { useEffect, useMemo, useRef, useState } from 'react';
import { OrganizationService, type OrganizationOutcome } from '@/application/identity/organization-service';
import { useConnectivity } from '@/app/connectivity-context';
import { createOrganizationTransport } from '@/infrastructure/supabase/organization-adapter';

interface OrganizationSummary {
  id: string;
  legal_name: string;
  display_name: string;
  status: 'active' | 'suspended' | 'inactive';
  version: number;
}

function isOrganization(value: unknown): value is OrganizationSummary {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return typeof item.id === 'string' && typeof item.legal_name === 'string' &&
    typeof item.display_name === 'string' && typeof item.status === 'string' &&
    typeof item.version === 'number';
}

const errorMessages: Record<Exclude<OrganizationOutcome['kind'], 'success'>, string> = {
  access_denied: 'Acesso negado. Esta ação exige administração global.',
  mfa_required: 'Confirme o segundo fator para administrar organizações.',
  conflict: 'A organização foi alterada por outra pessoa. Atualize os dados e tente novamente.',
  admin_required: 'A organização precisa de um administrador ativo antes de ser ativada.',
  invalid: 'Revise os dados informados.',
  unavailable: 'Não foi possível acessar as organizações agora.',
};

export function TenantsDashboardPage(): React.JSX.Element {
  const { client, config, result } = useConnectivity();
  const [organizations, setOrganizations] = useState<OrganizationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'error'; message: string } | null>(null);
  const feedbackRef = useRef<HTMLDivElement>(null);
  const endpoint = config?.endpoints.find((candidate) => candidate.kind === result.selectedEndpoint);
  const service = useMemo(
    () => endpoint && client ? new OrganizationService(createOrganizationTransport(endpoint, client)) : null,
    [client, endpoint],
  );

  useEffect(() => {
    let active = true;
    const load = async (): Promise<void> => {
      if (!service) {
        if (active) { setLoading(false); setFeedback({ kind: 'error', message: 'Conexão indisponível.' }); }
        return;
      }
      const outcome = await service.list();
      if (!active) return;
      if (outcome.kind === 'success') setOrganizations(outcome.value.filter(isOrganization));
      else setFeedback({ kind: 'error', message: errorMessages[outcome.kind] });
      setLoading(false);
    };
    void load();
    return () => { active = false; };
  }, [service]);

  useEffect(() => { feedbackRef.current?.focus(); }, [feedback]);

  const submit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (!service) return setFeedback({ kind: 'error', message: 'Conexão indisponível.' });
    const form = event.currentTarget;
    const data = new FormData(form);
    setSubmitting(true);
    setFeedback(null);
    const outcome = await service.create({
      legalName: String(data.get('legalName') ?? '').trim(),
      displayName: String(data.get('displayName') ?? '').trim(),
      justification: String(data.get('justification') ?? '').trim(),
    });
    setSubmitting(false);
    if (outcome.kind !== 'success') return setFeedback({ kind: 'error', message: errorMessages[outcome.kind] });
    const created = outcome.value;
    if (isOrganization(created)) setOrganizations((current) => [...current, created]);
    form.reset();
    setShowForm(false);
    setFeedback({ kind: 'success', message: 'Organização criada com sucesso.' });
  };

  return (
    <section aria-labelledby="organizations-title" className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-[#1766D9]">Administração global</p>
          <h2 id="organizations-title" className="mt-1 text-2xl font-bold text-[#163B72]">Organizações</h2>
          <p className="mt-1 text-sm">Cadastre e acompanhe os tenants autorizados no FluxID.</p>
        </div>
        <button type="button" onClick={() => setShowForm((visible) => !visible)}
          className="min-h-11 rounded-lg bg-[#1766D9] px-4 py-2 text-sm font-semibold text-white hover:bg-[#163B72] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1766D9] focus-visible:ring-offset-2">
          {showForm ? 'Cancelar' : 'Nova organização'}
        </button>
      </div>

      {feedback && <div ref={feedbackRef} tabIndex={-1} role={feedback.kind === 'error' ? 'alert' : 'status'}
        className={`rounded-lg border p-3 text-sm outline-none focus-visible:ring-2 ${feedback.kind === 'error' ? 'border-rose-300 bg-rose-50 text-rose-950 focus-visible:ring-rose-800' : 'border-green-300 bg-green-50 text-green-950 focus-visible:ring-green-800'}`}>
        {feedback.message}
      </div>}

      {showForm && <form onSubmit={(event) => void submit(event)} className="rounded-xl border border-[#D7E2EE] bg-white p-4 shadow-sm sm:p-6">
        <h3 className="text-lg font-semibold text-[#163B72]">Nova organização</h3>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-medium">Razão social
            <input name="legalName" required maxLength={160} className="mt-1 min-h-11 w-full rounded-lg border border-[#8CA2B8] px-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1766D9]" />
          </label>
          <label className="text-sm font-medium">Nome de exibição
            <input name="displayName" required maxLength={100} className="mt-1 min-h-11 w-full rounded-lg border border-[#8CA2B8] px-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1766D9]" />
          </label>
          <label className="text-sm font-medium sm:col-span-2">Justificativa
            <textarea name="justification" required minLength={10} maxLength={500} rows={3} className="mt-1 w-full rounded-lg border border-[#8CA2B8] px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1766D9]" />
          </label>
        </div>
        <button disabled={submitting} className="mt-4 min-h-11 rounded-lg bg-[#159B19] px-4 py-2 text-sm font-semibold text-white hover:bg-[#117A14] disabled:cursor-wait disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1766D9] focus-visible:ring-offset-2">
          {submitting ? 'Criando…' : 'Criar organização'}
        </button>
      </form>}

      {loading ? <p role="status" aria-live="polite">Carregando organizações…</p> : organizations.length === 0 ?
        <p className="rounded-xl border border-dashed border-[#8CA2B8] bg-white p-6 text-sm">Nenhuma organização cadastrada.</p> :
        <ul className="grid gap-3 md:grid-cols-2" aria-label="Organizações cadastradas">
          {organizations.map((organization) => <li key={organization.id} className="min-w-0 rounded-xl border border-[#D7E2EE] bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0"><h3 className="break-words font-semibold text-[#163B72]">{organization.display_name}</h3><p className="break-words text-sm">{organization.legal_name}</p></div>
              <span className="rounded-full bg-green-100 px-2 py-1 text-xs font-semibold text-green-900">{organization.status === 'active' ? 'Ativa' : organization.status === 'suspended' ? 'Suspensa' : 'Inativa'}</span>
            </div>
          </li>)}
        </ul>}
    </section>
  );
}
