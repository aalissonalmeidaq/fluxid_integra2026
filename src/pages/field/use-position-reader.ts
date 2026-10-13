import { useCallback, useMemo, useState } from 'react';
import { applyReading, isDraftStale, type PositionDraft } from '@/domain/field/position-draft';
import type { PositionReading } from '@/domain/field/position-quality';
import { createGeolocationReader, type GeolocationReader } from '@/infrastructure/field/geolocation-reader';
import { ReaderError } from '@/infrastructure/field/reader-error';

// Leitura da posição de uma tela (Spec 009, RF-009, RF-011, RF-012, RN-004): UMA leitura por pedido, nunca contínua, e nada guardado no
// aparelho. Leitura velha (acima de 2 minutos) é descartada e refeita antes de salvar. A falha vira estado, para a tela explicar em texto.
export type PositionReadStatus = 'idle' | 'reading' | 'denied' | 'unavailable' | 'timeout';

export interface PositionReaderState {
  supported: boolean;
  status: PositionReadStatus;
  read: () => Promise<PositionReading | null>;
  // Devolve o rascunho como está, ou com uma leitura nova se a do GPS ficou velha; `null` quando a nova leitura falha.
  refreshIfStale: (draft: PositionDraft) => Promise<PositionDraft | null>;
  clearStatus: () => void;
}

// O relógio é injetável para os testes de leitura velha.
export function usePositionReader(reader?: GeolocationReader, now: () => number = Date.now): PositionReaderState {
  const source = useMemo(() => reader ?? createGeolocationReader(), [reader]);
  const [status, setStatus] = useState<PositionReadStatus>('idle');

  const read = useCallback(async (): Promise<PositionReading | null> => {
    setStatus('reading');
    try {
      const reading = await source.read();
      setStatus('idle');
      return reading;
    } catch (cause) {
      const kind = cause instanceof ReaderError ? cause.kind : 'unavailable';
      setStatus(kind === 'denied' ? 'denied' : kind === 'timeout' ? 'timeout' : 'unavailable');
      return null;
    }
  }, [source]);

  const refreshIfStale = useCallback(async (draft: PositionDraft): Promise<PositionDraft | null> => {
    if (!isDraftStale(draft, now())) return draft;
    const reading = await read();
    return reading ? applyReading(draft, reading) : null;
  }, [read, now]);

  const clearStatus = useCallback((): void => setStatus('idle'), []);
  return useMemo(() => ({ supported: source.isSupported(), status, read, refreshIfStale, clearStatus }), [source, status, read, refreshIfStale, clearStatus]);
}
