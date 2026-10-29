import React, { useCallback, useEffect, useId, useState } from 'react';
import type { CategoriesView, DeliveryView, EmailNotificationService, EmailOutcome, PreferenceView } from '@/application/tracking/email-notification-service';
import { Alert, Button, Card, ErrorState, FormSection, Loading } from '@/design-system';
import { formatDateTime } from '@/domain/cylinders/format';
import {
  categoryLabel, deliveryFailureText, deliveryStatusText, EMAIL_CATEGORIES, type EmailCategory,
} from '@/domain/tracking/email-notification-eligibility';
import { AccessGate } from '@/pages/cylinders/components/access-gate';
import { useEmailNotificationService } from './use-email-notification-service';

// Avisos por e-mail (Spec 015, T100; US6, RF-032 a RF-035). O administrador libera as categorias da empresa; cada pessoa escolhe receber só
// o que foi liberado e o que sua leitura alcança, e vê o motivo do que não está disponível; o detalhe do alerta mostra o estado de cada
// aviso sem destinatário. Tudo começa desligado; o resultado de salvar é anunciado num status. Nenhuma regra de envio mora aqui.

const DESCRIPTION: Record<EmailCategory, string> = {
  proximity_confirmed: 'Quando o cilindro se afasta do celular do motorista além da regra, em viagem ativa.',
  seal_high_critical: 'Quando abre um alerta de lacre de severidade alta ou crítica.',
  seal_recovered: 'Quando o lacre volta a comunicar depois de um alerta alto ou crítico.',
};
const REASON: Record<'not_released' | 'no_permission', string> = {
  not_released: 'A empresa ainda não liberou esta categoria.',
  no_permission: 'Sua conta não lê os alertas desta categoria.',
};
const toggle = (list: EmailCategory[], category: EmailCategory) =>
  (list.includes(category) ? list.filter((c) => c !== category) : [...list, category]);
const ordered = (list: EmailCategory[]) => EMAIL_CATEGORIES.filter((c) => list.includes(c));

function CategoryOption({ category, checked, disabled, reason, onChange }:
  { category: EmailCategory; checked: boolean; disabled?: boolean; reason?: string; onChange: () => void }): React.JSX.Element {
  const id = useId();
  return (
    <label htmlFor={id} className={`flex min-h-alvo items-start gap-2 rounded-controle border p-2 text-corpo ${disabled
      ? 'border-dashed border-borda-controle bg-cinza-gelo text-grafite' : 'border-borda-suave text-grafite'}`}>
      <input id={id} type="checkbox" className="mt-1 size-6 shrink-0" checked={checked} disabled={disabled} onChange={onChange}
        aria-describedby={reason ? `${id}-reason` : `${id}-description`} />
      <span className="flex flex-col gap-1">
        <span className="font-semibold text-navy">{categoryLabel(category)}</span>
        {reason
          ? <span id={`${id}-reason`} className="text-legenda text-texto-secundario">{reason}</span>
          : <span id={`${id}-description`} className="text-legenda text-texto-secundario">{DESCRIPTION[category]}</span>}
      </span>
    </label>
  );
}

type Load<T> = { kind: 'loading' } | { kind: 'ready'; value: T } | { kind: 'denied' } | { kind: 'error' };

export interface EmailScreenProps {
  service: EmailNotificationService | null;
  organizationId: string;
  online: boolean;
}

export function EmailCategoriesScreen({ service, organizationId, online }: EmailScreenProps): React.JSX.Element {
  const [load, setLoad] = useState<Load<number>>({ kind: 'loading' });
  const [draft, setDraft] = useState<EmailCategory[]>([]);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');
  const [failure, setFailure] = useState<string | null>(null);

  const apply = useCallback((outcome: EmailOutcome<CategoriesView>) => {
    if (outcome.kind === 'success') {
      setDraft(outcome.value.enabled);
      setLoad({ kind: 'ready', value: outcome.value.version });
    } else setLoad(outcome.kind === 'access_denied' ? { kind: 'denied' } : { kind: 'error' });
  }, []);
  const reload = async () => {
    if (service && organizationId) apply(await service.categories(organizationId));
  };

  useEffect(() => {
    if (!service || !organizationId) return undefined;
    let active = true;
    void service.categories(organizationId).then((outcome) => { if (active) apply(outcome); });
    return () => { active = false; };
  }, [service, organizationId, apply]);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!service || load.kind !== 'ready') return;
    setSaving(true);
    setFailure(null);
    const outcome = await service.setCategories(organizationId, ordered(draft), load.value, crypto.randomUUID());
    setSaving(false);
    if (outcome.kind === 'success') {
      setDraft(outcome.value.enabled);
      setLoad({ kind: 'ready', value: outcome.value.version });
      setStatus('Categorias salvas. Cada pessoa ainda precisa escolher receber.');
    } else if (outcome.kind === 'conflict') {
      setFailure('Outra pessoa alterou as categorias enquanto você editava. Carregamos a versão atual; revise e salve de novo.');
      await reload();
    } else setFailure(outcome.kind === 'access_denied' ? 'Sua conta não pode liberar categorias.' : 'Não foi possível salvar agora. Tente de novo.');
  };

  if (load.kind === 'loading') return <Loading variant="pagina" busy label="Carregando as categorias…" />;
  if (load.kind === 'denied') return <ErrorState variant="sem-permissao" title="Acesso negado" message="Sua conta não administra os avisos por e-mail." />;
  if (load.kind === 'error') return <ErrorState title="Não foi possível carregar as categorias" message="Tente novamente em instantes." onRetry={() => void reload()} />;
  return (
    <div className="flex w-full min-w-0 flex-col gap-6">
      <header className="flex flex-col gap-1">
        <a className="text-corpo text-azul-profundo underline" href="/rastreamento">Rastreamento</a>
        <h2 className="m-0 text-h3 font-semibold text-navy">Avisos por e-mail</h2>
        <p className="m-0 max-w-padrao text-corpo text-grafite">
          Libere o que a empresa pode avisar por e-mail. Ninguém recebe sem escolher em Meu perfil, e só recebe quem lê aquele tipo de alerta.
          Retirar uma categoria desliga a escolha de quem optou: se ela for liberada de novo, cada pessoa escolhe outra vez.
          O e-mail traz só o tipo, o cilindro ou lacre, o horário e o link para entrar no FluxID — nunca a localização.
        </p>
      </header>
      <Card as="section" aria-label="Categorias" className="flex flex-col gap-4">
        <form className="flex flex-col gap-4" onSubmit={(event) => void save(event)} noValidate>
          <FormSection legend="Categorias liberadas para a empresa">
            <div className="grid gap-2 tablet:grid-cols-3">
              {EMAIL_CATEGORIES.map((category) => (
                <CategoryOption key={category} category={category} checked={draft.includes(category)} onChange={() => setDraft(toggle(draft, category))} />
              ))}
            </div>
          </FormSection>
          <p role="status" aria-atomic="true" className="m-0 text-corpo font-semibold text-verde-acessivel">{status}</p>
          {failure && <Alert variant="erro">{failure}</Alert>}
          {!online && <p className="m-0 text-corpo text-grafite">Sem conexão: as categorias só podem ser alteradas online.</p>}
          <div><Button type="submit" disabled={!online || saving} loading={saving} loadingLabel="Salvando…">Salvar categorias</Button></div>
        </form>
      </Card>
    </div>
  );
}

export function EmailPreferencesScreen({ service, organizationId, online }: EmailScreenProps): React.JSX.Element {
  const titleId = useId();
  const [load, setLoad] = useState<Load<PreferenceView[]>>({ kind: 'loading' });
  const [draft, setDraft] = useState<EmailCategory[]>([]);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    if (!service || !organizationId) return undefined;
    let active = true;
    void service.myPreferences(organizationId).then((outcome) => {
      if (!active) return;
      if (outcome.kind === 'success') {
        setDraft(outcome.value.filter((p) => p.enabled).map((p) => p.category));
        setLoad({ kind: 'ready', value: outcome.value });
      } else setLoad(outcome.kind === 'access_denied' ? { kind: 'denied' } : { kind: 'error' });
    });
    return () => { active = false; };
  }, [service, organizationId]);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!service) return;
    setSaving(true);
    setFailure(null);
    const outcome = await service.setMyPreferences(organizationId, ordered(draft), crypto.randomUUID());
    setSaving(false);
    if (outcome.kind === 'success') {
      setDraft(outcome.value.filter((p) => p.enabled).map((p) => p.category));
      setLoad({ kind: 'ready', value: outcome.value });
      setStatus('Escolhas salvas.');
    } else setFailure(outcome.kind === 'not_allowed'
      ? 'Uma das categorias deixou de estar disponível para você. Recarregue a página e escolha de novo.'
      : 'Não foi possível salvar agora. Tente de novo.');
  };

  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-4">
      <h3 id={titleId} className="m-0 text-h3 font-semibold text-navy">Avisos por e-mail</h3>
      <p className="m-0 max-w-padrao text-corpo text-grafite">
        Receba por e-mail os eventos críticos que a empresa liberou. O e-mail traz só o tipo, o cilindro ou lacre, o horário e o link para entrar
        no FluxID, sem localização. Tudo começa desligado.
      </p>
      {load.kind === 'loading' && <Loading label="Carregando suas escolhas…" />}
      {(load.kind === 'error' || load.kind === 'denied') && <Alert variant="erro">Não foi possível carregar suas escolhas de e-mail agora.</Alert>}
      {load.kind === 'ready' && !load.value.some((p) => p.allowed) && (
        <p className="m-0 text-corpo text-grafite">Nenhum aviso por e-mail está disponível para você nesta empresa.</p>
      )}
      {load.kind === 'ready' && load.value.some((p) => p.allowed) && (
        <form className="flex flex-col gap-4" onSubmit={(event) => void save(event)} noValidate>
          <fieldset className="m-0 flex min-w-0 flex-col gap-2 border-0 p-0">
            <legend className="mb-2 text-corpo font-semibold text-grafite">Quero receber por e-mail</legend>
            {load.value.map((p) => (
              <CategoryOption key={p.category} category={p.category} checked={p.allowed && draft.includes(p.category)} disabled={!p.allowed}
                reason={p.reason ? REASON[p.reason] : undefined} onChange={() => setDraft(toggle(draft, p.category))} />
            ))}
          </fieldset>
          <p role="status" aria-atomic="true" className="m-0 text-corpo font-semibold text-verde-acessivel">{status}</p>
          {failure && <Alert variant="erro">{failure}</Alert>}
          {!online && <p className="m-0 text-legenda text-texto-secundario">Sem conexão: salve quando a conexão voltar.</p>}
          <div><Button type="submit" variant="secundario" disabled={!online || saving} loading={saving} loadingLabel="Salvando…">Salvar escolhas</Button></div>
        </form>
      )}
    </section>
  );
}

export function EmailDeliveriesPanel({ service, organizationId, alertId }: { service: EmailNotificationService | null; organizationId: string; alertId: string }):
  React.JSX.Element | null {
  const titleId = useId();
  const [items, setItems] = useState<DeliveryView[] | null>(null);

  useEffect(() => {
    if (!service || !organizationId) return undefined;
    let active = true;
    void service.deliveries(organizationId, alertId).then((outcome) => { if (active && outcome.kind === 'success') setItems(outcome.value); });
    return () => { active = false; };
  }, [service, organizationId, alertId]);

  if (items === null) return null;
  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-2">
      <h3 id={titleId} className="m-0 text-h3 font-semibold text-navy">Avisos por e-mail</h3>
      {items.length === 0 ? <p className="m-0 text-corpo text-grafite">Nenhum aviso por e-mail foi gerado para este alerta.</p> : (
        <ul aria-label="Avisos por e-mail deste alerta" className="m-0 flex list-none flex-col gap-2 p-0">
          {items.map((item, index) => {
            const reason = item.status === 'failed' || item.status === 'cancelled' || item.status === 'retry' ? deliveryFailureText(item.errorCode) : null;
            return (
              <li key={`${item.transition}-${index}`} className="rounded-controle border border-borda-suave p-2 text-corpo text-grafite">
                <span className="font-semibold">
                  {`${item.transition === 'recovered' ? 'Recuperação' : 'Abertura'}: ${deliveryStatusText(item.status)}${reason ? ` — ${reason}` : ''}`}
                </span>
                <span className="block text-legenda text-texto-secundario">{categoryLabel(item.category)} · {formatDateTime(item.sentAt ?? item.updatedAt)}</span>
              </li>
            );
          })}
        </ul>
      )}
      <p className="m-0 text-legenda text-texto-secundario">Uma falha no e-mail não altera, não encerra e não duplica o alerta.</p>
    </section>
  );
}

export function EmailCategoriesPage(): React.JSX.Element {
  const { service, organizationId, online } = useEmailNotificationService();
  return (
    <AccessGate permission="notification_category.manage">
      <EmailCategoriesScreen key={organizationId} service={service} organizationId={organizationId} online={online} />
    </AccessGate>
  );
}

export function MyEmailPreferences(): React.JSX.Element {
  const { service, organizationId, online } = useEmailNotificationService();
  return <EmailPreferencesScreen key={organizationId} service={service} organizationId={organizationId} online={online} />;
}

export function AlertEmailDeliveries({ alertId }: { alertId: string }): React.JSX.Element | null {
  const { service, organizationId } = useEmailNotificationService();
  return <EmailDeliveriesPanel service={service} organizationId={organizationId} alertId={alertId} />;
}
