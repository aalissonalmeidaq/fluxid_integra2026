import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { usePermissions } from '@/app/navigation/permissions-context';
import { watchSeals, type RealtimePort } from '@/application/seals/seal-realtime';
import type { SealService } from '@/application/seals/seal-service';
import type { GeocodingService, ReverseGeocodedAddress } from '@/application/registry/geocoding-service';
import type { SealDetail } from '@/application/seals/seal-views';
import type { MapPoint } from '@/components/maps/map-types';
import { Alert, Button, ErrorState, Loading } from '@/design-system';
import { contactAge, positionAge } from '@/domain/seals/seal-age';
import { sealAbilities } from '@/domain/seals/seal-abilities';
import { sealPositionQuality } from '@/domain/seals/seal-position-format';
import { alertKind, alertSeverity, COMMAND_KIND_LABELS, commandOrigin, commandStatus, health, lockState, sealState } from '@/domain/seals/seal-vocabulary';
import { AccessGate } from '@/pages/cylinders/components/access-gate';
import { ReasonDialog } from '@/pages/cylinders/components/reason-dialog';
import { formatDateTime } from '@/domain/cylinders/format';
import { ReturnDeviceDialog } from './components/return-device-dialog';
import { SealBadge } from './components/seal-badge';
import { SealPositionMap } from './components/seal-position-map';
import { SealPositionHistory } from './components/seal-position-history';
import { WifiNetworksPanel } from './components/wifi-networks-panel';
import { useSealService } from './use-seal-service';

// Detalhe do dispositivo do lacre (Spec 012, RF-031 a RF-034a; História 5): saúde, trava, bateria, rede em uso e nomes das redes
// guardadas (nunca senha), vínculo atual e anteriores, comandos e alertas. Spec 013 (RF-013a, RF-018): o lacre chega pelo Master; o
// tenant não gera chave nem desativa, e pode devolvê-lo à plataforma. Devolver e desvincular pedem justificativa.

type Load = { kind: 'loading' } | { kind: 'ready'; seal: SealDetail } | { kind: 'not_found' } | { kind: 'error' };
type Pending = { kind: 'return' | 'unbind'; trigger: HTMLElement } | null;
type PositionAddressState = { positionKey: string; value: ReverseGeocodedAddress | 'loading' | 'confirm' | 'error' } | null;

const FAILURE: Record<string, string> = {
  cylinder_in_trip: 'O cilindro está numa viagem em andamento.',
  justification_required: 'Explique o motivo com 5 a 500 caracteres.',
  seal_inactive: 'O dispositivo já está fora de operação.',
  not_found: 'Este lacre não está mais neste tenant.',
  no_binding: 'O lacre não está vinculado a nenhum cilindro.',
  access_denied: 'Você não tem permissão para esta ação.',
  offline: 'Sem conexão: comandos de lacre exigem conexão.',
};
const UNBIND_REASON: Record<string, string> = {
  manual: 'desvinculado', device_inactivated: 'dispositivo desativado', cylinder_inactivated: 'cilindro inativado', replaced: 'lacre trocado',
};

function Fact({ label, children }: { label: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="min-w-0">
      <dt className="text-legenda text-texto-secundario">{label}</dt>
      <dd className="m-0 break-words text-corpo text-grafite">{children}</dd>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }): React.JSX.Element {
  const id = useId();
  return (
    <section aria-labelledby={id} className="flex flex-col gap-2 rounded-card border border-borda-suave bg-branco p-4">
      <h3 id={id} className="m-0 text-h3 font-semibold text-navy">{title}</h3>
      {children}
    </section>
  );
}

export interface SealDetailViewProps {
  service: SealService | null;
  organizationId: string;
  deviceId: string;
  online: boolean;
  realtime: RealtimePort | null;
  permissions: readonly string[];
  geocoder?: GeocodingService | null;
  now?: () => Date;
}

export function SealDetailView({ service, organizationId, deviceId, online, realtime, permissions, geocoder = null, now = () => new Date() }: SealDetailViewProps): React.JSX.Element {
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const [pending, setPending] = useState<Pending>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [positionAddress, setPositionAddress] = useState<PositionAddressState>(null);

  const request = useCallback(() => (service && organizationId ? service.getSeal(organizationId, deviceId) : Promise.resolve(null)), [service, organizationId, deviceId]);
  const apply = useCallback((outcome: Awaited<ReturnType<typeof request>>) => {
    if (outcome === null) return;
    if (outcome.kind === 'success') setLoad({ kind: 'ready', seal: outcome.value });
    else if (outcome.kind === 'not_found' || outcome.kind === 'access_denied') setLoad({ kind: 'not_found' });
    else setLoad((current) => (current.kind === 'ready' ? current : { kind: 'error' }));
  }, []);
  const reload = useCallback(() => { void request().then(apply); }, [request, apply]);

  useEffect(() => {
    if (!online) return undefined;
    let active = true;
    void request().then((outcome) => { if (active) apply(outcome); });
    return () => { active = false; };
  }, [online, request, apply]);
  useEffect(() => {
    if (!online || !service || !realtime || !organizationId) return undefined;
    const watch = watchSeals({ port: realtime, organizationId, onChange: (signal) => { if (signal === null || signal.deviceId === deviceId) reload(); } });
    return () => watch.stop();
  }, [online, service, realtime, organizationId, deviceId, reload]);
  const positionKey = load.kind === 'ready' && load.seal.position
    ? `${load.seal.position.latitude}:${load.seal.position.longitude}:${load.seal.position.readAt}` : '';
  const currentPositionAddress = positionAddress?.positionKey === positionKey ? positionAddress.value : null;

  // Endereço no balão do ponto do mapa: o mesmo estado do "Descobrir endereço" (consultar por um lado aparece no outro). O balão lê o
  // endereço ao abrir, por uma referência, para o ponto não ser recriado (e o balão fechado) quando a consulta termina.
  const knownAddress = useRef<{ positionKey: string; displayName: string } | null>(null);
  useEffect(() => {
    if (currentPositionAddress !== null && typeof currentPositionAddress === 'object') knownAddress.current = { positionKey, displayName: currentPositionAddress.displayName };
  }, [currentPositionAddress, positionKey]);
  const latitude = load.kind === 'ready' ? load.seal.position?.latitude : undefined;
  const longitude = load.kind === 'ready' ? load.seal.position?.longitude : undefined;
  const mapAddress = useMemo<MapPoint['address']>(() => {
    if (!geocoder || latitude === undefined || longitude === undefined) return undefined;
    return {
      known: () => (knownAddress.current?.positionKey === positionKey ? knownAddress.current.displayName : null),
      resolve: async () => {
        setPositionAddress({ positionKey, value: 'loading' });
        const outcome = await geocoder.reverseSeal(organizationId, deviceId, latitude, longitude, true);
        setPositionAddress({ positionKey, value: outcome.kind === 'found' ? outcome.address : 'error' });
        return outcome.kind === 'found' ? outcome.address.displayName : null;
      },
    };
  }, [geocoder, organizationId, deviceId, positionKey, latitude, longitude]);

  const confirm = async (justification: string) => {
    if (!service || !pending) return;
    setBusy(true);
    setError(null);
    const outcome = pending.kind === 'return'
      ? await service.returnDevice(organizationId, deviceId, justification)
      : await service.unbindSeal(organizationId, deviceId, justification);
    setBusy(false);
    if (outcome.kind === 'success') {
      setPending(null);
      setNotice(pending.kind === 'return'
        ? 'Lacre devolvido à plataforma. Ele sai da lista de lacres deste tenant e volta para o Master.' : 'Lacre desvinculado do cilindro.');
      reload();
    } else setError(FAILURE[outcome.kind] ?? 'Não foi possível concluir agora. Tente de novo.');
  };

  if (load.kind === 'loading') return online ? <Loading variant="pagina" busy label="Carregando o lacre…" /> : <p className="m-0 text-corpo text-grafite">Sem conexão: o lacre aparece quando a conexão voltar.</p>;
  if (load.kind === 'not_found') return <ErrorState variant="sem-permissao" title="Lacre não encontrado" message="Ele não existe nesta organização." />;
  if (load.kind === 'error') return <ErrorState title="Não foi possível carregar o lacre" message="Tente novamente em instantes." onRetry={() => { setLoad({ kind: 'loading' }); reload(); }} />;

  const seal = load.seal;
  const current = seal.bindings.find((binding) => binding.unboundAt === null) ?? null;
  const abilities = sealAbilities({ permissions, online, deviceActive: seal.status === 'active', bound: current !== null, lockState: seal.lockState,
    tripInProgress: false, underWatch: seal.watch !== null, unlockIsException: true });
  const open = (kind: NonNullable<Pending>['kind']) => (event: React.MouseEvent<HTMLButtonElement>) => { setError(null); setNotice(null); setPending({ kind, trigger: event.currentTarget }); };

  return (
    <article aria-labelledby="seal-detail-title" className="flex w-full min-w-0 flex-col gap-6">
      <div className="flex flex-col gap-2">
        <p className="m-0 text-legenda font-semibold uppercase text-azul-profundo"><a className="underline" href="/lacres">Lacres</a></p>
        <h2 id="seal-detail-title" className="m-0 break-words text-h2 font-bold text-navy">{seal.label}</h2>
        <p className="m-0 text-corpo text-texto-secundario"><code className="break-all">{seal.deviceCode}</code></p>
        <div className="flex flex-wrap items-center gap-2">
          <SealBadge presentation={health(seal.health)} />
          <SealBadge presentation={lockState(seal.lockState, seal.pendingCommand?.kind ?? null)} />
          {seal.status === 'inactive' && (
            <span className="text-corpo font-semibold text-erro">
              {seal.inactiveReason === 'returned' ? 'Devolvido à plataforma' : seal.inactiveReason === 'withdrawn' ? 'Retirado de operação pelo Master' : 'Desativado'}
            </span>
          )}
        </div>
      </div>

      {notice && <Alert variant="sucesso">{notice}</Alert>}
      {error && !pending && <Alert variant="erro">{error}</Alert>}

      {abilities.manageDevice.allowed && seal.status === 'active' && (
        <div className="flex flex-col gap-2">
          <Button variant="secundario" className="self-start" disabled={!online || seal.inTrip} onClick={open('return')}>Devolver à plataforma</Button>
          {seal.inTrip && <p className="m-0 text-legenda text-texto-secundario">O cilindro deste lacre está numa viagem em andamento.</p>}
          {!online && <p className="m-0 text-legenda text-texto-secundario">Sem conexão: comandos de lacre exigem conexão.</p>}
        </div>
      )}

      <dl className="m-0 grid gap-4 tablet:grid-cols-2 desktop:grid-cols-4">
        <Fact label="Bateria">{seal.batteryPct === null ? '—' : `${seal.batteryPct}%`}</Fact>
        <Fact label="Último contato">{contactAge(seal.lastSeenAt, now())}</Fact>
        <Fact label="Estado do lacre"><SealBadge presentation={sealState(seal.sealState)} /></Fact>
        <Fact label="Intervalo de envio">{seal.reportIntervalS} s</Fact>
        <Fact label="Identificador do lacre">{seal.sealCode ?? 'Ainda não ativado'}</Fact>
        <Fact label="Ativado">{seal.activatedAt ? positionAge(seal.activatedAt, now()) : '—'}</Fact>
        <Fact label="Firmware">{seal.firmwareVersion ?? '—'}</Fact>
        <Fact label="Aprovado em">{formatDateTime(seal.approvedAt)}</Fact>
        <Fact label="Origem">{seal.origin === 'enrollment' ? 'Aprovado pelo Master' : 'Cadastro manual (Spec 012)'}</Fact>
      </dl>

      <Section title="Cilindro">
        {current ? (
          <div className="flex flex-col gap-2">
            <p className="m-0 text-corpo text-grafite">
              Vinculado a <a className="font-semibold text-azul-profundo underline" href={`/cilindros/${current.cylinderId}`}>{current.serialNumber}</a> {positionAge(current.boundAt, now())}.
            </p>
            {abilities.unbind.allowed && <Button variant="secundario" className="self-start" onClick={open('unbind')}>Desvincular</Button>}
          </div>
        ) : <p className="m-0 text-corpo text-grafite">Sem cilindro. Vincule pelo detalhe do cilindro (lendo o identificador ou escolhendo na lista).</p>}
        {seal.bindings.some((binding) => binding.unboundAt !== null) && (
          <ul aria-label="Vínculos anteriores" className="m-0 flex list-none flex-col gap-1 p-0">
            {seal.bindings.filter((binding) => binding.unboundAt !== null).map((binding) => (
              <li key={`${binding.cylinderId}-${binding.boundAt}`} className="text-legenda text-texto-secundario">
                {binding.serialNumber}: de {positionAge(binding.boundAt, now())} a {positionAge(binding.unboundAt, now())}{binding.unbindReason ? ` (${UNBIND_REASON[binding.unbindReason] ?? binding.unbindReason})` : ''}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Posição enviada">
        {seal.position ? (
          <div className="flex flex-col gap-4">
            <p className="m-0 text-corpo text-grafite">
              Recebida pelo Supabase {positionAge(seal.position.readAt, now())}.{' '}
              <span className="text-texto-secundario">{sealPositionQuality(seal.position.quality, seal.position.accuracyM)}.</span>
            </p>
            {geocoder && (
              <div className="flex flex-col items-start gap-2">
                {currentPositionAddress === null && <Button variant="secundario" disabled={!online} onClick={() => setPositionAddress({ positionKey, value: 'confirm' })}>Descobrir endereço</Button>}
                {currentPositionAddress === 'confirm' && (
                  <Alert variant="informacao" title="Consultar o endereço desta posição?">
                    <p>As coordenadas serão enviadas ao OpenStreetMap/Nominatim. O endereço encontrado é aproximado e não altera o cadastro.</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Button onClick={() => {
                        setPositionAddress({ positionKey, value: 'loading' });
                        void geocoder.reverseSeal(organizationId, deviceId, seal.position!.latitude, seal.position!.longitude, true)
                          .then((outcome) => setPositionAddress({ positionKey, value: outcome.kind === 'found' ? outcome.address : 'error' }));
                      }}>Concordo e buscar endereço</Button>
                      <Button variant="secundario" onClick={() => setPositionAddress(null)}>Cancelar</Button>
                    </div>
                  </Alert>
                )}
                {currentPositionAddress === 'loading' && <Loading label="Buscando o endereço…" />}
                {currentPositionAddress === 'error' && <Alert variant="alerta">Não foi possível localizar o endereço desta posição. As coordenadas continuam disponíveis no mapa.</Alert>}
                {currentPositionAddress !== null && typeof currentPositionAddress === 'object' && (
                  <p className="m-0 text-corpo text-grafite"><strong>Endereço aproximado:</strong> {currentPositionAddress.displayName}</p>
                )}
              </div>
            )}
            <SealPositionMap
              service={service}
              organizationId={organizationId}
              deviceId={deviceId}
              position={seal.position}
              title="Última posição enviada pelo lacre"
              label={seal.label}
              details={[seal.deviceCode, seal.watch ? `Vigilância: ${seal.watch.siteName}` : 'Posição informada pelo lacre']}
              caption={`Leitura ${positionAge(seal.position.readAt, now())}.`}
              // O balão chama `known` e `resolve` só ao abrir e no clique (eventos do Leaflet), nunca durante a renderização.
              // eslint-disable-next-line react-hooks/refs
              {...(mapAddress ? { address: mapAddress } : {})}
            />
          </div>
        ) : <p className="m-0 text-corpo text-grafite">Este lacre ainda não enviou uma posição.</p>}
        {service && <SealPositionHistory service={service} organizationId={organizationId} target={{ deviceId }} now={now} />}
      </Section>

      <Section title="Rede Wi-Fi">
        <WifiNetworksPanel service={service} organizationId={organizationId} seal={seal} online={online} canAdmin={permissions.includes('seal.admin')}
          now={now} onChanged={reload} />
      </Section>

      <Section title="Comandos recentes">
        {seal.commands.length === 0 ? <p className="m-0 text-corpo text-grafite">Nenhum comando ainda.</p> : (
          <ul aria-label="Comandos recentes" className="m-0 flex list-none flex-col gap-2 p-0">
            {seal.commands.map((command) => (
              <li key={command.id} className="flex flex-wrap items-center gap-2 text-corpo text-grafite">
                <span className="font-semibold">{COMMAND_KIND_LABELS[command.kind]}{command.wifiSsid ? ` (${command.wifiSsid})` : ''}</span>
                <SealBadge presentation={commandStatus(command.status)} />
                <span className="text-legenda text-texto-secundario">{commandOrigin(command.origin)} · {positionAge(command.createdAt, now())}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Alertas recentes">
        {seal.alerts.length === 0 ? <p className="m-0 text-corpo text-grafite">Nenhum alerta.</p> : (
          <ul aria-label="Alertas recentes" className="m-0 flex list-none flex-col gap-2 p-0">
            {seal.alerts.map((alert) => (
              <li key={alert.id} className="flex flex-wrap items-center gap-2">
                <a className="text-corpo font-semibold text-azul-profundo underline" href={`/alertas/${alert.id}`}>{alertKind(alert.kind).label}</a>
                <SealBadge presentation={alertSeverity(alert.severity)} />
                <span className="text-legenda text-texto-secundario">{positionAge(alert.openedAt, now())}{alert.recoveredAt ? ' · voltou a comunicar' : ''}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {pending?.kind === 'return' && (
        <ReturnDeviceDialog deviceCode={seal.deviceCode} busy={busy} error={error} returnFocusTo={pending.trigger} onCancel={() => setPending(null)}
          onConfirm={(text) => void confirm(text)} />
      )}
      {pending?.kind === 'unbind' && (
        <ReasonDialog
          title="Desvincular o lacre"
          confirmLabel="Desvincular o lacre"
          description="As mensagens seguintes deste lacre deixam de valer para o cilindro."
          busy={busy} error={error} returnFocusTo={pending.trigger} onCancel={() => setPending(null)} onConfirm={(text) => void confirm(text)}
        />
      )}
    </article>
  );
}

export function SealDetailPage({ deviceId }: { deviceId: string }): React.JSX.Element {
  const { service, geocoder, realtime, organizationId, online } = useSealService();
  const { permissions } = usePermissions();
  return (
    <AccessGate permission="seal.read">
      <SealDetailView key={`${organizationId}:${deviceId}`} service={service} organizationId={organizationId} deviceId={deviceId} online={online}
        realtime={realtime} permissions={permissions?.tenant ?? []} geocoder={geocoder} />
    </AccessGate>
  );
}
