import React, { useEffect, useRef, useState } from 'react';
import type { RegistryFailure, RegistryOutcome, RegistryService } from '@/application/registry/registry-service';
import type { DriverDetail, LinkableUserView } from '@/application/registry/registry-views';
import { resolveRegistryRoute } from '@/app/registry/registry-routes';
import { Alert, Button, ErrorState, FormSection, Loading, Select, TextField } from '@/design-system';
import { type FieldErrors, validateDriverForm } from '@/domain/registry/registry-validation';
import { CNH_CATEGORIES } from '@/domain/registry/registry-vocabulary';
import { AccessGate } from '@/pages/cylinders/components/access-gate';
import { FormActions, FormCancel, FormCard, FormHeader } from '../components/form-modal';
import { useFormModal } from '../components/form-modal-context';
import { useRegistryService } from '../use-registry-service';

const defaultNavigate = (path: string): void => window.location.assign(path);

interface Values { fullName: string; cpf: string; cnhNumber: string; cnhCategory: string; cnhValidUntil: string; phone: string; justification: string; linkUserId: string }
const EMPTY: Values = { fullName: '', cpf: '', cnhNumber: '', cnhCategory: '', cnhValidUntil: '', phone: '', justification: '', linkUserId: '' };

const SERVER_FIELDS: Record<string, string> = {
  full_name: 'fullName', cpf: 'cpf', cnh_number: 'cnhNumber', cnh_category: 'cnhCategory', cnh_valid_until: 'cnhValidUntil', phone: 'phone', justification: 'justification',
};

// Na edição, o documento nunca vem preenchido: o formulário mostra só a máscara e o valor novo é opcional (RF-029, RF-031).
const fromDetail = (detail: DriverDetail): Values => ({
  ...EMPTY, fullName: detail.driver.fullName, cnhCategory: detail.driver.cnhCategory, cnhValidUntil: detail.driver.cnhValidUntil, phone: detail.driver.phone ?? '',
});

type Banner = { variant: 'erro' | 'sucesso' | 'informacao' | 'alerta'; title?: string; message: string; recarregar?: boolean };
type Load = 'loading' | 'ready' | 'not_found' | 'error';

export interface DriverFormViewProps {
  organizationId: string;
  service: RegistryService | null;
  online: boolean;
  // Presente na edição; ausente no cadastro.
  driverId?: string | undefined;
  onNavigate?: (path: string) => void;
}

export function DriverFormView({ organizationId, service, online, driverId, onNavigate = defaultNavigate }: DriverFormViewProps): React.JSX.Element {
  const modal = useFormModal();
  const navigateTo = modal?.embedded ? modal.navigate : onNavigate;
  const editing = driverId !== undefined;
  const [detail, setDetail] = useState<DriverDetail | null>(null);
  const [load, setLoad] = useState<Load>(editing ? 'loading' : 'ready');
  const [values, setValues] = useState<Values>(EMPTY);
  const [users, setUsers] = useState<LinkableUserView[]>([]);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [errorTick, setErrorTick] = useState(0);
  const [owner, setOwner] = useState<{ id: string; label: string } | null>(null);
  const [banner, setBanner] = useState<Banner | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const bannerRef = useRef<HTMLDivElement>(null);

  const apply = (outcome: RegistryOutcome<DriverDetail>): void => {
    if (outcome.kind === 'success') { setDetail(outcome.value); setValues(fromDetail(outcome.value)); setLoad('ready'); }
    else setLoad(outcome.kind === 'not_found' ? 'not_found' : 'error');
  };
  const reload = async (): Promise<void> => {
    if (!service || driverId === undefined) return;
    setLoad('loading');
    apply(await service.getDriver(organizationId, driverId));
  };
  useEffect(() => {
    if (!service || driverId === undefined) return undefined;
    let active = true;
    void service.getDriver(organizationId, driverId).then((outcome) => { if (active) apply(outcome); });
    return () => { active = false; };
  }, [service, organizationId, driverId]);
  // Usuários vinculáveis para o vínculo opcional do cadastro.
  useEffect(() => {
    if (!service || editing) return undefined;
    let active = true;
    void service.listLinkableUsers(organizationId).then((outcome) => { if (active && outcome.kind === 'success') setUsers(outcome.value); });
    return () => { active = false; };
  }, [service, organizationId, editing]);
  useEffect(() => { if (banner) bannerRef.current?.focus(); }, [banner]);
  useEffect(() => {
    if (errorTick === 0) return;
    formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [errorTick]);

  const set = (field: keyof Values) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>): void => {
    setValues((current) => ({ ...current, [field]: event.target.value }));
  };
  const fail = (next: FieldErrors): void => { setErrors(next); setErrorTick((tick) => tick + 1); };

  const handleFailure = (failure: RegistryFailure): void => {
    switch (failure.kind) {
      case 'document_conflict': {
        if (failure.owner) setOwner(failure.owner);
        const field = failure.conflictField === 'cnh_number' ? 'cnhNumber' : 'cpf';
        const name = failure.owner?.label ? ` em ${failure.owner.label}` : '';
        return fail({ [field]: `Este ${field === 'cpf' ? 'CPF' : 'número de CNH'} já está cadastrado${name}.` });
      }
      case 'justification_required':
        return fail({ justification: 'Explique a correção do documento em 5 a 500 caracteres.' });
      case 'invalid': {
        const mapped: FieldErrors = {};
        for (const [field, message] of Object.entries(failure.fields ?? {})) mapped[SERVER_FIELDS[field] ?? 'form'] = message;
        if (Object.keys(mapped).length > 0 && !('form' in mapped)) return fail(mapped);
        return setBanner({ variant: 'erro', message: 'Revise os dados informados e tente de novo.' });
      }
      case 'version_conflict':
        return setBanner({ variant: 'erro', title: 'Motorista alterado', message: 'Este motorista foi alterado por outra pessoa depois que você abriu a tela. Recarregue os dados para continuar.', recarregar: true });
      case 'inactive_record':
        return setBanner({ variant: 'erro', message: 'Este motorista está inativo e não pode ser editado.' });
      case 'anonymized_record':
        return setBanner({ variant: 'erro', message: 'Os dados pessoais deste motorista foram anonimizados e ele não aceita edição.' });
      case 'access_denied':
      case 'mfa_required':
        return setBanner({ variant: 'erro', message: 'Você não tem permissão para esta ação.' });
      case 'offline':
        return setBanner({ variant: 'informacao', message: 'Sem conexão. Esta operação exige conexão e nada é guardado neste aparelho.' });
      case 'not_found':
        return setBanner({ variant: 'erro', message: 'Motorista não encontrado.' });
      default:
        return setBanner({ variant: 'erro', title: 'Resultado desconhecido', message: 'Não foi possível confirmar se a operação foi concluída. Confira a lista de motoristas antes de tentar de novo: o CPF não permite cadastro em duplicidade.' });
    }
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (!service || submitting || !online) return;
    setBanner(null);
    setOwner(null);
    const result = validateDriverForm(values, editing ? 'edit' : 'create');
    if (!result.ok) return fail(result.errors);
    setErrors({});
    setSubmitting(true);
    let outcome: RegistryOutcome<{ id: string }>;
    if (editing && detail) {
      const updated = await service.updateDriver(organizationId, detail.driver.id, detail.driver.version, result.value);
      outcome = updated.kind === 'success' ? { kind: 'success', value: { id: detail.driver.id } } : updated;
    } else {
      const created = await service.createDriver(organizationId, result.value);
      outcome = created.kind === 'success' ? { kind: 'success', value: { id: created.value.id } } : created;
      // O vínculo é opcional e vem depois do cadastro: se falhar, o motorista já existe e a tela de detalhe permite tentar de novo.
      if (outcome.kind === 'success' && values.linkUserId !== '') await service.linkDriverUser(organizationId, outcome.value.id, values.linkUserId);
    }
    setSubmitting(false);
    if (outcome.kind === 'success') return navigateTo(`/motoristas/${outcome.value.id}`);
    handleFailure(outcome);
  };

  const title = editing ? 'Editar motorista' : 'Cadastrar motorista';

  if (!service) return <ErrorState title="Conexão indisponível" message="Não foi possível falar com o servidor agora." />;
  if (editing && load === 'not_found') return <ErrorState variant="sem-permissao" title="Motorista não encontrado" message="Ele não existe nesta organização." />;
  if (editing && load === 'error') return <ErrorState title="Não foi possível carregar o motorista" message="Tente novamente em instantes." onRetry={() => void reload()} />;
  if (editing && load === 'loading' && !detail) return <Loading variant="pagina" busy label="Carregando…" />;
  if (editing && detail && (detail.driver.status === 'inactive' || detail.driver.anonymizedAt !== null)) {
    return (
      <section aria-labelledby="driver-form-title" className="flex flex-col gap-6">
        <h2 id="driver-form-title" className="text-h2 font-bold text-navy">{title}</h2>
        <Alert variant="erro">Este motorista está inativo e não pode ser editado. <a className="font-semibold underline" href={`/motoristas/${detail.driver.id}`}>Abrir o motorista</a></Alert>
      </section>
    );
  }

  const documentGiven = values.cpf.trim() !== '' || values.cnhNumber.trim() !== '';

  return (
    <section aria-labelledby={modal?.embedded ? undefined : "driver-form-title"} className="flex flex-col gap-6">
      <FormHeader titleId="driver-form-title" eyebrow="Motoristas" title={title} description={editing ? 'Altere os dados do motorista. Cada edição entra no histórico.' : 'Informe o motorista, o CPF e a CNH. Os documentos aparecem sempre mascarados depois do cadastro.'} />

      {!online && <Alert variant="informacao">Sem conexão. Esta operação exige conexão e nada é guardado neste aparelho.</Alert>}
      {banner && (
        <Alert ref={bannerRef} tabIndex={-1} variant={banner.variant} {...(banner.title ? { title: banner.title } : {})}>
          <p>{banner.message}</p>
          {banner.recarregar && <Button variant="secundario" className="mt-2" onClick={() => { setBanner(null); void reload(); }}>Recarregar dados</Button>}
        </Alert>
      )}

      <FormCard>
        <form ref={formRef} noValidate onSubmit={(event) => void submit(event)} className="flex flex-col gap-6">
          <FormSection legend="Identificação">
            <div className="grid gap-4 tablet:grid-cols-2">
              <TextField label="Nome completo" name="fullName" value={values.fullName} onChange={set('fullName')} maxLength={160} autoComplete="off" error={errors.fullName} />
              <TextField label="Telefone" name="phone" inputMode="tel" value={values.phone} onChange={set('phone')} autoComplete="off" error={errors.phone} help="Com DDD." />
            </div>
          </FormSection>

          <FormSection legend="Documentos" description={editing ? 'O CPF e a CNH atuais ficam protegidos. Para corrigir, digite o valor novo e a justificativa; em branco, nada muda.' : 'Só números; ponto e hífen são aceitos.'}>
            <div className="grid gap-4 tablet:grid-cols-2">
              <TextField label="CPF" name="cpf" inputMode="numeric" value={values.cpf} onChange={set('cpf')} maxLength={14} autoComplete="off" error={errors.cpf}
                {...(editing && detail ? { placeholder: detail.driver.cpfDisplay } : {})} />
              <TextField label="Número da CNH" name="cnhNumber" inputMode="numeric" value={values.cnhNumber} onChange={set('cnhNumber')} maxLength={11} autoComplete="off" error={errors.cnhNumber}
                help="11 dígitos." {...(editing && detail ? { placeholder: detail.driver.cnhDisplay } : {})} />
              {owner && <a className="text-corpo font-semibold text-azul-profundo underline tablet:col-span-2" href={`/motoristas/${owner.id}`}>Abrir o motorista que usa este documento</a>}
              {editing && documentGiven && <TextField label="Justificativa da correção do documento" name="justification" value={values.justification} onChange={set('justification')} maxLength={500} error={errors.justification} wrapperClassName="tablet:col-span-2" />}
            </div>
          </FormSection>

          <FormSection legend="Habilitação" description="A situação da CNH (em dia, a vencer ou vencida) é calculada pela validade.">
            <div className="grid gap-4 tablet:grid-cols-2">
              <Select label="Categoria da CNH" name="cnhCategory" value={values.cnhCategory} onChange={set('cnhCategory')} error={errors.cnhCategory}>
                <option value="" disabled>Selecione a categoria</option>
                {CNH_CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}
              </Select>
              <TextField label="Validade da CNH" name="cnhValidUntil" type="date" value={values.cnhValidUntil} onChange={set('cnhValidUntil')} error={errors.cnhValidUntil} />
            </div>
          </FormSection>

          {!editing && (
            <FormSection legend="Usuário do aplicativo" description="Opcional. Só usuários ativos com o papel de motorista e ainda sem cadastro aparecem aqui.">
              <Select label="Usuário vinculado" name="linkUserId" value={values.linkUserId} onChange={set('linkUserId')}>
                <option value="">Não vincular agora</option>
                {users.map((user) => <option key={user.id} value={user.id}>{user.displayName}</option>)}
              </Select>
            </FormSection>
          )}

          <FormActions>
            <Button type="submit" disabled={!online} loading={submitting} loadingLabel={editing ? 'Salvando…' : 'Cadastrando…'}>{editing ? 'Salvar alterações' : 'Cadastrar motorista'}</Button>
            <FormCancel href={editing && driverId ? `/motoristas/${driverId}` : '/motoristas'} />
          </FormActions>
        </form>
      </FormCard>
    </section>
  );
}

// Tela de cadastro ou edição: o portão confirma `driver.write` no servidor antes de montar o formulário.
export function DriverFormPage(): React.JSX.Element {
  const { service, organizationId, online } = useRegistryService();
  const route = resolveRegistryRoute(window.location.pathname);
  const driverId = route?.area === 'drivers' && route.kind === 'edit' ? route.id : undefined;
  return (
    <AccessGate permission="driver.write">
      <DriverFormView key={`${organizationId}:${driverId ?? 'novo'}`} organizationId={organizationId} service={service} online={online} driverId={driverId} />
    </AccessGate>
  );
}
