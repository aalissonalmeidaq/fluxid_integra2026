import React from 'react';
import type { CustodySiteView } from '@/application/cylinders/cylinder-views';
import type { CustodyStatus } from '@/domain/trips/trip-vocabulary';
import { CustodyBadge } from '@/pages/trips/components/trip-badges';

// Custódia do cilindro (Spec 008, RF-024): em que lugar ele está agora. "No cliente" diz também a unidade, que leva ao cadastro.
export function CustodyInfo({ status, site }: { status: CustodyStatus; site: CustodySiteView | null }): React.JSX.Element {
  return (
    <span className="flex flex-col items-start gap-1">
      <CustodyBadge status={status} />
      {status === 'at_customer' && site && (
        <a className="text-corpo text-azul-profundo underline" href={`/clientes/${site.customerId}/unidades/${site.id}`}>{site.name}</a>
      )}
    </span>
  );
}
