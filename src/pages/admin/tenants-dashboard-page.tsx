import React, { useEffect, useMemo, useRef, useState } from 'react';
import { OrganizationService, type OrganizationOutcome } from '@/application/identity/organization-service';
import { useConnectivity } from '@/app/connectivity-context';
import { createOrganizationTransport } from '@/infrastructure/supabase/organization-adapter';
import { Alert, Button, Card, DataTable, Field, FormSection, StatusBadge, TextField, type ColunaDaTabela } from '@/design-system';
import { textareaClass } from '@/components/identity/confirmation-dialog';

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

const STATUS_LABELS = { active: 'Ativa', suspended: 'Suspensa', inactive: 'Inativa' } as const;
const STATUS_VARIANTS = { active: 'ativo', suspended: 'pendente', inactive: 'bloqueado' } as const;

const COLUNAS: readonly ColunaDaTabela<OrganizationSummary>[] = [
  { id: 'nome', cabecalho: 'Organização', cabecalhoDaLinha: true, celula: (item) => item.display_name },
  { id: 'razao', cabecalho: 'Razão social', celula: (item) => item.legal_name },
  { id: 'situacao', cabecalho: 'Situação', celula: (item) => <StatusBadge variant={STATUS_VARIANTS[item.status] ?? 'bloqueado'}>{STATUS_LABELS[item.status] ?? 'Inativa'}</StatusBadge> },
];

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
    <section aria-labelledby="organizations-title" className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 tablet:flex-row tablet:items-center tablet:justify-between">
        <div>
          <p className="text-legenda font-semibold uppercase text-azul-profundo">Administração global</p>
          <h2 id="organizations-title" className="mt-1 text-h2 font-bold text-navy">Organizações</h2>
          <p className="mt-1 text-corpo">Cadastre e acompanhe os tenants autorizados no FluxID.</p>
        </div>
        <Button className="tablet:shrink-0 tablet:whitespace-nowrap" onClick={() => setShowForm((visible) => !visible)}>{showForm ? 'Cancelar' : 'Nova organização'}</Button>
      </div>

      {feedback && <Alert ref={feedbackRef} tabIndex={-1} variant={feedback.kind === 'error' ? 'erro' : 'sucesso'}>{feedback.message}</Alert>}

      {showForm && (
        <Card>
          <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-4">
            <FormSection legend="Nova organização">
              <div className="grid gap-4 tablet:grid-cols-2">
                <TextField label="Razão social" name="legalName" required maxLength={160} />
                <TextField label="Nome de exibição" name="displayName" required maxLength={100} />
                <Field label="Justificativa" className="tablet:col-span-2">
                  {(controle) => <textarea {...controle} name="justification" required minLength={10} maxLength={500} rows={3} className={textareaClass} />}
                </Field>
              </div>
            </FormSection>
            <Button type="submit" disabled={submitting} className="self-start">{submitting ? 'Criando…' : 'Criar organização'}</Button>
          </form>
        </Card>
      )}

      <DataTable
        legenda="Organizações cadastradas"
        colunas={COLUNAS}
        linhas={organizations}
        chaveDaLinha={(item) => item.id}
        carregando={loading}
        textoDeCarregamento="Carregando organizações…"
        vazio={{ title: 'Nenhuma organização cadastrada.', description: 'Use o botão Nova organização para cadastrar a primeira. Ela aparece aqui com a situação atual.' }}
      />
    </section>
  );
}
