import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  RbacService,
  type AccessFailure,
  type AccessOutcome,
  type AssignmentView,
  type PermissionView,
  type RoleView,
} from '@/application/identity/rbac-service';
import { MembershipService, type MemberSummary } from '@/application/identity/membership-service';
import { useConnectivity } from '@/app/connectivity-context';
import { useTenant } from '@/app/tenant/tenant-context';
import { createFunctionTransport } from '@/infrastructure/supabase/function-transport';
import { createMembershipTransport } from '@/infrastructure/supabase/membership-adapter';
import { ConfirmationDialog, MAX_JUSTIFICATION, MIN_JUSTIFICATION, textareaClass } from '@/components/identity/confirmation-dialog';
import { Alert, Button, Card, EmptyState, Field, FormSection, List, ListItem, Loading, Select, StatusBadge, TextField } from '@/design-system';

type Feedback = { kind: 'success' | 'error'; message: string };
type Pending =
  | { kind: 'assign'; member: MemberSummary; trigger: HTMLElement }
  | { kind: 'remove'; member: MemberSummary; role: RoleView; trigger: HTMLElement }
  | { kind: 'toggle'; role: RoleView; trigger: HTMLElement };
interface RoleDraft { role: RoleView | null; name: string; description: string; permissions: string[] }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ERROR_MESSAGES: Record<AccessFailure, string> = {
  access_denied: 'Acesso negado. Você não tem autorização para administrar papéis deste tenant.',
  mfa_required: 'Confirme o segundo fator para continuar.',
  not_delegable: 'Uma das permissões escolhidas não pode ser delegada ao tenant.',
  immutable: 'Papéis preestabelecidos não podem ser alterados. Crie um papel personalizado.',
  conflict: 'O papel foi alterado por outra pessoa. Atualize a página e tente novamente.',
  role_unavailable: 'O papel ou a pessoa não está mais disponível neste tenant.',
  last_admin: 'Ação recusada: este é o último administrador ativo do tenant. Atribua o papel a outra pessoa antes.',
  invalid: 'Revise os dados informados.',
  unavailable: 'Não foi possível concluir a ação agora. Tente novamente.',
};

const confirmLabels = { assign: 'Confirmar atribuição', remove: 'Confirmar remoção' } as const;

export interface TenantRolesViewProps {
  organizationId: string;
  rbac: RbacService | null;
  members: MembershipService | null;
}

export function TenantRolesView({ organizationId, rbac, members: membershipService }: TenantRolesViewProps): React.JSX.Element {
  const [roles, setRoles] = useState<RoleView[]>([]);
  const [permissions, setPermissions] = useState<PermissionView[]>([]);
  const [assignments, setAssignments] = useState<AssignmentView[]>([]);
  const [people, setPeople] = useState<MemberSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [draft, setDraft] = useState<RoleDraft | null>(null);
  const [draftErrors, setDraftErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const feedbackRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    const load = async (): Promise<void> => {
      if (!rbac || !UUID.test(organizationId)) {
        if (active) {
          setLoading(false);
          setFeedback({ kind: 'error', message: rbac ? 'Organização não informada.' : 'Conexão indisponível.' });
        }
        return;
      }
      const [access, listed] = await Promise.all([rbac.list({ organizationId }), membershipService?.list({ organizationId })]);
      if (!active) return;
      if (access.kind === 'success') {
        setRoles(access.value.roles);
        setPermissions(access.value.permissions);
        setAssignments(access.value.assignments);
        if (listed?.kind === 'success') setPeople(listed.value.members.filter((member) => member.status === 'active'));
      } else {
        setFeedback({ kind: 'error', message: access.kind === 'unavailable' ? 'Não foi possível carregar os papéis agora.' : ERROR_MESSAGES[access.kind] });
      }
      setLoading(false);
    };
    void load();
    return () => { active = false; };
  }, [rbac, membershipService, organizationId, reloadKey]);

  useEffect(() => { if (feedback) feedbackRef.current?.focus(); }, [feedback]);

  const roleById = useMemo(() => new Map(roles.map((role) => [role.id, role])), [roles]);
  const rolesOf = (memberId: string): RoleView[] =>
    assignments.filter((item) => item.membership_id === memberId).map((item) => roleById.get(item.role_id)).filter((role): role is RoleView => Boolean(role));

  const finish = (outcome: AccessOutcome<unknown>, success: string): boolean => {
    if (outcome.kind !== 'success') { setFeedback({ kind: 'error', message: ERROR_MESSAGES[outcome.kind] }); return false; }
    setFeedback({ kind: 'success', message: success });
    setReloadKey((key) => key + 1);
    return true;
  };

  const openDraft = (role: RoleView | null): void => {
    setDraftErrors({});
    setDraft({ role, name: role?.name ?? '', description: role?.description ?? '', permissions: role ? [...role.permissions] : [] });
  };

  const togglePermission = (code: string): void =>
    setDraft((current) => current && ({
      ...current,
      permissions: current.permissions.includes(code) ? current.permissions.filter((item) => item !== code) : [...current.permissions, code],
    }));

  const submitDraft = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (!rbac || !draft || saving) return;
    const justification = String(new FormData(event.currentTarget).get('justification') ?? '').trim();
    const name = draft.name.trim();
    const errors: Record<string, string> = {};
    if (name.length < 2) errors.name = 'Informe um nome com pelo menos 2 caracteres.';
    if (justification.length < MIN_JUSTIFICATION) errors.justification = `Descreva o motivo com pelo menos ${MIN_JUSTIFICATION} caracteres.`;
    setDraftErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSaving(true);
    setFeedback(null);
    const outcome = await rbac.saveRole({
      organizationId, name, description: draft.description, permissions: draft.permissions, justification,
      ...(draft.role ? { roleId: draft.role.id, expectedVersion: draft.role.version } : {}),
    });
    setSaving(false);
    if (finish(outcome, 'Papel salvo.')) setDraft(null);
  };

  const confirm = async (justification: string, form: FormData): Promise<void> => {
    if (!rbac || !pending || saving) return;
    const target = pending;
    setSaving(true);
    let outcome: AccessOutcome<unknown>;
    let success: string;
    if (target.kind === 'assign') {
      outcome = await rbac.assignRole({ organizationId, membershipId: target.member.id, roleId: String(form.get('roleId') ?? ''), justification });
      success = 'Papel atribuído.';
    } else if (target.kind === 'remove') {
      outcome = await rbac.removeRole({ organizationId, membershipId: target.member.id, roleId: target.role.id, justification });
      success = 'Papel removido.';
    } else {
      outcome = await rbac.setRoleActive({ organizationId, roleId: target.role.id, active: !target.role.active, expectedVersion: target.role.version, justification });
      success = target.role.active ? 'Papel inativado.' : 'Papel reativado.';
    }
    setSaving(false);
    setPending(null);
    finish(outcome, success);
  };

  const delegable = permissions.filter((item) => item.delegable);
  const blocked = permissions.filter((item) => !item.delegable);
  const assignable = pending?.kind === 'assign'
    ? roles.filter((role) => role.active && !rolesOf(pending.member.id).some((assigned) => assigned.id === role.id))
    : [];

  return (
    <section aria-labelledby="roles-title" className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 tablet:flex-row tablet:items-center tablet:justify-between">
        <div>
          <p className="text-legenda font-semibold uppercase text-azul-profundo">Administração do tenant</p>
          <h2 id="roles-title" className="mt-1 text-h2 font-bold text-navy">Papéis e permissões</h2>
          <p className="mt-1 text-corpo">Papéis preestabelecidos são fixos. Crie papéis personalizados com permissões delegáveis.</p>
        </div>
        <Button className="tablet:shrink-0 tablet:whitespace-nowrap" disabled={!rbac || loading} aria-expanded={draft !== null} onClick={() => (draft ? setDraft(null) : openDraft(null))}>
          {draft ? 'Cancelar' : 'Novo papel'}
        </Button>
      </div>

      {feedback && <Alert ref={feedbackRef} tabIndex={-1} variant={feedback.kind === 'error' ? 'erro' : 'sucesso'}>{feedback.message}</Alert>}

      {draft && (
        <Card>
          <form noValidate onSubmit={(event) => void submitDraft(event)} className="flex flex-col gap-6">
            <h3 className="text-h3 font-semibold text-navy">{draft.role ? `Editar ${draft.role.name}` : 'Novo papel'}</h3>
            <FormSection legend="Dados do papel">
              <div className="grid gap-4 tablet:grid-cols-2">
                <TextField label="Nome do papel" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} maxLength={80} error={draftErrors.name} />
                <TextField label="Descrição" value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} maxLength={300} />
              </div>
            </FormSection>
            <FormSection legend="Permissões do papel">
              <div className="grid gap-2 tablet:grid-cols-2">
                {delegable.map((item) => (
                  <label key={item.code} className="flex min-h-alvo items-start gap-2 rounded-controle border border-borda-suave p-2 text-corpo">
                    <input type="checkbox" checked={draft.permissions.includes(item.code)} onChange={() => togglePermission(item.code)} className="mt-1 size-6" />
                    <span><span className="font-semibold">{item.code}</span> — {item.description}{item.critical && <span className="ml-1 rounded-controle bg-alerta-fundo px-1 text-legenda font-semibold text-alerta-texto">crítica: exige segundo fator</span>}</span>
                  </label>
                ))}
                {blocked.map((item) => (
                  <label key={item.code} className="flex min-h-alvo items-start gap-2 rounded-controle border border-dashed border-borda-controle bg-cinza-gelo p-2 text-corpo text-grafite">
                    <input type="checkbox" disabled checked={false} className="mt-1 size-6" />
                    <span><span className="font-semibold">{item.code}</span> — {item.description} <span className="ml-1 rounded-controle bg-borda-suave px-1 text-legenda font-semibold">não delegável</span></span>
                  </label>
                ))}
              </div>
            </FormSection>
            <FormSection legend="Justificativa">
              <Field label="Justificativa do papel" error={draftErrors.justification}>
                {(control) => <textarea {...control} name="justification" rows={3} maxLength={MAX_JUSTIFICATION} className={textareaClass} />}
              </Field>
            </FormSection>
            <Button type="submit" disabled={saving} className="self-start">{saving ? 'Salvando…' : 'Salvar papel'}</Button>
          </form>
        </Card>
      )}

      {loading ? <Loading label="Carregando papéis…" /> : roles.length === 0 ? (
        !feedback && <EmptyState title="Nenhum papel disponível neste tenant." description="Os papéis preestabelecidos aparecem aqui assim que o tenant estiver configurado. Papéis personalizados podem ser criados em Novo papel." />
      ) : (
        <>
          <List variant="cartoes" aria-label="Papéis do tenant" className="tablet:grid tablet:grid-cols-2">
            {roles.map((role) => (
              <ListItem key={role.id}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="break-words font-semibold text-navy">{role.name}</h3>
                    {role.description && <p className="break-words text-corpo">{role.description}</p>}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    <StatusBadge variant="conectado">{role.system ? 'Preestabelecido' : 'Personalizado'}</StatusBadge>
                    <StatusBadge variant={role.active ? 'ativo' : 'bloqueado'}>{role.active ? 'Ativo' : 'Inativo'}</StatusBadge>
                  </div>
                </div>
                <ul className="mt-4 flex flex-wrap gap-1" aria-label={`Permissões de ${role.name}`}>
                  {role.permissions.length === 0 && <li className="text-corpo">Sem permissões.</li>}
                  {role.permissions.map((code) => {
                    const info = permissions.find((item) => item.code === code);
                    return <li key={code} className="rounded-controle border border-borda-suave px-2 py-1 text-legenda">{code}{info?.critical && <span className="ml-1 font-semibold">(crítica)</span>}</li>;
                  })}
                </ul>
                {role.system ? <p className="mt-4 text-corpo">Papel preestabelecido: não pode ser alterado.</p> : (
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button variant="secundario" onClick={() => openDraft(role)}>Editar {role.name}</Button>
                    <Button variant="secundario" onClick={(event) => setPending({ kind: 'toggle', role, trigger: event.currentTarget })}>{role.active ? 'Inativar' : 'Reativar'} {role.name}</Button>
                  </div>
                )}
              </ListItem>
            ))}
          </List>

          <section aria-labelledby="assignments-title" className="flex flex-col gap-4">
            <h3 id="assignments-title" className="text-h3 font-semibold text-navy">Papéis por pessoa</h3>
            {people.length === 0 ? <p className="text-corpo">Nenhuma pessoa ativa neste tenant.</p> : (
              <List variant="cartoes" aria-label="Pessoas e seus papéis" className="tablet:grid tablet:grid-cols-2">
                {people.map((member) => {
                  const name = member.display_name || member.email;
                  const assigned = rolesOf(member.id);
                  return (
                    <ListItem key={member.id}>
                      <p className="break-words font-semibold text-navy">{name}</p>
                      <p className="break-words text-corpo">{member.email}</p>
                      <ul className="mt-2 flex flex-col gap-2" aria-label={`Papéis de ${name}`}>
                        {assigned.length === 0 && <li className="text-corpo">Nenhum papel atribuído.</li>}
                        {assigned.map((role) => (
                          <li key={role.id} className="flex flex-wrap items-center justify-between gap-2 text-corpo">
                            <span>{role.name}{!role.active && ' (inativo)'}</span>
                            <Button variant="secundario" onClick={(event) => setPending({ kind: 'remove', member, role, trigger: event.currentTarget })}>Remover {role.name} de {name}</Button>
                          </li>
                        ))}
                      </ul>
                      <Button variant="secundario" className="mt-4" onClick={(event) => setPending({ kind: 'assign', member, trigger: event.currentTarget })}>Atribuir papel a {name}</Button>
                    </ListItem>
                  );
                })}
              </List>
            )}
          </section>
        </>
      )}

      {pending && (
        <ConfirmationDialog
          title={pending.kind === 'assign' ? `Atribuir papel a ${pending.member.display_name || pending.member.email}`
            : pending.kind === 'remove' ? `Remover ${pending.role.name} de ${pending.member.display_name || pending.member.email}`
              : `${pending.role.active ? 'Inativar' : 'Reativar'} ${pending.role.name}`}
          confirmLabel={pending.kind === 'toggle' ? (pending.role.active ? 'Confirmar inativação' : 'Confirmar reativação') : confirmLabels[pending.kind]}
          busy={saving}
          returnFocusTo={pending.trigger}
          disabledReason={pending.kind === 'assign' && assignable.length === 0 ? 'Todos os papéis ativos já foram atribuídos a esta pessoa.' : null}
          onCancel={() => setPending(null)}
          onConfirm={(justification, form) => void confirm(justification, form)}
        >
          {pending.kind === 'assign' && assignable.length > 0 && (
            <Select label="Papel" name="roleId" defaultValue={assignable[0]?.id}>
              {assignable.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}
            </Select>
          )}
        </ConfirmationDialog>
      )}
    </section>
  );
}

export function TenantRolesPage(): React.JSX.Element {
  const { client, config, result } = useConnectivity();
  const endpoint = config?.endpoints.find((candidate) => candidate.kind === result.selectedEndpoint);
  const services = useMemo(() => {
    if (!endpoint || !client) return { rbac: null, members: null };
    const call = createFunctionTransport(endpoint, client);
    return {
      rbac: new RbacService({ call: (body) => call('manage-access', body) }),
      members: new MembershipService(createMembershipTransport(endpoint, client)),
    };
  }, [client, endpoint]);
  // O tenant vem da seleção confirmada no servidor, nunca da URL; a autorização continua sendo decidida pelo servidor.
  const { activeOrganizationId } = useTenant();
  return <TenantRolesView organizationId={activeOrganizationId ?? ''} rbac={services.rbac} members={services.members} />;
}
