import React, { useEffect, useState } from 'react';
import type { AttachmentView } from '@/application/field/attachment-service';
import type { ConflictView, DecisionResult } from '@/application/field/conflict-service';
import { buildSyncOverview, type SyncGroup } from '@/application/field/sync-overview';
import { MAX_QUEUE_ATTACHMENT_BYTES, MAX_QUEUE_OPERATIONS, queueUsage } from '@/domain/field/attachment-limits';
import type { OfflineTrip } from '@/domain/field/offline-trip';
import { formatDateTime } from '@/domain/cylinders/format';
import { Alert, Button, Card, EmptyState, ErrorState, Loading } from '@/design-system';
import { checkStorage, type StorageStatus } from '@/infrastructure/local-database/storage-persistence';
import type { OutboxItem } from '@/infrastructure/synchronization/sync-outbox';
import { useFieldSync } from '@/app/field/field-sync-context';
import { useOfflineField } from '@/app/field/offline-field-context';
import { usePermissions } from '@/app/navigation/permissions-context';
import { ConflictPanel } from './conflict-panel';
import { useOnlineStatus } from '@/app/use-online-status';

// Tela Sincronização (Spec 010, RF-004, RF-029, RF-030; contracts/telas-e-fluxos.md §2): o que está no aparelho e ainda não foi confirmado pelo
// servidor, por viagem, em texto. Não está no menu: abre pelo indicador da barra superior. Nada some daqui por tempo ou limite (RF-026).
const REFRESH_MS = 3_000;
const OFFLINE_NOTICE = 'Sem conexão. Os registros ficam neste aparelho e serão enviados quando houver conexão.';

export interface SyncSnapshot { items: OutboxItem[]; trips: OfflineTrip[]; conflicts?: ConflictView[]; attachments?: AttachmentView[] }

// Ações da tela (Spec 010, RF-008, RF-013): enviar agora, tentar de novo e decidir sobre conflitos. Sem elas a tela só mostra a fila.
export interface SyncActions {
  syncing: boolean;
  syncNow: () => Promise<void>;
  retry: (itemId: string) => Promise<void>;
  canDecide: boolean;
  discard: (conflictId: string, justification: string) => Promise<DecisionResult>;
  resubmit: (conflictId: string) => Promise<DecisionResult>;
  // Anexo recusado pelo servidor: sai do aparelho por escolha da pessoa.
  removeAttachment?: (attachmentId: string) => Promise<void>;
}

export interface SyncViewProps {
  // Falso quando a fila não existe (sem organização ativa): a tela mostra o vazio.
  available: boolean;
  online: boolean;
  load: () => Promise<SyncSnapshot>;
  readStorage?: () => Promise<StorageStatus>;
  now?: () => Date;
  refreshMs?: number;
  actions?: SyncActions;
}

type State = { kind: 'loading' } | { kind: 'error' } | { kind: 'ready'; groups: SyncGroup[]; operations: number; attachmentBytes: number };

export function SyncView({ available, online, load, readStorage = () => checkStorage(), now = () => new Date(), refreshMs = REFRESH_MS, actions }: SyncViewProps): React.JSX.Element {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [conflicts, setConflicts] = useState<ConflictView[]>([]);
  const [version, setVersion] = useState(0);
  const [opened, setOpened] = useState<{ conflict: ConflictView; trigger: HTMLElement } | null>(null);
  const syncing = actions?.syncing ?? false;
  const [storage, setStorage] = useState<StorageStatus | null>(null);

  useEffect(() => {
    let active = true;
    const read = (): void => {
      load()
        .then((snapshot) => { if (active) { setConflicts(snapshot.conflicts ?? []); setState({
            kind: 'ready', groups: buildSyncOverview(snapshot.items, snapshot.trips, now(), snapshot.attachments ?? []),
            operations: snapshot.items.filter((entry) => entry.status !== 'synced' && entry.status !== 'discarded').length,
            attachmentBytes: (snapshot.attachments ?? []).reduce((total, entry) => total + entry.sizeBytes, 0),
          }); } })
        .catch(() => { if (active) setState({ kind: 'error' }); });
    };
    read();
    const timer = setInterval(read, refreshMs);
    return () => { active = false; clearInterval(timer); };
    // `now` e `load` mudam de identidade a cada renderização do pai; a leitura periódica não precisa recomeçar por isso.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [available, refreshMs, version, syncing]);
  useEffect(() => {
    let active = true;
    void readStorage().then((status) => { if (active) setStorage(status); }).catch(() => undefined);
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <section aria-labelledby="sync-title" className="flex flex-col gap-6">
      <div>
        <p className="text-legenda font-semibold uppercase text-azul-profundo">Campo</p>
        <h2 id="sync-title" className="mt-1 text-h2 font-bold text-navy">Sincronização</h2>
        <p className="mt-2 text-corpo text-grafite">O que você registrou e ainda não foi confirmado pelo servidor fica aqui, neste aparelho.</p>
      </div>
      {!online && <Alert variant="informacao">{OFFLINE_NOTICE}</Alert>}
      {storage?.warning && <Alert variant="alerta" title={storage.persistent ? 'Pouco espaço' : 'Armazenamento não protegido'}>{storage.warning}</Alert>}
      {actions && state.kind === 'ready' && state.groups.length > 0 && (
        <div className="flex flex-wrap items-center gap-4">
          <Button disabled={!online || syncing} loading={syncing} loadingLabel="Enviando…" aria-describedby={!online ? 'sync-offline-reason' : undefined}
            onClick={() => void actions.syncNow().then(() => setVersion((value) => value + 1))}>Enviar agora</Button>
          {!online && <span id="sync-offline-reason" className="text-corpo text-grafite">Sem conexão. O envio recomeça quando houver conexão.</span>}
        </div>
      )}
      {actions && <p role="status" aria-live="polite" className="sr-only">{syncing ? 'Enviando os registros…' : ''}</p>}
      {state.kind === 'ready' && (() => {
        const usage = queueUsage(state.operations, state.attachmentBytes);
        const mb = (bytes: number): string => (bytes / (1024 * 1024)).toFixed(1).replace('.', ',');
        return (
          <>
            {usage.operations !== 'ok' && (
              <Alert variant="alerta" title={usage.operations === 'full' ? 'Fila cheia' : 'Fila quase cheia'}>
                {`${state.operations} de ${MAX_QUEUE_OPERATIONS} registros no aparelho. O que você registrar continua sendo guardado. Conecte-se para enviar e liberar espaço.`}
              </Alert>
            )}
            {usage.attachments !== 'ok' && (
              <Alert variant="alerta" title={usage.attachments === 'full' ? 'Sem espaço para novas fotos' : 'Espaço de fotos quase acabando'}>
                {`${mb(state.attachmentBytes)} MB de ${mb(MAX_QUEUE_ATTACHMENT_BYTES)} MB em fotos e assinaturas. ${usage.attachments === 'full' ? 'Novas fotos não serão guardadas, e a entrega é registrada sem elas.' : 'Conecte-se para enviar e liberar espaço.'}`}
              </Alert>
            )}
          </>
        );
      })()}
      {state.kind === 'loading' && <Loading variant="pagina" busy label="Carregando a fila…" />}
      {state.kind === 'error' && <ErrorState title="Não foi possível ler a fila deste aparelho" message="Nada foi perdido. Feche e abra o aplicativo ou tente de novo em instantes." />}
      {state.kind === 'ready' && (state.groups.length === 0
        ? <EmptyState title="Nada pendente. Tudo foi enviado." description="Quando você registrar algo sem conexão, aparecerá aqui até o servidor confirmar." />
        : state.groups.map((group) => (
          <Card key={group.tripId} as="section" aria-labelledby={`sync-trip-${group.tripId}`} className="flex flex-col gap-4">
            <h3 id={`sync-trip-${group.tripId}`} className="text-h3 font-semibold text-navy">{group.title}</h3>
            {group.attachments && (group.attachments.text !== '' || group.attachments.failed.length > 0) && (
              <div className="flex flex-col gap-2">
                {group.attachments.text !== '' && <p className="text-corpo font-semibold text-grafite">{`Anexos: ${group.attachments.text}`}</p>}
                {group.attachments.failed.map((failed) => (
                  <div key={failed.id} className="flex flex-col gap-2 rounded-controle border border-erro bg-erro-fundo p-4">
                    <p className="break-words text-corpo"><span className="font-semibold">{`${failed.label}: recusado.`}</span>{` ${failed.reason}`}</p>
                    {actions?.removeAttachment && (
                      <Button variant="secundario" className="self-start" aria-label={`Remover ${failed.label.toLowerCase()} recusada do aparelho`}
                        onClick={() => void actions.removeAttachment?.(failed.id).then(() => setVersion((value) => value + 1))}>Remover do aparelho</Button>
                    )}
                  </div>
                ))}
              </div>
            )}
            {group.rows.length > 0 && <ul role="list" aria-label="Registros da viagem" className="flex flex-col gap-2">
              {group.rows.map((row) => (
                <li key={row.id} className={`flex flex-col gap-1 rounded-controle border p-4 ${row.rawStatus === 'conflict' ? 'border-erro bg-erro-fundo' : row.old ? 'border-alerta-texto bg-alerta-fundo' : 'border-borda-suave'}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="min-w-0 break-words text-corpo font-semibold text-navy">{row.label}</span>
                    <span className="text-corpo font-semibold text-grafite">{row.status}</span>
                  </div>
                  <p className="text-legenda text-texto-secundario">{`Registrado neste aparelho em ${formatDateTime(row.queuedAt)}.`}</p>
                  {row.old && <p className="text-legenda font-semibold text-alerta-texto">Há mais de 24 horas sem envio</p>}
                  {row.reason && <p className="break-words text-corpo">{row.reason}</p>}
                  {actions && row.rawStatus === 'failed' && (
                    <Button variant="secundario" className="self-start" aria-label={`Tentar de novo: ${row.label}`}
                      onClick={() => void actions.retry(row.id).then(() => setVersion((value) => value + 1))}>Tentar de novo</Button>
                  )}
                  {row.rawStatus === 'conflict' && conflicts.some((entry) => entry.itemId === row.id) && (
                    <Button variant="secundario" className="self-start" aria-label={`Ver conflito: ${row.label}`}
                      onClick={(event) => setOpened({ conflict: conflicts.find((entry) => entry.itemId === row.id)!, trigger: event.currentTarget })}>Ver conflito</Button>
                  )}
                </li>
              ))}
            </ul>}
          </Card>
        )))}
      {opened && actions && (
        <ConflictPanel conflict={opened.conflict} online={online} canDecide={actions.canDecide} returnFocusTo={opened.trigger} onClose={() => { setOpened(null); setVersion((value) => value + 1); }}
          onDiscard={(justification) => actions.discard(opened.conflict.conflictId, justification)} onResubmit={() => actions.resubmit(opened.conflict.conflictId)} />
      )}
    </section>
  );
}

export function SyncPage(): React.JSX.Element {
  const field = useOfflineField();
  const fieldSync = useFieldSync();
  const { permissions } = usePermissions();
  const online = useOnlineStatus();
  const [syncing, setSyncing] = useState(fieldSync?.sync.isSyncing() ?? false);
  useEffect(() => {
    if (!fieldSync) return undefined;
    return fieldSync.sync.subscribe(() => setSyncing(fieldSync.sync.isSyncing()));
  }, [fieldSync]);
  const actions: SyncActions | undefined = field && fieldSync ? {
    syncing,
    syncNow: async () => { await fieldSync.sync.syncNow(); },
    retry: async (itemId) => { await field.queue.retry(itemId); },
    canDecide: permissions?.tenant.includes('trip.operate') ?? false,
    discard: (conflictId, justification) => fieldSync.conflicts.discard(conflictId, justification),
    resubmit: (conflictId) => fieldSync.conflicts.resubmit(conflictId),
    removeAttachment: async (attachmentId) => { await field.attachments.remove(attachmentId); },
  } : undefined;
  return (
    <SyncView
      available={field !== null}
      online={online}
      load={async () => (field
        ? { items: await field.queue.list(), trips: await field.trips.list(), conflicts: fieldSync ? await fieldSync.conflicts.list() : [], attachments: await field.attachments.list() }
        : { items: [], trips: [] })}
      {...(actions ? { actions } : {})}
    />
  );
}
