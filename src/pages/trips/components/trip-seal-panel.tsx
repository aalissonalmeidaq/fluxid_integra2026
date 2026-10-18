import React, { useCallback, useEffect, useId, useState } from 'react';
import { watchSeals, type RealtimePort } from '@/application/seals/seal-realtime';
import type { SealService } from '@/application/seals/seal-service';
import type { TripSealRow } from '@/application/seals/seal-views';
import { ErrorState, Loading } from '@/design-system';
import { contactAge } from '@/domain/seals/seal-age';
import { commandStatus, health, lockState } from '@/domain/seals/seal-vocabulary';
import { SealBadge } from '@/pages/seals/components/seal-badge';
import { DeliveryUnlockNotice } from './delivery-unlock-notice';

// Trava física dos cilindros da viagem (Spec 012, RF-030; História 2): ao lado do bloqueio lógico da Spec 008, o estado real da trava de
// cada lacre, com o comando em curso. Só a confirmação do lacre muda a trava (RN-001). Atualiza sozinha e anuncia sem mover o foco.

type Load = { kind: 'loading' } | { kind: 'ready'; rows: TripSealRow[] } | { kind: 'error' };

export interface TripSealPanelProps {
  service: SealService | null;
  organizationId: string;
  tripId: string;
  online: boolean;
  realtime: RealtimePort | null;
  now?: () => Date;
}

export function TripSealPanel({ service, organizationId, tripId, online, realtime, now = () => new Date() }: TripSealPanelProps): React.JSX.Element {
  const titleId = useId();
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const [announcement, setAnnouncement] = useState('');

  const request = useCallback(() => (service && organizationId ? service.tripSeals(organizationId, tripId) : Promise.resolve(null)), [service, organizationId, tripId]);
  const apply = useCallback((outcome: Awaited<ReturnType<typeof request>>, announce: boolean) => {
    if (outcome === null) return;
    if (outcome.kind === 'success') {
      setLoad({ kind: 'ready', rows: outcome.value });
      if (announce) setAnnouncement('Trava física atualizada.');
    } else setLoad((current) => (current.kind === 'ready' && announce ? current : { kind: 'error' }));
  }, []);

  useEffect(() => {
    if (!online) return undefined;
    let active = true;
    void request().then((outcome) => { if (active) apply(outcome, false); });
    return () => { active = false; };
  }, [online, request, apply]);

  useEffect(() => {
    if (!online || !service || !realtime || !organizationId) return undefined;
    const watch = watchSeals({ port: realtime, organizationId, onChange: () => { void request().then((outcome) => apply(outcome, true)); } });
    return () => watch.stop();
  }, [online, service, realtime, organizationId, request, apply]);

  const view: Load | { kind: 'offline' } = !online && load.kind !== 'ready' ? { kind: 'offline' } : load;
  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-4 rounded-card border border-borda-suave bg-branco p-4">
      <h3 id={titleId} className="m-0 text-h3 font-semibold text-navy">Trava física dos cilindros</h3>
      <p role="status" aria-atomic="true" className="sr-only">{announcement}</p>
      {view.kind === 'loading' && <Loading label="Carregando a trava dos lacres…" />}
      {view.kind === 'offline' && <p className="m-0 text-corpo text-grafite">Sem conexão: a trava dos lacres aparece quando a conexão voltar.</p>}
      {view.kind === 'error' && <ErrorState title="Não foi possível carregar a trava dos lacres" message="Tente novamente em instantes." onRetry={() => { setLoad({ kind: 'loading' }); void request().then((o) => apply(o, false)); }} />}
      {view.kind === 'ready' && (
        <ul aria-label="Trava física dos cilindros" className="m-0 flex list-none flex-col gap-2 p-0">
          {view.rows.map((row) => {
            const pending = row.seal?.pendingCommand ?? null;
            return (
              <li key={row.itemId} className="flex min-w-0 flex-col gap-2 rounded-controle border border-borda-suave p-2 tablet:flex-row tablet:items-center tablet:justify-between">
                <a className="text-corpo font-semibold text-azul-profundo underline" href={`/cilindros/${row.cylinderId}`}>{row.serialNumber}</a>
                {row.seal ? (
                  <span className="flex flex-wrap items-center gap-2">
                    <SealBadge presentation={lockState(row.seal.lockState, pending?.kind ?? null)} />
                    {pending && <span className="text-legenda text-texto-secundario">{commandStatus(pending.status).label}</span>}
                    <SealBadge presentation={health(row.seal.health)} />
                    <span className="text-legenda text-texto-secundario">Contato {contactAge(row.seal.lastSeenAt, now())}</span>
                  </span>
                ) : (
                  <span className="text-corpo text-texto-secundario">Sem lacre (só o bloqueio lógico)</span>
                )}
                {row.seal && row.unlockNote && <DeliveryUnlockNotice note={row.unlockNote} cylinderId={row.cylinderId} />}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
