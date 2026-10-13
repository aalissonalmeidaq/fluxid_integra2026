import React, { useState } from 'react';
import { Button } from '@/design-system';
import { EMPTY_POSITION_DRAFT, isDraftStale, validateArrivalPosition, type ArrivalPositionErrors, type PositionDraft, type PositionPayload } from '@/domain/field/position-draft';
import type { GeolocationReader } from '@/infrastructure/field/geolocation-reader';
import { PositionField } from '@/pages/field/position-field';
import { usePositionReader } from '@/pages/field/use-position-reader';

export interface ArrivePositionActionProps {
  position: number | null;
  siteName: string;
  online: boolean;
  busy: boolean;
  loading: boolean;
  onArrive: (position: PositionPayload) => void;
  // Trocáveis nos testes: o leitor de posição e o relógio.
  geolocation?: GeolocationReader;
  now?: () => number;
}

// Chegada com a posição (Spec 009, RF-009 a RF-014): lida pelo aparelho, uma vez por toque, ou digitada. É um caminho à parte da chegada sem
// posição (que continua igual): a posição é opcional. Na chegada não existe "no endereço da unidade". Leitura do GPS com mais de 2 minutos é
// descartada e lida de novo antes de registrar; se isso falha, nada é registrado. Nada fica no aparelho: a posição vive só neste estado.
export function ArrivePositionAction({ position, siteName, online, busy, loading, onArrive, geolocation, now }: ArrivePositionActionProps): React.JSX.Element {
  const label = `parada ${position ?? ''} (${siteName})`;
  const reader = usePositionReader(geolocation, now);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<PositionDraft>(EMPTY_POSITION_DRAFT);
  const [errors, setErrors] = useState<ArrivalPositionErrors>({});
  const [refreshing, setRefreshing] = useState(false);

  const register = async (): Promise<void> => {
    if (loading || refreshing) return;
    let current = draft;
    if (isDraftStale(draft, (now ?? Date.now)())) {
      setRefreshing(true);
      const fresh = await reader.refreshIfStale(draft);
      setRefreshing(false);
      if (!fresh) { setErrors({ position: 'Não foi possível atualizar a posição. Leia de novo ou digite as coordenadas.' }); return; }
      current = fresh;
      setDraft(fresh);
    }
    const result = validateArrivalPosition(current);
    if (!result.ok) { setErrors(result.errors); return; }
    setErrors({});
    onArrive(result.payload);
  };

  return (
    <div className="flex flex-col gap-4">
      <Button variant="secundario" className="self-start" disabled={!online || busy} aria-expanded={open} aria-label={`Chegada com a posição da ${label}`} onClick={() => setOpen((value) => !value)}>
        Chegada com a posição
      </Button>
      {open && (
        <div role="group" aria-label={`Posição da chegada à ${label}`} className="flex flex-col gap-4 rounded-controle border border-borda-suave p-4">
          <PositionField draft={draft} onChange={(next) => { setDraft(next); setErrors({}); }} position={reader} allowSiteAddress={false} errors={errors} disabled={loading} />
          <Button className="self-start" disabled={!online || busy} loading={loading || refreshing} loadingLabel="Registrando…" onClick={() => void register()}>
            Registrar chegada com a posição
          </Button>
        </div>
      )}
    </div>
  );
}
