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
import {
  ConfirmationDialog,
  MAX_JUSTIFICATION,
  MIN_JUSTIFICATION,
  fieldClass,
  primaryButtonClass,
  secondaryButtonClass,
  textareaClass,
} from '@/components/identity/confirmation-dialog';
import { FormField } from '@/components/identity/form-field';

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
    <section aria-labelledby="roles-title" className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-[#1766D9]">Administração do tenant</p>
          <h2 id="roles-title" className="mt-1 text-2xl font-bold text-[#163B72]">Papéis e permissões</h2>
          <p className="mt-1 text-sm">Papéis preestabelecidos são fixos. Crie papéis personalizados com permissões delegáveis.</p>
        </div>
        <button type="button" disabled={!rbac || loading} aria-expanded={draft !== null} onClick={() => (draft ? setDraft(null) : openDraft(null))} className={`${primaryButtonClass} disabled:cursor-not-allowed disabled:opacity-60`}>
          {draft ? 'Cancelar' : 'Novo papel'}
        </button>
      </div>

      {feedback && (
        <div ref={feedbackRef} tabIndex={-1} role={feedback.kind === 'error' ? 'alert' : 'status'}
          className={`rounded-lg border p-3 text-sm outline-none focus-visible:ring-2 ${feedback.kind === 'error' ? 'border-rose-300 bg-rose-50 text-rose-950 focus-visible:ring-rose-800' : 'border-green-300 bg-green-50 text-green-950 focus-visible:ring-green-800'}`}>
          {feedback.message}
        </div>
      )}

      {draft && (
        <form noValidate onSubmit={(event) => void submitDraft(event)} className="rounded-xl border border-[#D7E2EE] bg-white p-4 shadow-sm sm:p-6">
          <h3 className="text-lg font-semibold text-[#163B72]">{draft.role ? `Editar ${draft.role.name}` : 'Novo papel'}</h3>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <FormField label="Nome do papel" error={draftErrors.name}>
              {(control) => <input {...control} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} maxLength={80} className={fieldClass} />}
            </FormField>
            <FormField label="Descrição">
              {(control) => <input {...control} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} maxLength={300} className={fieldClass} />}
            </FormField>
          </div>          <fieldset className="mt-4">
            <legend className="text-sm font-medium">Permissões do papel</legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {delegable.map((item) => (
                <label key={item.code} className="flex min-h-11 items-start gap-2 rounded-lg border border-[#D7E2EE] p-2 text-sm">
                  <input type="checkbox" checked={draft.permissions.includes(item.code)} onChange={() => togglePermission(item.code)} className="mt-1 h-5 w-5" />
                  <span><span className="font-semibold">{item.code}</span> — {item.description}{item.critical && <span className="ml-1 rounded bg-amber-100 px-1 text-xs font-semibold text-amber-950">crítica: exige segundo fator</span>}</span>
                </label>
              ))}
              {blocked.map((item) => (
                <label key={item.code} className="flex min-h-11 items-start gap-2 rounded-lg border border-dashed border-[#8CA2B8] bg-slate-50 p-2 text-sm text-slate-800">
                  <input type="checkbox" disabled checked={false} className="mt-1 h-5 w-5" />
                  <span><span className="font-semibold">{item.code}</span> — {item.description} <span className="ml-1 rounded bg-slate-200 px-1 text-xs font-semibold">não delegável</span></span>
                </label>
              ))}
            </div>
          </fieldset>
          <FormField label="Justificativa do papel" error={draftErrors.justification} className="mt-4">
            {(control) => <textarea {...control} name="justification" rows={3} maxLength={MAX_JUSTIFICATION} className={textareaClass} />}
          </FormField>          <button disabled={saving} className={`mt-4 ${primaryButtonClass} disabled:cursor-wait disabled:opacity-60`}>{saving ? 'Salvando…' : 'Salvar papel'}</button>
        </form>
      )}

      {loading ? <p role="status" aria-live="polite">Carregando papéis…</p> : roles.length === 0 ? (
        !feedback && <p className="rounded-xl border border-dashed border-[#8CA2B8] bg-white p-6 text-sm">Nenhum papel disponível neste tenant.</p>
      ) : (
        <>
          <ul className="grid gap-3 md:grid-cols-2" aria-label="Papéis do tenant">
            {roles.map((role) => (
              <li key={role.id} className="min-w-0 rounded-xl border border-[#D7E2EE] bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="break-words font-semibold text-[#163B72]">{role.name}</h3>
                    {role.description && <p className="break-words text-sm">{role.description}</p>}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    <span className="rounded-full bg-slate-200 px-2 py-1 text-xs font-semibold text-slate-900">{role.system ? 'Preestabelecido' : 'Personalizado'}</span>
                    <span className={`rounded-full px-2 py-1 text-xs font-semibold ${role.active ? 'bg-green-100 text-green-900' : 'bg-rose-100 text-rose-900'}`}>{role.active ? 'Ativo' : 'Inativo'}</span>
                  </div>
                </div>
                <ul className="mt-3 flex flex-wrap gap-1" aria-label={`Permissões de ${role.name}`}>
                  {role.permissions.length === 0 && <li className="text-sm">Sem permissões.</li>}
                  {role.permissions.map((code) => {
                    const info = permissions.find((item) => item.code === code);
                    return <li key={code} className="rounded border border-[#D7E2EE] px-2 py-1 text-xs">{code}{info?.critical && <span className="ml-1 font-semibold">(crítica)</span>}</li>;
                  })}
                </ul>
                {role.system ? <p className="mt-3 text-sm">Papel preestabelecido: não pode ser alterado.</p> : (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button type="button" onClick={() => openDraft(role)} className={secondaryButtonClass}>Editar {role.name}</button>
                    <button type="button" onClick={(event) => setPending({ kind: 'toggle', role, trigger: event.currentTarget })} className={secondaryButtonClass}>{role.active ? 'Inativar' : 'Reativar'} {role.name}</button>
                  </div>
                )}
              </li>
            ))}
          </ul>

          <section aria-labelledby="assignments-title" className="space-y-3">
            <h3 id="assignments-title" className="text-lg font-semibold text-[#163B72]">Papéis por pessoa</h3>
            {people.length === 0 ? <p className="text-sm">Nenhuma pessoa ativa neste tenant.</p> : (
              <ul className="grid gap-3 md:grid-cols-2" aria-label="Pessoas e seus papéis">
                {people.map((member) => {
                  const name = member.display_name || member.email;
                  const assigned = rolesOf(member.id);
                  return (
                    <li key={member.id} className="min-w-0 rounded-xl border border-[#D7E2EE] bg-white p-4 shadow-sm">
                      <p className="break-words font-semibold text-[#163B72]">{name}</p>
                      <p className="break-words text-sm">{member.email}</p>
                      <ul className="mt-2 space-y-2" aria-label={`Papéis de ${name}`}>
                        {assigned.length === 0 && <li className="text-sm">Nenhum papel atribuído.</li>}
                        {assigned.map((role) => (
                          <li key={role.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                            <span>{role.name}{!role.active && ' (inativo)'}</span>
                            <button type="button" onClick={(event) => setPending({ kind: 'remove', member, role, trigger: event.currentTarget })} className={secondaryButtonClass}>Remover {role.name} de {name}</button>
                          </li>
                        ))}
                      </ul>
                      <button type="button" onClick={(event) => setPending({ kind: 'assign', member, trigger: event.currentTarget })} className={`mt-3 ${secondaryButtonClass}`}>Atribuir papel a {name}</button>
                    </li>
                  );
                })}
              </ul>
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
            <FormField label="Papel" className="mt-4">
              {(control) => (
                <select {...control} name="roleId" defaultValue={assignable[0]?.id} className={fieldClass}>
                  {assignable.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}
                </select>
              )}
            </FormField>          )}
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
