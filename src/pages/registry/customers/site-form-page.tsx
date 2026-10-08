import React, { useEffect, useRef, useState } from 'react';
import type { GeocodingService } from '@/application/registry/geocoding-service';
import type { PostalAddressView, PostalCodeService } from '@/application/registry/postal-code-service';
import type { RegistryFailure, RegistryOutcome, RegistryService } from '@/application/registry/registry-service';
import type { SiteDetail } from '@/application/registry/registry-views';
import { resolveRegistryRoute } from '@/app/registry/registry-routes';
import { Alert, Button, ErrorState, Field, FormSection, Loading, Select, TextField } from '@/design-system';
import { textareaClass } from '@/components/identity/confirmation-dialog';
import { type FieldErrors, validateSiteForm } from '@/domain/registry/registry-validation';
import { UFS } from '@/domain/registry/registry-vocabulary';
import { AccessGate } from '@/pages/cylinders/components/access-gate';
import { CoordinatesField } from '../components/coordinates-field';
import { addressKeyOf, type GeocodeSuggestion } from '../components/geocode-suggestion';
import { PostalCodeField } from '../components/postal-code-field';
import { ReceivingWindowField } from '../components/receiving-window-field';
import { FormActions, FormCancel, FormCard, FormHeader } from '../components/form-modal';
import { useFormModal } from '../components/form-modal-context';
import { useRegistryService } from '../use-registry-service';

const defaultNavigate = (path: string): void => window.location.assign(path);

interface Values {
  name: string; postalCode: string; street: string; number: string; complement: string; district: string; city: string; state: string; ibgeCode: string;
  latitude: string; longitude: string; receivingContactName: string; receivingContactPhone: string; receivingDays: number[]; receivingFrom: string;
  receivingTo: string; accessInstructions: string;
}
const EMPTY: Values = {
  name: '', postalCode: '', street: '', number: '', complement: '', district: '', city: '', state: '', ibgeCode: '', latitude: '', longitude: '',
  receivingContactName: '', receivingContactPhone: '', receivingDays: [], receivingFrom: '', receivingTo: '', accessInstructions: '',
};

const SERVER_FIELDS: Record<string, string> = {
  name: 'name', postal_code: 'postalCode', street: 'street', number: 'number', complement: 'complement', district: 'district', city: 'city', state: 'state',
  ibge_code: 'ibgeCode', latitude: 'latitude', longitude: 'longitude', receiving_contact_name: 'receivingContactName',
  receiving_contact_phone: 'receivingContactPhone', receiving_days: 'receivingDays', receiving_from: 'receivingFrom', receiving_to: 'receivingTo',
  access_instructions: 'accessInstructions',
};

const fromDetail = (detail: SiteDetail): Values => ({
  name: detail.site.name, postalCode: detail.site.postalCode, street: detail.site.street, number: detail.site.number, complement: detail.site.complement ?? '',
  district: detail.site.district ?? '', city: detail.site.city, state: detail.site.state, ibgeCode: detail.site.ibgeCode ?? '',
  latitude: detail.site.latitude === null ? '' : String(detail.site.latitude), longitude: detail.site.longitude === null ? '' : String(detail.site.longitude),
  receivingContactName: detail.site.receivingContactName ?? '', receivingContactPhone: detail.site.receivingContactPhone ?? '',
  receivingDays: detail.site.receivingDays, receivingFrom: (detail.site.receivingFrom ?? '').slice(0, 5), receivingTo: (detail.site.receivingTo ?? '').slice(0, 5),
  accessInstructions: detail.site.accessInstructions ?? '',
});

type Banner = { variant: 'erro' | 'sucesso' | 'informacao' | 'alerta'; title?: string; message: string; recarregar?: boolean };
type Load = 'loading' | 'ready' | 'not_found' | 'error';

export interface SiteFormViewProps {
  organizationId: string;
  service: RegistryService | null;
  postal: PostalCodeService | null;
  // Busca de coordenadas pelo endereço (RF-065); ausente, só a digitação manual fica disponível.
  geocoder?: GeocodingService | null;
  online: boolean;
  customerId: string;
  // Presente na edição; ausente no cadastro.
  siteId?: string;
  onNavigate?: (path: string) => void;
}

export function SiteFormView({ organizationId, service, postal, geocoder = null, online, customerId, siteId, onNavigate = defaultNavigate }: SiteFormViewProps): React.JSX.Element {
  const modal = useFormModal();
  const navigateTo = modal?.embedded ? modal.navigate : onNavigate;
  const editing = siteId !== undefined;
  const [detail, setDetail] = useState<SiteDetail | null>(null);
  const [load, setLoad] = useState<Load>(editing ? 'loading' : 'ready');
  const [values, setValues] = useState<Values>(EMPTY);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [errorTick, setErrorTick] = useState(0);
  const [banner, setBanner] = useState<Banner | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [suggestion, setSuggestion] = useState<GeocodeSuggestion | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const bannerRef = useRef<HTMLDivElement>(null);
  const numberRef = useRef<HTMLInputElement>(null);

  const applyDetail = (outcome: RegistryOutcome<SiteDetail>): void => {
    if (outcome.kind === 'success') { setDetail(outcome.value); setValues(fromDetail(outcome.value)); setLoad('ready'); }
    else setLoad(outcome.kind === 'not_found' ? 'not_found' : 'error');
  };
  const reloadDetail = async (): Promise<void> => {
    if (!service || siteId === undefined) return;
    setLoad('loading');
    applyDetail(await service.getSite(organizationId, siteId));
  };
  useEffect(() => {
    if (!service || siteId === undefined) return undefined;
    let active = true;
    void service.getSite(organizationId, siteId).then((outcome) => { if (active) applyDetail(outcome); });
    return () => { active = false; };
  }, [service, organizationId, siteId]);
  useEffect(() => { if (banner) bannerRef.current?.focus(); }, [banner]);
  useEffect(() => {
    if (errorTick === 0) return;
    formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [errorTick]);

  const set = (field: keyof Omit<Values, 'receivingDays'>) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>): void => {
    setValues((current) => ({ ...current, [field]: event.target.value }));
  };
  const fail = (next: FieldErrors): void => { setErrors(next); setErrorTick((tick) => tick + 1); };

  // O preenchimento pelo CEP troca só o que veio preenchido do provedor; número, complemento e o que a pessoa digitou ficam (RF-011).
  const applyAddress = (address: PostalAddressView): void => {
    setValues((current) => ({
      ...current, postalCode: address.postalCode || current.postalCode, street: address.street || current.street, district: address.district || current.district,
      city: address.city || current.city, state: address.state || current.state, ibgeCode: address.ibgeCode ?? current.ibgeCode,
    }));
  };

  const handleFailure = (failure: RegistryFailure): void => {
    switch (failure.kind) {
      case 'name_conflict':
        return fail({ name: 'Já existe uma unidade com este nome neste cliente.' });
      case 'invalid': {
        const mapped: FieldErrors = {};
        for (const [field, message] of Object.entries(failure.fields ?? {})) mapped[SERVER_FIELDS[field] ?? 'form'] = message;
        if (Object.keys(mapped).length > 0 && !('form' in mapped)) return fail(mapped);
        return setBanner({ variant: 'erro', message: 'Revise os dados informados e tente de novo.' });
      }
      case 'parent_inactive':
        return setBanner({ variant: 'erro', message: 'O cliente está inativo. Reative o cliente antes de acrescentar unidades.' });
      case 'version_conflict':
        return setBanner({ variant: 'erro', title: 'Unidade alterada', message: 'Esta unidade foi alterada por outra pessoa depois que você abriu a tela. Recarregue os dados para continuar.', recarregar: true });
      case 'inactive_record':
        return setBanner({ variant: 'erro', message: 'Esta unidade está inativa e não pode ser editada.' });
      case 'anonymized_record':
        return setBanner({ variant: 'erro', message: 'Os dados pessoais deste cliente foram anonimizados e a unidade não aceita edição.' });
      case 'access_denied':
      case 'mfa_required':
        return setBanner({ variant: 'erro', message: 'Você não tem permissão para esta ação.' });
      case 'offline':
        return setBanner({ variant: 'informacao', message: 'Sem conexão. Esta operação exige conexão e nada é guardado neste aparelho.' });
      case 'not_found':
        return setBanner({ variant: 'erro', message: 'Unidade ou cliente não encontrado.' });
      default:
        return setBanner({ variant: 'erro', title: 'Resultado desconhecido', message: 'Não foi possível confirmar se a operação foi concluída. Confira as unidades do cliente antes de tentar de novo: o nome da unidade não pode se repetir.' });
    }
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (!service || submitting || !online) return;
    setBanner(null);
    const result = validateSiteForm(values);
    if (!result.ok) return fail(result.errors);
    // Coordenadas vindas da busca só valem confirmadas (RF-066): sem confirmação a pessoa confirma ou apaga as coordenadas.
    const matches = suggestion !== null && suggestion.addressKey === addressKeyOf(values)
      && result.value.latitude === suggestion.location.latitude && result.value.longitude === suggestion.location.longitude;
    if (matches && !suggestion.confirmed) return fail({ coordinatesConfirmed: 'Confirme o endereço e o ponto, ou apague as coordenadas.' });
    const value = matches ? { ...result.value, coordinatesSource: 'geocoded' as const } : result.value;
    setErrors({});
    setSubmitting(true);
    let outcome: RegistryOutcome<{ id: string }>;
    if (editing && siteId !== undefined && detail) {
      const updated = await service.updateSite(organizationId, siteId, detail.site.version, value);
      outcome = updated.kind === 'success' ? { kind: 'success', value: { id: siteId } } : updated;
    } else {
      const created = await service.createSite(organizationId, customerId, value);
      outcome = created.kind === 'success' ? { kind: 'success', value: { id: created.value.id } } : created;
    }
    setSubmitting(false);
    if (outcome.kind === 'success') return navigateTo(`/clientes/${customerId}/unidades/${outcome.value.id}`);
    handleFailure(outcome);
  };

  const title = editing ? 'Editar unidade' : 'Cadastrar unidade';
  const back = editing && siteId ? `/clientes/${customerId}/unidades/${siteId}` : `/clientes/${customerId}`;

  if (!service) return <ErrorState title="Conexão indisponível" message="Não foi possível falar com o servidor agora." />;
  if (editing && load === 'not_found') return <ErrorState variant="sem-permissao" title="Unidade não encontrada" message="Ela não existe nesta organização." />;
  if (editing && load === 'error') return <ErrorState title="Não foi possível carregar a unidade" message="Tente novamente em instantes." onRetry={() => void reloadDetail()} />;
  if (editing && load === 'loading' && !detail) return <Loading variant="pagina" busy label="Carregando…" />;
  if (editing && detail && detail.site.status === 'inactive') {
    return (
      <section aria-labelledby="site-form-title" className="flex flex-col gap-6">
        <h2 id="site-form-title" className="text-h2 font-bold text-navy">{title}</h2>
        <Alert variant="erro">Esta unidade está inativa e não pode ser editada. <a className="font-semibold underline" href={back}>Voltar</a></Alert>
      </section>
    );
  }

  return (
    <section aria-labelledby={modal?.embedded ? undefined : "site-form-title"} className="flex flex-col gap-6">
      <FormHeader titleId="site-form-title" eyebrow="Clientes" title={title} description={editing ? 'Altere o endereço e o recebimento da unidade.' : 'Informe o CEP: o endereço é preenchido sozinho, e você sempre pode digitar tudo.'} />

      {!online && <Alert variant="informacao">Sem conexão. Esta operação exige conexão e nada é guardado neste aparelho. Dá para preencher o formulário, mas o envio e a busca de CEP ficam desabilitados.</Alert>}
      {banner && (
        <Alert ref={bannerRef} tabIndex={-1} variant={banner.variant} {...(banner.title ? { title: banner.title } : {})}>
          <p>{banner.message}</p>
          {banner.recarregar && <Button variant="secundario" className="mt-2" onClick={() => { setBanner(null); void reloadDetail(); }}>Recarregar dados</Button>}
        </Alert>
      )}

      <FormCard>
        <form ref={formRef} noValidate onSubmit={(event) => void submit(event)} className="flex flex-col gap-6">
          <FormSection legend="Unidade" description="O nome identifica a unidade dentro do cliente.">
            <TextField label="Nome da unidade" name="name" value={values.name} onChange={set('name')} maxLength={120} autoComplete="off" error={errors.name} />
          </FormSection>

          <FormSection legend="Endereço" description="O CEP preenche logradouro, bairro, cidade e UF. O número e o complemento são sempre seus.">
            <PostalCodeField
              value={values.postalCode}
              onChange={(postalCode) => setValues((current) => ({ ...current, postalCode }))}
              organizationId={organizationId}
              service={postal}
              online={online}
              onAddress={applyAddress}
              onFound={() => numberRef.current?.focus()}
              error={errors.postalCode}
            />
            <div className="grid gap-4 tablet:grid-cols-6">
              <TextField label="Logradouro" name="street" value={values.street} onChange={set('street')} maxLength={120} autoComplete="off" error={errors.street} wrapperClassName="tablet:col-span-4" />
              <TextField ref={numberRef} label="Número" name="number" value={values.number} onChange={set('number')} maxLength={20} autoComplete="off" help="Use S/N se não houver." error={errors.number} wrapperClassName="tablet:col-span-2" />
              <TextField label="Complemento" name="complement" value={values.complement} onChange={set('complement')} maxLength={80} autoComplete="off" error={errors.complement} wrapperClassName="tablet:col-span-3" />
              <TextField label="Bairro" name="district" value={values.district} onChange={set('district')} maxLength={80} autoComplete="off" error={errors.district} wrapperClassName="tablet:col-span-3" />
              <TextField label="Cidade" name="city" value={values.city} onChange={set('city')} maxLength={80} autoComplete="off" error={errors.city} wrapperClassName="tablet:col-span-3" />
              <Select label="UF" name="state" value={values.state} onChange={set('state')} error={errors.state} className="tablet:col-span-1">
                <option value="" disabled>UF</option>
                {UFS.map((uf) => <option key={uf} value={uf}>{uf}</option>)}
              </Select>
              <TextField label="Código do município (IBGE)" name="ibgeCode" inputMode="numeric" value={values.ibgeCode} onChange={set('ibgeCode')} maxLength={7} error={errors.ibgeCode} wrapperClassName="tablet:col-span-2" />
            </div>
          </FormSection>

          <FormSection legend="Coordenadas" description="Opcional. Busque pelo endereço e confirme o ponto, ou informe latitude e longitude juntas, em graus decimais (por exemplo, -23,550520).">
            <CoordinatesField
              latitude={values.latitude}
              longitude={values.longitude}
              onCoordinates={(latitude, longitude) => setValues((current) => ({ ...current, latitude, longitude }))}
              address={{ street: values.street, number: values.number, district: values.district, city: values.city, state: values.state, postalCode: values.postalCode }}
              organizationId={organizationId}
              service={geocoder}
              online={online}
              suggestion={suggestion}
              onSuggestion={setSuggestion}
              saved={detail ? { source: detail.site.coordinatesSource, confirmedAt: detail.site.coordinatesConfirmedAt } : undefined}
              latitudeError={errors.latitude}
              longitudeError={errors.longitude}
              confirmationError={errors.coordinatesConfirmed}
            />
          </FormSection>

          <FormSection legend="Recebimento" description="Quem recebe, em quais dias e horários, e como chegar. Tudo opcional.">
            <div className="grid gap-4 tablet:grid-cols-2">
              <TextField label="Responsável pelo recebimento" name="receivingContactName" value={values.receivingContactName} onChange={set('receivingContactName')} maxLength={120} autoComplete="off" error={errors.receivingContactName} />
              <TextField label="Telefone do responsável" name="receivingContactPhone" inputMode="tel" value={values.receivingContactPhone} onChange={set('receivingContactPhone')} autoComplete="off" error={errors.receivingContactPhone} />
            </div>
            <ReceivingWindowField
              value={{ days: values.receivingDays, from: values.receivingFrom, to: values.receivingTo }}
              onChange={(window) => setValues((current) => ({ ...current, receivingDays: [...window.days], receivingFrom: window.from, receivingTo: window.to }))}
              error={errors.receivingDays ?? errors.receivingFrom ?? errors.receivingTo}
            />
            <Field label="Instruções de acesso" error={errors.accessInstructions}>
              {(control) => <textarea {...control} name="accessInstructions" rows={3} maxLength={500} value={values.accessInstructions} onChange={set('accessInstructions')} className={textareaClass} />}
            </Field>
          </FormSection>

          <FormActions>
            <Button type="submit" disabled={!online} loading={submitting} loadingLabel={editing ? 'Salvando…' : 'Cadastrando…'}>{editing ? 'Salvar alterações' : 'Cadastrar unidade'}</Button>
            <FormCancel href={back} />
          </FormActions>
        </form>
      </FormCard>
    </section>
  );
}

// Tela de cadastro ou edição de unidade: o portão confirma `customer.write` no servidor antes de montar o formulário.
export function SiteFormPage(): React.JSX.Element {
  const { service, postal, geocoder, organizationId, online } = useRegistryService();
  const route = resolveRegistryRoute(window.location.pathname);
  const params = route?.area === 'customers' && route.kind === 'site_new' ? { customerId: route.customerId }
    : route?.area === 'customers' && route.kind === 'site_edit' ? { customerId: route.customerId, siteId: route.siteId } : null;
  return (
    <AccessGate permission="customer.write">
      {params ? <SiteFormView key={`${organizationId}:${params.customerId}:${params.siteId ?? 'nova'}`} organizationId={organizationId} service={service} postal={postal} geocoder={geocoder} online={online} {...params} />
        : <ErrorState variant="sem-permissao" title="Página não encontrada" message="Este endereço não existe em Clientes." />}
    </AccessGate>
  );
}
