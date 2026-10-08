import React, { useEffect, useRef, useState } from 'react';
import type { RegistryOutcome, RegistryService } from '@/application/registry/registry-service';
import type { CustomerDetail } from '@/application/registry/registry-views';
import { usePermissions } from '@/app/navigation/permissions-context';
import { resolveRegistryRoute } from '@/app/registry/registry-routes';
import { Alert, Card, ErrorState, Loading } from '@/design-system';
import { formatCnpj } from '@/domain/registry/masks';
import { PERSON_TYPE_LABELS, SEGMENT_LABELS } from '@/domain/registry/registry-vocabulary';
import { AccessGate } from '@/pages/cylinders/components/access-gate';
import { DetailBlock, secondaryLinkClass } from '../components/detail-list';
import { AnonymizeAction } from '../components/anonymize-action';
import { LifecycleActions } from '../components/lifecycle-actions';
import { RegistryHistory } from '../components/registry-history';
import { AnonymizedBadge, EntityStatusBadge } from '../components/status-badge';
import { primaryLinkClass } from '../components/registry-list';
import { RevealDocument } from '../components/reveal-document';
import { useRegistryService } from '../use-registry-service';

// O que a pessoa pode fazer neste cliente. A tela só oferece a ação; a decisão final é sempre do servidor (RF-041).
export interface CustomerAbilities { write: boolean; deactivate: boolean; document: boolean; history: boolean; anonymize: boolean }

export interface CustomerDetailViewProps {
  organizationId: string;
  service: RegistryService | null;
  online: boolean;
  customerId: string;
  can: CustomerAbilities;
}

type Load = 'loading' | 'ready' | 'not_found' | 'error';

const formatDate = (iso: string | null): string => (iso ? new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '');

export function CustomerDetailView({ organizationId, service, online, customerId, can }: CustomerDetailViewProps): React.JSX.Element {
  const [detail, setDetail] = useState<CustomerDetail | null>(null);
  const [load, setLoad] = useState<Load>('loading');
  const [notice, setNotice] = useState<string | null>(null);
  const noticeRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (notice) noticeRef.current?.focus(); }, [notice]);

  const apply = (outcome: RegistryOutcome<CustomerDetail>): void => {
    if (outcome.kind === 'success') { setDetail(outcome.value); setLoad('ready'); }
    else setLoad(outcome.kind === 'not_found' ? 'not_found' : 'error');
  };
  const reload = async (): Promise<void> => {
    if (!service) return;
    setLoad('loading');
    apply(await service.getCustomer(organizationId, customerId));
  };
  const refresh = async (): Promise<void> => {
    if (!service) return;
    const fresh = await service.getCustomer(organizationId, customerId);
    if (fresh.kind === 'success') setDetail(fresh.value);
  };
  useEffect(() => {
    if (!service) return undefined;
    let active = true;
    void service.getCustomer(organizationId, customerId).then((outcome) => { if (active) apply(outcome); });
    return () => { active = false; };
  }, [service, organizationId, customerId]);

  if (!service) return <ErrorState title="Conexão indisponível" message="Não foi possível falar com o servidor agora." />;
  if (load === 'not_found') return <ErrorState variant="sem-permissao" title="Cliente não encontrado" message="Ele não existe nesta organização." />;
  if (load === 'error') return <ErrorState title="Não foi possível carregar o cliente" message="Tente novamente em instantes." onRetry={() => void reload()} />;
  if (load === 'loading' || !detail) return <Loading variant="pagina" busy label="Carregando o cliente…" />;

  const { customer, contacts, sites } = detail;
  const anonymized = customer.anonymizedAt !== null;
  const canEdit = can.write && customer.status === 'active' && !anonymized;
  const document = customer.personType === 'legal' ? formatCnpj(customer.documentDisplay) : customer.documentDisplay;
  const segment = customer.segmentDetail ? `${SEGMENT_LABELS[customer.segment]}: ${customer.segmentDetail}` : SEGMENT_LABELS[customer.segment];

  return (
    <section aria-labelledby="customer-title" className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 tablet:flex-row tablet:items-start tablet:justify-between">
        <div className="min-w-0">
          <p className="text-legenda font-semibold uppercase text-azul-profundo"><a className="underline" href="/clientes">Clientes</a></p>
          <h2 id="customer-title" className="mt-1 break-words text-h2 font-bold text-navy">{customer.legalName}</h2>
          <p className="mt-2 flex flex-wrap items-center gap-2">
            <EntityStatusBadge status={customer.status} />
            {anonymized && <AnonymizedBadge />}
            <span className="text-corpo text-texto-secundario">{PERSON_TYPE_LABELS[customer.personType]}</span>
          </p>
        </div>
        {canEdit && <a className={`${secondaryLinkClass} tablet:shrink-0`} href={`/clientes/${customer.id}/editar`}>Editar cliente</a>}
      </div>

      {anonymized && (
        <p role="note" className="rounded-card border border-borda-suave bg-info-fundo p-4 text-corpo">
          Dados pessoais anonimizados em {formatDate(customer.anonymizedAt)}. Este cadastro não aceita mais edição.
        </p>
      )}

      {notice && <Alert ref={noticeRef} tabIndex={-1} variant="sucesso">{notice}</Alert>}
      <LifecycleActions
        name={customer.legalName}
        active={customer.status === 'active'}
        blocked={anonymized}
        canDeactivate={can.deactivate}
        online={online}
        labels={{
          inactivate: 'Inativar cliente', reactivate: 'Reativar cliente', inactivated: 'Cliente inativado.', reactivated: 'Cliente reativado. As unidades inativadas junto continuam inativas: reative cada uma à mão.',
          inactivateTitle: 'Inativar cliente', reactivateTitle: 'Reativar cliente', inactivateDescription: '', reactivateDescription: 'Só o cliente volta a ficar ativo; as unidades e geocercas inativadas junto continuam inativas. Explique o motivo: a ação fica no histórico e na auditoria.',
        }}
        cascade={{ scope: 'customer', preview: () => service.previewCustomerInactivation(organizationId, customer.id) }}
        inactivate={(justification, counts) => service.inactivateCustomer(organizationId, customer.id, justification, counts)}
        reactivate={(justification) => service.reactivateCustomer(organizationId, customer.id, justification)}
        onChanged={(message) => { setNotice(message); void refresh(); }}
      />

      {customer.personType === 'individual' && can.anonymize && !anonymized && (
        <AnonymizeAction
          subject="customer"
          name={customer.legalName}
          blockedReason={customer.status === 'active' ? 'Inative o cliente antes de anonimizar.' : null}
          online={online}
          anonymize={(request) => service.anonymizeCustomer(organizationId, customer.id, customer.version, request)}
          onDone={(result) => { setNotice(`Dados pessoais anonimizados em ${formatDate(result.anonymizedAt)}.`); void refresh(); }}
        />
      )}

      <DetailBlock
        title="Dados do cliente"
        titleId="customer-data-title"
        rows={[
          {
            label: customer.personType === 'legal' ? 'CNPJ' : 'CPF',
            value: customer.personType === 'legal' || anonymized ? document : (
              <RevealDocument label="CPF" masked={customer.documentDisplay} canReveal={can.document} disabled={!online}
                format={(value) => (value.length === 11 ? `${value.slice(0, 3)}.${value.slice(3, 6)}.${value.slice(6, 9)}-${value.slice(9)}` : value)}
                reveal={() => service.revealDocument(organizationId, 'customer', customer.id, 'cpf')} />
            ),
          },
          { label: 'Nome fantasia', value: customer.tradeName },
          { label: 'Segmento', value: segment },
          { label: 'Cadastrado em', value: formatDate(customer.createdAt) },
          { label: 'Observações', value: customer.notes },
        ]}
      />

      <Card>
        <section aria-labelledby="customer-contacts-title" className="flex flex-col gap-4">
          <h3 id="customer-contacts-title" className="text-h3 font-semibold text-navy">Contatos</h3>
          {contacts.length === 0 ? <p className="text-corpo text-texto-secundario">Nenhum contato informado.</p> : (
            <ul className="flex flex-col gap-4">
              {contacts.map((contact) => (
                <li key={contact.id} className="rounded-card border border-borda-suave p-4 text-corpo">
                  <p className="font-semibold text-navy">{contact.name}{contact.isPrimary ? ' (principal)' : ''}</p>
                  {contact.role && <p className="text-texto-secundario">{contact.role}</p>}
                  {contact.phone && <p>Telefone: {contact.phone}</p>}
                  {contact.email && <p className="break-all">E-mail: {contact.email}</p>}
                  {contact.anonymizedAt && <p className="text-legenda text-texto-secundario">Contato anonimizado</p>}
                  {can.anonymize && !contact.anonymizedAt && (
                    <div className="mt-2">
                      <AnonymizeAction
                        subject="contact"
                        name={contact.name}
                        label={`Anonimizar contato ${contact.name}`}
                        online={online}
                        anonymize={(request) => service.anonymizeContact(organizationId, contact.id, request)}
                        onDone={(result) => { setNotice(`Contato anonimizado em ${formatDate(result.anonymizedAt)}.`); void refresh(); }}
                      />
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </Card>

      <Card>
        <section aria-labelledby="customer-sites-title" className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 id="customer-sites-title" className="text-h3 font-semibold text-navy">Unidades</h3>
            {can.write && customer.status === 'active' && !anonymized && sites.length > 0 && <a className={secondaryLinkClass} href={`/clientes/${customer.id}/unidades/nova`}>Acrescentar unidade</a>}
          </div>
          {sites.length === 0 ? (
            <div className="flex flex-col items-start gap-4">
              <p className="text-corpo text-texto-secundario">Este cliente ainda não tem unidades.</p>
              {can.write && customer.status === 'active' && !anonymized && <a className={primaryLinkClass} href={`/clientes/${customer.id}/unidades/nova`}>Acrescentar a primeira unidade</a>}
            </div>
          ) : (
            <ul className="flex flex-col gap-4">
              {sites.map((site) => (
                <li key={site.id} className="flex flex-wrap items-center justify-between gap-2 rounded-card border border-borda-suave p-4 text-corpo">
                  <span className="min-w-0">
                    <a className="font-semibold text-azul-profundo underline" href={`/clientes/${customer.id}/unidades/${site.id}`}>{site.name}</a>
                    <span className="block text-legenda text-texto-secundario">{site.city}/{site.state} · {site.activeGeofences} {site.activeGeofences === 1 ? 'geocerca ativa' : 'geocercas ativas'}</span>
                  </span>
                  <EntityStatusBadge status={site.status} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </Card>

      {can.history && <RegistryHistory organizationId={organizationId} service={service} entityType="customer" entityId={customer.id} refreshKey={customer.version} />}
    </section>
  );
}

export function CustomerDetailPage(): React.JSX.Element {
  const { service, organizationId, online } = useRegistryService();
  const { permissions } = usePermissions();
  const route = resolveRegistryRoute(window.location.pathname);
  // Também vale com o formulário de edição aberto em modal por cima do detalhe.
  const customerId = route?.area !== 'customers' ? '' : route.kind === 'detail' || route.kind === 'edit' ? route.id : route.kind === 'site_new' ? route.customerId : '';
  const has = (code: string): boolean => permissions?.tenant.includes(code) ?? false;
  return (
    <AccessGate permission="customer.read">
      <CustomerDetailView
        key={`${organizationId}:${customerId}`}
        organizationId={organizationId}
        service={service}
        online={online}
        customerId={customerId}
        can={{ write: has('customer.write'), deactivate: has('customer.deactivate'), document: has('customer.document'), history: has('customer.history'), anonymize: has('customer.anonymize') }}
      />
    </AccessGate>
  );
}
