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
import { Alert, Button, Card, DataTable, FormSection, Select, StatusBadge, TextField, type ColunaDaTabela, type StatusBadgeVariant } from '@/design-system';

const PAGE_SIZE = 50;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const RESULT_LABELS: Record<AuditResult, string> = { success: 'Sucesso', denied: 'Negado', failed: 'Falha' };
const RESULT_VARIANTS: Record<AuditResult, StatusBadgeVariant> = { success: 'ativo', denied: 'pendente', failed: 'erro' };

const COLUNAS: readonly ColunaDaTabela<AuditEventView>[] = [
  { id: 'data', cabecalho: 'Data e hora', celula: (item) => <time dateTime={item.occurredAt}>{formatDate(item.occurredAt)}</time> },
  { id: 'ator', cabecalho: 'Ator', celula: (item) => item.actor.displayName ?? 'Sistema' },
  { id: 'acao', cabecalho: 'Ação', celula: (item) => <code>{item.action}</code> },
  { id: 'alvo', cabecalho: 'Alvo', celula: (item) => `${item.targetType}${item.targetId ? ` · ${item.targetId}` : ''}` },
  { id: 'resultado', cabecalho: 'Resultado', celula: (item) => <StatusBadge variant={RESULT_VARIANTS[item.result]}>{RESULT_LABELS[item.result]}</StatusBadge> },
  { id: 'detalhes', cabecalho: 'Detalhes', celula: (item) => describe(item).map((line) => <p key={line} className="break-words">{line}</p>) },
];

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
    <section aria-labelledby="audit-title" className="flex flex-col gap-6">
      <div>
        <p className="text-legenda font-semibold uppercase text-azul-profundo">{scope === 'global' ? 'Administração global' : 'Administração do tenant'}</p>
        <h2 id="audit-title" className="mt-1 text-h2 font-bold text-navy">{title}</h2>
        <p className="mt-1 text-corpo">Somente leitura: a trilha de auditoria não pode ser alterada nem excluída.</p>
      </div>

      <Card>
        <form noValidate onSubmit={submit} className="flex flex-col gap-4">
          <FormSection legend="Filtros">
            <div className="grid gap-4 tablet:grid-cols-2 desktop:grid-cols-3">
              <TextField label="De" type="datetime-local" value={draft.from} onChange={(event) => set('from', event.target.value)} error={errors.from} />
              <TextField label="Até" type="datetime-local" value={draft.to} onChange={(event) => set('to', event.target.value)} error={errors.to} />
              <TextField label="Ação" value={draft.action} maxLength={64} placeholder="role.create" onChange={(event) => set('action', event.target.value)} error={errors.action} />
              <Select label="Resultado" value={draft.result} onChange={(event) => set('result', event.target.value as Draft['result'])}>
                <option value="">Todos</option>
                <option value="success">Sucesso</option>
                <option value="denied">Negado</option>
                <option value="failed">Falha</option>
              </Select>
              <TextField label="Tipo de alvo" value={draft.targetType} maxLength={40} placeholder="role" onChange={(event) => set('targetType', event.target.value)} error={errors.targetType} />
            </div>
          </FormSection>
          <div className="flex flex-wrap gap-2">
            <Button type="submit">Filtrar</Button>
            <Button variant="secundario" onClick={clear}>Limpar filtros</Button>
          </div>
        </form>
      </Card>

      {message && <Alert ref={alertRef} tabIndex={-1} variant="erro">{message}</Alert>}

      {message === null || events.length > 0 || (loading && !unavailable) ? (
        <>
          {events.length > 0 && !loading && <p role="status" aria-live="polite" className="text-corpo">{summary}</p>}
          <DataTable
            legenda="Eventos de auditoria"
            colunas={COLUNAS}
            linhas={events}
            chaveDaLinha={(item) => String(item.id)}
            carregando={loading && !unavailable}
            textoDeCarregamento="Carregando eventos…"
            vazio={{ title: 'Nenhum evento encontrado para os filtros informados.', description: 'Ajuste os filtros ou amplie o período e consulte de novo.' }}
          />
          {events.length > 0 && next && (
            <Button variant="secundario" disabled={loadingMore} onClick={() => void loadMore()} className="self-start">
              {loadingMore ? 'Carregando mais eventos…' : 'Carregar mais eventos'}
            </Button>
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
