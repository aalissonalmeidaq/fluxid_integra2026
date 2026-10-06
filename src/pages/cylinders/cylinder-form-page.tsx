import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CylinderOutcome, CylinderService } from '@/application/cylinders/cylinder-service';
import type { CylinderDetail, CylinderTypeView } from '@/application/cylinders/cylinder-views';
import { usePermissions } from '@/app/navigation/permissions-context';
import { resolveCylinderRoute } from '@/app/cylinders/cylinder-routes';
import {
  CAPACITY_UNITS, CAPACITY_UNIT_LABELS, CLASSIFICATIONS, CLASSIFICATION_LABELS, IDENTIFIER_KINDS, IDENTIFIER_KIND_LABELS,
  type CapacityUnit, type Classification,
} from '@/domain/cylinders/cylinder-types';
import {
  validateCylinderForm, validateIdentifierForm, type FieldErrors,
} from '@/domain/cylinders/cylinder-validation';
import { Alert, Button, Card, ErrorState, Field, FormSection, Loading, Select, TextField } from '@/design-system';
import { textareaClass } from '@/components/identity/confirmation-dialog';
import { AccessGate } from './components/access-gate';
import { CameraScanButton } from './components/camera-scan-button';
import { typeLabel } from './type-label';
import { useCylinderService } from './use-cylinder-service';

const defaultNavigate = (path: string): void => window.location.assign(path);

interface Values {
  cylinderTypeId: string; serialNumber: string; manufacturer: string; manufactureYear: string; workingPressureBar: string; notes: string;
  identifierKind: string; identifierValue: string;
}
const EMPTY: Values = {
  cylinderTypeId: '', serialNumber: '', manufacturer: '', manufactureYear: '', workingPressureBar: '', notes: '', identifierKind: '', identifierValue: '',
};

// Nomes dos campos do contrato (snake_case) na ordem do formulário.

const SERVER_FIELDS: Record<string, keyof Values> = {
  cylinder_type_id: 'cylinderTypeId', serial_number: 'serialNumber', manufacturer: 'manufacturer', manufacture_year: 'manufactureYear',
  working_pressure_bar: 'workingPressureBar', notes: 'notes', 'identifier.kind': 'identifierKind', 'identifier.value': 'identifierValue',
};
const LABELS: Record<keyof Values, string> = {
  cylinderTypeId: 'Tipo de cilindro', serialNumber: 'Número de série', manufacturer: 'Fabricante', manufactureYear: 'Ano de fabricação',
  workingPressureBar: 'Pressão de trabalho (bar)', notes: 'Observações', identifierKind: 'Tipo do identificador', identifierValue: 'Valor do identificador',
};

const fromDetail = (detail: CylinderDetail): Values => ({
  cylinderTypeId: detail.cylinder.type.id, serialNumber: detail.cylinder.serialNumber, manufacturer: detail.cylinder.manufacturer ?? '',
  manufactureYear: detail.cylinder.manufactureYear === null ? '' : String(detail.cylinder.manufactureYear),
  workingPressureBar: detail.cylinder.workingPressureBar === null ? '' : String(detail.cylinder.workingPressureBar),
  notes: detail.cylinder.notes ?? '', identifierKind: '', identifierValue: '',
});

type Banner = { variant: 'erro' | 'sucesso' | 'informacao' | 'alerta'; title?: string; message: string; link?: { href: string; label: string }; recarregar?: boolean };
type Load = 'loading' | 'ready' | 'not_found' | 'error';

export interface CylinderFormViewProps {
  organizationId: string;
  service: CylinderService | null;
  online: boolean;
  // Presente na edição; ausente no cadastro.
  cylinderId?: string;
  canReactivate?: boolean;
  onNavigate?: (path: string) => void;
}

export function CylinderFormView({ organizationId, service, online, cylinderId, canReactivate = false, onNavigate = defaultNavigate }: CylinderFormViewProps): React.JSX.Element {
  const editing = cylinderId !== undefined;
  const [types, setTypes] = useState<CylinderTypeView[]>([]);
  const [typesLoad, setTypesLoad] = useState<Load>('loading');
  const [detail, setDetail] = useState<CylinderDetail | null>(null);
  const [detailLoad, setDetailLoad] = useState<Load>(editing ? 'loading' : 'ready');
  const [values, setValues] = useState<Values>(EMPTY);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [errorTick, setErrorTick] = useState(0);
  const [owners, setOwners] = useState<{ serial?: string; identifier?: string }>({});
  const [banner, setBanner] = useState<Banner | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [maybeCreated, setMaybeCreated] = useState(false);
  const [draft, setDraft] = useState<Values | null>(null);
  const [showTypeForm, setShowTypeForm] = useState(false);
  const [typeValues, setTypeValues] = useState({ gas: '', capacity: '', unit: 'l', classification: 'industrial' });
  const [typeErrors, setTypeErrors] = useState<FieldErrors>({});
  const [typeSaving, setTypeSaving] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const bannerRef = useRef<HTMLDivElement>(null);

  // O estado inicial já é "carregando": os efeitos só aplicam o resultado depois da resposta (sem setState síncrono no efeito).
  const applyTypes = useCallback((outcome: CylinderOutcome<CylinderTypeView[]>): CylinderTypeView[] | null => {
    if (outcome.kind === 'success') { setTypes(outcome.value); setTypesLoad('ready'); return outcome.value; }
    setTypesLoad('error');
    return null;
  }, []);

  const applyDetail = useCallback((outcome: CylinderOutcome<CylinderDetail>): void => {
    if (outcome.kind === 'success') { setDetail(outcome.value); setValues(fromDetail(outcome.value)); setDetailLoad('ready'); }
    else setDetailLoad(outcome.kind === 'not_found' ? 'not_found' : 'error');
  }, []);

  // Nova tentativa a pedido da pessoa (evento, não efeito).
  const loadTypes = async (): Promise<CylinderTypeView[] | null> => {
    if (!service) return null;
    setTypesLoad('loading');
    return applyTypes(await service.catalog(organizationId));
  };

  const loadDetail = async (): Promise<void> => {
    if (!service || cylinderId === undefined) return;
    setDetailLoad('loading');
    applyDetail(await service.get(organizationId, cylinderId));
  };

  useEffect(() => {
    if (!service) return undefined;
    let active = true;
    void service.catalog(organizationId).then((outcome) => { if (active) applyTypes(outcome); });
    return () => { active = false; };
  }, [service, organizationId, applyTypes]);

  useEffect(() => {
    if (!service || cylinderId === undefined) return undefined;
    let active = true;
    void service.get(organizationId, cylinderId).then((outcome) => { if (active) applyDetail(outcome); });
    return () => { active = false; };
  }, [service, organizationId, cylinderId, applyDetail]);

  useEffect(() => { if (banner) bannerRef.current?.focus(); }, [banner]);
  // Foco no primeiro campo com erro, na ordem do formulário (RF-030).
  useEffect(() => {
    if (errorTick === 0) return;
    formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [errorTick]);

  const set = (field: keyof Values) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>): void => {
    setValues((current) => ({ ...current, [field]: event.target.value }));
  };

  const fail = (next: FieldErrors): void => { setErrors(next); setErrorTick((tick) => tick + 1); };

  const submit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (!service || submitting || !online) return;
    setBanner(null);
    setOwners({});

    const cylinder = validateCylinderForm(values);
    const identifier = editing ? null : validateIdentifierForm({ kind: values.identifierKind, value: values.identifierValue });
    const found: FieldErrors = {};
    if (!cylinder.ok) Object.assign(found, cylinder.errors);
    if (identifier && !identifier.ok) {
      if (identifier.errors.kind) found.identifierKind = identifier.errors.kind;
      if (identifier.errors.value) found.identifierValue = identifier.errors.value;
    }
    if (Object.keys(found).length > 0 || !cylinder.ok || (identifier !== null && !identifier.ok)) {
      return fail(found);
    }
    setErrors({});

    setSubmitting(true);
    let outcome: CylinderOutcome<{ cylinderId?: string; version: number }>;
    if (editing && cylinderId !== undefined && detail) {
      const result = await service.update(organizationId, { ...cylinder.value, cylinderId, expectedVersion: detail.cylinder.version });
      outcome = result.kind === 'success' ? { kind: 'success', value: { cylinderId, version: result.value.version } } : result;
    } else if (identifier && identifier.ok) {
      outcome = await service.create(organizationId, { ...cylinder.value, identifier: identifier.value });
    } else {
      return;
    }
    setSubmitting(false);
    handleOutcome(outcome);
  };

  const handleOutcome = (outcome: CylinderOutcome<{ cylinderId?: string; version: number }>): void => {
    if (outcome.kind === 'success') {
      setMaybeCreated(false);
      onNavigate(`/cilindros/${outcome.value.cylinderId ?? cylinderId ?? ''}`);
      return;
    }
    switch (outcome.kind) {
      case 'serial_conflict':
        if (maybeCreated && outcome.ownerCylinderId) {
          setBanner({ variant: 'informacao', title: 'Cadastro já concluído', message: 'O cadastro anterior parece ter sido concluído: este número de série já está no cilindro abaixo.', link: { href: `/cilindros/${outcome.ownerCylinderId}`, label: 'Abrir o cilindro' } });
          return;
        }
        setOwners({ serial: outcome.ownerCylinderId });
        return fail({ serialNumber: 'Este número de série já está cadastrado nesta organização.' });
      case 'identifier_conflict':
        setOwners({ identifier: outcome.ownerCylinderId });
        return fail({ identifierValue: 'Este identificador já está vinculado a outro cilindro.' });
      case 'identifier_unavailable':
        return fail({ identifierValue: 'Este identificador foi usado e desativado. Para reutilizá-lo, use a transferência de identificador no detalhe do cilindro.' });
      case 'invalid': {
        const mapped: FieldErrors = {};
        for (const [field, message] of Object.entries(outcome.fields ?? {})) mapped[SERVER_FIELDS[field] ?? 'form'] = message;
        if (Object.keys(mapped).length > 0 && !('form' in mapped)) return fail(mapped);
        return setBanner({ variant: 'erro', message: 'Revise os dados informados e tente de novo.' });
      }
      case 'version_conflict':
        return setBanner({ variant: 'erro', title: 'Cilindro alterado', message: 'Este cilindro foi alterado por outra pessoa depois que você abriu a tela. Recarregue os dados para continuar.', recarregar: true });
      case 'cylinder_inactive':
        return setBanner({ variant: 'erro', message: 'Este cilindro está inativo e não pode ser editado.' });
      case 'access_denied':
      case 'mfa_required':
        return setBanner({ variant: 'erro', message: 'Você não tem permissão para esta ação.' });
      case 'offline':
        return setBanner({ variant: 'informacao', message: 'Sem conexão. Esta operação exige conexão e nada é guardado neste aparelho.' });
      case 'not_found':
        return setBanner({ variant: 'erro', message: 'Cilindro não encontrado.' });
      default:
        if (!editing) setMaybeCreated(true);
        return setBanner({ variant: 'erro', title: 'Resultado desconhecido', message: 'Não foi possível confirmar se a operação foi concluída. Confira a lista de cilindros ou tente de novo.' });
    }
  };

  const reload = async (): Promise<void> => {
    setDraft(values);
    setBanner(null);
    await loadDetail();
  };

  const saveType = async (): Promise<void> => {
    if (!service || typeSaving) return;
    const gas = typeValues.gas.trim();
    const capacity = Number(typeValues.capacity.trim().replace(',', '.'));
    const found: FieldErrors = {};
    if (gas.length < 2 || gas.length > 80) found.gas = 'Informe o gás com 2 a 80 caracteres.';
    if (!Number.isFinite(capacity) || capacity <= 0) found.capacity = 'Informe uma capacidade maior que zero.';
    setTypeErrors(found);
    if (Object.keys(found).length > 0) return;
    setTypeSaving(true);
    const outcome = await service.saveType(organizationId, {
      gas, capacityValue: capacity, capacityUnit: typeValues.unit as CapacityUnit, classification: typeValues.classification as Classification,
    });
    if (outcome.kind === 'success') {
      const fresh = await loadTypes();
      const id = outcome.value.typeId;
      if (id && fresh) setValues((current) => ({ ...current, cylinderTypeId: id }));
      setShowTypeForm(false);
      setTypeValues({ gas: '', capacity: '', unit: 'l', classification: 'industrial' });
    } else if (outcome.kind === 'invalid') {
      setTypeErrors({ gas: Object.values(outcome.fields ?? {})[0] ?? 'Revise os dados do tipo.' });
    } else {
      setBanner({ variant: 'erro', message: outcome.kind === 'offline' ? 'Sem conexão. Esta operação exige conexão e nada é guardado neste aparelho.' : 'Não foi possível salvar o tipo agora. Tente de novo.' });
    }
    setTypeSaving(false);
  };

  const changed = useMemo(() => {
    if (!draft || !detail) return [] as Array<{ label: string; value: string }>;
    const current = fromDetail(detail);
    return (Object.keys(LABELS) as Array<keyof Values>)
      .filter((field) => draft[field] !== current[field] && field !== 'identifierKind' && field !== 'identifierValue')
      .map((field) => ({ label: LABELS[field], value: draft[field] === '' ? '(vazio)' : draft[field] }));
  }, [draft, detail]);

  const title = editing ? 'Editar cilindro' : 'Cadastrar cilindro';

  if (!service) return <ErrorState title="Conexão indisponível" message="Não foi possível falar com o servidor agora." />;
  if (typesLoad === 'error') {
    return <ErrorState title="Não foi possível carregar os tipos de cilindro" message="Tente novamente em instantes." onRetry={() => void loadTypes()} />;
  }
  if (editing && detailLoad === 'not_found') return <ErrorState variant="sem-permissao" title="Cilindro não encontrado" message="Ele não existe nesta organização." />;
  if (editing && detailLoad === 'error') return <ErrorState title="Não foi possível carregar o cilindro" message="Tente novamente em instantes." onRetry={() => void loadDetail()} />;
  if (typesLoad === 'loading' || (editing && detailLoad === 'loading' && !detail)) return <Loading variant="pagina" busy label="Carregando…" />;

  if (editing && detail && detail.cylinder.status === 'inactive') {
    return (
      <section aria-labelledby="cyl-form-title" className="flex flex-col gap-6">
        <h2 id="cyl-form-title" className="text-h2 font-bold text-navy">{title}</h2>
        <Alert variant="erro">
          Este cilindro está inativo e não pode ser editado.{' '}
          {canReactivate && <a className="font-semibold underline" href={`/cilindros/${detail.cylinder.id}`}>Abrir o cilindro para reativar</a>}
        </Alert>
      </section>
    );
  }

  const visibleTypes = types.filter((type) => type.active || type.id === values.cylinderTypeId);
  const submitLabel = editing ? 'Salvar alterações' : 'Cadastrar cilindro';

  return (
    <section aria-labelledby="cyl-form-title" className="flex flex-col gap-6">
      <div>
        <p className="text-legenda font-semibold uppercase text-azul-profundo">Cilindros</p>
        <h2 id="cyl-form-title" className="mt-1 text-h2 font-bold text-navy">{title}</h2>
        <p className="mt-1 text-corpo">{editing ? 'Altere os dados do casco. Cada edição entra no histórico do cilindro.' : 'Informe o casco e o primeiro identificador. O cilindro nasce ativo e fora do estoque.'}</p>
      </div>

      {!online && <Alert variant="informacao">Sem conexão. Esta operação exige conexão e nada é guardado neste aparelho.</Alert>}
      {banner && (
        <Alert ref={bannerRef} tabIndex={-1} variant={banner.variant} {...(banner.title ? { title: banner.title } : {})}>
          <p>{banner.message}</p>
          {banner.link && <a className="font-semibold underline" href={banner.link.href}>{banner.link.label}</a>}
          {banner.recarregar && <Button variant="secundario" className="mt-2" onClick={() => void reload()}>Recarregar dados</Button>}
        </Alert>
      )}
      {draft && changed.length > 0 && (
        <Alert variant="alerta" title="O que você digitou antes de recarregar">
          <ul className="list-disc ps-6">
            {changed.map((item) => <li key={item.label}>{item.label}: {item.value}</li>)}
          </ul>
        </Alert>
      )}

      <Card>
        <form ref={formRef} noValidate onSubmit={(event) => void submit(event)} className="flex flex-col gap-6">
          <FormSection legend="Identificação" description="O tipo define o gás, a capacidade e a classificação do cilindro.">
            <div className="grid gap-4 tablet:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Select label="Tipo de cilindro" name="cylinderTypeId" value={values.cylinderTypeId} onChange={set('cylinderTypeId')} error={errors.cylinderTypeId}>
                  <option value="" disabled>Selecione um tipo</option>
                  {visibleTypes.map((type) => <option key={type.id} value={type.id}>{typeLabel(type)}{type.active ? '' : ' (inativo)'}</option>)}
                </Select>
                <Button variant="secundario" className="self-start" aria-expanded={showTypeForm} onClick={() => setShowTypeForm((visible) => !visible)}>Novo tipo</Button>
              </div>
              <TextField label="Número de série" name="serialNumber" value={values.serialNumber} onChange={set('serialNumber')} maxLength={80} autoComplete="off"
                help="O número gravado no casco." error={errors.serialNumber} />
            </div>
            {owners.serial && <a className="text-corpo font-semibold text-azul-profundo underline" href={`/cilindros/${owners.serial}`}>Abrir o cilindro que usa este número de série</a>}
            {showTypeForm && (
              <div className="grid gap-4 rounded-card border border-borda-suave p-4 tablet:grid-cols-2">
                <TextField label="Gás" name="typeGas" value={typeValues.gas} onChange={(event) => setTypeValues((current) => ({ ...current, gas: event.target.value }))} maxLength={80} error={typeErrors.gas} />
                <TextField label="Capacidade" name="typeCapacity" inputMode="decimal" value={typeValues.capacity} onChange={(event) => setTypeValues((current) => ({ ...current, capacity: event.target.value }))} error={typeErrors.capacity} />
                <Select label="Unidade" name="typeUnit" value={typeValues.unit} onChange={(event) => setTypeValues((current) => ({ ...current, unit: event.target.value }))}>
                  {CAPACITY_UNITS.map((unit) => <option key={unit} value={unit}>{CAPACITY_UNIT_LABELS[unit]}</option>)}
                </Select>
                <Select label="Classificação" name="typeClassification" value={typeValues.classification} onChange={(event) => setTypeValues((current) => ({ ...current, classification: event.target.value }))}>
                  {CLASSIFICATIONS.map((item) => <option key={item} value={item}>{CLASSIFICATION_LABELS[item]}</option>)}
                </Select>
                <Button className="self-start" disabled={!online} loading={typeSaving} loadingLabel="Salvando…" onClick={() => void saveType()}>Salvar tipo</Button>
              </div>
            )}
          </FormSection>

          <FormSection legend="Fabricação" description="Dados opcionais do fabricante.">
            <div className="grid gap-4 tablet:grid-cols-3">
              <TextField label="Fabricante" name="manufacturer" value={values.manufacturer} onChange={set('manufacturer')} maxLength={120} error={errors.manufacturer} />
              <TextField label="Ano de fabricação" name="manufactureYear" inputMode="numeric" value={values.manufactureYear} onChange={set('manufactureYear')} maxLength={4} error={errors.manufactureYear} />
              <TextField label="Pressão de trabalho (bar)" name="workingPressureBar" inputMode="decimal" value={values.workingPressureBar} onChange={set('workingPressureBar')} error={errors.workingPressureBar} />
              <Field label="Observações" error={errors.notes} className="tablet:col-span-3">
                {(control) => <textarea {...control} name="notes" rows={3} maxLength={500} value={values.notes} onChange={set('notes')} className={textareaClass} />}
              </Field>
            </div>
          </FormSection>

          {!editing && (
            <FormSection legend="Primeiro identificador" description="QR Code, Data Matrix, etiqueta NFC ou o número gravado no casco. Digite, cole ou leia com um leitor que age como teclado.">
              <div className="grid gap-4 tablet:grid-cols-2">
                <Select label="Tipo do identificador" name="identifierKind" value={values.identifierKind} onChange={set('identifierKind')} error={errors.identifierKind}>
                  <option value="" disabled>Selecione o tipo</option>
                  {IDENTIFIER_KINDS.map((kind) => <option key={kind} value={kind}>{IDENTIFIER_KIND_LABELS[kind]}</option>)}
                </Select>
                <TextField label="Valor do identificador" name="identifierValue" value={values.identifierValue} onChange={set('identifierValue')} maxLength={200} autoComplete="off" error={errors.identifierValue} />
              </div>
              <CameraScanButton onRead={(scanned) => setValues((current) => ({ ...current, identifierValue: scanned }))} />
              {owners.identifier && <a className="text-corpo font-semibold text-azul-profundo underline" href={`/cilindros/${owners.identifier}`}>Abrir o cilindro que usa este identificador</a>}
            </FormSection>
          )}

          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={!online} loading={submitting} loadingLabel={editing ? 'Salvando…' : 'Cadastrando…'}>{submitLabel}</Button>
            <a className="inline-flex min-h-alvo items-center px-4 text-corpo font-semibold text-azul-profundo underline" href={editing && cylinderId ? `/cilindros/${cylinderId}` : '/cilindros'}>Cancelar</a>
          </div>
        </form>
      </Card>
    </section>
  );
}

// Tela de cadastro ou edição: o portão confirma `cylinder.write` no servidor antes de montar o formulário (RF-039).
export function CylinderFormPage(): React.JSX.Element {
  const { service, organizationId, online } = useCylinderService();
  const { permissions } = usePermissions();
  const route = resolveCylinderRoute(window.location.pathname);
  const cylinderId = route?.kind === 'edit' ? route.id : undefined;
  return (
    <AccessGate permission="cylinder.write">
      <CylinderFormView
        key={`${organizationId}:${cylinderId ?? 'novo'}`}
        organizationId={organizationId}
        service={service}
        online={online}
        {...(cylinderId ? { cylinderId } : {})}
        canReactivate={permissions?.tenant.includes('cylinder.deactivate') ?? false}
      />
    </AccessGate>
  );
}

