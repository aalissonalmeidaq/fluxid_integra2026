import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ProximityRuleService, type ProximityRuleView } from '@/application/tracking/proximity-rule-service';
import { useConnectivity } from '@/app/connectivity-context';
import { useOnlineStatus } from '@/app/use-online-status';
import { usePermissions } from '@/app/navigation/permissions-context';
import { useTenant } from '@/app/tenant/tenant-context';
import { Alert, Button, Card, ErrorState, Loading, TextField } from '@/design-system';
import { formatDateTime } from '@/domain/cylinders/format';
import { RULE_RANGES, validateRule } from '@/domain/tracking/proximity-evaluator';
import { createTrackingTransport } from '@/infrastructure/supabase/tracking-adapter';
import { AccessGate } from '@/pages/cylinders/components/access-gate';

// Regra de proximidade da empresa (Spec 015, T041c; RF-009, RF-009a). Quem consulta o rastreamento vê a regra vigente e as faixas; só
// quem administra a regra a altera, com justificativa. A nova versão vale para as próximas comparações; as anteriores não mudam. Erros
// ficam junto do campo e o resultado é anunciado num único status.
type Load = { kind: 'loading' } | { kind: 'ready'; rule: ProximityRuleView } | { kind: 'error' };

export interface ProximityRuleScreenProps {
  service: ProximityRuleService | null;
  organizationId: string;
  canManage: boolean;
  online: boolean;
}

const minutes = (seconds: number) => (seconds % 60 === 0 ? `${seconds / 60} ${seconds === 60 ? 'minuto' : 'minutos'}` : `${seconds} s`);
type RuleValues = { distanceM: number; maxAgeS: number; maxAccuracyM: number };
// A mesma frase descreve a regra vigente e a prévia do formulário, para as duas não divergirem.
const ruleSentence = (rule: RuleValues) =>
  `Afastamento acima de ${rule.distanceM} m, com posições com até ${minutes(rule.maxAgeS)} e precisão de até ${rule.maxAccuracyM} m.`;

export function ProximityRuleScreen({ service, organizationId, canManage, online }: ProximityRuleScreenProps): React.JSX.Element {
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const [form, setForm] = useState({ distance: '', age: '', accuracy: '', justification: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState('');
  const [failure, setFailure] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const show = useCallback((rule: ProximityRuleView) => {
    setLoad({ kind: 'ready', rule });
    setForm({ distance: String(rule.distanceM), age: String(rule.maxAgeS), accuracy: String(rule.maxAccuracyM), justification: '' });
  }, []);
  const fetchRule = useCallback(async () => {
    if (!service || !organizationId) return;
    const outcome = await service.get(organizationId);
    if (outcome.kind === 'success') show(outcome.value);
    else setLoad({ kind: 'error' });
  }, [service, organizationId, show]);

  useEffect(() => {
    if (!service || !organizationId) return undefined;
    let active = true;
    void service.get(organizationId).then((outcome) => {
      if (!active) return;
      if (outcome.kind === 'success') show(outcome.value);
      else setLoad({ kind: 'error' });
    });
    return () => { active = false; };
  }, [service, organizationId, show]);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!service) return;
    setSaving(true);
    setFailure(null);
    const outcome = await service.set(organizationId, { distanceM: Number(form.distance), maxAgeS: Number(form.age), maxAccuracyM: Number(form.accuracy) },
      form.justification, crypto.randomUUID());
    setSaving(false);
    if (outcome.kind === 'success') {
      setErrors({});
      show(outcome.value);
      setStatus(`Regra atualizada: versão ${outcome.value.version}. Ela vale para as próximas comparações.`);
    } else if (outcome.kind === 'invalid') setErrors(outcome.fields);
    else setFailure(outcome.kind === 'access_denied' ? 'Você não tem permissão para alterar a regra.'
      : outcome.kind === 'session_expired' ? 'Sua sessão expirou. Entre de novo para alterar a regra.' : 'Não foi possível salvar agora. Tente de novo.');
  };

  if (load.kind === 'loading') return <Loading variant="pagina" busy label="Carregando a regra…" />;
  if (load.kind === 'error') return <ErrorState title="Não foi possível carregar a regra" message="Tente novamente em instantes." onRetry={() => { setLoad({ kind: 'loading' }); void fetchRule(); }} />;

  const { rule } = load;
  // Prévia só quando os três valores são válidos e diferem da regra vigente.
  const draft: RuleValues = { distanceM: Number(form.distance), maxAgeS: Number(form.age), maxAccuracyM: Number(form.accuracy) };
  const changed = draft.distanceM !== rule.distanceM || draft.maxAgeS !== rule.maxAgeS || draft.maxAccuracyM !== rule.maxAccuracyM;
  const preview = changed && validateRule(draft).length === 0 ? draft : null;
  return (
    <div className="flex w-full min-w-0 flex-col gap-6">
      <header className="flex flex-col gap-1">
        <a className="inline-flex min-h-alvo items-center self-start text-corpo text-azul-profundo underline" href="/rastreamento">Rastreamento</a>
        <h2 className="m-0 text-h3 font-semibold text-navy">Regra de proximidade</h2>
        <p className="m-0 max-w-padrao text-corpo text-grafite">Quando o celular do motorista e o lacre de um cilindro ficam afastados em três comparações válidas seguidas, o FluxID confirma o afastamento e abre um alerta.</p>
      </header>
      <p role="status" aria-atomic="true" className="sr-only">{status}</p>
      <Card as="section" aria-labelledby="rule-current-title" className="flex flex-col gap-2">
        <h3 id="rule-current-title" className="m-0 text-h3 font-semibold text-navy">Regra vigente</h3>
        <p className="m-0 text-corpo font-semibold text-grafite">{rule.version === 0 ? 'Padrão do FluxID' : `Versão ${rule.version}`}</p>
        <p className="m-0 text-corpo text-grafite">{ruleSentence(rule)}</p>
        {rule.validFrom && rule.version > 0 && <p className="m-0 text-legenda text-texto-secundario">Em vigor desde {formatDateTime(rule.validFrom)}.</p>}
      </Card>
      {!canManage && <p className="m-0 text-corpo text-grafite">Só quem administra a regra pode alterá-la.</p>}
      {canManage && (
        <Card as="section" aria-labelledby="rule-edit-title" className="flex flex-col gap-4">
          <h3 id="rule-edit-title" className="m-0 text-h3 font-semibold text-navy">Alterar a regra</h3>
          <form className="flex flex-col gap-4" noValidate onSubmit={(event) => void save(event)}>
            <div className="grid gap-4 tablet:grid-cols-3">
              <TextField label="Distância máxima (m)" inputMode="numeric" value={form.distance} error={errors.distance_m}
                help={`De ${RULE_RANGES.distance_m.min} a ${RULE_RANGES.distance_m.max} m`} onChange={(e) => setForm({ ...form, distance: e.target.value })} />
              <TextField label="Tempo máximo da posição (s)" inputMode="numeric" value={form.age} error={errors.max_age_s}
                help={`De ${RULE_RANGES.max_age_s.min} a ${RULE_RANGES.max_age_s.max} s (${minutes(RULE_RANGES.max_age_s.min)} a ${minutes(RULE_RANGES.max_age_s.max)})`}
                onChange={(e) => setForm({ ...form, age: e.target.value })} />
              <TextField label="Precisão de até (m)" inputMode="numeric" value={form.accuracy} error={errors.max_accuracy_m}
                help={`Posições menos precisas ficam fora da comparação. De ${RULE_RANGES.max_accuracy_m.min} a ${RULE_RANGES.max_accuracy_m.max} m`}
                onChange={(e) => setForm({ ...form, accuracy: e.target.value })} />
            </div>
            {preview && (
              <p className="m-0 rounded-card bg-info-fundo p-4 text-corpo text-azul-profundo">
                Com estes valores: {ruleSentence(preview).replace(/^A/, 'a')}
              </p>
            )}
            <TextField label="Justificativa" value={form.justification} error={errors.justification} maxLength={500}
              help="Por que a regra muda. Fica registrada na auditoria." onChange={(e) => setForm({ ...form, justification: e.target.value })} />
            {failure && <Alert variant="erro">{failure}</Alert>}
            {!online && <p className="m-0 text-corpo text-grafite">Sem conexão: a regra só pode ser alterada online.</p>}
            <div><Button type="submit" disabled={!online || saving} loading={saving} loadingLabel="Salvando…">Salvar nova regra</Button></div>
          </form>
        </Card>
      )}
    </div>
  );
}

export function ProximityRulePage(): React.JSX.Element {
  const { client, config, result } = useConnectivity();
  const online = useOnlineStatus();
  const { activeOrganizationId } = useTenant();
  const { permissions } = usePermissions();
  const endpoint = config?.endpoints.find((candidate) => candidate.kind === result.selectedEndpoint);
  const service = useMemo(() => (endpoint && client ? new ProximityRuleService(createTrackingTransport(endpoint, client), () => navigator.onLine !== false) : null), [client, endpoint]);
  const organizationId = activeOrganizationId ?? '';
  return (
    <AccessGate permission="tracking.read">
      <ProximityRuleScreen key={organizationId} service={service} organizationId={organizationId} online={online}
        canManage={permissions?.tenant.includes('proximity_rule.manage') ?? false} />
    </AccessGate>
  );
}
