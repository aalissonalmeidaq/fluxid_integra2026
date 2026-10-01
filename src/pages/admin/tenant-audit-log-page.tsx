import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AuditService,
  type AuditCursor,
  type AuditOutcome,
  type AuditEventView,
  type AuditFailure,
  type AuditFilters,
  type AuditResult,
  type AuditScope,
} from '@/application/identity/audit-service';
import { useConnectivity } from '@/app/connectivity-context';
import { useTenant } from '@/app/tenant/tenant-context';
import { createFunctionTransport } from '@/infrastructure/supabase/function-transport';
import { FormField } from '@/components/identity/form-field';
import { fieldClass, primaryButtonClass, secondaryButtonClass } from '@/components/identity/confirmation-dialog';

const PAGE_SIZE = 50;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const RESULT_LABELS: Record<AuditResult, string> = { success: 'Sucesso', denied: 'Negado', failed: 'Falha' };
const RESULT_STYLES: Record<AuditResult, string> = {
  success: 'bg-green-100 text-green-900',
  denied: 'bg-amber-100 text-amber-950',
  failed: 'bg-rose-100 text-rose-900',
};

const LOAD_FAILURES: Record<AuditFailure, string> = {
  access_denied: 'Acesso negado. Você precisa da permissão de consulta de auditoria.',
  mfa_required: 'Confirme o segundo fator para consultar a auditoria.',
  invalid: 'Revise os filtros informados.',
  unavailable: 'Não foi possível carregar a auditoria agora.',
};

const formatter = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'medium' });
const formatDate = (iso: string): string => { const date = new Date(iso); return Number.isNaN(date.getTime()) ? iso : formatter.format(date); };

// Metadados permitidos viram texto legível; nunca JSON bruto.
function describe(event: AuditEventView): string[] {
  const lines: string[] = [];
  if (event.reasonCode) lines.push(`Motivo: ${event.reasonCode}`);
  if (event.justification) lines.push(`Justificativa: ${event.justification}`);
  const { permissions, status, version } = event.metadata;
  if (Array.isArray(permissions) && permissions.length > 0) lines.push(`Permissões: ${permissions.filter((item) => typeof item === 'string').join(', ')}`);
  if (typeof status === 'string') lines.push(`Estado: ${status}`);
  if (typeof version === 'number') lines.push(`Versão: ${version}`);
  lines.push(`Origem: ${event.origin}`);
  return lines;
}

const toIso = (local: string): string => new Date(local).toISOString();

interface Draft { from: string; to: string; action: string; result: '' | AuditResult; targetType: string }
const EMPTY_DRAFT: Draft = { from: '', to: '', action: '', result: '', targetType: '' };

export interface AuditLogViewProps {
  scope: 'tenant' | 'global';
  organizationId: string | null;
  service: AuditService | null;
}

export function AuditLogView({ scope, organizationId, service }: AuditLogViewProps): React.JSX.Element {
  const [events, setEvents] = useState<AuditEventView[]>([]);
  const [next, setNext] = useState<AuditCursor | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [applied, setApplied] = useState<AuditFilters>({});
  const alertRef = useRef<HTMLDivElement>(null);
  const busy = useRef(false);

  const auditScope = useMemo<AuditScope | null>(() => {
    if (scope === 'global') return { scope: 'global' };
    return organizationId && UUID.test(organizationId) ? { scope: 'tenant', organizationId } : null;
  }, [scope, organizationId]);

  // Sem conexão ou sem tenant não há consulta possível: estado derivado, sem setState em efeito.
  const unavailable = !service ? 'Conexão indisponível.' : !auditScope ? 'Organização não informada.' : null;

  const applyOutcome = useCallback((outcome: AuditOutcome, filters: AuditFilters): void => {
    if (outcome.kind === 'success') {
      setEvents(outcome.value.events);
      setNext(outcome.value.next);
      setApplied(filters);
    } else {
      setFailure(LOAD_FAILURES[outcome.kind]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!service || !auditScope) return;
    let active = true;
    const load = async (): Promise<void> => {
      const outcome = await service.query(auditScope, {}, undefined, PAGE_SIZE);
      if (active) applyOutcome(outcome, {});
    };
    void load();
    return () => { active = false; };
  }, [service, auditScope, applyOutcome]);

  const message = failure ?? unavailable;
  useEffect(() => { if (message) alertRef.current?.focus(); }, [message]);

  const fetchPage = async (filters: AuditFilters): Promise<void> => {
    if (!service || !auditScope) return;
    setLoading(true);
    setFailure(null);
    applyOutcome(await service.query(auditScope, filters, undefined, PAGE_SIZE), filters);
  };
  const loadMore = async (): Promise<void> => {
    if (!service || !auditScope || !next || busy.current) return;
    busy.current = true;
    setLoadingMore(true);
    setFailure(null);
    const outcome = await service.query(auditScope, applied, next, PAGE_SIZE);
    busy.current = false;
    setLoadingMore(false);
    if (outcome.kind !== 'success') return setFailure('Não foi possível carregar mais eventos agora.');
    setEvents((current) => {
      const known = new Set(current.map((item) => item.id));
      return [...current, ...outcome.value.events.filter((item) => !known.has(item.id))];
    });
    setNext(outcome.value.next);
  };

  const submit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const found: Record<string, string> = {};
    const action = draft.action.trim();
    const targetType = draft.targetType.trim();
    if (action && !/^[a-z0-9_.]{1,64}$/.test(action)) found.action = 'Use letras minúsculas, números, ponto ou sublinhado.';
    if (targetType && !/^[a-z0-9_]{1,40}$/.test(targetType)) found.targetType = 'Use letras minúsculas, números ou sublinhado.';
    if (draft.from && draft.to && new Date(draft.from).getTime() > new Date(draft.to).getTime()) found.to = 'A data final deve ser posterior à data inicial.';
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    void fetchPage({
      ...(draft.from ? { from: toIso(draft.from) } : {}),
      ...(draft.to ? { to: toIso(draft.to) } : {}),
      ...(action ? { action } : {}),
      ...(draft.result ? { result: draft.result } : {}),
      ...(targetType ? { targetType } : {}),
    });
  };

  const clear = (): void => {
    setDraft(EMPTY_DRAFT);
    setErrors({});
    void fetchPage({});
  };

  const set = <K extends keyof Draft>(key: K, value: Draft[K]): void => setDraft((current) => ({ ...current, [key]: value }));
  const title = scope === 'global' ? 'Auditoria da plataforma' : 'Auditoria do tenant';
  const summary = loadingMore ? 'Carregando mais eventos…' : `${events.length} ${events.length === 1 ? 'evento exibido' : 'eventos exibidos'}.`;

  return (
    <section aria-labelledby="audit-title" className="space-y-5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-[#1766D9]">{scope === 'global' ? 'Administração global' : 'Administração do tenant'}</p>
        <h2 id="audit-title" className="mt-1 text-2xl font-bold text-[#163B72]">{title}</h2>
        <p className="mt-1 text-sm">Somente leitura: a trilha de auditoria não pode ser alterada nem excluída.</p>
      </div>

      <form noValidate onSubmit={submit} className="rounded-xl border border-[#D7E2EE] bg-white p-4 shadow-sm sm:p-6">
        <h3 className="text-lg font-semibold text-[#163B72]">Filtros</h3>
        <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <FormField label="De" error={errors.from}>{(control) => <input {...control} type="datetime-local" value={draft.from} onChange={(event) => set('from', event.target.value)} className={fieldClass} />}</FormField>
          <FormField label="Até" error={errors.to}>{(control) => <input {...control} type="datetime-local" value={draft.to} onChange={(event) => set('to', event.target.value)} className={fieldClass} />}</FormField>
          <FormField label="Ação" error={errors.action}>{(control) => <input {...control} value={draft.action} maxLength={64} placeholder="role.create" onChange={(event) => set('action', event.target.value)} className={fieldClass} />}</FormField>
          <FormField label="Resultado">
            {(control) => (
              <select {...control} value={draft.result} onChange={(event) => set('result', event.target.value as Draft['result'])} className={fieldClass}>
                <option value="">Todos</option>
                <option value="success">Sucesso</option>
                <option value="denied">Negado</option>
                <option value="failed">Falha</option>
              </select>
            )}
          </FormField>
          <FormField label="Tipo de alvo" error={errors.targetType}>{(control) => <input {...control} value={draft.targetType} maxLength={40} placeholder="role" onChange={(event) => set('targetType', event.target.value)} className={fieldClass} />}</FormField>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button className={primaryButtonClass}>Filtrar</button>
          <button type="button" onClick={clear} className={secondaryButtonClass}>Limpar filtros</button>
        </div>
      </form>

      {message && (
        <div ref={alertRef} role="alert" tabIndex={-1} className="rounded-lg border border-rose-300 bg-rose-50 p-3 text-sm text-rose-950 outline-none focus-visible:ring-2 focus-visible:ring-rose-800">{message}</div>
      )}

      {loading && !unavailable ? <p role="status" aria-live="polite">Carregando eventos…</p> : (events.length === 0 && message === null) ? (
        <p className="rounded-xl border border-dashed border-[#8CA2B8] bg-white p-6 text-sm">Nenhum evento encontrado para os filtros informados.</p>
      ) : events.length > 0 ? (
        <>
          <p role="status" aria-live="polite" className="text-sm">{summary}</p>

          <div className="hidden md:block">
            <table className="w-full border-collapse overflow-hidden rounded-xl border border-[#D7E2EE] bg-white text-left text-sm">
              <caption className="sr-only">Eventos de auditoria</caption>
              <thead className="bg-[#F3F7FA] text-[#163B72]">
                <tr>{['Data e hora', 'Ator', 'Ação', 'Alvo', 'Resultado', 'Detalhes'].map((heading) => <th key={heading} scope="col" className="px-3 py-2 font-semibold">{heading}</th>)}</tr>
              </thead>
              <tbody>
                {events.map((item) => (
                  <tr key={item.id} className="border-t border-[#D7E2EE] align-top">
                    <td className="px-3 py-2"><time dateTime={item.occurredAt}>{formatDate(item.occurredAt)}</time></td>
                    <td className="px-3 py-2">{item.actor.displayName ?? 'Sistema'}</td>
                    <td className="px-3 py-2"><code>{item.action}</code></td>
                    <td className="px-3 py-2 break-words">{item.targetType}{item.targetId ? ` · ${item.targetId}` : ''}</td>
                    <td className="px-3 py-2"><span className={`rounded-full px-2 py-1 text-xs font-semibold ${RESULT_STYLES[item.result]}`}>{RESULT_LABELS[item.result]}</span></td>
                    <td className="px-3 py-2">{describe(item).map((line) => <p key={line} className="break-words">{line}</p>)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul aria-label="Eventos em lista" className="space-y-3 md:hidden">
            {events.map((item) => (
              <li key={item.id} className="min-w-0 rounded-xl border border-[#D7E2EE] bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="font-semibold text-[#163B72]"><code>{item.action}</code></p>
                  <span className={`rounded-full px-2 py-1 text-xs font-semibold ${RESULT_STYLES[item.result]}`}>{RESULT_LABELS[item.result]}</span>
                </div>
                <p className="mt-1 text-sm"><time dateTime={item.occurredAt}>{formatDate(item.occurredAt)}</time> · {item.actor.displayName ?? 'Sistema'}</p>
                <p className="break-words text-sm">{item.targetType}{item.targetId ? ` · ${item.targetId}` : ''}</p>
                <div className="mt-1 text-sm">{describe(item).map((line) => <p key={line} className="break-words">{line}</p>)}</div>
              </li>
            ))}
          </ul>

          {next && (
            <button type="button" disabled={loadingMore} onClick={() => void loadMore()} className={`${secondaryButtonClass} disabled:cursor-wait disabled:opacity-60`}>
              {loadingMore ? 'Carregando mais eventos…' : 'Carregar mais eventos'}
            </button>
          )}
        </>
      ) : null}
    </section>
  );
}

function useAuditService(): AuditService | null {
  const { client, config, result } = useConnectivity();
  const endpoint = config?.endpoints.find((candidate) => candidate.kind === result.selectedEndpoint);
  return useMemo(() => {
    if (!endpoint || !client) return null;
    const call = createFunctionTransport(endpoint, client);
    return new AuditService({ call: (body) => call('query-audit', body) });
  }, [client, endpoint]);
}

export function TenantAuditLogPage(): React.JSX.Element {
  const service = useAuditService();
  // O tenant vem da seleção confirmada no servidor, nunca da URL; a autorização continua sendo decidida pelo servidor.
  const { activeOrganizationId } = useTenant();
  return <AuditLogView scope="tenant" organizationId={activeOrganizationId} service={service} />;
}

export function PlatformAuditLogPage(): React.JSX.Element {
  return <AuditLogView scope="global" organizationId={null} service={useAuditService()} />;
}
