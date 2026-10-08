import React, { useEffect, useRef, useState } from 'react';
import type { RegistryFailure, RegistryOutcome, RegistryService } from '@/application/registry/registry-service';
import type { VehicleView } from '@/application/registry/registry-views';
import { resolveRegistryRoute } from '@/app/registry/registry-routes';
import { Alert, Button, ErrorState, FormSection, Loading, Select, TextField } from '@/design-system';
import { formatPlate, normalizePlate } from '@/domain/registry/plate';
import { type FieldErrors, validateVehicleForm } from '@/domain/registry/registry-validation';
import { VEHICLE_TYPE_LABELS, VEHICLE_TYPES } from '@/domain/registry/registry-vocabulary';
import { AccessGate } from '@/pages/cylinders/components/access-gate';
import { FormActions, FormCancel, FormCard, FormHeader } from '../components/form-modal';
import { useFormModal } from '../components/form-modal-context';
import { useRegistryService } from '../use-registry-service';

const defaultNavigate = (path: string): void => window.location.assign(path);

interface Values {
  plate: string; vehicleType: string; vehicleTypeDetail: string; brand: string; model: string; manufactureYear: string; capacityCylinders: string;
  maxLoadKg: string; licensingDueOn: string; justification: string;
}
const EMPTY: Values = { plate: '', vehicleType: '', vehicleTypeDetail: '', brand: '', model: '', manufactureYear: '', capacityCylinders: '', maxLoadKg: '', licensingDueOn: '', justification: '' };

const SERVER_FIELDS: Record<string, string> = {
  plate: 'plate', vehicle_type: 'vehicleType', vehicle_type_detail: 'vehicleTypeDetail', brand: 'brand', model: 'model', manufacture_year: 'manufactureYear',
  capacity_cylinders: 'capacityCylinders', max_load_kg: 'maxLoadKg', licensing_due_on: 'licensingDueOn', justification: 'justification',
};

const fromView = (vehicle: VehicleView): Values => ({
  plate: formatPlate(vehicle.plate), vehicleType: vehicle.vehicleType, vehicleTypeDetail: vehicle.vehicleTypeDetail ?? '', brand: vehicle.brand ?? '', model: vehicle.model ?? '',
  manufactureYear: vehicle.manufactureYear === null ? '' : String(vehicle.manufactureYear), capacityCylinders: String(vehicle.capacityCylinders),
  maxLoadKg: vehicle.maxLoadKg === null ? '' : String(vehicle.maxLoadKg).replace('.', ','), licensingDueOn: vehicle.licensingDueOn ?? '', justification: '',
});

type Banner = { variant: 'erro' | 'sucesso' | 'informacao' | 'alerta'; title?: string; message: string; recarregar?: boolean };
type Load = 'loading' | 'ready' | 'not_found' | 'error';

export interface VehicleFormViewProps {
  organizationId: string;
  service: RegistryService | null;
  online: boolean;
  // Presente na edição; ausente no cadastro.
  vehicleId?: string | undefined;
  onNavigate?: (path: string) => void;
}

export function VehicleFormView({ organizationId, service, online, vehicleId, onNavigate = defaultNavigate }: VehicleFormViewProps): React.JSX.Element {
  const modal = useFormModal();
  const navigateTo = modal?.embedded ? modal.navigate : onNavigate;
  const editing = vehicleId !== undefined;
  const [vehicle, setVehicle] = useState<VehicleView | null>(null);
  const [load, setLoad] = useState<Load>(editing ? 'loading' : 'ready');
  const [values, setValues] = useState<Values>(EMPTY);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [errorTick, setErrorTick] = useState(0);
  const [owner, setOwner] = useState<{ id: string; label: string } | null>(null);
  const [banner, setBanner] = useState<Banner | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const bannerRef = useRef<HTMLDivElement>(null);

  const apply = (outcome: RegistryOutcome<VehicleView>): void => {
    if (outcome.kind === 'success') { setVehicle(outcome.value); setValues(fromView(outcome.value)); setLoad('ready'); }
    else setLoad(outcome.kind === 'not_found' ? 'not_found' : 'error');
  };
  const reload = async (): Promise<void> => {
    if (!service || vehicleId === undefined) return;
    setLoad('loading');
    apply(await service.getVehicle(organizationId, vehicleId));
  };
  useEffect(() => {
    if (!service || vehicleId === undefined) return undefined;
    let active = true;
    void service.getVehicle(organizationId, vehicleId).then((outcome) => { if (active) apply(outcome); });
    return () => { active = false; };
  }, [service, organizationId, vehicleId]);
  useEffect(() => { if (banner) bannerRef.current?.focus(); }, [banner]);
  useEffect(() => {
    if (errorTick === 0) return;
    formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [errorTick]);

  const set = (field: keyof Values) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>): void => {
    setValues((current) => ({ ...current, [field]: event.target.value }));
  };
  const fail = (next: FieldErrors): void => { setErrors(next); setErrorTick((tick) => tick + 1); };
  // A placa é normalizada ao sair do campo: maiúsculas, com hífen no padrão antigo (RF-020).
  const normalizeOnBlur = (): void => { if (normalizePlate(values.plate)) setValues((current) => ({ ...current, plate: formatPlate(current.plate) })); };

  const plateChanged = editing && vehicle !== null && normalizePlate(values.plate) !== null && normalizePlate(values.plate) !== vehicle.plate;

  const handleFailure = (failure: RegistryFailure): void => {
    switch (failure.kind) {
      case 'plate_conflict':
        if (failure.owner) setOwner(failure.owner);
        return fail({ plate: failure.owner?.label ? `Esta placa já está cadastrada (${formatPlate(failure.owner.label)}).` : 'Esta placa já está cadastrada nesta organização.' });
      case 'justification_required':
        return fail({ justification: 'Explique a correção da placa em 5 a 500 caracteres.' });
      case 'invalid': {
        const mapped: FieldErrors = {};
        for (const [field, message] of Object.entries(failure.fields ?? {})) mapped[SERVER_FIELDS[field] ?? 'form'] = message;
        if (Object.keys(mapped).length > 0 && !('form' in mapped)) return fail(mapped);
        return setBanner({ variant: 'erro', message: 'Revise os dados informados e tente de novo.' });
      }
      case 'version_conflict':
        return setBanner({ variant: 'erro', title: 'Veículo alterado', message: 'Este veículo foi alterado por outra pessoa depois que você abriu a tela. Recarregue os dados para continuar.', recarregar: true });
      case 'inactive_record':
        return setBanner({ variant: 'erro', message: 'Este veículo está inativo e não pode ser editado.' });
      case 'access_denied':
      case 'mfa_required':
        return setBanner({ variant: 'erro', message: 'Você não tem permissão para esta ação.' });
      case 'offline':
        return setBanner({ variant: 'informacao', message: 'Sem conexão. Esta operação exige conexão e nada é guardado neste aparelho.' });
      case 'not_found':
        return setBanner({ variant: 'erro', message: 'Veículo não encontrado.' });
      default:
        return setBanner({ variant: 'erro', title: 'Resultado desconhecido', message: 'Não foi possível confirmar se a operação foi concluída. Confira a lista de veículos antes de tentar de novo: a placa não permite cadastro em duplicidade.' });
    }
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (!service || submitting || !online) return;
    setBanner(null);
    setOwner(null);
    const result = validateVehicleForm(values);
    const found: FieldErrors = result.ok ? {} : { ...result.errors };
    if (plateChanged && values.justification.trim().length < 5) found.justification = 'Explique a correção da placa em 5 a 500 caracteres.';
    if (!result.ok || Object.keys(found).length > 0) return fail(found);
    setErrors({});
    setSubmitting(true);
    let outcome: RegistryOutcome<{ id: string }>;
    if (editing && vehicle) {
      const updated = await service.updateVehicle(organizationId, vehicle.id, vehicle.version, result.value, plateChanged ? values.justification.trim() : null);
      outcome = updated.kind === 'success' ? { kind: 'success', value: { id: vehicle.id } } : updated;
    } else {
      const created = await service.createVehicle(organizationId, result.value);
      outcome = created.kind === 'success' ? { kind: 'success', value: { id: created.value.id } } : created;
    }
    setSubmitting(false);
    if (outcome.kind === 'success') return navigateTo(`/veiculos/${outcome.value.id}`);
    handleFailure(outcome);
  };

  const title = editing ? 'Editar veículo' : 'Cadastrar veículo';

  if (!service) return <ErrorState title="Conexão indisponível" message="Não foi possível falar com o servidor agora." />;
  if (editing && load === 'not_found') return <ErrorState variant="sem-permissao" title="Veículo não encontrado" message="Ele não existe nesta organização." />;
  if (editing && load === 'error') return <ErrorState title="Não foi possível carregar o veículo" message="Tente novamente em instantes." onRetry={() => void reload()} />;
  if (editing && load === 'loading' && !vehicle) return <Loading variant="pagina" busy label="Carregando…" />;
  if (editing && vehicle && vehicle.status === 'inactive') {
    return (
      <section aria-labelledby="vehicle-form-title" className="flex flex-col gap-6">
        <h2 id="vehicle-form-title" className="text-h2 font-bold text-navy">{title}</h2>
        <Alert variant="erro">Este veículo está inativo e não pode ser editado. <a className="font-semibold underline" href={`/veiculos/${vehicle.id}`}>Abrir o veículo</a></Alert>
      </section>
    );
  }

  return (
    <section aria-labelledby={modal?.embedded ? undefined : "vehicle-form-title"} className="flex flex-col gap-6">
      <FormHeader titleId="vehicle-form-title" eyebrow="Veículos" title={title} description={editing ? 'Altere os dados do veículo. Cada edição entra no histórico.' : 'Informe a placa e a capacidade. O veículo nasce disponível.'} />

      {!online && <Alert variant="informacao">Sem conexão. Esta operação exige conexão e nada é guardado neste aparelho.</Alert>}
      {banner && (
        <Alert ref={bannerRef} tabIndex={-1} variant={banner.variant} {...(banner.title ? { title: banner.title } : {})}>
          <p>{banner.message}</p>
          {banner.recarregar && <Button variant="secundario" className="mt-2" onClick={() => { setBanner(null); void reload(); }}>Recarregar dados</Button>}
        </Alert>
      )}

      <FormCard>
        <form ref={formRef} noValidate onSubmit={(event) => void submit(event)} className="flex flex-col gap-6">
          <FormSection legend="Identificação" description="A placa é única na organização, em qualquer situação do veículo.">
            <div className="grid gap-4 tablet:grid-cols-2">
              <TextField label="Placa" name="plate" value={values.plate} onChange={set('plate')} onBlur={normalizeOnBlur} maxLength={20} autoComplete="off" error={errors.plate}
                help="Padrão ABC-1234 ou ABC1D23." />
              {plateChanged && <TextField label="Justificativa da correção da placa" name="justification" value={values.justification} onChange={set('justification')} maxLength={500} error={errors.justification} />}
              {owner && <a className="text-corpo font-semibold text-azul-profundo underline tablet:col-span-2" href={`/veiculos/${owner.id}`}>Abrir o veículo que usa esta placa</a>}
              <Select label="Tipo de veículo" name="vehicleType" value={values.vehicleType} onChange={set('vehicleType')} error={errors.vehicleType}>
                <option value="" disabled>Selecione o tipo</option>
                {VEHICLE_TYPES.map((type) => <option key={type} value={type}>{VEHICLE_TYPE_LABELS[type]}</option>)}
              </Select>
              {values.vehicleType === 'other' && <TextField label="Qual tipo?" name="vehicleTypeDetail" value={values.vehicleTypeDetail} onChange={set('vehicleTypeDetail')} maxLength={60} error={errors.vehicleTypeDetail} />}
              <TextField label="Marca" name="brand" value={values.brand} onChange={set('brand')} maxLength={60} autoComplete="off" error={errors.brand} />
              <TextField label="Modelo" name="model" value={values.model} onChange={set('model')} maxLength={60} autoComplete="off" error={errors.model} />
              <TextField label="Ano de fabricação" name="manufactureYear" inputMode="numeric" value={values.manufactureYear} onChange={set('manufactureYear')} maxLength={4} error={errors.manufactureYear} />
            </div>
          </FormSection>

          <FormSection legend="Capacidade" description="Quantos cilindros o veículo leva e a carga máxima.">
            <div className="grid gap-4 tablet:grid-cols-2">
              <TextField label="Capacidade em cilindros" name="capacityCylinders" inputMode="numeric" value={values.capacityCylinders} onChange={set('capacityCylinders')} maxLength={4} error={errors.capacityCylinders} help="De 1 a 9999." />
              <TextField label="Carga máxima (kg)" name="maxLoadKg" inputMode="decimal" value={values.maxLoadKg} onChange={set('maxLoadKg')} error={errors.maxLoadKg} />
            </div>
          </FormSection>

          <FormSection legend="Licenciamento" description="Com a data de vencimento, a situação (em dia, a vencer ou vencido) é calculada sozinha.">
            <TextField label="Vencimento do licenciamento" name="licensingDueOn" type="date" value={values.licensingDueOn} onChange={set('licensingDueOn')} error={errors.licensingDueOn} />
          </FormSection>

          <FormActions>
            <Button type="submit" disabled={!online} loading={submitting} loadingLabel={editing ? 'Salvando…' : 'Cadastrando…'}>{editing ? 'Salvar alterações' : 'Cadastrar veículo'}</Button>
            <FormCancel href={editing && vehicleId ? `/veiculos/${vehicleId}` : '/veiculos'} />
          </FormActions>
        </form>
      </FormCard>
    </section>
  );
}

// Tela de cadastro ou edição: o portão confirma `vehicle.write` no servidor antes de montar o formulário.
export function VehicleFormPage(): React.JSX.Element {
  const { service, organizationId, online } = useRegistryService();
  const route = resolveRegistryRoute(window.location.pathname);
  const vehicleId = route?.area === 'vehicles' && route.kind === 'edit' ? route.id : undefined;
  return (
    <AccessGate permission="vehicle.write">
      <VehicleFormView key={`${organizationId}:${vehicleId ?? 'novo'}`} organizationId={organizationId} service={service} online={online} vehicleId={vehicleId} />
    </AccessGate>
  );
}
