import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { FieldService, ResolveOutcome } from '@/application/field/field-service';
import { newRequestId, type TripFailure, type TripOutcome, type TripService } from '@/application/trips/trip-service';
import type { TripDeliveryView, TripDetail, TripItemView, TripStopView, TripWarning } from '@/application/trips/trip-views';
import { resolveTripRoute } from '@/app/trips/trip-routes';
import { useAuth } from '@/app/auth/auth-context';
import { useOfflineField } from '@/app/field/offline-field-context';
import { usePermissions } from '@/app/navigation/permissions-context';
import { Alert, Button, Card, ErrorState, Loading } from '@/design-system';
import { decideConference } from '@/domain/field/reading-result';
import type { FieldErrors } from '@/domain/registry/registry-validation';
import type { ReadEvent, ReadFeedback } from '@/pages/field/identifier-reader-dialog';
import { useFieldService } from '@/pages/field/use-field-service';
import type { DeliveryFormValue } from '@/domain/trips/trip-validation';
import { formatPlate } from '@/domain/registry/plate';
import { formatDate, formatDateTime } from '@/domain/cylinders/format';
import { VALIDITY_LABELS } from '@/domain/registry/registry-vocabulary';
import { AccessGate } from '@/pages/cylinders/components/access-gate';
import { DetailBlock, secondaryLinkClass } from '@/pages/registry/components/detail-list';
import { CancelDialog } from './components/cancel-dialog';
import type { AddResult, AttachmentService } from '@/application/field/attachment-service';
import { AddEvidenceDialog } from './components/add-evidence-action';
import { DeliveryDialog } from './components/delivery-dialog';
import { canAddEvidence, hasEvidence, type DeliveryEvidence } from './components/delivery-evidence';
import { LoadingPanel } from './components/loading-panel';
import { RemoveItemDialog } from './components/remove-item-dialog';
import { ReturnItemDialog } from './components/return-item-dialog';
import { StopCard, type StopEvidence } from './components/stop-card';
import { TripHistoryList } from './components/trip-history-list';
import { UnlockDialog } from './components/unlock-dialog';
import { OverdueBadge, TripStatusBadge } from './components/trip-badges';
import { TripAnnouncer, TripNotice } from './components/trip-notice';
import { describeActionFailure, type ActionFailureText } from './trip-failure-text';
import { currentDelivery } from './current-delivery';
import { NO_ABILITIES, type TripAbilities } from './trip-abilities';
import { useTripService } from './use-trip-service';

const WARNING_TEXT: Record<TripWarning, string> = {
  licensing_expired: 'O licenciamento do veículo está vencido.',
  licensing_expiring: 'O licenciamento do veículo vence em breve.',
  cnh_expired: 'A CNH do motorista está vencida: a viagem não poderá ser iniciada.',
  cnh_expiring: 'A CNH do motorista vence em breve.',
  vehicle_unavailable: 'O veículo não está mais disponível: a viagem não poderá ser iniciada.',
  driver_inactive: 'O motorista está inativo: a viagem não poderá ser iniciada.',
};

// Nome dos campos do servidor nos nomes do formulário de entrega.
const DELIVERY_SERVER_FIELDS: Record<string, string> = {
  recipient_name: 'recipientName', recipient_role: 'recipientRole', delivered_at: 'deliveredAt', latitude: 'latitude', longitude: 'longitude', results: 'results',
  correction_reason: 'correctionReason', at_site_address: 'atSiteAddress', accuracy_m: 'position', position_source: 'position', position_read_at: 'position',
};

const COPY_DEBOUNCE_MS = 2500;
const PENDING_DEFAULT = 'Registrado neste aparelho. Pendente de envio.';
const QUEUE_NOTICE = 'Sem conexão. O que você registrar fica neste aparelho e será enviado quando houver conexão.';

type Load = 'loading' | 'ready' | 'not_found' | 'offline' | 'error';

export interface TripDetailViewProps {
  organizationId: string;
  tripId: string;
  service: TripService | null;
  online: boolean;
  abilities: TripAbilities;
  // Chamado quando o servidor diz que a sessão expirou: a tela de entrada assume (nada foi gravado).
  onSessionExpired?: () => void;
  // Resolve o código lido (Spec 009). Sem ele, a conferência fica só por toque.
  fieldService?: FieldService | null;
  // Spec 010: fotos e assinatura da entrega, guardadas no aparelho até o servidor confirmar. Sem isto, o diálogo de entrega é o de sempre.
  attachments?: Pick<AttachmentService, 'add' | 'upload' | 'usage'> | null;
}

type Pending =
  | { kind: 'remove' | 'unlock' | 'return'; item: TripItemView; trigger: HTMLElement }
  | { kind: 'cancel'; trigger: HTMLElement }
  | { kind: 'deliver' | 'correct'; stop: TripStopView; trigger: HTMLElement }
  | { kind: 'evidence'; stop: TripStopView; deliveryId: string; existingPhotos: number; hasSignature: boolean; trigger: HTMLElement };

type Performed = { ok: true; value: unknown; pending: { queueItemId: string } | null } | { ok: false; failure: TripFailure; text: ActionFailureText };

export function TripDetailView({ organizationId, tripId, service, online, abilities, onSessionExpired, fieldService = null, attachments = null }: TripDetailViewProps): React.JSX.Element {
  const [detail, setDetail] = useState<TripDetail | null>(null);
  const [load, setLoad] = useState<Load>('loading');
  const [live, setLive] = useState('');
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [failure, setFailure] = useState<ActionFailureText | null>(null);
  const [highlighted, setHighlighted] = useState<ReadonlySet<string>>(new Set());
  const [pending, setPending] = useState<Pending | null>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [dialogFields, setDialogFields] = useState<FieldErrors>({});
  const failureRef = useRef<HTMLDivElement>(null);
  // Espaço já ocupado por anexos no aparelho (limite de 50 MB), lido quando o diálogo de entrega abre.
  const [usedBytes, setUsedBytes] = useState(0);
  const deliveryOpen = pending?.kind === 'deliver' || pending?.kind === 'evidence';
  useEffect(() => {
    if (!deliveryOpen || !attachments) return undefined;
    let active = true;
    void attachments.usage().then((usage) => { if (active) setUsedBytes(usage.bytes); }).catch(() => undefined);
    return () => { active = false; };
  }, [deliveryOpen, attachments]);
  // Um `request_id` por ação: o mesmo na repetição de um envio de resultado desconhecido, novo depois de qualquer outro desfecho.
  const requestIds = useRef(new Map<string, string>());
  // O aviso de sessão expirada chega por ref para a recarga da viagem não depender de uma função nova a cada renderização.
  const sessionExpired = useRef(onSessionExpired);
  useEffect(() => { sessionExpired.current = onSessionExpired; });

  const apply = useCallback((outcome: TripOutcome<TripDetail>): void => {
    if (outcome.kind === 'success') { setDetail(outcome.value); setLoad('ready'); return; }
    if (outcome.kind === 'session_expired') sessionExpired.current?.();
    setLoad(outcome.kind === 'not_found' || outcome.kind === 'access_denied' ? 'not_found' : outcome.kind === 'offline' ? 'offline' : 'error');
  }, []);
  const retry = async (): Promise<void> => {
    if (!service) return;
    setLoad('loading');
    apply(await service.getTrip(organizationId, tripId));
  };
  useEffect(() => {
    if (!service) return undefined;
    let active = true;
    void service.getTrip(organizationId, tripId).then((outcome) => { if (active) apply(outcome); });
    return () => { active = false; };
  }, [service, organizationId, tripId, apply]);
  useEffect(() => { if (failure) failureRef.current?.focus(); }, [failure]);
  // Guarda a cópia da viagem para operar sem conexão (Spec 010, RF-006): só quem opera e só viagem em carregamento ou em andamento, aberta com conexão.
  const copyable = online && abilities.operate && detail !== null && detail.offline !== true && (detail.trip.status === 'loading' || detail.trip.status === 'in_progress');
  const copyVersion = detail?.trip.version;
  const remembered = useRef(false);
  // Espera a tela sossegar (2,5 s sem mudança): quem confere cilindros em sequência não disputa a rede com a renovação da cópia.
  useEffect(() => {
    if (!copyable || !service) return undefined;
    // A primeira cópia sai logo ao abrir a viagem (quem sai da cobertura em seguida já a leva); as renovações esperam.
    const delay = remembered.current ? COPY_DEBOUNCE_MS : 0;
    remembered.current = true;
    const timer = setTimeout(() => { void service.rememberTrip(organizationId, tripId); }, delay);
    return () => clearTimeout(timer);
  }, [copyable, copyVersion, service, organizationId, tripId]);

  // Recarrega sem mostrar o carregando: a tela continua no lugar enquanto os dados se renovam.
  const refresh = async (): Promise<void> => {
    if (!service) return;
    const outcome = await service.getTrip(organizationId, tripId);
    if (outcome.kind === 'success') setDetail(outcome.value);
  };
  // A conexão mudou: sem conexão a tela passa a mostrar a cópia guardada (que traz os identificadores para ler o código); com conexão volta ao servidor.
  const previousOnline = useRef(online);
  useEffect(() => {
    if (previousOnline.current === online) return;
    previousOnline.current = online;
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online]);
  const serialOf = (id: string | undefined): string => detail?.items.find((item) => item.cylinder.id === id)?.cylinder.serialNumber ?? 'O cilindro';

  // Executa uma ação: sucesso anuncia e recarrega; falha mostra o texto, recarrega nos conflitos de estado e guarda o pedido só se o resultado é desconhecido.
  const perform = async <T,>(key: string, call: (requestId: string) => Promise<TripOutcome<T>>, message: string | ((value: T) => string), toBanner = true, pendingMessage = PENDING_DEFAULT): Promise<Performed> => {
    if (!service || busyKey !== null) return { ok: false, failure: { kind: 'unknown' }, text: describeActionFailure({ kind: 'unknown' }) };
    const requestId = requestIds.current.get(key) ?? newRequestId();
    requestIds.current.set(key, requestId);
    setBusyKey(key);
    setFailure(null);
    setHighlighted(new Set());
    const outcome = await call(requestId);
    setBusyKey(null);
    if (outcome.kind === 'success') {
      requestIds.current.delete(key);
      // Offline a operação só entrou na fila: nunca se anuncia como feita (RF-001).
      setLive(outcome.pending && message !== '' ? pendingMessage : typeof message === 'function' ? message(outcome.value) : message);
      await refresh();
      return { ok: true, value: outcome.value, pending: outcome.pending ?? null };
    }
    if (outcome.kind !== 'unknown' && outcome.kind !== 'offline') requestIds.current.delete(key);
    if (outcome.kind === 'session_expired') sessionExpired.current?.();
    const text = describeActionFailure(outcome, serialOf);
    if (toBanner) setFailure(text);
    setLive(text.message);
    if (outcome.kind === 'items_pending' && outcome.itemIds) setHighlighted(new Set(outcome.itemIds));
    if (['invalid_transition', 'version_conflict', 'trip_closed', 'stop_closed', 'items_pending', 'resource_busy', 'cylinder_not_eligible'].includes(outcome.kind)) await refresh();
    return { ok: false, failure: outcome, text };
  };

  if (!service) return <ErrorState title="Conexão indisponível" message="Não foi possível falar com o servidor agora." />;
  if (load === 'loading' && !detail) return <Loading variant="pagina" busy label="Carregando a viagem…" />;
  if (load === 'not_found') return <ErrorState variant="sem-permissao" title="Viagem não encontrada" message="Ela não existe nesta organização." />;
  if (load === 'offline') return <ErrorState variant="sem-permissao" title="Sem conexão" message={abilities.operate ? 'Esta viagem não está guardada neste aparelho. Abra-a uma vez com conexão para poder usá-la sem conexão.' : 'Sem conexão. A consulta da viagem exige conexão.'} />;
  if (load === 'error' || !detail) return <ErrorState title="Não foi possível carregar a viagem" message="Tente novamente em instantes." onRetry={() => void retry()} />;

  const { trip } = detail;
  // Sem conexão e com trip.operate, as quatro operações de campo entram na fila do aparelho; o resto exige conexão (Spec 010, RF-001, RF-003).
  const queueable = !online && abilities.operate;
  const editable = abilities.write && (trip.status === 'planned' || trip.status === 'loading');
  const activeStops = [...detail.stops].sort((a, b) => (a.position ?? 99) - (b.position ?? 99));
  const toConfer = detail.items.filter((item) => item.itemStatus === 'planned');
  const toShip = detail.items.filter((item) => item.itemStatus === 'checked');
  const anyChecked = detail.items.some((item) => ['checked', 'removed'].includes(item.itemStatus));
  const startBlocker = toConfer.length > 0 ? `Faltam ${toConfer.length} ${toConfer.length === 1 ? 'cilindro' : 'cilindros'} para conferir.` : toShip.length === 0 ? 'Não há cilindros conferidos para levar.' : null;
  // Identifica o código lido (conferência e entrega): a resposta do servidor, sem decidir nada; a decisão é do domínio. Sessão expirada avisa a tela de entrada.
  // Sem conexão, o código só vale se for de um cilindro da viagem guardada; fora dela não dá para confirmar nada (RF-006).
  const resolveInTrip = (event: ReadEvent): ResolveOutcome => {
    for (const [index, candidate] of event.candidates.entries()) {
      const wanted = candidate.value.trim().toUpperCase();
      const item = wanted === '' ? undefined : detail.items.find((entry) => entry.identifiers?.includes(wanted));
      if (item) {
        return { kind: 'found', value: { cylinder: { id: item.cylinder.id, serialNumber: item.cylinder.serialNumber, status: 'active', stockStatus: 'in_stock', hydroStatus: 'sem_teste' }, identifier: { id: '', kind: 'qr_code' }, matchedIndex: index, trip: null } };
      }
    }
    return { kind: 'offline_unconfirmed' };
  };
  const resolveRead = async (event: ReadEvent): Promise<ResolveOutcome> => {
    if (queueable) return resolveInTrip(event);
    const outcome = await fieldService!.resolveIdentifier(organizationId, event.candidates, event.source === 'nfc' ? 'nfc_tag' : undefined);
    if (outcome.kind === 'session_expired') sessionExpired.current?.();
    return outcome;
  };
  // Conferência por leitura (Spec 009): o código identifica o cilindro; quem confere é a mesma operação do toque, com o método da leitura.
  // O leitor em diálogo anuncia o resultado na sua própria região; só o código digitado é anunciado na região da tela.
  const readCylinder = async (event: ReadEvent): Promise<ReadFeedback> => {
    if (!fieldService && !queueable) return { tone: 'error', message: 'Não foi possível consultar agora. Tente de novo.' };
    const outcome = await resolveRead(event);
    const decision = decideConference(outcome, detail.items.map((item) => ({ id: item.id, cylinderId: item.cylinder.id, status: item.itemStatus })), trip.id, event.source);
    if (decision.action === 'none') {
      if (event.source === 'typed') setLive(decision.message.message);
      return decision.message;
    }
    const done = `Cilindro ${decision.serial} conferido.`;
    const result = await perform(`check:${decision.itemId}`, (id) => service.checkItem(organizationId, trip.id, decision.itemId, id, event.source), event.source === 'typed' ? done : '', false, `Cilindro ${decision.serial} registrado neste aparelho. Pendente de envio.`);
    return result.ok ? { tone: 'success', message: done } : { tone: 'error', message: result.text.message };
  };
  const busy = busyKey !== null;
  // O que impede concluir, em texto (RF-021): paradas sem encerrar e cilindros não entregues sem decisão.
  const openStops = activeStops.filter((stop) => stop.status === 'pending' || stop.status === 'on_site').length;
  const undecided = detail.items.filter((item) => item.itemStatus === 'not_delivered' || item.itemStatus === 'in_transit').length;
  const completeBlocker = openStops > 0
    ? `Falta encerrar ${openStops} ${openStops === 1 ? 'parada' : 'paradas'}: registre a entrega ou a divergência.`
    : undecided > 0 ? `${undecided} ${undecided === 1 ? 'cilindro ainda' : 'cilindros ainda'} sem decisão: corrija a entrega ou devolva ao estoque.` : null;
  const canCancel = abilities.cancel && (trip.status === 'planned' || trip.status === 'loading' || (trip.status === 'in_progress' && abilities.exception));
  const canReturn = abilities.operate && abilities.exception && (trip.status === 'in_progress' || trip.status === 'cancelled');
  const closeDialog = (): void => { setPending(null); setDialogError(null); setDialogFields({}); };
  const deliveriesOf = (stopId: string): TripDeliveryView[] => detail.deliveries.filter((delivery) => delivery.stopId === stopId);

  // Guarda as fotos e a assinatura junto do registro da entrega. Elas **nunca** seguram a entrega: o registro já vale, e o que não coube só deixa de ser guardado, com aviso.
  const keepEvidence = async (evidence: DeliveryEvidence, done: Extract<Performed, { ok: true }>): Promise<void> => {
    if (!attachments || !hasEvidence(evidence)) return;
    const deliveryId = !done.pending && typeof (done.value as { deliveryId?: unknown } | null)?.deliveryId === 'string' ? (done.value as { deliveryId: string }).deliveryId : null;
    const target = done.pending ? { outboxItemId: done.pending.queueItemId } : deliveryId ? { deliveryId, existingPhotos: 0, hasSignature: false, addedLater: false } : null;
    if (!target) return;
    const refused: string[] = [];
    for (const photo of evidence.photos) {
      const added = await attachments.add({ tripId: trip.id, kind: 'photo', file: photo, target });
      if (!added.ok) refused.push(added.message);
    }
    if (evidence.signature) {
      const added = await attachments.add({ tripId: trip.id, kind: 'signature', file: evidence.signature, target });
      if (!added.ok) refused.push(added.message);
    }
    setLive(refused.length > 0 ? `Entrega registrada. ${refused[0]}` : 'Entrega registrada. As fotos serão enviadas em seguida.');
    // Entrega já confirmada pelo servidor: os anexos já podem seguir. Na fila, seguem depois do registro, no envio da fila.
    if (!done.pending) void attachments.upload().catch(() => undefined);
  };

  // Acrescentar foto ou assinatura a uma entrega já registrada (RF-021a): vale para a entrega que o aparelho já conhece, com ou sem conexão.
  const evidenceFor = (stop: TripStopView): StopEvidence | undefined => {
    if (!attachments || !abilities.operate) return undefined;
    const current = currentDelivery(deliveriesOf(stop.id));
    const deliveryId = current?.id ?? detail.knownDeliveries?.find((known) => known.stopId === stop.id)?.id;
    if (!deliveryId || (stop.status !== 'delivered' && stop.status !== 'with_divergence')) return undefined;
    const photos = current?.photoCount ?? 0;
    const hasSignature = current?.hasSignature ?? false;
    const open = canAddEvidence({ tripStatus: trip.status, completedAt: trip.completedAt, photos, hasSignature, now: new Date() });
    return {
      canAdd: open,
      onAdd: (target, trigger) => { setDialogError(null); setPending({ kind: 'evidence', stop: target, deliveryId, existingPhotos: photos, hasSignature, trigger }); },
      ...(detail.offline !== true && service ? { loadUrl: async (id: string) => { const outcome = await service.attachmentUrl(organizationId, id); return outcome.kind === 'success' ? outcome.value.url : null; } } : {}),
    };
  };
  const saveLaterEvidence = async (target: Extract<Pending, { kind: 'evidence' }>, evidence: DeliveryEvidence): Promise<AddResult | null> => {
    if (!attachments) return null;
    const where = { deliveryId: target.deliveryId, existingPhotos: target.existingPhotos, hasSignature: target.hasSignature };
    let refusal: AddResult | null = null;
    for (const photo of evidence.photos) {
      const added = await attachments.add({ tripId: trip.id, kind: 'photo', file: photo, target: where });
      if (!added.ok && !refusal) refusal = added;
    }
    if (evidence.signature) {
      const added = await attachments.add({ tripId: trip.id, kind: 'signature', file: evidence.signature, target: where });
      if (!added.ok && !refusal) refusal = added;
    }
    if (!refusal) {
      setLive('Anexos guardados. Serão enviados em seguida.');
      if (online) void attachments.upload().catch(() => undefined);
    }
    return refusal;
  };

  const submitDelivery = async (stop: TripStopView, correction: boolean, value: DeliveryFormValue, evidence?: DeliveryEvidence): Promise<void> => {
    setDialogError(null);
    setDialogFields({});
    const previous = correction ? deliveriesOf(stop.id).filter((d) => !deliveriesOf(stop.id).some((other) => other.supersedesId === d.id)).at(-1) : undefined;
    const done = await perform(
      `${correction ? 'correct' : 'deliver'}:${stop.id}`,
      (id) => service.registerDelivery(organizationId, trip.id, stop.id, value, previous?.id, id),
      (result) => `${correction ? 'Correção registrada' : 'Entrega registrada'} na parada ${stop.position ?? ''}${result.stopStatus === 'with_divergence' ? ', com divergência' : ''}${result.outsideGeofence === true ? '. Atenção: a posição está fora da geocerca da unidade' : ''}.`,
      false,
    );
    if (done.ok) { closeDialog(); if (evidence) await keepEvidence(evidence, done); return; }
    if (done.failure.kind === 'invalid' && done.failure.fields) {
      const mapped: FieldErrors = {};
      for (const [field, message] of Object.entries(done.failure.fields)) mapped[field.startsWith('results.') ? field : DELIVERY_SERVER_FIELDS[field] ?? 'form'] = message;
      if (!('form' in mapped)) { setDialogFields(mapped); setDialogError('Revise os campos indicados.'); return; }
    }
    setDialogError(done.text.message);
  };

  return (
    <section aria-labelledby="trip-detail-title" className="flex flex-col gap-6">
      <TripAnnouncer message={live} />
      <div className="flex flex-col gap-4 tablet:flex-row tablet:items-start tablet:justify-between">
        <div className="min-w-0">
          <p className="text-legenda font-semibold uppercase text-azul-profundo">Viagem</p>
          <h2 id="trip-detail-title" className="mt-1 break-words text-h2 font-bold text-navy">{`Viagem n.º ${trip.number}`}</h2>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <TripStatusBadge status={trip.status} />
            {detail.overdue && <OverdueBadge />}
          </div>
        </div>
        <div className="flex flex-col gap-2 tablet:items-end">
          <div className="flex flex-wrap gap-2">
            <a className={secondaryLinkClass} href="/viagens">Voltar à lista</a>
            {editable && <a className={secondaryLinkClass} href={`/viagens/${trip.id}/editar`}>Editar viagem</a>}
            {abilities.operate && trip.status === 'planned' && (
              <Button disabled={!online || busy} loading={busyKey === 'start_loading'} loadingLabel="Iniciando…"
                onClick={() => void perform('start_loading', (id) => service.startLoading(organizationId, trip.id, trip.version, id), 'Carregamento iniciado.')}>Iniciar carregamento</Button>
            )}
            {abilities.operate && trip.status === 'loading' && !anyChecked && (
              <Button variant="secundario" disabled={!online || busy} loading={busyKey === 'revert_loading'} loadingLabel="Desfazendo…"
                onClick={() => void perform('revert_loading', (id) => service.revertLoading(organizationId, trip.id, trip.version, id), 'Carregamento desfeito. A viagem voltou a planejada.')}>Desfazer carregamento</Button>
            )}
            {abilities.operate && trip.status === 'loading' && (
              <Button disabled={!online || busy || startBlocker !== null} aria-describedby={startBlocker ? 'start-blocker' : undefined} loading={busyKey === 'start_trip'} loadingLabel="Iniciando…"
                onClick={() => void perform('start_trip', (id) => service.startTrip(organizationId, trip.id, trip.version, id), 'Viagem iniciada. Os cilindros estão em trânsito e bloqueados (lógico).')}>Iniciar viagem</Button>
            )}
            {abilities.operate && trip.status === 'in_progress' && (
              <Button disabled={!online || busy || completeBlocker !== null} aria-describedby={completeBlocker ? 'complete-blocker' : undefined} loading={busyKey === 'complete_trip'} loadingLabel="Concluindo…"
                onClick={() => void perform('complete_trip', (id) => service.completeTrip(organizationId, trip.id, trip.version, id), 'Viagem concluída.')}>Concluir viagem</Button>
            )}
            {canCancel && (
              <Button variant="secundario" disabled={!online || busy} onClick={(event) => { setDialogError(null); setPending({ kind: 'cancel', trigger: event.currentTarget }); }}>Cancelar viagem</Button>
            )}
          </div>
          {abilities.operate && trip.status === 'in_progress' && completeBlocker && <p id="complete-blocker" className="text-corpo text-texto-secundario">{completeBlocker}</p>}
          {abilities.operate && trip.status === 'loading' && startBlocker && <p id="start-blocker" className="text-corpo text-texto-secundario">{startBlocker}</p>}
          {!online && abilities.operate && <p className="text-corpo text-texto-secundario">Esta operação exige conexão.</p>}
        </div>
      </div>

      {!online && <TripNotice variant="informacao">{queueable ? QUEUE_NOTICE : 'Sem conexão. As ações que alteram a viagem exigem conexão.'}</TripNotice>}
      {failure && (failure.tone === 'error'
        ? (
          <Alert ref={failureRef} tabIndex={-1} variant="erro" {...(failure.title ? { title: failure.title } : {})}>
            <p>{failure.message}</p>
            {failure.tripLink && <a className="font-semibold underline" href={`/viagens/${failure.tripLink.id}`}>{`Abrir a viagem n.º ${failure.tripLink.number}`}</a>}
          </Alert>
        )
        : <TripNotice variant="informacao">{failure.message}</TripNotice>)}
      {trip.status === 'cancelled' && trip.cancelReason && <TripNotice variant="alerta" title="Viagem cancelada">{trip.cancelReason}</TripNotice>}
      {trip.status === 'in_progress' && detail.items.some((item) => item.lockStatus === 'locked') && (
        <TripNotice variant="informacao" title="Bloqueio lógico">O bloqueio registra a reserva dos cilindros. A trava do lacre será comandada e confirmada pelo dispositivo na Fase 6.</TripNotice>
      )}
      {detail.warnings.length > 0 && (
        <TripNotice variant="alerta" title="Atenção">
          <ul role="list" className="flex flex-col gap-1">{detail.warnings.map((warning) => <li key={warning}>{WARNING_TEXT[warning]}</li>)}</ul>
        </TripNotice>
      )}

      {trip.status === 'loading' && (abilities.operate || abilities.exception) && (
        <LoadingPanel stops={activeStops} items={detail.items} canOperate={abilities.operate} canRemove={abilities.exception} online={online} queueable={queueable} busyKey={busyKey} highlighted={highlighted}
          onCheck={(item) => void perform(`check:${item.id}`, (id) => service.checkItem(organizationId, trip.id, item.id, id), `Cilindro ${item.cylinder.serialNumber} conferido.`, true, `Cilindro ${item.cylinder.serialNumber} registrado neste aparelho. Pendente de envio.`)}
          onUncheck={(item) => void perform(`uncheck:${item.id}`, (id) => service.uncheckItem(organizationId, trip.id, item.id, id), `Conferência de ${item.cylinder.serialNumber} desfeita.`, true, `Desfazer a conferência de ${item.cylinder.serialNumber} registrado neste aparelho. Pendente de envio.`)}
          onRemove={(item, trigger) => { setDialogError(null); setPending({ kind: 'remove', item, trigger }); }}
          {...(fieldService || queueable ? { onReadCylinder: readCylinder } : {})} />
      )}

      <DetailBlock title="Dados da viagem" titleId="trip-data-title" rows={detail.offline === true ? [
        { label: 'Data prevista', value: formatDate(trip.plannedDate) },
        { label: 'Veículo', value: formatPlate(detail.vehicle.plate) },
        { label: 'Guardada neste aparelho em', value: formatDateTime(trip.createdAt) },
      ] : [
        { label: 'Data prevista', value: formatDate(trip.plannedDate) },
        { label: 'Veículo', value: <a className="font-semibold text-azul-profundo underline" href={`/veiculos/${detail.vehicle.id}`}>{formatPlate(detail.vehicle.plate)}</a> },
        { label: 'Capacidade do veículo', value: `${detail.vehicle.capacityCylinders} cilindros` },
        { label: 'Licenciamento do veículo', value: detail.vehicle.licensingDueOn ? `${VALIDITY_LABELS[detail.vehicle.licensingStatus]} (${formatDate(detail.vehicle.licensingDueOn)})` : VALIDITY_LABELS[detail.vehicle.licensingStatus] },
        { label: 'Motorista', value: <a className="font-semibold text-azul-profundo underline" href={`/motoristas/${detail.driver.id}`}>{detail.driver.fullName}</a> },
        { label: 'CNH do motorista', value: `${VALIDITY_LABELS[detail.driver.cnhStatus]} (${formatDate(detail.driver.cnhValidUntil)})` },
        { label: 'Planejada por', value: trip.createdByName },
        { label: 'Planejada em', value: formatDateTime(trip.createdAt) },
        { label: 'Iniciada em', value: trip.startedAt ? formatDateTime(trip.startedAt) : null },
        { label: 'Observações', value: trip.notes },
      ]} />

      <Card as="section" aria-labelledby="trip-stops-title" className="flex flex-col gap-4">
        <h3 id="trip-stops-title" className="text-h3 font-semibold text-navy">Paradas e carga</h3>
        {activeStops.length === 0 ? <p className="text-corpo">Esta viagem não tem paradas.</p> : (
          <ol className="flex flex-col gap-4" aria-label="Paradas da viagem">
            {activeStops.map((stop) => (
              <StopCard key={stop.id} stop={stop} items={detail.items.filter((item) => item.stopId === stop.id)} deliveries={deliveriesOf(stop.id)}
                tripInProgress={trip.status === 'in_progress'} canOperate={abilities.operate} canUnlock={abilities.unlock} canException={abilities.exception} canReturn={canReturn} online={online} queueable={queueable} busyKey={busyKey}
                onReturn={(item, trigger) => { setDialogError(null); setPending({ kind: 'return', item, trigger }); }}
                onUnlock={(item, trigger) => { setDialogError(null); setPending({ kind: 'unlock', item, trigger }); }}
                onArrive={(target) => void perform(`arrive:${target.id}`, (id) => service.arriveStop(organizationId, trip.id, target.id, id),
                  (value) => `Chegada registrada na parada ${target.position ?? ''}${value.outOfOrder ? ', fora da ordem planejada' : ''}.`)}
                onArriveWithPosition={(target, payload) => void perform(`arrive:${target.id}`, (id) => service.arriveStop(organizationId, trip.id, target.id, id, payload),
                  (value) => `Chegada registrada na parada ${target.position ?? ''}${value.outOfOrder ? ', fora da ordem planejada' : ''}.${value.outsideGeofence === true ? ' Atenção: a posição está fora da geocerca da unidade.' : ''}`)}
                onDeliver={(target, trigger) => { setDialogError(null); setDialogFields({}); setPending({ kind: 'deliver', stop: target, trigger }); }}
                onCorrect={(target, trigger) => { setDialogError(null); setDialogFields({}); setPending({ kind: 'correct', stop: target, trigger }); }}
                {...(() => { const evidence = evidenceFor(stop); return evidence ? { evidence } : {}; })()} />
            ))}
          </ol>
        )}
      </Card>

      {abilities.history && detail.offline !== true && (
        <Card as="section" aria-labelledby="trip-history-title" className="flex flex-col gap-4">
          <h3 id="trip-history-title" className="text-h3 font-semibold text-navy">Histórico</h3>
          <TripHistoryList organizationId={organizationId} tripId={trip.id} service={service} refreshKey={trip.version}
            names={{ [detail.vehicle.id]: formatPlate(detail.vehicle.plate), [detail.driver.id]: detail.driver.fullName }} />
        </Card>
      )}

      {pending?.kind === 'remove' && (
        <RemoveItemDialog
          serialNumber={pending.item.cylinder.serialNumber} busy={busyKey === 'remove'} error={dialogError} returnFocusTo={pending.trigger}
          onCancel={closeDialog}
          onConfirm={(justification) => {
            void (async () => {
              const item = pending.item;
              setDialogError(null);
              const done = await perform('remove', (id) => service.removeItem(organizationId, trip.id, item.id, justification, id), `Cilindro ${item.cylinder.serialNumber} retirado da viagem.`);
              if (done.ok) closeDialog();
              else setDialogError('Não foi possível retirar o cilindro. Veja o aviso no alto da tela.');
            })();
          }}
        />
      )}
      {pending?.kind === 'cancel' && (
        <CancelDialog
          tripNumber={trip.number} status={trip.status === 'in_progress' ? 'in_progress' : trip.status === 'loading' ? 'loading' : 'planned'} busy={busyKey === 'cancel_trip'} error={dialogError}
          returnFocusTo={pending.trigger} onCancel={closeDialog}
          onConfirm={(justification) => {
            void (async () => {
              setDialogError(null);
              const done = await perform('cancel_trip', (id) => service.cancelTrip(organizationId, trip.id, trip.version, justification, id),
                (result) => `Viagem cancelada.${result.inTransit > 0 ? ` ${result.inTransit} ${result.inTransit === 1 ? 'cilindro continua' : 'cilindros continuam'} em trânsito até o retorno ao estoque.` : ''}`, false);
              if (done.ok) closeDialog();
              else setDialogError(done.text.message);
            })();
          }}
        />
      )}
      {pending?.kind === 'return' && (
        <ReturnItemDialog
          serialNumber={pending.item.cylinder.serialNumber} busy={busyKey === 'return'} error={dialogError} returnFocusTo={pending.trigger} onCancel={closeDialog}
          onConfirm={(justification) => {
            void (async () => {
              const item = pending.item;
              setDialogError(null);
              const done = await perform('return', (id) => service.returnItem(organizationId, trip.id, item.id, justification, id), `Cilindro ${item.cylinder.serialNumber} devolvido ao estoque.`, false);
              if (done.ok) closeDialog();
              else setDialogError(done.text.message);
            })();
          }}
        />
      )}
      {pending?.kind === 'unlock' && (
        <UnlockDialog
          item={pending.item} busy={busyKey === 'unlock'} error={dialogError} returnFocusTo={pending.trigger} onCancel={closeDialog}
          onConfirm={(justification) => {
            void (async () => {
              const item = pending.item;
              setDialogError(null);
              const done = await perform('unlock', (id) => service.registerUnlock(organizationId, trip.id, item.id, justification, id),
                (result) => `Desbloqueio ${result.exceptional ? 'excepcional ' : ''}de ${item.cylinder.serialNumber} registrado. A situação da entrega não mudou.`, false);
              if (done.ok) closeDialog();
              else setDialogError(done.text.message);
            })();
          }}
        />
      )}
      {pending?.kind === 'evidence' && (
        <AddEvidenceDialog stopLabel={`parada ${pending.stop.position ?? ''}`} existingPhotos={pending.existingPhotos} hasSignature={pending.hasSignature} usedBytes={usedBytes} returnFocusTo={pending.trigger}
          onCancel={closeDialog} onSave={(evidence) => saveLaterEvidence(pending, evidence)} />
      )}
      {(pending?.kind === 'deliver' || pending?.kind === 'correct') && (() => {
        const correction = pending.kind === 'correct';
        const stopDeliveries = deliveriesOf(pending.stop.id);
        const previous = correction ? stopDeliveries.filter((d) => !stopDeliveries.some((other) => other.supersedesId === d.id)).at(-1) ?? null : null;
        const items = detail.items.filter((item) => item.stopId === pending.stop.id && item.itemStatus === (correction ? 'not_delivered' : 'in_transit'));
        return (
          <DeliveryDialog stop={pending.stop} items={items} previous={previous} busy={busy} error={dialogError} serverErrors={dialogFields} returnFocusTo={pending.trigger}
            online={online || queueable} {...(fieldService || queueable ? { resolve: resolveRead } : {})}
            onCancel={closeDialog} onSubmit={(value, evidence) => void submitDelivery(pending.stop, correction, value, evidence)}
            {...(attachments ? { evidence: { usedBytes } } : {})} />
        );
      })()}
    </section>
  );
}

export function TripDetailPage(): React.JSX.Element {
  const { service, organizationId, online } = useTripService();
  const fieldService = useFieldService();
  const offlineField = useOfflineField();
  const { permissions } = usePermissions();
  const { logout } = useAuth();
  const route = resolveTripRoute(window.location.pathname);
  const tripId = route?.kind === 'detail' ? route.id : '';
  const has = (code: string): boolean => permissions?.tenant.includes(code) ?? false;
  const abilities: TripAbilities = {
    ...NO_ABILITIES,
    write: has('trip.write'), operate: has('trip.operate'), exception: has('trip.exception'), cancel: has('trip.cancel'),
    unlock: has('trip.unlock'), history: has('trip.history'), recipient: has('trip.recipient'),
  };
  return (
    <AccessGate permission="trip.read">
      <TripDetailView key={`${organizationId}:${tripId}`} organizationId={organizationId} tripId={tripId} service={service} online={online} abilities={abilities} onSessionExpired={() => void logout()} fieldService={fieldService}
        attachments={abilities.operate ? offlineField?.attachments ?? null : null} />
    </AccessGate>
  );
}
