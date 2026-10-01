import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  MembershipService,
  type MemberSummary,
  type MembershipOutcome,
  type RoleOption,
} from '@/application/identity/membership-service';
import { useConnectivity } from '@/app/connectivity-context';
import { useTenant } from '@/app/tenant/tenant-context';
import { createMembershipTransport } from '@/infrastructure/supabase/membership-adapter';
import { ConfirmationDialog, MAX_JUSTIFICATION, MIN_JUSTIFICATION, textareaClass } from '@/components/identity/confirmation-dialog';
import { Alert, Button, Card, DataTable, Field, FormSection, Select, StatusBadge, TextField, type ColunaDaTabela, type StatusBadgeVariant } from '@/design-system';

type TargetStatus = 'active' | 'blocked' | 'inactive';
type Feedback = { kind: 'success' | 'error'; message: string };
interface StatusChange { member: MemberSummary; next: TargetStatus; trigger: HTMLElement }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const STATUS_LABELS: Record<string, string> = { active: 'Ativo', blocked: 'Bloqueado', inactive: 'Inativo', invited: 'Convidado' };
const STATUS_VARIANTS: Record<string, StatusBadgeVariant> = { active: 'ativo', blocked: 'bloqueado', inactive: 'bloqueado', invited: 'pendente' };

const ACTION_COPY: Record<TargetStatus, { verb: string; confirm: string }> = {
  blocked: { verb: 'Bloquear', confirm: 'Confirmar bloqueio' },
  inactive: { verb: 'Inativar', confirm: 'Confirmar inativação' },
  active: { verb: 'Reativar', confirm: 'Confirmar reativação' },
};

const ERROR_MESSAGES: Record<Exclude<MembershipOutcome['kind'], 'success'>, string> = {
  access_denied: 'Acesso negado. Você não tem autorização para administrar as pessoas deste tenant.',
  mfa_required: 'Confirme o segundo fator para continuar.',
  last_admin: 'Ação recusada: este é o último administrador ativo do tenant. Atribua o papel a outra pessoa antes.',
  conflict: 'Já existe um convite ativo para este e-mail ou o vínculo foi alterado por outra pessoa. Atualize a lista.',
  delivery_pending: 'Aguarde alguns minutos antes de reenviar o convite.',
  expired: 'O convite expirou. Envie um novo convite.',
  invalid: 'Revise os dados informados.',
  unavailable: 'Não foi possível concluir a ação agora. Tente novamente.',
};

const actionsFor = (status: string): TargetStatus[] =>
  status === 'active' ? ['blocked', 'inactive'] : status === 'blocked' ? ['active', 'inactive'] : status === 'inactive' ? ['active'] : [];

export interface TenantMembersViewProps {
  organizationId: string;
  service: MembershipService | null;
}

export function TenantMembersView({ organizationId, service }: TenantMembersViewProps): React.JSX.Element {
  const [members, setMembers] = useState<MemberSummary[]>([]);
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteErrors, setInviteErrors] = useState<Record<string, string>>({});
  const [sending, setSending] = useState(false);
  const [change, setChange] = useState<StatusChange | null>(null);
  const [saving, setSaving] = useState(false);
  const feedbackRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    const load = async (): Promise<void> => {
      if (!service || !UUID.test(organizationId)) {
        if (active) {
          setLoading(false);
          setFeedback({ kind: 'error', message: service ? 'Organização não informada.' : 'Conexão indisponível.' });
        }
        return;
      }
      const outcome = await service.list({ organizationId });
      if (!active) return;
      if (outcome.kind === 'success') {
        setMembers(outcome.value.members);
        setRoles(outcome.value.roles);
      } else {
        setFeedback({ kind: 'error', message: outcome.kind === 'unavailable' ? 'Não foi possível carregar as pessoas agora.' : ERROR_MESSAGES[outcome.kind] });
      }
      setLoading(false);
    };
    void load();
    return () => { active = false; };
  }, [service, organizationId]);

  useEffect(() => { if (feedback) feedbackRef.current?.focus(); }, [feedback]);

  const submitInvite = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (!service || sending) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const email = String(data.get('email') ?? '').trim();
    const roleId = String(data.get('roleId') ?? '');
    const justification = String(data.get('justification') ?? '').trim();
    const errors: Record<string, string> = {};
    if (!EMAIL.test(email)) errors.email = 'Informe um e-mail válido, como nome@empresa.com.';
    if (!roleId) errors.roleId = 'Escolha o papel inicial da pessoa.';
    if (justification.length < MIN_JUSTIFICATION) errors.justification = `Descreva o motivo com pelo menos ${MIN_JUSTIFICATION} caracteres.`;
    setInviteErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSending(true);
    setFeedback(null);
    const outcome = await service.invite({ organizationId, email, roleId, justification });
    setSending(false);
    if (outcome.kind !== 'success') return setFeedback({ kind: 'error', message: ERROR_MESSAGES[outcome.kind] });
    form.reset();
    setShowInvite(false);
    setFeedback({ kind: 'success', message: `Convite enviado para ${email.toLowerCase()}.` });
  };

  const confirmChange = async (justification: string): Promise<void> => {
    if (!service || !change || saving) return;
    const target = change;
    setSaving(true);
    const outcome = await service.changeStatus({ organizationId, membershipId: target.member.id, status: target.next, expectedVersion: target.member.version, justification });
    setSaving(false);
    setChange(null);
    if (outcome.kind !== 'success') return setFeedback({ kind: 'error', message: ERROR_MESSAGES[outcome.kind] });
    const updated = outcome.value as { status?: unknown; version?: unknown } | null;
    const status = typeof updated?.status === 'string' ? updated.status : target.next;
    const version = typeof updated?.version === 'number' ? updated.version : target.member.version + 1;
    setMembers((current) => current.map((item) => item.id === target.member.id ? { ...item, status, version } : item));
    setFeedback({ kind: 'success', message: `${target.member.display_name || target.member.email}: vínculo atualizado para ${STATUS_LABELS[status] ?? status}.` });
  };

  const columns: readonly ColunaDaTabela<MemberSummary>[] = [
    { id: 'pessoa', cabecalho: 'Pessoa', cabecalhoDaLinha: true, celula: (member) => member.display_name || member.email },
    { id: 'email', cabecalho: 'E-mail', celula: (member) => member.email },
    { id: 'situacao', cabecalho: 'Situação', celula: (member) => <StatusBadge variant={STATUS_VARIANTS[member.status] ?? 'bloqueado'}>{STATUS_LABELS[member.status] ?? member.status}</StatusBadge> },
    {
      id: 'acoes',
      cabecalho: 'Ações',
      celula: (member) => {
        const name = member.display_name || member.email;
        return (
          <div className="flex flex-wrap gap-2">
            {actionsFor(member.status).map((next) => (
              <Button key={next} variant="secundario" onClick={(event) => setChange({ member, next, trigger: event.currentTarget })}>
                {ACTION_COPY[next].verb} {name}
              </Button>
            ))}
          </div>
        );
      },
    },
  ];

  return (
    <section aria-labelledby="members-title" className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 tablet:flex-row tablet:items-center tablet:justify-between">
        <div>
          <p className="text-legenda font-semibold uppercase text-azul-profundo">Administração do tenant</p>
          <h2 id="members-title" className="mt-1 text-h2 font-bold text-navy">Pessoas do tenant</h2>
          <p className="mt-1 text-corpo">Convide pessoas e gerencie o acesso delas apenas nesta organização.</p>
        </div>
        <Button className="tablet:shrink-0 tablet:whitespace-nowrap" disabled={!service} aria-expanded={showInvite} onClick={() => setShowInvite((visible) => !visible)}>
          Convidar pessoa
        </Button>
      </div>

      {feedback && <Alert ref={feedbackRef} tabIndex={-1} variant={feedback.kind === 'error' ? 'erro' : 'sucesso'}>{feedback.message}</Alert>}

      {showInvite && (
        <Card>
          <form noValidate onSubmit={(event) => void submitInvite(event)} className="flex flex-col gap-4">
            <FormSection legend="Novo convite" description="O convite vale por 72 horas e só concede acesso depois de aceito.">
              <div className="grid gap-4 tablet:grid-cols-2">
                <TextField label="E-mail do convite" name="email" type="email" autoComplete="off" maxLength={254} error={inviteErrors.email} />
                <Select label="Papel inicial" name="roleId" defaultValue="" error={inviteErrors.roleId}>
                  <option value="" disabled>Selecione um papel</option>
                  {roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}
                </Select>
                <Field label="Justificativa do convite" error={inviteErrors.justification} className="tablet:col-span-2">
                  {(control) => <textarea {...control} name="justification" rows={3} maxLength={MAX_JUSTIFICATION} className={textareaClass} />}
                </Field>
              </div>
            </FormSection>
            <Button type="submit" disabled={sending} className="self-start">{sending ? 'Enviando…' : 'Enviar convite'}</Button>
          </form>
        </Card>
      )}

      {!(feedback && !loading && members.length === 0) && (
        <DataTable
          legenda="Pessoas vinculadas"
          colunas={columns}
          linhas={members}
          chaveDaLinha={(member) => member.id}
          carregando={loading}
          textoDeCarregamento="Carregando pessoas…"
          vazio={{ title: 'Nenhuma pessoa vinculada a este tenant.', description: 'Convide a primeira pessoa com o botão Convidar pessoa. O acesso só vale depois de o convite ser aceito.' }}
        />
      )}

      {change && (
        <ConfirmationDialog
          title={`${ACTION_COPY[change.next].verb} ${change.member.display_name || change.member.email}`}
          confirmLabel={ACTION_COPY[change.next].confirm}
          busy={saving}
          returnFocusTo={change.trigger}
          onCancel={() => setChange(null)}
          onConfirm={(justification) => void confirmChange(justification)}
        />
      )}
    </section>
  );
}

export function TenantMembersPage(): React.JSX.Element {
  const { client, config, result } = useConnectivity();
  const endpoint = config?.endpoints.find((candidate) => candidate.kind === result.selectedEndpoint);
  const service = useMemo(
    () => endpoint && client ? new MembershipService(createMembershipTransport(endpoint, client)) : null,
    [client, endpoint],
  );
  // O tenant vem da seleção confirmada no servidor, nunca da URL; a autorização continua sendo decidida pelo servidor.
  const { activeOrganizationId } = useTenant();
  return <TenantMembersView organizationId={activeOrganizationId ?? ''} service={service} />;
}
