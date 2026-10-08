import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { RegistryFailure, RegistryOutcome, RegistryService } from '@/application/registry/registry-service';
import type { GeofenceView, OverlapView, SiteDetail } from '@/application/registry/registry-views';
import { resolveRegistryRoute } from '@/app/registry/registry-routes';
import { Alert, Button, ErrorState, FormSection, Loading, TextField } from '@/design-system';
import { type FieldErrors, validateGeofenceForm } from '@/domain/registry/registry-validation';
import { AccessGate } from '@/pages/cylinders/components/access-gate';
import { GeofencePreview, type GeofencePreviewShape } from '../components/geofence-preview';
import { GeofenceShapeEditor, type GeofenceShapeDraft } from '../components/geofence-shape-editor';
import { FormActions, FormCancel, FormCard, FormHeader } from '../components/form-modal';
import { useFormModal } from '../components/form-modal-context';
import { useRegistryService } from '../use-registry-service';

const defaultNavigate = (path: string): void => window.location.assign(path);

interface Values extends GeofenceShapeDraft { name: string }
const EMPTY: Values = { name: '', shape: '', centerLat: '', centerLng: '', radiusM: '', vertices: [{ lat: '', lng: '' }, { lat: '', lng: '' }, { lat: '', lng: '' }] };

const decimal = (value: number): string => String(value).replace('.', ',');
const fromGeofence = (geofence: GeofenceView): Values => ({
  name: geofence.name, shape: geofence.shape, centerLat: geofence.center ? decimal(geofence.center.lat) : '', centerLng: geofence.center ? decimal(geofence.center.lng) : '',
  radiusM: geofence.radiusM === null ? '' : String(geofence.radiusM),
  vertices: geofence.shape === 'polygon' ? geofence.vertices.map((vertex) => ({ lat: decimal(vertex.lat), lng: decimal(vertex.lng) })) : EMPTY.vertices,
});

// Pré-visualização a partir do que está digitado (números inválidos ficam de fora).
function previewOf(values: Values): GeofencePreviewShape | null {
  const num = (text: string): number | null => (/^-?\d+([.,]\d+)?$/.test(text.trim()) ? Number(text.trim().replace(',', '.')) : null);
  if (values.shape === 'circle') {
    const lat = num(values.centerLat);
    const lng = num(values.centerLng);
    const radius = num(values.radiusM);
    return { shape: 'circle', center: lat !== null && lng !== null ? { lat, lng } : null, radiusM: radius };
  }
  if (values.shape === 'polygon') {
    const vertices = values.vertices.flatMap((vertex) => {
      const lat = num(vertex.lat);
      const lng = num(vertex.lng);
      return lat !== null && lng !== null ? [{ lat, lng }] : [];
    });
    return { shape: 'polygon', vertices };
  }
  return null;
}

type Banner = { variant: 'erro' | 'sucesso' | 'informacao' | 'alerta'; title?: string; message: string; recarregar?: boolean };
type Load = 'loading' | 'ready' | 'not_found' | 'error';

export interface GeofenceFormViewProps {
  organizationId: string;
  service: RegistryService | null;
  online: boolean;
  // Cadastro: a unidade vem da rota (?unidade=). Edição: a geocerca.
  siteId?: string | undefined;
  geofenceId?: string | undefined;
  onNavigate?: (path: string) => void;
}

export function GeofenceFormView({ organizationId, service, online, siteId, geofenceId, onNavigate = defaultNavigate }: GeofenceFormViewProps): React.JSX.Element {
  const modal = useFormModal();
  const navigateTo = modal?.embedded ? modal.navigate : onNavigate;
  const editing = geofenceId !== undefined;
  const [geofence, setGeofence] = useState<GeofenceView | null>(null);
  const [site, setSite] = useState<SiteDetail | null>(null);
  const [load, setLoad] = useState<Load>('loading');
  const [values, setValues] = useState<Values>(EMPTY);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [errorTick, setErrorTick] = useState(0);
  const [banner, setBanner] = useState<Banner | null>(null);
  const [overlaps, setOverlaps] = useState<{ id: string; list: OverlapView[] } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const bannerRef = useRef<HTMLDivElement>(null);

  const applyGeofence = (outcome: RegistryOutcome<GeofenceView>): void => {
    if (outcome.kind === 'success') { setGeofence(outcome.value); setValues(fromGeofence(outcome.value)); setLoad('ready'); }
    else setLoad(outcome.kind === 'not_found' ? 'not_found' : 'error');
  };
  const applySite = (outcome: RegistryOutcome<SiteDetail>): void => {
    if (outcome.kind === 'success') { setSite(outcome.value); setLoad('ready'); }
    else setLoad(outcome.kind === 'not_found' ? 'not_found' : 'error');
  };
  const reload = async (): Promise<void> => {
    if (!service) return;
    setLoad('loading');
    if (geofenceId !== undefined) applyGeofence(await service.getGeofence(organizationId, geofenceId));
    else if (siteId !== undefined) applySite(await service.getSite(organizationId, siteId));
  };
  useEffect(() => {
    if (!service) return undefined;
    let active = true;
    if (geofenceId !== undefined) void service.getGeofence(organizationId, geofenceId).then((outcome) => { if (active) applyGeofence(outcome); });
    else if (siteId !== undefined) void service.getSite(organizationId, siteId).then((outcome) => { if (active) applySite(outcome); });
    return () => { active = false; };
  }, [service, organizationId, geofenceId, siteId]);
  useEffect(() => { if (banner) bannerRef.current?.focus(); }, [banner]);
  useEffect(() => {
    if (errorTick === 0) return;
    formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [errorTick]);

  const preview = useMemo(() => previewOf(values), [values]);
  const fail = (next: FieldErrors): void => { setErrors(next); setErrorTick((tick) => tick + 1); };

  const handleFailure = (failure: RegistryFailure): void => {
    switch (failure.kind) {
      case 'name_conflict':
        return fail({ name: 'Já existe uma geocerca com este nome nesta unidade.' });
      case 'geometry_invalid':
        return fail({ [failure.geometryReason === 'radius_range' ? 'radiusM' : failure.geometryReason === 'coordinate_range' && values.shape === 'circle' ? 'centerLat' : values.shape === 'circle' ? 'radiusM' : 'vertices']: 'A forma não é válida. Confira os valores informados.' });
      case 'invalid':
        return setBanner({ variant: 'erro', message: 'Revise os dados informados e tente de novo.' });
      case 'parent_inactive':
        return setBanner({ variant: 'erro', message: 'A unidade está inativa. Reative a unidade antes de criar geocercas.' });
      case 'version_conflict':
        return setBanner({ variant: 'erro', title: 'Geocerca alterada', message: 'Esta geocerca foi alterada por outra pessoa depois que você abriu a tela. Recarregue os dados para continuar.', recarregar: true });
      case 'inactive_record':
        return setBanner({ variant: 'erro', message: 'Esta geocerca está inativa e não pode ser editada.' });
      case 'access_denied':
      case 'mfa_required':
        return setBanner({ variant: 'erro', message: 'Você não tem permissão para esta ação.' });
      case 'offline':
        return setBanner({ variant: 'informacao', message: 'Sem conexão. Esta operação exige conexão e nada é guardado neste aparelho.' });
      case 'not_found':
        return setBanner({ variant: 'erro', message: 'Geocerca ou unidade não encontrada.' });
      default:
        return setBanner({ variant: 'erro', title: 'Resultado desconhecido', message: 'Não foi possível confirmar se a operação foi concluída. Confira a lista de geocercas da unidade antes de tentar de novo: o nome não pode se repetir.' });
    }
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (!service || submitting || !online) return;
    setBanner(null);
    const result = validateGeofenceForm({ name: values.name, shape: values.shape, centerLat: values.centerLat, centerLng: values.centerLng, radiusM: values.radiusM, vertices: values.vertices });
    if (!result.ok) return fail(result.errors);
    setErrors({});
    setSubmitting(true);
    const targetSite = geofence?.siteId ?? siteId ?? '';
    let outcome: RegistryOutcome<{ id: string; overlaps: OverlapView[] }>;
    if (editing && geofence) {
      const updated = await service.updateGeofence(organizationId, geofence.id, geofence.version, result.value);
      outcome = updated.kind === 'success' ? { kind: 'success', value: { id: geofence.id, overlaps: updated.value.overlaps } } : updated;
    } else {
      const created = await service.createGeofence(organizationId, targetSite, result.value);
      outcome = created.kind === 'success' ? { kind: 'success', value: { id: created.value.id, overlaps: created.value.overlaps } } : created;
    }
    setSubmitting(false);
    if (outcome.kind !== 'success') return handleFailure(outcome);
    // Sobreposição com outra geocerca ativa da mesma unidade avisa, mas a geocerca já foi salva (RF-016a).
    if (outcome.value.overlaps.length > 0) return setOverlaps({ id: outcome.value.id, list: outcome.value.overlaps });
    navigateTo(`/geocercas/${outcome.value.id}`);
  };

  const title = editing ? 'Editar geocerca' : 'Cadastrar geocerca';

  if (!service) return <ErrorState title="Conexão indisponível" message="Não foi possível falar com o servidor agora." />;
  if (!editing && siteId === undefined) return <ErrorState variant="sem-permissao" title="Escolha uma unidade" message="Abra o cadastro pelo detalhe de uma unidade, em Clientes." />;
  if (load === 'not_found') return <ErrorState variant="sem-permissao" title={editing ? 'Geocerca não encontrada' : 'Unidade não encontrada'} message="Ela não existe nesta organização." />;
  if (load === 'error') return <ErrorState title="Não foi possível carregar os dados" message="Tente novamente em instantes." onRetry={() => void reload()} />;
  if (load === 'loading') return <Loading variant="pagina" busy label="Carregando…" />;
  if (editing && geofence && geofence.status === 'inactive') {
    return (
      <section aria-labelledby="geofence-form-title" className="flex flex-col gap-6">
        <h2 id="geofence-form-title" className="text-h2 font-bold text-navy">{title}</h2>
        <Alert variant="erro">Esta geocerca está inativa e não pode ser editada. <a className="font-semibold underline" href={`/geocercas/${geofence.id}`}>Abrir a geocerca</a></Alert>
      </section>
    );
  }
  if (overlaps) {
    return (
      <section aria-labelledby="geofence-form-title" className="flex flex-col gap-6">
        <h2 id="geofence-form-title" className="text-h2 font-bold text-navy">Geocerca salva</h2>
        <Alert variant="alerta" title="Sobreposição">
          <p>A geocerca foi salva, mas se sobrepõe a outra(s) geocerca(s) ativa(s) desta unidade:</p>
          <ul className="list-disc ps-6">{overlaps.list.map((item) => <li key={item.id}><a className="font-semibold underline" href={`/geocercas/${item.id}`}>{item.name}</a></li>)}</ul>
        </Alert>
        <a className="inline-flex min-h-alvo items-center justify-center self-start rounded-controle border border-azul-profundo bg-azul-profundo px-4 text-corpo font-semibold text-branco hover:bg-navy" href={`/geocercas/${overlaps.id}`}>Abrir a geocerca</a>
      </section>
    );
  }

  const siteName = geofence ? geofence.siteName : site?.site.name ?? '';
  const customerName = geofence ? geofence.customerName : site?.site.customerName ?? '';
  const siteCoordinates = site?.site.latitude != null && site.site.longitude != null ? { lat: site.site.latitude, lng: site.site.longitude } : null;
  const back = geofence ? `/geocercas/${geofence.id}` : `/clientes/${site?.site.customerId ?? ''}/unidades/${siteId ?? ''}`;

  return (
    <section aria-labelledby={modal?.embedded ? undefined : "geofence-form-title"} className="flex flex-col gap-6">
      <FormHeader titleId="geofence-form-title" eyebrow="Geocercas" title={title} description={`Unidade: ${siteName} (${customerName}). ${editing ? 'Cada edição entra no histórico.' : 'Escolha a forma e informe as coordenadas.'}`} />

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
            <TextField label="Nome da geocerca" name="name" value={values.name} onChange={(event) => setValues((current) => ({ ...current, name: event.target.value }))} maxLength={120} autoComplete="off" error={errors.name} />
          </FormSection>
          <FormSection legend="Forma" description="Círculo, com centro e raio, ou polígono, com uma lista de vértices.">
            <GeofenceShapeEditor value={values} onChange={(next) => setValues((current) => ({ ...current, ...next }))} errors={errors} siteCoordinates={siteCoordinates} />
          </FormSection>
          {preview && (
            <FormSection legend="Pré-visualização">
              <GeofencePreview value={preview} />
            </FormSection>
          )}
          <FormActions>
            <Button type="submit" disabled={!online} loading={submitting} loadingLabel={editing ? 'Salvando…' : 'Cadastrando…'}>{editing ? 'Salvar alterações' : 'Cadastrar geocerca'}</Button>
            <FormCancel href={back} />
          </FormActions>
        </form>
      </FormCard>
    </section>
  );
}

// Tela de cadastro ou edição: o portão confirma `geofence.write` no servidor antes de montar o formulário.
export function GeofenceFormPage(): React.JSX.Element {
  const { service, organizationId, online } = useRegistryService();
  const route = resolveRegistryRoute(window.location.pathname);
  const geofenceId = route?.area === 'geofences' && route.kind === 'edit' ? route.id : undefined;
  const siteId = geofenceId === undefined ? new URLSearchParams(window.location.search).get('unidade') ?? undefined : undefined;
  return (
    <AccessGate permission="geofence.write">
      <GeofenceFormView key={`${organizationId}:${geofenceId ?? siteId ?? 'nova'}`} organizationId={organizationId} service={service} online={online} siteId={siteId} geofenceId={geofenceId} />
    </AccessGate>
  );
}
