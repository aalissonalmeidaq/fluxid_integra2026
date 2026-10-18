import React from 'react';
import type { SealViolationInfo, SealWatchInfo } from '@/application/seals/seal-views';
import { Icon } from '@/design-system';
import { positionAge } from '@/domain/seals/seal-age';
import { alertKind } from '@/domain/seals/seal-vocabulary';
import { SealBadge } from '@/pages/seals/components/seal-badge';

// Vigilância da geocerca do cliente e violação no bloco "Lacre" (Spec 012, RF-020, RF-022; História 4). O retorno à área não destrava o
// lacre nem encerra o alerta: destravar depois de uma violação é sempre manual, com justificativa e segundo fator (RN-005).
export function CylinderWatchPanel({ watch, violation, now }: { watch: SealWatchInfo | null; violation: SealViolationInfo | null; now: () => Date }): React.JSX.Element | null {
  if (!watch && !violation) return null;
  return (
    <div className="flex flex-col gap-2 rounded-controle border border-borda-suave p-4">
      {watch && (
        <p className="m-0 flex items-start gap-2 text-corpo text-grafite">
          <span className="mt-1 text-azul-profundo"><Icon name="geocerca" size={16} /></span>
          <span>
            {watch.suspended
              ? 'Vigilância suspensa: a unidade ficou sem geocerca ativa.'
              : `Sob vigilância da geocerca de ${watch.siteName}, desde ${positionAge(watch.startedAt, now())}.`}
          </span>
        </p>
      )}
      {violation && violation.status !== 'closed' && (
        <div className="flex flex-col gap-1">
          <SealBadge presentation={alertKind('geofence_violation')} />
          {violation.status === 'open' ? (
            <p className="m-0 text-corpo text-grafite">
              {violation.distanceM === null ? 'Fora da geocerca' : `${Math.round(violation.distanceM)} m fora da geocerca`}, {positionAge(violation.firstOutsideAt, now())}.
            </p>
          ) : (
            <p className="m-0 text-corpo text-grafite">
              Retornou à área {positionAge(violation.returnedAt, now())}. O lacre não destrava sozinho: o alerta continua aberto até ser encerrado.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
