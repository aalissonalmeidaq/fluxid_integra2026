import React, { useEffect, useRef, useState } from 'react';
import type { RegistryFailure, RegistryOutcome, RegistryService } from '@/application/registry/registry-service';
import type { CustomerDetail } from '@/application/registry/registry-views';
import { resolveRegistryRoute } from '@/app/registry/registry-routes';
import { Alert, Button, ErrorState, Field, FormSection, Loading, Select, TextField } from '@/design-system';
import { textareaClass } from '@/components/identity/confirmation-dialog';
import {
  type ContactInput, type FieldErrors, validateCustomerForm, validateJustification,
} from '@/domain/registry/registry-validation';
import { formatCnpj } from '@/domain/registry/masks';
import { PERSON_TYPE_LABELS, PERSON_TYPES, SEGMENT_LABELS, SEGMENTS } from '@/domain/registry/registry-vocabulary';
import { AccessGate } from '@/pages/cylinders/components/access-gate';
import { ContactListEditor } from '../components/contact-list-editor';
import { DocumentField } from '../components/document-field';
import { FormActions, FormCancel, FormCard, FormHeader } from '../components/form-modal';
import { useFormModal } from '../components/form-modal-context';
import { useRegistryService } from '../use-registry-service';

const defaultNavigate = (path: string): void => window.location.assign(path);

interface Values {
  personType: string; document: string; legalName: string; tradeName: string; segment: string; segmentDetail: string; notes: string;
  justification: string; contacts: ContactInput[];
}
// Valores fictícios válidos, só para a validação dos demais campos quando o documento é mantido; nunca saem do navegador.
const KEEP_CPF = '52998224725';
const KEEP_CNPJ = '11222333000181';
const EMPTY: Values = { personType: '', document: '', legalName: '', tradeName: '', segment: '', segmentDetail: '', notes: '', justification: '', contacts: [] };

// Campos do contrato (snake_case) e o campo do formulário que cada um acende.
const SERVER_FIELDS: Record<string, string> = {
  person_type: 'personType', document: 'document', legal_name: 'legalName', trade_name: 'tradeName', segment: 'segment', segment_detail: 'segmentDetail',
  notes: 'notes', contacts: 'contacts', justification: 'justification',
};
const serverField = (field: string): string => {
  const item = /^contacts\.(\d+)\.(\w+)$/.exec(field);
  return item ? field : SERVER_FIELDS[field] ?? 'form';
};

const fromDetail = (detail: CustomerDetail): Values => ({
  personType: detail.customer.personType, document: '', legalName: detail.customer.legalName, tradeName: detail.customer.tradeName ?? '',
  segment: detail.customer.segment, segmentDetail: detail.customer.segmentDetail ?? '', notes: detail.customer.notes ?? '', justification: '',
  contacts: detail.contacts.filter((contact) => contact.anonymizedAt === null)
    .map((contact) => ({ name: contact.name, role: contact.role ?? '', phone: contact.phone ?? '', email: contact.email ?? '', isPrimary: contact.isPrimary })),
});

type Banner = { variant: 'erro' | 'sucesso' | 'informacao' | 'alerta'; title?: string; message: string; link?: { href: string; label: string }; recarregar?: boolean };
type Load = 'loading' | 'ready' | 'not_found' | 'error';

export interface CustomerFormViewProps {
  organizationId: string;
  service: RegistryService | null;
  online: boolean;
  // Presente na edição; ausente no cadastro.
  customerId?: string;
  onNavigate?: (path: string) => void;
}

export function CustomerFormView({ organizationId, service, online, customerId, onNavigate = defaultNavigate }: CustomerFormViewProps): React.JSX.Element {
  const modal = useFormModal();
  const navigateTo = modal?.embedded ? modal.navigate : onNavigate;
  const editing = customerId !== undefined;
  const [detail, setDetail] = useState<CustomerDetail | null>(null);
  const [load, setLoad] = useState<Load>(editing ? 'loading' : 'ready');
  const [values, setValues] = useState<Values>(EMPTY);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [errorTick, setErrorTick] = useState(0);
  const [owner, setOwner] = useState<{ id: string; label: string } | null>(null);
  const [banner, setBanner] = useState<Banner | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const bannerRef = useRef<HTMLDivElement>(null);

  const applyDetail = (outcome: RegistryOutcome<CustomerDetail>): void => {
    if (outcome.kind === 'success') { setDetail(outcome.value); setValues(fromDetail(outcome.value)); setLoad('ready'); }
    else setLoad(outcome.kind === 'not_found' ? 'not_found' : 'error');
  };
  const reloadDetail = async (): Promise<void> => {
    if (!service || customerId === undefined) return;
    setLoad('loading');
    applyDetail(await service.getCustomer(organizationId, customerId));
  };
  useEffect(() => {
    if (!service || customerId === undefined) return undefined;
    let active = true;
    void service.getCustomer(organizationId, customerId).then((outcome) => { if (active) applyDetail(outcome); });
    return () => { active = false; };
  }, [service, organizationId, customerId]);
  useEffect(() => { if (banner) bannerRef.current?.focus(); }, [banner]);
  useEffect(() => {
    if (errorTick === 0) return;
    formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [errorTick]);

  const set = (field: keyof Omit<Values, 'contacts'>) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>): void => {
    setValues((current) => ({ ...current, [field]: event.target.value }));
  };
  const fail = (next: FieldErrors): void => { setErrors(next); setErrorTick((tick) => tick + 1); };

  const handleFailure = (failure: RegistryFailure): void => {
    switch (failure.kind) {
      case 'document_conflict':
        if (failure.owner) setOwner(failure.owner);
        return fail({ document: failure.owner?.label ? `Este documento já está cadastrado em ${failure.owner.label}.` : 'Este documento já está cadastrado nesta organização.' });
      case 'invalid': {
        const mapped: FieldErrors = {};
        for (const [field, message] of Object.entries(failure.fields ?? {})) mapped[serverField(field)] = message;
        if (Object.keys(mapped).length > 0 && !('form' in mapped)) return fail(mapped);
        return setBanner({ variant: 'erro', message: 'Revise os dados informados e tente de novo.' });
      }
      case 'justification_required':
        return fail({ justification: 'Explique a correção do documento em 5 a 500 caracteres.' });
      case 'version_conflict':
        return setBanner({ variant: 'erro', title: 'Cliente alterado', message: 'Este cliente foi alterado por outra pessoa depois que você abriu a tela. Recarregue os dados para continuar.', recarregar: true });
      case 'inactive_record':
        return setBanner({ variant: 'erro', message: 'Este cliente está inativo e não pode ser editado.' });
      case 'anonymized_record':
        return setBanner({ variant: 'erro', message: 'Os dados pessoais deste cliente foram anonimizados e ele não aceita edição.' });
      case 'access_denied':
      case 'mfa_required':
        return setBanner({ variant: 'erro', message: 'Você não tem permissão para esta ação.' });
      case 'offline':
        return setBanner({ variant: 'informacao', message: 'Sem conexão. Esta operação exige conexão e nada é guardado neste aparelho.' });
      case 'not_found':
        return setBanner({ variant: 'erro', message: 'Cliente não encontrado.' });
      default:
        return setBanner({ variant: 'erro', title: 'Resultado desconhecido', message: 'Não foi possível confirmar se a operação foi concluída. Confira a lista de clientes antes de tentar de novo: o documento não permite cadastro em duplicidade.' });
    }
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (!service || submitting || !online) return;
    setBanner(null);
    setOwner(null);

    const documentGiven = values.document.trim() !== '';
    // Na edição, o documento em branco significa "manter o atual": a validação usa um valor de apoio (nunca enviado) para só
    // conferir os demais campos.
    const keepDocument = editing && !documentGiven;
    const placeholder = values.personType === 'individual' ? KEEP_CPF : KEEP_CNPJ;
    const result = validateCustomerForm({ ...values, document: keepDocument ? placeholder : values.document });
    const found: FieldErrors = result.ok ? {} : { ...result.errors };
    if (editing && documentGiven && !validateJustification(values.justification).ok) {
      found.justification = 'Explique a correção do documento em 5 a 500 caracteres.';
    }
    if (!result.ok || Object.keys(found).length > 0) return fail(found);
    setErrors({});

    setSubmitting(true);
    let outcome: RegistryOutcome<{ id: string }>;
    if (editing && customerId !== undefined && detail) {
      const updated = await service.updateCustomer(organizationId, customerId, detail.customer.version, {
        legalName: result.value.legalName, tradeName: result.value.tradeName, segment: result.value.segment, segmentDetail: result.value.segmentDetail,
        notes: result.value.notes, contacts: result.value.contacts, document: documentGiven ? result.value.document : null,
        justification: documentGiven ? values.justification.trim() : null,
      });
      outcome = updated.kind === 'success' ? { kind: 'success', value: { id: customerId } } : updated;
    } else {
      const created = await service.createCustomer(organizationId, result.value);
      outcome = created.kind === 'success' ? { kind: 'success', value: { id: created.value.id } } : created;
    }
    setSubmitting(false);
    if (outcome.kind === 'success') return navigateTo(`/clientes/${outcome.value.id}`);
    handleFailure(outcome);
  };

  const title = editing ? 'Editar cliente' : 'Cadastrar cliente';

  if (!service) return <ErrorState title="Conexão indisponível" message="Não foi possível falar com o servidor agora." />;
  if (editing && load === 'not_found') return <ErrorState variant="sem-permissao" title="Cliente não encontrado" message="Ele não existe nesta organização." />;
  if (editing && load === 'error') return <ErrorState title="Não foi possível carregar o cliente" message="Tente novamente em instantes." onRetry={() => void reloadDetail()} />;
  if (editing && load === 'loading' && !detail) return <Loading variant="pagina" busy label="Carregando…" />;
  if (editing && detail && detail.customer.status === 'inactive') {
    return (
      <section aria-labelledby="customer-form-title" className="flex flex-col gap-6">
        <h2 id="customer-form-title" className="text-h2 font-bold text-navy">{title}</h2>
        <Alert variant="erro">Este cliente está inativo e não pode ser editado. <a className="font-semibold underline" href={`/clientes/${detail.customer.id}`}>Abrir o cliente</a></Alert>
      </section>
    );
  }

  const personType = values.personType as '' | 'legal' | 'individual';
  const anonymizedContacts = detail ? detail.contacts.filter((contact) => contact.anonymizedAt !== null).length : 0;
  const contactErrors = Object.fromEntries(Object.entries(errors).filter(([field]) => field.startsWith('contacts')));

  return (
    <section aria-labelledby={modal?.embedded ? undefined : "customer-form-title"} className="flex flex-col gap-6">
      <FormHeader titleId="customer-form-title" eyebrow="Clientes" title={title} description={editing ? 'Altere os dados do cliente. Cada edição entra no histórico.' : 'Informe o cliente. As unidades e os endereços entram depois, no detalhe do cliente.'} />

      {!online && <Alert variant="informacao">Sem conexão. Esta operação exige conexão e nada é guardado neste aparelho.</Alert>}
      {banner && (
        <Alert ref={bannerRef} tabIndex={-1} variant={banner.variant} {...(banner.title ? { title: banner.title } : {})}>
          <p>{banner.message}</p>
          {banner.link && <a className="font-semibold underline" href={banner.link.href}>{banner.link.label}</a>}
          {banner.recarregar && <Button variant="secundario" className="mt-2" onClick={() => { setBanner(null); void reloadDetail(); }}>Recarregar dados</Button>}
        </Alert>
      )}

      <FormCard>
        <form ref={formRef} noValidate onSubmit={(event) => void submit(event)} className="flex flex-col gap-6">
          <FormSection legend="Identificação" description="O tipo de pessoa define o documento e não muda depois do cadastro.">
            <div className="grid gap-4 tablet:grid-cols-2">
              <Select label="Tipo de pessoa" name="personType" value={values.personType} onChange={set('personType')} disabled={editing} error={errors.personType}>
                <option value="" disabled>Selecione o tipo</option>
                {PERSON_TYPES.map((type) => <option key={type} value={type}>{PERSON_TYPE_LABELS[type]}</option>)}
              </Select>
              <DocumentField
                personType={personType}
                value={values.document}
                onChange={(document) => setValues((current) => ({ ...current, document }))}
                error={errors.document}
                {...(editing && detail ? { placeholder: detail.customer.personType === 'legal' ? formatCnpj(detail.customer.documentDisplay) : detail.customer.documentDisplay, help: 'Deixe em branco para manter o documento atual. Para corrigir, digite o novo valor e a justificativa.' } : {})}
              />
              {editing && values.document.trim() !== '' && (
                <TextField label="Justificativa da correção do documento" name="justification" value={values.justification} onChange={set('justification')} maxLength={500}
                  error={errors.justification} wrapperClassName="tablet:col-span-2" />
              )}
              {owner && <a className="text-corpo font-semibold text-azul-profundo underline tablet:col-span-2" href={`/clientes/${owner.id}`}>Abrir o cliente que usa este documento</a>}
              <TextField label={personType === 'individual' ? 'Nome' : 'Razão social'} name="legalName" value={values.legalName} onChange={set('legalName')} maxLength={160} autoComplete="off" error={errors.legalName} />
              <TextField label="Nome fantasia" name="tradeName" value={values.tradeName} onChange={set('tradeName')} maxLength={160} autoComplete="off" error={errors.tradeName} />
            </div>
          </FormSection>

          <FormSection legend="Segmento" description="Ajuda a organizar e filtrar a carteira de clientes.">
            <div className="grid gap-4 tablet:grid-cols-2">
              <Select label="Segmento" name="segment" value={values.segment} onChange={set('segment')} error={errors.segment}>
                <option value="" disabled>Selecione o segmento</option>
                {SEGMENTS.map((segment) => <option key={segment} value={segment}>{SEGMENT_LABELS[segment]}</option>)}
              </Select>
              {values.segment === 'other' && <TextField label="Qual segmento?" name="segmentDetail" value={values.segmentDetail} onChange={set('segmentDetail')} maxLength={60} error={errors.segmentDetail} />}
            </div>
          </FormSection>

          <FormSection legend="Contatos" description="Até 10 contatos, com um principal. Telefone e e-mail só aparecem para quem pode editar clientes.">
            <ContactListEditor contacts={values.contacts} onChange={(contacts) => setValues((current) => ({ ...current, contacts }))} errors={contactErrors} disabled={!online} />
            {anonymizedContacts > 0 && <p className="text-legenda text-texto-secundario">{anonymizedContacts} contato(s) anonimizado(s) permanecem no cadastro e não podem ser alterados.</p>}
          </FormSection>

          <FormSection legend="Observações">
            <Field label="Observações" error={errors.notes}>
              {(control) => <textarea {...control} name="notes" rows={3} maxLength={500} value={values.notes} onChange={set('notes')} className={textareaClass} />}
            </Field>
          </FormSection>

          <FormActions>
            <Button type="submit" disabled={!online} loading={submitting} loadingLabel={editing ? 'Salvando…' : 'Cadastrando…'}>{editing ? 'Salvar alterações' : 'Cadastrar cliente'}</Button>
            <FormCancel href={editing && customerId ? `/clientes/${customerId}` : '/clientes'} />
          </FormActions>
        </form>
      </FormCard>
    </section>
  );
}

// Tela de cadastro ou edição: o portão confirma `customer.write` no servidor antes de montar o formulário (RF-041).
export function CustomerFormPage(): React.JSX.Element {
  const { service, organizationId, online } = useRegistryService();
  const route = resolveRegistryRoute(window.location.pathname);
  const customerId = route?.area === 'customers' && route.kind === 'edit' ? route.id : undefined;
  return (
    <AccessGate permission="customer.write">
      <CustomerFormView key={`${organizationId}:${customerId ?? 'novo'}`} organizationId={organizationId} service={service} online={online} {...(customerId ? { customerId } : {})} />
    </AccessGate>
  );
}
