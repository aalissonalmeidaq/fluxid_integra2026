import React, { useEffect, useMemo, useRef, useState } from 'react';
import { newRequestId, type TripFailure, type TripOutcome, type TripService } from '@/application/trips/trip-service';
import type { TripDetail, TripOptions } from '@/application/trips/trip-views';
import { useAuth } from '@/app/auth/auth-context';
import { resolveTripRoute } from '@/app/trips/trip-routes';
import { Alert, Button, ErrorState, FormSection, Loading, Select, TextField } from '@/design-system';
import type { FieldErrors } from '@/domain/registry/registry-validation';
import { formatPlate } from '@/domain/registry/plate';
import { CYLINDER_REFUSAL_LABELS, type CylinderRefusalReason } from '@/domain/trips/trip-vocabulary';
import { licensingWarning } from '@/domain/trips/trip-eligibility';
import { summarizeTripPlan } from '@/domain/trips/trip-summary';
import { TRIP_LIMITS } from '@/domain/trips/trip-limits';
import { validateTripForm } from '@/domain/trips/trip-validation';
import { todayInSaoPaulo } from '@/domain/shared/civil-date';
import { formatDate } from '@/domain/cylinders/format';
import { AccessGate } from '@/pages/cylinders/components/access-gate';
import { FormActions, FormCancel, FormCard, FormHeader } from '@/pages/registry/components/form-modal';
import { useFormModal } from '@/pages/registry/components/form-modal-context';
import { StopEditor } from './components/stop-editor';
import { newStopKey, type StopDraft } from './components/stop-draft';
import { TripAnnouncer, TripNotice } from './components/trip-notice';
import { TripSummaryPanel } from './components/trip-summary-panel';
import { useTripService } from './use-trip-service';

const defaultNavigate = (path: string): void => window.location.assign(path);

interface Values { plannedDate: string; vehicleId: string; driverId: string; notes: string }
const SERVER_FIELDS: Record<string, string> = { planned_date: 'plannedDate', vehicle_id: 'vehicleId', driver_id: 'driverId', notes: 'notes', stops: 'stops', cylinders: 'cylinders', request_id: 'form' };

type Banner = { variant: 'erro' | 'informacao'; title?: string; message: string; recarregar?: boolean; tripId?: string };
type Load = 'loading' | 'ready' | 'not_found' | 'error';

const ENTITY_LABELS: Record<string, string> = { vehicle: 'O veículo', driver: 'O motorista', site: 'Uma unidade da viagem', customer: 'O cliente de uma unidade' };

// Estado de tela para cada falha do servidor, em texto claro e sem culpar a pessoa (contracts/operacoes-servidor.md).
function describeFailure(failure: TripFailure, serialOf: (id: string | undefined) => string): Banner | null {
  switch (failure.kind) {
    case 'cylinder_reserved':
      return { variant: 'erro', title: 'Cilindro já reservado', message: `${serialOf(failure.cylinderId)} já está na viagem n.º ${failure.trip?.number ?? ''}. Tire-o desta viagem ou escolha outro.`.replace('  ', ' '), ...(failure.trip ? { tripId: failure.trip.id } : {}) };
    case 'cylinder_not_eligible':
      return { variant: 'erro', title: 'Cilindro não pode viajar', message: `${serialOf(failure.cylinderId)}: ${failure.reason ? CYLINDER_REFUSAL_LABELS[failure.reason as CylinderRefusalReason] ?? 'não elegível' : 'não elegível'}.` };
    case 'capacity_exceeded':
      return { variant: 'erro', title: 'Acima da capacidade', message: `O veículo comporta ${failure.capacity ?? ''} cilindros e a viagem tem ${failure.requested ?? ''}.` };
    case 'parent_inactive':
      return { variant: 'erro', title: 'Cadastro indisponível', message: `${ENTITY_LABELS[failure.entity ?? ''] ?? 'Um cadastro'} da viagem está inativo ou indisponível. Escolha outro.` };
    case 'resource_busy':
      return { variant: 'erro', title: 'Em outra viagem', message: `${failure.entity === 'driver' ? 'O motorista' : 'O veículo'} já está na viagem n.º ${failure.trip?.number ?? ''}, em carregamento ou em andamento.`, ...(failure.trip ? { tripId: failure.trip.id } : {}) };
    case 'version_conflict':
      return { variant: 'erro', title: 'Viagem alterada', message: 'Esta viagem foi alterada por outra pessoa depois que você abriu a tela. Recarregue os dados para continuar.', recarregar: true };
    case 'trip_closed':
      return { variant: 'erro', message: 'Esta viagem já foi encerrada e não pode mais ser editada.' };
    case 'invalid_transition':
      return { variant: 'erro', message: 'Esta viagem já saiu e não pode mais ser editada.' };
    case 'session_expired':
      return { variant: 'erro', title: 'Sessão expirada', message: 'Sua sessão expirou e nada foi gravado. Entre de novo para continuar.' };
    case 'access_denied': case 'mfa_required':
      return { variant: 'erro', message: 'Você não tem permissão para esta ação.' };
    case 'offline':
      return { variant: 'informacao', message: 'Sem conexão. Esta operação exige conexão e nada é guardado neste aparelho.' };
    case 'not_found':
      return { variant: 'erro', message: 'Viagem, cadastro ou cilindro não encontrado.' };
    case 'invalid':
      return null;
    default:
      return { variant: 'erro', title: 'Resultado desconhecido', message: 'Não foi possível confirmar se a operação foi concluída. Confira a lista de viagens antes de tentar de novo; reenviar o mesmo pedido não duplica a viagem.' };
  }
}

function draftsOf(detail: TripDetail): StopDraft[] {
  return detail.stops.filter((stop) => stop.status !== 'removed').sort((a, b) => (a.position ?? 99) - (b.position ?? 99)).map((stop) => ({
    key: newStopKey(), id: stop.id, siteId: stop.site.id,
    cylinders: detail.items.filter((item) => item.stopId === stop.id && (item.itemStatus === 'planned' || item.itemStatus === 'checked'))
      .map((item) => ({ id: item.cylinder.id, serialNumber: item.cylinder.serialNumber, gas: item.cylinder.gas })),
  }));
}

export interface TripFormViewProps {
  organizationId: string;
  service: TripService | null;
  online: boolean;
  // Presente na edição; ausente no planejamento.
  tripId?: string | undefined;
  onNavigate?: (path: string) => void;
  // Chamado quando o servidor diz que a sessão expirou: a tela de entrada assume (nada foi gravado).
  onSessionExpired?: () => void;
}

export function TripFormView({ organizationId, service, online, tripId, onNavigate = defaultNavigate, onSessionExpired }: TripFormViewProps): React.JSX.Element {
  const modal = useFormModal();
  const navigateTo = modal?.embedded ? modal.navigate : onNavigate;
  const editing = tripId !== undefined;
  const [detail, setDetail] = useState<TripDetail | null>(null);
  const [options, setOptions] = useState<TripOptions | null>(null);
  const [load, setLoad] = useState<Load>('loading');
  const [values, setValues] = useState<Values>({ plannedDate: todayInSaoPaulo(), vehicleId: '', driverId: '', notes: '' });
  const [stops, setStops] = useState<StopDraft[]>(() => (editing ? [] : [{ key: newStopKey(), siteId: '', cylinders: [] }]));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [errorTick, setErrorTick] = useState(0);
  const [banner, setBanner] = useState<Banner | null>(null);
  const [live, setLive] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const bannerRef = useRef<HTMLDivElement>(null);
  // Um `request_id` por tentativa: o mesmo na repetição do mesmo envio, novo quando a pessoa muda o que vai enviar.
  const requestIdRef = useRef<string | null>(null);

  const apply = (opts: TripOutcome<TripOptions>, current: TripOutcome<TripDetail> | null): void => {
    if (opts.kind !== 'success') { setLoad('error'); return; }
    setOptions(opts.value);
    if (current) {
      if (current.kind !== 'success') { setLoad(current.kind === 'not_found' ? 'not_found' : 'error'); return; }
      setDetail(current.value);
      setValues({ plannedDate: current.value.trip.plannedDate, vehicleId: current.value.vehicle.id, driverId: current.value.driver.id, notes: current.value.trip.notes ?? '' });
      setStops(draftsOf(current.value));
    }
    setLoad('ready');
  };
  const request = (): Promise<[TripOutcome<TripOptions>, TripOutcome<TripDetail> | null]> =>
    Promise.all([service!.tripOptions(organizationId), editing && tripId ? service!.getTrip(organizationId, tripId) : Promise.resolve(null)]);
  const reloadAll = async (): Promise<void> => {
    if (!service) return;
    setLoad('loading');
    const [opts, current] = await request();
    apply(opts, current);
  };
  // A tela já nasce em "carregando"; a chave do componente a remonta quando a organização ou a viagem mudam.
  useEffect(() => {
    if (!service) return undefined;
    let active = true;
    void request().then(([opts, current]) => { if (active) apply(opts, current); });
    return () => { active = false; };
  }, [service]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (banner) bannerRef.current?.focus(); }, [banner]);
  useEffect(() => {
    if (errorTick === 0) return;
    formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [errorTick]);
  useEffect(() => { requestIdRef.current = null; }, [values, stops]);

  const vehicleOption = useMemo(() => {
    const found = options?.vehicles.find((vehicle) => vehicle.id === values.vehicleId);
    if (found) return { plate: found.plate, capacity: found.capacityCylinders, licensingDueOn: found.licensingDueOn };
    if (detail && detail.vehicle.id === values.vehicleId) return { plate: detail.vehicle.plate, capacity: detail.vehicle.capacityCylinders, licensingDueOn: detail.vehicle.licensingDueOn };
    return null;
  }, [options, detail, values.vehicleId]);
  const driverOption = useMemo(() => {
    const found = options?.drivers.find((driver) => driver.id === values.driverId);
    if (found) return { name: found.fullName, cnhValidUntil: found.cnhValidUntil, cnhStatus: found.cnhStatus };
    if (detail && detail.driver.id === values.driverId) return { name: detail.driver.fullName, cnhValidUntil: detail.driver.cnhValidUntil, cnhStatus: detail.driver.cnhStatus };
    return null;
  }, [options, detail, values.driverId]);

  const plan = stops.map((stop) => ({ ...(stop.id ? { id: stop.id } : {}), siteId: stop.siteId, cylinderIds: stop.cylinders.map((cylinder) => cylinder.id) }));
  const summary = summarizeTripPlan(plan, vehicleOption?.capacity ?? null);

  const warnings: string[] = [];
  const licensing = licensingWarning(vehicleOption?.licensingDueOn ?? null);
  if (licensing === 'licensing_expired') warnings.push('O licenciamento do veículo está vencido. Você pode planejar; confira antes de sair.');
  if (licensing === 'licensing_expiring') warnings.push('O licenciamento do veículo vence em breve.');
  if (driverOption?.cnhStatus === 'vencido') warnings.push('A CNH do motorista está vencida. A viagem só poderá ser iniciada com a CNH válida.');
  if (driverOption?.cnhStatus === 'a_vencer') warnings.push(`A CNH do motorista vence em ${formatDate(driverOption.cnhValidUntil)}.`);

  const serialOf = (id: string | undefined): string => stops.flatMap((stop) => stop.cylinders).find((cylinder) => cylinder.id === id)?.serialNumber ?? 'O cilindro';
  const announce = (message: string): void => setLive(message);
  const fail = (next: FieldErrors): void => { setErrors(next); setErrorTick((tick) => tick + 1); };
  const set = (field: keyof Values) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>): void => {
    setValues((current) => ({ ...current, [field]: event.target.value }));
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (!service || submitting || !online) return;
    setBanner(null);
    const result = validateTripForm({ ...values, stops: plan, vehicleCapacity: vehicleOption?.capacity ?? null }, editing ? 'edit' : 'create');
    if (!result.ok) { fail(result.errors); announce('Revise os campos indicados.'); return; }
    setErrors({});
    setSubmitting(true);
    const requestId = requestIdRef.current ?? (requestIdRef.current = newRequestId());
    const outcome = editing && detail
      ? await service.updateTrip(organizationId, detail.trip.id, detail.trip.version, result.value, requestId)
      : await service.createTrip(organizationId, result.value, requestId);
    setSubmitting(false);
    if (outcome.kind === 'success') {
      requestIdRef.current = null;
      announce(editing ? 'Viagem salva.' : 'Viagem planejada.');
      const id = 'tripId' in outcome.value ? outcome.value.tripId : detail?.trip.id;
      return navigateTo(id ? `/viagens/${id}` : '/viagens');
    }
    if (outcome.kind !== 'unknown' && outcome.kind !== 'offline') requestIdRef.current = null;
    if (outcome.kind === 'session_expired') onSessionExpired?.();
    if (outcome.kind === 'invalid') {
      const mapped: FieldErrors = {};
      for (const [field, message] of Object.entries(outcome.fields ?? {})) mapped[SERVER_FIELDS[field] ?? 'form'] = message;
      if (Object.keys(mapped).length > 0 && !('form' in mapped)) { fail(mapped); announce('Revise os campos indicados.'); return; }
      setBanner({ variant: 'erro', message: 'Revise os dados informados e tente de novo.' });
      return;
    }
    const described = describeFailure(outcome, serialOf);
    if (described) { setBanner(described); announce(described.message); }
  };

  const title = editing ? 'Editar viagem' : 'Planejar viagem';
  const reload = (): void => { setBanner(null); void reloadAll(); };

  if (!service) return <ErrorState title="Conexão indisponível" message="Não foi possível falar com o servidor agora." />;
  if (load === 'not_found') return <ErrorState variant="sem-permissao" title="Viagem não encontrada" message="Ela não existe nesta organização." />;
  if (load === 'error') return <ErrorState title="Não foi possível carregar o formulário" message="Tente novamente em instantes." onRetry={() => void reloadAll()} />;
  if (load === 'loading') return <Loading variant="pagina" busy label="Carregando…" />;
  if (editing && detail && !['planned', 'loading'].includes(detail.trip.status)) {
    return (
      <section aria-labelledby="trip-form-title" className="flex flex-col gap-6">
        <h2 id="trip-form-title" className="text-h2 font-bold text-navy">{title}</h2>
        <Alert variant="erro">Esta viagem já saiu ou foi encerrada e não pode ser editada. <a className="font-semibold underline" href={`/viagens/${detail.trip.id}`}>Abrir a viagem</a></Alert>
      </section>
    );
  }

  return (
    <section aria-labelledby={modal?.embedded ? undefined : 'trip-form-title'} className="flex flex-col gap-6">
      <FormHeader titleId="trip-form-title" eyebrow="Viagens" title={title}
        description={editing ? 'Altere a data, o veículo, o motorista, as paradas e os cilindros enquanto a viagem não saiu.' : 'Escolha a data, o veículo e o motorista, monte as paradas e escolha os cilindros de cada uma. Os cilindros ficam reservados ao salvar.'} />
      <TripAnnouncer message={live} />

      {!online && <TripNotice variant="informacao">Sem conexão. Esta operação exige conexão e nada é guardado neste aparelho.</TripNotice>}
      {banner && (banner.variant === 'erro' ? (
        <Alert ref={bannerRef} tabIndex={-1} variant="erro" {...(banner.title ? { title: banner.title } : {})}>
          <p>{banner.message}</p>
          {banner.tripId && <a className="font-semibold underline" href={`/viagens/${banner.tripId}`}>Abrir essa viagem</a>}
          {banner.recarregar && <Button variant="secundario" className="mt-2" onClick={reload}>Recarregar dados</Button>}
        </Alert>
      ) : <TripNotice variant="informacao">{banner.message}</TripNotice>)}

      <form ref={formRef} noValidate onSubmit={(event) => void submit(event)} className="flex flex-col gap-6">
        <div className="grid gap-6 desktop:grid-cols-3">
          <div className="flex min-w-0 flex-col gap-6 desktop:col-span-2">
            <FormCard>
              <div className="flex flex-col gap-6">
                <FormSection legend="Saída" description="Quando a viagem está prevista, com qual veículo e qual motorista.">
                  <div className="grid gap-4 tablet:grid-cols-2">
                    <TextField label="Data prevista" name="plannedDate" type="date" value={values.plannedDate} onChange={set('plannedDate')} error={errors.plannedDate}
                      {...(editing ? {} : { min: todayInSaoPaulo() })} />
                    <Select label="Veículo" name="vehicleId" value={values.vehicleId} onChange={set('vehicleId')} error={errors.vehicleId}>
                      <option value="" disabled>Selecione o veículo</option>
                      {options?.vehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{`${formatPlate(vehicle.plate)} — ${vehicle.capacityCylinders} cilindros`}</option>)}
                      {detail && !options?.vehicles.some((vehicle) => vehicle.id === detail.vehicle.id) && <option value={detail.vehicle.id}>{`${formatPlate(detail.vehicle.plate)} (indisponível para novas viagens)`}</option>}
                    </Select>
                    <Select label="Motorista" name="driverId" value={values.driverId} onChange={set('driverId')} error={errors.driverId}>
                      <option value="" disabled>Selecione o motorista</option>
                      {options?.drivers.map((driver) => <option key={driver.id} value={driver.id}>{driver.fullName}</option>)}
                      {detail && !options?.drivers.some((driver) => driver.id === detail.driver.id) && <option value={detail.driver.id}>{`${detail.driver.fullName} (inativo)`}</option>}
                    </Select>
                    <TextField label="Observações" name="notes" value={values.notes} onChange={set('notes')} maxLength={TRIP_LIMITS.maxNotes} error={errors.notes} help={`Até ${TRIP_LIMITS.maxNotes} caracteres.`} />
                  </div>
                </FormSection>
              </div>
            </FormCard>

            <FormCard>
              <FormSection legend="Paradas e cilindros" description="Cada parada é uma unidade de cliente, na ordem da viagem. Os cilindros ficam reservados ao salvar.">
                <StopEditor stops={stops} sites={options?.sites ?? []} onChange={setStops} service={service} organizationId={organizationId}
                  remaining={summary.remainingCapacity} errors={errors} disabled={submitting} onAnnounce={announce} />
                {errors.cylinders && <p role="alert" className="text-corpo font-semibold text-erro">{errors.cylinders}</p>}
              </FormSection>
            </FormCard>
          </div>

          <div className="min-w-0 desktop:sticky desktop:top-4 desktop:self-start">
            <TripSummaryPanel summary={summary} vehicleCapacity={vehicleOption?.capacity ?? null} warnings={warnings} />
          </div>
        </div>

        <FormActions>
          <Button type="submit" disabled={!online} loading={submitting} loadingLabel={editing ? 'Salvando…' : 'Planejando…'}>{editing ? 'Salvar alterações' : 'Planejar viagem'}</Button>
          <FormCancel href={editing && tripId ? `/viagens/${tripId}` : '/viagens'} />
        </FormActions>
      </form>
    </section>
  );
}

// Tela de planejamento ou edição: o portão confirma `trip.write` no servidor antes de montar o formulário.
export function TripFormPage(): React.JSX.Element {
  const { service, organizationId, online } = useTripService();
  const { logout } = useAuth();
  const route = resolveTripRoute(window.location.pathname);
  const tripId = route?.kind === 'edit' ? route.id : undefined;
  return (
    <AccessGate permission="trip.write">
      <TripFormView key={`${organizationId}:${tripId ?? 'nova'}`} organizationId={organizationId} service={service} online={online} tripId={tripId} onSessionExpired={() => void logout()} />
    </AccessGate>
  );
}
