import React, { useEffect, useId, useState } from 'react';
import type { SealService } from '@/application/seals/seal-service';
import type { PositionRow } from '@/application/seals/seal-views';
import { Button, Loading } from '@/design-system';
import { positionAge } from '@/domain/seals/seal-age';
import { sealPositionQuality } from '@/domain/seals/seal-position-format';

interface SealPositionHistoryProps {
  service: SealService;
  organizationId: string;
  target: { cylinderId: string } | { deviceId: string };
  now: () => Date;
}

// Alternativa textual ao mapa, carregada sob demanda. O mesmo componente atende o detalhe do cilindro e o do lacre para que coordenadas,
// qualidade e repetições persistidas pelo Supabase tenham uma única apresentação acessível.
export function SealPositionHistory({ service, organizationId, target, now }: SealPositionHistoryProps): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<PositionRow[] | 'loading' | 'error'>('loading');
  const listId = useId();
  const cylinderId = 'cylinderId' in target ? target.cylinderId : null;
  const deviceId = 'deviceId' in target ? target.deviceId : null;

  useEffect(() => {
    if (!open) return undefined;
    let active = true;
    const positionTarget = cylinderId !== null ? { cylinderId } : { deviceId: deviceId as string };
    void service.listPositions(organizationId, positionTarget, 20).then((outcome) => {
      if (active) setRows(outcome.kind === 'success' ? outcome.value : 'error');
    });
    return () => { active = false; };
  }, [open, service, organizationId, cylinderId, deviceId]);

  return (
    <div className="flex flex-col gap-2">
      <Button variant="secundario" className="self-start" aria-expanded={open} aria-controls={listId} onClick={() => setOpen((value) => !value)}>
        {open ? 'Ocultar as posições em texto' : 'Ver as posições em texto'}
      </Button>
      <div id={listId} hidden={!open}>
        {open && rows === 'loading' && <Loading label="Carregando as posições…" />}
        {open && rows === 'error' && <p className="text-corpo text-grafite">Não foi possível carregar as posições agora.</p>}
        {open && Array.isArray(rows) && (rows.length === 0
          ? <p className="text-corpo text-grafite">Nenhuma posição registrada.</p>
          : (
            <ol className="m-0 flex list-none flex-col gap-2 p-0">
              {rows.map((row) => (
                <li key={`${row.readAt}-${row.latitude}`} className="rounded-controle border border-borda-suave p-2 text-corpo text-grafite">
                  <span className="font-semibold">{positionAge(row.readAt, now())}</span>
                  {' · '}{row.latitude}, {row.longitude}{' · '}{sealPositionQuality(row.quality, row.accuracyM)}
                  {row.lastSeenAt !== row.readAt && <span className="text-texto-secundario">{` · confirmada ${positionAge(row.lastSeenAt, now())}`}</span>}
                </li>
              ))}
            </ol>
          ))}
      </div>
    </div>
  );
}
